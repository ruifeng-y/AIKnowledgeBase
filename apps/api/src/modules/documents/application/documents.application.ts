/** Application layer may only depend on domain ports, not infrastructure SDKs. */
export type { DocumentRepositoryPort, DocumentRecord } from '../domain/document-repository.port';
export { DOCUMENT_REPOSITORY } from '../domain/document-repository.port';
