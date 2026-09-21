/** Reranker provider port — application depends only on this abstraction. */

export const RETRIEVAL_RERANKER_PROVIDER = Symbol('RETRIEVAL_RERANKER_PROVIDER');

export const DEFAULT_RERANKER_BATCH_SIZE = 16;
export const MAX_RERANKER_BATCH_SIZE = 32;

export interface RerankerIdentity {
  provider: string;
  model: string;
}

export interface RerankInput {
  query: string;
  chunkId: string;
  content: string;
}

export interface RerankResult {
  chunkId: string;
  score: number;
}

export interface RerankerProviderPort {
  identity(): RerankerIdentity;
  rerank(inputs: RerankInput[]): Promise<RerankResult[]>;
}

export type RerankerErrorCode =
  'RERANKER_INVALID_RESPONSE' | 'RERANKER_PROVIDER_ERROR' | 'RERANKER_INVALID_BATCH';

export class RerankerError extends Error {
  constructor(
    readonly code: RerankerErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'RerankerError';
  }
}

export function validateRerankResults(inputs: RerankInput[], results: RerankResult[]): void {
  const inputIds = new Set(inputs.map((i) => i.chunkId));
  const seen = new Set<string>();

  if (results.length !== inputs.length) {
    throw new RerankerError(
      'RERANKER_INVALID_RESPONSE',
      `reranker returned ${results.length} results for ${inputs.length} inputs`,
    );
  }

  for (const result of results) {
    if (!inputIds.has(result.chunkId)) {
      throw new RerankerError(
        'RERANKER_INVALID_RESPONSE',
        `reranker returned unknown chunkId ${result.chunkId}`,
      );
    }
    if (seen.has(result.chunkId)) {
      throw new RerankerError(
        'RERANKER_INVALID_RESPONSE',
        `reranker returned duplicate chunkId ${result.chunkId}`,
      );
    }
    if (typeof result.score !== 'number' || !Number.isFinite(result.score)) {
      throw new RerankerError(
        'RERANKER_INVALID_RESPONSE',
        `reranker score must be finite for chunk ${result.chunkId}`,
      );
    }
    seen.add(result.chunkId);
  }

  for (const input of inputs) {
    if (!seen.has(input.chunkId)) {
      throw new RerankerError(
        'RERANKER_INVALID_RESPONSE',
        `reranker missing result for chunk ${input.chunkId}`,
      );
    }
  }
}

export function sliceRerankBatches<T>(items: T[], batchSize = DEFAULT_RERANKER_BATCH_SIZE): T[][] {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > MAX_RERANKER_BATCH_SIZE) {
    throw new RerankerError(
      'RERANKER_INVALID_BATCH',
      `batchSize must be integer between 1 and ${MAX_RERANKER_BATCH_SIZE}`,
    );
  }
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }
  return batches;
}

/**
 * Deterministic mock rerank score — NOT semantic reranking.
 * Stable for identical (query, chunkId, content).
 */
export function mockRerankScore(query: string, chunkId: string, content: string): number {
  const q = query.toLowerCase();
  const c = content.toLowerCase();
  let overlap = 0;
  for (const token of q.split(/[^a-z0-9]+/i).filter((t) => t.length > 0)) {
    if (c.includes(token)) {
      overlap += 1;
    }
  }
  const seed = `${query}::${chunkId}::${content}`;
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const jitter = (hash >>> 0) % 1000;
  return overlap * 1000 + jitter / 1000;
}

export const DEFAULT_RERANKER_IDENTITY: RerankerIdentity = {
  provider: 'mock',
  model: 'mock-reranker-v1',
};

export function loadRerankerIdentity(
  env: Record<string, string | undefined> = process.env,
): RerankerIdentity {
  return {
    provider: env['RERANKER_PROVIDER']?.trim() || DEFAULT_RERANKER_IDENTITY.provider,
    model: env['RERANKER_MODEL']?.trim() || DEFAULT_RERANKER_IDENTITY.model,
  };
}

/**
 * Deterministic Mock Reranker for tests/runtime.
 * Does not claim real semantic reranking capability.
 */
export class MockRerankerProvider implements RerankerProviderPort {
  private readonly config: RerankerIdentity;

  constructor(config: RerankerIdentity = DEFAULT_RERANKER_IDENTITY) {
    this.config = config;
  }

  identity(): RerankerIdentity {
    return { ...this.config };
  }

  async rerank(inputs: RerankInput[]): Promise<RerankResult[]> {
    const batches = sliceRerankBatches(inputs, DEFAULT_RERANKER_BATCH_SIZE);
    const results: RerankResult[] = [];
    for (const batch of batches) {
      for (const input of batch) {
        results.push({
          chunkId: input.chunkId,
          score: mockRerankScore(input.query, input.chunkId, input.content),
        });
      }
    }
    return results;
  }
}
