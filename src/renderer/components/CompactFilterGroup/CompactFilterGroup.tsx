import React from "react";
import "@/renderer/components/CompactFilterGroup/style.scss";

type Props = {
  children: React.ReactNode;
  className?: string;
  ariaLabel?: string;
};

export default function CompactFilterGroup({
  children,
  className,
  ariaLabel = "Autres filtres",
}: Props) {
  return (
    <div
      className={["compact-filter-group", className].filter(Boolean).join(" ")}
      role="group"
      aria-label={ariaLabel}
    >
      {children}
    </div>
  );
}
