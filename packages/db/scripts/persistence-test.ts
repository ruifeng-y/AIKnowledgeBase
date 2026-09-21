import './load-env';
import { prisma, disconnectPrisma } from '../src/client';

const SUFFIX = 'v04c';
const EMAIL = `persistence-test-${SUFFIX}@example.com`;
const WORKSPACE_SLUG = `ws-persistence-${SUFFIX}`;
const SPACE_SLUG = `space-persistence-${SUFFIX}`;
const KEY_HASH = `test-hash-${SUFFIX}`;
const KEY_PREFIX = 'sk_test';

async function main(): Promise<void> {
  // Clean any previous leftover first.
  await prisma.messageSource.deleteMany({ where: { chunk: { content: { contains: SUFFIX } } } });
  await prisma.apiKey.deleteMany({ where: { keyHash: KEY_HASH } });
  await prisma.user.deleteMany({ where: { email: EMAIL } });

  const user = await prisma.user.create({
    data: {
      email: EMAIL,
      passwordHash: 'test-password-hash',
      name: 'V04C Persistence Tester',
    },
  });

  const workspace = await prisma.workspace.create({
    data: {
      name: 'V04C Persistence Workspace',
      slug: WORKSPACE_SLUG,
      description: 'temporary',
      owner: { connect: { id: user.id } },
    },
  });

  const space = await prisma.knowledgeSpace.create({
    data: {
      name: 'V04C Persistence Space',
      slug: SPACE_SLUG,
      workspace: { connect: { id: workspace.id } },
      settings: { retrieval: { topK: 8 } },
    },
  });

  const document = await prisma.document.create({
    data: {
      title: `doc-${SUFFIX}`,
      sourceType: 'UPLOAD',
      mimeType: 'text/markdown',
      status: 'READY',
      knowledgeSpace: { connect: { id: space.id } },
      metadata: { test: true },
    },
  });

  const version = await prisma.documentVersion.create({
    data: {
      document: { connect: { id: document.id } },
      version: 1,
      storageKey: `test/${SUFFIX}/v1`,
      contentHash: `hash-${SUFFIX}`,
      fileSize: BigInt(12),
      mimeType: 'text/markdown',
    },
  });

  await prisma.document.update({
    where: { id: document.id },
    data: { currentVersionId: version.id },
  });

  const section = await prisma.documentSection.create({
    data: {
      documentVersion: { connect: { id: version.id } },
      heading: `Heading ${SUFFIX}`,
      level: 1,
      sectionOrder: 0,
      content: `Section content ${SUFFIX}`,
      metadata: { test: true },
    },
  });

  const chunk = await prisma.knowledgeChunk.create({
    data: {
      content: `persistence chunk ${SUFFIX}`,
      chunkIndex: 0,
      tokenCount: 8,
      metadata: { test: true },
      knowledgeSpace: { connect: { id: space.id } },
      document: { connect: { id: document.id } },
      documentVersion: { connect: { id: version.id } },
      section: { connect: { id: section.id } },
    },
  });

  // Write a real pgvector value via raw SQL (Prisma Unsupported("vector")).
  await prisma.$executeRawUnsafe(
    `INSERT INTO embedding_records (id, chunk_id, provider, model, dimensions, embedding, created_at, updated_at)
     VALUES (gen_random_uuid(), $1::uuid, 'test-provider', 'test-model', 3, '[1,2,3]'::vector, NOW(), NOW())`,
    chunk.id,
  );

  const conversation = await prisma.conversation.create({
    data: {
      title: `conv-${SUFFIX}`,
      knowledgeSpace: { connect: { id: space.id } },
      user: { connect: { id: user.id } },
    },
  });

  const message = await prisma.message.create({
    data: {
      conversation: { connect: { id: conversation.id } },
      role: 'ASSISTANT',
      content: `persistence message ${SUFFIX}`,
      metadata: { test: true },
    },
  });

  await prisma.messageSource.create({
    data: {
      message: { connect: { id: message.id } },
      chunk: { connect: { id: chunk.id } },
      rank: 1,
      score: 0.9,
      citationId: '1',
      metadata: { test: true },
    },
  });

  await prisma.processingJob.create({
    data: {
      type: 'PARSE',
      status: 'COMPLETED',
      attempts: 1,
      payload: { test: true },
      knowledgeSpace: { connect: { id: space.id } },
      document: { connect: { id: document.id } },
      documentVersion: { connect: { id: version.id } },
      startedAt: new Date(),
      completedAt: new Date(),
    },
  });

  await prisma.apiKey.create({
    data: {
      workspace: { connect: { id: workspace.id } },
      name: `key-${SUFFIX}`,
      keyHash: KEY_HASH,
      keyPrefix: KEY_PREFIX,
    },
  });

  console.log('PERSISTENCE_SEED_OK');
  console.log(
    JSON.stringify(
      {
        userId: user.id,
        workspaceId: workspace.id,
        spaceId: space.id,
        documentId: document.id,
        versionId: version.id,
        sectionId: section.id,
        chunkId: chunk.id,
        conversationId: conversation.id,
        messageId: message.id,
      },
      null,
      2,
    ),
  );

  await disconnectPrisma();
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
