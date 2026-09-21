import './load-env';
import { prisma, disconnectPrisma } from '../src/client';

const SUFFIX = 'v04c';
const EMAIL = `persistence-test-${SUFFIX}@example.com`;
const KEY_HASH = `test-hash-${SUFFIX}`;

async function main(): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email: EMAIL } });
  if (!user) {
    console.error('PERSISTENCE_VERIFY_FAIL: user missing');
    process.exitCode = 1;
    await disconnectPrisma();
    return;
  }

  const workspace = await prisma.workspace.findFirst({ where: { ownerId: user.id } });
  const space = workspace
    ? await prisma.knowledgeSpace.findFirst({ where: { workspaceId: workspace.id } })
    : null;
  const document = space
    ? await prisma.document.findFirst({ where: { knowledgeSpaceId: space.id } })
    : null;
  const version = document
    ? await prisma.documentVersion.findFirst({ where: { documentId: document.id } })
    : null;
  const section = version
    ? await prisma.documentSection.findFirst({ where: { documentVersionId: version.id } })
    : null;
  const chunk = document
    ? await prisma.knowledgeChunk.findFirst({ where: { documentId: document.id } })
    : null;
  const embeddings = chunk
    ? await prisma.$queryRawUnsafe<{ id: string; embedding_text: string }[]>(
        `SELECT id::text AS id, embedding::text AS embedding_text
         FROM embedding_records WHERE chunk_id = $1::uuid`,
        chunk.id,
      )
    : [];
  const conversation = space
    ? await prisma.conversation.findFirst({ where: { knowledgeSpaceId: space.id } })
    : null;
  const message = conversation
    ? await prisma.message.findFirst({ where: { conversationId: conversation.id } })
    : null;
  const source = message
    ? await prisma.messageSource.findFirst({ where: { messageId: message.id } })
    : null;
  const job = document
    ? await prisma.processingJob.findFirst({ where: { documentId: document.id } })
    : null;
  const apiKey = workspace
    ? await prisma.apiKey.findUnique({ where: { keyHash: KEY_HASH } })
    : null;

  const checks = {
    user: Boolean(user),
    workspace: Boolean(workspace),
    knowledgeSpace: Boolean(space),
    document: Boolean(document),
    documentVersion: Boolean(version),
    documentSection: Boolean(section),
    knowledgeChunk: Boolean(chunk),
    embeddingRecord: embeddings.length > 0,
    embeddingValue: embeddings[0]?.embedding_text ?? null,
    conversation: Boolean(conversation),
    message: Boolean(message),
    messageSource: Boolean(source),
    processingJob: Boolean(job),
    apiKey: Boolean(apiKey),
    chunkContent: chunk?.content ?? null,
  };

  console.log(JSON.stringify(checks, null, 2));

  const required =
    checks.user &&
    checks.workspace &&
    checks.knowledgeSpace &&
    checks.document &&
    checks.documentVersion &&
    checks.documentSection &&
    checks.knowledgeChunk &&
    checks.embeddingRecord &&
    checks.conversation &&
    checks.message &&
    checks.messageSource &&
    checks.processingJob &&
    checks.apiKey &&
    checks.chunkContent?.includes(SUFFIX) === true;

  if (required) {
    console.log('PERSISTENCE_VERIFY_PASS');
  } else {
    console.log('PERSISTENCE_VERIFY_FAIL');
    process.exitCode = 1;
  }

  await disconnectPrisma();
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
