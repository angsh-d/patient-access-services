# Patient Services Platform

## Overview
Patient Services (PS) — standalone FastAPI platform for prior authorization case orchestration, strategy generation, and appeals management. Uses a multi-LLM architecture (Claude, Gemini, Azure OpenAI) for clinical reasoning tasks.

## Current State
- Working: Frontend (React/Vite on port 5000) + Backend (FastAPI on port 8002)
- Database: SQLite fallback (can use external PostgreSQL via EXTERNAL_DATABASE_URL)
- LLM features require API keys (ANTHROPIC_API_KEY, GEMINI_API_KEY)

## Project Architecture
- **Backend**: Python FastAPI (`backend/`) — port 8002
- **Frontend**: React 18 + TypeScript + Vite (`frontend/`) — port 5000
- Frontend proxies `/api` and `/ws` to backend via Vite dev server config
- LangGraph orchestration for case workflow state machine

### Key Directories
| Directory | Purpose |
|-----------|---------|
| `backend/agents/` | AI agents (intake, policy analyzer, strategy generator, etc.) |
| `backend/orchestrator/` | LangGraph workflow engine |
| `backend/services/` | Case, strategy, notification services |
| `backend/reasoning/` | LLM gateway, Claude/Gemini/OpenAI clients |
| `backend/storage/` | Async SQLAlchemy ORM, repositories |
| `backend/models/` | Pydantic data models |
| `backend/config/` | Settings, logging |
| `backend/api/` | FastAPI routes, dependencies |
| `frontend/src/` | React components, pages, hooks, services |
| `prompts/` | LLM prompt templates |
| `data/` | Patient data, policy files, config |

## Development Commands
```bash
# Backend only
uvicorn backend.main:app --host localhost --port 8002

# Frontend only
cd frontend && npm run dev

# Both (via workflow)
uvicorn backend.main:app --host localhost --port 8002 & cd frontend && npm run dev
```

## Environment Variables
- `ANTHROPIC_API_KEY` — Claude policy reasoning
- `GEMINI_API_KEY` — Gemini-backed features
- `AZURE_OPENAI_API_KEY` — Fallback LLM
- `AZURE_OPENAI_ENDPOINT` — Azure endpoint URL
- `EXTERNAL_DATABASE_URL` — PostgreSQL (optional, falls back to SQLite)

## User Preferences
(None recorded yet)

## Recent Changes
- 2026-02-09: Imported from GitHub, configured for Replit (frontend port 5000, backend port 8002)
