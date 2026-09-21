import { DOCUMENT_PROCESS_JOB_NAME, type DocumentProcessJobPayload } from '@akb/contracts';
import { documentVersionNotFound } from '../../../common/errors/app-errors';
import type { JobQueuePort } from '../../../infrastructure/queue/job-queue.port';
import type { AuthorizationService } from '../../shared/application/authorization.service';
import type { DocumentRecord, DocumentVersionRecord } from '../domain/document-repository.port';
import type { ProcessingJobRepositoryPort } from '../domain/processing-job.repository.port';

export interface ProcessingStatusView {
  documentId: string;
  versionId: string | null;
  documentStatus: string;
  jobStatus: string | null;
  attempts: number;
  errorCode: string | null;
  errorMessage: string | null;
}

export class DocumentProcessingApplicationService {
  constructor(
    private readonly authorization: AuthorizationService,
    private readonly queue: JobQueuePort,
    private readonly jobs: ProcessingJobRepositoryPort,
  ) {}

  private async enqueueProcessJob(input: {
    knowledgeSpaceId: string;
    documentId: string;
    documentVersionId: string;
  }): Promise<void> {
    const active = await this.jobs.hasActiveJob(input.documentVersionId);
    if (active) {
      return;
    }
    const job = await this.jobs.create(input);
    const payload: DocumentProcessJobPayload = {
      documentId: input.documentId,
      documentVersionId: input.documentVersionId,
      jobId: job.id,
    };
    await this.queue.enqueue({
      queue: 'document-processing',
      name: DOCUMENT_PROCESS_JOB_NAME,
      payload,
    });
  }

  async afterUploadCreated(input: {
    knowledgeSpaceId: string;
    document: DocumentRecord;
    version: DocumentVersionRecord | null;
  }): Promise<void> {
    if (!input.version) {
      return;
    }
    await this.enqueueProcessJob({
      knowledgeSpaceId: input.knowledgeSpaceId,
      documentId: input.document.id,
      documentVersionId: input.version.id,
    });
  }

  async getStatus(userId: string, documentId: string): Promise<ProcessingStatusView> {
    const document = await this.authorization.assertDocumentOwner(userId, documentId);
    const latest = await this.jobs.findLatestByDocumentId(documentId);
    const errorCode = latest?.error ? (String(latest.error).split(':')[0] ?? null) : null;
    return {
      documentId,
      versionId: document.currentVersionId,
      documentStatus: document.status,
      jobStatus: latest?.status ?? null,
      attempts: latest?.attempts ?? 0,
      errorCode,
      errorMessage: latest?.error ?? null,
    };
  }

  async reprocess(
    userId: string,
    documentId: string,
  ): Promise<ProcessingStatusView & { enqueued: boolean }> {
    const document = await this.authorization.assertDocumentOwner(userId, documentId);
    if (!document.currentVersionId) {
      throw documentVersionNotFound();
    }
    const active = await this.jobs.hasActiveJob(document.currentVersionId);
    if (active || document.status === 'PROCESSING') {
      return { ...(await this.getStatus(userId, documentId)), enqueued: false };
    }

    await this.enqueueProcessJob({
      knowledgeSpaceId: document.knowledgeSpaceId,
      documentId: document.id,
      documentVersionId: document.currentVersionId,
    });

    return { ...(await this.getStatus(userId, documentId)), enqueued: true };
  }
}
