# Systeme de scraper site/API - premier jet

Date : 2026-04-04

## Objectif

Cette note pose un premier cadre produit et technique pour ajouter dans l'application
un systeme de configuration de "scrapers" ou "connecteurs de source".

Le nom n'est pas encore fixe. Dans ce document, on utilise :

- `scraper` pour parler de la source configuree
- `site scraper` pour une source HTML/basee selecteurs
- `api scraper` pour une source HTTP/JSON

L'objectif final est de permettre a un user de :

- ajouter une nouvelle source manga
- decrire comment l'application doit dialoguer avec cette source
- activer uniquement les fonctionnalites utiles
- naviguer dans les mangas exposes par cette source
- recuperer les metadonnees, les pages et, a terme, telecharger les contenus

## Intention produit

Le systeme doit permettre a un user avance de "brancher" un site ou une API sans devoir
modifier le code de l'application pour chaque nouvelle source.

La logique generale est :

1. le user ajoute un nouveau scraper
2. il choisit si la source est un site ou une API
3. il renseigne l'identite de base de la source
4. l'application valide que la source est joignable
5. le user active les fonctionnalites qu'il veut
6. il configure chaque fonctionnalite
7. le scraper devient utilisable dans l'application

## Ce qu'on veut couvrir

Le systeme doit pouvoir couvrir au minimum :

- recherche
- fiche manga
- images/pages du manga
- metadonnees du manga
- categories ou taxonomies

## Site de reference pour les premiers tests

Pour la premiere iteration, le site de reference retenu pour les tests est :

- `https://momoniji.com/`

Ce site est utile comme base de travail parce qu'il expose deja, dans les tests effectues :

- une recherche exploitable via requete
- des fiches manga accessibles depuis les resultats
- des images/pages accessibles par URLs directes

Exemples verifies :

- recherche via `?s=...`
- ouverture de fiche manga depuis un resultat
- extraction d'images `.webp` sur le domaine `img.momoniji.com`

Ce site doit servir de cible de depart pour valider :

- le flux de creation d'un `site scraper`
- la configuration de la fonctionnalite `recherche`
- la configuration de la fonctionnalite `fiche manga`
- la configuration de la fonctionnalite `pages`

Le systeme devrait aussi etre pensable pour couvrir plus tard :

- chapitres
- listing de nouveautes
- listing populaire
- filtres avances
- pagination
- authentification/API key/cookies
- telechargement

## Ce qu'on ne cherche pas a figer tout de suite

Les points suivants ne sont pas encore definis et ne doivent pas bloquer la premiere base :

- le nom final de la feature dans l'UI
- la forme exacte d'affichage d'un scraper dans l'application
- le niveau de complexite accepte dans les transformations de donnees

## Parcours user cible

### 1. Ajouter un scraper

Depuis l'application, le user clique sur un bouton du type :

- `Ajouter un scraper`
- ou un autre nom a definir plus tard

Ce bouton ouvre un wizard ou un formulaire en plusieurs etapes.

### 2. Choisir le type de source

Le user choisit :

- `Site`
- `API`

Pour la premiere iteration, on implemente surtout `Site`, mais on structure les donnees et
les composants pour que `API` puisse arriver sans refonte complete.

### 3. Configurer l'identite de base

Premiere section de configuration :

- nom du scraper
- type de source : `site` ou `api`
- domaine principal
- description optionnelle

Exemples :

- nom : `Momoniji`
- type : `site`
- domaine : `https://momoniji.com`
- description : `Site manga adulte avec recherche, fiches et pages images`

### 4. Validation d'accessibilite

Apres validation de cette premiere section, l'application teste si la source est accessible.

Attendus minimum :

- verifier que le domaine repond
- afficher un retour simple : succes ou echec
- conserver les details techniques dans une zone secondaire si besoin

Exemples de checks possibles :

- requete GET sur le domaine principal
- verification du code HTTP
- verification simple du content-type

### 5. Choisir les fonctionnalites a exposer

