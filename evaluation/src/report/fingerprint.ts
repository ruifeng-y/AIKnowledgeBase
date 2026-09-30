/**
 * Evaluation fingerprint — reproducibility without secrets.
 */

import { createHash } from 'node:crypto';

export interface EvaluationFingerprintInput {
  datasetHash: string;
  corpusHash: string;
  providerSnapshot: {
    embedding?: { provider: string; model: string; dimensions?: number } | null;
    reranker?: { provider: string; model: string } | null;
    llm?: { provider: string; model: string } | null;
  };
  configFingerprint: string;
  retrievalConfig: Record<string, number | string | boolean | null | undefined>;
  contextConfig: Record<string, number | string | boolean | null | undefined>;
  generationConfig: Record<string, number | string | boolean | null | undefined>;
  evaluatorConfig: Record<string, number | string | boolean | null | undefined>;
}

export function computeEvaluationFingerprint(input: EvaluationFingerprintInput): string {
  const payload = {
    datasetHash: input.datasetHash,
    corpusHash: input.corpusHash,
    providerSnapshot: input.providerSnapshot,
    configFingerprint: input.configFingerprint,
    retrievalConfig: input.retrievalConfig,
    contextConfig: input.contextConfig,
    generationConfig: input.generationConfig,
    evaluatorConfig: input.evaluatorConfig,
  };
  return `eval_${createHash('sha256').update(JSON.stringify(payload), 'utf8').digest('hex').slice(0, 32)}`;
}

export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx] ?? null;
}
