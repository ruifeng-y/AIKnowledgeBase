import type { Document, Prisma } from '@prisma/client';
import { prisma } from '../client';

export const documentRepository = {
  findById(id: string): Promise<Document | null> {
    return prisma.document.findUnique({ where: { id } });
  },

  listByKnowledgeSpaceId(knowledgeSpaceId: string): Promise<Document[]> {
    return prisma.document.findMany({
      where: { knowledgeSpaceId },
      orderBy: { createdAt: 'desc' },
    });
  },

  create(data: Prisma.DocumentCreateInput): Promise<Document> {
    return prisma.document.create({ data });
  },
};