Une deuxieme section permet au user d'activer les fonctionnalites voulues.

Exemples :

- recherche
- categories
- fiche manga
- chapitres
- pages
- metadonnees
- nouveautes
- populaire

Chaque fonctionnalite activee devient configurable individuellement.

### 6. Configurer chaque fonctionnalite

Pour chaque fonctionnalite, le user ouvre un sous-formulaire.

Pour un `site scraper`, il faut decrire :

- comment atteindre la page ou l'endpoint utile
- comment injecter les variables dans l'URL ou la requete
- comment extraire les donnees utiles

Exemple pour la recherche :

- pattern d'URL
- methode HTTP
- selecteur de la liste de resultats
- selecteur d'un item
- selecteur du titre
- selecteur de l'URL de detail
- selecteur de l'image de couverture
- selecteur de resume optionnel

### 7. Utiliser le scraper

Une fois configure, le scraper devient disponible dans l'application.

Quand on ouvre ce scraper, on doit voir :

- son identite
- son type
- son etat
- les fonctionnalites configurees
- un bouton de modification

Le bouton de modification renvoie vers le meme formulaire/wizard en mode edition.

## Vision UI

### Vue liste des scrapers

Ecran listant les scrapers existants avec pour chacun :

- nom
- type
- domaine
- etat de validation
- fonctionnalites disponibles
- action `ouvrir`
- action `modifier`
- action `desactiver`

### Vue detail d'un scraper

Quand on ouvre un scraper, on doit voir les fonctionnalites reellement configurees.

Exemple :

- recherche
- categories
- fiches manga
- pages

Chaque fonctionnalite est exposee comme un point d'entree utilisable dans l'application.

Exemple concret :

- lancer une recherche
- ouvrir une categorie
- ouvrir une fiche manga
- afficher les pages

### Vue edition

Le mode edition doit reprendre la meme structure que le mode creation :

- informations de base
- validation d'acces
- choix des fonctionnalites
- configuration detaillee de chaque fonctionnalite

### Vue partage

Le systeme doit prevoir une option de partage de configuration entre users.

Attendus produit :

- exporter une configuration de scraper
- importer une configuration de scraper
- dupliquer une configuration importee avant modification si besoin
- partager facilement un fichier de config ou un bloc de texte

Objectif :

- permettre aux users de se passer leurs configurations
- accelerer l'ajout de nouvelles sources
- eviter de refaire manuellement une config deja fonctionnelle

## Briques communes site/API

Pour eviter de bloquer l'evolution vers les APIs, il faut definir une couche commune.

### Modele commun

Un scraper devrait avoir au moins :

- un identifiant local
- un nom
- un type
- un domaine ou `baseUrl`
- une description
- un statut
- une version de schema
- une liste de fonctionnalites configurees
- des options globales de requete

### Options globales possibles

- methode par defaut
- headers additionnels
- cookies
- user-agent
- timeout
- encodage force si necessaire
- auth future pour les APIs

### Fonctionnalite = bloc autonome

Chaque fonctionnalite doit etre modelisee comme un bloc avec :

- `enabled`
- `kind`
- config specifique
- statut de validation
- date de dernier test

Cela permet :

- de n'activer que ce qui est utile
- de tester chaque bloc separement
- de re-editer facilement un seul bloc

### Partage et portabilite

La definition d'un scraper doit etre portable.

Cela implique :

- un format de stockage stable
- un schema versionne
- des champs assez explicites pour etre exportes/importes sans ambiguite
- une serialisation simple en JSON dans un premier temps

Le partage doit pouvoir fonctionner au minimum :

- en export de fichier
- en import de fichier

Et potentiellement plus tard :

- via presse-papiers
- via une galerie communautaire integree

## Configuration d'un site scraper

Pour un site, la configuration repose surtout sur :

- un mode d'acces HTTP
- des patterns d'URL
- des selecteurs
- des regles d'extraction

### Champs globaux d'un site scraper

