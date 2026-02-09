"""Patient Services (PS) Platform — FastAPI entry point.

Standalone deployment for case orchestration, strategy generation, and PA workflows.
Backend: port 8002 | Frontend dev: port 6002
"""
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
import uuid

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles

from backend.config.settings import get_settings
from backend.config.logging_config import setup_logging, get_logger
from backend.storage.database import init_db
from backend.api.routes import cases, strategies, patients, activity, validation, websocket, policies
from backend.mock_services.scenarios import get_scenario_manager

setup_logging(log_level="INFO")
logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """PS application lifespan — database + scenario manager + MCP client."""
    logger.info("Starting Patient Services Platform")

    settings = get_settings()
    if not settings.anthropic_api_key:
        logger.error("ANTHROPIC_API_KEY not set — Claude policy reasoning will fail")
    if not settings.gemini_api_key:
        logger.warning("GEMINI_API_KEY not set — Gemini-backed features unavailable")

    await init_db()
    logger.info("Database initialized")

    from backend.storage.seed_policies import seed_policies
    seeded = await seed_policies()
    if seeded:
        logger.info("Policies seeded from local files", count=seeded)

    get_scenario_manager()
    logger.info("Scenario manager initialized")

    yield

    logger.info("Shutting down Patient Services Platform")

    try:
        from backend.mcp.mcp_client import get_mcp_client
        mcp_client = get_mcp_client()
        await mcp_client.close()
        logger.info("MCP client closed")
    except Exception as e:
        logger.warning("Failed to close MCP client", error=str(e))


app = FastAPI(
    title="Patient Services Platform",
    description="Case orchestration, strategy generation, prior authorization workflows",
    version="0.1.0",
    lifespan=lifespan,
)

settings = get_settings()

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "Accept", "X-Requested-With"],
)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    error_id = str(uuid.uuid4())[:8]
    logger.error("Unhandled exception", error_id=error_id, error=str(exc), path=request.url.path, exc_info=True)
    return JSONResponse(status_code=500, content={"error": "Internal server error", "error_id": error_id})


# Routes
app.include_router(cases.router, prefix="/api/v1")
app.include_router(strategies.router, prefix="/api/v1")
app.include_router(patients.router, prefix="/api/v1")
app.include_router(activity.router, prefix="/api/v1")
app.include_router(validation.router, prefix="/api/v1")
app.include_router(policies.router, prefix="/api/v1")
app.include_router(websocket.router)


@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "version": "0.1.0",
        "platform": "patient-services",
        "components": {"database": True},
    }


@app.get("/health/llm")
async def health_check_llm():
    """Deep health check that verifies LLM provider connectivity."""
    from backend.reasoning.llm_gateway import get_llm_gateway

    llm_gateway = get_llm_gateway()
    llm_health = await llm_gateway.health_check()

    components = {
        "claude": llm_health.get("claude", False),
        "gemini": llm_health.get("gemini", False),
        "azure_openai": llm_health.get("azure_openai", False),
    }
    all_healthy = all(components.values())

    return {
        "status": "healthy" if all_healthy else "degraded",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "version": "0.1.0",
        "platform": "patient-services",
        "components": components,
    }


@app.get("/")
async def root():
    return {
        "name": "Patient Services Platform",
        "version": "0.1.0",
        "description": "Case orchestration, strategy generation, prior authorization workflows",
        "docs": "/docs",
        "health": "/health",
    }


# Scenario endpoints
@app.get("/api/v1/scenarios")
async def list_scenarios():
    manager = get_scenario_manager()
    return {"scenarios": manager.list_scenarios(), "current": manager.current_scenario.value}


@app.post("/api/v1/scenarios/{scenario_id}")
async def set_scenario(scenario_id: str):
    from backend.mock_services.scenarios import Scenario

    try:
        scenario = Scenario(scenario_id)
        manager = get_scenario_manager()
        config = manager.set_scenario(scenario)
        return {
            "message": f"Scenario set to: {scenario_id}",
            "config": {"name": config.name, "description": config.description, "expected_outcome": config.expected_outcome},
        }
    except ValueError:
        return JSONResponse(status_code=400, content={"error": f"Invalid scenario: {scenario_id}"})


# SPA serving for PS frontend build
FRONTEND_DIST = Path(__file__).parent.parent / "frontend" / "dist"
if FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIST / "assets")), name="static-assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        if full_path.startswith("api/"):
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail=f"API endpoint not found: /{full_path}")
        try:
            file_path = (FRONTEND_DIST / full_path).resolve()
            file_path.relative_to(FRONTEND_DIST.resolve())
        except (ValueError, RuntimeError):
            return FileResponse(str(FRONTEND_DIST / "index.html"))
        if file_path.exists() and file_path.is_file():
            return FileResponse(str(file_path))
        return FileResponse(str(FRONTEND_DIST / "index.html"))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8002, reload=True)
