
# Sélection multiple et modification multiple des cartes

Cette page documente le comportement attendu, le contrat, les fichiers à modifier et les critères d'acceptation pour l'implémentation d'un système de sélection multiple de cartes (mangas) et d'une modification multiple de tags.

## Résumé

Objectif : permettre à l'utilisateur de sélectionner plusieurs cartes dans la liste de mangas puis d'ouvrir un outil de modification en masse pour ajouter et/ou supprimer des tags sur tous les mangas sélectionnés.

Comportements principaux :
- Activer la sélection multiple par :
	- Ctrl + clic sur une carte pour ajouter/enlever la carte à la sélection.
	- Un bouton dans le header qui active un "mode sélection" : lorsque le mode est actif, un simple clic sur une carte la sélectionne (sans modifier la navigation habituelle).
- Visuel : les cartes sélectionnées affichent un liseré ou une classe CSS `selected`.
- Dans le header, quand au moins une carte est sélectionnée, afficher un bouton "Modification multiple" qui ouvre un modal.
- Modal de modification multiple : contient deux sélecteurs de tags distincts :
	- Tags à ajouter
	- Tags à supprimer
- Validation : l'utilisateur valide les changements et l'action est appliquée à tous les mangas sélectionnés.

## Checklist des exigences (extrait de la demande)

1. Activation de la sélection multiple : Ctrl+clic sur la carte ou bouton dans le header + clic sur carte. (UI + interactions)
2. Visuel de sélection : liseré autour des cartes sélectionnées.
3. Bouton dans le header qui apparaît lorsque la sélection non vide permet la modification multiple.
4. Dans la modification multiple : deux sélections de tags distinctes (ajout / suppression).
5. Validation applique les modifications à tous les mangas sélectionnés.

## Contrat technique (inputs / outputs)

- Input (frontend -> backend) pour l'opération batch :
	- mangaIds: string[] (identifiants des mangas sélectionnés)
	- addTags: string[] (identifiants/noms de tags à ajouter)
	- removeTags: string[] (identifiants/noms de tags à supprimer)

- Output (backend -> frontend) :
	- success: boolean
	- updatedCount: number
	- failed: { id: string, reason: string }[] (optionnel)

## UX flows

1. Sélection via Ctrl+clic
	 - L'utilisateur maintient Ctrl et clique sur des cartes. Chaque clic ajoute/retire la carte de la sélection.
	 - Les cartes sélectionnées reçoivent la classe CSS `selected`.

