import type { KnowledgeSpace, Prisma } from '@prisma/client';
import { prisma } from '../client';

export const knowledgeSpaceRepository = {
  findById(id: string): Promise<KnowledgeSpace | null> {
    return prisma.knowledgeSpace.findUnique({ where: { id } });
  },

  findByWorkspaceIdAndSlug(workspaceId: string, slug: string): Promise<KnowledgeSpace | null> {
    return prisma.knowledgeSpace.findUnique({
      where: { workspaceId_slug: { workspaceId, slug } },
    });
  },

  listByWorkspaceId(workspaceId: string): Promise<KnowledgeSpace[]> {
    return prisma.knowledgeSpace.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
    });
  },

  create(data: Prisma.KnowledgeSpaceCreateInput): Promise<KnowledgeSpace> {
    return prisma.knowledgeSpace.create({ data });
  },
};
