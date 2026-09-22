import type { RelevanceGrade } from '../types';
import { isRelevant } from '../types';

export function hitRateAtK(
  retrieved: string[],
  relevantChunkIds: string[],
  k: number,
): 0 | 1 {
  const top = new Set(retrieved.slice(0, k));
  return relevantChunkIds.some((id) => top.has(id)) ? 1 : 0;
}

export function recallAtK(
  retrieved: string[],
  relevantChunkIds: string[],
  k: number,
): number {
  if (relevantChunkIds.length === 0) {
    return 0;
  }
  const top = new Set(retrieved.slice(0, k));
  const hit = relevantChunkIds.filter((id) => top.has(id)).length;
  return hit / relevantChunkIds.length;
}

export function precisionAtK(
  retrieved: string[],
  relevantChunkIds: string[],
  k: number,
): number {
  if (k <= 0) {
    return 0;
  }
  const relevant = new Set(relevantChunkIds);
  const top = retrieved.slice(0, k);
  const hit = top.filter((id) => relevant.has(id)).length;
  return hit / k;
}

export function mrrAtK(retrieved: string[], relevantChunkIds: string[], k: number): number {
  const relevant = new Set(relevantChunkIds);
  const top = retrieved.slice(0, k);
  for (let i = 0; i < top.length; i += 1) {
    if (relevant.has(top[i]!)) {
      return 1 / (i + 1);
    }
  }
  return 0;
}

function gain(grade: RelevanceGrade): number {
  return 2 ** grade - 1;
}

function dcgAtK(grades: RelevanceGrade[], k: number): number {
  let sum = 0;
  for (let i = 1; i <= Math.min(k, grades.length); i += 1) {
    sum += gain(grades[i - 1]!) / Math.log2(i + 1);
  }
  return sum;
}

export function ndcgAtK(
  retrievedGrades: RelevanceGrade[],
  idealGrades: RelevanceGrade[],
  k: number,
): number | null {
  const idcg = dcgAtK(
    [...idealGrades].sort((a, b) => b - a),
    k,
  );
  if (idcg === 0) {
    return null;
  }
  return dcgAtK(retrievedGrades, k) / idcg;
}

export function macroAverage(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function macroAverageOptional(values: Array<number | null>): number | null {
  const ok = values.filter((v): v is number => v !== null);
  if (ok.length === 0) {
    return null;
  }
  return macroAverage(ok);
}

export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) {
    return sorted[0]!;
  }
  const rank = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) {
    return sorted[lo]!;
  }
  const w = rank - lo;
  return sorted[lo]! * (1 - w) + sorted[hi]! * w;
}

export interface CaseRetrievalMetrics {
  hitRate5: number;
  hitRate10: number;
  recall5: number;
  recall10: number;
  precision5: number;
  precision10: number;
  mrr10: number;
  ndcg10: number | null;
}

export function retrievalMetricsForCase(
  retrieved: string[],
  relevantChunkIds: string[],
  gradesByChunk: Map<string, RelevanceGrade>,
): CaseRetrievalMetrics {
  const ideal: RelevanceGrade[] = [...gradesByChunk.values()].sort((a, b) => b - a);
  const retrievedGrades: RelevanceGrade[] = retrieved.map((id) => gradesByChunk.get(id) ?? 0);
  return {
    hitRate5: hitRateAtK(retrieved, relevantChunkIds, 5),
    hitRate10: hitRateAtK(retrieved, relevantChunkIds, 10),
    recall5: recallAtK(retrieved, relevantChunkIds, 5),
    recall10: recallAtK(retrieved, relevantChunkIds, 10),
    precision5: precisionAtK(retrieved, relevantChunkIds, 5),
    precision10: precisionAtK(retrieved, relevantChunkIds, 10),
    mrr10: mrrAtK(retrieved, relevantChunkIds, 10),
    ndcg10: ndcgAtK(retrievedGrades, ideal, 10),
  };
}

export function aggregateRetrievalMetrics(
  rows: Array<{ answerable: boolean; metrics: CaseRetrievalMetrics }>,
): Record<string, number | null> {
  const answerable = rows.filter((r) => r.answerable);
  return {
    'HitRate@5': macroAverage(answerable.map((r) => r.metrics.hitRate5)),
    'HitRate@10': macroAverage(answerable.map((r) => r.metrics.hitRate10)),
    'Recall@5': macroAverage(answerable.map((r) => r.metrics.recall5)),
    'Recall@10': macroAverage(answerable.map((r) => r.metrics.recall10)),
    'Precision@5': macroAverage(answerable.map((r) => r.metrics.precision5)),
    'Precision@10': macroAverage(answerable.map((r) => r.metrics.precision10)),
    'MRR@10': macroAverage(answerable.map((r) => r.metrics.mrr10)),
    'nDCG@10': macroAverageOptional(answerable.map((r) => r.metrics.ndcg10)),
  };
}

export function contextRecall(
  contextChunkIds: string[],
  relevantChunkIds: string[],
): number {
  if (relevantChunkIds.length === 0) {
    return 0;
  }
  const ctx = new Set(contextChunkIds);
  return relevantChunkIds.filter((id) => ctx.has(id)).length / relevantChunkIds.length;
}

export function contextPrecision(
  contextChunkIds: string[],
  relevantChunkIds: string[],
): number {
  if (contextChunkIds.length === 0) {
    return 0;
  }
  const relevant = new Set(relevantChunkIds);
  return contextChunkIds.filter((id) => relevant.has(id)).length / contextChunkIds.length;
}

export function citationValidity(validRefs: number, totalRefs: number): number | null {
  if (totalRefs === 0) {
    return null;
  }
  return validRefs / totalRefs;
}

export function citationSourceHitRate(
  citedRequired: number,
  requiredCount: number,
): number | null {
  if (requiredCount === 0) {
    return null;
  }
  return citedRequired / requiredCount;
}

export function unsupportedCitationRate(
  unsupported: number,
  totalCitations: number,
): number | null {
  if (totalCitations === 0) {
    return null;
  }
  return unsupported / totalCitations;
}

export { isRelevant };
