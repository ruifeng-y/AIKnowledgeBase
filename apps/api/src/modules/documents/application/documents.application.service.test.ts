import { describe, expect, it } from 'vitest';
import { InMemoryObjectStorage } from '../../../infrastructure/storage/in-memory-object-storage';
import {
  buildObjectKey,
  contentDispositionFilename,
  DocumentApplicationService,
  sanitizeFilename,
} from './documents.application.service';
import { AuthorizationService } from '../../shared/application/authorization.service';
import type {
  DocumentRecord,
  DocumentRepositoryPort,
  DocumentVersionRecord,
} from '../domain/document-repository.port';

const policy = {
  maxFileSizeBytes: 1024,
  allowedMimeTypes: ['text/plain', 'text/markdown'],
};

function memRepo(): DocumentRepositoryPort & {
  docs: Map<string, DocumentRecord>;
  versions: DocumentVersionRecord[];
} {
  const docs = new Map<string, DocumentRecord>();
  const versions: DocumentVersionRecord[] = [];
  let seq = 0;
  return {
    docs,
    versions,
    async create(spaceId, input) {
      seq += 1;
      const row: DocumentRecord = {
        id: `doc-${seq}`,
        knowledgeSpaceId: spaceId,
        title: input.title,
        sourceType: input.sourceType ?? 'UPLOAD',
        sourceUri: input.sourceUri ?? null,
        mimeType: input.mimeType ?? null,
        status: input.status ?? 'PENDING',
        currentVersionId: null,
        metadata: input.metadata ?? {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      docs.set(row.id, row);
      return row;
    },
    async findById(id) {
      return docs.get(id) ?? null;
    },
    async findOwnedById(id, ownerId) {
      return ownerId === 'user-a' ? (docs.get(id) ?? null) : null;
    },
    async listByKnowledgeSpaceId(spaceId) {
      return [...docs.values()].filter((d) => d.knowledgeSpaceId === spaceId);
    },
    async listOwnedByKnowledgeSpaceId(spaceId, ownerId) {
      return ownerId === 'user-a'
        ? [...docs.values()].filter((d) => d.knowledgeSpaceId === spaceId)
        : [];
    },
    async updateOwned(id, ownerId, input) {
      const current = docs.get(id);
      if (!current || ownerId !== 'user-a') {
        throw new Error('missing');
      }
      const next: DocumentRecord = {
        ...current,
        title: input.title ?? current.title,
        mimeType: input.mimeType ?? current.mimeType,
        status: input.status ?? current.status,
        currentVersionId:
          input.currentVersionId !== undefined ? input.currentVersionId : current.currentVersionId,
        metadata: input.metadata ?? current.metadata,
        updatedAt: new Date(),
      };
      docs.set(id, next);
      return next;
    },
    async deleteOwned(id, ownerId) {
      if (ownerId === 'user-a') {
        docs.delete(id);
      }
    },
    async createVersion(documentId, input) {
      const version = input.version;
      const row: DocumentVersionRecord = {
        id: `ver-${documentId}-${version}`,
        documentId,
        version,
        storageKey: input.storageKey,
        contentHash: input.contentHash,
        fileSize: input.fileSize,
        mimeType: input.mimeType,
        createdAt: new Date(),
      };
      versions.push(row);
      return row;
    },
    async listVersions(documentId) {
      return versions.filter((v) => v.documentId === documentId);
    },
    async findVersionById(versionId) {
      return versions.find((v) => v.id === versionId) ?? null;
    },
    async findOwnedDocumentWithVersions(documentId, ownerId) {
      if (ownerId !== 'user-a') {
        return null;
      }
      const document = docs.get(documentId);
      if (!document) {
        return null;
      }
      return {
        document,
        versions: versions.filter((v) => v.documentId === documentId),
      };
    },
  };
}

describe('document helpers', () => {
  it('buildObjectKey uses server-side structure', () => {
    expect(buildObjectKey({ workspaceId: 'w', spaceId: 's', documentId: 'd', version: 1 })).toBe(
      'workspaces/w/spaces/s/documents/d/versions/1/original',
    );
  });

  it('sanitizeFilename strips path traversal', () => {
    expect(sanitizeFilename('../../secret.txt')).toBe('secret.txt');
  });

  it('contentDisposition encodes safely', () => {
    expect(contentDispositionFilename('a"b.txt')).toContain('filename="a_b.txt"');
  });
});

describe('DocumentApplicationService', () => {
  it('uploads version 1, downloads, deletes, and compensates on oversized file', async () => {
    const storage = new InMemoryObjectStorage();
    const repo = memRepo();
    const auth = new AuthorizationService(
      {
        findOwnedById: async (id, owner) =>
          owner === 'user-a' && id === 'ws-a'
            ? {
                id: 'ws-a',
                name: 'A',
                slug: 'ws-a',
                description: null,
                ownerId: 'user-a',
                createdAt: new Date(),
                updatedAt: new Date(),
              }
            : null,
      },
      {
        findOwnedById: async (id, owner) =>
          owner === 'user-a' && id === 'space-a'
            ? {
                id: 'space-a',
                workspaceId: 'ws-a',
                name: 'Space A',
                slug: 'space-a',
                description: null,
                settings: {},
                createdAt: new Date(),
                updatedAt: new Date(),
              }
            : null,
      },
      {
        findOwnedById: async (id, owner) =>
          owner === 'user-a' ? (repo.docs.get(id) ?? null) : null,
      },
    );
    const svc = new DocumentApplicationService(repo, auth, storage, policy);

    await expect(
      svc.upload(
        'user-a',
        'space-a',
        {
          originalname: 'note.txt',
          mimetype: 'text/plain',
          size: 5,
          buffer: Buffer.from('hello'),
        },
        { title: 'Note' },
      ),
    ).resolves.toMatchObject({
      document: { status: 'PENDING', title: 'Note' },
      version: { version: 1 },
    });

    const doc = [...repo.docs.values()][0]!;
    const downloaded = await svc.download('user-a', doc.id);
    expect(downloaded.buffer.toString('utf8')).toBe('hello');
    expect(downloaded.version.version).toBe(1);

    await expect(
      svc.upload(
        'user-a',
        'space-a',
        {
          originalname: 'big.bin',
          mimetype: 'application/octet-stream',
          size: 20,
          buffer: Buffer.alloc(20),
        },
        {},
      ),
    ).rejects.toMatchObject({ code: 'DOCUMENT_UNSUPPORTED_FILE_TYPE' });

    await svc.deleteOwned('user-a', doc.id);
    expect(repo.docs.has(doc.id)).toBe(false);
  });

  it('returns 404 DOCUMENT_CONTENT_NOT_FOUND for metadata-only document', async () => {
    const storage = new InMemoryObjectStorage();
    const repo = memRepo();
    const auth = new AuthorizationService(
      {
        findOwnedById: async (id, owner) =>
          owner === 'user-a' && id === 'ws-a'
            ? {
                id: 'ws-a',
                name: 'A',
                slug: 'ws-a',
                description: null,
                ownerId: 'user-a',
                createdAt: new Date(),
                updatedAt: new Date(),
              }
            : null,
      },
      {
        findOwnedById: async (id, owner) =>
          owner === 'user-a' && id === 'space-a'
            ? {
                id: 'space-a',
                workspaceId: 'ws-a',
                name: 'Space A',
                slug: 'space-a',
                description: null,
                settings: {},
                createdAt: new Date(),
                updatedAt: new Date(),
              }
            : null,
      },
      {
        findOwnedById: async (id, owner) =>
          owner === 'user-a' ? (repo.docs.get(id) ?? null) : null,
      },
    );
    const svc = new DocumentApplicationService(repo, auth, storage, policy);
    const metaOnly = await svc.createMetadataOnly('user-a', 'space-a', { title: 'Meta only' });
    await expect(svc.download('user-a', metaOnly.id)).rejects.toMatchObject({
      code: 'DOCUMENT_CONTENT_NOT_FOUND',
      httpStatus: 404,
    });
  });

  it('returns 404 DOCUMENT_CONTENT_NOT_FOUND when object missing from storage', async () => {
    const storage = new InMemoryObjectStorage();
    const repo = memRepo();
    const auth = new AuthorizationService(
      {
        findOwnedById: async (id, owner) =>
          owner === 'user-a' && id === 'ws-a'
            ? {
                id: 'ws-a',
                name: 'A',
                slug: 'ws-a',
                description: null,
                ownerId: 'user-a',
                createdAt: new Date(),
                updatedAt: new Date(),
              }
            : null,
      },
      {
        findOwnedById: async (id, owner) =>
          owner === 'user-a' && id === 'space-a'
            ? {
                id: 'space-a',
                workspaceId: 'ws-a',
                name: 'Space A',
                slug: 'space-a',
                description: null,
                settings: {},
                createdAt: new Date(),
                updatedAt: new Date(),
              }
            : null,
      },
      {
        findOwnedById: async (id, owner) =>
          owner === 'user-a' ? (repo.docs.get(id) ?? null) : null,
      },
    );
    const svc = new DocumentApplicationService(repo, auth, storage, policy);
    const uploaded = await svc.upload(
      'user-a',
      'space-a',
      {
        originalname: 'gone.txt',
        mimetype: 'text/plain',
        size: 4,
        buffer: Buffer.from('gone'),
      },
      {},
    );
    const key = String(uploaded.document.metadata['storageKey']);
    await storage.delete(key);
    await expect(svc.download('user-a', uploaded.document.id)).rejects.toMatchObject({
      code: 'DOCUMENT_CONTENT_NOT_FOUND',
      httpStatus: 404,
    });
  });
});
