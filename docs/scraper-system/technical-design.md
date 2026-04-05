# Systeme de scraper site/API - design technique

Date : 2026-04-05

## Modele commun

Pour ne pas bloquer l'evolution vers les APIs, on garde une couche commune a tous les scrapers.

Un scraper devrait contenir au minimum :

- un identifiant local
- un nom
- un type
- un domaine ou `baseUrl`
- une description
- un statut
- une version de schema
- une liste de fonctionnalites configurees
- des options globales de requete

Options globales envisagees :

- methode par defaut
- headers additionnels
- cookies
- user-agent
- timeout
- encodage force si necessaire
- auth future pour les APIs

## Fonctionnalites comme blocs autonomes

Chaque fonctionnalite doit etre modelisee comme un bloc avec :

- `enabled`
- `kind`
- une config specifique
- un statut de validation
- une date de dernier test

Ce decoupage permet :

- de n'activer que ce qui est utile
- de tester chaque bloc separement
- de re-editer facilement un seul bloc

### Traduction cote renderer

Le meme principe doit s'appliquer aux ecrans React qui configurent ou executent un scraper.

Regles d'organisation retenues :

- un fichier principal par ecran pour l'orchestration
- des sous-composants thematiques injectes pour les sections UI
- des helpers purs isoles dans des fichiers `*.utils.ts`
- des composants partages centralises quand plusieurs features reutilisent la meme brique

But :

- eviter les fichiers geants difficiles a relire
- separer clairement logique runtime, presentation et helpers
- rendre le refactor plus sur sans changer le comportement fonctionnel

## Portabilite

La definition d'un scraper doit etre portable.

Cela implique :

- un format stable
- un schema versionne
- des champs explicites
- une serialisation simple, en JSON dans un premier temps

Le partage minimal cible est :

- export de fichier
- import de fichier

## Configuration d'un site scraper

Pour un site, la configuration repose surtout sur :

- un mode d'acces HTTP
- des patterns d'URL
- des selecteurs
- des regles d'extraction

Champs globaux proposes :

- `baseUrl`
- `defaultMethod`
- `defaultHeaders`
- `defaultCookies`
- `needsJavascript` plus tard pour les cas complexes

### Recherche

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

### Fiche manga

Champs minimum proposes :

- `urlSource`
- `titleSelector`
- `coverSelector`
- `descriptionSelector`
- `authorsSelector`
- `tagsSelector`
- `statusSelector`
- `metadataMap`

`urlSource` peut venir :

- de l'URL retournee par la recherche
- d'un pattern manuel si necessaire

### Pages

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

### Categories

Champs minimum proposes :

- `categoriesEntryUrl`
- `categoryListSelector`
- `categoryItemSelector`
- `categoryNameSelector`
- `categoryUrlSelector`

## Configuration d'un api scraper

L'API scraper n'est pas implemente tout de suite, mais la structure doit deja le permettre.

Un API scraper reposera surtout sur :

- des endpoints
- des parametres
- des mappings JSON
- une auth optionnelle

Champs globaux envisages :

- `baseUrl`
- `authType`
- `authConfig`
- `defaultHeaders`
- `rateLimitHints`

### Recherche API

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

Le schema exact reste a ajuster, mais cette forme donne la bonne direction :

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

Point cle :

- un scraper = definition globale
- une fonctionnalite = bloc de config autonome

## Points d'attention

- beaucoup de sites n'ont pas une structure HTML stable
- certains selecteurs devront accepter plusieurs fallbacks
- certaines images peuvent etre dans des attributs non standard
- certains sites peuvent avoir pagination ou lazy-loading
- certains sites peuvent demander cookies, headers ou user-agent specifiques