2. Mode sélection via header
	 - L'utilisateur clique sur l'icône/bouton "Sélection" dans le header. Le header passe en "mode sélection" (persistant jusqu'à désactivation).
	 - En mode sélection, un clic simple sur une carte l'ajoute/enlève à la sélection.
	 - Le mode peut être désactivé via le même bouton ou en appuyant sur Échap.

3. Ouverture du modal de modification multiple
	 - Quand la sélection contient 1+ mangas, le header affiche un bouton "Modification multiple".
	 - Cliquer ouvre un modal contenant : deux pickers (tags à ajouter, tags à supprimer), résumé du nombre de mangas sélectionnés, boutons Valider/Annuler.

4. Application des modifications
	 - Après validation, frontend envoie le payload batch au backend.
	 - Backend applique les changements (ajout/réduction de tags) et retourne le résultat.
	 - Frontend affiche un toast/notification de succès ou d'erreur, actualise la liste ou les cartes modifiées et vide la sélection.

## Modèles de données et format des tags

- Tags : selon le projet existant, un tag peut être identifié par `id` ou `name`. On utilisera `id` si disponible, sinon `name`.
- Recommandation : payload utilise les `id` des tags pour éviter les collisions.

## Handlers / API

Proposition d'API IPC/handler (Electron) :

- channel: `mangas/batchUpdateTags`
- payload: { mangaIds: string[], addTagIds?: string[], removeTagIds?: string[] }
- response: { success: boolean, updatedCount: number, failed?: { id: string, reason: string }[] }

Le handler côté main devra :
- valider le payload
- pour chaque mangaId, charger le manga, appliquer les changements (ajout / suppression de tags), sauvegarder
- renvoyer un résumé

## Fichiers / composants à modifier (suggestions)

- Frontend (renderer) :
	- `src/renderer/components/MangaManger/MangaManager.tsx` (liste de cartes) — gérer le state de sélection (array d'IDs), interactions Ctrl+clic et mode header.
	- `src/renderer/components/MangaCard/MangaCard.tsx` — appliquer la classe `selected` et déclencher la sélection au clic.
	- `src/renderer/context/ModalContext.tsx` ou composant Modal existant — créer `BatchEditModal` (ou réutiliser `Modal/modales/` existants).
	- `src/renderer/components/Modal/modales/` — ajouter `BatchEditModal.tsx` et styles.
	- `src/renderer/context/RefreshContext.tsx` ou hook `useRefresh.ts` — déclencher refresh après modification.

- Backend (electron handlers) :
	- `src/electron/handlers/mangas.ts` ou un handler nouveau `handlers/mangas.ts` — ajouter la route `batchUpdateTags`.
	- `src/electron/ipc.ts` — s'assurer que le canal est exposé au preload si nécessaire.

## Proposition d'implémentation UI (résumé technique)

- State local (MangaManager) :
	- selected: Set<string> ou string[]
	- selectionMode: boolean (active via header)

- Comportement du clic sur `MangaCard` :
	- si event.ctrlKey || selectionMode -> toggleSelection(mangaId)
	- sinon -> ouvrir le détail normal (navigation)

- Classe CSS : `.MangaCard.selected { outline: 2px solid var(--accent); }` ou `box-shadow` léger.

- Header : afficher `Batch edit` lorsque selected.size > 0. Un autre bouton bascule `selectionMode`.

## Edge cases & validation

- Sélection vide : le bouton de modification multiple ne doit pas être visible / activable.
- Conflits tags : si on demande d'ajouter un tag déjà présent, l'opération doit être idempotente (ne pas dupliquer).
- Performance : si beaucoup de mangas sont sélectionnés (> 200), exécuter la mise à jour en batch côté backend plutôt qu'en 1 requête par manga; prévoir feedback (spinner / progression).
- Permissions / erreurs : l'UI doit afficher les erreurs pour les items qui n'ont pas pu être modifiés.

## Critères d'acceptation

1. L'utilisateur peut sélectionner plusieurs cartes avec Ctrl+clic et/ou via le mode header.
2. Les cartes sélectionnées affichent un liseré clair (`selected`).
3. Quand au moins une carte est sélectionnée, un bouton "Modification multiple" est visible dans le header.
4. Le modal de modification multiple propose deux sélecteurs : tags à ajouter et tags à supprimer.
5. Valider envoie le payload au backend et applique les modifications à tous les mangas sélectionnés.
6. Après succès, la liste est rafraîchie et la sélection est réinitialisée.

## Tests recommandés

- Test UI (manuel) : sélectionner/désélectionner via Ctrl+clic, via mode header; vérifier visuel et bouton header.
- Test unitaire (handler) : envoyer un payload avec plusieurs mangaIds, add/remove tags; vérifier updatedCount et que les tags sont bien modifiés.
- Test de charge : sélectionner 500 items et appliquer un ajout de tag (vérifier temps et erreurs).

## Étapes suivantes (implémentation)

1. Implémenter le state et la logique de sélection dans `MangaManager.tsx` et `MangaCard.tsx`.
2. Ajouter styles `.selected` dans les composants existants.
3. Créer `BatchEditModal.tsx` dans `src/renderer/components/Modal/modales/`.
4. Ajouter handler `mangas/batchUpdateTags` côté electron.
5. Tests et QA.

---

Fichier créé/édité : `docs/Selection_multiple.md` — spécification complète pour la sélection multiple et modification multiple de tags.
