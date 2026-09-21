/** API key domain port — no key generation/auth middleware in V0.4-D. */

export const API_KEY_REPOSITORY = Symbol('API_KEY_REPOSITORY');

export interface ApiKeyRecord {
  id: string;
  workspaceId: string;
  name: string;
  keyHash: string;
  keyPrefix: string;
  revokedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
}

export interface ApiKeyRepositoryPort {
  findByKeyHash(keyHash: string): Promise<ApiKeyRecord | null>;
  listByWorkspaceId(workspaceId: string): Promise<ApiKeyRecord[]>;
}
