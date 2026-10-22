interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: "none" | "sm" | "md" | "lg";
  hover?: boolean;
  elevation?: "flat" | "raised";
  onClick?: React.MouseEventHandler<HTMLDivElement>;
}

const paddingMap = {
  none: "",
  sm: "p-4",
  md: "p-6",
  lg: "p-8",
};

export function Card({
  children,
  className = "",
  padding = "md",
  hover = false,
  elevation = "flat",
  onClick,
}: CardProps) {
  return (
    <div
      onClick={onClick}
      className={[
        "admin-ui-card rounded-[var(--radius-lg)] border bg-surface-container",
        elevation === "raised"
          ? "border-outline-variant shadow-[var(--shadow-md)]"
          : "border-outline-variant",
        hover
          ? "transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-outline hover:shadow-[var(--shadow-md)]"
          : "",
        paddingMap[padding],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </div>
  );
}

interface CardHeaderProps {
  children: React.ReactNode;
  className?: string;
}

export function CardHeader({ children, className = "" }: CardHeaderProps) {
  return <div className={`mb-4 ${className}`}>{children}</div>;
}

interface CardTitleProps {
  children: React.ReactNode;
  className?: string;
}

export function CardTitle({ children, className = "" }: CardTitleProps) {
  return (
    <h3 className={`text-lg font-semibold text-on-surface tracking-tight ${className}`}>
      {children}
    </h3>
  );
}

interface CardContentProps {
  children: React.ReactNode;
  className?: string;
}

export function CardContent({ children, className = "" }: CardContentProps) {
  return <div className={className}>{children}</div>;
}
