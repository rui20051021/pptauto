# PPT Master SaaS API

```bash
cd apps/api
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Environment variables:

- `PPT_UI_DATABASE_URL`
- `PPT_UI_STORAGE_BACKEND=local|s3`
- `PPT_UI_MODEL_PROVIDER=mock|openai`
- `PPT_UI_MODEL_API_KEY`
- `PPT_UI_MODEL_BASE_URL`
- `PPT_UI_MODEL_RUNTIME_CONFIG_PATH`
- `PPT_UI_JOB_INLINE=true|false`

## 外部 AI 接入

现在支持两种方式接入 GPT / OpenAI 兼容接口：

1. 在环境变量或 `.env` 中配置：
   - `PPT_UI_MODEL_PROVIDER=openai`
   - `PPT_UI_MODEL_NAME=gpt-4.1-mini`
   - `PPT_UI_MODEL_API_KEY=...`
   - `PPT_UI_MODEL_BASE_URL=https://api.openai.com/v1` 或你的兼容接口地址
2. 登录前端项目页，在“模型接入”面板里直接保存和测试连接。

说明：

- 后端现在会同时读取仓库根目录 `.env` 和 `apps/api/.env`。
- 如果前端面板里保存了运行时模型配置，会优先使用该配置。
- 如果请求提供方切到 `openai` 但没有可用 `API Key`，生成链路会明确显示当前仍回退到本地智能规划。
