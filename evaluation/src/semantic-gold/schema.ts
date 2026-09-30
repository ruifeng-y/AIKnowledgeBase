/**
 * Semantic Gold dataset extensions (V0.5-C).
 * Human Gold ≠ machine-generated draft. GOLD requires human confirmation.
 */

import { createHash } from 'node:crypto';
import type { EvaluationCase, RelevanceGrade } from '../types';
import { EVALUATION_CATEGORIES, RELEVANT_GRADE_THRESHOLD } from '../types';

export type AnnotationStatus = 'DRAFT' | 'REVIEWED' | 'GOLD' | 'INVALID';

export type GoldProvenance = 'human' | 'machine_generated' | 'machine_assisted';

export type Answerability = 'answerable' | 'unanswerable';

export interface SemanticGoldChunkRef {
  chunkId: string;
  documentId: string;
  documentVersionId: string;
  chunkIndex: number;
  contentHash: string;
  relevanceGrade: RelevanceGrade;
}

export interface SemanticGoldCase {
  id: string;
  datasetVersion: string;
  corpusVersion: string;
  query: string;
  category: string[];
  answerability: Answerability;
  expectedRelevantChunks: SemanticGoldChunkRef[];
  relevanceGrades: Record<string, RelevanceGrade>;
  referenceAnswer: string | null;
  expectedCitationSources: string[];
  annotationStatus: AnnotationStatus;
  provenance: GoldProvenance;
  annotationNotes?: string;
  annotationTimestamp?: string;
  /** optional bridge into V0.4-N EvaluationCase */
  legacy?: EvaluationCase;
}

export interface SemanticGoldDataset {
  datasetId: string;
  datasetVersion: string;
  corpusVersion: string;
  createdAt: string;
  description: string;
  contentHash: string;
  annotationStatus: AnnotationStatus;
  cases: SemanticGoldCase[];
}

export interface CorpusSnapshotMeta {
  corpusVersion: string;
  corpusHash: string;
  createdAt: string;
  documentCount: number;
  sectionCount: number;
  chunkCount: number;
  chunks: Array<{
    chunkId: string;
    documentId: string;
    documentVersionId: string;
    sectionId?: string;
    chunkIndex: number;
    content: string;
    contentHash: string;
  }>;
}

export interface GoldValidationIssue {
  level: 'ERROR' | 'WARNING';
  code: string;
  caseId?: string;
  message: string;
}

export interface GoldValidationReport {
  ok: boolean;
  datasetId: string;
  datasetVersion: string;
  contentHash: string;
  totalCases: number;
  humanCuratedGoldCount: number;
  draftCount: number;
  reviewedCount: number;
  invalidCount: number;
  machineGeneratedCount: number;
  issues: GoldValidationIssue[];
  distribution: {
    byCategory: Record<string, number>;
    byAnswerability: Record<string, number>;
    byAnnotationStatus: Record<string, number>;
  };
  readiness: 'READY' | 'SEMANTIC_BENCHMARK_NOT_READY';
}

export const GOLD_MIN_HUMAN_CURATED = 50;
export const REQUIRED_GOLD_CATEGORIES = [
  'exact_keyword',
  'semantic_paraphrase',
  'identifier_exact_match',
  'technical_term',
  'multi_keyword',
  'numeric_fact',
  'date_fact',
  'negative_query',
  'version_specific',
  'cross_section',
  'no_answer',
  'prompt_injection',
] as const;

export function stableCaseId(index: number): string {
  return `semantic-${String(index).padStart(4, '0')}`;
}

export function computeDatasetContentHash(dataset: Omit<SemanticGoldDataset, 'contentHash'>): string {
  const canonical = JSON.stringify({
    datasetId: dataset.datasetId,
    datasetVersion: dataset.datasetVersion,
    corpusVersion: dataset.corpusVersion,
    cases: dataset.cases.map((c) => ({
      id: c.id,
      query: c.query,
      category: c.category,
      answerability: c.answerability,
      expectedRelevantChunks: c.expectedRelevantChunks,
      relevanceGrades: c.relevanceGrades,
      referenceAnswer: c.referenceAnswer,
      expectedCitationSources: c.expectedCitationSources,
      annotationStatus: c.annotationStatus,
      provenance: c.provenance,
    })),
  });
  return createHash('sha256').update(canonical, 'utf8').digest('hex').slice(0, 32);
}

