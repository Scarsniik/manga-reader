import React from "react";
import SelectorFieldList from "@/renderer/components/SelectorAssistant/SelectorFieldList";
import SelectorSamplesPanel from "@/renderer/components/SelectorAssistant/SelectorSamplesPanel";
import SelectorTestResults from "@/renderer/components/SelectorAssistant/SelectorTestResults";
import SelectorNavigationBar from "@/renderer/components/SelectorAssistant/SelectorNavigationBar";
import useSelectorAssistantController from "@/renderer/components/SelectorAssistant/useSelectorAssistantController";
import type {
  SelectorAssistantPreviewMode,
  SelectorAssistantSelectionMode,
} from "@/shared/selectorAssistant";
import "@/renderer/components/SelectorAssistant/style.scss";

const PREVIEW_MODES: Array<[SelectorAssistantPreviewMode, string]> = [
  ["runtime", "HTML du scraper"],
  ["interactive", "Page interactive"],
];

const SELECTION_MODES: Array<[SelectorAssistantSelectionMode, string]> = [
  ["navigate", "Naviguer"],
  ["positive", "+ Positif"],
  ["negative", "− Negatif"],
];

export default function SelectorAssistantView() {
  const controller = useSelectorAssistantController();
  const {
    snapshot,
    drafts,
    activeField,
    activeDraft,
    activeFieldName,
    setActiveFieldName,
    activeMode,
    changePreviewMode,
    selectionMode,
    setSelectionMode,
    pending,
    expectedValue,
    setExpectedValue,
    busy,
    message,
    previewRef,
    scopeSelector,
    confirmPending,
    removeSample,
    generate,
    test,
    canApply,
    apply,
    updateSelector,
    focusRejected,
    runtimeError,
    navigation,
  } = controller;

  if (!snapshot || !activeField || !activeDraft) {
    return <div className="selector-assistant-loading">Chargement de l&apos;assistant…</div>;
  }

  return (
    <div className="selector-assistant-layout">
      <section className="selector-assistant-preview-shell">
        <SelectorNavigationBar
          state={navigation.state}
          url={navigation.url}
          urlPattern={snapshot.urlPattern}
          patternValue={navigation.urlPattern}
          patternApplied={navigation.patternApplied}
          onUrlChange={navigation.setUrl}
          onPatternChange={navigation.setUrlPattern}
          onBack={navigation.back}
          onForward={navigation.forward}
          onReload={navigation.reload}
          onOpenUrl={navigation.openUrl}
          onApplyPattern={() => void navigation.applyUrlPattern()}
        />
        <div className="selector-assistant-toolbar">
          <div className="selector-assistant-segmented" aria-label="Type de page">
            {PREVIEW_MODES.map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                className={activeMode === mode ? "is-active" : ""}
                onClick={() => changePreviewMode(mode)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="selector-assistant-segmented" aria-label="Mode d'interaction">
            {SELECTION_MODES.map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                className={`${selectionMode === mode ? "is-active" : ""} is-${mode}`}
                onClick={() => setSelectionMode(mode)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {activeMode === "runtime" && runtimeError ? (
          <div className="selector-assistant-preview-error">{runtimeError}</div>
        ) : null}
        <div ref={previewRef} className="selector-assistant-preview" aria-label="Page a scraper" />
      </section>

      <aside className="selector-assistant-toolbox">
        <header className="selector-assistant-toolbox__header">
          <span>{snapshot.scraperName}</span>
          <h1>{snapshot.featureLabel}</h1>
          <p>Construis chaque selecteur a partir d&apos;exemples pris directement dans la page.</p>
        </header>

        <div className="selector-assistant-toolbox__body">
          <SelectorFieldList
            fields={snapshot.fields}
            drafts={drafts}
            activeFieldName={activeFieldName}
            onSelect={setActiveFieldName}
          />

          <main className="selector-assistant-workflow">
            <div className="selector-assistant-workflow__title">
              <div>
                <small>Selecteur actif</small>
                <h2>{activeField.label}</h2>
              </div>
              {scopeSelector ? <span>Relatif a <code>{scopeSelector}</code></span> : <span>Page complete</span>}
            </div>

            <SelectorSamplesPanel
              pending={pending}
              requiresExpectedValue={activeField.kind === "value"}
              expectedValue={expectedValue}
              samples={activeDraft.samples}
              onExpectedValueChange={setExpectedValue}
              onConfirmPending={confirmPending}
              onRemoveSample={removeSample}
            />

            <section className="selector-assistant-card">
              <div className="selector-assistant-card__heading">
                <div><span className="selector-assistant-step-number">2</span><strong>Generer et tester</strong></div>
              </div>
              <div className="selector-assistant-generate-actions">
                <button type="button" className="secondary" disabled={busy} onClick={() => void generate()}>
                  {busy ? "Analyse…" : "Creer le selecteur"}
                </button>
              </div>
              <label className="selector-assistant-selector-input">
                <span>Selecteur CSS propose</span>
                <input
                  type="text"
                  value={activeDraft.selector}
                  placeholder="Le selecteur genere apparaitra ici"
                  onChange={(event) => updateSelector(event.currentTarget.value)}
                />
              </label>
              {activeDraft.attribute ? (
                <div className="selector-assistant-attribute">Valeur extraite depuis <code>@{activeDraft.attribute}</code></div>
              ) : null}
              {activeDraft.generationWarning ? (
                <p className="selector-assistant-warning">{activeDraft.generationWarning}</p>
              ) : null}
              <button
                type="button"
                className="secondary"
                disabled={busy || !activeDraft.selector.trim()}
                onClick={() => void test()}
              >
                Tester sur les deux pages
              </button>
              <SelectorTestResults results={activeDraft.results} onFocusRejected={focusRejected} />
            </section>

            <section className="selector-assistant-card selector-assistant-apply-card">
              <div className="selector-assistant-card__heading">
                <div><span className="selector-assistant-step-number">3</span><strong>Envoyer au formulaire</strong></div>
              </div>
              <button type="button" className="primary" disabled={!activeDraft.selector.trim()} onClick={apply}>
                {canApply ? "Valider ce selecteur" : "Valider malgré les erreurs"}
              </button>
              {!canApply ? <small>Une confirmation sera demandée avant l&apos;envoi.</small> : null}
            </section>

            {message ? <div className="selector-assistant-message">{message}</div> : null}
          </main>
        </div>
      </aside>
    </div>
  );
}
