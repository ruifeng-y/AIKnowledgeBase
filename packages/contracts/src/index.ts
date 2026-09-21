export interface HealthResponse {
  status: 'ok';
}

export function isHealthResponse(value: unknown): value is HealthResponse {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  return (value as { status?: unknown }).status === 'ok';
}

export const DOCUMENT_PROCESS_JOB_NAME = 'DOCUMENT_PROCESS';

export interface DocumentProcessJobPayload {
  documentId: string;
  documentVersionId: string;
  jobId?: string;
}

export type DocumentStatusValue = 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED' | 'ARCHIVED';

export interface ProcessingStatusResponse {
  documentId: string;
  versionId: string | null;
  documentStatus: DocumentStatusValue;
  jobStatus: string | null;
  attempts: number;
  errorCode: string | null;
  errorMessage: string | null;
}
