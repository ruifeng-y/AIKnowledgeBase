import './load-env';
import { prisma, disconnectPrisma } from '../src/client';

const SUFFIX = 'v04c';
const EMAIL = `persistence-test-${SUFFIX}@example.com`;
const KEY_HASH = `test-hash-${SUFFIX}`;

async function main(): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email: EMAIL } });
  if (!user) {
    console.log('CLEANUP_OK: nothing to delete');
    await disconnectPrisma();
    return;
  }

  const workspaces = await prisma.workspace.findMany({ where: { ownerId: user.id } });
  for (const workspace of workspaces) {
    const spaces = await prisma.knowledgeSpace.findMany({ where: { workspaceId: workspace.id } });
    for (const space of spaces) {
      await prisma.messageSource.deleteMany({
        where: {
          OR: [
            { message: { conversation: { knowledgeSpaceId: space.id } } },
            { chunk: { knowledgeSpaceId: space.id } },
          ],
        },
      });
      await prisma.message.deleteMany({
        where: { conversation: { knowledgeSpaceId: space.id } },
      });
      await prisma.conversation.deleteMany({ where: { knowledgeSpaceId: space.id } });
      await prisma.processingJob.deleteMany({ where: { knowledgeSpaceId: space.id } });
      await prisma.embeddingRecord.deleteMany({
        where: { chunk: { knowledgeSpaceId: space.id } },
      });
      await prisma.knowledgeChunk.deleteMany({ where: { knowledgeSpaceId: space.id } });
      const documents = await prisma.document.findMany({ where: { knowledgeSpaceId: space.id } });
      for (const document of documents) {
        const versions = await prisma.documentVersion.findMany({
          where: { documentId: document.id },
        });
        for (const version of versions) {
          await prisma.documentSection.deleteMany({ where: { documentVersionId: version.id } });
        }
        await prisma.documentVersion.deleteMany({ where: { documentId: document.id } });
      }
      await prisma.document.deleteMany({ where: { knowledgeSpaceId: space.id } });
      await prisma.knowledgeSpace.deleteMany({ where: { id: space.id } });
    }
    await prisma.apiKey.deleteMany({ where: { workspaceId: workspace.id } });
    await prisma.workspace.deleteMany({ where: { id: workspace.id } });
  }
  await prisma.user.deleteMany({ where: { email: EMAIL } });
  await prisma.apiKey.deleteMany({ where: { keyHash: KEY_HASH } });

  const leftoverUser = await prisma.user.findUnique({ where: { email: EMAIL } });
  const leftoverKey = await prisma.apiKey.findUnique({ where: { keyHash: KEY_HASH } });
  if (leftoverUser || leftoverKey) {
    console.log('CLEANUP_FAIL');
    process.exitCode = 1;
  } else {
    console.log('CLEANUP_OK');
  }

  await disconnectPrisma();
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
