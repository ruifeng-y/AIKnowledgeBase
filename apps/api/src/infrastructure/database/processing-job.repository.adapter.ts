import { Injectable } from '@nestjs/common';
import { processingJobRepository } from '@akb/db';
import type {
  ProcessingJobRecord,
  ProcessingJobRepositoryPort,
} from '../../modules/documents/domain/processing-job.repository.port';

function mapJob(row: {
  id: string;
  documentId: string;
  documentVersionId: string | null;
  status: string;
  attempts: number;
  error: string | null;
}): ProcessingJobRecord {
  return {
    id: row.id,
    documentId: row.documentId,
    documentVersionId: row.documentVersionId,
    status: row.status,
    attempts: row.attempts,
    error: row.error,
  };
}

@Injectable()
export class ProcessingJobRepositoryAdapter implements ProcessingJobRepositoryPort {
  async create(input: {
    knowledgeSpaceId: string;
    documentId: string;
    documentVersionId: string;
  }): Promise<ProcessingJobRecord> {
    const row = await processingJobRepository.create({
      knowledgeSpaceId: input.knowledgeSpaceId,
      documentId: input.documentId,
      documentVersionId: input.documentVersionId,
      type: 'PARSE',
      status: 'PENDING',
      payload: { kind: 'DOCUMENT_PROCESS' },
    });
    return mapJob(row);
  }

  async findLatestByDocumentId(documentId: string): Promise<ProcessingJobRecord | null> {
    const row = await processingJobRepository.findLatestByDocumentId(documentId);
    return row ? mapJob(row) : null;
  }

  async hasActiveJob(documentVersionId: string): Promise<ProcessingJobRecord | null> {
    const row = await processingJobRepository.hasActiveJob(documentVersionId);
    return row ? mapJob(row) : null;
  }
}
