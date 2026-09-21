import type { Prisma, Workspace } from '@prisma/client';
import { prisma } from '../client';

export const workspaceRepository = {
  findById(id: string): Promise<Workspace | null> {
    return prisma.workspace.findUnique({ where: { id } });
  },

  findBySlug(slug: string): Promise<Workspace | null> {
    return prisma.workspace.findUnique({ where: { slug } });
  },

  findByOwnerId(ownerId: string): Promise<Workspace[]> {
    return prisma.workspace.findMany({
      where: { ownerId },
      orderBy: { createdAt: 'desc' },
    });
  },

  create(data: Prisma.WorkspaceCreateInput): Promise<Workspace> {
    return prisma.workspace.create({ data });
  },
};
