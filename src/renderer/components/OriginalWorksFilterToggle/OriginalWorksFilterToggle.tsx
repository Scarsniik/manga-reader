import React from "react";
import "@/renderer/components/OriginalWorksFilterToggle/style.scss";

type Props = {
  active: boolean;
  onChange: (active: boolean) => void;
  label?: string;
  title?: string;
  disabled?: boolean;
  variant?: "filter" | "result";
};

export default function OriginalWorksFilterToggle({
  active,
  onChange,
  label = "Originaux uniquement",
  title,
  disabled = false,
  variant = "filter",
}: Props) {
  return (
    <button
      type="button"
      className={[
        "original-works-filter-toggle",
        variant === "result" ? "is-result" : "",
        active ? "is-active" : "",
      ].filter(Boolean).join(" ")}
      aria-pressed={active}
      disabled={disabled}
      onClick={() => onChange(!active)}
      title={title ?? (
        active
          ? "Afficher aussi les oeuvres derivees"
          : "Masquer les mangas dont la source n'est pas originale"
      )}
    >
      {label}
    </button>
  );
}
