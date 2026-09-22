# Evaluation Boundary (P1)

- `evaluation/` is **read-only** with respect to production tables (`documents`, `chunks`, `embedding_records`, `conversations`, `messages`).
- Contract Dataset uses **fixture / isolated corpus**, never production reindex.
- Mock Embedding / Reranker / LLM are for **contract / pipeline / CI regression only** — not semantic quality.
- Semantic Gold remains **NOT READY** until human-curated, reviewed, versioned cases exist (no LLM-generated gold).
- `evaluation:contract PASS` means **framework correctness**, not production RAG quality.

Architecture tests assert `evaluation/` does not import `@prisma` or `@akb/db`.
