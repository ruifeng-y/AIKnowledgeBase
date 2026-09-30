/**
 * Provider configuration single source of truth.
 * Environment → packages/config → Normalized Provider Config → Provider Registry.
 * Adapters must not read process.env for provider settings.
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
export const DEFAULT_EMBEDDING_DIMENSIONS = 384;

export class ProviderConfigError extends Error {
  constructor(
    readonly code: 'PROVIDER_NOT_CONFIGURED' | 'PROVIDER_NOT_SUPPORTED',
    message: string,
  ) {
    super(message);
    this.name = 'ProviderConfigError';
  }
}

function intEnv(env: Record<string, string | undefined>, key: string, fallback: number): number {
  const raw = Number.parseInt(env[key] ?? '', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function loadEmbeddingProviderConfig(
  env: Record<string, string | undefined> = process.env,
): EmbeddingProviderConfig {
  const providerId =
    env['EMBEDDING_PROVIDER_ID']?.trim() || env['EMBEDDING_PROVIDER']?.trim() || 'mock';
  return {
    providerId,
    modelId:
      env['EMBEDDING_MODEL_ID']?.trim() || env['EMBEDDING_MODEL']?.trim() || 'mock-embedding-v1',
    endpoint: env['EMBEDDING_ENDPOINT']?.trim() || '',
    apiKey: env['EMBEDDING_API_KEY']?.trim() || undefined,
    timeoutMs: intEnv(env, 'EMBEDDING_TIMEOUT_MS', DEFAULT_PROVIDER_TIMEOUT_MS),
    maxRetries: intEnv(env, 'EMBEDDING_MAX_RETRIES', DEFAULT_PROVIDER_MAX_RETRIES),
    enabled: true,
    dimensions: intEnv(
      env,
      'EMBEDDING_DIMENSIONS',
      intEnv(env, 'EMBEDDING_DIMENSION', DEFAULT_EMBEDDING_DIMENSIONS),
    ),
    batchSize: intEnv(env, 'EMBEDDING_BATCH_SIZE', DEFAULT_EMBEDDING_BATCH_SIZE),
  };
}

export function loadRerankerProviderConfig(
  env: Record<string, string | undefined> = process.env,
): RerankerProviderConfig {
  const providerId =
    env['RERANKER_PROVIDER_ID']?.trim() || env['RERANKER_PROVIDER']?.trim() || 'mock';
  return {
    providerId,
    modelId:
      env['RERANKER_MODEL_ID']?.trim() || env['RERANKER_MODEL']?.trim() || 'mock-reranker-v1',
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
  const providerId = env['LLM_PROVIDER_ID']?.trim() || env['LLM_PROVIDER']?.trim() || 'mock';
  return {
    providerId,
    modelId: env['LLM_MODEL_ID']?.trim() || env['LLM_MODEL']?.trim() || 'mock-llm-v1',
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

export function validateProviderConfig(
  config: BaseProviderConfig & {
    dimensions?: number;
    maxCandidates?: number;
    maxOutputTokens?: number;
  },
): void {
  if (!config.providerId) {
    throw new ProviderConfigError(
      'PROVIDER_NOT_CONFIGURED',
      'PROVIDER_NOT_CONFIGURED: providerId required',
    );
  }
  if (!config.modelId) {
    throw new ProviderConfigError(
      'PROVIDER_NOT_CONFIGURED',
      'PROVIDER_NOT_CONFIGURED: modelId required',
    );
  }
  if (!(config.timeoutMs > 0)) {
    throw new ProviderConfigError(
      'PROVIDER_NOT_CONFIGURED',
      'PROVIDER_NOT_CONFIGURED: timeoutMs must be > 0',
    );
  }
  if (!(config.maxRetries >= 0) || !Number.isInteger(config.maxRetries)) {
    throw new ProviderConfigError(
      'PROVIDER_NOT_CONFIGURED',
      'PROVIDER_NOT_CONFIGURED: maxRetries must be integer >= 0',
    );
  }
  if (config.dimensions !== undefined && !(config.dimensions > 0)) {
    throw new ProviderConfigError(
      'PROVIDER_NOT_CONFIGURED',
      'PROVIDER_NOT_CONFIGURED: dimensions must be > 0',
    );
  }
  if (config.maxCandidates !== undefined && !(config.maxCandidates > 0)) {
    throw new ProviderConfigError(
      'PROVIDER_NOT_CONFIGURED',
      'PROVIDER_NOT_CONFIGURED: maxCandidates must be > 0',
    );
  }
  if (config.maxOutputTokens !== undefined && !(config.maxOutputTokens > 0)) {
    throw new ProviderConfigError(
      'PROVIDER_NOT_CONFIGURED',
      'PROVIDER_NOT_CONFIGURED: maxOutputTokens must be > 0',
    );
  }
  const batchSize = (config as { batchSize?: number }).batchSize;
  if (batchSize !== undefined && !(batchSize > 0)) {
    throw new ProviderConfigError(
      'PROVIDER_NOT_CONFIGURED',
      'PROVIDER_NOT_CONFIGURED: batchSize must be > 0',
    );
  }
  if (config.providerId === 'mock') {
    return;
  }
  if (!config.endpoint || !isValidHttpUrl(config.endpoint)) {
    throw new ProviderConfigError(
      'PROVIDER_NOT_CONFIGURED',
      'PROVIDER_NOT_CONFIGURED: endpoint must be a valid http(s) URL',
    );
  }
  if (!config.apiKey) {
    throw new ProviderConfigError(
      'PROVIDER_NOT_CONFIGURED',
      'PROVIDER_NOT_CONFIGURED: apiKey required for production provider',
    );
  }
}

/** @deprecated use validateProviderConfig */
export const validateProductionProviderConfig = validateProviderConfig;

