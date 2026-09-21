# AI Knowledge Base

Enterprise AI Knowledge Base / RAG platform.

> **Current status:** V0.4-A monorepo skeleton + **V0.4-B local Docker infrastructure** (PostgreSQL 16 + pgvector, Redis 7, MinIO).
> Application code is **not** wired to these services yet. Prisma, migrations, BullMQ, RAG, Auth, LLM/Chat/Citation are **not implemented yet**.

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
- Docker + Docker Compose（本地基础设施）

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

## 12. Local Infrastructure（V0.4-B）

本地开发基础设施由 Docker Compose 启动，**仅用于本地开发，不代表生产部署方案**。

| Service | 说明 | Host Port |
|---------|------|-----------|
| postgres | PostgreSQL 16 + pgvector | 5432 |
| redis | Redis 7 | 6379 |
| minio | S3-compatible Object Storage | 9000 (API) / 9001 (Console) |

默认凭据见 `.env.example`（开发用 `change_me`，勿用于生产）。`.env` 已被 `.gitignore` 忽略。

```bash
# 启动
docker compose up -d

# 状态
docker compose ps

# 日志
docker compose logs -f

# 停止（保留 volume 数据）
docker compose down

# 停止并删除 volume（会清空 PostgreSQL / Redis / MinIO 数据）
docker compose down -v
```

MinIO 初始化容器会在启动时幂等创建 bucket：`ai-knowledge-base`。

可选检查脚本：

```bash
sh infra/scripts/verify-infra.sh
```

当前 **未** 将 `apps/api` / `apps/worker` 接入 PostgreSQL / Redis / MinIO；业务 API 接入属于后续阶段。

## 12b. Database Development（V0.4-C）

本地开发使用 Prisma + PostgreSQL 16 + pgvector。

```env
DATABASE_URL=postgresql://akb:change_me@localhost:5432/ai_knowledge_base
```

复制 `.env.example` 为 `.env`（已在 `.gitignore`），不要提交真实密码。

```bash
# 生成 Prisma Client
pnpm --filter @akb/db prisma:generate

# 开发迁移（创建/应用）
pnpm --filter @akb/db prisma:migrate

# 部署迁移（CI/全新环境）
pnpm --filter @akb/db prisma:deploy

# 迁移状态
pnpm --filter @akb/db prisma:status

# Schema 验证（13 表 / vector / TSVECTOR / GIN / FK / UNIQUE）
pnpm --filter @akb/db db:verify
```

访问数据库请通过 `@akb/db`（`prisma` + repositories），不要在 apps 中自行 `new PrismaClient()`。

当前仅落地数据库模型与基础 repository，**未实现** Auth / Document API / RAG / LLM。

## 13. 当前已完成范围

V0.4-A：

- pnpm workspace + Turborepo
- `apps/web` / `apps/api` / `apps/worker`
- `packages/*` 骨架
- TypeScript strict / ESLint / Prettier / Vitest
- `GET /health` + `X-Request-ID`
- GitHub Actions CI

V0.4-B：

- `docker-compose.yml`：PostgreSQL 16 + pgvector / Redis 7 / MinIO
- named volumes + healthchecks + MinIO bucket 初始化
- `.env.example` 基础设施变量
- README Local Infrastructure 说明

V0.4-C：

- Prisma schema + migration：13 张核心业务表
- pgvector `embedding_records.embedding` + FTS `search_vector` + GIN
- `@akb/db`：Prisma Client + 基础 repositories
- Schema / persistence 验证脚本

**未实现（后续阶段）：**

- Auth / JWT / API Key service
- Workspace / Knowledge Space / Document 业务 API
- File Upload / ObjectStorage Adapter
- BullMQ / Document·Embedding·Indexing Processor
- RAG / Embedding Provider / Hybrid Search / Reranker / Context Builder
- LLM / Chat / SSE / Citation

## 14. 后续阶段说明

规划中的工程阶段（详见 V0.3 文档）：

```text
V0.4-A  Monorepo 初始化
V0.4-B  Docker 基础设施
V0.4-C  Database Schema          ← 当前
V0.4-D  NestJS Architecture
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
