/**
 * Combined Gold + Provider readiness gate (V0.5-C Readiness).
 * Readiness ≠ Semantic Quality. No winner / quality score.
 */

import {
  REQUIRED_GOLD_CATEGORIES,
  computeCorpusHash,
  validateSemanticGoldDataset,
  type GoldValidationReport,
  type SemanticGoldDataset,
  type CorpusSnapshotMeta,
} from '../semantic-gold/schema';
import { computeEvaluationFingerprint } from '../report/fingerprint';

export type ProviderReadyState = 'READY' | 'FAILED' | 'UNAVAILABLE';

export interface ProviderReadinessItem {
  capability: 'embedding' | 'reranker' | 'llm';
  state: ProviderReadyState;
  provider: string;
  model: string;
  dimensions?: number;
  healthStatus?: 'healthy' | 'unhealthy' | 'not_configured';
  smokeStatus?: 'PASS' | 'FAILED' | 'SKIPPED_PROVIDER_UNAVAILABLE';
  errorCode?: string;
  reason?: string;
}

export interface ProviderReadinessReport {
  embedding: ProviderReadinessItem;
  reranker: ProviderReadinessItem;
  llm: ProviderReadinessItem;
  allReady: boolean;
  configFingerprint: string;
  providerSnapshot: {
    embedding: { provider: string; model: string; dimensions?: number } | null;
    reranker: { provider: string; model: string } | null;
    llm: { provider: string; model: string } | null;
  };
}

export interface GoldReadinessReport {
  status: 'GOLD_READY' | 'SEMANTIC_BENCHMARK_NOT_READY';
  totalCases: number;
  humanCurated: number;
  draft: number;
  invalid: number;
  requiredCategoriesCovered: boolean;
  missingCategories: string[];
  datasetVersion: string;
  datasetHash: string;
  corpusVersion: string;
  corpusHash: string;
  validation: GoldValidationReport;
}

export interface CombinedReadinessReport {
  title: 'V0.5-C Readiness Report';
  gold: GoldReadinessReport;
  provider: ProviderReadinessReport;
  GOLD_READY: boolean;
  REAL_PROVIDER_READY: boolean;
  REAL_BENCHMARK_READY: boolean;
  readinessFingerprint: string;
  blockingReasons: string[];
  note: string;
}

export function assessGoldReadiness(
  dataset: SemanticGoldDataset,
  corpus: CorpusSnapshotMeta,
): GoldReadinessReport {
  const validation = validateSemanticGoldDataset(dataset, corpus);
  const missing = REQUIRED_GOLD_CATEGORIES.filter(
    (cat) => !(cat in validation.distribution.byCategoryAssignment),
  );
  const covered = missing.length === 0;
  const goldReady =
    validation.humanCuratedGoldCount >= 50 &&
    covered &&
    validation.ok &&
    validation.readiness === 'READY';

  return {
    status: goldReady ? 'GOLD_READY' : 'SEMANTIC_BENCHMARK_NOT_READY',
    totalCases: validation.totalCases,
    humanCurated: validation.humanCuratedGoldCount,
    draft: validation.draftCount,
    invalid: validation.invalidCount,
    requiredCategoriesCovered: covered,
    missingCategories: missing,
    datasetVersion: dataset.datasetVersion,
    datasetHash: validation.contentHash,
    corpusVersion: corpus.corpusVersion,
    corpusHash: corpus.corpusHash ?? computeCorpusHash(corpus.chunks),
    validation,
  };
}

export function assessProviderReadiness(
  items: ProviderReadinessItem[],
  configFingerprint: string,
): ProviderReadinessReport {
  const find = (cap: 'embedding' | 'reranker' | 'llm'): ProviderReadinessItem =>
    items.find((i) => i.capability === cap) ?? {
      capability: cap,
      state: 'UNAVAILABLE',
      provider: 'unknown',
      model: 'unknown',
      reason: 'not checked',
    };

  const embedding = find('embedding');
  const reranker = find('reranker');
  const llm = find('llm');
  const allReady =
    embedding.state === 'READY' && reranker.state === 'READY' && llm.state === 'READY';

  return {
    embedding,
    reranker,
    llm,
    allReady,
    configFingerprint,
    providerSnapshot: {
      embedding:
        embedding.state === 'READY'
          ? {
              provider: embedding.provider,
              model: embedding.model,
              dimensions: embedding.dimensions,
            }
          : null,
      reranker:
        reranker.state === 'READY' ? { provider: reranker.provider, model: reranker.model } : null,
      llm: llm.state === 'READY' ? { provider: llm.provider, model: llm.model } : null,
    },
  };
}

export function buildCombinedReadiness(
  gold: GoldReadinessReport,
  provider: ProviderReadinessReport,
): CombinedReadinessReport {
  const GOLD_READY = gold.status === 'GOLD_READY';
  const REAL_PROVIDER_READY = provider.allReady;
  const REAL_BENCHMARK_READY = GOLD_READY && REAL_PROVIDER_READY;

  const blockingReasons: string[] = [];
  if (!GOLD_READY) {
    blockingReasons.push(
      `SEMANTIC_BENCHMARK_NOT_READY: humanCurated=${gold.humanCurated} < 50; missingCategories=${gold.missingCategories.join(',') || 'none'}`,
    );
  }
  if (!REAL_PROVIDER_READY) {
    for (const item of [provider.embedding, provider.reranker, provider.llm]) {
      if (item.state !== 'READY') {
        blockingReasons.push(
          `REAL_PROVIDER_NOT_READY: ${item.capability}=${item.state}${item.reason ? ` (${item.reason})` : ''}`,
        );
      }
    }
  }

  const readinessFingerprint = computeEvaluationFingerprint({
    datasetHash: gold.datasetHash,
    corpusHash: gold.corpusHash,
    providerSnapshot: provider.providerSnapshot,
    configFingerprint: provider.configFingerprint,
    retrievalConfig: {},
    contextConfig: {},
    generationConfig: {},
    evaluatorConfig: { stage: 'readiness' },
  });

  return {
    title: 'V0.5-C Readiness Report',
    gold,
    provider,
    GOLD_READY,
    REAL_PROVIDER_READY,
    REAL_BENCHMARK_READY,
    readinessFingerprint,
    blockingReasons,
    note: 'Readiness ≠ Semantic Quality. No quality score is computed in this stage.',
  };
}
