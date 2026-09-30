# Provider Health Check (V0.5-B)

`checkEmbedding` / `checkReranker` / `checkLlm` / `checkAll` use **minimal** real requests:

| Capability | Probe |
|------------|--------|
| Embedding | one short input → finite vector + expected dimensions |
| Reranker | 1 query + 2 candidates → finite scores |
| LLM | tiny grounded prompt → non-empty answer |

## Status

`healthy` | `unhealthy` | `not_configured`

Mapped to `PROVIDER_TIMEOUT` / `PROVIDER_AUTH_FAILED` / `PROVIDER_NOT_CONFIGURED` when applicable.

## Rules

- No business DB writes (users/documents/chunks/embeddings/messages…).
- No secrets or full provider payloads in health output.
- Health is independent of business requests (not invoked on every `/rag/query`).
- Missing config → `not_configured` (not silently mock / not fake healthy).