- `baseUrl`
- `defaultMethod`
- `defaultHeaders`
- `defaultCookies`
- `needsJavascript` plus tard si on veut supporter des cas complexes

### Recherche - configuration site

Champs minimum proposes :

- `method`
- `urlTemplate`
- `queryParamMode`
- `resultListSelector`
- `resultItemSelector`
- `titleSelector`
- `detailUrlSelector`
- `thumbnailSelector`
- `summarySelector`
- `nextPageSelector` optionnel

Exemple conceptuel :

- `urlTemplate = https://momoniji.com/?s={{query}}`
- `resultItemSelector = div.gb`
- `titleSelector = a`
- `detailUrlSelector = a@href`
- `thumbnailSelector = img@src`

### Fiche manga - configuration site

Champs minimum proposes :

- `urlSource`
- `titleSelector`
- `coverSelector`
- `descriptionSelector`
- `authorsSelector`
- `tagsSelector`
- `statusSelector`
- `metadataMap`

`urlSource` peut etre :

- l'URL retournee par la recherche
- ou un pattern manuel si necessaire

### Pages - configuration site

Champs minimum proposes :

- `pageListSelector`
- `pageImageSelector`
- `pageImageAttribute`
- `pageOrderMode`
- `pageUrlTransform` optionnel

Cas a couvrir :

- images directement dans le HTML
- images en `data-src`
- images servies via `srcset`
- URLs a normaliser

### Categories - configuration site

Champs minimum proposes :

- `categoriesEntryUrl`
- `categoryListSelector`
- `categoryItemSelector`
- `categoryNameSelector`
- `categoryUrlSelector`

## Configuration d'un api scraper

On ne l'implemente pas tout de suite, mais on prepare les briques.

Un API scraper reposera davantage sur :

- des endpoints
- des parametres
- des mappings JSON
- une auth optionnelle

### Champs globaux d'une API

- `baseUrl`
- `authType`
- `authConfig`
- `defaultHeaders`
- `rateLimitHints`

### Recherche - configuration API

Champs minimum proposes :

- `method`
- `endpoint`
- `queryMapping`
- `resultPath`
- `fieldMap`

Exemple :

- `endpoint = /search`
- `queryMapping.query = {{query}}`
- `resultPath = data.items`
- `fieldMap.title = name`
- `fieldMap.detailUrl = url`

## Validation

Le systeme doit proposer une validation a plusieurs niveaux.

### Validation de base

- la source repond
- le domaine est valide
- le type choisi est coherent

### Validation par fonctionnalite

Chaque fonctionnalite doit pouvoir etre testee separement.

Exemples :

- test de recherche avec une requete exemple
- test de fiche avec une URL exemple
- test d'extraction de pages

### Retour attendu

Le retour doit montrer au minimum :

- succes ou echec
- message lisible
- details techniques optionnels

## Structure de donnees proposee

Le schema exact reste a definir, mais on peut viser quelque chose dans cet esprit :

```ts
type SourceKind = 'site' | 'api';

type FeatureKind =
  | 'search'
  | 'categories'
  | 'mangaDetails'
  | 'chapters'
  | 'pages'
  | 'metadata'
  | 'latest'
  | 'popular';

interface ScraperDefinition {
  id: string;
  name: string;
  kind: SourceKind;
  baseUrl: string;
  description?: string;
  schemaVersion: string;
  status: 'draft' | 'validated' | 'error' | 'disabled';
  requestDefaults?: RequestDefaults;
  features: ScraperFeature[];
}

interface RequestDefaults {
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  cookies?: Record<string, string>;
  timeoutMs?: number;
}

interface ScraperFeature {
  kind: FeatureKind;
  enabled: boolean;
  status: 'draft' | 'validated' | 'error';
  config: Record<string, unknown>;
}
```

Le point important n'est pas le schema final mais l'idee suivante :

- un scraper = definition globale
- une fonctionnalite = bloc de config autonome

## Comportement attendu dans l'application

Une fois un scraper valide :

