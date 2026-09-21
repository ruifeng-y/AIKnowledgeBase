import {
  documentSectionRepository,
  documentProcessingRepository,
  processingJobRepository,
} from '@akb/db';
import type { ObjectStoragePort } from '../api-storage/object-storage.port';
import { ParserError } from '../parsers/parser.port';
import { parserRegistry } from '../parsers/parser-registry';

export interface DocumentProcessJobPayload {
  documentId: string;
  documentVersionId: string;
  jobId?: string;
}

export class DocumentProcessingService {
  constructor(
    private readonly storage: ObjectStoragePort,
    private readonly registry = parserRegistry,
  ) {}

  async process(payload: DocumentProcessJobPayload): Promise<void> {
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

      await documentSectionRepository.replaceForVersion(documentVersionId, sections);
      await documentProcessingRepository.setDocumentStatus(documentId, 'READY');
      if (job) {
        await processingJobRepository.markCompleted(job.id);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'processing failed';
      const code = error instanceof ParserError ? error.code : 'DOCUMENT_PROCESSING_ERROR';
      const retryable = error instanceof ParserError ? error.retryable : true;
      if (job) {
        await processingJobRepository.markFailed(job.id, `${code}: ${message}`);
      }
      if (!retryable) {
        await documentProcessingRepository.setDocumentStatus(documentId, 'FAILED');
        // Deterministic: swallow to avoid BullMQ retries.
        return;
      }
      await documentProcessingRepository.setDocumentStatus(documentId, 'FAILED');
      throw error;
    }
  }
}
