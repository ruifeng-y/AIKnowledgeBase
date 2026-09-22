/** V0.4-N Evaluation types — frozen contract shapes. */

export type RelevanceGrade = 0 | 1 | 2 | 3;

export type FailureClass =
  | 'QUALITY_FAILURE'
  | 'SYSTEM_ERROR'
  | 'SECURITY_CONTRACT_FAILURE'
  | 'EVALUATION_CONTRACT_FAILURE'
  | 'REGRESSION_FAILURE';

export type CaseStatus = 'PASS' | 'FAIL' | 'ERROR';

export type RunStatus = 'PASS' | 'FAIL' | 'ERROR';

export interface RelevantChunk {
  chunkId: string;
  documentId: string;
  documentVersionId: string;
  chunkIndex: number;
  contentHash: string;
  relevanceGrade: RelevanceGrade;
}

export interface EvaluationCase {
  caseId: string;
  datasetId: string;
  datasetVersion: string;
  query: string;
  answerable: boolean;
  relevantChunks: RelevantChunk[];
  expectedAnswer?: string;
  requiredEvidenceChunks?: string[];
  category: string[];
  tags?: string[];
}

export interface EvaluationDataset {
  datasetId: string;
  version: string;
  createdAt: string;
  description: string;
  corpusSnapshotId: string;
  status: 'READY' | 'NOT_READY';
  cases: EvaluationCase[];
}

export interface CorpusChunk {
  chunkId: string;
  documentId: string;
  documentVersionId: string;
  knowledgeSpaceId: string;
  workspaceId: string;
  ownerId: string;
  chunkIndex: number;
  content: string;
  contentHash: string;
  isCurrentVersion: boolean;
  metadata?: Record<string, unknown>;
}

export interface CorpusSnapshot {
  corpusSnapshotId: string;
  createdAt: string;
  chunks: CorpusChunk[];
}

export interface EvaluationProfileConfig {
  profileId: string;
  name: string;
  topK?: number;
  candidateK?: number;
  retrievalCandidateK?: number;
  rerankCandidateK?: number;
  threshold: number;
  rrfK?: number;
  contextTopK?: number;
  contextTokenBudget?: number;
  maxChunkContextTokens?: number;
}

export interface EvaluationRunMetadata {
  runId: string;
  datasetId: string;
  datasetVersion: string;
  corpusSnapshotId: string;
  gitCommit: string;
  dirtyWorkingTree: boolean;
  profile: string;
  embeddingProvider?: string | null;
  embeddingModel?: string | null;
  rerankerProvider?: string | null;
  rerankerModel?: string | null;
  llmProvider?: string | null;
  llmModel?: string | null;
  createdAt: string;
  environment: EvaluationEnvironment;
  configuration: EvaluationProfileConfig;
  semanticBenchmark: boolean;
  notes?: string[];
}

export interface EvaluationEnvironment {
  os: string;
  nodeVersion: string;
  packageManager: string;
  databaseVersion: string | null;
  evaluationCommand: string;
}

export interface EvaluationCaseResult {
  caseId: string;
  status: CaseStatus;
  retrievedChunkIds: string[];
  contextChunkIds: string[];
  citations: string[];
  metrics: Record<string, number | null>;
  latencyMs: number;
  errorCode?: string;
  failureClass?: FailureClass;
  category: string[];
  answerable: boolean;
  llmCalled: boolean;
  estimatedContextTokens: number;
  candidateCounts: {
    vectorCandidateCount: number;
    lexicalCandidateCount: number;
    rrfCandidateCount: number;
    rerankedCount: number;
    contextItemCount: number;
  };
  latencyBreakdown: {
    retrievalLatencyMs: number | null;
    rerankLatencyMs: number | null;
    contextBuildLatencyMs: number | null;
    llmLatencyMs: number | null;
    totalLatencyMs: number;
  };
  tokenUsage: 'unavailable';
  answer?: string;
  securityViolations?: string[];
}

export interface MetricSummary {
  /** metric name → value; null/undefined means unavailable */
  [metric: string]: number | null | Record<string, number | null>;
}