- il apparait dans la liste des sources
- l'app n'affiche que les fonctionnalites configurees
- les actions inutilisables ne sont pas montrees ou sont desactivees

Exemple :

- si `recherche` est configuree, on affiche une zone de recherche
- si `categories` est configuree, on affiche un acces categories
- si `pages` est configuree, la fiche manga peut afficher un bouton de lecture/telechargement

## Phasage conseille

### Phase 1 - base produit + donnees

- ecran liste des scrapers
- creation d'un scraper `site`
- infos de base
- validation d'accessibilite
- persistance locale

### Phase 2 - fonctionnalites minimales site

- recherche
- fiche manga
- pages
- test manuel de chaque bloc

### Phase 3 - integration d'usage

- ouverture d'un scraper
- recherche depuis l'application
- ouverture fiche manga
- navigation vers les pages

### Phase 4 - edition et robustesse

- edition complete
- duplication de scraper
- desactivation
- logs de validation
- export/import de configuration

### Phase 5 - extension API

- type `api`
- endpoints
- mapping JSON
- auth simple

## Points d'attention

- beaucoup de sites n'ont pas une structure HTML stable
- certains selecteurs devront peut-etre accepter plusieurs fallback
- certaines images peuvent etre dans des attributs non standard
- certains sites peuvent avoir pagination ou lazy-loading
- certains sites peuvent demander cookies, headers ou user-agent specifique

## Questions ouvertes

- quel nom final donner a la feature dans l'UI
- jusqu'ou autoriser des transformations personnalisees
- faut-il un mode "test live" dans chaque sous-formulaire
- faut-il un systeme de partage communautaire integre ou seulement un export/import local au debut
- comment presenter clairement les erreurs de selecteur au user

## Direction generale retenue

La direction a retenir pour la suite est :

- penser le systeme comme un connecteur de source configurable
- implementer d'abord le chemin `site`
- structurer des maintenant les donnees pour `api`
- decouper les capacites par fonctionnalite autonome
- faire en sorte qu'un scraper configure devienne une source navigable dans l'application

Ce document sert de base de travail pour la premiere implementation.

## Etat d'implementation - V1 en cours

### Perimetre effectivement branche

La premiere implementation en cours couvre maintenant :

1. bouton d'entree dans le header principal
2. ouverture d'une modal `Scrappers`
3. affichage de la liste des scrappers deja enregistres
4. ouverture d'un mode creation depuis cette liste
5. ouverture d'un mode edition en cliquant sur un scrapper existant
6. suppression d'un scrapper depuis la liste
7. choix du type de source
8. saisie des informations de base
9. validation d'accessibilite par requete
10. enregistrement local d'un premier scraper apres validation reussie
11. ouverture d'une etape suivante listant les composants du scraper
12. configuration reelle de `Fiche`
13. configuration reelle de `Pages`
14. ouverture temporaire d'un scrapper directement depuis le header principal

Ce qui n'est pas encore branche :

- vraie execution de `Recherche`
- lecteur complet branche au composant `Pages`
- categories et autres fonctionnalites secondaires

### Choix UI retenus pour cette V1

Pour cette iteration, le point d'entree est :

- un bouton `Scrappers` dans le header du `MangaManager`
- un selecteur de vue dans ce meme header, avec `Bibliotheque` et la liste des scrappers sauvegardes

Ce choix est provisoire. Il permet de tester rapidement le flux sans figer encore
l'emplacement final dans l'application.

Le flux s'ouvre dans :

- une modal dediee

Et l'application permet maintenant aussi :

- de basculer entre l'onglet `Bibliotheque` et un scrapper actif
- de masquer toute l'UI specifique a la bibliotheque quand un scrapper est charge

La modal ouvre maintenant d'abord :

- une liste des scrappers enregistres

Depuis cette liste, on peut :

- creer un nouveau scrapper
- ouvrir un scrapper existant
- supprimer un scrapper

La modal contient :

