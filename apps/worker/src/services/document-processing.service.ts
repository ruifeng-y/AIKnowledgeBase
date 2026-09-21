import {
  documentProcessingRepository,
  documentSectionQueryRepository,
  documentSectionRepository,
  knowledgeChunkRepository,
  processingJobRepository,
} from '@akb/db';
import type { ObjectStoragePort } from '../api-storage/object-storage.port';
import { ParserError } from '../parsers/parser.port';
import { parserRegistry } from '../parsers/parser-registry';
import { StructureAwareChunkingStrategy } from '../chunking/structure-aware-chunking.strategy';
import { ChunkingError, type ChunkingStats } from '../chunking/chunking.types';

export interface DocumentProcessJobPayload {
  documentId: string;
  documentVersionId: string;
  jobId?: string;
}

export class DocumentProcessingService {
  constructor(
    private readonly storage: ObjectStoragePort,
    private readonly registry = parserRegistry,
    private readonly chunking = new StructureAwareChunkingStrategy(),
  ) {}

  async process(payload: DocumentProcessJobPayload): Promise<ChunkingStats | null> {
    const { documentId, documentVersionId, jobId } = payload;
    const context = await documentProcessingRepository.findVersionContext(documentVersionId);
    if (!context || context.documentId !== documentId) {
      throw new ParserError('DOCUMENT_PROCESSING_ERROR', 'Document version not found', false);
    }

    const job =
      (jobId ? await processingJobRepository.findById(jobId) : null) ??
      (await processingJobRepository.findLatestByDocumentId(documentId));
    if (job) {
      await processingJobRepository.markProcessing(job.id);
    }
    await documentProcessingRepository.setDocumentStatus(documentId, 'PROCESSING');

    try {
      const buffer = await this.storage.get(context.storageKey);
      const filename =
        typeof context.document.metadata === 'object' &&
        context.document.metadata &&
        'originalFilename' in context.document.metadata
          ? String((context.document.metadata as Record<string, unknown>)['originalFilename'])
          : context.document.title;

      const parsed = await this.registry.parse({
        documentId,
        documentVersionId,
        mimeType: context.mimeType ?? context.document.mimeType ?? 'application/octet-stream',
        filename,
        content: buffer,
      });

      const sections = parsed.sections.map((section) => ({
        heading: section.title ?? parsed.title ?? context.document.title,
        level: section.level ?? 1,
        sectionOrder: section.order,
        content: section.content,
        metadata: { source: parsed.metadata },
      }));

      const savedSections = await documentSectionRepositoryReplace(documentVersionId, sections);

      const stats = await this.chunkFromSections({
        knowledgeSpaceId: context.document.knowledgeSpaceId,
        documentId,
        documentVersionId,
        sections: savedSections,
      });

      console.log(
        JSON.stringify({
          event: 'document_chunking',
          documentVersionId,
          sectionCount: stats.sectionCount,
          chunkCount: stats.chunkCount,
          averageTokenCount: stats.averageTokenCount,
          minTokenCount: stats.minTokenCount,
          maxTokenCount: stats.maxTokenCount,
        }),
      );

      await documentProcessingRepository.setDocumentStatus(documentId, 'READY');
      if (job) {
        await processingJobRepository.markCompleted(job.id);
      }
      return stats;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'processing failed';
      const code =
        error instanceof ParserError
          ? error.code
          : error instanceof ChunkingError
            ? error.code
            : 'DOCUMENT_PROCESSING_ERROR';
      const retryable =
        error instanceof ParserError
          ? error.retryable
          : error instanceof ChunkingError
            ? false
            : true;
      if (job) {
        await processingJobRepository.markFailed(job.id, `${code}: ${message}`);
      }
      await documentProcessingRepository.setDocumentStatus(documentId, 'FAILED');
      if (!retryable) {
        return null;
      }
      throw error;
    }
  }

