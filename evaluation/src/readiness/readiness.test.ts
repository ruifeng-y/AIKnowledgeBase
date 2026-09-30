import { describe, expect, it } from 'vitest';
import {
  assessGoldReadiness,
  assessProviderReadiness,
  buildCombinedReadiness,
} from './readiness';
import { classifyProviderReadiness } from './provider-readiness';
import {
  computeDatasetContentHash,
  type SemanticGoldDataset,
} from '../semantic-gold/schema';
import { buildCorpusSnapshot } from '../corpus/snapshot';

const corpus = buildCorpusSnapshot('corpus-test-v1', [
  {
    chunkId: 'c1',
    documentId: 'd1',
    documentVersionId: 'v1',
    chunkIndex: 0,
    content: 'Retry policy uses maxRetries=3.',
  },
]);

describe('gold readiness', () => {
  it('blocks when human gold < 50', () => {
    const dataset: SemanticGoldDataset = {
      datasetId: 'semantic-gold',
      datasetVersion: '0.1.0',
      corpusVersion: 'corpus-test-v1',
      createdAt: '2026-01-01T00:00:00.000Z',
      description: 'x',
      contentHash: '',
      annotationStatus: 'DRAFT',
      cases: [
        {
          id: 'semantic-0001',
          datasetVersion: '0.1.0',
          corpusVersion: 'corpus-test-v1',
          query: 'draft query',
          category: ['exact_keyword'],
          primaryCategory: 'exact_keyword',
          answerability: 'answerable',
          expectedRelevantChunks: [],
          relevanceGrades: {},
          referenceAnswer: 'a',
          expectedCitationSources: [],
          annotationStatus: 'DRAFT',
          provenance: 'machine_generated',
        },
      ],
    };
    const gold = assessGoldReadiness(dataset, corpus);
    expect(gold.status).toBe('SEMANTIC_BENCHMARK_NOT_READY');
    expect(gold.humanCurated).toBe(0);
  });

  it('does not count machine drafts as human gold', () => {
    const drafts = Array.from({ length: 50 }, (_, i) => ({
      id: `semantic-${String(i + 1).padStart(4, '0')}`,
      datasetVersion: '0.1.0',
      corpusVersion: 'corpus-test-v1',
      query: `draft ${i + 1} unique query about retry`,
      category: ['exact_keyword'],
      primaryCategory: 'exact_keyword',
      answerability: 'answerable' as const,
      expectedRelevantChunks: [],
      relevanceGrades: {},
      referenceAnswer: 'x',
      expectedCitationSources: [],
      annotationStatus: 'DRAFT' as const,
      provenance: 'machine_generated' as const,
    }));
    const dataset: SemanticGoldDataset = {
      datasetId: 'semantic-gold',
      datasetVersion: '0.1.0',
      corpusVersion: 'corpus-test-v1',
      createdAt: '2026-01-01T00:00:00.000Z',
      description: 'x',
      contentHash: computeDatasetContentHash({
        datasetId: 'semantic-gold',
        datasetVersion: '0.1.0',
        corpusVersion: 'corpus-test-v1',
        createdAt: '2026-01-01T00:00:00.000Z',
        description: 'x',
        annotationStatus: 'DRAFT',
        cases: drafts,
      }),
      annotationStatus: 'DRAFT',
      cases: drafts,
    };
    const gold = assessGoldReadiness(dataset, corpus);
    expect(gold.humanCurated).toBe(0);
    expect(gold.totalCases).toBe(50);
    expect(gold.status).toBe('SEMANTIC_BENCHMARK_NOT_READY');
  });
});

describe('provider readiness', () => {
  it('mock is never real-ready', () => {
    const report = classifyProviderReadiness({
      EMBEDDING_PROVIDER: 'mock',
      RERANKER_PROVIDER: 'mock',
      LLM_PROVIDER: 'mock',
    });
    expect(report.allReady).toBe(false);
    expect(report.embedding.state).toBe('UNAVAILABLE');
    expect(report.embedding.reason).toContain('mock');
  });

  it('missing credentials → UNAVAILABLE not READY', () => {
    const report = classifyProviderReadiness({
      EMBEDDING_PROVIDER: 'openai-compatible',
      EMBEDDING_ENDPOINT: 'https://x.test/v1',
      RERANKER_PROVIDER: 'mock',
      LLM_PROVIDER: 'mock',
    });
    expect(report.embedding.state).toBe('UNAVAILABLE');
    expect(report.allReady).toBe(false);
  });

  it('health+smoke PASS required for READY', () => {
    const report = classifyProviderReadiness(
      {
        EMBEDDING_PROVIDER: 'openai-compatible',
        EMBEDDING_ENDPOINT: 'https://x.test/v1',
        EMBEDDING_API_KEY: 'k',
        RERANKER_PROVIDER: 'http',
        RERANKER_ENDPOINT: 'https://x.test/rerank',
        RERANKER_API_KEY: 'k',
        LLM_PROVIDER: 'openai-compatible',
        LLM_ENDPOINT: 'https://x.test/v1',
        LLM_API_KEY: 'k',
      },
      {
        embedding: { health: 'healthy', smoke: 'PASS' },
        reranker: { health: 'healthy', smoke: 'PASS' },
        llm: { health: 'healthy', smoke: 'PASS' },
      },
    );
    expect(report.allReady).toBe(true);
    expect(report.embedding.state).toBe('READY');
    expect(report.providerSnapshot.embedding?.provider).toBe('openai-compatible');
  });

  it('combined gate requires both gold and provider', () => {
    const gold = {
      status: 'SEMANTIC_BENCHMARK_NOT_READY' as const,
      totalCases: 0,
      humanCurated: 0,
      draft: 0,
      invalid: 0,
      requiredCategoriesCovered: false,
      missingCategories: ['numeric'],
      datasetVersion: '0.1.0',
      datasetHash: 'h',
      corpusVersion: 'c',
      corpusHash: 'ch',
      validation: {} as never,
    };
    const provider = assessProviderReadiness(
      [
        {
          capability: 'embedding',
          state: 'UNAVAILABLE',
          provider: 'mock',
          model: 'm',
          reason: 'mock',
        },
      ],
      'cfg',
    );
    const combined = buildCombinedReadiness(gold, provider);
    expect(combined.GOLD_READY).toBe(false);
    expect(combined.REAL_PROVIDER_READY).toBe(false);
    expect(combined.REAL_BENCHMARK_READY).toBe(false);
    expect(combined.blockingReasons.length).toBeGreaterThan(0);
    expect(combined.readinessFingerprint.startsWith('eval_')).toBe(true);
  });
});
