import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { EvaluationRunner } from './evaluation.runner';
import { defaultEvaluationRoot, FileEvaluationReportRepository } from './dataset.repository';
import { writeEvaluationDatasets } from './write-datasets';
import type { EvaluationReport } from './types';

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i]!.startsWith('--')) {
      const key = argv[i]!.slice(2);
      const val = argv[i + 1] && !argv[i + 1]!.startsWith('--') ? argv[i + 1]! : 'true';
      out[key] = val;
    }
  }
  return out;
}

async function cmdContract(): Promise<void> {
  writeEvaluationDatasets();
  const runner = new EvaluationRunner();
  // Run all four baseline profiles for contract regression
  const profiles = [
    'vector-baseline',
    'hybrid-baseline',
    'reranked-baseline',
    'grounded-rag-baseline',
  ];
  let failed = false;
  for (const profileId of profiles) {
    const result = await runner.run({
      datasetId: 'retrieval-contract',
      datasetVersion: '1.0.0',
      profileId,
      evaluationCommand: 'evaluation:contract',
      semanticBenchmark: false,
    });
    console.log(
      JSON.stringify({
        profile: profileId,
        status: result.report.status,
        runId: result.report.run.runId,
        jsonPath: result.jsonPath,
        mdPath: result.mdPath,
        cases: result.report.caseResults.length,
        qualityFailures: result.report.qualityFailures.length,
        regressionFailures: result.report.regressionFailures.length,
        evalContractFailures: result.report.evaluationContractFailures.length,
        semanticBenchmark: false,
        note: 'NOT SEMANTIC QUALITY BENCHMARK',
      }),
    );
    if (result.report.regressionFailures.length > 0 || result.report.evaluationContractFailures.length > 0) {
      failed = true;
    }
  }
  // CI gate: contract/regression only. Quality failures are allowed (Mock is not semantic quality).
  if (failed) {
    process.exitCode = 1;
    console.log('EVALUATION_CONTRACT_FAIL');
  } else {
    console.log('EVALUATION_CONTRACT_PASS');
  }
}

async function cmdBenchmark(): Promise<void> {
  writeEvaluationDatasets();
  const root = defaultEvaluationRoot();
  const gold = JSON.parse(
    readFileSync(path.join(root, 'datasets', 'semantic-gold', 'dataset.json'), 'utf8'),
  ) as { status: string; cases: unknown[] };
  if (gold.status !== 'READY' || gold.cases.length < 50) {
    console.log(
      JSON.stringify({
        status: 'NOT_READY',
        semanticBenchmark: false,
        reason: 'semantic-gold not human-curated to 50+ cases',
        note: 'NOT SEMANTIC QUALITY BENCHMARK',
      }),
    );
    console.log('SEMANTIC_BENCHMARK_NOT_READY');
    return;
  }
  console.log('SEMANTIC_BENCHMARK_REQUIRES_REAL_PROVIDERS');
  console.log('NOT SEMANTIC QUALITY BENCHMARK unless real Embedding/Reranker/LLM are configured');
}

