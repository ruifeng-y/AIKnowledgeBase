/** Domain ports must not import NestJS, Prisma, or infrastructure SDKs. */

export type DocumentSourceType = 'UPLOAD' | 'URL' | 'GITHUB' | 'NOTION' | 'TEXT';
export type DocumentStatusValue = 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED' | 'ARCHIVED';

export interface DocumentVersionRecord {
  id: string;
  documentId: string;
  version: number;
  storageKey: string;
  contentHash: string;
  fileSize: number;
  mimeType: string | null;
  createdAt: Date;
}

export interface DocumentRecord {
  id: string;
  knowledgeSpaceId: string;
  title: string;
  sourceType: DocumentSourceType;
  sourceUri: string | null;
  mimeType: string | null;
  status: DocumentStatusValue;
  currentVersionId: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateDocumentInput {
  title: string;
  sourceType?: DocumentSourceType;
  sourceUri?: string | null;
  mimeType?: string | null;
  status?: DocumentStatusValue;
  metadata?: Record<string, unknown>;
}

export interface UpdateDocumentInput {
  title?: string;
  metadata?: Record<string, unknown>;
  status?: DocumentStatusValue;
  mimeType?: string | null;
  currentVersionId?: string | null;
}

export interface CreateDocumentVersionInput {
  version: number;
  storageKey: string;
  contentHash: string;
  fileSize: number;
  mimeType: string | null;
}

export const DOCUMENT_REPOSITORY = Symbol('DOCUMENT_REPOSITORY');

export interface DocumentRepositoryPort {
  create(knowledgeSpaceId: string, input: CreateDocumentInput): Promise<DocumentRecord>;
  findById(id: string): Promise<DocumentRecord | null>;
  findOwnedById(documentId: string, ownerId: string): Promise<DocumentRecord | null>;
  listByKnowledgeSpaceId(knowledgeSpaceId: string): Promise<DocumentRecord[]>;
  listOwnedByKnowledgeSpaceId(knowledgeSpaceId: string, ownerId: string): Promise<DocumentRecord[]>;
  updateOwned(
    documentId: string,
    ownerId: string,
    input: UpdateDocumentInput,
  ): Promise<DocumentRecord>;
  deleteOwned(documentId: string, ownerId: string): Promise<void>;
  createVersion(
    documentId: string,
    input: CreateDocumentVersionInput,
  ): Promise<DocumentVersionRecord>;
  listVersions(documentId: string): Promise<DocumentVersionRecord[]>;
  findVersionById(versionId: string): Promise<DocumentVersionRecord | null>;
  findOwnedDocumentWithVersions(
    documentId: string,
    ownerId: string,
  ): Promise<{ document: DocumentRecord; versions: DocumentVersionRecord[] } | null>;
}
