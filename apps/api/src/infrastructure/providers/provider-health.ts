import {
  loadEmbeddingProviderConfig,
  loadLlmProviderConfig,
  loadRerankerProviderConfig,
  validateProviderConfig,
  ProviderConfigError,
  type EmbeddingProviderConfig,
  type LlmProviderConfig,
  type RerankerProviderConfig,
} from '@akb/config';
import { providerRegistry } from './provider.registry';
import { ProviderError } from './provider-error';

export type ProviderHealthStatus = 'healthy' | 'unhealthy' | 'not_configured';

export interface ProviderHealthResult {
  capability: 'embedding' | 'reranker' | 'llm';
  provider: string;
  model: string;
  status: ProviderHealthStatus;
  ok: boolean;
  latencyMs?: number;
  code?: string;
  message?: string;
}

function mapErrorCode(error: unknown): string {
  if (error instanceof ProviderError) {
    return error.code;
  }
  if (error instanceof ProviderConfigError) {
    return error.code;
  }
  return 'PROVIDER_INVALID_RESPONSE';
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'failed';
}

function notConfigured(
  capability: 'embedding' | 'reranker' | 'llm',
  provider: string,
  model: string,
  error: unknown,
): ProviderHealthResult {
  return {
    capability,
    provider,
    model,
    ok: false,
    status: 'not_configured',
    code: 'PROVIDER_NOT_CONFIGURED',
    message: messageOf(error),
  };
}

function failure(
  capability: 'embedding' | 'reranker' | 'llm',
  provider: string,
  model: string,
  latencyMs: number,
  error: unknown,
): ProviderHealthResult {
  return {
    capability,
    provider,
    model,
    ok: false,
    status: 'unhealthy',
    latencyMs,
    code: mapErrorCode(error),
    message: messageOf(error),
  };
}

/** Minimal capability probe — does not write business DB tables. */
export async function checkEmbedding(
  config: EmbeddingProviderConfig = loadEmbeddingProviderConfig(),
): Promise<ProviderHealthResult> {
  try {
    validateProviderConfig(config);
  } catch (error) {
    return notConfigured('embedding', config.providerId, config.modelId, error);
  }
  const started = Date.now();
  try {
    const provider = providerRegistry.resolveEmbedding(config);
    const result = await provider.embed({ text: 'health-check' });
    const finite = result.vector.every((v) => Number.isFinite(v));
    const ok = finite && result.vector.length === config.dimensions;
    return {
      capability: 'embedding',
      provider: config.providerId,
      model: config.modelId,
      ok,
      status: ok ? 'healthy' : 'unhealthy',
      latencyMs: Date.now() - started,
      code: ok ? undefined : 'PROVIDER_INVALID_RESPONSE',
      message: ok ? 'ok' : 'invalid vector',
    };
  } catch (error) {
    return failure('embedding', config.providerId, config.modelId, Date.now() - started, error);
  }
}

export async function checkReranker(
  config: RerankerProviderConfig = loadRerankerProviderConfig(),
): Promise<ProviderHealthResult> {
  try {
    validateProviderConfig(config);
  } catch (error) {
    return notConfigured('reranker', config.providerId, config.modelId, error);
  }
  const started = Date.now();
  try {
    const provider = providerRegistry.resolveReranker(config);
    const results = await provider.rerank([
      { query: 'health check', chunkId: 'h1', content: 'health check document A' },
      { query: 'health check', chunkId: 'h2', content: 'health check document B' },
    ]);
    const ok = results.length === 2 && results.every((r) => Number.isFinite(r.score));
    return {
      capability: 'reranker',
      provider: config.providerId,
      model: config.modelId,
      ok,
      status: ok ? 'healthy' : 'unhealthy',
      latencyMs: Date.now() - started,
      code: ok ? undefined : 'PROVIDER_INVALID_RESPONSE',
    };
  } catch (error) {
    return failure('reranker', config.providerId, config.modelId, Date.now() - started, error);
  }
}

export async function checkLlm(
  config: LlmProviderConfig = loadLlmProviderConfig(),
): Promise<ProviderHealthResult> {
  try {
    validateProviderConfig(config);
  } catch (error) {
    return notConfigured('llm', config.providerId, config.modelId, error);
  }
  const started = Date.now();
  try {
    const provider = providerRegistry.resolveLlm(config);
    const result = await provider.generate({
      systemPrompt: 'Answer only from context.',
      userQuery: 'What is the health check value?',
      context: [
        {
          citationId: 'C1',
          chunkId: 'c1',
          documentId: 'd1',
          documentVersionId: 'v1',
          knowledgeSpaceId: 's1',
          chunkIndex: 0,
          content: 'Health check fact: value is 42.',
          metadata: {},
          truncated: false,
        },
      ],
    });
    const ok = typeof result.answer === 'string' && result.answer.trim().length > 0;
    return {
      capability: 'llm',
      provider: config.providerId,
      model: config.modelId,
      ok,
      status: ok ? 'healthy' : 'unhealthy',
      latencyMs: Date.now() - started,
      code: ok ? undefined : 'PROVIDER_INVALID_RESPONSE',
    };
  } catch (error) {
    return failure('llm', config.providerId, config.modelId, Date.now() - started, error);
  }
}

export async function checkAll(): Promise<ProviderHealthResult[]> {
  return Promise.all([checkEmbedding(), checkReranker(), checkLlm()]);
}

export async function runProviderHealthChecks(): Promise<ProviderHealthResult[]> {
  return checkAll();
}

function isRealConfigured(
  providerId: string,
  endpoint: string,
  apiKey: string | undefined,
): boolean {
  return providerId !== 'mock' && Boolean(endpoint) && Boolean(apiKey);
}

function classifySmokeMode(env: Record<string, string | undefined>): 'MOCK' | 'REAL' | 'SKIPPED' {
  const embedding = loadEmbeddingProviderConfig(env);
  const reranker = loadRerankerProviderConfig(env);
  const llm = loadLlmProviderConfig(env);
  const anyReal = [embedding, reranker, llm].some((c) => c.providerId !== 'mock');
  if (!anyReal) {
    return 'MOCK';
  }
  const realReady = [embedding, reranker, llm]
    .filter((c) => c.providerId !== 'mock')
    .every((c) => isRealConfigured(c.providerId, c.endpoint, c.apiKey));
  return realReady ? 'REAL' : 'SKIPPED';
}

export async function runProviderSmokeTest(
  env: Record<string, string | undefined> = process.env,
): Promise<{
  mode: 'MOCK' | 'REAL' | 'SKIPPED';
  results: ProviderHealthResult[];
  status: 'PASS' | 'SKIPPED_PROVIDER_UNAVAILABLE' | 'FAILED';
}> {
  const mode = classifySmokeMode(env);
  if (mode === 'SKIPPED') {
    return { mode, results: [], status: 'SKIPPED_PROVIDER_UNAVAILABLE' };
  }
  const results = await checkAll();
  const allOk = results.every((r) => r.ok);
  return {
    mode,
    results,
    status: allOk ? 'PASS' : 'FAILED',
  };
}
