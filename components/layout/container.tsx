import type { ReactNode } from "react";

type ContainerWidth = "narrow" | "default" | "wide";

interface ContainerProps {
  children: ReactNode;
  width?: ContainerWidth;
  className?: string;
  as?: keyof React.JSX.IntrinsicElements;
}

const widthClass: Record<ContainerWidth, string> = {
  narrow: "container-narrow",
  default: "container-default",
  wide: "container-wide",
};

export function Container({
  children,
  width = "default",
  className = "",
  as: Tag = "div",
}: ContainerProps) {
  const Component = Tag as React.ElementType;
  return (
    <Component className={`${widthClass[width]} ${className}`.trim()}>
      {children}
    </Component>
  );
}
