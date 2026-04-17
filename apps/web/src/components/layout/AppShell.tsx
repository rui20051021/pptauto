import type { PropsWithChildren } from "react";
import { Link, NavLink } from "react-router-dom";
import type { User } from "../../types";
import { Button } from "../ui/Button";

type AppShellProps = PropsWithChildren<{
  user: User | null;
  onLogout: () => void;
}>;

export function AppShell({ children, user, onLogout }: AppShellProps) {
  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="sidebar-brand-block">
          <Link className="brand" to="/">
            PPT 智能工作台
          </Link>
          <p className="sidebar-copy">面向业务场景的中文化 PPT 生成控制台。</p>
        </div>

        <nav className="sidebar-nav">
          <NavLink to="/" end className={({ isActive }) => `sidebar-link ${isActive ? "sidebar-link-active" : ""}`}>
            项目列表
          </NavLink>
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <strong>{user?.full_name || "当前用户"}</strong>
            <span>{user?.email || "暂无邮箱"}</span>
          </div>
          <Button variant="secondary" onClick={onLogout}>
            退出登录
          </Button>
        </div>
      </aside>

      <main className="app-content">{children}</main>
    </div>
  );
}
