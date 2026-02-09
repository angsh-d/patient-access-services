# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Patient Services (PS) — standalone FastAPI platform for prior authorization case orchestration, strategy generation, and appeals management. Part of the Agentic Access Strategy split architecture alongside the Policy Data Intelligence (PDI) service.

**Backend:** port 8002 | **Frontend dev:** port 6002

## Development Commands

### Backend
```bash
source venv/bin/activate
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8002
# Or:
./run.sh
```

### Frontend
```bash
cd frontend && npm run dev    # Dev server on port 6002 (proxies /api and /ws to :8002)
cd frontend && npm run build  # Production build to dist/ (served by FastAPI SPA handler)
cd frontend && npm run lint   # ESLint for TS/TSX files
```

Frontend uses `@` path alias mapping to `./src/` (configured in `vite.config.ts`).

### Testing

No active test suite. Archived tests from the pre-split monorepo are in `.archive/split_20260208/tests/` for reference only.

### Required Environment Variables (`.env`)

```
ANTHROPIC_API_KEY=           # Required — Claude policy reasoning fails without this
GEMINI_API_KEY=              # Required — Gemini-backed features (drafting, extraction, summaries)
AZURE_OPENAI_API_KEY=        # Fallback LLM for non-policy tasks
AZURE_OPENAI_ENDPOINT=       # Azure OpenAI endpoint URL
AZURE_OPENAI_DEPLOYMENT=     # Default: gpt-4o
AZURE_OPENAI_API_VERSION=    # Default: 2024-02-15-preview
EXTERNAL_DATABASE_URL=       # NeonDB PostgreSQL (shared with PDI). If empty, falls back to local SQLite
DATABASE_URL=                # Local SQLite fallback: sqlite+aiosqlite:///./data/access_strategy.db
```

Model names and token limits are also configurable via `.env` (`CLAUDE_MODEL`, `GEMINI_MODEL`, `GEMINI_MAX_OUTPUT_TOKENS`, etc.) — see `backend/config/settings.py` for all fields.

## Architecture

### LangGraph Workflow (State Machine)

The case orchestrator (`backend/orchestrator/case_orchestrator.py`) uses LangGraph with 11 node functions:
```
INTAKE → POLICY_ANALYSIS → AWAITING_HUMAN_DECISION → STRATEGY_GENERATION
→ STRATEGY_SELECTION → ACTION_COORDINATION → MONITORING → [RECOVERY]
→ COMPLETED / FAILED
```

State is defined in `backend/orchestrator/state.py` (`OrchestratorState` TypedDict, ~30 fields). Two fields use LangGraph's `Annotated[List, add]` reducer pattern to accumulate across nodes: `completed_actions` and `messages`. All other fields are replaced on write. Routing decisions are pure functions in `backend/orchestrator/transitions.py`.

### Human Decision Gate

The workflow **pauses** at `AWAITING_HUMAN_DECISION` when `requires_human_decision=True`, coverage is `requires_human_review`, or approval likelihood < 50%. Cases wait until a human submits a decision via `POST /api/v1/cases/{id}/confirm-decision`. Human actions: APPROVE, REJECT, OVERRIDE, ESCALATE.

### Multi-LLM Architecture

Task-based routing configured in `data/config/llm_routing.json`:

| Task | Primary | Fallback | Notes |
|------|---------|----------|-------|
| `policy_reasoning` | Claude | Azure OpenAI | **No fallback in practice** — Claude failure = `ClaudePolicyReasoningError` |
| `appeal_strategy` | Claude | Azure OpenAI | Clinical accuracy required |
| `appeal_drafting` | Gemini | Azure OpenAI | |
| `summary_generation` | Gemini | Azure OpenAI | |
| `data_extraction` | Gemini | Azure OpenAI | |
| `policy_qa` | Claude | None | |

