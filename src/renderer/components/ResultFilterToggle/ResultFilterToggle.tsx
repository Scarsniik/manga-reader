import React from "react";
import "@/renderer/components/ResultFilterToggle/style.scss";

type Props = {
  active: boolean;
  label: string;
  onChange: (active: boolean) => void;
  inactiveTitle: string;
  activeTitle: string;
  disabled?: boolean;
  variant?: "filter" | "result";
};

export default function ResultFilterToggle({
  active,
  label,
  onChange,
  inactiveTitle,
  activeTitle,
  disabled = false,
  variant = "filter",
}: Props) {
  return (
    <button
      type="button"
      className={[
        "result-filter-toggle",
        variant === "result" ? "is-result" : "",
        active ? "is-active" : "",
      ].filter(Boolean).join(" ")}
      aria-pressed={active}
      disabled={disabled}
      onClick={() => onChange(!active)}
      title={active ? activeTitle : inactiveTitle}
    >
      {label}
    </button>
  );
}
