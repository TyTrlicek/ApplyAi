"""FastAPI application entry point.

Run with:
    cd backend && uvicorn app.main:app --reload
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import scheduler as sched
from app.api.routes.apply import router as apply_router
from app.api.routes.fetch import router as fetch_router
from app.api.routes.generate import answers_router
from app.api.routes.generate import router as generate_router
from app.api.routes.jobs import router as jobs_router
from app.api.routes.profile import router as profile_router
from app.api.routes.scheduler_route import router as scheduler_router
from app.api.routes.searches import router as searches_router
from app.db.session import init_db

app = FastAPI(title="ApplyAi API", version="0.1.0")

import os as _os

_cors = dict(
    allow_origins=["http://localhost:3000", "http://localhost:3001", "http://localhost:3002"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# Opt-in wide-open CORS for local extension-fill debugging only. Never set in prod.
if _os.environ.get("APPLYAI_DEBUG_CORS") == "1":
    _cors = dict(allow_origin_regex=".*", allow_methods=["*"], allow_headers=["*"])

app.add_middleware(CORSMiddleware, **_cors)


@app.on_event("startup")
def on_startup():
    init_db()
    sched.start()


@app.on_event("shutdown")
def on_shutdown():
    sched.stop()


app.include_router(jobs_router)
app.include_router(searches_router)
app.include_router(fetch_router)
app.include_router(profile_router)
app.include_router(generate_router)
app.include_router(answers_router)
app.include_router(scheduler_router)
app.include_router(apply_router)


@app.get("/health")
def health():
    return {"status": "ok"}


if _os.environ.get("APPLYAI_DEBUG_CORS") == "1":
    from pathlib import Path as _Path

    from fastapi.responses import PlainTextResponse

    @app.get("/debug/bundle.js")
    def _debug_bundle():
        """Concatenated content-script bundle + direct-fetch override, for
        page-context testing without reloading the extension."""
        ext = _Path(__file__).parents[2] / "extension" / "content"
        order = [
            "util.js", "profile.js", "classify.js", "detect.js", "fill.js",
            "answers.js", "review.js", "adapters/generic.js", "adapters/workday.js",
            "adapters/linkedin.js", "index.js",
        ]
        parts = [(ext / f).read_text() for f in order]
        parts.append((_Path(__file__).parent / "_debug_bundle_override.js").read_text())
        return PlainTextResponse("\n;\n".join(parts), media_type="application/javascript")
