/** Domain ports must not import NestJS, Prisma, or infrastructure SDKs. */

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

export const KNOWLEDGE_SPACE_REPOSITORY = Symbol('KNOWLEDGE_SPACE_REPOSITORY');

export interface KnowledgeSpaceRepositoryPort {
  findById(id: string): Promise<KnowledgeSpaceRecord | null>;
  findByWorkspaceIdAndSlug(workspaceId: string, slug: string): Promise<KnowledgeSpaceRecord | null>;
  listByWorkspaceId(workspaceId: string): Promise<KnowledgeSpaceRecord[]>;
}