**LLM clients** (all in `backend/reasoning/`):
- `claude_pa_client.py` — Claude (`claude-sonnet-4-20250514`), max 8192 tokens, temp 0.0, tenacity retry
- `gemini_client.py` — Gemini (`gemini-3-pro-preview`), max 65536 tokens, embeddings via `gemini-embedding-001` (768-dim)
- `openai_client.py` — Azure OpenAI (`gpt-5.2`) configured via `.env` as fallback for non-policy tasks

The LLM gateway (`backend/reasoning/llm_gateway.py`) routes requests by task category using `TaskCategory` and `LLMProvider` enums from `backend/models/enums.py`. Prompts loaded via `backend/reasoning/prompt_loader.py` with `{variable_name}` substitution from `/prompts/*.txt` files.

### Conservative Decision Model

**AI NEVER recommends denial.** Enforced at three layers:
1. **Prompt**: Coverage assessment prompt instructs Claude to never recommend denial
2. **Code**: `policy_reasoner.py` maps `NOT_COVERED` → `REQUIRES_HUMAN_REVIEW` via `_apply_conservative_status_mapping()`
3. **Workflow**: Orchestrator pauses at human decision gate for low-confidence assessments

### Strategy Scoring (Deterministic — No LLM)

Pure algorithmic scoring in `backend/reasoning/strategy_scorer.py`:
```
total = weights.speed * speed + weights.approval * approval + weights.low_rework * (10-rework) + weights.patient_burden * (10-burden)
```
Default weights: speed=0.25, approval=0.40, low_rework=0.20, patient_burden=0.15. Hard ceiling: `approval_score ≤ likelihood * 10 + 1.0`.

### Multi-Payer Sequencing

Always sequential primary-first (COB compliance). Only `SEQUENTIAL_PRIMARY_FIRST` is valid. Secondary payer cannot process until primary adjudicates.

### PDI Relationship

PS and PDI share a NeonDB database (`EXTERNAL_DATABASE_URL`). PS **reads** digitized policies, diffs, and Q&A cache written by PDI. PS **writes** cases, decision events, state snapshots, and strategic intelligence cache. The `backend/policy_digitalization/` module is a read-only stub — it contains `policy_repository.py` (reads from shared DB), `exceptions.py`, and a placeholder `pipeline.py`. The actual digitalization pipeline runs in PDI.

### Dependency Injection

FastAPI dependencies are centralized in `backend/api/dependencies.py`. Each dependency creates its own DB session with commit/rollback:
```python
from backend.api.dependencies import get_case_service, get_strategy_service, get_db
# Used as: case_service: CaseService = Depends(get_case_service)
```

For non-route code, use the context manager in `backend/storage/database.py`:
```python
from backend.storage.database import get_db
async with get_db() as session:
    result = await session.execute(query)
```

### Routes
- `POST /api/v1/cases` — Create case
- `GET /api/v1/cases` — List cases
- `GET /api/v1/cases/{id}` — Get case
- `POST /api/v1/cases/{id}/process` — Process case through workflow
- `POST /api/v1/cases/{id}/run-stage/{stage}` — Run specific workflow stage
- `POST /api/v1/cases/{id}/approve-stage/{stage}` — Approve stage results
- `POST /api/v1/cases/{id}/confirm-decision` — Human decision gate
- `POST /api/v1/strategies/score` — Score strategies
- `GET /api/v1/patients` — List patients
- `GET /api/v1/activity/recent` — Activity feed
- `WS /ws/cases/{id}` — Case WebSocket for real-time updates
- `GET /api/v1/scenarios` — List demo scenarios
- `POST /api/v1/scenarios/{id}` — Set demo scenario
- `POST /api/v1/validate/npi/{npi}` — Validate NPI number
- `POST /api/v1/validate/icd10/{code}` — Validate ICD-10 code
- `GET /api/v1/policies` — List policies
- `GET /health` — Health check
- `GET /health/llm` — LLM provider health

Scenario and health endpoints are defined directly in `backend/main.py`, not in route modules.

