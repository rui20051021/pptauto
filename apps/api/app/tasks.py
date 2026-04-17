from __future__ import annotations

import queue
import threading

from .core.config import settings
from .db import db_session
from .services.pipeline import GenerationPipeline


class JobRunner:
    def __init__(self) -> None:
        self.jobs: queue.Queue[str] = queue.Queue()
        self.worker: threading.Thread | None = None
        self.started = False

    def start(self) -> None:
        if settings.job_inline or self.started:
            self.started = True
            return
        self.worker = threading.Thread(target=self._loop, daemon=True, name="ppt-master-worker")
        self.worker.start()
        self.started = True

    def enqueue(self, run_id: str) -> None:
        if settings.job_inline:
            self.process(run_id)
            return
        self.jobs.put(run_id)

    def process(self, run_id: str) -> None:
        with db_session() as db:
            pipeline = GenerationPipeline(db)
            pipeline.run(run_id)

    def _loop(self) -> None:
        while True:
            run_id = self.jobs.get()
            try:
                self.process(run_id)
            finally:
                self.jobs.task_done()


job_runner = JobRunner()
