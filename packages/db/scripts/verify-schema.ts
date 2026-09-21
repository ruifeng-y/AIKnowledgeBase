import './load-env';
import { prisma, disconnectPrisma } from '../src/client';

const REQUIRED_TABLES = [
  'users',
  'workspaces',
  'knowledge_spaces',
  'documents',
  'document_versions',
  'document_sections',
  'knowledge_chunks',
  'embedding_records',
  'conversations',
  'messages',
  'message_sources',
  'processing_jobs',
  'api_keys',
] as const;

type CheckResult = { name: string; ok: boolean; detail: string };

function pass(name: string, detail = ''): CheckResult {
  return { name, ok: true, detail };
}

function fail(name: string, detail: string): CheckResult {
  return { name, ok: false, detail };
}

async function main(): Promise<void> {
  const results: CheckResult[] = [];

  for (const table of REQUIRED_TABLES) {
    try {
      const rows = await prisma.$queryRawUnsafe<{ exists: boolean }[]>(
        `SELECT to_regclass('public.${table}') IS NOT NULL AS exists`,
      );
      const exists = rows[0]?.exists === true;
      results.push(exists ? pass(`table:${table}`) : fail(`table:${table}`, 'missing'));
    } catch (error) {
      results.push(fail(`table:${table}`, String(error)));
    }
  }

  try {
    const ext = await prisma.$queryRawUnsafe<{ extname: string }[]>(
      `SELECT extname FROM pg_extension WHERE extname = 'vector'`,
    );
    results.push(
      ext.length > 0 ? pass('extension:vector') : fail('extension:vector', 'not installed'),
    );
  } catch (error) {
    results.push(fail('extension:vector', String(error)));
  }

  try {
    const col = await prisma.$queryRawUnsafe<{ data_type: string }[]>(
      `SELECT data_type FROM information_schema.columns
       WHERE table_name = 'embedding_records' AND column_name = 'embedding'`,
    );
    const dataType = col[0]?.data_type ?? '';
    results.push(
      dataType === 'USER-DEFINED' || dataType.includes('vector')
        ? pass('column:embedding_records.embedding', dataType)
        : fail('column:embedding_records.embedding', `unexpected type ${dataType}`),
    );
  } catch (error) {
    results.push(fail('column:embedding_records.embedding', String(error)));
  }

  try {
    const col = await prisma.$queryRawUnsafe<{ data_type: string }[]>(
      `SELECT data_type FROM information_schema.columns
       WHERE table_name = 'knowledge_chunks' AND column_name = 'search_vector'`,
    );
    results.push(
      col.length > 0
        ? pass('column:knowledge_chunks.search_vector')
        : fail('column:knowledge_chunks.search_vector', 'missing'),
    );
  } catch (error) {
    results.push(fail('column:knowledge_chunks.search_vector', String(error)));
  }

  try {
    const idx = await prisma.$queryRawUnsafe<{ indexname: string }[]>(
      `SELECT indexname FROM pg_indexes
       WHERE tablename = 'knowledge_chunks' AND indexdef ILIKE '%gin%'`,
    );
    results.push(
      idx.length > 0
        ? pass('index:knowledge_chunks.search_vector GIN', idx[0]!.indexname)
        : fail('index:knowledge_chunks.search_vector GIN', 'missing'),
    );
  } catch (error) {
    results.push(fail('index:knowledge_chunks.search_vector GIN', String(error)));
  }

  try {
    const fks = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT COUNT(*)::bigint AS count FROM information_schema.table_constraints
       WHERE constraint_type = 'FOREIGN KEY' AND table_schema = 'public'`,
    );
    const count = Number(fks[0]?.count ?? 0);
    results.push(count > 0 ? pass('foreign_keys', `${count} FKs`) : fail('foreign_keys', 'none'));
  } catch (error) {
    results.push(fail('foreign_keys', String(error)));
  }

  try {
    // Prisma emits UNIQUE as unique indexes; also count table UNIQUE constraints.
    const uniques = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT (
         (SELECT COUNT(*) FROM pg_indexes WHERE indexdef ILIKE '%UNIQUE%')
         + (SELECT COUNT(*) FROM information_schema.table_constraints
            WHERE constraint_type = 'UNIQUE' AND table_schema = 'public')
       )::bigint AS count`,
    );
    const count = Number(uniques[0]?.count ?? 0);
    results.push(
      count > 0
        ? pass('unique_constraints', `${count} UNIQUE`)
        : fail('unique_constraints', 'none'),
    );
  } catch (error) {
    results.push(fail('unique_constraints', String(error)));
  }

  console.log('\n===== Database Schema Verification =====');
  let failed = 0;
  for (const r of results) {
    const status = r.ok ? 'PASS' : 'FAIL';
    console.log(`${status}  ${r.name}${r.detail ? `  (${r.detail})` : ''}`);
    if (!r.ok) failed += 1;
  }
  console.log('========================================');
  if (failed > 0) {
    console.log(`RESULT: FAIL (${failed} checks failed)`);
    process.exitCode = 1;
  } else {
    console.log(`RESULT: PASS (${results.length} checks)`);
  }

  await disconnectPrisma();
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