export function isMockProvider(providerId: string): boolean {
  return providerId === 'mock';
}

export function assertProductionMockAllowed(
  env: Record<string, string | undefined> = process.env,
): void {
  const nodeEnv = env['NODE_ENV'] ?? 'development';
  const evalMode = env['EVALUATION_MODE'];
  if (nodeEnv !== 'production' || evalMode === 'mock') {
    return;
  }
  const checks: Array<[string, string]> = [
    [loadEmbeddingProviderConfig(env).providerId, 'embedding'],
    [loadRerankerProviderConfig(env).providerId, 'reranker'],
    [loadLlmProviderConfig(env).providerId, 'llm'],
  ];
  for (const [providerId, capability] of checks) {
    if (isMockProvider(providerId)) {
      throw new ProviderConfigError(
        'PROVIDER_NOT_CONFIGURED',
        `PROVIDER_NOT_CONFIGURED: production runtime must not use mock ${capability} provider`,
      );
    }
  }
}

export function assertCapabilityMockAllowed(
  capability: 'embedding' | 'reranker' | 'llm',
  providerId: string,
  env: Record<string, string | undefined> = process.env,
): void {
  const nodeEnv = env['NODE_ENV'] ?? 'development';
  const evalMode = env['EVALUATION_MODE'];
  if (nodeEnv === 'production' && isMockProvider(providerId) && evalMode !== 'mock') {
    throw new ProviderConfigError(
      'PROVIDER_NOT_CONFIGURED',
      `PROVIDER_NOT_CONFIGURED: production runtime must not use mock ${capability} provider`,
    );
  }
}

export interface ProviderRuntimeSnapshot {
  embedding: { provider: string; model: string; dimensions: number };
  reranker: { provider: string; model: string };
  llm: { provider: string; model: string };
  configFingerprint: string;
}

/** Non-secret config fingerprint for diagnostics/reproducibility only (not a credential). */
export function computeConfigFingerprint(
  embedding: EmbeddingProviderConfig,
  reranker: RerankerProviderConfig,
  llm: LlmProviderConfig,
): string {
  const payload = {
    embedding: {
      providerId: embedding.providerId,
      modelId: embedding.modelId,
      endpoint: embedding.endpoint,
      timeoutMs: embedding.timeoutMs,
      maxRetries: embedding.maxRetries,
      batchSize: embedding.batchSize,
      dimensions: embedding.dimensions,
    },
    reranker: {
      providerId: reranker.providerId,
      modelId: reranker.modelId,
      endpoint: reranker.endpoint,
      timeoutMs: reranker.timeoutMs,
      maxRetries: reranker.maxRetries,
      maxCandidates: reranker.maxCandidates,
      batchSize: reranker.batchSize,
    },
    llm: {
      providerId: llm.providerId,
      modelId: llm.modelId,
      endpoint: llm.endpoint,
      timeoutMs: llm.timeoutMs,
      maxRetries: llm.maxRetries,
      maxOutputTokens: llm.maxOutputTokens,
    },
  };
  // FNV-1a 64-bit style fingerprint (stable, non-cryptographic, secret-free)
  const text = JSON.stringify(payload);
  let h1 = 0xcbf29ce4;
  let h2 = 0x84222325;
  for (let i = 0; i < text.length; i += 1) {
    h1 ^= text.charCodeAt(i);
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= text.charCodeAt(i);
    h2 = Math.imul(h2, 0x01000193) >>> 0;
  }
  return `cfg_${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`;
}

export function buildProviderRuntimeSnapshot(
  env: Record<string, string | undefined> = process.env,
): ProviderRuntimeSnapshot {
  const embedding = loadEmbeddingProviderConfig(env);
  const reranker = loadRerankerProviderConfig(env);
  const llm = loadLlmProviderConfig(env);
  return {
    embedding: {
      provider: embedding.providerId,
      model: embedding.modelId,
      dimensions: embedding.dimensions,
    },
    reranker: { provider: reranker.providerId, model: reranker.modelId },
    llm: { provider: llm.providerId, model: llm.modelId },
    configFingerprint: computeConfigFingerprint(embedding, reranker, llm),
  };
}
