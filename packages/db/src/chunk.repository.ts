import type { Prisma } from '@prisma/client';
import { prisma } from './client';

export interface KnowledgeChunkRow {
  id: string;
  knowledgeSpaceId: string;
  documentId: string;
  documentVersionId: string;
  sectionId: string | null;
  chunkIndex: number;
  content: string;
  tokenCount: number | null;
  metadata: Record<string, unknown>;
}

export interface ChunkWriteInput {
  knowledgeSpaceId: string;
  documentId: string;
  documentVersionId: string;
  sectionId: string;
  chunkIndex: number;
  content: string;
  tokenCount: number;
  metadata: Record<string, unknown>;
}

function mapChunk(row: {
  id: string;
  knowledgeSpaceId: string;
  documentId: string;
  documentVersionId: string;
  sectionId: string | null;
  chunkIndex: number;
  content: string;
  tokenCount: number | null;
  metadata: unknown;
}): KnowledgeChunkRow {
  return {
    id: row.id,
    knowledgeSpaceId: row.knowledgeSpaceId,
    documentId: row.documentId,
    documentVersionId: row.documentVersionId,
    sectionId: row.sectionId,
    chunkIndex: row.chunkIndex,
    content: row.content,
    tokenCount: row.tokenCount,
    metadata:
      row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {},
  };
}

export const knowledgeChunkRepository = {
  async replaceForVersion(documentVersionId: string, chunks: ChunkWriteInput[]): Promise<void> {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.knowledgeChunk.deleteMany({ where: { documentVersionId } });
      if (chunks.length === 0) {
        return;
      }
      // Batch insert in slices for very large documents.
      const batchSize = 200;
      for (let i = 0; i < chunks.length; i += batchSize) {
        const slice = chunks.slice(i, i + batchSize);
        await tx.knowledgeChunk.createMany({
          data: slice.map((chunk) => ({
            knowledgeSpaceId: chunk.knowledgeSpaceId,
            documentId: chunk.documentId,
            documentVersionId: chunk.documentVersionId,
            sectionId: chunk.sectionId,
            chunkIndex: chunk.chunkIndex,
            content: chunk.content,
            tokenCount: chunk.tokenCount,
            metadata: chunk.metadata as object,
          })),
        });
      }
    });
  },

  async listByVersion(documentVersionId: string): Promise<KnowledgeChunkRow[]> {
    const rows = await prisma.knowledgeChunk.findMany({
      where: { documentVersionId },
      orderBy: { chunkIndex: 'asc' },
    });
    return rows.map(mapChunk);
  },

  async countByVersion(documentVersionId: string): Promise<number> {
    return prisma.knowledgeChunk.count({ where: { documentVersionId } });
  },

  async listByDocumentId(documentId: string): Promise<KnowledgeChunkRow[]> {
    const rows = await prisma.knowledgeChunk.findMany({
      where: { documentId },
      orderBy: { chunkIndex: 'asc' },
    });
    return rows.map(mapChunk);
  },
};

export const documentSectionQueryRepository = {
  listByVersionId(documentVersionId: string) {
    return prisma.documentSection.findMany({
      where: { documentVersionId },
      orderBy: { sectionOrder: 'asc' },
    });
  },
};
