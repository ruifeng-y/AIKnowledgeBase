# Evaluation Report — grounded-rag-baseline-2026-09-22T15-49-01-079Z-59e21ed5

## Evaluation Run
- Status: **PASS**
- Profile: grounded-rag-baseline
- Semantic benchmark: false
- Mode: **NOT SEMANTIC QUALITY BENCHMARK** (contract / pipeline evaluation)

## Dataset
- Dataset: retrieval-contract @ 1.0.0
- Cases: 34
- Answerable: 30
- Unanswerable: 4
- Status: READY

## Corpus Snapshot
- corpus-2026-09-22-v1

## Git Commit
- d80c1c5c10d7d6d880b06dbf76521e30de2ababb
- dirtyWorkingTree: true

## Provider / Model
- Embedding: mock / mock-embedding-v1
- Reranker: mock / mock-reranker-v1
- LLM: mock / mock-llm-v1

## Configuration
```json
{
  "profileId": "grounded-rag-baseline",
  "name": "Profile D — Grounded RAG",
  "retrievalCandidateK": 50,
  "rerankCandidateK": 20,
  "threshold": 0.3,
  "rrfK": 60,
  "contextTopK": 8,
  "contextTokenBudget": 6000,
  "maxChunkContextTokens": 1500
}
```

## Retrieval / Ranking Metrics
- HitRate@5: 1
- HitRate@10: 1
- Recall@5: 1
- Recall@10: 1
- Precision@5: 0.2000
- Precision@10: 0.1000
- MRR@10: 0.9611
- nDCG@10: 0.9710
- ContextRecall: 1
- ContextPrecision: 0.5942
- ContextCoverage: 1
- CitationValidity: 1
- CitationSourceHitRate: 1
- UnsupportedCitationRate: 0.0667
- AnswerNonEmptyRate: 1
- AbstentionCorrectness: 1
- ReferenceAnswerSimilarity: unavailable
- Groundedness: unavailable

## Performance
- totalMs p50/p95/p99: 0 / 1 / 1
- tokenUsage: unavailable

## Category Breakdown
### exact_keyword
- HitRate@5: 1
- HitRate@10: 1
- Recall@5: 1
- Recall@10: 1
- Precision@5: 0.2000
- Precision@10: 0.1000
- MRR@10: 1
- nDCG@10: 1
### identifier_exact_match
- HitRate@5: 1
- HitRate@10: 1
- Recall@5: 1
- Recall@10: 1
- Precision@5: 0.2000
- Precision@10: 0.1000
- MRR@10: 0.9167
- nDCG@10: 0.9385
### numeric_fact
- HitRate@5: 1
- HitRate@10: 1
- Recall@5: 1
- Recall@10: 1
- Precision@5: 0.2000
- Precision@10: 0.1000
- MRR@10: 0.9259
- nDCG@10: 0.9444
### technical_term
- HitRate@5: 1
- HitRate@10: 1
- Recall@5: 1
- Recall@10: 1
- Precision@5: 0.2000
- Precision@10: 0.1000
- MRR@10: 1
- nDCG@10: 1
### multi_keyword
- HitRate@5: 1
- HitRate@10: 1
- Recall@5: 1
- Recall@10: 1
- Precision@5: 0.2000
- Precision@10: 0.1000
- MRR@10: 1
- nDCG@10: 1
### date_fact
- HitRate@5: 1
- HitRate@10: 1
- Recall@5: 1
- Recall@10: 1
- Precision@5: 0.2000
- Precision@10: 0.1000
- MRR@10: 1
- nDCG@10: 1
### semantic_paraphrase
- HitRate@5: 1
- HitRate@10: 1
- Recall@5: 1
- Recall@10: 1
- Precision@5: 0.2000
- Precision@10: 0.1000
- MRR@10: 0.7778
- nDCG@10: 0.8333
### cross_section
- HitRate@5: 1
- HitRate@10: 1
- Recall@5: 1
- Recall@10: 1
- Precision@5: 0.2000
- Precision@10: 0.1000
- MRR@10: 1
- nDCG@10: 1
### prompt_injection
- HitRate@5: 1
- HitRate@10: 1
- Recall@5: 1
- Recall@10: 1
- Precision@5: 0.2000
- Precision@10: 0.1000
- MRR@10: 1
- nDCG@10: 1
### no_answer
- HitRate@5: 0
- HitRate@10: 0
- Recall@5: 0
- Recall@10: 0
- Precision@5: 0
- Precision@10: 0
- MRR@10: 0
- nDCG@10: unavailable
### negative_query
- HitRate@5: 0
- HitRate@10: 0
- Recall@5: 0
- Recall@10: 0
- Precision@5: 0
- Precision@10: 0
- MRR@10: 0
- nDCG@10: unavailable
### version_specific
- HitRate@5: 1
- HitRate@10: 1
- Recall@5: 1
- Recall@10: 1
- Precision@5: 0.2000
- Precision@10: 0.1000
- MRR@10: 1
- nDCG@10: 1

