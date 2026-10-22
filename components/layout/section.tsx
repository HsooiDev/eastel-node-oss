import type { ReactNode } from "react";
import { Container } from "./container";

type SectionBg = "base" | "raised" | "sunken" | "brand-dark" | "brand-subtle";
type SectionWidth = "narrow" | "default" | "wide";
type SectionPy = "default" | "tight" | "none";

interface SectionProps {
  children: ReactNode;
  bg?: SectionBg;
  width?: SectionWidth;
  py?: SectionPy;
  divider?: boolean;
  id?: string;
  className?: string;
  grain?: boolean;
  ariaLabelledBy?: string;
}

const bgClass: Record<SectionBg, string> = {
  base: "bg-surface",
  raised: "bg-surface-raised",
  sunken: "bg-surface-sunken",
  "brand-dark": "bg-[#0A0F1F] text-white",
  "brand-subtle": "bg-brand-subtle",
};

const pyClass: Record<SectionPy, string> = {
  default: "section-py",
  tight: "section-py-tight",
  none: "",
};

export function Section({
  children,
  bg = "base",
  width = "default",
  py = "default",
  divider = false,
  id,
  className = "",
  grain = false,
  ariaLabelledBy,
}: SectionProps) {
  return (
    <section
      id={id}
      aria-labelledby={ariaLabelledBy}
      className={[
        "relative",
        bgClass[bg],
        pyClass[py],
        divider ? "border-t border-border" : "",
        grain ? "bg-grain" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <Container width={width} className="relative">
        {children}
      </Container>
    </section>
  );
}

interface SectionHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  align?: "center" | "left";
  id?: string;
}

export function SectionHeader({
  eyebrow,
  title,
  description,
  align = "center",
  id,
}: SectionHeaderProps) {
  return (
    <div
      className={[
        "max-w-3xl mb-12 sm:mb-16",
        align === "center" ? "text-center mx-auto" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {eyebrow && <p className="eyebrow mb-4">{eyebrow}</p>}
      <h2
        id={id}
        className="text-[length:var(--text-3xl)] sm:text-[length:var(--text-display-sm)] font-bold tracking-tight text-text-primary"
      >
        {title}
      </h2>
      {description && (
        <p className="mt-4 text-text-secondary text-base sm:text-lg leading-relaxed">
          {description}
        </p>
      )}
    </div>
  );
}
