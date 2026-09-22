import type { EmbeddingInput, EmbeddingProviderPort, EmbeddingResult } from '@akb/ai';
import { EmbeddingError } from '@akb/ai';
import { providerHttpPost } from './http-transport';
import { ProviderError, logProviderMetric } from './provider-error';
import type { EmbeddingProviderConfig } from './provider-config';
import { validateProductionProviderConfig } from './provider-config';

interface OpenAiEmbeddingPayload {
  data?: Array<{ index?: number; embedding?: number[] }>;
}

/**
 * Production Embedding adapter (OpenAI-compatible HTTP /v1/embeddings).
 * Implements canonical EmbeddingProviderPort — no vendor types leak upward.
 */
export class OpenAICompatibleEmbeddingAdapter implements EmbeddingProviderPort {
  constructor(private readonly config: EmbeddingProviderConfig) {
    validateProductionProviderConfig(config);
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
      logProviderMetric({
        provider: this.config.providerId,
        model: this.config.modelId,
        operation: 'embedding',
        latencyMs: Date.now() - started,
        success: true,
        retryCount,
        inputCount: texts.length,
        outputCount: all.length,
        dimensions: this.config.dimensions,
      });
      return all;
    } catch (error) {
      logProviderMetric({
        provider: this.config.providerId,
        model: this.config.modelId,
        operation: 'embedding',
        latencyMs: Date.now() - started,
        success: false,
        errorCode: error instanceof ProviderError ? error.code : 'PROVIDER_INVALID_RESPONSE',
        retryCount,
        inputCount: texts.length,
        dimensions: this.config.dimensions,
      });
      if (error instanceof EmbeddingError) {
        throw error;
      }
      if (error instanceof ProviderError) {
        throw new EmbeddingError('EMBEDDING_PROVIDER_ERROR', error.message);
      }
      throw new EmbeddingError('EMBEDDING_PROVIDER_ERROR', 'embedding provider failed');
    }
  }

  private async embedHttpBatch(texts: string[], onRetry: () => void): Promise<number[][]> {
    const result = await providerHttpPost({
      provider: this.config.providerId,
      model: this.config.modelId,
      operation: 'embedding',
      endpoint: normalizeEndpoint(this.config.endpoint, '/embeddings'),
      apiKey: this.config.apiKey,
      body: { model: this.config.modelId, input: texts },
      timeoutMs: this.config.timeoutMs,
      maxRetries: this.config.maxRetries,
      headers: {},
    });
    onRetry();
    return parseEmbeddingResponse(result.json, texts.length, this.config.dimensions, this.config);
  }
}

function normalizeEndpoint(endpoint: string, path: string): string {
  const base = endpoint.replace(/\/+$/, '');
  if (base.endsWith('/v1') || base.endsWith('/v1/embeddings')) {
    return base.endsWith(path) ? base : `${base}${path}`;
  }
  return `${base}/v1${path}`;
}

function parseEmbeddingResponse(
  json: unknown,
  expectedCount: number,
  dimensions: number,
  config: EmbeddingProviderConfig,
): number[][] {
  const payload = json as OpenAiEmbeddingPayload;
  const data = payload?.data;
  if (!Array.isArray(data)) {
    throw new ProviderError('PROVIDER_INVALID_RESPONSE', 'embedding list missing', {
      provider: config.providerId,
      model: config.modelId,
      operation: 'embedding',
    });
  }
  if (data.length !== expectedCount) {
    throw new EmbeddingError(
      'EMBEDDING_PROVIDER_ERROR',
      `count mismatch: got ${data.length} expected ${expectedCount}`,
    );
  }
  const vectors: number[][] = [];
  for (const item of data) {
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
    vectors.push(vector);
  }
  return vectors;
}
