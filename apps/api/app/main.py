from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .core.config import settings
from .db import init_db
from .deps import get_current_user
from .schemas import UserRead
from .routers import artifacts, auth, projects, runs, settings as settings_router
from .tasks import job_runner
from . import models


def create_app() -> FastAPI:
    @asynccontextmanager
    async def lifespan(_: FastAPI):
        init_db()
        job_runner.start()
        yield

    app = FastAPI(title=settings.app_name, lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(auth.router, prefix=settings.api_prefix)
    app.include_router(projects.router, prefix=settings.api_prefix)
    app.include_router(runs.router, prefix=settings.api_prefix)
    app.include_router(artifacts.router, prefix=settings.api_prefix)
    app.include_router(settings_router.router, prefix=settings.api_prefix)

    @app.get("/healthz")
    def healthcheck() -> dict[str, str]:
        return {"status": "ok"}

    @app.get(f"{settings.api_prefix}/me", response_model=UserRead, tags=["auth"])
    def me(current_user: models.User = Depends(get_current_user)) -> models.User:
        return current_user

    return app


app = create_app()
