import React from "react";
import {
  getLanguageFlagCode,
  getLanguageLabel,
  UNKNOWN_LANGUAGE_CODE,
} from "@/renderer/utils/languageDetection";
import chinaFlag from "flag-icons/flags/4x3/cn.svg";
import germanyFlag from "flag-icons/flags/4x3/de.svg";
import spainFlag from "flag-icons/flags/4x3/es.svg";
import franceFlag from "flag-icons/flags/4x3/fr.svg";
import unitedKingdomFlag from "flag-icons/flags/4x3/gb.svg";
import italyFlag from "flag-icons/flags/4x3/it.svg";
import japanFlag from "flag-icons/flags/4x3/jp.svg";
import southKoreaFlag from "flag-icons/flags/4x3/kr.svg";
import portugalFlag from "flag-icons/flags/4x3/pt.svg";
import russiaFlag from "flag-icons/flags/4x3/ru.svg";
import "./style.scss";

type Props = {
  languageCodes?: string[] | null;
  className?: string;
};

const flagAssetsByCode: Record<string, string> = {
  cn: chinaFlag,
  de: germanyFlag,
  es: spainFlag,
  fr: franceFlag,
  gb: unitedKingdomFlag,
  it: italyFlag,
  jp: japanFlag,
  kr: southKoreaFlag,
  pt: portugalFlag,
  ru: russiaFlag,
};

export default function LanguageFlags({
  languageCodes,
  className = "",
}: Props) {
  const codes = languageCodes?.length ? languageCodes : [UNKNOWN_LANGUAGE_CODE];

  return (
    <span className={["language-flags", className].join(" ").trim()} aria-hidden="true">
      {codes.map((languageCode) => {
        const flagCode = getLanguageFlagCode(languageCode);
        const languageLabel = getLanguageLabel(languageCode);
        const flagAsset = flagAssetsByCode[flagCode];

        return flagAsset ? (
          <img
            key={`${languageCode}-${flagCode}`}
            className="language-flags__flag"
            src={flagAsset}
            alt=""
            title={languageLabel}
            loading="lazy"
            decoding="async"
          />
        ) : (
          <span
            key={languageCode}
            className="language-flags__unknown"
            title={languageLabel}
          >
            ?
          </span>
        );
      })}
    </span>
  );
}
