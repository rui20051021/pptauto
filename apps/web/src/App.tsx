import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { LoadingBlock } from "./components/ui/LoadingBlock";
import { useAuth } from "./hooks/useAuth";
import { AuthPage } from "./pages/AuthPage";
import { ProjectDetailPage } from "./pages/ProjectDetailPage";
import { ProjectsPage } from "./pages/ProjectsPage";

export default function App() {
  const auth = useAuth();

  if (!auth.isAuthenticated) {
    return <AuthPage feedback={auth.authState} onLogin={auth.login} onRegister={auth.register} />;
  }

  if (auth.bootstrapState.status === "loading" && !auth.user) {
    return <LoadingBlock label="正在恢复登录状态..." />;
  }

  return (
    <AppShell user={auth.user} onLogout={auth.logout}>
      <Routes>
        <Route path="/" element={<ProjectsPage token={auth.token!} />} />
        <Route path="/projects/:projectId" element={<ProjectDetailPage token={auth.token!} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}
