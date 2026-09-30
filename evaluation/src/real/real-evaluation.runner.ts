/**
 * Real semantic evaluation runner (V0.5-C).
 * Uses real providers when configured; never falls back to Mock for quality claims.
 */

import type { SemanticGoldDataset, CorpusSnapshotMeta } from '../semantic-gold/schema';
import { isHumanCuratedGold, validateSemanticGoldDataset } from '../semantic-gold/schema';
import { LexicalGroundednessEvaluator, type GroundednessResult } from '../groundedness/evaluator';
import { computeEvaluationFingerprint } from '../report/fingerprint';
import {
  hitRateAtK,
  mrrAtK,
  ndcgAtK,
  precisionAtK,
  recallAtK,
} from '../metrics/retrieval.metrics';
import type { RelevanceGrade } from '../types';

export type RealProviderMode = 'REAL' | 'PROVIDER_UNAVAILABLE' | 'MOCK_NOT_ALLOWED';

export interface ProviderIdentity {
  provider: string;
  model: string;
  dimensions?: number;
}

export interface RealProviderSnapshot {
  embedding: ProviderIdentity | null;
  reranker: ProviderIdentity | null;
  llm: ProviderIdentity | null;
  mode: RealProviderMode;
  reason?: string;
}

export interface RealRetrievalPort {
  vectorSearch(query: string, topK: number): Promise<string[]>;
  hybridSearch(query: string, topK: number, candidateK: number): Promise<string[]>;
  rerankSearch(query: string, topK: number): Promise<string[]>;
}

export interface RealRagPort {
  query(input: {
    query: string;
    contextTopK: number;
  }): Promise<{
    answer: string;
    contextChunkIds: string[];
    citations: string[];
    estimatedContextTokens: number;
    llmCalled: boolean;
    usage: { inputTokens: number | null; outputTokens: number | null; totalTokens: number | null };
    latencyMs: number;
  }>;
}

export interface RealEvaluationRequest {
  dataset: SemanticGoldDataset;
  corpus: CorpusSnapshotMeta;
  providers: RealProviderSnapshot;
  configFingerprint: string;
  retrievalConfig: {
    topK: number;
    candidateK: number;
    rrfK: number;
    rerankCandidateK: number;
    finalTopK: number;
  };
  contextConfig: {
    contextTopK: number;
    contextTokenBudget: number;
    maxChunkContextTokens: number;
  };
  generationConfig: {
    temperature: number;
    maxOutputTokens: number;
  };
  evaluatorConfig: {
    evaluatorName: string;
    evaluatorModel: string | null;
    evaluatorVersion: string;
  };
  retrieval: RealRetrievalPort;
  rag: RealRagPort;
  gitCommit: string;
}

export interface CaseRealResult {
  caseId: string;
  status: 'EVALUATED' | 'PROVIDER_FAILURE' | 'SYSTEM_FAILURE' | 'EVALUATION_FAILURE' | 'SKIPPED_NOT_GOLD';
  failureClass?: string;
  metrics: Record<string, number | null>;
  retrievedChunkIds: string[];
  contextChunkIds: string[];
  citations: string[];
  answer?: string;
  groundedness?: GroundednessResult;
  abstentionCorrect?: boolean;
  latencyMs: number;
  tokenUsage: {
    inputTokens: number | null;
    outputTokens: number | null;
    totalTokens: number | null;
    estimatedContextTokens: number | null;
  };
}

