# Reader

Le reader n'est plus porté par un seul fichier. `Reader.tsx` est désormais un conteneur qui compose des hooks métier et des composants d'affichage plus petits.

## Structure

- `Reader.tsx`
  - conteneur principal
  - lit les settings utilisateur
  - branche les hooks
  - connecte les composants d'UI
- `hooks/useReaderData.ts`
  - charge le manga et les pages
  - synchronise la page courante dans l'URL
  - persiste la progression de lecture et le nombre de pages connu
  - précharge les images voisines
  - pour les scrapers a template sequentiel, evite de sonder toutes les pages a l'ouverture du reader : reutilise un total connu si disponible, sinon detecte la derniere page par recherche exponentielle puis dichotomie
- `hooks/useReaderNavigation.ts`
  - gère le retour, le changement de page, les transitions entre chapitres et l'écran de fin de lecture
  - gère la copie de l'image courante
  - expose les états dérivés de navigation
- `hooks/useReaderOcr.ts`
  - charge et met en cache l'OCR
  - gère les sélections manuelles
  - gère la sélection/focalisation des bulles OCR
- `hooks/useReaderShortcuts.ts`
  - centralise les raccourcis clavier
- `ReaderStage.tsx`
  - affiche la progression, l'image, la transition de chapitre, la fin de lecture ou l'état vide
- `ReaderCompletion.tsx`
  - affiche la fin de manga/série, le retour bibliothèque, la source et les suggestions avec leur progression si elles sont commencées
- `ReaderEmptyState.tsx`
  - affiche l'état debug quand aucune image n'est disponible
- `ReaderControls.tsx`
  - affiche les boutons précédent/suivant
- `types.ts` / `utils.ts`
  - types et helpers partagés du reader

## Responsabilités fonctionnelles

- Le reader lit les paramètres d'URL `id` et `page`.
- Il supporte la lecture locale et la lecture issue d'un scraper.
- Il gère la navigation clavier/souris, la progression et le passage au chapitre précédent/suivant.
- En fin de manga ou de dernier chapitre de série, il affiche des suggestions de mangas non lus à partir des tags et de la langue. Les séries ne proposent que leur prochain chapitre non lu, la série courante est exclue, les mangas finis sont exclus, et les mangas avec tags cachés sont exclus quand le contenu caché n'est pas affiché.
- L'OCR reste optionnel et s'affiche dans un panneau latéral dédié.
- Les zones OCR peuvent être détectées automatiquement ou ajoutées manuellement.
