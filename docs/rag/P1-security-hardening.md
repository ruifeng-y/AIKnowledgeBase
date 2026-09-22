# Security Hardening Decisions (P1)

## Guarantees (regression-tested)

| Gate | Behavior |
|------|----------|
| Tenant isolation | Cross-tenant search/RAG → 404 / no leakage |
| Knowledge space isolation | Cross-space search/RAG → 404 / empty scoped results |
| Version isolation | Default = currentVersion only; explicit versionId only |
| Citation isolation | Citations must map to current request context |
| Prompt injection | Retrieved knowledge = UNTRUSTED DATA |
| Empty-context gate | `retrieval=[]` → LLM calls = 0 |
| Grounding | Factual answers require valid citations; no general-knowledge fallback |

Security failures classify as `SECURITY_CONTRACT_FAILURE` / `REGRESSION_FAILURE`, not ordinary quality failures.

Logs must not contain API keys, JWT, secrets, raw system prompts, or full knowledge context by default.
