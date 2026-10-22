import type { ReactNode } from "react";

interface AccountCardProps {
  children: ReactNode;
  className?: string;
}

export function AccountCard({ children, className }: AccountCardProps) {
  return (
    <div
      className={[
        "rounded-2xl backdrop-blur-sm bg-[color:var(--acc-surface)] border border-[color:var(--acc-border)] p-6 sm:p-8",
        className ?? "",
      ].join(" ").trim()}
    >
      {children}
    </div>
  );
}
