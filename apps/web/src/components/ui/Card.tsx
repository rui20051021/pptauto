import type { HTMLAttributes, PropsWithChildren, ReactNode } from "react";

type CardProps = PropsWithChildren<
  HTMLAttributes<HTMLDivElement> & {
    title?: string;
    eyebrow?: string;
    actions?: ReactNode;
  }
>;

export function Card({ children, className = "", title, eyebrow, actions, ...props }: CardProps) {
  return (
    <section {...props} className={`card ${className}`.trim()}>
      {(title || eyebrow || actions) && (
        <div className="card-header">
          <div>
            {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
            {title ? <h2 className="card-title">{title}</h2> : null}
          </div>
          {actions ? <div className="card-actions">{actions}</div> : null}
        </div>
      )}
      {children}
    </section>
  );
}
