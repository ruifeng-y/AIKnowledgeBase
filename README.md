# AI Knowledge Base

Enterprise AI Knowledge Base / RAG platform.

> **V0.4-A status:** this repository currently contains only the **Monorepo engineering skeleton**.
> Features such as PostgreSQL, pgvector, Redis, BullMQ, MinIO, RAG, Embedding, Reranker, LLM, Chat, and Citation are **not implemented yet**.

## 1. 项目介绍

AI Knowledge Base 是一个企业级 AI 知识库 / RAG 平台的 monorepo 工程骨架。

V0.4-A 目标：

- 建立干净、可运行、可测试、可构建、可扩展的 TypeScript Monorepo
- 统一 pnpm workspace + Turborepo + TypeScript + ESLint + Prettier + Vitest + GitHub CI
- 提供最小可运行的 Next.js Web、NestJS API（含 `/health`）与 Worker 骨架

## 2. 技术栈

- Node.js 20+
- TypeScript (strict)
- pnpm workspace
- Turborepo
- Next.js (Web)
- NestJS (API / Worker)
- Vitest
- ESLint
- Prettier
- GitHub Actions CI

## 3. Monorepo 目录结构

```text
ai-knowledge-base/
├── apps/
│   ├── web/          # Next.js
│   ├── api/          # NestJS API
│   └── worker/       # NestJS Worker skeleton
├── packages/
│   ├── contracts/    # Shared API contracts
│   ├── db/           # DB package skeleton (empty in V0.4-A)
│   ├── ai/           # AI provider package skeleton (empty in V0.4-A)
│   ├── config/       # Base config helpers
│   ├── logger/       # Logger package skeleton
│   └── utils/        # Shared utilities skeleton
├── docs/             # Specs / architecture notes
├── evaluation/       # Future RAG evaluation assets
├── infra/            # Future infra (docker / scripts)
└── .github/workflows/ci.yml
```

依赖方向：

```text
apps → packages
```

禁止：`web → api`、`api → worker`、`worker → api`、`package → app`。

## 4. 环境要求

- Node.js >= 20
- pnpm 10.x（本仓库 `packageManager` 为 `pnpm@10.28.0`）

## 5. 安装

```bash
pnpm install
```

## 6. 开发

```bash
# Web (http://localhost:3000)
pnpm --filter @akb/web dev

# API (http://localhost:3001/health)
pnpm --filter @akb/api dev

# Worker skeleton
pnpm --filter @akb/worker dev
```

## 7. Build

```bash
pnpm build
```

## 8. Test

```bash
pnpm test
```

## 9. Lint

```bash
pnpm lint
```

## 10. Typecheck

```bash
pnpm typecheck
```

## 11. Format

```bash
pnpm format
pnpm format:check
```

## 12. 当前 V0.4-A 范围

已完成：

- pnpm workspace + Turborepo
- `apps/web` / `apps/api` / `apps/worker`
- `packages/*` 骨架
- TypeScript strict
- ESLint / Prettier / EditorConfig
- Vitest 基础测试
- `GET /health` + `X-Request-ID`
- GitHub Actions CI
- `.env.example` / README

**未实现（后续阶段）：**

- PostgreSQL / pgvector / Prisma / migrations
- Redis / BullMQ / MinIO / S3 / Docker Compose
- Auth / JWT / API Key
- Workspace / Knowledge Space / Document 业务 CRUD
- RAG（Parser / Chunking / Embedding / Hybrid Search / Reranker / Context Builder）
- LLM / Chat / SSE / Citation

## 13. 后续阶段说明

规划中的工程阶段（详见 V0.3 文档）：

```text
V0.4-A  Monorepo 初始化          ← 当前
V0.4-B  Docker 基础设施
V0.4-C  Database Schema
V0.4-D  NestJS Architecture
V0.4-E  Auth / Workspace
V0.4-F  Document Pipeline
V0.4-G  Embedding
V0.4-H  Hybrid Retrieval
V0.4-I  Reranker
V0.4-J  Context Builder
V0.4-K  LLM / SSE
V0.4-L  Citation
V0.4-M  Next.js UI
V0.4-N  E2E
V0.4-O  RAG Evaluation
V0.4-P  Docker Deployment
```

## API

### Health

```http
GET http://localhost:3001/health
```

响应：

```json
{ "status": "ok" }
```

响应头会回传或生成 `X-Request-ID`。

未来业务 API 将使用 `/api/v1/*`，但 `/health` 保持根路径。