- un wizard leger en plusieurs etapes
- des boutons de navigation internes au contenu
- une fermeture sur fond plus stricte pour eviter les fermetures accidentelles pendant une selection de texte

Le footer global de la modal reste volontairement minimal pour ne pas coupler la navigation
du wizard au composant generique `Modal`.

Pour accelerer les tests pendant la V1, l'etape `Source` est maintenant pre-remplie avec :

- type : `site`
- nom : `Momoniji`
- URL : `https://momoniji.com`
- description de base liee au site de reference

Ce pre-remplissage est provisoire et sert uniquement a fluidifier les tests de depart.

### Choix d'architecture retenus

Les composants ont ete separes pour rester deplacables et reutilisables :

- un conteneur de wizard
- une etape `source/identite`
- une etape `validation`

L'objectif est de pouvoir plus tard :

- deplacer ces etapes hors modal si besoin
- reutiliser la brique de validation ailleurs
- inserer les etapes suivantes sans reecrire toute la structure

### Validation technique retenue

La validation est faite cote Electron via un handler dedie.

Comportement actuel :

- normalisation de l'URL de base
- ajout automatique de `https://` si le user ne met pas de protocole
- requete HTTP `GET`
- suivi des redirections
- timeout de securite
- retour d'un resultat structure

Le resultat de validation remonte actuellement :

- succes ou echec
- URL normalisee
- URL finale
- code HTTP
- content-type
- warning si le type de contenu semble inattendu
- message d'erreur si la requete echoue

### Premier enregistrement du scraper

Quand la validation est reussie et que le user passe a l'etape suivante :

- un premier enregistrement local du scraper est effectue
- le scraper est stocke dans `scrapers.json`
- le scraper est marque comme `validated`

Le scraper enregistre contient deja :

- son identite
- son URL normalisee
- le dernier resultat de validation
- une premiere liste de composants disponibles

Une fois enregistre, le scrapper remonte automatiquement dans la liste `Scrappers`
et peut etre rouvert en mode edition.

### Composants exposes dans la V1

Apres enregistrement, l'etape suivante affiche les composants du scraper.

Pour le moment, les composants visibles sont :

- `Recherche`
- `Fiche`
- `Pages`

Cette etape montre :

- les composants a configurer
- les composants deja configures

Dans la V1 actuelle :

- les boutons sont affiches
- on peut les selectionner
- le clic sur un composant remplace maintenant le formulaire courant par l'ecran de configuration du composant choisi
- les premieres vraies configurations branchees sont `Fiche` puis `Pages`
- `Recherche` reste encore en placeholder pour l'instant

### Navigation de configuration retenue

Le choix retenu pour entrer dans un composant est :

- clic direct sur la carte du composant

Comportement actuel :

- l'ecran `Composants` affiche la liste des briques disponibles
- un clic sur une brique remplace la vue par le formulaire de ce composant
- un bouton `Retour aux composants` permet de revenir a la liste

Ce choix garde la structure suffisamment modulaire pour :

- rester dans une modal pour la V1
- deplacer plus tard ce flux dans une page dediee si besoin
- brancher un composant apres l'autre sans refaire tout le wizard

Pour un scrapper existant, l'ouverture depuis la liste arrive directement sur :

- l'etape `Composants`

Le flux permet ensuite :

- d'ouvrir un composant
- de revenir a la liste des composants
- de repasser sur `Source` si on veut modifier l'identite de base

### Premiere configuration reelle : Fiche manga

Le premier composant reellement configurable est :

- `Fiche`

La configuration actuelle de `Fiche` repose sur :

- une section `Construction de l'URL`
- une section `Scraping`
- une section `Variables extraites`
- une section `Test`
- une strategie d'acces a la fiche, soit depuis une URL deja connue, soit via un template d'URL
- un selecteur de titre
- des selecteurs optionnels pour la couverture, la description, les auteurs, les tags et le statut
- une liste optionnelle de variables derivees reutilisables plus tard par d'autres composants

