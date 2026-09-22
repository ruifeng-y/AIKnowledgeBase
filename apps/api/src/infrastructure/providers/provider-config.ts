/**
 * Provider configuration types.
 * Secrets come from environment only — never hardcode API keys.
 */

export interface BaseProviderConfig {
  providerId: string;
  modelId: string;
  endpoint: string;
  apiKey: string | undefined;
  timeoutMs: number;
  maxRetries: number;
  enabled: boolean;
}

export interface EmbeddingProviderConfig extends BaseProviderConfig {
  dimensions: number;
  batchSize: number;
}

export interface RerankerProviderConfig extends BaseProviderConfig {
  maxCandidates: number;
  batchSize: number;
}

export interface LlmProviderConfig extends BaseProviderConfig {
  maxInputTokens: number;
  maxOutputTokens: number;
  temperature: number;
}

export const DEFAULT_PROVIDER_TIMEOUT_MS = 30_000;
export const DEFAULT_PROVIDER_MAX_RETRIES = 3;
export const DEFAULT_EMBEDDING_BATCH_SIZE = 32;
export const DEFAULT_RERANKER_BATCH_SIZE = 16;
export const DEFAULT_MAX_RERANK_CANDIDATES = 50;
export const DEFAULT_LLM_MAX_OUTPUT = 1024;

function intEnv(env: Record<string, string | undefined>, key: string, fallback: number): number {
  const raw = Number.parseInt(env[key] ?? '', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

export function loadEmbeddingProviderConfig(
  env: Record<string, string | undefined> = process.env,
): EmbeddingProviderConfig {
  const providerId = env['EMBEDDING_PROVIDER']?.trim() || 'mock';
  return {
    providerId,
    modelId: env['EMBEDDING_MODEL']?.trim() || 'mock-embedding-v1',
    endpoint: env['EMBEDDING_ENDPOINT']?.trim() || '',
    apiKey: env['EMBEDDING_API_KEY']?.trim() || undefined,
    timeoutMs: intEnv(env, 'EMBEDDING_TIMEOUT_MS', DEFAULT_PROVIDER_TIMEOUT_MS),
    maxRetries: intEnv(env, 'EMBEDDING_MAX_RETRIES', DEFAULT_PROVIDER_MAX_RETRIES),
    enabled: true,
    dimensions: intEnv(env, 'EMBEDDING_DIMENSION', 384),
    batchSize: intEnv(env, 'EMBEDDING_BATCH_SIZE', DEFAULT_EMBEDDING_BATCH_SIZE),
  };
}

export function loadRerankerProviderConfig(
  env: Record<string, string | undefined> = process.env,
): RerankerProviderConfig {
  const providerId = env['RERANKER_PROVIDER']?.trim() || 'mock';
  return {
    providerId,
    modelId: env['RERANKER_MODEL']?.trim() || 'mock-reranker-v1',
    endpoint: env['RERANKER_ENDPOINT']?.trim() || '',
    apiKey: env['RERANKER_API_KEY']?.trim() || undefined,
    timeoutMs: intEnv(env, 'RERANKER_TIMEOUT_MS', DEFAULT_PROVIDER_TIMEOUT_MS),
    maxRetries: intEnv(env, 'RERANKER_MAX_RETRIES', DEFAULT_PROVIDER_MAX_RETRIES),
    enabled: true,
    maxCandidates: intEnv(env, 'RERANKER_MAX_CANDIDATES', DEFAULT_MAX_RERANK_CANDIDATES),
    batchSize: intEnv(env, 'RERANKER_BATCH_SIZE', DEFAULT_RERANKER_BATCH_SIZE),
  };
}

export function loadLlmProviderConfig(
  env: Record<string, string | undefined> = process.env,
): LlmProviderConfig {
  const providerId = env['LLM_PROVIDER']?.trim() || 'mock';
  return {
    providerId,
    modelId: env['LLM_MODEL']?.trim() || 'mock-llm-v1',
    endpoint: env['LLM_ENDPOINT']?.trim() || '',
    apiKey: env['LLM_API_KEY']?.trim() || undefined,
    timeoutMs: intEnv(env, 'LLM_TIMEOUT_MS', DEFAULT_PROVIDER_TIMEOUT_MS),
    maxRetries: intEnv(env, 'LLM_MAX_RETRIES', DEFAULT_PROVIDER_MAX_RETRIES),
    enabled: true,
    maxInputTokens: intEnv(env, 'LLM_MAX_INPUT_TOKENS', 8192),
    maxOutputTokens: intEnv(env, 'LLM_MAX_OUTPUT_TOKENS', DEFAULT_LLM_MAX_OUTPUT),
    temperature: 0,
  };
}

export function validateProductionProviderConfig(
  config: BaseProviderConfig & { dimensions?: number },
): void {
  if (config.providerId === 'mock') {
    return;
  }
  if (!config.modelId) {
    throw new Error('PROVIDER_NOT_CONFIGURED: modelId required');
  }
  if (!config.endpoint) {
    throw new Error('PROVIDER_NOT_CONFIGURED: endpoint required');
  }
  if (!config.apiKey) {
    throw new Error('PROVIDER_NOT_CONFIGURED: apiKey required');
  }
  if (config.dimensions !== undefined && config.dimensions <= 0) {
    throw new Error('PROVIDER_NOT_CONFIGURED: dimensions must be positive');
  }
}
