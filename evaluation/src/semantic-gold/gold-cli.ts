/**
 * Gold tooling CLI commands: candidate / validate / readiness / corpus snapshot.
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import {
  computeDatasetContentHash,
  validateSemanticGoldDataset,
  type SemanticGoldDataset,
} from './schema';
import { generateDraftCandidates } from './candidate';
import { FileCorpusSnapshotRepository, buildCorpusSnapshot, loadFixtureCorpusAsSnapshot } from '../corpus/snapshot';
import { assessGoldReadiness } from '../real/real-evaluation.runner';

function evalRoot(): string {
  return path.resolve(__dirname, '..', '..');
}

function goldPath(root: string): string {
  return path.join(root, 'datasets', 'semantic-gold', 'dataset.json');
}

export function loadSemanticGold(root = evalRoot()): SemanticGoldDataset {
  return JSON.parse(readFileSync(goldPath(root), 'utf8')) as SemanticGoldDataset;
}

export function saveSemanticGold(dataset: SemanticGoldDataset, root = evalRoot()): string {
  const file = goldPath(root);
  mkdirSync(path.dirname(file), { recursive: true });
  const withHash: SemanticGoldDataset = {
    ...dataset,
    contentHash: computeDatasetContentHash(dataset),
  };
  writeFileSync(file, JSON.stringify(withHash, null, 2), 'utf8');
  return file;
}

export function runGoldCandidate(root = evalRoot()): {
  created: number;
  path: string;
  note: string;
} {
  const corpus = loadFixtureCorpusAsSnapshot(root, 'corpus-2026-09-22-v1');
  const existing = existsSync(goldPath(root))
    ? loadSemanticGold(root)
    : ({
        datasetId: 'semantic-gold',
        datasetVersion: '0.1.0',
        corpusVersion: corpus.corpusVersion,
        createdAt: new Date().toISOString(),
        description: 'Semantic gold dataset',
        contentHash: '',
        annotationStatus: 'DRAFT' as const,
        cases: [],
      } satisfies SemanticGoldDataset);

  const start = existing.cases.length + 1;
  const drafts = generateDraftCandidates(corpus, {
    datasetVersion: existing.datasetVersion,
    corpusVersion: corpus.corpusVersion,
    startIndex: start,
    maxCases: 4,
  });

  const next: SemanticGoldDataset = {
    ...existing,
    corpusVersion: corpus.corpusVersion,
    cases: [...existing.cases, ...drafts],
    annotationStatus: 'DRAFT',
  };
  const file = saveSemanticGold(next, root);
  return {
    created: drafts.length,
    path: file,
    note: 'Candidates written as annotationStatus=DRAFT, provenance=machine_generated. Human review required before GOLD.',
  };
}

export function runGoldValidate(root = evalRoot()): ReturnType<typeof validateSemanticGoldDataset> {
  const dataset = loadSemanticGold(root);
  let corpus = null;
  try {
    corpus = loadFixtureCorpusAsSnapshot(root, dataset.corpusVersion);
  } catch {
    corpus = null;
  }
  return validateSemanticGoldDataset(dataset, corpus);
}

export function runGoldReadiness(root = evalRoot()): {
  ready: boolean;
  humanCuratedGoldCount: number;
  reason: string;
  distribution: ReturnType<typeof validateSemanticGoldDataset>['distribution'];
} {
  const dataset = loadSemanticGold(root);
  const corpus = loadFixtureCorpusAsSnapshot(root, dataset.corpusVersion);
  const validation = validateSemanticGoldDataset(dataset, corpus);
  const readiness = assessGoldReadiness(dataset, corpus);
  return {
    ...readiness,
    distribution: validation.distribution,
  };
}

export function runCorpusSnapshotFromFixture(root = evalRoot()): {
  corpusVersion: string;
  corpusHash: string;
  path: string;
} {
  const source = loadFixtureCorpusAsSnapshot(root, 'corpus-2026-09-22-v1');
  const snapshot = buildCorpusSnapshot(source.corpusVersion, source.chunks, source.createdAt);
  const repo = new FileCorpusSnapshotRepository(root);
  const file = repo.save(snapshot);
  return { corpusVersion: snapshot.corpusVersion, corpusHash: snapshot.corpusHash, path: file };
}
