# PPT Master Apps

## Structure

- `api/`: FastAPI backend for auth, projects, wizard config, runs, logs, slides, and artifacts
- `web/`: React + Vite frontend workspace for the guided SaaS flow

## Local Run

### Backend

```powershell
cd apps\api
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### Frontend

```powershell
cd apps\web
npm install
npm run dev
```

## Default Dev Flow

1. Register a user in the web UI
2. Create a project
3. Upload Markdown / PDF / DOCX / URL sources
4. Save the wizard
5. Start a generation run
6. Review logs, slide preview, and exported PPTX

## Docker Deploy

For one-command deployment, use the repository-root compose stack:

```powershell
Copy-Item docker-compose.env.example .env
docker compose up -d --build
```

Default entry:

- `http://localhost:8080`

Full guide:

- [docs/docker-saas-deployment.md](../docs/docker-saas-deployment.md)

## 模型接入

项目详情页顶部新增了“模型接入”卡片，可直接配置：

- 模型提供方：本地智能规划 / OpenAI 兼容
- 模型名称
- Base URL
- API Key

保存后可直接测试连接。配置成功时，后端生成链路会优先走外部 AI；未配置成功时，会明确回退到本地智能规划。