export interface EvaluationReport {
  run: EvaluationRunMetadata;
  datasetSummary: {
    datasetId: string;
    datasetVersion: string;
    caseCount: number;
    answerableCount: number;
    unanswerableCount: number;
    categories: Record<string, number>;
    status: string;
  };
  metricSummary: MetricSummary;
  categoryMetrics: Record<string, MetricSummary>;
  performance: {
    latency: {
      totalMs: { p50: number | null; p95: number | null; p99: number | null };
      retrievalMs: { p50: number | null; p95: number | null; p99: number | null };
      llmMs: { p50: number | null; p95: number | null; p99: number | null };
    };
    candidateCounts: {
      vectorCandidateCount: number;
      lexicalCandidateCount: number;
      rrfCandidateCount: number;
      rerankedCount: number;
      contextItemCount: number;
    };
    estimatedContextTokens: { p50: number | null; p95: number | null; p99: number | null };
    tokenUsage: 'unavailable';
  };
  security: {
    tenantIsolationViolations: number;
    spaceIsolationViolations: number;
    versionIsolationViolations: number;
    citationSecurityViolations: number;
    promptInjectionViolations: number;
    emptyContextLlmCalls: number;
  };
  failures: Array<{
    caseId: string;
    status: CaseStatus;
    failureClass?: FailureClass;
    errorCode?: string;
  }>;
  caseResults: EvaluationCaseResult[];
  status: RunStatus;
  evaluationContractFailures: string[];
  regressionFailures: string[];
  qualityFailures: string[];
}

export interface EvaluationRunRequest {
  datasetId: string;
  datasetVersion: string;
  profileId: string;
  evaluationCommand: string;
  semanticBenchmark?: boolean;
}

export interface EvaluationRunResult {
  report: EvaluationReport;
  jsonPath: string;
  mdPath: string;
}

export interface EvaluationRunnerPort {
  run(request: EvaluationRunRequest): Promise<EvaluationRunResult>;
}

export interface EvaluationDatasetRepositoryPort {
  load(datasetId: string, version: string): Promise<EvaluationDataset>;
  loadCorpus(corpusSnapshotId: string): Promise<CorpusSnapshot>;
}

export interface EvaluationReportRepositoryPort {
  save(report: EvaluationReport): Promise<{ jsonPath: string; mdPath: string }>;
}

export interface GroundednessEvaluationInput {
  query: string;
  answer: string;
  citations: string[];
  contextChunkIds: string[];
}

export interface GroundednessEvaluationResult {
  score: number | null;
  available: boolean;
  notes?: string;
}

export interface GroundednessEvaluatorPort {
  evaluate(input: GroundednessEvaluationInput): Promise<GroundednessEvaluationResult>;
}

export const EVALUATION_CATEGORIES = [
  'exact_keyword',
  'semantic_paraphrase',
  'identifier_exact_match',
  'technical_term',
  'multi_keyword',
  'numeric_fact',
  'date_fact',
  'negative_query',
  'version_specific',
  'cross_section',
  'no_answer',
  'prompt_injection',
] as const;

export const RELEVANT_GRADE_THRESHOLD = 2;

export function isRelevant(grade: RelevanceGrade): boolean {
  return grade >= RELEVANT_GRADE_THRESHOLD;
}

export const EVALUATION_PROFILES: Record<string, EvaluationProfileConfig> = {
  'vector-baseline': {
    profileId: 'vector-baseline',
    name: 'Profile A — Vector',
    topK: 10,
    threshold: 0.3,
  },
  'hybrid-baseline': {
    profileId: 'hybrid-baseline',
    name: 'Profile B — Hybrid',
    topK: 10,
    candidateK: 50,
    threshold: 0.3,
    rrfK: 60,
  },
  'reranked-baseline': {
    profileId: 'reranked-baseline',
    name: 'Profile C — Reranked',
    retrievalCandidateK: 50,
    rerankCandidateK: 20,
    topK: 10,
    threshold: 0.3,
    rrfK: 60,
  },
  'grounded-rag-baseline': {
    profileId: 'grounded-rag-baseline',
    name: 'Profile D — Grounded RAG',
    retrievalCandidateK: 50,
    rerankCandidateK: 20,
    threshold: 0.3,
    rrfK: 60,
    contextTopK: 8,
    contextTokenBudget: 6000,
    maxChunkContextTokens: 1500,
  },
};
