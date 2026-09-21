export interface WorkspaceRecord {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateWorkspaceInput {
  name: string;
  slug: string;
}

export interface UpdateWorkspaceInput {
  name?: string;
  slug?: string;
}

export const WORKSPACE_REPOSITORY = Symbol('WORKSPACE_REPOSITORY');

export interface WorkspaceRepositoryPort {
  create(ownerId: string, input: CreateWorkspaceInput): Promise<WorkspaceRecord>;
  findByOwnerId(ownerId: string): Promise<WorkspaceRecord[]>;
  findOwnedById(workspaceId: string, ownerId: string): Promise<WorkspaceRecord | null>;
  findBySlug(slug: string): Promise<WorkspaceRecord | null>;
  updateOwned(
    workspaceId: string,
    ownerId: string,
    input: UpdateWorkspaceInput,
  ): Promise<WorkspaceRecord>;
  deleteOwned(workspaceId: string, ownerId: string): Promise<void>;
}
