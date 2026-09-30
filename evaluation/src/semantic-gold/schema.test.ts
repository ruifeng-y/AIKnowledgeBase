import { describe, expect, it } from 'vitest';
import {
  computeCorpusHash,
  computeDatasetContentHash,
  isHumanCuratedGold,
  normalizeCategories,
  stableCaseId,
  validateSemanticGoldDataset,
  type SemanticGoldCase,
  type SemanticGoldDataset,
} from './schema';
import { generateDraftCandidates } from './candidate';
import { buildCorpusSnapshot } from '../corpus/snapshot';
import { LexicalGroundednessEvaluator } from '../groundedness/evaluator';
import { computeEvaluationFingerprint } from '../report/fingerprint';
import { REQUIRED_GOLD_CATEGORIES } from './schema';

const corpus = buildCorpusSnapshot('corpus-test-v1', [
  {
    chunkId: 'c1',
    documentId: 'd1',
    documentVersionId: 'v1',
    chunkIndex: 0,
    content: 'Retry policy uses maxRetries=3 and timeout 30 seconds for provider calls.',
  },
  {
    chunkId: 'c2',
    documentId: 'd1',
    documentVersionId: 'v1',
    chunkIndex: 1,
    content: 'Release date is 2026-10-01 and SLA is 90% availability.',
  },
]);

function draftCase(overrides: Partial<SemanticGoldCase> = {}): SemanticGoldCase {
  return {
    id: 'semantic-0001',
    datasetVersion: '0.1.0',
    corpusVersion: 'corpus-test-v1',
    query: 'What is the retry policy?',
    category: ['technical_term'],
    primaryCategory: 'technical_term',
    answerability: 'answerable',
    expectedRelevantChunks: [
      {
        chunkId: 'c1',
        documentId: 'd1',
        documentVersionId: 'v1',
        chunkIndex: 0,
        contentHash: corpus.chunks[0]!.contentHash,
        relevanceGrade: 3,
      },
    ],
    relevanceGrades: { c1: 3 },
    referenceAnswer: 'maxRetries=3 and timeout 30 seconds',
    expectedCitationSources: ['c1'],
    annotationStatus: 'DRAFT',
    provenance: 'machine_generated',
    ...overrides,
  };
}

describe('semantic gold schema', () => {
  it('stable case ids', () => {
    expect(stableCaseId(1)).toBe('semantic-0001');
    expect(stableCaseId(12)).toBe('semantic-0012');
  });

  it('content hash changes when a case changes', () => {
    const a: Omit<SemanticGoldDataset, 'contentHash'> = {
      datasetId: 'semantic-gold',
      datasetVersion: '0.1.0',
      corpusVersion: 'corpus-test-v1',
      createdAt: '2026-01-01T00:00:00.000Z',
      description: 'x',
      annotationStatus: 'DRAFT',
      cases: [draftCase()],
    };
    const h1 = computeDatasetContentHash(a);
    const h2 = computeDatasetContentHash({
      ...a,
      cases: [draftCase({ query: 'changed' })],
    });
    expect(h1).not.toBe(h2);
    expect(computeDatasetContentHash(a)).toBe(h1);
  });

  it('separates case count from category assignment count', () => {
    const dataset: SemanticGoldDataset = {
      datasetId: 'semantic-gold',
      datasetVersion: '0.1.0',
      corpusVersion: 'corpus-test-v1',
      createdAt: '2026-01-01T00:00:00.000Z',
      description: 'x',
      contentHash: '',
      annotationStatus: 'DRAFT',
      cases: [
        draftCase({
          category: ['numeric', 'exact_keyword'],
          primaryCategory: 'numeric',
        }),
        draftCase({
          id: 'semantic-0002',
          query: 'second unique query about timeout',
          category: ['technical_term'],
          primaryCategory: 'technical_term',
        }),
      ],
    };
    const report = validateSemanticGoldDataset(dataset, corpus);
    expect(report.distribution.caseCount).toBe(2);
    expect(report.distribution.categoryAssignmentCount).toBe(3);
    expect(report.distribution.byPrimaryCategory.numeric).toBe(1);
    expect(report.distribution.byCategoryAssignment.numeric).toBe(1);
    expect(report.distribution.byCategoryAssignment.exact_keyword).toBe(1);
    expect(report.distribution.byCategoryAssignment.technical_term).toBe(1);
  });

  it('maps legacy category aliases to contract names', () => {
    expect(normalizeCategories(['numeric_fact', 'identifier_exact_match', 'date_fact'])).toEqual([
      'numeric',
      'identifier',
      'date',
    ]);
  });

  it('rejects machine_generated marked as GOLD', () => {
    const dataset: SemanticGoldDataset = {
      datasetId: 'semantic-gold',
      datasetVersion: '0.1.0',
      corpusVersion: 'corpus-test-v1',
      createdAt: '2026-01-01T00:00:00.000Z',
      description: 'x',
      contentHash: '',
      annotationStatus: 'DRAFT',
      cases: [draftCase({ annotationStatus: 'GOLD' })],
    };
    const report = validateSemanticGoldDataset(dataset, corpus);
    expect(report.ok).toBe(false);
    expect(report.issues.some((i) => i.code === 'SYNTHETIC_GOLD_MARKED_AS_HUMAN')).toBe(true);
  });

  it('detects broken chunk refs and grade/citation conflicts', () => {
    const dataset: SemanticGoldDataset = {
      datasetId: 'semantic-gold',
      datasetVersion: '0.1.0',
      corpusVersion: 'corpus-test-v1',
      createdAt: '2026-01-01T00:00:00.000Z',
      description: 'x',
      contentHash: '',
      annotationStatus: 'DRAFT',
      cases: [
        draftCase({
          expectedRelevantChunks: [
            {
              chunkId: 'missing',
              documentId: 'd1',
              documentVersionId: 'v1',
              chunkIndex: 9,
              contentHash: 'x',
              relevanceGrade: 3,
            },
          ],
          relevanceGrades: {},
          expectedCitationSources: ['missing'],
        }),
      ],
    };
    const report = validateSemanticGoldDataset(dataset, corpus);
    expect(report.issues.some((i) => i.code === 'BROKEN_CHUNK_REF')).toBe(true);
  });

  it('candidate generator emits DRAFT machine_generated only', () => {
    const drafts = generateDraftCandidates(corpus, {
      datasetVersion: '0.1.0',
      corpusVersion: 'corpus-test-v1',
      maxCases: 2,
    });
    expect(drafts.length).toBeGreaterThan(0);
    for (const d of drafts) {
      expect(d.annotationStatus).toBe('DRAFT');
      expect(d.provenance).toBe('machine_generated');
      expect(isHumanCuratedGold(d)).toBe(false);
    }
  });

  it('readiness requires 50 human gold cases and category coverage', () => {
    const cases: SemanticGoldCase[] = Array.from({ length: 50 }, (_, i) => {
      const cat = REQUIRED_GOLD_CATEGORIES[i % REQUIRED_GOLD_CATEGORIES.length]!;
      return draftCase({
        id: stableCaseId(i + 1),
        query: `unique query ${i + 1} about ${cat} retry policy`,
        category: [cat],
        primaryCategory: cat,
        annotationStatus: 'GOLD',
        provenance: 'human',
      });
    });
    const dataset: SemanticGoldDataset = {
      datasetId: 'semantic-gold',
      datasetVersion: '1.0.0',
      corpusVersion: 'corpus-test-v1',
      createdAt: '2026-01-01T00:00:00.000Z',
      description: 'x',
      contentHash: computeDatasetContentHash({
        datasetId: 'semantic-gold',
        datasetVersion: '1.0.0',
        corpusVersion: 'corpus-test-v1',
        createdAt: '2026-01-01T00:00:00.000Z',
        description: 'x',
        annotationStatus: 'GOLD',
        cases,
      }),
      annotationStatus: 'GOLD',
      cases,
    };
    const report = validateSemanticGoldDataset(dataset, corpus);
    expect(report.humanCuratedGoldCount).toBe(50);
    expect(report.readiness).toBe('READY');
  });
});

