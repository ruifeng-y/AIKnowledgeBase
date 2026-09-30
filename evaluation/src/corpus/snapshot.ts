/**
 * Evaluation corpus snapshot — versioned, hashed, read-only for benchmarks.
 * Never mutates production documents/chunks/embeddings.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { CorpusSnapshotMeta } from '../semantic-gold/schema';
import { computeCorpusHash } from '../semantic-gold/schema';

export function contentHashOf(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex').slice(0, 32);
}

export interface BuildCorpusInputChunk {
  chunkId: string;
  documentId: string;
  documentVersionId: string;
  sectionId?: string;
  chunkIndex: number;
  content: string;
}

export function buildCorpusSnapshot(
  corpusVersion: string,
  chunks: BuildCorpusInputChunk[],
  createdAt = new Date().toISOString(),
): CorpusSnapshotMeta {
  const withHash = chunks.map((c) => ({
    ...c,
    contentHash: contentHashOf(c.content),
  }));
  return {
    corpusVersion,
    corpusHash: computeCorpusHash(withHash),
    createdAt,
    documentCount: new Set(withHash.map((c) => c.documentId)).size,
    sectionCount: new Set(withHash.map((c) => c.sectionId ?? c.documentId)).size,
    chunkCount: withHash.length,
    chunks: withHash,
  };
}

export class FileCorpusSnapshotRepository {
  constructor(private readonly root: string) {}

  private filePath(corpusVersion: string): string {
    return path.join(this.root, 'datasets', 'corpus-snapshots', `${corpusVersion}.json`);
  }

  save(snapshot: CorpusSnapshotMeta): string {
    const file = this.filePath(snapshot.corpusVersion);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(snapshot, null, 2), 'utf8');
    return file;
  }

  load(corpusVersion: string): CorpusSnapshotMeta {
    const file = this.filePath(corpusVersion);
    if (!existsSync(file)) {
      // fallback: retrieval-contract corpus layout
      const alt = path.join(this.root, 'datasets', 'retrieval-contract', `${corpusVersion}.json`);
      const target = existsSync(file) ? file : existsSync(alt) ? alt : null;
      if (!target) {
        throw new Error(`corpus snapshot not found: ${corpusVersion}`);
      }
      const raw = JSON.parse(readFileSync(target, 'utf8')) as CorpusSnapshotMeta & {
        corpusSnapshotId?: string;
        chunks: CorpusSnapshotMeta['chunks'];
      };
      const chunks = raw.chunks.map((c) => ({
        ...c,
        contentHash: c.contentHash || contentHashOf(c.content),
      }));
      return {
        corpusVersion: raw.corpusVersion ?? raw.corpusSnapshotId ?? corpusVersion,
        corpusHash: raw.corpusHash ?? computeCorpusHash(chunks),
        createdAt: raw.createdAt,
        documentCount: new Set(chunks.map((c) => c.documentId)).size,
        sectionCount: new Set(chunks.map((c) => c.sectionId ?? c.documentId)).size,
        chunkCount: chunks.length,
        chunks,
      };
    }
    const raw = JSON.parse(readFileSync(file, 'utf8')) as CorpusSnapshotMeta;
    const expected = computeCorpusHash(raw.chunks);
    if (raw.corpusHash !== expected) {
      throw new Error(`corpusHash mismatch for ${corpusVersion}`);
    }
    for (const c of raw.chunks) {
      if (c.contentHash !== contentHashOf(c.content)) {
        throw new Error(`chunk contentHash mismatch: ${c.chunkId}`);
      }
    }
    return raw;
  }
}

/** Load fixture corpus from V0.4-N retrieval-contract snapshot into new meta shape. */
export function loadFixtureCorpusAsSnapshot(root: string, corpusVersion: string): CorpusSnapshotMeta {
  const repo = new FileCorpusSnapshotRepository(root);
  return repo.load(corpusVersion);
}
