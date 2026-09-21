export const AI_PACKAGE = '@akb/ai' as const;

export interface EmbeddingInput {
  text: string;
}

export interface EmbeddingResult {
  vector: number[];
  dimension: number;
  model: string;
}

export interface EmbeddingModelIdentity {
  provider: string;
  model: string;
  dimension: number;
}

export interface EmbeddingModelConfig extends EmbeddingModelIdentity {
  batchSize: number;
}

export interface EmbeddingProviderPort {
  embed(input: EmbeddingInput): Promise<EmbeddingResult>;
  embedBatch(inputs: EmbeddingInput[]): Promise<EmbeddingResult[]>;
  identity(): EmbeddingModelIdentity;
}

export type EmbeddingErrorCode =
  | 'EMBEDDING_EMPTY_CONTENT'
  | 'EMBEDDING_PROVIDER_ERROR'
  | 'EMBEDDING_DIMENSION_MISMATCH'
  | 'EMBEDDING_INVALID_VECTOR'
  | 'EMBEDDING_MODEL_CONFIG_ERROR'
  | 'EMBEDDING_PERSIST_ERROR'
  | 'EMBEDDING_CHUNK_NOT_FOUND';

export class EmbeddingError extends Error {
  constructor(
    readonly code: EmbeddingErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'EmbeddingError';
  }
}

export function normalizeEmbeddingText(text: string): string {
  return text.trim();
}

export function validateEmbeddingVector(vector: number[], dimension: number): void {
  if (!Array.isArray(vector) || vector.length !== dimension) {
    throw new EmbeddingError(
      'EMBEDDING_DIMENSION_MISMATCH',
      `vector.length=${vector.length} expected dimension=${dimension}`,
    );
  }
  for (const value of vector) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new EmbeddingError('EMBEDDING_INVALID_VECTOR', 'vector contains non-finite number');
    }
  }
}

export function validateEmbeddingModelConfig(config: EmbeddingModelConfig): void {
  if (!config.provider || !config.model) {
    throw new EmbeddingError('EMBEDDING_MODEL_CONFIG_ERROR', 'provider/model required');
  }
  if (!Number.isInteger(config.dimension) || config.dimension <= 0) {
    throw new EmbeddingError('EMBEDDING_MODEL_CONFIG_ERROR', 'dimension must be positive integer');
  }
  if (!Number.isInteger(config.batchSize) || config.batchSize <= 0) {
    throw new EmbeddingError('EMBEDDING_MODEL_CONFIG_ERROR', 'batchSize must be positive integer');
  }
}

export const DEFAULT_EMBEDDING_CONFIG: EmbeddingModelConfig = {
  provider: 'mock',
  model: 'mock-embedding-v1',
  dimension: 384,
  batchSize: 32,
};

export function loadEmbeddingConfig(
  env: Record<string, string | undefined> = process.env,
): EmbeddingModelConfig {
  const provider = env['EMBEDDING_PROVIDER']?.trim() || DEFAULT_EMBEDDING_CONFIG.provider;
  const model = env['EMBEDDING_MODEL']?.trim() || DEFAULT_EMBEDDING_CONFIG.model;
  const dimension = Number.parseInt(env['EMBEDDING_DIMENSION'] ?? '', 10);
  const batchSize = Number.parseInt(env['EMBEDDING_BATCH_SIZE'] ?? '', 10);
  const config: EmbeddingModelConfig = {
    provider,
    model,
    dimension:
      Number.isFinite(dimension) && dimension > 0 ? dimension : DEFAULT_EMBEDDING_CONFIG.dimension,
    batchSize:
      Number.isFinite(batchSize) && batchSize > 0 ? batchSize : DEFAULT_EMBEDDING_CONFIG.batchSize,
  };
  validateEmbeddingModelConfig(config);
  return config;
}

/** Deterministic pseudo-embedding: stable for same text+model+dimension. */
export function mockVector(text: string, dimension: number, model: string): number[] {
  const seedSource = `${model}::${text}`;
  const vector = new Array<number>(dimension).fill(0);
  let hash = 2166136261;
  for (let i = 0; i < seedSource.length; i += 1) {
    hash ^= seedSource.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  for (let i = 0; i < dimension; i += 1) {
    hash ^= i + 1;
    hash = Math.imul(hash, 16777619);
    const value = ((hash >>> 0) % 10000) / 10000 - 0.5;
    vector[i] = value;
  }
  return vector;
}

/**
 * Deterministic mock embeddings for offline tests/CI.
 * Not semantic search — only stable vectors with correct dimension.
 */
export class MockEmbeddingProvider implements EmbeddingProviderPort {
  private readonly config: EmbeddingModelConfig;

  constructor(config: EmbeddingModelConfig) {
    if (!config.provider || !config.model || config.dimension <= 0) {
      throw new EmbeddingError('EMBEDDING_MODEL_CONFIG_ERROR', 'invalid mock embedding config');
    }
    this.config = config;
  }

  identity(): EmbeddingModelIdentity {
    return {
      provider: this.config.provider,
      model: this.config.model,
      dimension: this.config.dimension,
    };
  }

  async embed(input: EmbeddingInput): Promise<EmbeddingResult> {
    return this.embedOne(input.text);
  }

  async embedBatch(inputs: EmbeddingInput[]): Promise<EmbeddingResult[]> {
    return inputs.map((input) => this.embedOne(input.text));
  }

  private embedOne(rawText: string): EmbeddingResult {
    const text = normalizeEmbeddingText(rawText);
    if (text.length === 0) {
      throw new EmbeddingError('EMBEDDING_EMPTY_CONTENT', 'cannot embed empty text');
    }
    const vector = mockVector(text, this.config.dimension, this.config.model);
    validateEmbeddingVector(vector, this.config.dimension);
    return {
      vector,
      dimension: this.config.dimension,
      model: this.config.model,
    };
  }
}
