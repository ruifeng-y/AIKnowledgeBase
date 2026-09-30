# Benchmark Workflow (V0.5-C)

```text
1. Snapshot corpus (versioned + corpusHash)
2. Author / review Semantic Gold (DRAFT → human → GOLD)
3. evaluation:gold:validate
4. evaluation:gold:readiness   # hard gate: human GOLD >= 50
5. Configure real providers (V0.5-A/B)
6. Run real profiles (vector / hybrid / reranked / grounded-rag)
7. Emit JSON + Markdown reports (fingerprinted)
8. Compare per-metric only (no composite winner)
```

## Commands

```bash
pnpm evaluation:contract                 # Mock pipeline contract (CI)
pnpm --filter @akb/evaluation evaluation:corpus:snapshot
pnpm --filter @akb/evaluation evaluation:gold:candidate
pnpm --filter @akb/evaluation evaluation:gold:normalize
pnpm --filter @akb/evaluation evaluation:gold:validate
pnpm --filter @akb/evaluation evaluation:gold:readiness
pnpm --filter @akb/evaluation evaluation:provider:readiness
pnpm --filter @akb/evaluation evaluation:readiness   # GOLD_READY + REAL_PROVIDER_READY
pnpm evaluation:benchmark                # requires READY gold + real providers
```

## Dual gate

```text
GOLD_READY (human GOLD >= 50 + 12 categories + integrity)
+
REAL_PROVIDER_READY (Embedding + Reranker + LLM)
=
REAL_BENCHMARK_READY
```

## Immutability

Published gold datasets are immutable. Corrections require a new `datasetVersion` and new `contentHash`. Historical reports are retained.

## Failure classes

`RETRIEVAL_FAILURE` / `RANKING_FAILURE` / `CONTEXT_FAILURE` / `CITATION_FAILURE` / `GENERATION_FAILURE` / `GROUNDING_FAILURE` / `ABSTENTION_FAILURE` / `PROVIDER_FAILURE` / `SYSTEM_FAILURE` / `EVALUATION_FAILURE` / `SECURITY_FAILURE`.