  /** Re-chunk existing sections for a document version without re-parsing. */
  async chunkFromSections(input: {
    knowledgeSpaceId: string;
    documentId: string;
    documentVersionId: string;
    sections: Array<{
      id: string;
      documentVersionId: string;
      heading: string;
      level: number;
      sectionOrder: number;
      content: string;
      metadata?: unknown;
    }>;
  }): Promise<ChunkingStats> {
    const started = Date.now();
    const context = await documentProcessingRepository.findVersionContext(input.documentVersionId);
    if (!context || context.documentId !== input.documentId) {
      throw new ChunkingError(
        'DOCUMENT_CHUNK_VERSION_MISMATCH',
        'Document version context mismatch',
      );
    }

    const result = this.chunking.chunk({
      documentId: input.documentId,
      documentVersionId: input.documentVersionId,
      knowledgeSpaceId: input.knowledgeSpaceId,
      sections: input.sections.map((section) => ({
        id: section.id,
        documentVersionId: section.documentVersionId,
        title: section.heading,
        level: section.level,
        content: section.content,
        order: section.sectionOrder,
        metadata:
          section.metadata && typeof section.metadata === 'object'
            ? (section.metadata as Record<string, unknown>)
            : {},
      })),
    });

    if (input.sections.some((s) => s.documentVersionId !== input.documentVersionId)) {
      throw new ChunkingError(
        'DOCUMENT_CHUNK_VERSION_MISMATCH',
        'Section does not belong to target version',
      );
    }

    await knowledgeChunkRepository.replaceForVersion(
      input.documentVersionId,
      result.chunks.map((chunk) => ({
        knowledgeSpaceId: chunk.knowledgeSpaceId,
        documentId: chunk.documentId,
        documentVersionId: chunk.documentVersionId,
        sectionId: chunk.sectionId,
        chunkIndex: chunk.chunkIndex,
        content: chunk.content,
        tokenCount: chunk.tokenCount,
        metadata: chunk.metadata as Record<string, unknown>,
      })),
    );

    console.log(
      JSON.stringify({
        event: 'chunking_stats',
        documentVersionId: input.documentVersionId,
        sectionCount: result.stats.sectionCount,
        chunkCount: result.stats.chunkCount,
        averageTokenCount: result.stats.averageTokenCount,
        minTokenCount: result.stats.minTokenCount,
        maxTokenCount: result.stats.maxTokenCount,
        durationMs: Date.now() - started,
      }),
    );

    return result.stats;
  }

  async rechunkDocumentVersion(
    documentId: string,
    documentVersionId: string,
  ): Promise<ChunkingStats> {
    const context = await documentProcessingRepository.findVersionContext(documentVersionId);
    if (!context || context.documentId !== documentId) {
      throw new ChunkingError(
        'DOCUMENT_CHUNK_VERSION_MISMATCH',
        'Document version not found for re-chunk',
      );
    }
    const sections = await documentSectionQueryRepository.listByVersionId(documentVersionId);
    return this.chunkFromSections({
      knowledgeSpaceId: context.document.knowledgeSpaceId,
      documentId,
      documentVersionId,
      sections: sections.map((section) => ({
        id: section.id,
        documentVersionId: section.documentVersionId,
        heading: section.heading,
        level: section.level,
        sectionOrder: section.sectionOrder,
        content: section.content,
        metadata: section.metadata,
      })),
    });
  }
}

async function documentSectionRepositoryReplace(
  documentVersionId: string,
  sections: Array<{
    heading: string;
    level: number;
    sectionOrder: number;
    content: string;
    metadata?: Record<string, unknown>;
  }>,
): Promise<
  Array<{
    id: string;
    documentVersionId: string;
    heading: string;
    level: number;
    sectionOrder: number;
    content: string;
    metadata?: unknown;
  }>
> {
  await documentSectionRepository.replaceForVersion(documentVersionId, sections);
  const saved = await documentSectionQueryRepository.listByVersionId(documentVersionId);
  return saved.map((section) => ({
    id: section.id,
    documentVersionId: section.documentVersionId,
    heading: section.heading,
    level: section.level,
    sectionOrder: section.sectionOrder,
    content: section.content,
    metadata: section.metadata,
  }));
}
