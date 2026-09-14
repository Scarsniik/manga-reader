# Architecture des recherches distantes

## Types couverts

Les modules primitifs sont `homepage`, `search`, `author`, `tag`, `authorList`, `tagList` et `details`. Ils alimentent les recherches composées suivantes :

- multi-recherche ;
- favoris de tags et d'auteurs ;
- nouveautés par sources et par auteurs ;
- rafraîchissement d'un auteur favori et page auteur simple ;
- correspondances de mangas et d'auteurs.

Les filtres de bibliothèque, favoris, historique et tags similaires sont des recherches locales. Ils ne passent pas par le runtime réseau décrit ici.

## Fonctions partagées

- `SearchExecutionContext` est créé une fois par recherche. Il possède le cache de fiches, la fusion des requêtes document identiques, les préchargements paginés, les diagnostics et l'adaptateur de fingerprint des checkpoints. Les recherches manga transmettent la même instance aux correspondances auteur et à l'extraction d'auteurs.
- `fetchResolvedScraperListingPage` exécute une page Accueil/Recherche/Auteur/Tag : requête, fin de pagination, parsing, candidates de miniatures et enrichissement optionnel des fiches.
- `fetchScraperPageWithRetry` applique l'attente et les retries de façon identique.
- `processScraperListingPage` construit les cards, ajoute leur tag de provenance, détecte et filtre les langues puis calcule les variantes romanisées.
- Lorsqu'un module de listing configure un sélecteur de lien de fiche, une card qui ne fournit pas ce lien est rejetée. Cela empêche notamment une page générique ou redirigée de faire remonter des encarts éditoriaux impossibles à ouvrir comme résultats d'auteur.
- `enrichScraperListingSourcesWithCardDetails` applique l'enrichissement de fiche et recalcule les métadonnées romanisées. Les nouveautés et les correspondances manga l'utilisent après leur propre présélection légère.
- `buildScraperSearchResultIdentity` et les helpers associés assurent la même déduplication dans la multi-recherche, les favoris et l'arrière-plan.
- `resolveScraperCardDetails` charge et extrait une fiche sans valider ses images. Son cache de promesses fusionne les demandes simultanées et réutilise les fiches entre termes, tags et sources pendant une exécution.
- `enrichCandidatesForTarget` enrichit les candidates par lots jusqu'au quota demandé et laisse le reliquat disponible pour la suite.
- `runTasksWithConcurrency` est la primitive de concurrence interne. Toutes les requêtes passent ensuite par le limiteur global Electron et respectent le maximum configuré par l'utilisateur ainsi que les limites propres à chaque scraper.

`SCRAPER_METADATA_REQUIREMENTS_BY_PHASE` déclare les champs nécessaires pour la découverte d'auteurs, la validation d'une correspondance, les filtres de langue et de tags, l'affichage détaillé, la couverture et la pagination. Une fiche n'est ouverte que si la card ne fournit pas déjà le champ demandé. L'absence d'une métadonnée après chargement reste indéterminée et ne constitue pas, à elle seule, un rejet définitif. Les URLs de couverture sont conservées sans validation réseau ; leurs variantes ne sont essayées que par un écran qui affiche réellement la card.

Tous les moteurs paginés utilisent le préchargeur du contexte avec au plus une page d'avance par source et par tâche. Une prédiction devenue obsolète est remplacée ou laissée se terminer sans être consommée. Comme le chargement passe par `fetchScraperDocument`, préchargements, fiches et pages demandées partagent toujours la concurrence globale et les plafonds du scraper.

## Parité premier plan / arrière-plan

Les moteurs réseau complets vivent dans `src/renderer/searchEngines/`. `searchEngineRegistry.ts` ne fait que sélectionner le moteur canonique d'un job d'arrière-plan, tandis que les hooks de premier plan appellent directement ce même moteur :

Le worker Electron installe `DOMParser`, `Document` et `Element` depuis LinkeDOM avant d'exécuter
ces moteurs. Les sélecteurs CSS et regex disposent ainsi des mêmes primitives DOM que dans le
renderer, notamment lors de l'enrichissement des cards par leur fiche.

- `runMultiSearchEngine` pour la multi-recherche ;
- `runScraperAuthorSearchEngine` pour une page auteur directe ;
- `runScraperLatestSearch` pour les nouveautés par sources ;
- `runLatestAuthorsSearchEngine` pour les nouveautés par auteurs ;
- `runAuthorFavoriteRefreshSearchEngine` pour l'actualisation complète d'un auteur favori ;
- `runMangaCorrespondenceSearch` et `runAuthorCorrespondenceSearch` pour les correspondances, qui sont toujours exécutées comme jobs mais restent indépendantes du composant d'affichage.

Le moteur de correspondance manga charge d'abord les cards sans leurs fiches. Il analyse le titre et ses métadonnées structurées avec le classificateur habituel, puis charge uniquement les fiches des correspondances et des rejets dont le score appartient aux bandes `possible` ou `likely`. L'analyse finale est ensuite rejouée avec les métadonnées complètes ; les rejets `distant` restent consultables sans avoir déclenché de requête de fiche.

Ses tâches sont identifiées par `type + terme normalisé`. Des URLs directes ou provenances découvertes plus tard sont fusionnées dans la tâche existante ; si le terme est déjà terminé, seules les nouvelles cibles directes sont exécutées. La correspondance auteur privilégie une page directe fiable, réutilise sa première page comme aperçu, exploite les auteurs présents sur les cards et ne tente les variantes d'URL qu'en l'absence de cible résolue.

