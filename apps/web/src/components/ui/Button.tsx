import type { ButtonHTMLAttributes, PropsWithChildren } from "react";

type ButtonProps = PropsWithChildren<
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: "primary" | "secondary" | "ghost" | "danger";
    size?: "md" | "sm";
    isLoading?: boolean;
    loadingLabel?: string;
  }
>;

export function Button({
  children,
  className = "",
  variant = "primary",
  size = "md",
  isLoading = false,
  loadingLabel,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || isLoading}
      aria-busy={isLoading}
      className={`button button-${variant} button-${size} ${isLoading ? "button-busy" : ""} ${className}`.trim()}
    >
      {isLoading ? <span className="button-spinner" aria-hidden="true" /> : null}
      <span>{isLoading && loadingLabel ? loadingLabel : children}</span>
    </button>
  );
}
