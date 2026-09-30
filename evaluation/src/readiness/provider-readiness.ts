/**
 * Provider readiness checks — minimal real health/smoke only.
 * Never falls back to Mock when claiming REAL READY.
 */

import {
  computeConfigFingerprint,
  loadEmbeddingProviderConfig,
  loadLlmProviderConfig,
  loadRerankerProviderConfig,
} from '../../../packages/config/src/index';
import type { ProviderReadinessItem, ProviderReadinessReport } from './readiness';
import { assessProviderReadiness } from './readiness';

function isRealConfigured(providerId: string, endpoint: string, apiKey: string | undefined): boolean {
  return providerId !== 'mock' && Boolean(endpoint) && Boolean(apiKey);
}

/**
 * Classify provider readiness from config + optional health/smoke results.
 * When real credentials are missing → UNAVAILABLE (never Mock-as-Real).
 */
export function classifyProviderReadiness(
  env: Record<string, string | undefined> = process.env,
  checks: {
    embedding?: { health?: string; smoke?: string; errorCode?: string };
    reranker?: { health?: string; smoke?: string; errorCode?: string };
    llm?: { health?: string; smoke?: string; errorCode?: string };
  } = {},
): ProviderReadinessReport {
  const embeddingCfg = loadEmbeddingProviderConfig(env);
  const rerankerCfg = loadRerankerProviderConfig(env);
  const llmCfg = loadLlmProviderConfig(env);

  const configFingerprint = computeConfigFingerprint(embeddingCfg, rerankerCfg, llmCfg);

  function item(
    capability: 'embedding' | 'reranker' | 'llm',
    providerId: string,
    model: string,
    endpoint: string,
    apiKey: string | undefined,
    dimensions: number | undefined,
    check?: { health?: string; smoke?: string; errorCode?: string },
  ): ProviderReadinessItem {
    const base = {
      capability,
      provider: providerId,
      model,
      dimensions,
    } as ProviderReadinessItem;

    if (providerId === 'mock') {
      return {
        ...base,
        state: 'UNAVAILABLE',
        reason: 'mock provider is not real-ready',
      };
    }

    if (!isRealConfigured(providerId, endpoint, apiKey)) {
      return {
        ...base,
        state: 'UNAVAILABLE',
        reason: 'missing endpoint or apiKey',
        errorCode: 'PROVIDER_UNAVAILABLE',
      };
    }

    const health = check?.health;
    const smoke = check?.smoke;

    if (health === 'not_configured' || smoke === 'SKIPPED_PROVIDER_UNAVAILABLE') {
      return {
        ...base,
        state: 'UNAVAILABLE',
        healthStatus: health as ProviderReadinessItem['healthStatus'],
        smokeStatus: smoke as ProviderReadinessItem['smokeStatus'],
        reason: 'provider configured but not verified',
      };
    }

    if (health === 'unhealthy' || smoke === 'FAILED') {
      return {
        ...base,
        state: 'FAILED',
        healthStatus: health as ProviderReadinessItem['healthStatus'],
        smokeStatus: smoke as ProviderReadinessItem['smokeStatus'],
        errorCode: check?.errorCode ?? 'PROVIDER_FAILURE',
        reason: 'health or smoke failed',
      };
    }

    if (health === 'healthy' && smoke === 'PASS') {
      return {
        ...base,
        state: 'READY',
        healthStatus: 'healthy',
        smokeStatus: 'PASS',
      };
    }

    // real configured but health/smoke not executed yet
    return {
      ...base,
      state: 'UNAVAILABLE',
      reason: 'real credentials present but health/smoke not confirmed',
    };
  }

  const items: ProviderReadinessItem[] = [
    item(
      'embedding',
      embeddingCfg.providerId,
      embeddingCfg.modelId,
      embeddingCfg.endpoint,
      embeddingCfg.apiKey,
      embeddingCfg.dimensions,
      checks.embedding,
    ),
    item(
      'reranker',
      rerankerCfg.providerId,
      rerankerCfg.modelId,
      rerankerCfg.endpoint,
      rerankerCfg.apiKey,
      undefined,
      checks.reranker,
    ),
    item(
      'llm',
      llmCfg.providerId,
      llmCfg.modelId,
      llmCfg.endpoint,
      llmCfg.apiKey,
      undefined,
      checks.llm,
    ),
  ];

  return assessProviderReadiness(items, configFingerprint);
}
