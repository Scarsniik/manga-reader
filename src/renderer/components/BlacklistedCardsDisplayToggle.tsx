import React from "react";
import { EyeIcon, FilterRemoveIcon } from "@/renderer/components/icons";
import "@/renderer/components/BlacklistedCardsDisplayToggle.scss";

type BlacklistedCardsDisplayToggleProps = {
  blacklistedCardCount: number;
  hideBlacklistedCards: boolean;
  showBlacklistedCardsLocally: boolean;
  onShowBlacklistedCardsLocallyChange: (showBlacklistedCards: boolean) => void;
  className?: string;
};

export const useLocalBlacklistedCardsDisplay = (hideBlacklistedCards: boolean) => {
  const [showBlacklistedCardsLocally, setShowBlacklistedCardsLocally] = React.useState(false);

  React.useEffect(() => {
    if (!hideBlacklistedCards) {
      setShowBlacklistedCardsLocally(false);
    }
  }, [hideBlacklistedCards]);

  return {
    shouldHideBlacklistedCards: hideBlacklistedCards && !showBlacklistedCardsLocally,
    showBlacklistedCardsLocally: hideBlacklistedCards && showBlacklistedCardsLocally,
    setShowBlacklistedCardsLocally,
  };
};

export default function BlacklistedCardsDisplayToggle({
  blacklistedCardCount,
  hideBlacklistedCards,
  showBlacklistedCardsLocally,
  onShowBlacklistedCardsLocallyChange,
  className = "",
}: BlacklistedCardsDisplayToggleProps) {
  const count = Math.max(0, Math.floor(blacklistedCardCount));

  if (!hideBlacklistedCards || count === 0) {
    return null;
  }

  const Icon = showBlacklistedCardsLocally ? FilterRemoveIcon : EyeIcon;
  const countLabel = showBlacklistedCardsLocally
    ? `${count} card(s) blacklistee(s) affichee(s) en grise.`
    : `${count} card(s) masquee(s) par la blacklist.`;
  const buttonLabel = showBlacklistedCardsLocally ? "Masquer" : "Afficher grisees";
  const buttonTitle = showBlacklistedCardsLocally
    ? "Masquer localement les cards avec tags blacklistes"
    : "Afficher localement les cards avec tags blacklistes en grise";

  return (
    <div className={["blacklisted-cards-display-toggle", className].filter(Boolean).join(" ")}>
      <span className="blacklisted-cards-display-toggle__count">{countLabel}</span>
      <button
        type="button"
        className="blacklisted-cards-display-toggle__button"
        onClick={() => onShowBlacklistedCardsLocallyChange(!showBlacklistedCardsLocally)}
        aria-pressed={showBlacklistedCardsLocally}
        title={buttonTitle}
      >
        <Icon aria-hidden="true" focusable="false" />
        <span>{buttonLabel}</span>
      </button>
    </div>
  );
}
