FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY requirements.txt /tmp/root-requirements.txt
COPY apps/api/requirements.txt /tmp/api-requirements.txt

RUN pip install --upgrade pip \
    && pip install -r /tmp/root-requirements.txt \
    && pip install -r /tmp/api-requirements.txt

COPY apps/api /app/apps/api
COPY skills /app/skills
COPY .env.example /app/.env.example

RUN mkdir -p /app/var/storage /app/var/uploads /app/var/workspaces

WORKDIR /app/apps/api

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