Les résultats manga contiennent aussi des découvertes `title` ou `author`, dédupliquées uniquement au sein d'un même scraper. Une occurrence peut être invalidée indépendamment puis la recherche entièrement rejouée. Le rejeu repart des découvertes actives, recalcule résultats et trace, et réapplique par clé les décisions manuelles uniquement aux candidates retrouvées. Les variantes générées automatiquement ne deviennent pas des décisions séparées.

Un job de correspondance annulé reste éditable et rejouable. L’arrêt force l’écriture du dernier snapshot émis avant de libérer le runner. Les résultats possèdent leurs propres décisions persistantes : une entrée invalidée est retirée des correspondances et devient une référence négative. Si une nouvelle card obtient un meilleur score contre cette référence négative que contre les titres/auteurs actifs, elle est conservée dans les propositions manuelles avec la raison `invalidatedResult`, sans propager ses métadonnées ni créer de tâche.

La propagation depuis les pages auteur exige une correspondance de titre par containment après l’enrichissement éventuel ; un simple rapprochement flou reste une proposition. Les titres découverts portent aussi leur niveau de confiance. Au rejeu d’un ancien job, une découverte sans niveau de confiance issue d’une recherche auteur n’alimente pas le moteur. La découpe des traductions respecte enfin la profondeur des parenthèses et crochets, et les fragments aux délimiteurs déséquilibrés ne deviennent jamais des termes de recherche.

Le moteur applique aussi des protections d'expansion à partir d'un réglage capturé dans l'entrée du job. Il peut arrêter une source après plusieurs pages sans candidate plausible, borner une profondeur demandée comme illimitée, suspendre les nouvelles tâches lorsque trop d'auteurs ou de branches distinctes apparaissent, limiter les potentiels conservés dans les snapshots et invalider automatiquement un titre découvert qui n'a produit que des rejets. Les références et ajouts manuels restent prioritaires. L'invalidation automatique conserve la découverte et sa preuve afin que l'utilisateur puisse la réactiver dans le rejeu. Ces décisions et seuils sont tous normalisés par le module partagé `mangaCorrespondenceSafetySettings.ts`, puis consommés par le moteur commun au lieu d'être réimplémentés par les écrans.

Les modules `authorListingSearchInput.ts` et `latestSourceSearchInput.ts` construisent aussi les mêmes sources et paramètres dans les deux modes. Les hooks React ne conservent que l'état de présentation, l'annulation, la navigation dans les pages déjà chargées et la conversion des snapshots.

Les tags favoris n'ont actuellement pas de variante d'arrière-plan. Leur hook utilise néanmoins les mêmes chargeurs et traitements de cards que le registre, sans maintenir une seconde implémentation de ces outils.

## Corpus de non-régression

`npm run regression:search -- --phase <nom> --transport live` sélectionne les dernières entrées locales, les borne et enregistre les résultats de sept recherches composées et quatre modules primitifs dans `temp/search-regression-corpus/`.

`--transport replay` rejoue exactement les réponses de la référence. Le rapport ignore seulement les durées, UUID et timestamps de trace. Une passe `live` complémentaire permet de distinguer une régression d'un changement réel des sites.

Pour isoler une correspondance manga réelle avec l'enrichissement activé, le corpus accepte aussi `--case mangaCorrespondence --manga-details true`. `--skip-compare` permet alors de mesurer ce scénario sans comparer les autres cas absents au corpus complet.

## Reprise, cache et diagnostics

Les snapshots écrits toutes les cinq secondes contiennent les curseurs ou tâches encore à traiter. Chaque moteur ajoute un fingerprint stable de son entrée et des révisions de scrapers ; un snapshot incompatible est affichable mais n'est jamais repris. Après un redémarrage, un job persistant actif est remis en file et poursuit son checkpoint au lieu de relire les pages terminées.

Les correspondances conservent en plus, pendant 24 heures et par identifiant de job, les réponses HTML réussies. Les entrées sont compressées, indexées par scraper, URL, méthode et corps, limitées à 64 Mio par job et 256 Mio au total, puis évincées en LRU. Les images et erreurs ne sont jamais stockées. Le cache est supprimé avec le job ou à son expiration ; un rejeu peut ainsi réanalyser depuis la première page sans refaire les requêtes réseau.

Le réglage global de l'onglet Développeur active les diagnostics pour tous les moteurs. Le rapport distingue moteur et phase, attente du planificateur, file globale, temps HTTP, hits mémoire/disque, préchargements, fiches demandées ou évitées, tâches fusionnées et reprises. Aucun contenu HTML n'est écrit. `npm run diagnostics:search` analyse le profil le plus récent dans `data/scraper-search-diagnostics`.

Les réglages fonctionnels du scraping vivent dans l'onglet `Scraping` des paramètres. Les protections anti-emballement y possèdent un interrupteur global et des interrupteurs/seuils indépendants. L'alerte générique d'absence de progression est calculée par le hook commun des jobs et s'applique à tous les types de recherche en arrière-plan.

Les collectes `authorList` et `tagList`, ainsi que les assistants de configuration, restent volontairement hors du moteur de recherche : ils testent ou éditent des sélecteurs et n'exécutent pas une recherche utilisateur paginée. Le cache `authorList` est toutefois consulté avant la résolution d'une recherche d'auteur, séparément pour chaque scraper configuré, afin de réutiliser une URL d'auteur déjà enregistrée avant les stratégies de découverte réseau.
