import React from "react";
import type {
  AuthorCorrespondenceBackgroundResult,
  MangaCorrespondenceDiscovery,
} from "@/renderer/backgroundSearch/types";
import {
  buildAuthorCorrespondenceReplayInput,
  buildInitialAuthorCorrespondenceDiscoveries,
} from "@/renderer/backgroundSearch/authorCorrespondenceDiscoveries";
import { resolveAuthorCorrespondenceManualDiscovery } from "@/renderer/backgroundSearch/mangaCorrespondenceManualDiscoveries";
import MangaCorrespondenceDiscoveriesDialog from "@/renderer/components/MangaCorrespondence/MangaCorrespondenceDiscoveriesDialog";
import useModal from "@/renderer/hooks/useModal";
import { openWorkspaceTarget } from "@/renderer/utils/workspaceTargets";
import type {
  AuthorCorrespondenceBackgroundInput,
  MangaCorrespondenceResultDecision,
} from "@/shared/backgroundSearch";
import { writeAuthorCorrespondenceInvalidations } from "@/renderer/components/AuthorCorrespondence/authorCorrespondenceInvalidations";

type Props = {
  active: boolean;
  backgroundSearchJobId?: string;
  displayedMatches: AuthorCorrespondenceBackgroundResult["matches"];
  input?: AuthorCorrespondenceBackgroundInput;
  invalidatedMatchKeys: Set<string>;
  onInvalidatedMatchKeysChange: (keys: Set<string>) => void;
  reload: () => Promise<void>;
  result?: AuthorCorrespondenceBackgroundResult;
};

export default function AuthorCorrespondenceRevisionButton({
  active,
  backgroundSearchJobId,
  displayedMatches,
  input,
  invalidatedMatchKeys,
  onInvalidatedMatchKeysChange,
  reload,
  result,
}: Props) {
  const { openModal, closeModal } = useModal();
  const discoveries = React.useMemo(
    () => input ? buildInitialAuthorCorrespondenceDiscoveries(input, result) : [],
    [input, result],
  );
  const resultDecisions = React.useMemo<MangaCorrespondenceResultDecision[]>(() => (
    displayedMatches.map((match) => ({
      key: match.key,
      status: invalidatedMatchKeys.has(match.key) ? "invalidated" : "active",
      title: match.authorName,
      analyzedTitle: match.authorName,
      alternativeTitles: [],
      authors: [match.matchedName],
      scraperId: match.scraperId,
      scraperName: match.scraperName,
      sourceUrl: match.authorUrl,
      origin: "match",
    }))
  ), [displayedMatches, invalidatedMatchKeys]);

  const save = async (
    nextDiscoveries: MangaCorrespondenceDiscovery[],
    nextResultDecisions: MangaCorrespondenceResultDecision[],
    replay: boolean,
  ): Promise<void> => {
    if (!backgroundSearchJobId || !input || !result) {
      throw new Error("Le résultat de cette recherche n’est plus disponible.");
    }
    const nextInvalidatedMatchKeys = new Set(nextResultDecisions
      .filter((decision) => decision.status === "invalidated")
      .map((decision) => decision.key));
    const saved = await window.api?.saveBackgroundSearchResult?.({
      jobId: backgroundSearchJobId,
      result: {
        ...result,
        discoveries: nextDiscoveries,
      },
      resultCount: displayedMatches.filter((match) => !nextInvalidatedMatchKeys.has(match.key)).length,
    });
    if (!saved) throw new Error("Les recherches auteur n’ont pas pu être enregistrées.");

    writeAuthorCorrespondenceInvalidations(backgroundSearchJobId, nextInvalidatedMatchKeys);
    onInvalidatedMatchKeysChange(nextInvalidatedMatchKeys);
    if (replay) {
      const replayed = await window.api?.replayBackgroundSearch?.({
        jobId: backgroundSearchJobId,
        input: buildAuthorCorrespondenceReplayInput(input, nextDiscoveries),
      });
      if (!replayed) throw new Error("Le rejeu de la recherche n’a pas pu être lancé.");
    }
    closeModal();
    await reload();
  };

  const open = () => {
    if (!input) return;
    openModal({
      title: "Résultats et recherches auteur",
      className: "manga-correspondence-discoveries-modal",
      content: (
        <MangaCorrespondenceDiscoveriesDialog
          discoveries={discoveries}
          resultDecisions={resultDecisions}
          discoveryKinds={["author"]}
          introduction="Ajoute un nom pour le rechercher sur toutes les sources, ou une URL de page auteur pour interroger directement son scrapper."
          filterPlaceholder="Filtrer par auteur ou scrapper…"
          requiredActiveDiscoveryKind="author"
          requiredActiveDiscoveryError="Réactive au moins un auteur avant de rejouer la recherche."
          requiredActiveDiscoveryHint="Aucun auteur actif : le rejeu est bloqué."
          disabled={active}
          onCancel={closeModal}
          onOpenAuthorPage={async (discovery) => {
            if (!discovery.authorPageUrl) return;
            const opened = await openWorkspaceTarget({
              kind: "scraper.author",
              scraperId: discovery.scraperId,
              query: discovery.authorPageUrl,
              title: discovery.value,
              templateContext: discovery.authorTemplateContext,
            });
            if (!opened) throw new Error("La page auteur n’a pas pu être ouverte dans un nouvel onglet.");
          }}
          onResolveManualDiscovery={async (kind, value) => {
            if (kind !== "author") throw new Error("Seuls les auteurs peuvent être ajoutés à cette recherche.");
            return resolveAuthorCorrespondenceManualDiscovery({
              rawValue: value,
              input,
              fetchDocument: window.api?.fetchScraperDocument,
            });
          }}
          onSave={save}
        />
      ),
    });
  };

  return (
    <button
      type="button"
      className="author-correspondence-view__open-combined"
      disabled={!input}
      onClick={open}
    >
      <span>
        Réviser et rejouer · {displayedMatches.filter((match) => (
          !invalidatedMatchKeys.has(match.key)
        )).length} résultat(s)
        {" · "}{discoveries.length} recherche(s)
      </span>
    </button>
  );
}
