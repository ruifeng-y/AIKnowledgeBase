import { describe, expect, it } from 'vitest';
import {
  citationSourceHitRate,
  citationValidity,
  contextPrecision,
  contextRecall,
  hitRateAtK,
  macroAverage,
  mrrAtK,
  ndcgAtK,
  percentile,
  precisionAtK,
  recallAtK,
  retrievalMetricsForCase,
  aggregateRetrievalMetrics,
  unsupportedCitationRate,
} from './retrieval.metrics';
import type { RelevanceGrade } from '../types';

describe('retrieval metrics', () => {
  it('HitRate@K', () => {
    expect(hitRateAtK(['a', 'b'], ['c'], 5)).toBe(0);
    expect(hitRateAtK(['a', 'b', 'c'], ['c'], 5)).toBe(1);
    expect(hitRateAtK(['a', 'b', 'c'], ['c'], 2)).toBe(0);
  });

  it('Recall@K macro per case', () => {
    expect(recallAtK(['a', 'b'], ['a', 'c'], 5)).toBeCloseTo(0.5);
    expect(recallAtK(['a', 'c'], ['a', 'c'], 5)).toBe(1);
    expect(recallAtK([], ['a'], 5)).toBe(0);
  });

  it('Precision@K always divides by K', () => {
    expect(precisionAtK(['a', 'x'], ['a'], 5)).toBeCloseTo(0.2);
    expect(precisionAtK(['a', 'b', 'x', 'y', 'z'], ['a', 'b'], 5)).toBeCloseTo(0.4);
  });

  it('MRR@10', () => {
    expect(mrrAtK(['x', 'y', 'a'], ['a'], 10)).toBeCloseTo(1 / 3);
    expect(mrrAtK(['a'], ['a'], 10)).toBe(1);
    expect(mrrAtK(['x'], ['a'], 10)).toBe(0);
  });

  it('nDCG@10 with grades 0/1/2/3', () => {
    // retrieved grades [3, 0, 2], ideal [3, 2, 0]
    const ndcg = ndcgAtK([3, 0, 2] as RelevanceGrade[], [3, 2, 0] as RelevanceGrade[], 10);
    expect(ndcg).not.toBeNull();
    expect(ndcg!).toBeLessThanOrEqual(1);
    expect(ndcg!).toBeGreaterThan(0.8);
    expect(ndcgAtK([0, 0] as RelevanceGrade[], [0, 0] as RelevanceGrade[], 10)).toBeNull();
  });

  it('Context Recall / Precision', () => {
    expect(contextRecall(['a', 'x'], ['a', 'b'])).toBeCloseTo(0.5);
    expect(contextPrecision(['a', 'x'], ['a', 'b'])).toBeCloseTo(0.5);
    expect(contextPrecision([], ['a'])).toBe(0);
  });

  it('Citation metrics', () => {
    expect(citationValidity(2, 2)).toBe(1);
    expect(citationValidity(0, 0)).toBeNull();
    expect(citationSourceHitRate(1, 2)).toBeCloseTo(0.5);
    expect(citationSourceHitRate(0, 0)).toBeNull();
    expect(unsupportedCitationRate(0, 2)).toBe(0);
    expect(unsupportedCitationRate(0, 0)).toBeNull();
  });

  it('percentile p50/p95/p99', () => {
    expect(percentile([], 50)).toBeNull();
    expect(percentile([10], 50)).toBe(10);
    expect(percentile([1, 2, 3, 4, 5], 50)).toBe(3);
  });

  it('retrievalMetricsForCase + aggregation', () => {
    const grades = new Map<string, RelevanceGrade>([
      ['a', 3],
      ['b', 2],
      ['c', 0],
    ]);
    const m = retrievalMetricsForCase(['a', 'c', 'b'], ['a', 'b'], grades);
    expect(m.recall10).toBe(1);
    expect(m.mrr10).toBe(1);
    expect(m.precision5).toBeCloseTo(0.4);
    const agg = aggregateRetrievalMetrics([
      { answerable: true, metrics: m },
      {
        answerable: true,
        metrics: retrievalMetricsForCase([], ['a'], new Map([['a', 2]])),
      },
    ]);
    expect(agg['Recall@10']).toBeCloseTo(0.5);
    expect(macroAverage([1, 0])).toBeCloseTo(0.5);
  });
});
