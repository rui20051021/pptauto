# UI SaaS Workspace

This repository now includes a first-pass SaaS workspace implementation:

- `apps/api`: FastAPI backend, auth, projects, wizard config, async generation runs, artifacts
- `apps/web`: React + Vite frontend workspace

## Backend

```bash
cd apps/api
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Important environment variables:

- `PPT_UI_DATABASE_URL`
- `PPT_UI_STORAGE_BACKEND=local|s3`
- `PPT_UI_MODEL_PROVIDER=mock|openai`
- `PPT_UI_MODEL_API_KEY`
- `PPT_UI_MODEL_BASE_URL`
- `PPT_UI_JOB_INLINE=true|false`

Notes:

- `mock` provider is useful for local end-to-end validation.
- `openai` provider uses server-side model calls and keeps the same API surface.
- Generated files are mirrored into the configured storage backend and tracked in the database.

## Frontend

```bash
cd apps/web
npm install
npm run dev
```

Optional environment variable:

- `VITE_API_BASE_URL=http://localhost:8000/api`

## Current flow

1. Register / login
2. Create a project
3. Upload source files or URLs
4. Save wizard selections
5. Start a generation run
6. Monitor logs, preview SVG slides, download PPTX artifacts
