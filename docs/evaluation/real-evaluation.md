# Real Evaluation (V0.5-C)

## Real Provider requirement

Semantic quality benchmark requires **real** Embedding / Reranker / LLM via V0.5-A/B Provider Registry.

- Mock is allowed only for CI contract / deterministic pipeline checks (`evaluation:contract`).
- Real benchmark never falls back to Mock.
- Missing credentials → `PROVIDER_UNAVAILABLE` / `PROVIDER_FAILURE` (not quality fail).

## Run metadata (always recorded)

- `evaluationId`, `gitCommit`, `datasetVersion`, `datasetHash`
- `corpusVersion`, `corpusHash`
- `providerSnapshot`, `configFingerprint`, `evaluationFingerprint`
- retrieval / context / generation / evaluator configs

## Profiles

| Profile | Focus |
|---------|--------|
| Vector | embedding + vector search ranking |
| Hybrid | vector + FTS + RRF (k=60) |
| Reranked | hybrid → real reranker → final ranking |
| Grounded RAG | retrieval → context → real LLM → citations → groundedness |

## Metrics

Retrieval (deterministic): HitRate@5/10, Recall@5/10, Precision@5/10, MRR@10, nDCG@10.

Context: measured on **actual LLM context**, not retrieval TopK alone.

Citation: validity / source hit / unsupported rate via server-owned C1..Cn mapping.

Answer: non-empty rate, abstention correctness, reference similarity, groundedness.

**No composite score. No winner ranking.**

## Denominators

Every metric reports `sampleCount` / `failureCount`. Provider failures are classified `PROVIDER_FAILURE` and excluded from quality averages with explicit counts — never silently dropped.

## Cost control

Real runs use bounded concurrency and V0.5-A/B retry policy (429/timeout → PROVIDER_FAILURE, not quality fail).
