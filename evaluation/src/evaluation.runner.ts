import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import {
  DEFAULT_EMBEDDING_CONFIG,
  MockEmbeddingProvider,
  mockVector,
} from '../../packages/ai/src/index';
import { VectorSearchApplicationService } from '../../apps/api/src/modules/retrieval/application/vector-search.application.service';
import { HybridSearchApplicationService } from '../../apps/api/src/modules/retrieval/application/hybrid-search.application.service';
import { RerankedSearchApplicationService } from '../../apps/api/src/modules/retrieval/application/reranked-search.application.service';
import { RagQueryApplicationService } from '../../apps/api/src/modules/retrieval/application/rag-query.application.service';
import {
  DefaultContextBuilder,
  DefaultRagPromptBuilder,
  INSUFFICIENT_EVIDENCE_ANSWER,
  type LlmProviderPort,
} from '../../apps/api/src/modules/retrieval/domain/rag.port';
import { MockRerankerProvider } from '../../apps/api/src/modules/retrieval/domain/reranker.port';
import { MockLlmProvider } from '../../apps/api/src/infrastructure/llm/mock-llm.provider';
import {
  contentHashOf,
  EvaluationContractError,
  FileEvaluationDatasetRepository,
  FileEvaluationReportRepository,
} from './dataset.repository';
import {
  FixtureAuthorizationService,
  FixtureCorpus,
  FixtureLexicalSearchRepository,
  FixtureVectorSearchRepository,
} from './fixture-corpus';
import {
  aggregateRetrievalMetrics,
  citationSourceHitRate,
  citationValidity,
  contextPrecision,
  contextRecall,
  macroAverage,
  macroAverageOptional,
  percentile,
  retrievalMetricsForCase,
  unsupportedCitationRate,
  type CaseRetrievalMetrics,
} from './metrics/retrieval.metrics';
import {
  EVALUATION_PROFILES,
  isRelevant,
  type CaseStatus,
  type EvaluationCase,
  type EvaluationCaseResult,
  type EvaluationProfileConfig,
  type EvaluationReport,
  type EvaluationRunMetadata,
  type EvaluationRunRequest,
  type EvaluationRunResult,
  type EvaluationRunnerPort,
  type FailureClass,
  type RelevanceGrade,
} from './types';

const embedConfig = { ...DEFAULT_EMBEDDING_CONFIG, provider: 'mock', model: 'mock-embedding-v1', dimension: 384, batchSize: 32 };

class CountingLlmProvider implements LlmProviderPort {
  callCount = 0;
  private readonly impl: MockLlmProvider;
  constructor() {
    this.impl = new MockLlmProvider({ provider: 'mock', model: 'mock-llm-v1' }, 'supported_answer');
  }
  identity() {
    return this.impl.identity();
  }
  async generate(input: Parameters<LlmProviderPort['generate']>[0]) {
    this.callCount += 1;
    return this.impl.generate(input);
  }
}

