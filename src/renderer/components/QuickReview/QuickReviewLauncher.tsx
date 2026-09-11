import React from "react";
import QuickReviewDialog from "@/renderer/components/QuickReview/QuickReviewDialog";
import type {
  QuickReviewItem,
  QuickReviewOpenSeries,
  QuickReviewSeriesSession,
} from "@/renderer/components/QuickReview/types";
import {
  cloneQuickReviewItems,
  cloneQuickReviewSeriesSession,
} from "@/renderer/components/QuickReview/quickReviewItems";
import { EyeIcon } from "@/renderer/components/icons";
import useModal from "@/renderer/hooks/useModal";
import "@/renderer/components/QuickReview/launcher.scss";

type Props = {
  items: QuickReviewItem[];
  className?: string;
  disabled?: boolean;
  label?: string;
  onOpenSeries?: QuickReviewOpenSeries;
  seriesSession?: QuickReviewSeriesSession;
};

export default function QuickReviewLauncher({
  items,
  className = "",
  disabled = false,
  label = "Review rapide",
  onOpenSeries,
  seriesSession,
}: Props) {
  const { openModal } = useModal();

  const handleOpen = () => {
    const snapshot = cloneQuickReviewItems(items);
    if (!snapshot.length) return;
    const seriesSnapshot = cloneQuickReviewSeriesSession(seriesSession);

    openModal({
      title: `Review rapide · ${snapshot.length} fiche(s)`,
      content: (
        <QuickReviewDialog
          items={snapshot}
          onOpenSeries={onOpenSeries}
          seriesSession={seriesSnapshot}
        />
      ),
      className: "quick-review-modal",
      bodyClassName: "quick-review-modal__body",
      actions: [
        {
          label: "Fermer",
          variant: "secondary",
        },
      ],
    });
  };

  return (
    <button
      type="button"
      className={["quick-review-launcher", className].filter(Boolean).join(" ")}
      onClick={handleOpen}
      disabled={disabled || !items.length}
      title="Revoir les fiches actuellement visibles"
    >
      <EyeIcon aria-hidden="true" focusable="false" />
      <span>{label}</span>
      <small>{items.length}</small>
    </button>
  );
}
