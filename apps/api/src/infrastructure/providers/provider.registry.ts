import type { EmbeddingProviderPort } from '@akb/ai';
import {
  assertCapabilityMockAllowed,
  assertProductionMockAllowed,
  isMockProvider,
  loadEmbeddingProviderConfig,
  loadLlmProviderConfig,
  loadRerankerProviderConfig,
  validateProviderConfig,
  type EmbeddingProviderConfig,
  type LlmProviderConfig,
  type RerankerProviderConfig,
} from '@akb/config';
import { resolveEmbeddingProvider } from '@akb/ai';
import type { RerankerProviderPort } from '../../modules/retrieval/domain/reranker.port';
import { MockRerankerProvider } from '../../modules/retrieval/domain/reranker.port';
import type { LlmProviderPort } from '../../modules/retrieval/domain/rag.port';
import { HttpRerankerAdapter } from './http-reranker.adapter';
import { OpenAICompatibleLlmAdapter } from './openai-compatible-llm.adapter';
import { MockLlmProvider } from '../llm/mock-llm.provider';

/**
 * Unique runtime provider resolution entry.
 * Does not perform health checks, retrieval, ranking, or persistence.
 */
export class ProviderRegistry {
  resolveEmbedding(
    config: EmbeddingProviderConfig = loadEmbeddingProviderConfig(),
  ): EmbeddingProviderPort {
    validateProviderConfig(config);
    assertCapabilityMockAllowed('embedding', config.providerId);
    return resolveEmbeddingProvider(config);
  }

  resolveReranker(
    config: RerankerProviderConfig = loadRerankerProviderConfig(),
  ): RerankerProviderPort {
    validateProviderConfig(config);
    assertCapabilityMockAllowed('reranker', config.providerId);
    if (isMockProvider(config.providerId)) {
      return new MockRerankerProvider({ provider: 'mock', model: config.modelId });
    }
    return new HttpRerankerAdapter({
      ...config,
      providerId: config.providerId,
    });
  }

  resolveLlm(config: LlmProviderConfig = loadLlmProviderConfig()): LlmProviderPort {
    validateProviderConfig(config);
    assertCapabilityMockAllowed('llm', config.providerId);
    if (isMockProvider(config.providerId)) {
      return new MockLlmProvider({ provider: 'mock', model: config.modelId });
    }
    return new OpenAICompatibleLlmAdapter(config);
  }
}

export const providerRegistry = new ProviderRegistry();

export function assertNotMockInProduction(
  env: Record<string, string | undefined> = process.env,
): void {
  assertProductionMockAllowed(env);
}