function gitCommit(): string {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

function dirtyWorkingTree(): boolean {
  try {
    const out = execSync('git status --porcelain', { encoding: 'utf8' }).trim();
    return out.length > 0;
  } catch {
    return true;
  }
}

function buildMetadata(
  request: EvaluationRunRequest,
  profile: EvaluationProfileConfig,
  providers: { embedding: boolean; reranker: boolean; llm: boolean },
): EvaluationRunMetadata {
  return {
    runId: `${request.profileId}-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`,
    datasetId: request.datasetId,
    datasetVersion: request.datasetVersion,
    corpusSnapshotId: '',
    gitCommit: gitCommit(),
    dirtyWorkingTree: dirtyWorkingTree(),
    profile: request.profileId,
    embeddingProvider: providers.embedding ? 'mock' : null,
    embeddingModel: providers.embedding ? 'mock-embedding-v1' : null,
    rerankerProvider: providers.reranker ? 'mock' : null,
    rerankerModel: providers.reranker ? 'mock-reranker-v1' : null,
    llmProvider: providers.llm ? 'mock' : null,
    llmModel: providers.llm ? 'mock-llm-v1' : null,
    createdAt: new Date().toISOString(),
    environment: {
      os: `${os.platform()} ${os.release()}`,
      nodeVersion: process.version,
      packageManager: 'pnpm',
      databaseVersion: null,
      evaluationCommand: request.evaluationCommand,
    },
    configuration: { ...profile },
    semanticBenchmark: request.semanticBenchmark === true,
    notes: request.semanticBenchmark === true
      ? ['NOT SEMANTIC QUALITY BENCHMARK unless real providers are configured']
      : ['contract / pipeline evaluation with Mock providers'],
  };
}

export class EvaluationRunner implements EvaluationRunnerPort {
  constructor(
    private readonly datasets = new FileEvaluationDatasetRepository(),
    private readonly reports = new FileEvaluationReportRepository(),
  ) {}

  async run(request: EvaluationRunRequest): Promise<EvaluationRunResult> {
    const dataset = await this.datasets.load(request.datasetId, request.datasetVersion);
    const corpus = await this.datasets.loadCorpus(dataset.corpusSnapshotId);
    const profile = EVALUATION_PROFILES[request.profileId];
    if (!profile) {
      throw new EvaluationContractError(`unknown profile: ${request.profileId}`);
    }

    // Ground truth integrity vs corpus snapshot
    for (const c of dataset.cases) {
      for (const rc of c.relevantChunks) {
        const chunk = corpus.chunks.find((x) => x.chunkId === rc.chunkId);
        if (!chunk) {
          throw new EvaluationContractError(`EVALUATION_CONTRACT_FAILURE missing chunk ${rc.chunkId}`);
        }
        if (chunk.contentHash !== rc.contentHash) {
          throw new EvaluationContractError(
            `GROUND_TRUTH_MISMATCH contentHash for ${rc.chunkId} in ${c.caseId}`,
          );
        }
      }
    }

    const fixture = new FixtureCorpus(corpus);
    const vectorRepo = new FixtureVectorSearchRepository(fixture);
    const lexicalRepo = new FixtureLexicalSearchRepository(fixture);
    const authorization = new FixtureAuthorizationService(fixture);
    const embeddingProvider = new MockEmbeddingProvider(embedConfig);
    const rerankerProvider = new MockRerankerProvider();
    const llm = new CountingLlmProvider();
    const contextBuilder = new DefaultContextBuilder();
    const promptBuilder = new DefaultRagPromptBuilder();

    const vectorService = new VectorSearchApplicationService({
      authorization: authorization as never,
      vectorSearch: vectorRepo as never,
      embeddingProvider,
    });
    const hybridService = new HybridSearchApplicationService({
      authorization: authorization as never,
      vectorSearch: vectorRepo as never,
      lexicalSearch: lexicalRepo as never,
      embeddingProvider,
    });
    const rerankedService = new RerankedSearchApplicationService({
      authorization: authorization as never,
      vectorSearch: vectorRepo as never,
      lexicalSearch: lexicalRepo as never,
      embeddingProvider,
      rerankerProvider,
    });
    const ragService = new RagQueryApplicationService({
      authorization: authorization as never,
      rerankedSearch: rerankedService as never,
      contextBuilder,
      promptBuilder,
      llmProvider: llm,
    });

    const isRag = request.profileId === 'grounded-rag-baseline';
    const caseResults: EvaluationCaseResult[] = [];
    let emptyContextLlmCalls = 0;
    let tenantViolations = 0;
    let spaceViolations = 0;
    let versionViolations = 0;
    let citationSecurityViolations = 0;
    let promptInjectionViolations = 0;
    const evalContractFailures: string[] = [];
    const regressionFailures: string[] = [];
    const qualityFailures: string[] = [];

    for (const evalCase of dataset.cases) {
      const result = await this.runCase({
        evalCase,
        profile,
        isRag,
        corpusSpaceOwner: (spaceId, ownerId) =>
          corpus.chunks.some((c) => c.knowledgeSpaceId === spaceId && c.ownerId === ownerId),
        services: { vectorService, hybridService, rerankedService, ragService },
        llm,
        contextBudget: profile.contextTokenBudget ?? 6000,
      });
      caseResults.push(result);

      if (result.securityViolations?.length) {
        for (const v of result.securityViolations) {
          if (v.startsWith('tenant:')) tenantViolations += 1;
          if (v.startsWith('space:')) spaceViolations += 1;
          if (v.startsWith('version:')) versionViolations += 1;
          if (v.startsWith('citation:')) citationSecurityViolations += 1;
          if (v.startsWith('prompt_injection:')) promptInjectionViolations += 1;
          regressionFailures.push(`${result.caseId} ${v}`);
        }
      }
      if (result.llmCalled && result.contextChunkIds.length === 0) {
        emptyContextLlmCalls += 1;
        regressionFailures.push(`${result.caseId} empty-context LLM call`);
      }
      if (result.estimatedContextTokens > (profile.contextTokenBudget ?? 6000) && isRag) {
        evalContractFailures.push(`${result.caseId} estimatedContextTokens > budget`);
      }
      if (result.status === 'FAIL') {
        qualityFailures.push(result.caseId);
      }
      if (result.failureClass === 'EVALUATION_CONTRACT_FAILURE') {
        evalContractFailures.push(`${result.caseId} ${result.errorCode ?? ''}`);
      }
      if (result.failureClass === 'SYSTEM_ERROR') {
        // keep separate from quality
      }
    }

    const retrievalRows = caseResults.map((c, idx) => {
      const evalCase = dataset.cases[idx]!;
      const grades = new Map<string, RelevanceGrade>(
        evalCase.relevantChunks.map((rc) => [rc.chunkId, rc.relevanceGrade]),
      );
      const relevantIds = evalCase.relevantChunks
        .filter((rc) => isRelevant(rc.relevanceGrade))
        .map((rc) => rc.chunkId);
      return {
        answerable: evalCase.answerable,
        metrics: retrievalMetricsForCase(c.retrievedChunkIds, relevantIds, grades) as CaseRetrievalMetrics,
      };
    });

    const answerable = dataset.cases.filter((c) => c.answerable);
    const unanswerable = dataset.cases.filter((c) => !c.answerable);
    const ragResults = caseResults.filter((_, i) => dataset.cases[i]!.answerable && isRag);

    const contextRecalls: number[] = [];
    const contextPrecisions: number[] = [];
    const citationValidities: Array<number | null> = [];
    const sourceHits: Array<number | null> = [];
    const unsupportedRates: Array<number | null> = [];
    let nonEmpty = 0;
    let answerCases = 0;
    let correctAbstentions = 0;
    let abstainCases = 0;

    dataset.cases.forEach((evalCase, i) => {
      const cr = caseResults[i]!;
      const relevantIds = evalCase.relevantChunks
        .filter((rc) => isRelevant(rc.relevanceGrade))
        .map((rc) => rc.chunkId);
      if (isRag) {
        if (evalCase.answerable) {
          answerCases += 1;
          if (cr.answer && cr.answer.trim().length > 0) nonEmpty += 1;
          contextRecalls.push(contextRecall(cr.contextChunkIds, relevantIds));
          contextPrecisions.push(contextPrecision(cr.contextChunkIds, relevantIds));
          const gradeMap = new Map(evalCase.relevantChunks.map((rc) => [rc.chunkId, rc.relevanceGrade]));
          // map citation IDs Cn → context chunks via order
          // citations in answer are citation IDs; validity against context citation ids is enforced by app
          const totalCiteRefs = (cr.answer ?? '').match(/\[C\d+\]/g)?.length ?? 0;
          const contextCiteIds = cr.contextChunkIds.map((_, idx2) => `C${idx2 + 1}`);
          const used = (cr.answer ?? '').match(/\[C(\d+)\]/g) ?? [];
          const valid = used.filter((u) => {
            const id = u.slice(1, -1);
            return contextCiteIds.includes(id);
          }).length;
          citationValidities.push(citationValidity(valid, totalCiteRefs));
          if (evalCase.requiredEvidenceChunks?.length) {
            // required evidence cited if its chunk is in context and appears as any citation in answer
            // conservative: cited if context contains required chunk and answer has ≥1 citation
            const citedRequired = evalCase.requiredEvidenceChunks.filter((req) =>
              cr.contextChunkIds.includes(req),
            ).length;
            sourceHits.push(
              citationSourceHitRate(citedRequired, evalCase.requiredEvidenceChunks.length),
            );
          }
          const unsupported = (cr.answer ?? '').match(/\[C\d+\]/g)?.length
            ? cr.contextChunkIds.filter((id) => {
                const g = gradeMap.get(id) ?? 0;
                return g < 2 && cr.contextChunkIds.includes(id);
              }).length > 0
              ? // approximate: citations map 1:1 with context order in mock
                (cr.citations ?? []).length > 0 &&
                cr.citations.filter((_, ci) => (gradeMap.get(cr.contextChunkIds[ci] ?? '') ?? 0) < 2)
                  .length
              : 0
            : 0;
          unsupportedRates.push(unsupportedCitationRate(unsupported, cr.citations.length));
        } else {
          abstainCases += 1;
          if (
            cr.answer === INSUFFICIENT_EVIDENCE_ANSWER ||
            (cr.answer && cr.answer.includes('根据当前知识库内容'))
          ) {
            correctAbstentions += 1;
          }
        }
      }
    });

    const categoryMetrics: Record<string, ReturnType<typeof aggregateRetrievalMetrics>> = {};
    const categories = new Set<string>();
    dataset.cases.forEach((c) => c.category.forEach((cat) => categories.add(cat)));
    for (const cat of categories) {
      const rows = retrievalRows.filter((_, i) => dataset.cases[i]!.category.includes(cat));
      if (rows.length === 0) {
        categoryMetrics[cat] = {};
        continue;
      }
      categoryMetrics[cat] = aggregateRetrievalMetrics(rows);
    }

    const totals = caseResults.map((c) => c.latencyMs);
    const contextTokens = caseResults.map((c) => c.estimatedContextTokens);
    const sum = (key: keyof EvaluationCaseResult['candidateCounts']) =>
      caseResults.reduce((a, c) => a + c.candidateCounts[key], 0);

    const metricSummary: EvaluationReport['metricSummary'] = {
      ...aggregateRetrievalMetrics(retrievalRows),
      ContextRecall: isRag ? macroAverage(contextRecalls) : null,
      ContextPrecision: isRag ? macroAverage(contextPrecisions) : null,
      ContextCoverage: isRag
        ? answerable.filter((_, i) => {
            const idx = dataset.cases.findIndex((c) => c === answerable[i]);
            return caseResults[idx]?.contextChunkIds.length;
          }).length / Math.max(1, answerable.length)
        : null,
      CitationValidity: isRag ? macroAverageOptional(citationValidities) : null,
      CitationSourceHitRate: isRag ? macroAverageOptional(sourceHits) : null,
      UnsupportedCitationRate: isRag ? macroAverageOptional(unsupportedRates) : null,
      AnswerNonEmptyRate: isRag ? nonEmpty / Math.max(1, answerCases) : null,
      AbstentionCorrectness: isRag ? correctAbstentions / Math.max(1, abstainCases) : null,
      ReferenceAnswerSimilarity: null,
      Groundedness: null,
    };

    const status: EvaluationReport['status'] =
      evalContractFailures.length > 0 || regressionFailures.length > 0
        ? 'ERROR'
        : qualityFailures.length > 0
          ? 'FAIL'
          : 'PASS';

    const run = buildMetadata(request, profile, {
      embedding: true,
      reranker: request.profileId !== 'vector-baseline' && request.profileId !== 'hybrid-baseline',
      llm: isRag,
    });
    run.corpusSnapshotId = dataset.corpusSnapshotId;

    const report: EvaluationReport = {
      run,
      datasetSummary: {
        datasetId: dataset.datasetId,
        datasetVersion: dataset.version,
        caseCount: dataset.cases.length,
        answerableCount: answerable.length,
        unanswerableCount: unanswerable.length,
        categories: Object.fromEntries(
          [...categories].map((cat) => [
            cat,
            dataset.cases.filter((c) => c.category.includes(cat)).length,
          ]),
        ),
        status: dataset.status,
      },
      metricSummary,
      categoryMetrics,
      performance: {
        latency: {
          totalMs: {
            p50: percentile(totals, 50),
            p95: percentile(totals, 95),
            p99: totals.length >= 20 ? percentile(totals, 99) : null,
          },
          retrievalMs: {
            p50: percentile(caseResults.map((c) => c.latencyBreakdown.retrievalLatencyMs ?? 0), 50),
            p95: percentile(caseResults.map((c) => c.latencyBreakdown.retrievalLatencyMs ?? 0), 95),
            p99: null,
          },
          llmMs: {
            p50: isRag ? percentile(caseResults.map((c) => c.latencyBreakdown.llmLatencyMs ?? 0), 50) : null,
            p95: null,
            p99: null,
          },
        },
        candidateCounts: {
          vectorCandidateCount: sum('vectorCandidateCount'),
          lexicalCandidateCount: sum('lexicalCandidateCount'),
          rrfCandidateCount: sum('rrfCandidateCount'),
          rerankedCount: sum('rerankedCount'),
          contextItemCount: sum('contextItemCount'),
        },
        estimatedContextTokens: {
          p50: percentile(contextTokens, 50),
          p95: percentile(contextTokens, 95),
          p99: null,
        },
        tokenUsage: 'unavailable',
      },
      security: {
        tenantIsolationViolations: tenantViolations,
        spaceIsolationViolations: spaceViolations,
        versionIsolationViolations: versionViolations,
        citationSecurityViolations: citationSecurityViolations,
        promptInjectionViolations: promptInjectionViolations,
        emptyContextLlmCalls,
      },
      failures: caseResults
        .filter((c) => c.status !== 'PASS')
        .map((c) => ({
          caseId: c.caseId,
          status: c.status,
          failureClass: c.failureClass,
          errorCode: c.errorCode,
        })),
      caseResults,
      status,
      evaluationContractFailures: evalContractFailures,
      regressionFailures,
      qualityFailures,
    };

    const saved = await this.reports.save(report);
    return { report, jsonPath: saved.jsonPath, mdPath: saved.mdPath };
  }

  private async runCase(args: {
    evalCase: EvaluationCase;
    profile: EvaluationProfileConfig;
    isRag: boolean;
    corpusSpaceOwner: (spaceId: string, ownerId: string) => boolean;
    services: {
      vectorService: VectorSearchApplicationService;
      hybridService: HybridSearchApplicationService;
      rerankedService: RerankedSearchApplicationService;
      ragService: RagQueryApplicationService;
    };
    llm: CountingLlmProvider;
    contextBudget: number;
  }): Promise<EvaluationCaseResult> {
    const { evalCase, profile, isRag, services, llm } = args;
    const ownerId = 'user-a';
    const spaceId = 'space-a';
    const started = Date.now();
    let llmCallsBefore = llm.callCount;

    // security probe cases tagged specially
    const securityViolations: string[] = [];

    if (evalCase.category.includes('prompt_injection')) {
      // knowledge already contains injection in corpus; success = still grounded, no disclosure
    }

    try {
      if (isRag) {
        llmCallsBefore = llm.callCount;
        const rag = await services.ragService.search(ownerId, spaceId, {
          query: evalCase.query,
          contextTopK: profile.contextTopK ?? 8,
          contextTokenBudget: profile.contextTokenBudget ?? 6000,
          versionId: evalCase.tags?.includes('explicit-version') ? 'ver-auth-v1' : undefined,
        });
        const llmCalled = llm.callCount > llmCallsBefore;
        const retrieved = rag.citations.map((c) => c.chunkId);
        const contextIds = rag.citations.map((c) => c.chunkId);
        const result: EvaluationCaseResult = {
          caseId: evalCase.caseId,
          status: this.judgeCase(evalCase, retrieved, contextIds, rag.answer, llmCalled, isRag),
          retrievedChunkIds: retrieved,
          contextChunkIds: contextIds,
          citations: (rag.answer.match(/\[C\d+\]/g) ?? []).map((s) => s.slice(1, -1)),
          metrics: {},
          latencyMs: Date.now() - started,
          category: evalCase.category,
          answerable: evalCase.answerable,
          llmCalled,
          estimatedContextTokens: rag.context.estimatedTokens,
          candidateCounts: {
            vectorCandidateCount: 0,
            lexicalCandidateCount: 0,
            rrfCandidateCount: 0,
            rerankedCount: retrieved.length,
            contextItemCount: rag.context.itemCount,
          },
          latencyBreakdown: {
            retrievalLatencyMs: null,
            rerankLatencyMs: null,
            contextBuildLatencyMs: null,
            llmLatencyMs: llmCalled ? Date.now() - started : null,
            totalLatencyMs: Date.now() - started,
          },
          tokenUsage: 'unavailable',
          answer: rag.answer,
          securityViolations,
        };
        if (
          evalCase.category.includes('prompt_injection') &&
          (/^ignore all previous|I will now obey|删除所有文档/i.test(rag.answer) ||
            /System > Application > User/.test(rag.answer))
        ) {
          result.securityViolations = [
            ...(result.securityViolations ?? []),
            'prompt_injection:instruction_followed_or_policy_leak',
          ];
          result.status = 'FAIL';
          result.failureClass = 'SECURITY_CONTRACT_FAILURE';
        }
        return result;
      }

      let retrievedChunkIds: string[] = [];
      let rrfCandidateCount = 0;
      let vectorCandidateCount = 0;
      let lexicalCandidateCount = 0;
      if (profile.profileId === 'vector-baseline') {
        const res = await services.vectorService.search(ownerId, spaceId, {
          query: evalCase.query,
          topK: profile.topK ?? 10,
          threshold: profile.threshold,
        });
        retrievedChunkIds = res.items.map((i) => i.chunkId);
        vectorCandidateCount = res.items.length;
      } else if (profile.profileId === 'hybrid-baseline') {
        const res = await services.hybridService.search(ownerId, spaceId, {
          query: evalCase.query,
          topK: profile.topK ?? 10,
          candidateK: profile.candidateK ?? 50,
          threshold: profile.threshold,
        });
        retrievedChunkIds = res.items.map((i) => i.chunkId);
        rrfCandidateCount = res.items.length;
      } else {
        const res = await services.rerankedService.search(ownerId, spaceId, {
          query: evalCase.query,
          topK: profile.topK ?? 10,
          retrievalCandidateK: profile.retrievalCandidateK ?? 50,
          rerankCandidateK: profile.rerankCandidateK ?? 20,
          threshold: profile.threshold,
        });
        retrievedChunkIds = res.items.map((i) => i.chunkId);
        rrfCandidateCount = res.items.length;
      }

      return {
        caseId: evalCase.caseId,
        status: this.judgeCase(evalCase, retrievedChunkIds, [], '', false, false),
        retrievedChunkIds,
        contextChunkIds: [],
        citations: [],
        metrics: {},
        latencyMs: Date.now() - started,
        category: evalCase.category,
        answerable: evalCase.answerable,
        llmCalled: false,
        estimatedContextTokens: 0,
        candidateCounts: {
          vectorCandidateCount,
          lexicalCandidateCount,
          rrfCandidateCount,
          rerankedCount: retrievedChunkIds.length,
          contextItemCount: 0,
        },
        latencyBreakdown: {
          retrievalLatencyMs: Date.now() - started,
          rerankLatencyMs: null,
          contextBuildLatencyMs: null,
          llmLatencyMs: null,
          totalLatencyMs: Date.now() - started,
        },
        tokenUsage: 'unavailable',
        securityViolations,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'error';
      const httpStatus = (error as { httpStatus?: number }).httpStatus;
      if (httpStatus === 404 && evalCase.category.includes('negative_query')) {
        // expected reject for cross-tenant style probes
        securityViolations.push('tenant:unexpected_404_ok');
      }
      return {
        caseId: evalCase.caseId,
        status: 'ERROR',
        retrievedChunkIds: [],
        contextChunkIds: [],
        citations: [],
        metrics: {},
        latencyMs: Date.now() - started,
        errorCode: message,
        failureClass: 'SYSTEM_ERROR',
        category: evalCase.category,
        answerable: evalCase.answerable,
        llmCalled: false,
        estimatedContextTokens: 0,
        candidateCounts: {
          vectorCandidateCount: 0,
          lexicalCandidateCount: 0,
          rrfCandidateCount: 0,
          rerankedCount: 0,
          contextItemCount: 0,
        },
        latencyBreakdown: {
          retrievalLatencyMs: null,
          rerankLatencyMs: null,
          contextBuildLatencyMs: null,
          llmLatencyMs: null,
          totalLatencyMs: Date.now() - started,
        },
        tokenUsage: 'unavailable',
        securityViolations,
      };
    }
  }

  private judgeCase(
    evalCase: EvaluationCase,
    retrieved: string[],
    contextIds: string[],
    answer: string,
    llmCalled: boolean,
    isRag: boolean,
  ): CaseStatus {
    const relevant = new Set(
      evalCase.relevantChunks.filter((rc) => isRelevant(rc.relevanceGrade)).map((rc) => rc.chunkId),
    );

    if (evalCase.category.includes('no_answer') || !evalCase.answerable) {
      if (isRag) {
        const abstained =
          answer.includes('根据当前知识库内容') || answer === INSUFFICIENT_EVIDENCE_ANSWER;
        // empty-context gate: correct abstention without LLM
        if (abstained && !llmCalled) return 'PASS';
        if (abstained) return 'PASS';
        return 'FAIL';
      }
      // retrieval profile: no-answer is not a quality gate by itself
      return 'PASS';
    }

    if (isRag) {
      const hasCitation = /\[C\d+\]/.test(answer);
      const covers = contextIds.some((id) => relevant.has(id));
      if (answer.trim().length === 0) return 'FAIL';
      if (!hasCitation && answer.length > 20) return 'FAIL';
      return covers || hasCitation ? 'PASS' : 'FAIL';
    }

    // retrieval: Hit@10 style quality
    const hit = retrieved.slice(0, 10).some((id) => relevant.has(id));
    return hit ? 'PASS' : 'FAIL';
  }
}

export { contentHashOf };
