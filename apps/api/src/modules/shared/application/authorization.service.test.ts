import { describe, expect, it } from 'vitest';
import { AuthorizationService } from './authorization.service';

const workspaceA = {
  id: 'ws-a',
  name: 'A',
  slug: 'ws-a',
  description: null,
  ownerId: 'user-a',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const spaceA = {
  id: 'space-a',
  workspaceId: 'ws-a',
  name: 'Space A',
  slug: 'space-a',
  description: null,
  settings: {},
  createdAt: new Date(),
  updatedAt: new Date(),
};

const documentB = {
  id: 'doc-b',
  knowledgeSpaceId: 'space-b',
  title: 'Doc B',
  sourceType: 'UPLOAD' as const,
  sourceUri: null,
  mimeType: 'text/plain',
  status: 'READY' as const,
  currentVersionId: null,
  metadata: {},
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('AuthorizationService document tenancy', () => {
  it('allows owner document access', async () => {
    const service = new AuthorizationService(
      {
        findOwnedById: async (id, owner) =>
          id === 'ws-a' && owner === 'user-a' ? workspaceA : null,
      },
      {
        findOwnedById: async (id, owner) =>
          id === 'space-a' && owner === 'user-a' ? spaceA : null,
      },
      {
        findOwnedById: async (id, owner) =>
          id === 'doc-a' && owner === 'user-a'
            ? { ...documentB, id: 'doc-a', knowledgeSpaceId: 'space-a' }
            : null,
      },
    );
    await expect(service.assertDocumentOwner('user-a', 'doc-a')).resolves.toMatchObject({
      id: 'doc-a',
    });
  });

  it('returns 404 for cross-tenant document', async () => {
    const service = new AuthorizationService(
      { findOwnedById: async () => null },
      { findOwnedById: async () => null },
      {
        findOwnedById: async (id, owner) =>
          id === 'doc-b' && owner === 'user-b' ? documentB : null,
      },
    );
    await expect(service.assertDocumentOwner('user-a', 'doc-b')).rejects.toMatchObject({
      httpStatus: 404,
      code: 'DOCUMENT_NOT_FOUND',
    });
  });
});

describe('buildObjectKey / sanitizeFilename', () => {
  it('builds server-side object keys without user path input', async () => {
    const mod = await import('../../documents/application/documents.application.service');
    const key = mod.buildObjectKey({
      workspaceId: 'w1',
      spaceId: 's1',
      documentId: 'd1',
      version: 2,
    });
    expect(key).toBe('workspaces/w1/spaces/s1/documents/d1/versions/2/original');
  });

  it('sanitizes unsafe filenames', async () => {
    const mod = await import('../../documents/application/documents.application.service');
    expect(mod.sanitizeFilename('../../etc/passwd')).toBe('passwd');
    expect(mod.sanitizeFilename('C:\\Windows\\secret.txt')).toBe('secret.txt');
  });
});
