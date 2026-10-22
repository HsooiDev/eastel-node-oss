import { forwardRef } from "react";
import { Spinner } from "./spinner";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-brand text-white shadow-sm hover:bg-brand-hover hover:shadow-lg hover:shadow-brand/30 active:translate-y-px",
  secondary:
    "bg-surface text-text-primary border border-border-strong hover:bg-surface-raised hover:border-text-primary",
  ghost:
    "bg-transparent text-text-primary hover:bg-surface-raised",
  danger:
    "bg-red-600 text-white hover:bg-red-700 active:bg-red-800",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-9 px-4 text-sm rounded-[var(--radius)] gap-1.5",
  md: "h-11 px-5 text-sm rounded-[var(--radius-md)] gap-2",
  lg: "h-12 px-7 text-base rounded-[var(--radius-md)] gap-2.5",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = "primary",
      size = "md",
      loading = false,
      fullWidth = false,
      disabled,
      className = "",
      children,
      ...rest
    },
    ref
  ) {
    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        data-variant={variant}
        className={[
          "admin-ui-button inline-flex items-center justify-center font-semibold tracking-tight",
          "transition-[transform,background-color,box-shadow,border-color] duration-150",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
          "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0",
          variantClasses[variant],
          sizeClasses[size],
          fullWidth ? "w-full" : "",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        {...rest}
      >
        {loading && <Spinner size="sm" />}
        {children}
      </button>
    );
  }
);
