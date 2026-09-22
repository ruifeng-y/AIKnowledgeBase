import {
  DEFAULT_EMBEDDING_CONFIG,
  EmbeddingError,
  loadEmbeddingConfig,
  MockEmbeddingProvider,
  normalizeEmbeddingText,
  validateEmbeddingVector,
  type EmbeddingModelConfig,
  type EmbeddingProviderPort,
} from '@akb/ai';
import { embeddingRecordRepository, knowledgeChunkRepository } from '@akb/db';

export interface EmbeddingJobPayload {
  documentId: string;
  documentVersionId: string;
}

export interface EmbeddingStats {
  documentVersionId: string;
  model: string;
  provider: string;
  dimension: number;
  chunkCount: number;
  successCount: number;
  failureCount: number;
  durationMs: number;
}

export class EmbeddingService {
  constructor(
    private readonly provider: EmbeddingProviderPort,
    private readonly config: EmbeddingModelConfig = DEFAULT_EMBEDDING_CONFIG,
  ) {}

  static createDefault(): EmbeddingService {
    const config = loadEmbeddingConfig(process.env);
    // Production / mock selected via EMBEDDING_PROVIDER; registry lives in API infrastructure.
    // Worker keeps local mock construction for default test/dev paths.
    return new EmbeddingService(new MockEmbeddingProvider(config), config);
  }

  async embedDocumentVersion(payload: EmbeddingJobPayload): Promise<EmbeddingStats> {
    const started = Date.now();
    const { documentVersionId } = payload;
    const chunks = await knowledgeChunkRepository.listByVersion(documentVersionId);
    const chunkCount = chunks.length;
    if (chunkCount === 0) {
      return {
        documentVersionId,
        model: this.config.model,
        provider: this.config.provider,
        dimension: this.config.dimension,
        chunkCount: 0,
        successCount: 0,
        failureCount: 0,
        durationMs: Date.now() - started,
      };
    }

    const batchSize = this.config.batchSize;
    let successCount = 0;
    let failureCount = 0;

    for (let i = 0; i < chunks.length; i += batchSize) {
      const slice = chunks.slice(i, i + batchSize);
      const texts = slice.map((chunk) => normalizeEmbeddingText(chunk.content));
      if (texts.some((text) => text.length === 0)) {
        // Do not persist partial invalid batch.
        throw new EmbeddingError('EMBEDDING_EMPTY_CONTENT', 'empty chunk content in batch');
      }

      let vectors: Array<{ vector: number[]; dimension: number; model: string }>;
      try {
        vectors = await this.provider.embedBatch(texts.map((text) => ({ text })));
      } catch (error) {
        failureCount += slice.length;
        const message = error instanceof Error ? error.message : 'provider error';
        const code = error instanceof EmbeddingError ? error.code : 'EMBEDDING_PROVIDER_ERROR';
        throw new EmbeddingError(code, `batch ${i / batchSize + 1} failed: ${message}`);
      }

      if (vectors.length !== slice.length) {
        throw new EmbeddingError(
          'EMBEDDING_PROVIDER_ERROR',
          'provider returned unexpected batch size',
        );
      }

      // Validate ALL before persisting batch.
      for (const item of vectors) {
        validateEmbeddingVector(item.vector, this.config.dimension);
      }

      for (let j = 0; j < slice.length; j += 1) {
        const chunk = slice[j]!;
        const result = vectors[j]!;
        try {
          await embeddingRecordRepository.upsertForChunk({
            chunkId: chunk.id,
            provider: this.config.provider,
            model: this.config.model,
            dimension: result.dimension,
            vector: result.vector,
          });
          successCount += 1;
        } catch {
          failureCount += 1;
          throw new EmbeddingError(
            'EMBEDDING_PERSIST_ERROR',
            `failed to persist embedding for chunk ${chunk.id}`,
          );
        }
      }
    }

    const stats: EmbeddingStats = {
      documentVersionId,
      model: this.config.model,
      provider: this.config.provider,
      dimension: this.config.dimension,
      chunkCount,
      successCount,
      failureCount,
      durationMs: Date.now() - started,
    };
    console.log(
      JSON.stringify({
        event: 'embedding_stats',
        documentVersionId: stats.documentVersionId,
        model: stats.model,
        dimension: stats.dimension,
        chunkCount: stats.chunkCount,
        successCount: stats.successCount,
        failureCount: stats.failureCount,
        durationMs: stats.durationMs,
      }),
    );
    return stats;
  }
}
