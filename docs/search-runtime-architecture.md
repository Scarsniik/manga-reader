# Architecture des recherches distantes

## Types couverts

Les modules primitifs sont `homepage`, `search`, `author`, `tag`, `tagList` et `details`. Ils alimentent les recherches composées suivantes :

- multi-recherche ;
- favoris de tags et d'auteurs ;
- nouveautés par sources et par auteurs ;
- rafraîchissement d'un auteur favori et page auteur simple ;
- correspondances de mangas et d'auteurs.

Les filtres de bibliothèque, favoris, historique et tags similaires sont des recherches locales. Ils ne passent pas par le runtime réseau décrit ici.

## Fonctions partagées

- `fetchResolvedScraperListingPage` exécute une page Accueil/Recherche/Auteur/Tag : requête, fin de pagination, parsing, candidates de miniatures et enrichissement optionnel des fiches.
- `fetchScraperPageWithRetry` applique l'attente et les retries de façon identique.
- `processScraperListingPage` construit les cards, ajoute leur tag de provenance, détecte et filtre les langues puis calcule les variantes romanisées.
- `buildScraperSearchResultIdentity` et les helpers associés assurent la même déduplication dans la multi-recherche, les favoris et l'arrière-plan.
- `resolveScraperCardDetails` charge et extrait une fiche sans valider ses images. Son cache de promesses fusionne les demandes simultanées et réutilise les fiches entre termes, tags et sources pendant une exécution.
- `enrichCandidatesForTarget` enrichit les candidates par lots jusqu'au quota demandé et laisse le reliquat disponible pour la suite.
- `runTasksWithConcurrency` est la primitive de concurrence interne. Toutes les requêtes passent ensuite par le limiteur global Electron et respectent le maximum configuré par l'utilisateur ainsi que les limites propres à chaque scraper.

## Parité premier plan / arrière-plan

- Les nouveautés par sources appellent le même moteur complet, `runScraperLatestSearch`, dans les deux modes.
- La multi-recherche appelle `executeMultiSearchTermPage` dans les deux modes ; l'interface et le runner ne gardent que leur gestion d'état, d'annulation et de snapshots.
- Les favoris, nouveautés par auteurs et correspondances utilisent le même chargeur, le même traitement de cards, la même identité et le même résolveur de fiches. Leur planification reste spécifique, car leurs règles de pagination, de quota et de présentation diffèrent.

## Corpus de non-régression

`npm run regression:search -- --phase <nom> --transport live` sélectionne les dernières entrées locales, les borne et enregistre les résultats de sept recherches composées et quatre modules primitifs dans `temp/search-regression-corpus/`.

`--transport replay` rejoue exactement les réponses de la référence. Le rapport ignore seulement les durées, UUID et timestamps de trace. Une passe `live` complémentaire permet de distinguer une régression d'un changement réel des sites.

## Prochaines extractions possibles

- partager le planificateur complet entre les nouveautés par auteurs affichées au premier plan et leur job d'arrière-plan ;
- généraliser checkpoints et diagnostics de performance aux recherches autres que les nouveautés ;
- donner aux règles de filtrage une déclaration explicite des champs de fiche requis, afin de ne charger que les métadonnées réellement manquantes ;
- faire passer la collecte `tagList` et les assistants de configuration par des adaptateurs du même runtime lorsqu'ils quittent leur rôle de test de sélecteurs.
