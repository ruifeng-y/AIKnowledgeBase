import type {
  RerankInput,
  RerankerIdentity,
  RerankerProviderPort,
  RerankResult,
} from '../../modules/retrieval/domain/reranker.port';
import { RerankerError, sliceRerankBatches } from '../../modules/retrieval/domain/reranker.port';
import { providerHttpPost } from './http-transport';
import { ProviderError, logProviderMetric } from './provider-error';
import type { RerankerProviderConfig } from './provider-config';
import { validateProductionProviderConfig } from './provider-config';

interface RerankHttpPayload {
  results?: Array<{ chunkId?: string; score?: number }>;
}

/**
 * Production Reranker adapter (HTTP JSON protocol).
 * Request: { query, documents: [{ chunkId, content }] }
 * Response: { results: [{ chunkId, score }] }
 * Protocol is AKB-provider HTTP contract — not a specific vendor SDK.
 */
export class HttpRerankerAdapter implements RerankerProviderPort {
  constructor(private readonly config: RerankerProviderConfig) {
    validateProductionProviderConfig(config);
  }

  identity(): RerankerIdentity {
    return { provider: this.config.providerId, model: this.config.modelId };
  }

  async rerank(inputs: RerankInput[]): Promise<RerankResult[]> {
    const started = Date.now();
    const query = inputs[0]?.query ?? '';
    try {
      const batches = sliceRerankBatches(inputs, this.config.batchSize);
      const results: RerankResult[] = [];
      for (const batch of batches) {
        const payload = await providerHttpPost({
          provider: this.config.providerId,
          model: this.config.modelId,
          operation: 'rerank',
          endpoint: this.config.endpoint,
          apiKey: this.config.apiKey,
          body: {
            model: this.config.modelId,
            query,
            documents: batch.map((b) => ({ chunkId: b.chunkId, content: b.content })),
          },
          timeoutMs: this.config.timeoutMs,
          maxRetries: this.config.maxRetries,
        });
        results.push(...parseRerankResponse(payload.json, batch));
      }
      logProviderMetric({
        provider: this.config.providerId,
        model: this.config.modelId,
        operation: 'rerank',
        latencyMs: Date.now() - started,
        success: true,
        retryCount: 0,
        inputCount: inputs.length,
        outputCount: results.length,
      });
      return results;
    } catch (error) {
      logProviderMetric({
        provider: this.config.providerId,
        model: this.config.modelId,
        operation: 'rerank',
        latencyMs: Date.now() - started,
        success: false,
        errorCode: error instanceof ProviderError ? error.code : 'RERANKER_INVALID_RESPONSE',
        retryCount: 0,
        inputCount: inputs.length,
      });
      if (error instanceof RerankerError) {
        throw error;
      }
      if (error instanceof ProviderError) {
        throw new RerankerError('RERANKER_PROVIDER_ERROR', error.message);
      }
      throw new RerankerError('RERANKER_PROVIDER_ERROR', 'reranker provider failed');
    }
  }
}

function parseRerankResponse(json: unknown, batch: RerankInput[]): RerankResult[] {
  const payload = json as RerankHttpPayload;
  const results = payload?.results;
  if (!Array.isArray(results)) {
    throw new RerankerError('RERANKER_INVALID_RESPONSE', 'rerank results missing');
  }
  const known = new Set(batch.map((b) => b.chunkId));
  const seen = new Set<string>();
  const out: RerankResult[] = [];
  for (const item of results) {
    const chunkId = item?.chunkId;
    const score = item?.score;
    if (!chunkId || !known.has(chunkId)) {
      throw new RerankerError('RERANKER_INVALID_RESPONSE', `unknown chunkId ${String(chunkId)}`);
    }
    if (seen.has(chunkId)) {
      throw new RerankerError('RERANKER_INVALID_RESPONSE', `duplicate chunkId ${chunkId}`);
    }
    if (typeof score !== 'number' || !Number.isFinite(score)) {
      throw new RerankerError('RERANKER_INVALID_RESPONSE', `invalid score for ${chunkId}`);
    }
    seen.add(chunkId);
    out.push({ chunkId, score });
  }
  if (out.length !== batch.length) {
    throw new RerankerError(
      'RERANKER_INVALID_RESPONSE',
      `result count mismatch ${out.length} vs ${batch.length}`,
    );
  }
  return out;
}

export type { RerankInput, RerankResult };
