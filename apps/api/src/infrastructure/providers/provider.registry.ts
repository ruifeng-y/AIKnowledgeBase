import type { EmbeddingProviderPort } from '@akb/ai';
import { MockEmbeddingProvider } from '@akb/ai';
import type { RerankerProviderPort } from '../../modules/retrieval/domain/reranker.port';
import { MockRerankerProvider } from '../../modules/retrieval/domain/reranker.port';
import type { LlmProviderPort } from '../../modules/retrieval/domain/rag.port';
import {
  loadEmbeddingProviderConfig,
  loadLlmProviderConfig,
  loadRerankerProviderConfig,
  validateProductionProviderConfig,
  type EmbeddingProviderConfig,
  type LlmProviderConfig,
  type RerankerProviderConfig,
} from './provider-config';
import { ProviderError } from './provider-error';
import { OpenAICompatibleEmbeddingAdapter } from './openai-compatible-embedding.adapter';
import { HttpRerankerAdapter } from './http-reranker.adapter';
import { OpenAICompatibleLlmAdapter } from './openai-compatible-llm.adapter';

/**
 * ProviderRegistry resolves canonical ports to adapters.
 * No business/retrieval/prompt logic lives here.
 */
export class ProviderRegistry {
  resolveEmbedding(
    config: EmbeddingProviderConfig = loadEmbeddingProviderConfig(),
  ): EmbeddingProviderPort {
    if (config.providerId === 'mock') {
      return new MockEmbeddingProvider({
        provider: 'mock',
        model: config.modelId,
        dimension: config.dimensions,
        batchSize: config.batchSize,
      });
    }
    validateProductionProviderConfig(config);
    return new OpenAICompatibleEmbeddingAdapter(config);
  }

  resolveReranker(
    config: RerankerProviderConfig = loadRerankerProviderConfig(),
  ): RerankerProviderPort {
    if (config.providerId === 'mock') {
      return new MockRerankerProvider({
        provider: 'mock',
        model: config.modelId,
      });
    }
    validateProductionProviderConfig(config);
    return new HttpRerankerAdapter(config);
  }

  resolveLlm(config: LlmProviderConfig = loadLlmProviderConfig()): LlmProviderPort {
    if (config.providerId === 'mock') {
      return new MockLlmShim(config);
    }
    validateProductionProviderConfig(config);
    return new OpenAICompatibleLlmAdapter(config);
  }
}

/** Local mock LLM implementing canonical LlmProviderPort without importing production RAG domain. */
class MockLlmShim implements LlmProviderPort {
  constructor(private readonly config: LlmProviderConfig) {}
  identity() {
    return { provider: 'mock', model: this.config.modelId };
  }
  async generate(input: Parameters<LlmProviderPort['generate']>[0]) {
    const first = input.context[0]?.citationId ?? 'C1';
    return {
      answer: `根据知识上下文：${input.userQuery}。[${first}]`,
      provider: 'mock',
      model: this.config.modelId,
      usage: 'unavailable' as const,
      finishReason: 'stop' as const,
    };
  }
}

export const providerRegistry = new ProviderRegistry();

export function assertNotMockInProduction(
  env: Record<string, string | undefined> = process.env,
): void {
  const nodeEnv = env['NODE_ENV'] ?? 'development';
  const evalMode = env['EVALUATION_MODE'];
  const embedding = env['EMBEDDING_PROVIDER'] ?? 'mock';
  if (nodeEnv === 'production' && embedding === 'mock' && evalMode !== 'mock') {
    throw new ProviderError(
      'PROVIDER_NOT_CONFIGURED',
      'production runtime must not use mock embedding provider',
      { provider: 'mock', operation: 'startup' },
    );
  }
}
