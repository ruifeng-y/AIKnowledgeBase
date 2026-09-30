/**
 * Re-exports provider config from @akb/config (single source of truth).
 * Adapters must not read process.env for provider settings.
 */
export {
  DEFAULT_EMBEDDING_BATCH_SIZE,
  DEFAULT_EMBEDDING_DIMENSIONS,
  DEFAULT_LLM_MAX_OUTPUT,
  DEFAULT_MAX_RERANK_CANDIDATES,
  DEFAULT_PROVIDER_MAX_RETRIES,
  DEFAULT_PROVIDER_TIMEOUT_MS,
  DEFAULT_RERANKER_BATCH_SIZE,
  ProviderConfigError,
  assertProductionMockAllowed,
  buildProviderRuntimeSnapshot,
  computeConfigFingerprint,
  isMockProvider,
  loadEmbeddingProviderConfig,
  loadLlmProviderConfig,
  loadRerankerProviderConfig,
  validateProviderConfig,
  validateProviderConfig as validateProductionProviderConfig,
} from '@akb/config';

export type {
  BaseProviderConfig,
  EmbeddingProviderConfig,
  LlmProviderConfig,
  ProviderRuntimeSnapshot,
  RerankerProviderConfig,
} from '@akb/config';