### Key Modules
| Directory | Purpose |
|-----------|---------|
| `backend/agents/` | Intake, policy analyzer, strategy generator, action coordinator, recovery, strategic intelligence |
| `backend/orchestrator/` | LangGraph workflow engine (state, transitions, node functions) |
| `backend/services/` | Case, strategy, notification services |
| `backend/reasoning/` | LLM gateway, policy reasoner, strategy scorer, Claude/Gemini/OpenAI clients, prompt loader |
| `backend/mock_services/` | Mock payer gateways (Cigna, UHC, generic) + scenario management |
| `backend/mcp/` | MCP client for NPI, ICD-10, CMS external APIs |
| `backend/storage/` | Async SQLAlchemy ORM models, case repository, audit logger, waypoint writer |
| `backend/models/` | Pydantic models (case state, coverage, strategy, actions, audit, enums) |
| `backend/config/` | Settings (Pydantic from `.env`), logging config |
| `backend/api/` | FastAPI route handlers (`routes/`), request/response models, dependency injection (`dependencies.py`) |
| `backend/policy_digitalization/` | Read-only stub for PDI shared data (policy_repository, exceptions) |
| `prompts/` | LLM prompts organized by domain (policy_analysis, strategy, appeals, general, system) |
| `data/` | Config (llm_routing, medication_aliases), rubrics, patient JSON/PDF files |

### Database

NeonDB PostgreSQL via `EXTERNAL_DATABASE_URL` (primary) or SQLite via `DATABASE_URL` (local fallback). Auto-initialized on startup via `init_db()`. PostgreSQL URLs are auto-converted to use `asyncpg` driver; prepared statement cache is disabled to avoid `InvalidCachedStatementError` after schema changes. Core tables in `backend/storage/models.py`: `cases`, `decision_events`, `case_state_snapshots`, `policy_cache`, `strategic_intelligence_cache`, `policy_diff_cache`, `policy_qa_cache`.

Settings loaded via `backend/config/settings.py` (Pydantic `BaseSettings` with `.env` file). Access with `from backend.config.settings import get_settings`. Settings are cached via `@lru_cache`.

### Frontend

React 18 + TypeScript, Vite, TanStack Query v5 with IndexedDB persistence, TailwindCSS, Framer Motion. Vite proxies `/api` and `/ws` to backend at port 8002. API client in `frontend/src/services/api.ts`. Structure: `pages/` (route views), `components/domain/` (27 domain components), `components/ui/` (reusable primitives), `hooks/`, `types/`, `lib/`, `styles/`.

**SPA serving**: When `frontend/dist/` exists (after `npm run build`), FastAPI serves the built SPA as a catch-all route. In development, use the Vite dev server on port 6002 instead.

### Demo Scenarios
- `HAPPY_PATH` — Both payers approve
- `MISSING_DOCS` — UHC requests TB screening
- `PRIMARY_DENY` — Cigna denies; recovery activated
- `SECONDARY_DENY` — UHC denies; escalation
- `RECOVERY_SUCCESS` — Appeal succeeds

Controlled via `backend/mock_services/scenarios/scenario_manager.py`.

### Logging

```python
from backend.config.logging_config import setup_logging, get_logger
setup_logging(log_level="DEBUG", log_file="my_module.log")  # logs to ./tmp/my_module.log
logger = get_logger(__name__)
```

Uses `structlog` — console output uses `ConsoleRenderer`, file output uses `JSONRenderer`.

## Critical Rules
- ALL prompts in `/prompts` directory as `.txt` files — never hardcode prompts in Python
- ALL logs in `./tmp/` directory — use `from backend.config.logging_config import setup_logging`
- Set `max_output_tokens` to model maximums on ALL LLM calls (Claude: 8192, Gemini 2.5: 65536)
- Policy criterion evaluation is LLM-first via Claude — no fallback allowed
- Strategy scoring is deterministic (no LLM) for auditability
- Archive old file versions to `.archive/` immediately — never keep v1/v2/_old/_backup suffixes
- All env vars (API keys, endpoints, models) loaded from `.env` via python-dotenv
- Never write fallback code — fix root causes, not workarounds