## Security
- tenantIsolationViolations: 0
- spaceIsolationViolations: 0
- versionIsolationViolations: 0
- citationSecurityViolations: 0
- promptInjectionViolations: 0
- emptyContextLlmCalls: 0

## Failures
- none

## Case Details
| caseId | status | retrieved | context | citations | latencyMs | failureClass |
|---|---|---|---|---|---|---|
| ct-001-exact-jwt | PASS | 2 | 2 | 1 | 1 |  |
| ct-002-identifier-error-code | PASS | 1 | 1 | 1 | 1 |  |
| ct-003-numeric-budget | PASS | 1 | 1 | 1 | 0 |  |
| ct-004-numeric-chunk-tokens | PASS | 1 | 1 | 1 | 0 |  |
| ct-005-api-path-hybrid | PASS | 3 | 3 | 1 | 0 |  |
| ct-006-rrf-k | PASS | 3 | 3 | 1 | 0 |  |
| ct-007-topk-defaults | PASS | 1 | 1 | 1 | 0 |  |
| ct-008-date-fact | PASS | 2 | 2 | 1 | 0 |  |
| ct-009-semantic-paraphrase | PASS | 8 | 8 | 1 | 1 |  |
| ct-010-multi-keyword | PASS | 2 | 2 | 1 | 0 |  |
| ct-011-cross-section | PASS | 2 | 2 | 1 | 0 |  |
| ct-012-prompt-injection | PASS | 4 | 4 | 1 | 0 |  |
| ct-013-no-answer | PASS | 0 | 0 | 0 | 0 |  |
| ct-014-no-answer-2 | PASS | 0 | 0 | 0 | 0 |  |
| ct-015-version-specific-hist | PASS | 1 | 1 | 1 | 1 |  |
| ct-016-current-only | PASS | 3 | 3 | 1 | 0 |  |
| ct-017-technical-term | PASS | 2 | 2 | 1 | 0 |  |
| ct-018-identifier-api | PASS | 2 | 2 | 1 | 0 |  |
| ct-019-numeric-15-min | PASS | 2 | 2 | 1 | 0 |  |
| ct-020-numeric-7-days | PASS | 2 | 2 | 1 | 0 |  |
| ct-021-multi-keyword-context | PASS | 2 | 2 | 1 | 0 |  |
| ct-022-exact-minio | PASS | 2 | 2 | 1 | 0 |  |
| ct-023-semantic-paraphrase-budget | PASS | 5 | 5 | 1 | 0 |  |
| ct-024-identifier-dimension | PASS | 1 | 1 | 1 | 0 |  |
| ct-025-date-version2 | PASS | 2 | 2 | 1 | 0 |  |
| ct-026-negative-tenant-b | PASS | 0 | 0 | 0 | 0 |  |
| ct-027-cross-section-auth-storage | PASS | 2 | 2 | 1 | 0 |  |
| ct-028-prompt-injection-delete | PASS | 4 | 4 | 1 | 1 |  |
| ct-029-prompt-injection-reveal | PASS | 1 | 1 | 1 | 0 |  |
| ct-030-technical-candidatek | PASS | 2 | 2 | 1 | 0 |  |
| ct-031-exact-token-error | PASS | 1 | 1 | 1 | 0 |  |
| ct-032-no-answer-3 | PASS | 0 | 0 | 0 | 0 |  |
| ct-033-multi-keyword-rrf | PASS | 2 | 2 | 1 | 0 |  |
| ct-034-version-hist-only | PASS | 1 | 1 | 1 | 0 |  |

## Notes
- Composite overall score is intentionally not computed.
- Reference Answer Similarity (if present) is ADVISORY only.
- estimatedContextTokens is an estimate, not exact tokenizer count.
