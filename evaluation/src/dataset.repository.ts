import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import type {
  CorpusSnapshot,
  EvaluationCase,
  EvaluationDataset,
  EvaluationDatasetRepositoryPort,
  EvaluationReport,
  EvaluationReportRepositoryPort,
  RelevanceGrade,
} from './types';
import { EVALUATION_CATEGORIES } from './types';

export class EvaluationContractError extends Error {
  constructor(
    message: string,
    readonly code = 'EVALUATION_CONTRACT_FAILURE',
  ) {
    super(message);
    this.name = 'EvaluationContractError';
  }
}

export function contentHashOf(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex').slice(0, 32);
}

export function defaultEvaluationRoot(): string {
  return path.resolve(__dirname, '..');
}

export class FileEvaluationDatasetRepository implements EvaluationDatasetRepositoryPort {
  constructor(private readonly root = defaultEvaluationRoot()) {}

  async load(datasetId: string, version: string): Promise<EvaluationDataset> {
    const file = path.join(this.root, 'datasets', datasetId, 'dataset.json');
    if (!existsSync(file)) {
      throw new EvaluationContractError(`dataset not found: ${datasetId}@${version}`);
    }
    const raw = JSON.parse(readFileSync(file, 'utf8')) as EvaluationDataset;
    if (raw.datasetId !== datasetId) {
      throw new EvaluationContractError(`datasetId mismatch: ${raw.datasetId}`);
    }
    if (raw.version !== version) {
      throw new EvaluationContractError(
        `dataset version mismatch: expected ${version}, got ${raw.version}`,
      );
    }
    this.validateDataset(raw);
    return raw;
  }

  async loadCorpus(corpusSnapshotId: string): Promise<CorpusSnapshot> {
    const file = path.join(this.root, 'datasets', 'retrieval-contract', `${corpusSnapshotId}.json`);
    const alt = path.join(this.root, 'datasets', `${corpusSnapshotId}.json`);
    const target = existsSync(file) ? file : existsSync(alt) ? alt : null;
    if (!target) {
      throw new EvaluationContractError(`corpus snapshot not found: ${corpusSnapshotId}`);
    }
    const raw = JSON.parse(readFileSync(target, 'utf8')) as CorpusSnapshot;
    if (raw.corpusSnapshotId !== corpusSnapshotId) {
      throw new EvaluationContractError(`corpusSnapshotId mismatch`);
    }
    for (const chunk of raw.chunks) {
      const expected = contentHashOf(chunk.content);
      if (chunk.contentHash !== expected) {
        throw new EvaluationContractError(
          `GROUND_TRUTH_MISMATCH contentHash for chunk ${chunk.chunkId}`,
        );
      }
    }
    return raw;
  }

  private validateDataset(dataset: EvaluationDataset): void {
    if (!dataset.datasetId || !dataset.version || !dataset.corpusSnapshotId) {
      throw new EvaluationContractError('dataset metadata incomplete');
    }
    const ids = new Set<string>();
    for (const c of dataset.cases) {
      if (!c.caseId || ids.has(c.caseId)) {
        throw new EvaluationContractError(`duplicate or missing caseId: ${c.caseId}`);
      }
      ids.add(c.caseId);
      if (!c.query || c.query.trim().length === 0) {
        throw new EvaluationContractError(`empty query in ${c.caseId}`);
      }
      if (typeof c.answerable !== 'boolean') {
        throw new EvaluationContractError(`invalid answerability in ${c.caseId}`);
      }
      if (!Array.isArray(c.category) || c.category.length === 0) {
        throw new EvaluationContractError(`missing category in ${c.caseId}`);
      }
      for (const rc of c.relevantChunks) {
        if (![0, 1, 2, 3].includes(rc.relevanceGrade)) {
          throw new EvaluationContractError(`invalid relevanceGrade in ${c.caseId}`);
        }
        if (!rc.chunkId || !rc.contentHash) {
          throw new EvaluationContractError(`invalid chunk reference in ${c.caseId}`);
        }
      }
    }
  }
}

export class FileEvaluationReportRepository implements EvaluationReportRepositoryPort {
  constructor(private readonly root = defaultEvaluationRoot()) {}

  async save(report: EvaluationReport): Promise<{ jsonPath: string; mdPath: string }> {
    const dir = path.join(this.root, 'reports');
    mkdirSync(dir, { recursive: true });
    const jsonPath = path.join(dir, `${report.run.runId}.json`);
    const mdPath = path.join(dir, `${report.run.runId}.md`);
    writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8');
    writeFileSync(mdPath, renderMarkdownReport(report), 'utf8');
    return { jsonPath, mdPath };
  }
}

function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined) {
    return 'unavailable';
  }
  return Number.isInteger(n) ? String(n) : n.toFixed(4);
}

