/** Domain ports must not import NestJS, Prisma, or infrastructure SDKs. */

export interface WorkspaceRecord {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
}

export const WORKSPACE_REPOSITORY = Symbol('WORKSPACE_REPOSITORY');

export interface WorkspaceRepositoryPort {
  findById(id: string): Promise<WorkspaceRecord | null>;
  findBySlug(slug: string): Promise<WorkspaceRecord | null>;
  listByOwnerId(ownerId: string): Promise<WorkspaceRecord[]>;
}