export interface RealEvaluationReport {
  evaluationId: string;
  timestamp: string;
  gitCommit: string;
  datasetVersion: string;
  datasetHash: string;
  corpusVersion: string;
  corpusHash: string;
  providerSnapshot: RealProviderSnapshot;
  configFingerprint: string;
  evaluationFingerprint: string;
  retrievalConfig: RealEvaluationRequest['retrievalConfig'];
  contextConfig: RealEvaluationRequest['contextConfig'];
  generationConfig: RealEvaluationRequest['generationConfig'];
  evaluatorConfig: RealEvaluationRequest['evaluatorConfig'];
  totals: {
    totalCases: number;
    humanGoldCases: number;
    evaluated: number;
    providerFailures: number;
    systemFailures: number;
    skippedNotGold: number;
  };
  denominatorNote: string;
  retrievalMetrics: Record<string, number | null>;
  contextMetrics: Record<string, number | null>;
  citationMetrics: Record<string, number | null>;
  answerMetrics: Record<string, number | null>;
  groundedness: {
    grounded: number;
    partially_grounded: number;
    ungrounded: number;
    unable_to_evaluate: number;
  };
  abstention: {
    unanswerableCases: number;
    correctAbstentions: number;
    unsupportedAnswers: number;
  };
  performance: {
    totalMs: { p50: number | null; p95: number | null; p99: number | null };
  };
  caseResults: CaseRealResult[];
  status: 'PASS' | 'BLOCKED' | 'PROVIDER_UNAVAILABLE' | 'SEMANTIC_BENCHMARK_NOT_READY';
  notes: string[];
}

function emptyMetrics(): Record<string, number | null> {
  return {
    'HitRate@5': null,
    'HitRate@10': null,
    'Recall@5': null,
    'Recall@10': null,
    'Precision@5': null,
    'Precision@10': null,
    'MRR@10': null,
    'nDCG@10': null,
  };
}

export function assessGoldReadiness(dataset: SemanticGoldDataset, corpus: CorpusSnapshotMeta): {
  ready: boolean;
  humanCuratedGoldCount: number;
  reason: string;
} {
  const report = validateSemanticGoldDataset(dataset, corpus);
  const human = report.humanCuratedGoldCount;
  if (human < 50) {
    return {
      ready: false,
      humanCuratedGoldCount: human,
      reason: `SEMANTIC_BENCHMARK_NOT_READY: human-curated GOLD=${human} < 50`,
    };
  }
  if (!report.ok) {
    return {
      ready: false,
      humanCuratedGoldCount: human,
      reason: `SEMANTIC_BENCHMARK_NOT_READY: validation errors=${report.issues.filter((i) => i.level === 'ERROR').length}`,
    };
  }
  return { ready: true, humanCuratedGoldCount: human, reason: 'READY' };
}