export function computeCorpusHash(chunks: CorpusSnapshotMeta['chunks']): string {
  const canonical = JSON.stringify(
    [...chunks]
      .sort((a, b) => a.chunkId.localeCompare(b.chunkId))
      .map((c) => ({ chunkId: c.chunkId, contentHash: c.contentHash })),
  );
  return createHash('sha256').update(canonical, 'utf8').digest('hex').slice(0, 32);
}

export function isHumanCuratedGold(c: SemanticGoldCase): boolean {
  return (
    c.annotationStatus === 'GOLD' &&
    (c.provenance === 'human' || c.provenance === 'machine_assisted')
  );
}

export function validateSemanticGoldDataset(
  dataset: SemanticGoldDataset,
  corpus?: CorpusSnapshotMeta | null,
): GoldValidationReport {
  const issues: GoldValidationIssue[] = [];
  const byCategory: Record<string, number> = {};
  const byAnswerability: Record<string, number> = { answerable: 0, unanswerable: 0 };
  const byAnnotationStatus: Record<string, number> = {
    DRAFT: 0,
    REVIEWED: 0,
    GOLD: 0,
    INVALID: 0,
  };

  const ids = new Set<string>();
  const queries = new Set<string>();
  let humanCuratedGoldCount = 0;
  let machineGeneratedCount = 0;

  for (const c of dataset.cases) {
    if (!c.id || ids.has(c.id)) {
      issues.push({ level: 'ERROR', code: 'DUPLICATE_CASE_ID', caseId: c.id, message: `duplicate or missing caseId ${c.id}` });
    }
    ids.add(c.id);

    if (!c.query || c.query.trim().length === 0) {
      issues.push({ level: 'ERROR', code: 'EMPTY_QUERY', caseId: c.id, message: 'query must be non-empty' });
    } else {
      const q = c.query.trim().toLowerCase();
      if (queries.has(q)) {
        issues.push({ level: 'ERROR', code: 'DUPLICATE_QUERY', caseId: c.id, message: 'duplicate query text' });
      }
      queries.add(q);
      if (/\bchunkId\b|gold label|expected citation/i.test(c.query)) {
        issues.push({ level: 'WARNING', code: 'GOLD_LEAKAGE_RISK', caseId: c.id, message: 'query may leak gold labels' });
      }
    }

    if (!c.category || c.category.length === 0) {
      issues.push({ level: 'ERROR', code: 'MISSING_CATEGORY', caseId: c.id, message: 'category required' });
    } else {
      for (const cat of c.category) {
        byCategory[cat] = (byCategory[cat] ?? 0) + 1;
        if (!(REQUIRED_GOLD_CATEGORIES as readonly string[]).includes(cat)) {
          issues.push({ level: 'WARNING', code: 'UNKNOWN_CATEGORY', caseId: c.id, message: `unknown category ${cat}` });
        }
      }
    }

    if (c.answerability !== 'answerable' && c.answerability !== 'unanswerable') {
      issues.push({ level: 'ERROR', code: 'INVALID_ANSWERABILITY', caseId: c.id, message: 'answerability must be answerable|unanswerable' });
    } else {
      byAnswerability[c.answerability] += 1;
    }

    if (!(c.annotationStatus in byAnnotationStatus)) {
      issues.push({ level: 'ERROR', code: 'INVALID_ANNOTATION_STATUS', caseId: c.id, message: `invalid status ${c.annotationStatus}` });
    } else {
      byAnnotationStatus[c.annotationStatus] += 1;
    }

    if (c.provenance === 'machine_generated' && c.annotationStatus === 'GOLD') {
      issues.push({
        level: 'ERROR',
        code: 'SYNTHETIC_GOLD_MARKED_AS_HUMAN',
        caseId: c.id,
        message: 'machine_generated case cannot be GOLD without human review',
      });
    }

    if (isHumanCuratedGold(c)) {
      humanCuratedGoldCount += 1;
    }
    if (c.provenance === 'machine_generated') {
      machineGeneratedCount += 1;
    }

    if (c.answerability === 'answerable') {
      if (!c.referenceAnswer || c.referenceAnswer.trim().length === 0) {
        issues.push({ level: 'ERROR', code: 'MISSING_REFERENCE_ANSWER', caseId: c.id, message: 'answerable case requires referenceAnswer' });
      }
    }

    for (const ref of c.expectedRelevantChunks) {
      if (![0, 1, 2, 3].includes(ref.relevanceGrade)) {
        issues.push({ level: 'ERROR', code: 'INVALID_GRADE', caseId: c.id, message: `grade ${ref.relevanceGrade} out of 0..3` });
      }
      if (corpus) {
        const chunk = corpus.chunks.find((x) => x.chunkId === ref.chunkId);
        if (!chunk) {
          issues.push({ level: 'ERROR', code: 'BROKEN_CHUNK_REF', caseId: c.id, message: `chunk ${ref.chunkId} missing from corpus` });
        } else if (chunk.contentHash !== ref.contentHash) {
          issues.push({ level: 'ERROR', code: 'CHUNK_HASH_MISMATCH', caseId: c.id, message: `chunk ${ref.chunkId} contentHash mismatch` });
        }
      }
      const grade = c.relevanceGrades[ref.chunkId];
      if (grade !== undefined && grade !== ref.relevanceGrade) {
        issues.push({ level: 'ERROR', code: 'GRADE_INCONSISTENCY', caseId: c.id, message: `relevanceGrades[${ref.chunkId}] != expectedRelevantChunks grade` });
      }
    }

    for (const src of c.expectedCitationSources) {
      const ref = c.expectedRelevantChunks.find((r) => r.chunkId === src);
      if (!ref) {
        issues.push({ level: 'ERROR', code: 'CITATION_NOT_IN_RELEVANT', caseId: c.id, message: `citation source ${src} not in expectedRelevantChunks` });
      } else if (ref.relevanceGrade < RELEVANT_GRADE_THRESHOLD) {
        issues.push({
          level: 'ERROR',
          code: 'CITATION_GRADE_CONFLICT',
          caseId: c.id,
          message: `citation source ${src} has grade ${ref.relevanceGrade} < ${RELEVANT_GRADE_THRESHOLD}`,
        });
      }
    }
  }

  if (dataset.cases.length === 0) {
    issues.push({ level: 'WARNING', code: 'EMPTY_DATASET', message: 'semantic gold dataset has zero cases' });
  }

  const requiredMissing = REQUIRED_GOLD_CATEGORIES.filter((cat) => !(cat in byCategory));
  if (humanCuratedGoldCount >= GOLD_MIN_HUMAN_CURATED && requiredMissing.length > 0) {
    issues.push({
      level: 'ERROR',
      code: 'MISSING_REQUIRED_CATEGORY',
      message: `missing required categories: ${requiredMissing.join(', ')}`,
    });
  }

  const expectedHash = computeDatasetContentHash(dataset);
  if (dataset.contentHash && dataset.contentHash !== expectedHash) {
    issues.push({ level: 'ERROR', code: 'DATASET_HASH_MISMATCH', message: 'contentHash does not match dataset content' });
  }

  const hasBlocking = issues.some((i) => i.level === 'ERROR');
  const ready =
    !hasBlocking &&
    humanCuratedGoldCount >= GOLD_MIN_HUMAN_CURATED &&
    requiredMissing.length === 0;

  return {
    ok: !hasBlocking,
    datasetId: dataset.datasetId,
    datasetVersion: dataset.datasetVersion,
    contentHash: expectedHash,
    totalCases: dataset.cases.length,
    humanCuratedGoldCount,
    draftCount: byAnnotationStatus.DRAFT ?? 0,
    reviewedCount: byAnnotationStatus.REVIEWED ?? 0,
    invalidCount: byAnnotationStatus.INVALID ?? 0,
    machineGeneratedCount,
    issues,
    distribution: { byCategory, byAnswerability, byAnnotationStatus },
    readiness: ready ? 'READY' : 'SEMANTIC_BENCHMARK_NOT_READY',
  };
}

/** Convert SemanticGoldCase to frozen V0.4-N EvaluationCase shape when needed. */
export function toEvaluationCase(c: SemanticGoldCase): EvaluationCase {
  return {
    caseId: c.id,
    datasetId: 'semantic-gold',
    datasetVersion: c.datasetVersion,
    query: c.query,
    answerable: c.answerability === 'answerable',
    relevantChunks: c.expectedRelevantChunks.map((r) => ({
      chunkId: r.chunkId,
      documentId: r.documentId,
      documentVersionId: r.documentVersionId,
      chunkIndex: r.chunkIndex,
      contentHash: r.contentHash,
      relevanceGrade: r.relevanceGrade,
    })),
    expectedAnswer: c.referenceAnswer ?? undefined,
    requiredEvidenceChunks: c.expectedCitationSources,
    category: c.category,
    tags: [c.annotationStatus, c.provenance],
  };
}

export { EVALUATION_CATEGORIES };
