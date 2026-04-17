import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { TOKEN_STORAGE_KEY } from "../lib/constants";
import type { AsyncFeedback, User } from "../types";

type AuthMode = "login" | "register";

const idleFeedback: AsyncFeedback = { status: "idle" };

export function useAuth() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_STORAGE_KEY));
  const [user, setUser] = useState<User | null>(null);
  const [authState, setAuthState] = useState<AsyncFeedback>(idleFeedback);
  const [bootstrapState, setBootstrapState] = useState<AsyncFeedback>({ status: token ? "loading" : "idle" });

  useEffect(() => {
    if (!token) {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      setUser(null);
      setBootstrapState(idleFeedback);
      return;
    }

    localStorage.setItem(TOKEN_STORAGE_KEY, token);
    setBootstrapState({ status: "loading" });

    api
      .me(token)
      .then((nextUser) => {
        setUser(nextUser);
        setBootstrapState({ status: "success" });
      })
      .catch(() => {
        localStorage.removeItem(TOKEN_STORAGE_KEY);
        setToken(null);
        setUser(null);
        setBootstrapState({ status: "error", message: "登录状态已失效，请重新登录。" });
      });
  }, [token]);

  async function authenticate(
    mode: AuthMode,
    payload: { email: string; password: string; full_name?: string | null }
  ) {
    setAuthState({ status: "loading" });
    try {
      const authToken =
        mode === "register"
          ? await api.register(payload)
          : await api.login({ email: payload.email, password: payload.password });
      setToken(authToken.access_token);
      setAuthState({ status: "success", message: mode === "register" ? "账号创建成功。" : "登录成功。" });
    } catch (error) {
      setAuthState({
        status: "error",
        message: error instanceof Error ? error.message : "登录失败。"
      });
      throw error;
    }
  }

  function logout() {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    setToken(null);
    setUser(null);
    setAuthState(idleFeedback);
  }

  return {
    token,
    user,
    authState,
    bootstrapState,
    isAuthenticated: Boolean(token),
    login: (payload: { email: string; password: string }) => authenticate("login", payload),
    register: (payload: { email: string; password: string; full_name?: string | null }) => authenticate("register", payload),
    logout
  };
}
