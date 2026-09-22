# Provider Troubleshooting

| Symptom | Cause | Action |
|---------|-------|--------|
| `PROVIDER_NOT_CONFIGURED` | Production provider without endpoint/apiKey/model | Fill env config |
| `PROVIDER_AUTH_FAILED` | 401/403 | Check API key (do not log it) |
| `PROVIDER_RATE_LIMITED` | 429 | Backoff / respect Retry-After |
| `PROVIDER_TIMEOUT` | Request deadline exceeded | Raise `*_TIMEOUT_MS` or reduce batch |
| `PROVIDER_INVALID_RESPONSE` | Schema/shape mismatch | Verify endpoint protocol |
| `EMBEDDING_DIMENSION_MISMATCH` | Vector length ≠ config dimensions | Align model + `EMBEDDING_DIMENSION` |
| `RERANKER_INVALID_RESPONSE` | Unknown/duplicate chunkId or non-finite score | Fix rerank endpoint contract |
| `LLM_EMPTY_RESPONSE` | Empty completion | Check model/prompt; not a RAG fallback trigger |
| `SKIPPED_PROVIDER_UNAVAILABLE` | Real smoke without credentials | Expected; configure providers first |

Logs use `provider_metric` events (metadata only). Secrets and full prompts/context are never logged.