async function cmdBaseline(): Promise<void> {
  const args = parseArgs(process.argv.slice(3));
  const runId = args['run-id'];
  if (!runId) {
    console.error('usage: evaluation:baseline --run-id <runId>');
    process.exitCode = 1;
    return;
  }
  const root = defaultEvaluationRoot();
  const src = path.join(root, 'reports', `${runId}.json`);
  if (!existsSync(src)) {
    console.error(`run report not found: ${src}`);
    process.exitCode = 1;
    return;
  }
  const report = JSON.parse(readFileSync(src, 'utf8')) as EvaluationReport;
  const baselines = path.join(root, 'baselines');
  mkdirSync(baselines, { recursive: true });
  const baseline = {
    savedAt: new Date().toISOString(),
    runId: report.run.runId,
    datasetId: report.run.datasetId,
    datasetVersion: report.run.datasetVersion,
    profile: report.run.profile,
    provider: {
      embedding: report.run.embeddingProvider,
      embeddingModel: report.run.embeddingModel,
      reranker: report.run.rerankerProvider,
      rerankerModel: report.run.rerankerModel,
      llm: report.run.llmProvider,
      llmModel: report.run.llmModel,
    },
    metrics: report.metricSummary,
    gitCommit: report.run.gitCommit,
    timestamp: report.run.createdAt,
  };
  const jsonPath = path.join(baselines, 'baseline.json');
  writeFileSync(jsonPath, JSON.stringify(baseline, null, 2), 'utf8');
  copyFileSync(src, path.join(baselines, `${runId}.json`));
  writeFileSync(
    path.join(baselines, 'baseline.md'),
    [
      `# Evaluation Baseline`,
      ``,
      `- runId: ${baseline.runId}`,
      `- dataset: ${baseline.datasetId} @ ${baseline.datasetVersion}`,
      `- profile: ${baseline.profile}`,
      `- gitCommit: ${baseline.gitCommit}`,
      `- timestamp: ${baseline.timestamp}`,
      ``,
      `## Metrics`,
      ...Object.entries(baseline.metrics)
        .filter(([, v]) => typeof v === 'number' || v === null)
        .map(([k, v]) => `- ${k}: ${v === null ? 'unavailable' : v}`),
      ``,
      `Baseline is a reference, not a quality threshold.`,
      ``,
    ].join('\n'),
    'utf8',
  );
  console.log(JSON.stringify({ baseline: jsonPath }));
}

async function cmdCompare(): Promise<void> {
  const args = parseArgs(process.argv.slice(3));
  const baselinePath = args['baseline'] ?? path.join(defaultEvaluationRoot(), 'baselines', 'baseline.json');
  const currentPath = args['current'];
  if (!currentPath) {
    console.error('usage: evaluation:compare --current <run.json> [--baseline <baseline.json>]');
    process.exitCode = 1;
    return;
  }
  const baseline = JSON.parse(readFileSync(baselinePath, 'utf8')) as {
    metrics: Record<string, number | null>;
  };
  const current = JSON.parse(readFileSync(currentPath, 'utf8')) as EvaluationReport;
  const rows: Array<{ metric: string; baseline: number | null; current: number | null; delta: number | null }> = [];
  const keys = new Set([
    ...Object.keys(baseline.metrics),
    ...Object.keys(current.metricSummary),
  ]);
  for (const key of keys) {
    const b = (baseline.metrics[key] ?? null) as number | null;
    const c = (current.metricSummary[key] ?? null) as number | null;
    rows.push({
      metric: key,
      baseline: typeof b === 'number' ? b : null,
      current: typeof c === 'number' ? c : null,
      delta:
        typeof b === 'number' && typeof c === 'number' ? c - b : null,
    });
  }
  console.log('| metric | baseline | current | delta |');
  console.log('|---|---|---|---|');
  for (const r of rows) {
    const fmt = (n: number | null) => (n === null ? 'unavailable' : n.toFixed(4));
    console.log(`| ${r.metric} | ${fmt(r.baseline)} | ${fmt(r.current)} | ${r.delta === null ? 'unavailable' : (r.delta >= 0 ? '+' : '') + r.delta.toFixed(4)} |`);
  }
  console.log('');
  console.log('No winner / overall score is computed (forbidden).');
  const outPath = path.join(defaultEvaluationRoot(), 'reports', 'compare-latest.json');
  writeFileSync(outPath, JSON.stringify({ rows, note: 'per-metric only' }, null, 2), 'utf8');
}

async function main(): Promise<void> {
  const cmd = process.argv[2];
  if (cmd === 'contract') {
    await cmdContract();
  } else if (cmd === 'benchmark') {
    await cmdBenchmark();
  } else if (cmd === 'baseline') {
    await cmdBaseline();
  } else if (cmd === 'compare') {
    await cmdCompare();
  } else if (cmd === 'write-datasets') {
    writeEvaluationDatasets();
  } else {
    console.error('usage: tsx cli.ts [contract|benchmark|baseline|compare|write-datasets]');
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
