"""FastAPI application entry point.

Run with:
    cd backend && uvicorn app.main:app --reload
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes.fetch import router as fetch_router
from app.api.routes.generate import router as generate_router
from app.api.routes.jobs import router as jobs_router
from app.api.routes.profile import router as profile_router
from app.api.routes.searches import router as searches_router
from app.db.session import init_db

app = FastAPI(title="ApplyAi API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001", "http://localhost:3002"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    init_db()


app.include_router(jobs_router)
app.include_router(searches_router)
app.include_router(fetch_router)
app.include_router(profile_router)
app.include_router(generate_router)


@app.get("/health")
def health():
    return {"status": "ok"}