La section `Variables extraites` permet maintenant de definir, pour `Fiche` :

- un nom de variable
- une source, soit un champ deja extrait, soit un selecteur personnalise, soit l'URL demandee, soit l'URL finale
- une regex optionnelle

Regles retenues dans cette V1 :

- la premiere valeur trouvee dans la source est utilisee
- si une regex contient un groupe capture, le premier groupe est conserve comme valeur finale
- si une variable est configuree mais ne peut pas etre extraite pendant le test, la validation du composant echoue

Exemple utile pour `Momoniji` :

- variable : `mangaId`
- source : `selecteur personnalise`
- selecteur : `#cif .iw img@src`
- regex : `d_(\d+)`

Ce choix permet de preparer `Pages` sans figer trop tot un champ technique unique du type `id`.
L'idee retenue est plutot :

- `Fiche` expose des variables de contexte
- les autres composants pourront les reutiliser ensuite

La validation actuelle de `Fiche` fonctionne ainsi :

- resolution de l'URL de test a partir de la section `Construction de l'URL`
- recuperation HTML de la page cible via Electron
- parsing de la page cote renderer
- verification des selecteurs fournis
- extraction optionnelle de variables derivees
- affichage d'une fausse fiche de previsualisation a partir des donnees extraites
- affichage des variables extraites dans la zone de test quand elles sont resolues

Regles retenues :

- la validation n'est pas obligatoire pour enregistrer
- l'enregistrement reste possible avec seulement la configuration du composant
- le titre est traite comme le point de verification principal
- les selecteurs optionnels absents remontent comme warnings de validation
- le mode `template` supporte deja une base simple avec `{{id}}`, `{{slug}}`, `{{value}}` et leurs variantes `raw`

### Deuxieme configuration reelle : Pages

Le composant `Pages` est maintenant lui aussi branche.

La configuration actuelle de `Pages` repose sur :

- une section `Source des pages`
- une section `Scraping`
- une section `Test`
- un mode `Depuis la fiche`
- un mode `Depuis un template`
- un selecteur de pages, obligatoire seulement quand la source renvoie du HTML a scraper

Le mode `Depuis la fiche` reutilise :

- l'URL validee du composant `Fiche`

Le mode `Depuis un template` reutilise :

- l'URL validee de `Fiche`
- les champs deja extraits par `Fiche`
- les variables derivees configurees dans `Fiche`

Regles retenues pour le template :

- `{{nomVariable}}` insere une valeur encodee pour l'URL
- `{{raw:nomVariable}}` insere une valeur brute
- `{{page}}` insere un numero de page 1-based
- `{{page3}}` insere un numero de page 1-based zero-padde sur 3 chiffres
- `{{pageIndex}}` insere un index de page 0-based
- `{{pageIndex3}}` insere un index de page 0-based zero-padde sur 3 chiffres

Quand le template pointe directement vers une image :

- la section `Scraping` peut rester vide
- la validation teste alors l'image directe au lieu de parser du HTML
- si le template contient un placeholder de page, la validation tente de detecter plusieurs pages consecutives pour alimenter le mini reader

La validation actuelle de `Pages` fonctionne ainsi :

- resolution de l'URL de test a partir de `Fiche`
- recuperation HTML de la page cible via Electron
- extraction de la liste de pages avec un selecteur unique
- affichage d'un mini lecteur de previsualisation

Le mini lecteur de test montre :

- une image
- un bouton `Precedent`
- un bouton `Suivant`

Ce bloc doit servir de validation visuelle minimale avant d'attaquer plus tard le vrai lecteur branche au scraper.

### Etats visuels des composants

Les composants disposent maintenant d'un etat visible directement depuis la liste :

- `Non configure`
- `Configure non valide`
- `Valide`

Code couleur retenu pour la V1 :

- gris pour `Non configure`
- jaune pour `Configure non valide`
- vert pour `Valide`

Comportement attendu :

- apres enregistrement sans validation reussie, le composant passe en jaune
- apres validation reussie puis enregistrement, le composant passe en vert
- si la config change sans nouvelle validation, le composant revient en jaune

### Choix de persistance retenu

Pour rester coherent avec le reste de l'application, la persistance locale suit la meme logique
que les autres donnees utilisateur :

- fichier JSON local
- creation automatique du fichier si absent
- mise a jour simple par relecture + reecriture

Le fichier cible ajoute est :

- `scrapers.json`

Regle retenue pour la persistance :

- le JSON sauvegarde uniquement des donnees techniques et de configuration
- les libelles UI, descriptions de composants et messages d'interface ne doivent pas etre stockes dans le fichier
- l'UI reconstruit ses textes a partir des donnees structurees lues au chargement

La liste `Scrappers` s'appuie sur ce fichier local pour :

- afficher les scrappers existants
- rouvrir un scrapper en edition
- supprimer un scrapper

Le header principal ecoute maintenant aussi les mises a jour de scrappers pour :

- rafraichir automatiquement le selecteur de vue apres creation
- rafraichir automatiquement le selecteur de vue apres edition
- retirer automatiquement un scrapper supprime de la vue active

### Affichage temporaire d'un scrapper dans l'application

Pour commencer a tester l'usage reel sans figer encore la navigation finale, une vue
temporaire de scrapper est maintenant branchee dans le `MangaManager`.

Comportement retenu :

- le header ne montre plus `Gestion des mangas`
- a la place, un selecteur permet de choisir `Bibliotheque` ou un scrapper enregistre
- quand `Bibliotheque` est active, toute l'UI historique reste visible
- quand un scrapper est actif, toute l'UI liee a la bibliotheque est masquee

Elements caches hors `Bibliotheque` :

- recherche et filtres de bibliotheque
- actions d'ajout de manga
- selection multiple
- actions OCR de bibliotheque
- actions `Tags`

Elements conserves hors `Bibliotheque` :

- `Parametres`
- `Scrappers`

La vue temporaire du scrapper affiche :

- l'identite du scrapper charge
- l'etat des composants `Recherche`, `Fiche` et `Pages`
- une barre de saisie runtime
- un select `Recherche / Manga` seulement si les deux composants sont configures

Regles retenues :

- si seul `Fiche` est configure, la barre reste en mode `Manga` sans select
- si seul `Recherche` est configure, la barre reste en mode `Recherche` sans select
- si aucun composant executable n'est configure, on montre un message temporaire

Dans cette iteration, le runtime reel branche est :

- `Manga` via le composant `Fiche`

Le mode `Manga` fonctionne ainsi :

- si `Fiche` est en mode `template`, la valeur saisie sert a construire l'URL
- si `Fiche` est en mode `URL`, la valeur saisie peut etre une URL absolue, relative ou un slug
- la page est chargee
- les selecteurs `Fiche` sont executes
- une fiche manga temporaire est affichee dans l'application

Le rendu temporaire affiche actuellement :

- titre
- couverture
- description
- auteurs
- tags
- statut
- URL demandee / URL finale
- variables derivees resolues

Le mode `Recherche` est deja present dans la structure de l'interface, mais son execution
reste volontairement un placeholder pour la suite.

### Site de test de reference dans la V1

Le site de reference pour verifier le parcours complet reste :

- `https://momoniji.com/`

Il est utilise comme cible de test initiale parce qu'il a deja permis de confirmer :

- l'accessibilite du domaine
- la recherche par requete
- l'ouverture de fiches manga
- l'accessibilite directe des images/pages

### Limites volontaires de cette V1

Pour garder une base propre, cette premiere implementation n'essaie pas encore de :

- configurer concretement les composants
- tester des features specifiques comme la recherche ou les pages
- gerer du JavaScript complexe cote site
- modeliser les selecteurs HTML
- gerer l'authentification API

La suite devra s'appuyer sur cette base pour ajouter :

- la liste et l'ouverture des scrapers sauvegardes
- la configuration par composant
- l'export/import de configurations
