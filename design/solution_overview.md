# Patient Services — Solution Overview

## The Problem

Prior authorization (PA) is the most labor-intensive step in specialty pharmacy access. Case managers manually assess patient eligibility against payer policies, select submission strategies, submit to payer portals, monitor for responses, and — when claims are denied — build clinical appeals and prepare for peer-to-peer reviews. Each case touches multiple systems, multiple payers, and multiple decision points. A single denial can add weeks to a patient's time-to-therapy while the team researches appeal arguments, drafts letters, and coordinates with physicians.

## What Patient Services Does

Patient Services is an AI-powered **case orchestration platform** that automates the prior authorization lifecycle — from patient intake through strategy selection, payer submission, real-time monitoring, denial recovery, and appeal management. A LangGraph state machine drives each case through a defined workflow with human-in-the-loop gates at every critical decision point.

### End-to-End Process Flow

```
┌────────────────────── PATIENT SERVICES DOMAIN ──────────────────────┐
│                                                                      │
│  Patient Intake → AI-Powered Case Orchestration                      │
│  ┌──────────┐  ┌──────────┐  ┌─────────┐  ┌──────────┐  ┌───────┐ │
│  │ Intake   │→ │ Policy   │→ │ Cohort  │→ │ AI Rec.  │→ │ Human │ │
│  │ Validate │  │ Analysis │  │ Analysis│  │ Synthesis│  │ Gate  │ │
│  │(MCP+NPI) │  │ (Claude) │  │ (Gemini)│  │ (Claude) │  │(HITL) │ │
│  └──────────┘  └──────────┘  └─────────┘  └──────────┘  └───┬───┘ │
│                                                               │      │
│                     Human approves / rejects / overrides      │      │
│                                                               ▼      │
│  Strategy & Submission Layer                                         │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ Strategy Generation (deterministic scoring, no LLM)          │   │
│  │   → Sequential Primary-First (COB-compliant)                 │   │
│  │   → Weighted scoring: approval 40%, speed 25%,               │   │
│  │     rework 20%, patient burden 15%                           │   │
│  │                                                              │   │
│  │ Action Coordination → Submit PA → Monitor Payer Response     │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                         │                                            │
│                   ┌─────┴──────┐                                     │
│                   ▼            ▼                                      │
│              ┌─────────┐  ┌──────────┐                               │
│              │Approved │  │ Denied   │                                │
│              │→ Done   │  │→ Recovery│                                │
│              └─────────┘  └────┬─────┘                               │
│                                │                                      │
│  Recovery & Appeals Layer      ▼                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ Denial Classification (Claude) → Root cause analysis         │   │
│  │ Appeal Strategy Generation (Claude) → Clinical arguments     │   │
│  │ Appeal Letter Drafting (Gemini) → Physician-ready letter     │   │
│  │ Appeal Prediction → Success probability with risk factors    │   │
│  │ Peer-to-Peer Prep → AI-generated talking points + checklist  │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  Intelligence Layer (available at every stage)                        │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ Strategic Intelligence: Historical pattern analysis           │   │
│  │ Cohort Insights: Gap-driven approval/denial differentiators   │   │
│  │ Policy Q&A Assistant: Claude-powered natural language queries  │   │
│  │ LLM Cost & Prediction Accuracy Analytics                      │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  Frontend (React + TypeScript)                                       │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ 7-Step Wizard UI with real-time SSE streaming & WebSocket     │   │
│  │ AI Assistant (Policy Q&A) at every step                       │   │
│  │ Appeals Management Page with filterable case list             │   │
│  │ Analytics Dashboard (costs, predictions, outcomes)            │   │
│  │ Audit Trail with full decision provenance chain               │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### How a Case Moves Through the System

1. **Patient Intake** — A case manager selects a patient. The system validates completeness (demographics, insurance, medication, diagnosis) and runs concurrent external validations: NPI registry lookup, ICD-10 code validation, and CMS Medicare coverage check via MCP integrations.

2. **Policy Analysis** — Claude analyzes the patient's eligibility against the payer's digitized coverage criteria. Every criterion is individually assessed with a confidence score, and documentation gaps are identified and prioritized. If confidence is low or coverage status is uncertain, the case is flagged for human review. An iterative refinement loop re-evaluates low-confidence criteria (below 70%) up to twice, accepting improvements only when confidence actually increases.

3. **Cohort Analysis** — The system finds historically similar cases (weighted similarity: medication 30%, diagnosis 25%, payer 20%, severity 15%, prior treatments 10%) and analyzes approval vs. denial patterns per documentation gap. This tells the case manager: "When this specific gap was present, the denial rate was X% — but cases with these compensating factors still got approved."

4. **AI Recommendation** — Claude synthesizes the policy analysis and cohort evidence into a final recommendation with confidence scoring, risk factors, and mitigation strategies.

5. **Human Decision Gate** — The workflow **pauses**. A case manager reviews the AI recommendation and decides: approve, reject, override, or escalate. The AI does not proceed without explicit human authorization. This gate activates automatically when coverage status is `REQUIRES_HUMAN_REVIEW`, or approval likelihood falls below 50%.

6. **Strategy & Submission** — A deterministic scoring algorithm (no LLM) selects the optimal submission strategy. Only sequential primary-first strategies are supported for Coordination of Benefits compliance. The system submits the PA to the payer portal and monitors for a response.

7. **Monitoring & Recovery** — The system polls for payer status. If approved, the case completes. If denied, recovery activates: Claude classifies the denial, generates a clinical appeal strategy with evidence citations and policy references, and Gemini drafts a physician-ready appeal letter. The case manager can also prepare for peer-to-peer review using AI-generated talking points and a preparation checklist.

---

## Key Capabilities

### 1. LangGraph Case Orchestration
A state machine with 11 node functions drives each case through a defined workflow: intake, policy analysis, cohort analysis, AI recommendation, human decision gate, strategy generation, strategy selection, action coordination, monitoring, recovery, and completion. State is a 30-field TypedDict with LangGraph reducer patterns for accumulating actions and messages across nodes. The workflow supports streaming execution, stage-by-stage progression, and resumption after human decisions.

### 2. AI-Powered Coverage Assessment
Claude analyzes patient eligibility against digitized payer coverage criteria — criterion by criterion — with individual confidence scores, documentation gap identification, and approval likelihood estimation. Payer-specific rubrics (Cigna, UHC) override default thresholds to match each payer's actual documentation standards. An iterative refinement loop re-evaluates low-confidence criteria, and an evidence gap detection pass runs before analysis to identify missing documentation proactively.

### 3. Gap-Driven Cohort Analysis
For each documentation gap identified in policy analysis, the system analyzes historically similar cases to calculate gap-specific denial rates, identify compensating clinical factors that correlate with approval despite the gap, and surface severity/time trend breakdowns. The case manager sees concrete evidence: "Cases missing TB screening had a 72% denial rate with this payer, but cases with elevated CRP + specialist referral still achieved 61% approval."

### 4. Strategic Intelligence
A weighted similarity engine (medication, diagnosis, payer, severity, prior treatments) finds historical matches and surfaces pattern-based insights: approval/denial rate histories, documentation presence impact, and compensating factors with approval uplift percentages. Results are cached in the database with a 24-hour TTL and SHA-256 content-based cache keys.

### 5. Deterministic Strategy Scoring
Strategies are scored by a pure algorithmic calculation — no LLM involvement — ensuring auditability and reproducibility. Four dimensions are weighted: approval probability (40%), speed to therapy (25%), rework risk (20%), and patient burden (15%). A hard ceiling (`approval_score <= likelihood * 10 + 1.0`) prevents unrealistic scoring, and critical documentation gaps impose score penalties. Only sequential primary-first strategies are generated for COB compliance.

### 6. Denial Recovery & Appeal Management
When a PA is denied, the recovery pipeline activates:
- **Denial Classification** — Claude classifies the denial type (medical necessity, documentation incomplete, step therapy, not covered) with root cause analysis, recoverability assessment, and urgency rating
- **Appeal Strategy** — Claude generates a multi-layered appeal strategy: primary clinical argument, supporting arguments, evidence to cite, policy sections to reference, medical literature citations, P2P talking points, success probability with reasoning, key risks, and fallback strategies
- **Appeal Letter** — Gemini drafts a physician-ready appeal letter, using the appeal strategy for richer clinical context
- **Appeal Prediction** — ML-based success probability estimation with risk factor breakdown
- **P2P Preparation** — AI-generated talking points paired with a 6-item review readiness checklist

A dedicated Appeals Management page surfaces all appeal-eligible cases (denied, appeal in progress, or at-risk with approval likelihood below 40%) with summary stats, search filtering, and one-click deep-linking to the appeal workflow.

### 7. Policy Q&A Assistant
A Claude-powered chat assistant is available at every wizard step, answering natural language questions grounded in the actual policy analysis results. Case managers can ask "What step therapy does Cigna require?" or "Why was the documentation gap flagged?" and receive citation-backed responses. Suggested questions and follow-up chips are context-specific to the current workflow step.

### 8. Real-Time Processing Visibility
Users don't see a "Processing..." spinner. The platform streams AI processing events in real-time:
- **SSE Streaming** — Policy analysis progress updates (stage start, payer start, progress percentage, payer complete, stage complete) streamed as server-sent events
- **WebSocket** — Real-time case stage transitions, processing completion notifications, and error alerts with automatic query cache invalidation
- **Processing Animations** — Step-by-step sub-progress indicators ("Fetching policy...", "Extracting criteria...", "Assessing coverage...", "Synthesizing gaps...")

### 9. Full-Stack Analytics
An analytics dashboard tracks:
- **LLM Cost Analytics** — Real-time cost tracking per provider, per model, per task category. Token counts, latencies, and cost breakdowns
- **Prediction Accuracy** — Predicted vs. actual payer outcomes, tracked per case, with accuracy statistics across the portfolio
- **Outcome Recording** — Actual payer decisions recorded and compared against AI predictions for continuous model evaluation

---

## Conservative Decision Model

**AI never recommends denial.** This is enforced at three independent layers:

| Layer | Mechanism |
|-------|-----------|
| **Prompt** | The coverage assessment prompt instructs Claude to never recommend denial — only approve, pend, or escalate to human review |
| **Code** | `PolicyReasoner._apply_conservative_status_mapping()` maps any `NOT_COVERED` result to `REQUIRES_HUMAN_REVIEW` |
| **Workflow** | The orchestrator pauses at the human decision gate for any assessment with `REQUIRES_HUMAN_REVIEW` status or approval likelihood below 50% |

The result: denials are either routed to the human decision gate (where only a human may deny) or handled via recovery (appeal). At no point does the system autonomously deny coverage.

---

## Human-in-the-Loop Design

The workflow pauses at explicit decision gates — the AI does not act on patient cases without human authorization.

| Trigger | What Happens |
|---------|-------------|
| **Coverage uncertain** | Status = `REQUIRES_HUMAN_REVIEW` → workflow pauses at human decision gate |
| **Low confidence** | Approval likelihood < 50% → workflow pauses at human decision gate |
| **Each wizard step** | Case manager reviews and explicitly approves before the next stage runs |
| **Strategy selection** | Deterministic scoring with transparent rationale; human reviews before submission |

**Human Decision Actions:**
- **Approve** — Proceed to strategy generation and submission
- **Reject** — Case fails; no further processing
- **Override** — Proceed with human-specified override parameters
- **Escalate** — Case remains paused for further review

After a human decision is submitted via `POST /api/v1/cases/{id}/confirm-decision`, the orchestrator builds a continuation graph and resumes the workflow from strategy generation.

---

## How We Prevent AI Hallucinations

| Safeguard | What It Does |
|-----------|-------------|
| **Iterative Refinement** | Low-confidence criteria (< 70%) are re-evaluated up to twice. Improvements are accepted only if confidence actually increases — otherwise the original stands. |
| **Conservative Status Mapping** | `NOT_COVERED` is mapped to `REQUIRES_HUMAN_REVIEW` in code, preventing the AI from issuing unilateral denials. |
| **Payer-Specific Rubrics** | Cigna and UHC rubrics enforce payer-specific thresholds, step therapy requirements, and documentation standards — preventing generic responses. |
| **Self-Validation Prompt** | A dedicated `self_validation.txt` prompt audits coverage assessments for correctness and hallucination. |
| **Evidence Gap Pre-Scan** | Before policy analysis, a separate LLM pass identifies missing documentation — so the analyzer works with known unknowns, not assumed evidence. |
| **Deterministic Strategy Scoring** | Strategy selection uses pure algorithmic scoring (no LLM) — eliminating the possibility of hallucinated strategy recommendations. |
| **Confidence Scoring** | Every criterion carries an individual confidence score. Low overall confidence triggers automatic escalation to human review. |

---

## How We Ensure Accuracy

| Technique | What It Does |
|-----------|-------------|
| **Criterion-Level Assessment** | Each payer criterion is individually evaluated with met/unmet status, supporting evidence, and confidence — not just a summary verdict |
| **Payer-Specific Rubrics** | Cigna rubric enforces 5% higher thresholds, 90-day lab currency, mandatory Letter of Medical Necessity, and biosimilar-first preference. Each payer's actual standards are encoded. |
| **Approval Likelihood Ceiling** | Strategy scorer enforces `approval_score <= likelihood * 10 + 1.0` to prevent inflated confidence from propagating into strategy selection |
| **Gap Penalty Scoring** | Critical documentation gaps impose `-0.5` score penalty per gap; unsatisfied step therapy imposes `-2.0` penalty |
| **Cohort Evidence Grounding** | AI recommendations are cross-referenced against historical cohort outcomes — not just policy text |
| **Temperature Zero Reasoning** | Claude runs at `temperature=0.0` for all policy reasoning and appeal strategy tasks, ensuring deterministic clinical analysis |
| **Prediction Tracking** | Actual payer outcomes are recorded and compared against predictions, enabling continuous accuracy measurement |

---

## How We Deliver Explainability

Every AI decision in Patient Services is traceable and auditable:

- **Criterion-Level Detail** — Coverage assessments show per-criterion met/unmet status with individual confidence scores and supporting evidence
- **Reasoning Chains** — Each analysis stage exposes its chain-of-thought reasoning, visible in the frontend as expandable reasoning steps with source attribution
- **Provenance Metadata** — Every analysis result carries provenance: timestamp, model used, whether it was cached, whether it was a fallback
- **Cryptographic Audit Trail** — An append-only event log records every decision with hash chaining (each event's signature incorporates the previous event's hash), preventing tampering
- **Strategy Scoring Transparency** — Score breakdowns show each dimension's contribution, adjustment reasoning, and the weights used — fully reproducible
- **Documentation Gap Tracing** — Each gap links to the specific policy criterion it violates, with cohort-level evidence showing historical impact
- **Waypoint Files** — Policy analysis results are written as structured JSON waypoints for offline audit compliance

---

## Observability with Langfuse

All AI operations are monitored through Langfuse (optional but fully integrated; graceful no-op when credentials are absent):

- **Full Tracing** — Every LLM call creates a Langfuse trace with nested generation spans per provider attempt. Traces include input/output (truncated to 500 chars), token counts, latency, cost, and correlation IDs.
- **Prompt Management** — All 25 AI prompts are version-controlled in Langfuse with `production` labels. The prompt loader fetches from Langfuse first (60-second TTL cache), falling back to local `.txt` files only on Langfuse failure. A sync script (`push_prompts_to_langfuse.py`) idempotently pushes local prompts to Langfuse.
- **Cost Analytics** — Token-level cost tracking per provider (Claude: $3/$15 per 1M input/output, Gemini: $1.25/$10, Azure: $2.50/$10). Persisted in the `llm_usage` database table with per-case and per-task breakdowns.
- **Circuit Breaker Visibility** — The LLM gateway logs transient vs. permanent error classifications, retry attempts, and circuit breaker state transitions (3-failure threshold, 60-second cooldown).

---

## Production-Grade Architecture

### LangGraph State Machine
The orchestrator is not a linear pipeline — it is a compiled LangGraph state machine with conditional routing. Routing decisions (should the workflow pause? does recovery need to activate? is the case complete?) are pure functions in `transitions.py`, making the workflow testable and deterministic. State accumulates across nodes using LangGraph's `Annotated[List, add]` reducer pattern for `completed_actions` and `messages`.

### Circuit Breaker & Error Classification
The LLM gateway classifies every error as transient (rate-limit, timeout, 5xx → retry after 2s) or permanent (auth failure, bad request → skip to fallback). A per-provider circuit breaker trips after 3 consecutive failures and cools down for 60 seconds. This prevents cascading failures when a provider is down.

### Asymmetric Resilience by Clinical Risk

| Task Type | Resilience Strategy | Rationale |
|-----------|-------------------|-----------|
| **Policy reasoning** (coverage, appeals) | No fallback — Claude failure propagates as `ClaudePolicyReasoningError` | A wrong answer from a weaker model is worse than no answer. Clinical accuracy is non-negotiable. |
| **General tasks** (drafting, extraction, summaries) | Gemini primary → Azure OpenAI fallback | A slightly lower-quality draft is better than no draft. |
| **Strategy scoring** | No LLM — deterministic algorithm | Auditability requires removing LLM subjectivity from strategy selection entirely. |

### Multi-Layer Caching
Seven distinct cache layers prevent redundant LLM calls:

| Cache | Storage | TTL | Key Strategy |
|-------|---------|-----|-------------|
| Policy analysis results | PostgreSQL (`policy_analysis_cache`) | 7 days | MD5 of patient + medication + payer |
| Strategic intelligence | PostgreSQL (`strategic_intelligence_cache`) | 24 hours | SHA-256 of medication + ICD-10 family + payer |
| Cohort analysis | PostgreSQL (`cohort_analysis_cache`) | Configurable | Content-based hash |
| Policy Q&A | PostgreSQL (`policy_qa_cache`) | Indefinite | Embedding similarity (768-dim) |
| Policy diff results | PostgreSQL (`policy_diff_cache`) | Indefinite | Unique on payer + medication + version pair |
| TanStack Query (frontend) | IndexedDB | Manual invalidation | Hierarchical query keys |
| Langfuse prompts | In-memory | 60 seconds | Prompt name |

### Concurrent External Validation
Patient intake runs three external validations in parallel via `asyncio.gather(return_exceptions=True)`:
- NPI Registry — Validates provider credentials
- ICD-10 — Validates diagnosis codes against reference standards
- CMS Medicare — Checks Medicare coverage status

Each validation is non-blocking: failures produce warnings but do not block case intake.

### Deep Copy State Isolation
The action coordinator uses `copy.deepcopy()` on orchestrator state before mutations, preventing accidental state corruption across LangGraph node transitions.

---

## Architecture at a Glance

### AI Models — Right Model for Each Job

| Task | AI Model | Why |
|------|----------|-----|
| Policy reasoning & coverage assessment | Claude Sonnet 4 | Highest clinical accuracy. No fallback — accuracy is non-negotiable. Temperature 0.0. |
| Appeal strategy generation | Claude Sonnet 4 | Clinical argument quality demands the strongest reasoning model. |
| Policy Q&A assistant | Claude Sonnet 4 | Citation-backed answers require policy-grounded reasoning. No fallback. |
| Appeal letter drafting | Gemini 3 Pro | High throughput for long-form content generation. 65K token output. |
| Data extraction & evidence gap detection | Gemini 3 Pro | Fast, cost-effective for structured extraction tasks. |
| Notification drafting | Gemini 3 Pro | General content generation with Azure OpenAI fallback. |
| Fallback (all non-policy tasks) | Azure OpenAI GPT-4o | Reliable fallback when primary provider is unavailable. |
| Embeddings (Q&A similarity) | Gemini Embedding 001 | 768-dimensional vectors for semantic Q&A cache matching. |

### Agent Architecture

6 specialized agents orchestrated by a LangGraph state machine:

| Agent | Role | LLM | Execution Pattern |
|-------|------|-----|-------------------|
| **Intake Agent** | Validates patient data, runs MCP external checks | None (validation only) | Constrained — fixed validation pipeline, no LLM |
| **Policy Analyzer** | Coverage assessment with iterative refinement | Claude (no fallback) | Guided — bounded refinement loop (max 2 iterations), accepts improvements only if confidence increases |
| **Strategy Generator** | Generates and scores access strategies | None (deterministic scoring) | Constrained — pure algorithmic scoring, no LLM |
| **Action Coordinator** | Executes PA submissions, monitors payer status | None (delegation only) | Constrained — fixed action sequence per strategy step |
| **Recovery Agent** | Classifies denials, generates appeal strategies | Claude (strategy) + Gemini (classification) | Guided — LLM-driven classification and strategy, bounded by recoverability gate |
| **Strategic Intelligence** | Historical pattern analysis, cohort matching | Gemini (pattern analysis) | Guided — adaptive similarity matching and caching, predetermined execution path |

**Execution Patterns Explained:**
- **Constrained** — Tools and execution order are fixed. The agent performs a predetermined sequence of steps. Used where predictability and auditability matter more than flexibility (validation, scoring, submission).
- **Guided** — LLM-powered but bounded. The agent follows a predetermined pipeline with adaptive behavior at specific points (refinement loops, recoverability checks, similarity thresholds). The agent does not decide which tools to call or when to stop — the boundaries are architectural.

### Technology Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python, FastAPI, async PostgreSQL (NeonDB), SQLite fallback |
| Frontend | React 18, TypeScript, Vite, TailwindCSS, Framer Motion |
| AI Orchestration | LangGraph (state machine), 11-node workflow |
| AI Models | Claude Sonnet 4 (Anthropic), Gemini 3 Pro (Google), GPT-4o (Azure OpenAI) |
| Real-Time | Server-Sent Events (policy analysis streaming), WebSocket (case updates) |
| Caching | TanStack Query v5 + IndexedDB (frontend), PostgreSQL multi-table (backend) |
| Observability | Langfuse (tracing, prompt management, cost tracking) |
| External APIs | MCP client (NPI Registry, ICD-10 validation, CMS Medicare lookup) |

### API Surface

44 REST endpoints + 1 WebSocket + 1 SSE stream:

| Category | Endpoints |
|----------|-----------|
| **Case Lifecycle** | Create, get, list, delete, reset, process, analyze, generate-strategies, run-stage, approve-stage, select-strategy, confirm-decision, decision-status, audit-trail |
| **Intelligence** | Strategic intelligence, cohort analysis, gap cohort analysis, invalidate intelligence cache |
| **Appeals & Policy QA** | Policy Q&A, predict appeal, draft appeal letter, record outcome |
| **Streaming** | Stream stage (SSE) |
| **Strategies** | Score, templates, compare weights, scoring factors, by type |
| **Patients** | List, get data, get documents, download document, update data |
| **Validation** | Validate NPI, validate ICD-10, CMS coverage check, patient validation, validation health |
| **Policies** | Get digitized policy |
| **Reference Data** | Recent activity |
| **Analytics** | LLM costs, prediction accuracy |
| **Operations** | Health check, LLM health, list scenarios, set scenario |
| **Real-Time** | WebSocket per case (`WS /ws/cases/{id}`) |

### Frontend Architecture

| Element | Count | Description |
|---------|-------|-------------|
| Pages | 8 | Landing, Dashboard, NewCase, CaseDetail, Appeals, Analytics, PolicyVault, Settings |
| Domain Components | 34 | Wizard steps, panels, cards, visualizations, assistant |
| Custom Hooks | 9 | TanStack Query hooks with IndexedDB persistence |
| Prompt Files | 25 | Organized by domain: appeals (4), policy analysis (8), strategy (5), recovery (2), validation (2), general (3), system (1) |
| Database Tables | 11 | Cases, events, snapshots, 6 cache tables, predictions, LLM usage |

### Database Schema

| Table | Purpose |
|-------|---------|
| `cases` | Core case state with JSON columns for patient data, assessments, strategies, actions |
| `decision_events` | Cryptographically chained audit trail (hash of each event includes previous event's signature) |
| `case_state_snapshots` | Versioned full-state snapshots for time-travel debugging |
| `policy_cache` | Digitized payer policies (shared read from PDI) |
| `policy_analysis_cache` | Cached LLM coverage assessments (7-day TTL) |
| `strategic_intelligence_cache` | Cached cohort intelligence (24-hour TTL) |
| `policy_diff_cache` | Cached policy version diffs (shared read from PDI) |
| `cohort_analysis_cache` | Cached gap-driven cohort analysis |
| `policy_qa_cache` | Semantic Q&A cache with 768-dim embeddings |
| `prediction_outcomes` | Predicted vs. actual payer decisions for accuracy tracking |
| `llm_usage` | Token counts, costs, latencies per provider/model/task |

---

## Key Differentiators

**LangGraph State Machine, Not a Script** — The workflow is a compiled state machine with conditional routing, not a linear pipeline. Routing decisions are pure functions. The workflow pauses, resumes, branches to recovery, and completes — all driven by state transitions with full auditability.

**AI-Native with Human Gates** — Every analytical task is performed by AI. No hardcoded clinical rules. But the system never acts on patient cases without explicit human authorization — the decision gate is architectural, not optional.

**Conservative by Design** — The system cannot recommend denial. Three independent enforcement layers (prompt, code, workflow) ensure that uncertain cases always escalate to human judgment. This is a deliberate asymmetry: false positives (unnecessary human review) are acceptable; false negatives (missed denials reaching patients) are not.

**Deterministic Strategy Scoring** — Strategy selection is the one place where LLMs are deliberately excluded. Pure algorithmic scoring with transparent weights ensures every strategy recommendation is reproducible, auditable, and free of LLM subjectivity.

**Multi-Model Architecture** — Each task routes to the optimal AI model based on clinical safety requirements. Policy reasoning uses Claude with no fallback (accuracy non-negotiable). General tasks use Gemini with Azure OpenAI fallback. Strategy scoring uses no LLM at all. Model assignments change via configuration, not code.

**Gap-Driven Cohort Intelligence** — The system doesn't just identify documentation gaps — it tells you what happens historically when each specific gap exists, which compensating factors overcome it, and how denial rates vary by payer and severity. Evidence-grounded, not opinion-based.

**Real-Time Processing Transparency** — SSE streaming, WebSocket updates, and step-by-step progress animations give users continuous visibility into AI processing. No black-box "Processing..." spinners.

**Cryptographic Audit Trail** — Every decision is recorded in an append-only event log where each event's signature incorporates the previous event's hash. Tampering with any historical event invalidates the entire chain — compliance-grade auditability.

**Full Observability** — Every AI call is traced in Langfuse with token counts, latencies, costs, and correlation IDs. Every prompt is version-controlled. Every prediction is compared against actual outcomes. Complete auditability for regulated healthcare environments.

**Asymmetric Resilience** — The system doesn't treat all failures equally. Clinical reasoning failures propagate (no fallback for policy analysis). General task failures degrade gracefully (Gemini → Azure OpenAI). Strategy scoring can't fail from LLM issues because it doesn't use one. The resilience strategy matches the clinical consequence.