export function renderMarkdownReport(report: EvaluationReport): string {
  const lines: string[] = [];
  lines.push(`# Evaluation Report — ${report.run.runId}`);
  lines.push('');
  lines.push('## Evaluation Run');
  lines.push(`- Status: **${report.status}**`);
  lines.push(`- Profile: ${report.run.profile}`);
  lines.push(`- Semantic benchmark: ${report.run.semanticBenchmark}`);
  if (!report.run.semanticBenchmark) {
    lines.push('- Mode: **NOT SEMANTIC QUALITY BENCHMARK** (contract / pipeline evaluation)');
  }
  lines.push('');
  lines.push('## Dataset');
  lines.push(`- Dataset: ${report.datasetSummary.datasetId} @ ${report.datasetSummary.datasetVersion}`);
  lines.push(`- Cases: ${report.datasetSummary.caseCount}`);
  lines.push(`- Answerable: ${report.datasetSummary.answerableCount}`);
  lines.push(`- Unanswerable: ${report.datasetSummary.unanswerableCount}`);
  lines.push(`- Status: ${report.datasetSummary.status}`);
  lines.push('');
  lines.push('## Corpus Snapshot');
  lines.push(`- ${report.run.corpusSnapshotId}`);
  lines.push('');
  lines.push('## Git Commit');
  lines.push(`- ${report.run.gitCommit}`);
  lines.push(`- dirtyWorkingTree: ${report.run.dirtyWorkingTree}`);
  lines.push('');
  lines.push('## Provider / Model');
  lines.push(`- Embedding: ${report.run.embeddingProvider ?? 'null'} / ${report.run.embeddingModel ?? 'null'}`);
  lines.push(`- Reranker: ${report.run.rerankerProvider ?? 'null'} / ${report.run.rerankerModel ?? 'null'}`);
  lines.push(`- LLM: ${report.run.llmProvider ?? 'null'} / ${report.run.llmModel ?? 'null'}`);
  lines.push('');
  lines.push('## Configuration');
  lines.push('```json');
  lines.push(JSON.stringify(report.run.configuration, null, 2));
  lines.push('```');
  lines.push('');
  lines.push('## Retrieval / Ranking Metrics');
  for (const [k, v] of Object.entries(report.metricSummary)) {
    if (typeof v === 'number' || v === null) {
      lines.push(`- ${k}: ${fmt(v)}`);
    }
  }
  lines.push('');
  lines.push('## Performance');
  lines.push(`- totalMs p50/p95/p99: ${fmt(report.performance.latency.totalMs.p50)} / ${fmt(report.performance.latency.totalMs.p95)} / ${fmt(report.performance.latency.totalMs.p99)}`);
  lines.push(`- tokenUsage: ${report.performance.tokenUsage}`);
  lines.push('');
  lines.push('## Category Breakdown');
  for (const [cat, metrics] of Object.entries(report.categoryMetrics)) {
    lines.push(`### ${cat}`);
    for (const [k, v] of Object.entries(metrics)) {
      if (typeof v === 'number' || v === null) {
        lines.push(`- ${k}: ${fmt(v)}`);
      }
    }
  }
  lines.push('');
  lines.push('## Security');
  lines.push(`- tenantIsolationViolations: ${report.security.tenantIsolationViolations}`);
  lines.push(`- spaceIsolationViolations: ${report.security.spaceIsolationViolations}`);
  lines.push(`- versionIsolationViolations: ${report.security.versionIsolationViolations}`);
  lines.push(`- citationSecurityViolations: ${report.security.citationSecurityViolations}`);
  lines.push(`- promptInjectionViolations: ${report.security.promptInjectionViolations}`);
  lines.push(`- emptyContextLlmCalls: ${report.security.emptyContextLlmCalls}`);
  lines.push('');
  lines.push('## Failures');
  if (report.failures.length === 0) {
    lines.push('- none');
  } else {
    for (const f of report.failures) {
      lines.push(`- ${f.caseId} ${f.status} ${f.failureClass ?? ''} ${f.errorCode ?? ''}`);
    }
  }
  lines.push('');
  lines.push('## Case Details');
  lines.push('| caseId | status | retrieved | context | citations | latencyMs | failureClass |');
  lines.push('|---|---|---|---|---|---|---|');
  for (const c of report.caseResults) {
    lines.push(
      `| ${c.caseId} | ${c.status} | ${c.retrievedChunkIds.length} | ${c.contextChunkIds.length} | ${c.citations.length} | ${c.latencyMs} | ${c.failureClass ?? ''} |`,
    );
  }
  lines.push('');
  lines.push('## Notes');
  lines.push('- Composite overall score is intentionally not computed.');
  lines.push('- Reference Answer Similarity (if present) is ADVISORY only.');
  lines.push('- estimatedContextTokens is an estimate, not exact tokenizer count.');
  lines.push('');
  return lines.join('\n');
}

export { EVALUATION_CATEGORIES };
export type { EvaluationCase, RelevanceGrade };