export async function runRealSemanticEvaluation(
  request: RealEvaluationRequest,
): Promise<RealEvaluationReport> {
  const notes: string[] = [];
  const goldCases = request.dataset.cases.filter(isHumanCuratedGold);
  const readiness = assessGoldReadiness(request.dataset, request.corpus);

  const evaluationFingerprint = computeEvaluationFingerprint({
    datasetHash: request.dataset.contentHash,
    corpusHash: request.corpus.corpusHash,
    providerSnapshot: request.providers,
    configFingerprint: request.configFingerprint,
    retrievalConfig: request.retrievalConfig,
    contextConfig: request.contextConfig,
    generationConfig: request.generationConfig,
    evaluatorConfig: request.evaluatorConfig,
  });

  const base: Omit<RealEvaluationReport, 'caseResults' | 'totals' | 'retrievalMetrics' | 'contextMetrics' | 'citationMetrics' | 'answerMetrics' | 'groundedness' | 'abstention' | 'performance' | 'status'> = {
    evaluationId: `real-${Date.now()}`,
    timestamp: new Date().toISOString(),
    gitCommit: request.gitCommit,
    datasetVersion: request.dataset.datasetVersion,
    datasetHash: request.dataset.contentHash,
    corpusVersion: request.corpus.corpusVersion,
    corpusHash: request.corpus.corpusHash,
    providerSnapshot: request.providers,
    configFingerprint: request.configFingerprint,
    evaluationFingerprint,
    retrievalConfig: request.retrievalConfig,
    contextConfig: request.contextConfig,
    generationConfig: request.generationConfig,
    evaluatorConfig: request.evaluatorConfig,
    denominatorNote: 'metrics computed on evaluated GOLD cases only; failures reported separately',
    notes,
  };

  if (!readiness.ready) {
    notes.push(readiness.reason);
    return {
      ...base,
      totals: {
        totalCases: request.dataset.cases.length,
        humanGoldCases: goldCases.length,
        evaluated: 0,
        providerFailures: 0,
        systemFailures: 0,
        skippedNotGold: request.dataset.cases.length,
      },
      retrievalMetrics: emptyMetrics(),
      contextMetrics: {},
      citationMetrics: {},
      answerMetrics: {},
      groundedness: { grounded: 0, partially_grounded: 0, ungrounded: 0, unable_to_evaluate: 0 },
      abstention: { unanswerableCases: 0, correctAbstentions: 0, unsupportedAnswers: 0 },
      performance: { totalMs: { p50: null, p95: null, p99: null } },
      caseResults: [],
      status: 'SEMANTIC_BENCHMARK_NOT_READY',
    };
  }

  if (request.providers.mode === 'PROVIDER_UNAVAILABLE') {
    notes.push(request.providers.reason ?? 'PROVIDER_UNAVAILABLE');
    return {
      ...base,
      totals: {
        totalCases: request.dataset.cases.length,
        humanGoldCases: goldCases.length,
        evaluated: 0,
        providerFailures: 0,
        systemFailures: 0,
        skippedNotGold: request.dataset.cases.length,
      },
      retrievalMetrics: emptyMetrics(),
      contextMetrics: {},
      citationMetrics: {},
      answerMetrics: {},
      groundedness: { grounded: 0, partially_grounded: 0, ungrounded: 0, unable_to_evaluate: 0 },
      abstention: { unanswerableCases: 0, correctAbstentions: 0, unsupportedAnswers: 0 },
      performance: { totalMs: { p50: null, p95: null, p99: null } },
      caseResults: [],
      status: 'PROVIDER_UNAVAILABLE',
    };
  }

  const groundedness = new LexicalGroundednessEvaluator({
    evaluatorName: request.evaluatorConfig.evaluatorName,
    evaluatorModel: request.evaluatorConfig.evaluatorModel,
  });

  const caseResults: CaseRealResult[] = [];
  const hit5: number[] = [];
  const hit10: number[] = [];
  const rec5: number[] = [];
  const rec10: number[] = [];
  const prec5: number[] = [];
  const prec10: number[] = [];
  const mrrs: number[] = [];
  const ndcgs: number[] = [];
  const latencies: number[] = [];
  const groundedCounts = { grounded: 0, partially_grounded: 0, ungrounded: 0, unable_to_evaluate: 0 };
  const abstention = { unanswerableCases: 0, correctAbstentions: 0, unsupportedAnswers: 0 };
  let providerFailures = 0;
  let evaluated = 0;

  for (const c of goldCases) {
    const started = Date.now();
    try {
      const relevantIds = c.expectedRelevantChunks
        .filter((r) => r.relevanceGrade >= 2)
        .map((r) => r.chunkId);
      const gradesById = new Map<string, RelevanceGrade>(
        c.expectedRelevantChunks.map((r) => [r.chunkId, r.relevanceGrade]),
      );

      const retrieved = await request.retrieval.rerankSearch(c.query, request.retrievalConfig.finalTopK);
      const rag = await request.rag.query({
        query: c.query,
        contextTopK: request.contextConfig.contextTopK,
      });

      const retrievedGrades = retrieved.map((id) => gradesById.get(id) ?? 0);
      const idealGrades = c.expectedRelevantChunks.map((r) => r.relevanceGrade).sort((a, b) => b - a);

      const metrics: Record<string, number | null> = {
        'HitRate@5': hitRateAtK(retrieved, relevantIds, 5),
        'HitRate@10': hitRateAtK(retrieved, relevantIds, 10),
        'Recall@5': recallAtK(retrieved, relevantIds, 5),
        'Recall@10': recallAtK(retrieved, relevantIds, 10),
        'Precision@5': precisionAtK(retrieved, relevantIds, 5),
        'Precision@10': precisionAtK(retrieved, relevantIds, 10),
        'MRR@10': mrrAtK(retrieved, relevantIds, 10),
        'nDCG@10': ndcgAtK(retrievedGrades, idealGrades, 10),
      };

      hit5.push(metrics['HitRate@5']!);
      hit10.push(metrics['HitRate@10']!);
      rec5.push(metrics['Recall@5']!);
      rec10.push(metrics['Recall@10']!);
      prec5.push(metrics['Precision@5']!);
      prec10.push(metrics['Precision@10']!);
      mrrs.push(metrics['MRR@10']!);
      if (metrics['nDCG@10'] !== null) ndcgs.push(metrics['nDCG@10']);

      let g: GroundednessResult | undefined;
      let abstentionCorrect: boolean | undefined;
      if (rag.llmCalled) {
        const corpusById = new Map(request.corpus.chunks.map((ch) => [ch.chunkId, ch.content]));
        g = await groundedness.evaluate({
          query: c.query,
          answer: rag.answer,
          citations: rag.citations,
          contextTexts: rag.contextChunkIds.map((id) => corpusById.get(id) ?? ''),
          contextChunkIds: rag.contextChunkIds,
        });
        groundedCounts[g.status] += 1;
      }

      if (c.answerability === 'unanswerable') {
        abstention.unanswerableCases += 1;
        const abstained =
          !rag.llmCalled ||
          /无法确认|无法回答|没有足够|cannot confirm|insufficient|unable to|no (sufficient )?evidence|根据当前知识库内容/i.test(
            rag.answer,
          );
        if (abstained) abstention.correctAbstentions += 1;
        else abstention.unsupportedAnswers += 1;
        abstentionCorrect = abstained;
      }

      evaluated += 1;
      latencies.push(Date.now() - started);
      caseResults.push({
        caseId: c.id,
        status: 'EVALUATED',
        metrics,
        retrievedChunkIds: retrieved,
        contextChunkIds: rag.contextChunkIds,
        citations: rag.citations,
        answer: rag.answer,
        groundedness: g,
        abstentionCorrect,
        latencyMs: Date.now() - started,
        tokenUsage: {
          inputTokens: rag.usage.inputTokens,
          outputTokens: rag.usage.outputTokens,
          totalTokens: rag.usage.totalTokens,
          estimatedContextTokens: rag.estimatedContextTokens,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const isProvider = /PROVIDER_|timeout|429|401|500/i.test(message);
      if (isProvider) providerFailures += 1;
      caseResults.push({
        caseId: c.id,
        status: isProvider ? 'PROVIDER_FAILURE' : 'SYSTEM_FAILURE',
        failureClass: isProvider ? 'PROVIDER_FAILURE' : 'SYSTEM_FAILURE',
        metrics: emptyMetrics(),
        retrievedChunkIds: [],
        contextChunkIds: [],
        citations: [],
        latencyMs: Date.now() - started,
        tokenUsage: { inputTokens: null, outputTokens: null, totalTokens: null, estimatedContextTokens: null },
      });
    }
  }

  const avg = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const pct = (xs: number[], p: number): number | null => {
    if (xs.length === 0) return null;
    const sorted = [...xs].sort((a, b) => a - b);
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
    return sorted[idx] ?? null;
  };

  return {
    ...base,
    totals: {
      totalCases: request.dataset.cases.length,
      humanGoldCases: goldCases.length,
      evaluated,
      providerFailures,
      systemFailures: caseResults.filter((r) => r.status === 'SYSTEM_FAILURE').length,
      skippedNotGold: request.dataset.cases.length - goldCases.length,
    },
    retrievalMetrics: {
      'HitRate@5': avg(hit5),
      'HitRate@10': avg(hit10),
      'Recall@5': avg(rec5),
      'Recall@10': avg(rec10),
      'Precision@5': avg(prec5),
      'Precision@10': avg(prec10),
      'MRR@10': avg(mrrs),
      'nDCG@10': avg(ndcgs),
      sampleCount: evaluated,
      failureCount: providerFailures,
    },
    contextMetrics: {
      contextChunkCountAvg:
        avg(caseResults.filter((r) => r.status === 'EVALUATED').map((r) => r.contextChunkIds.length)) ?? null,
    },
    citationMetrics: {},
    answerMetrics: {
      nonEmptyRate:
        evaluated === 0
          ? null
          : caseResults.filter((r) => r.status === 'EVALUATED' && (r.answer ?? '').length > 0).length / evaluated,
    },
    groundedness: groundedCounts,
    abstention,
    performance: {
      totalMs: { p50: pct(latencies, 50), p95: pct(latencies, 95), p99: pct(latencies, 99) },
    },
    caseResults,
    status: providerFailures > 0 && evaluated === 0 ? 'PROVIDER_UNAVAILABLE' : 'PASS',
    notes,
  };
}
