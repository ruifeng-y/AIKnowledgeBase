import { Injectable } from '@nestjs/common';
import { documentRepository, prisma } from '@akb/db';
import type {
  CreateDocumentInput,
  CreateDocumentVersionInput,
  DocumentRecord,
  DocumentRepositoryPort,
  DocumentVersionRecord,
  UpdateDocumentInput,
} from '../../modules/documents/domain/document-repository.port';

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function mapDocument(row: {
  id: string;
  knowledgeSpaceId: string;
  title: string;
  sourceType: string;
  sourceUri: string | null;
  mimeType: string | null;
  status: string;
  currentVersionId: string | null;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}): DocumentRecord {
  return {
    id: row.id,
    knowledgeSpaceId: row.knowledgeSpaceId,
    title: row.title,
    sourceType: row.sourceType as DocumentRecord['sourceType'],
    sourceUri: row.sourceUri,
    mimeType: row.mimeType,
    status: row.status as DocumentRecord['status'],
    currentVersionId: row.currentVersionId,
    metadata: asRecord(row.metadata),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapVersion(row: {
  id: string;
  documentId: string;
  version: number;
  storageKey: string;
  contentHash: string;
  fileSize: bigint | number;
  mimeType: string | null;
  createdAt: Date;
}): DocumentVersionRecord {
  return {
    id: row.id,
    documentId: row.documentId,
    version: row.version,
    storageKey: row.storageKey,
    contentHash: row.contentHash,
    fileSize: Number(row.fileSize),
    mimeType: row.mimeType,
    createdAt: row.createdAt,
  };
}

@Injectable()
export class DocumentRepositoryAdapter implements DocumentRepositoryPort {
  async create(knowledgeSpaceId: string, input: CreateDocumentInput): Promise<DocumentRecord> {
    const row = await documentRepository.create({
      title: input.title,
      sourceType: input.sourceType ?? 'UPLOAD',
      sourceUri: input.sourceUri ?? null,
      mimeType: input.mimeType ?? null,
      status: input.status ?? 'PENDING',
      metadata: (input.metadata ?? {}) as object,
      knowledgeSpace: { connect: { id: knowledgeSpaceId } },
    });
    return mapDocument(row);
  }

  async findById(id: string): Promise<DocumentRecord | null> {
    const row = await documentRepository.findById(id);
    return row ? mapDocument(row) : null;
  }

  async findOwnedById(documentId: string, ownerId: string): Promise<DocumentRecord | null> {
    const row = await prisma.document.findFirst({
      where: { id: documentId, knowledgeSpace: { workspace: { ownerId } } },
    });
    return row ? mapDocument(row) : null;
  }

  async listByKnowledgeSpaceId(knowledgeSpaceId: string): Promise<DocumentRecord[]> {
    const rows = await documentRepository.listByKnowledgeSpaceId(knowledgeSpaceId);
    return rows.map(mapDocument);
  }

  async listOwnedByKnowledgeSpaceId(
    knowledgeSpaceId: string,
    ownerId: string,
  ): Promise<DocumentRecord[]> {
    const rows = await prisma.document.findMany({
      where: { knowledgeSpaceId, knowledgeSpace: { workspace: { ownerId } } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(mapDocument);
  }

  async updateOwned(
    documentId: string,
    ownerId: string,
    input: UpdateDocumentInput,
  ): Promise<DocumentRecord> {
    const owned = await this.findOwnedById(documentId, ownerId);
    if (!owned) {
      throw new Error('Ownership mismatch');
    }
    const data: Record<string, unknown> = {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.mimeType !== undefined ? { mimeType: input.mimeType } : {}),
      ...(input.currentVersionId !== undefined ? { currentVersionId: input.currentVersionId } : {}),
    };
    const row = await prisma.document.update({
      where: { id: documentId },
      data,
    });
    return mapDocument(row);
  }

  async deleteOwned(documentId: string, ownerId: string): Promise<void> {
    await prisma.document.deleteMany({
      where: { id: documentId, knowledgeSpace: { workspace: { ownerId } } },
    });
  }

  async createVersion(
    documentId: string,
    input: CreateDocumentVersionInput,
  ): Promise<DocumentVersionRecord> {
    const row = await prisma.documentVersion.create({
      data: {
        documentId,
        version: input.version,
        storageKey: input.storageKey,
        contentHash: input.contentHash,
        fileSize: BigInt(input.fileSize),
        mimeType: input.mimeType,
      },
    });
    return mapVersion(row);
  }

  async listVersions(documentId: string): Promise<DocumentVersionRecord[]> {
    const rows = await prisma.documentVersion.findMany({
      where: { documentId },
      orderBy: { version: 'asc' },
    });
    return rows.map(mapVersion);
  }

  async findVersionById(versionId: string): Promise<DocumentVersionRecord | null> {
    const row = await prisma.documentVersion.findUnique({ where: { id: versionId } });
    return row ? mapVersion(row) : null;
  }

  async findOwnedDocumentWithVersions(
    documentId: string,
    ownerId: string,
  ): Promise<{ document: DocumentRecord; versions: DocumentVersionRecord[] } | null> {
    const row = await prisma.document.findFirst({
      where: { id: documentId, knowledgeSpace: { workspace: { ownerId } } },
      include: { versions: { orderBy: { version: 'asc' } } },
    });
    if (!row) {
      return null;
    }
    return {
      document: mapDocument(row),
      versions: row.versions.map(mapVersion),
    };
  }
}
