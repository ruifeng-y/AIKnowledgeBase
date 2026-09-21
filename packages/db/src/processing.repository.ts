import type { Prisma } from '@prisma/client';
import { prisma } from './client';

export const processingJobRepository = {
  create(data: {
    knowledgeSpaceId: string;
    documentId: string;
    documentVersionId: string | null;
    type: 'PARSE' | 'CHUNK' | 'EMBED' | 'INDEX';
    status?: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
    payload?: Record<string, unknown>;
  }) {
    return prisma.processingJob.create({
      data: {
        knowledgeSpaceId: data.knowledgeSpaceId,
        documentId: data.documentId,
        documentVersionId: data.documentVersionId,
        type: data.type,
        status: data.status ?? 'PENDING',
        payload: (data.payload ?? {}) as object,
        attempts: 0,
      },
    });
  },

  findById(id: string) {
    return prisma.processingJob.findUnique({ where: { id } });
  },

  findLatestByDocumentId(documentId: string) {
    return prisma.processingJob.findFirst({
      where: { documentId },
      orderBy: { createdAt: 'desc' },
    });
  },

  hasActiveJob(documentVersionId: string) {
    return prisma.processingJob.findFirst({
      where: {
        documentVersionId,
        status: { in: ['PENDING', 'PROCESSING'] },
        type: 'PARSE',
      },
    });
  },

  async markProcessing(id: string) {
    return prisma.processingJob.update({
      where: { id },
      data: {
        status: 'PROCESSING',
        startedAt: new Date(),
        attempts: { increment: 1 },
        error: null,
      },
    });
  },

  async markCompleted(id: string) {
    return prisma.processingJob.update({
      where: { id },
      data: { status: 'COMPLETED', completedAt: new Date(), error: null },
    });
  },

  async markFailed(id: string, error: string) {
    return prisma.processingJob.update({
      where: { id },
      data: { status: 'FAILED', completedAt: new Date(), error },
    });
  },
};

export const documentSectionRepository = {
  async replaceForVersion(
    documentVersionId: string,
    sections: Array<{
      heading: string;
      level: number;
      sectionOrder: number;
      content: string;
      metadata?: Record<string, unknown>;
    }>,
  ) {
    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.documentSection.deleteMany({ where: { documentVersionId } });
      if (sections.length === 0) {
        return [] as Array<{ id: string }>;
      }
      const created = [] as Array<{ id: string }>;
      for (const section of sections) {
        const row = await tx.documentSection.create({
          data: {
            documentVersionId,
            heading: section.heading,
            level: section.level,
            sectionOrder: section.sectionOrder,
            content: section.content,
            metadata: (section.metadata ?? {}) as object,
          },
          select: { id: true },
        });
        created.push(row);
      }
      return created;
    });
  },

  listByVersionId(documentVersionId: string) {
    return prisma.documentSection.findMany({
      where: { documentVersionId },
      orderBy: { sectionOrder: 'asc' },
    });
  },

  countByVersionId(documentVersionId: string) {
    return prisma.documentSection.count({ where: { documentVersionId } });
  },
};

export const documentProcessingRepository = {
  findVersionContext(documentVersionId: string) {
    return prisma.documentVersion.findUnique({
      where: { id: documentVersionId },
      include: { document: true },
    });
  },

  async setDocumentStatus(
    documentId: string,
    status: 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED',
  ) {
    return prisma.document.update({
      where: { id: documentId },
      data: { status },
    });
  },
};
