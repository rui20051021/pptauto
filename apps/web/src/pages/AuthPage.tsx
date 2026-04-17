import { useState, type FormEvent } from "react";
import type { AsyncFeedback } from "../types";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";

type AuthPageProps = {
  feedback: AsyncFeedback;
  onLogin: (payload: { email: string; password: string }) => Promise<void>;
  onRegister: (payload: { email: string; password: string; full_name?: string | null }) => Promise<void>;
};

export function AuthPage({ feedback, onLogin, onRegister }: AuthPageProps) {
  const [mode, setMode] = useState<"login" | "register">("register");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const isSubmitting = feedback.status === "loading";

  async function handleSubmit(event?: FormEvent) {
    event?.preventDefault();
    if (mode === "register") {
      await onRegister({ email, password, full_name: fullName || null });
      return;
    }
    await onLogin({ email, password });
  }

  return (
    <div className="auth-shell">
      <Card className="auth-card">
        <p className="eyebrow">PPT 智能工作台</p>
        <h1 className="page-title">{mode === "register" ? "创建工作台账号" : "登录工作台"}</h1>
        <p className="page-copy">
          使用中文工作台完成素材导入、参数配置、任务生成与结果预览。
        </p>

        <form className="panel-stack" onSubmit={handleSubmit}>
          {mode === "register" ? (
            <label>
              姓名
              <input value={fullName} onChange={(event) => setFullName(event.target.value)} />
            </label>
          ) : null}
          <label>
            邮箱
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label>
            密码
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>

          {feedback.message ? (
            <p className={`feedback feedback-${feedback.status === "error" ? "error" : "success"}`}>{feedback.message}</p>
          ) : null}

          <Button
            type="submit"
            isLoading={isSubmitting}
            loadingLabel={mode === "register" ? "正在创建账号..." : "正在登录..."}
            disabled={!email || !password || (mode === "register" && !fullName)}
          >
            {mode === "register" ? "创建账号" : "登录"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setMode(mode === "register" ? "login" : "register")} disabled={isSubmitting}>
            {mode === "register" ? "已有账号，去登录" : "没有账号，去注册"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
