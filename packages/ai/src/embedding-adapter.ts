import {
  isMockProvider,
  validateProviderConfig,
  type EmbeddingProviderConfig,
  ProviderConfigError,
} from '@akb/config';
import {
  EmbeddingError,
  type EmbeddingInput,
  type EmbeddingModelConfig,
  type EmbeddingProviderPort,
  type EmbeddingResult,
} from './index';

export interface ProviderCallMetric {
  requestId?: string;
  operation: 'embedding' | 'reranker' | 'llm' | 'healthcheck' | 'smoke';
  provider: string;
  model: string;
  latencyMs?: number;
  success?: boolean;
  errorCode?: string;
  retryCount?: number;
  inputCount?: number;
  outputCount?: number;
  dimensions?: number;
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
}

/** Observability must never break the business path. */
export function logProviderEvent(
  event: 'provider.request.started' | 'provider.request.completed' | 'provider.request.failed',
  payload: Record<string, unknown>,
): void {
  try {
    console.log(JSON.stringify({ event, ...payload }));
  } catch {
    // ignore observability failures
  }
}

export function mapHttpStatusToErrorCode(status: number): string {
  if (status === 400) return 'PROVIDER_BAD_REQUEST';
  if (status === 401 || status === 403) return 'PROVIDER_AUTH_FAILED';
  if (status === 404) return 'PROVIDER_NOT_FOUND';
  if (status === 408) return 'PROVIDER_TIMEOUT';
  if (status === 429) return 'PROVIDER_RATE_LIMITED';
  if (status >= 500) return 'PROVIDER_SERVER_ERROR';
  return 'PROVIDER_BAD_REQUEST';
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffMs(attempt: number): number {
  return Math.min(250 * 2 ** attempt, 4_000) + Math.floor(Math.random() * 50);
}

/**
 * Production Embedding adapter (OpenAI-compatible HTTP /v1/embeddings).
 * Single implementation used by API Registry and Worker. Does not read process.env.
 */
export class HttpEmbeddingAdapter implements EmbeddingProviderPort {
  constructor(private readonly config: EmbeddingProviderConfig) {
    validateProviderConfig(config);
    if (isMockProvider(config.providerId)) {
      throw new ProviderConfigError(
        'PROVIDER_NOT_CONFIGURED',
        'HttpEmbeddingAdapter cannot be constructed for mock provider',
      );
    }
  }

  identity() {
    return {
      provider: this.config.providerId,
      model: this.config.modelId,
      dimension: this.config.dimensions,
    };
  }

  async embed(input: EmbeddingInput): Promise<EmbeddingResult> {
    const [result] = await this.embedBatch([input]);
    if (!result) {
      throw new EmbeddingError('EMBEDDING_PROVIDER_ERROR', 'empty embedding response');
    }
    return result;
  }

  async embedBatch(inputs: EmbeddingInput[]): Promise<EmbeddingResult[]> {
    const started = Date.now();
    let retryCount = 0;
    const texts = inputs.map((i) => i.text);
    logProviderEvent('provider.request.started', {
      operation: 'embedding',
      provider: this.config.providerId,
      model: this.config.modelId,
    });
    try {
      const all: EmbeddingResult[] = [];
      const batchSize = this.config.batchSize;
      for (let i = 0; i < texts.length; i += batchSize) {
        const slice = texts.slice(i, i + batchSize);
        const vectors = await this.embedHttpBatch(slice, () => {
          retryCount += 1;
        });
        for (let j = 0; j < slice.length; j += 1) {
          all.push({
            vector: vectors[j]!,
            dimension: this.config.dimensions,
            model: this.config.modelId,
          });
        }
      }
      logProviderEvent('provider.request.completed', {
        operation: 'embedding',
        provider: this.config.providerId,
        model: this.config.modelId,
        latencyMs: Date.now() - started,
        success: true,
        retryCount,
        inputCount: texts.length,
        outputCount: all.length,
        dimensions: this.config.dimensions,
      });
      return all;
    } catch (error) {
      logProviderEvent('provider.request.failed', {
        operation: 'embedding',
        provider: this.config.providerId,
        model: this.config.modelId,
        latencyMs: Date.now() - started,
        success: false,
        retryCount,
        inputCount: texts.length,
        dimensions: this.config.dimensions,
        errorCode:
          error instanceof EmbeddingError
            ? error.code
            : error instanceof ProviderConfigError
              ? error.code
              : 'PROVIDER_INVALID_RESPONSE',
      });
      if (error instanceof EmbeddingError) {
        throw error;
      }
      throw new EmbeddingError(
        'EMBEDDING_PROVIDER_ERROR',
        error instanceof Error ? error.message : 'embedding provider failed',
      );
    }
  }

  private async embedHttpBatch(texts: string[], onRetry: () => void): Promise<number[][]> {
    const endpoint = normalizeEmbeddingEndpoint(this.config.endpoint);
    const maxRetries = this.config.maxRetries;
    let lastMessage = 'embedding provider failed';

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${this.config.apiKey}`,
          },
          body: JSON.stringify({ model: this.config.modelId, input: texts }),
          signal: controller.signal,
        });
        const raw = await response.text();
        if (!response.ok) {
          const code = mapHttpStatusToErrorCode(response.status);
          lastMessage = `embedding HTTP ${response.status} (${code})`;
          if (isRetryableStatus(response.status) && attempt < maxRetries) {
            onRetry();
            await sleep(backoffMs(attempt));
            continue;
          }
          throw new EmbeddingError('EMBEDDING_PROVIDER_ERROR', lastMessage);
        }
        let json: unknown;
        try {
          json = JSON.parse(raw);
        } catch {
          throw new EmbeddingError('EMBEDDING_PROVIDER_ERROR', 'malformed embedding JSON');
        }
        return parseEmbeddingVectors(json, texts.length, this.config.dimensions);
      } catch (error) {
        if (error instanceof EmbeddingError) {
          throw error;
        }
        const aborted = error instanceof Error && error.name === 'AbortError';
        lastMessage = aborted ? 'embedding timeout' : 'embedding network error';
        if (attempt < maxRetries) {
          onRetry();
          await sleep(backoffMs(attempt));
          continue;
        }
        throw new EmbeddingError('EMBEDDING_PROVIDER_ERROR', lastMessage);
      } finally {
        clearTimeout(timer);
      }
    }
    throw new EmbeddingError('EMBEDDING_PROVIDER_ERROR', lastMessage);
  }
}

/** @deprecated production path uses resolveEmbeddingProvider / HttpEmbeddingAdapter. */
export const OpenAICompatibleEmbeddingAdapter = HttpEmbeddingAdapter;

function normalizeEmbeddingEndpoint(endpoint: string): string {
  const base = endpoint.replace(/\/+$/, '');
  if (base.endsWith('/embeddings')) {
    return base;
  }
  if (base.endsWith('/v1')) {
    return `${base}/embeddings`;
  }
  return `${base}/v1/embeddings`;
}

function parseEmbeddingVectors(
  json: unknown,
  expectedCount: number,
  dimensions: number,
): number[][] {
  const data = (json as { data?: Array<{ embedding?: number[] }> })?.data;
  if (!Array.isArray(data)) {
    throw new EmbeddingError('EMBEDDING_PROVIDER_ERROR', 'embedding list missing');
  }
  if (data.length !== expectedCount) {
    throw new EmbeddingError(
      'EMBEDDING_PROVIDER_ERROR',
      `count mismatch: got ${data.length} expected ${expectedCount}`,
    );
  }
  return data.map((item) => {
    const vector = item?.embedding;
    if (!Array.isArray(vector) || vector.length !== dimensions) {
      throw new EmbeddingError(
        'EMBEDDING_DIMENSION_MISMATCH',
        `vector length ${Array.isArray(vector) ? vector.length : 0} expected ${dimensions}`,
      );
    }
    for (const value of vector) {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new EmbeddingError('EMBEDDING_INVALID_VECTOR', 'non-finite embedding value');
      }
    }
    return vector;
  });
}

export function toEmbeddingModelConfig(config: EmbeddingProviderConfig): EmbeddingModelConfig {
  return {
    provider: config.providerId,
    model: config.modelId,
    dimension: config.dimensions,
    batchSize: config.batchSize,
  };
}
