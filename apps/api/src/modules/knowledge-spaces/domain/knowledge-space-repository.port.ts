export interface KnowledgeSpaceRecord {
  id: string;
  workspaceId: string;
  name: string;
  slug: string;
  description: string | null;
  settings: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateKnowledgeSpaceInput {
  name: string;
  slug: string;
  description?: string | null;
}

export interface UpdateKnowledgeSpaceInput {
  name?: string;
  slug?: string;
  description?: string | null;
  settings?: Record<string, unknown>;
}

export const KNOWLEDGE_SPACE_REPOSITORY = Symbol('KNOWLEDGE_SPACE_REPOSITORY');

export interface KnowledgeSpaceRepositoryPort {
  create(workspaceId: string, input: CreateKnowledgeSpaceInput): Promise<KnowledgeSpaceRecord>;
  findByWorkspaceId(workspaceId: string): Promise<KnowledgeSpaceRecord[]>;
  findOwnedById(spaceId: string, ownerId: string): Promise<KnowledgeSpaceRecord | null>;
  findByWorkspaceIdAndSlug(workspaceId: string, slug: string): Promise<KnowledgeSpaceRecord | null>;
  updateOwned(
    spaceId: string,
    ownerId: string,
    input: UpdateKnowledgeSpaceInput,
  ): Promise<KnowledgeSpaceRecord>;
  deleteOwned(spaceId: string, ownerId: string): Promise<void>;
}