describe('corpus snapshot', () => {
  it('hash changes when chunk content changes', () => {
    const a = buildCorpusSnapshot('c-v1', [
      { chunkId: 'c1', documentId: 'd1', documentVersionId: 'v1', chunkIndex: 0, content: 'hello' },
    ]);
    const b = buildCorpusSnapshot('c-v1', [
      { chunkId: 'c1', documentId: 'd1', documentVersionId: 'v1', chunkIndex: 0, content: 'hello!' },
    ]);
    expect(a.corpusHash).not.toBe(b.corpusHash);
    expect(computeCorpusHash(a.chunks)).toBe(a.corpusHash);
  });
});

describe('groundedness evaluator', () => {
  const ev = new LexicalGroundednessEvaluator();

  it('grounded when answer overlaps context', async () => {
    const r = await ev.evaluate({
      query: 'retry?',
      answer: 'maxRetries=3 and timeout 30 seconds',
      citations: ['C1'],
      contextTexts: ['Retry policy uses maxRetries=3 and timeout 30 seconds for provider calls.'],
      contextChunkIds: ['c1'],
    });
    expect(r.status).toBe('grounded');
  });

  it('ungrounded when answer invents facts', async () => {
    const r = await ev.evaluate({
      query: 'retry?',
      answer: 'The company was founded in 1842 by aliens from Mars using quantum steam.',
      citations: [],
      contextTexts: ['Retry policy uses maxRetries=3.'],
      contextChunkIds: ['c1'],
    });
    expect(r.status).toBe('ungrounded');
  });

  it('does not receive gold labels (interface only query/answer/context)', async () => {
    const r = await ev.evaluate({
      query: 'q',
      answer: 'abstain: 无法确认这个信息',
      citations: [],
      contextTexts: [],
      contextChunkIds: [],
    });
    expect(r.status).toBe('grounded');
  });
});

describe('evaluation fingerprint', () => {
  it('is stable for same inputs and changes with config', () => {
    const base = {
      datasetHash: 'd1',
      corpusHash: 'c1',
      providerSnapshot: { embedding: { provider: 'openai-compatible', model: 'emb', dimensions: 384 } },
      configFingerprint: 'cfg_1',
      retrievalConfig: { topK: 10 },
      contextConfig: { contextTopK: 8 },
      generationConfig: { temperature: 0 },
      evaluatorConfig: { evaluatorName: 'lexical-overlap' },
    };
    const a = computeEvaluationFingerprint(base);
    const b = computeEvaluationFingerprint(base);
    expect(a).toBe(b);
    expect(computeEvaluationFingerprint({ ...base, configFingerprint: 'cfg_2' })).not.toBe(a);
    expect(computeEvaluationFingerprint({ ...base, generationConfig: { temperature: 0.2 } })).not.toBe(a);
  });
});
