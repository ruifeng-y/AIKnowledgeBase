import { describe, expect, it } from 'vitest';
import { Argon2PasswordService } from '../../../infrastructure/auth/argon2-password.service';
import { AuthorizationService } from './authorization.service';

describe('AuthorizationService', () => {
  const workspaceA = {
    id: 'ws-a',
    name: 'A',
    slug: 'ws-a',
    description: null,
    ownerId: 'user-a',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const spaceB = {
    id: 'space-b',
    workspaceId: 'ws-b',
    name: 'B',
    slug: 'space-b',
    description: null,
    settings: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it('returns owned workspace', async () => {
    const service = new AuthorizationService(
      {
        findOwnedById: async (id, owner) =>
          id === 'ws-a' && owner === 'user-a' ? workspaceA : null,
      },
      {
        findOwnedById: async (id, owner) =>
          id === 'space-b' && owner === 'user-b' ? spaceB : null,
      },
    );
    await expect(service.assertWorkspaceOwner('user-a', 'ws-a')).resolves.toEqual(workspaceA);
  });

  it('throws 404 for cross-tenant workspace', async () => {
    const service = new AuthorizationService(
      {
        findOwnedById: async (id, owner) =>
          id === 'ws-a' && owner === 'user-a' ? workspaceA : null,
      },
      { findOwnedById: async () => null },
    );
    await expect(service.assertWorkspaceOwner('user-b', 'ws-a')).rejects.toMatchObject({
      httpStatus: 404,
      code: 'WORKSPACE_NOT_FOUND',
    });
  });

  it('throws 404 for cross-tenant space', async () => {
    const service = new AuthorizationService(
      { findOwnedById: async () => null },
      {
        findOwnedById: async (id, owner) =>
          id === 'space-b' && owner === 'user-b' ? spaceB : null,
      },
    );
    await expect(service.assertSpaceOwner('user-a', 'space-b')).rejects.toMatchObject({
      httpStatus: 404,
      code: 'KNOWLEDGE_SPACE_NOT_FOUND',
    });
  });
});

describe('password service smoke', () => {
  it('argon2 hash is not plaintext', async () => {
    const svc = new Argon2PasswordService();
    const hash = await svc.hash('password123');
    expect(hash).not.toEqual('password123');
  });
});
