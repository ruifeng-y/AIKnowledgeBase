export interface ProcessingJobRecord {
  id: string;
  documentId: string;
  documentVersionId: string | null;
  status: string;
  attempts: number;
  error: string | null;
}

export const PROCESSING_JOB_REPOSITORY = Symbol('PROCESSING_JOB_REPOSITORY');

export interface ProcessingJobRepositoryPort {
  create(input: {
    knowledgeSpaceId: string;
    documentId: string;
    documentVersionId: string;
  }): Promise<ProcessingJobRecord>;
  findLatestByDocumentId(documentId: string): Promise<ProcessingJobRecord | null>;
  hasActiveJob(documentVersionId: string): Promise<ProcessingJobRecord | null>;
}
