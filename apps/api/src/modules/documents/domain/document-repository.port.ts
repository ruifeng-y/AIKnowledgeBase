/** Domain ports must not import NestJS, Prisma, or infrastructure SDKs. */

export interface DocumentRecord {
  id: string;
  knowledgeSpaceId: string;
  title: string;
  sourceType: 'UPLOAD' | 'URL' | 'GITHUB' | 'NOTION' | 'TEXT';
  sourceUri: string | null;
  mimeType: string | null;
  status: 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED' | 'ARCHIVED';
  currentVersionId: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export const DOCUMENT_REPOSITORY = Symbol('DOCUMENT_REPOSITORY');

export interface DocumentRepositoryPort {
  findById(id: string): Promise<DocumentRecord | null>;
  listByKnowledgeSpaceId(knowledgeSpaceId: string): Promise<DocumentRecord[]>;
}
