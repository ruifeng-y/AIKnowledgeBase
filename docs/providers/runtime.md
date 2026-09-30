# Provider Runtime Resolution (V0.5-B)

## Single Source of Truth

```text
Environment → packages/config → Normalized Provider Config → ProviderRegistry → Adapter
```

Adapters must not read `process.env` for provider settings.

## API Runtime

`RetrievalModule` resolves Embedding / Reranker / LLM via `ProviderRegistry` only.

## Worker Runtime

```text
EmbeddingService.createFromEnv() → loadEmbeddingProviderConfig → resolveEmbeddingProvider
```

Production worker **never** defaults to Mock. `createDefault()` is deprecated and delegates to `createFromEnv`.

Mock requires explicit `providerId=mock`. Production + mock is rejected unless `EVALUATION_MODE=mock`.

## Config keys (legacy + canonical)

`EMBEDDING_PROVIDER[_ID]`, `EMBEDDING_MODEL[_ID]`, `EMBEDDING_ENDPOINT`, `EMBEDDING_API_KEY`, `EMBEDDING_DIMENSION(S)`, `EMBEDDING_TIMEOUT_MS`, `EMBEDDING_MAX_RETRIES`, `EMBEDDING_BATCH_SIZE`  
`RERANKER_*`, `LLM_*` analogous.

## Snapshot / Fingerprint

`buildProviderRuntimeSnapshot()` returns provider/model/dimensions + `configFingerprint` (non-secret). Changing model/endpoint/timeout/dimensions changes the fingerprint. API keys are excluded.

## Production Mock Guard

`NODE_ENV=production` + `providerId=mock` is rejected for embedding, reranker, and llm unless `EVALUATION_MODE=mock`. Incomplete production config raises `PROVIDER_NOT_CONFIGURED` and never silently falls back to Mock.
