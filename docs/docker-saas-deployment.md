# PPT SaaS UI Docker Deployment

This setup packages the current SaaS UI into two containers:

- `web`: Nginx serving the built React frontend
- `api`: FastAPI backend running the PPT generation pipeline

The frontend proxies `/api` to the backend, so users only need one public port.

## 1. Prerequisites

- Docker 24+
- Docker Compose v2

## 2. Prepare the environment file

From the repository root:

```bash
cp docker-compose.env.example .env
```

Edit `.env` and set at least:

```env
PPT_UI_SECRET_KEY=replace-with-a-random-long-secret
PPT_UI_MODEL_PROVIDER=mock
PPT_UI_MODEL_NAME=gpt-4.1-mini
PPT_UI_MODEL_API_KEY=
PPT_UI_MODEL_BASE_URL=
PPT_MASTER_PORT=8080
```

### External AI

For OpenAI or an OpenAI-compatible gateway:

```env
PPT_UI_MODEL_PROVIDER=openai
PPT_UI_MODEL_NAME=gpt-5.4
PPT_UI_MODEL_API_KEY=your-api-key
PPT_UI_MODEL_BASE_URL=https://api.openai.com/v1
```

If you leave `PPT_UI_MODEL_PROVIDER=mock`, the app still runs and can generate decks using the local planning fallback.

## 3. Start the stack

```bash
docker compose up -d --build
```

On Windows PowerShell, you can also use:

```powershell
.\docker-up.ps1
```

After startup:

- Web UI: `http://<server-ip>:8080`
- The backend stays internal behind the web proxy

## 4. Stop the stack

```bash
docker compose down
```

Windows PowerShell:

```powershell
.\docker-down.ps1
```

## 5. Update after pulling new code

```bash
docker compose down
docker compose up -d --build
```

## 6. Persistent data

The compose file uses a named volume:

- `ppt-master-var`

It stores:

- SQLite database
- uploaded source files
- generated SVG/PPTX artifacts
- runtime model configuration

To inspect it:

```bash
docker volume inspect ppt-master-main_ppt-master-var
```

The exact volume name may vary with the compose project name.

## 7. First-use flow

1. Open the web UI.
2. Register an account.
3. Create a project.
4. Upload a document or paste a text brief.
5. Generate the PPT.
6. Download the exported PPTX from the artifact panel.

## 8. Troubleshooting

### The page opens but generation fails immediately

Check API logs:

```bash
docker compose logs -f api
```

### The frontend is up but `/api` returns 502/504

Check whether the backend container is healthy:

```bash
docker compose ps
```

### I changed model settings in `.env` but the old values are still used

Recreate the containers:

```bash
docker compose down
docker compose up -d --build
```

### I want to expose a different port

Change:

```env
PPT_MASTER_PORT=8080
```

to any open port, for example `80`, `3000`, or `9000`.
