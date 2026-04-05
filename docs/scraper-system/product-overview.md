# Systeme de scraper site/API - vision produit

Date : 2026-04-05

## Objectif

Ajouter dans l'application un systeme de configuration de scrapers ou connecteurs de source
pour qu'un user avance puisse brancher un site ou une API sans modifier le code a chaque fois.

Dans cette doc, on utilise :

- `scraper` pour parler de la source configuree
- `site scraper` pour une source HTML/basee sur des selecteurs
- `api scraper` pour une source HTTP/JSON

## Ce qu'on veut couvrir

Le minimum vise est :

- recherche
- fiche manga
- images/pages
- metadonnees
- categories ou taxonomies

Le systeme doit aussi pouvoir evoluer plus tard vers :

- chapitres
- nouveautes
- populaire
- pagination
- filtres avances
- authentification/API key/cookies
- telechargement

## Ce qu'on ne fige pas tout de suite

Les points suivants ne doivent pas bloquer la premiere base :

- le nom final de la feature dans l'UI
- la forme exacte d'affichage d'un scraper dans l'application
- le niveau de complexite accepte dans les transformations de donnees

## Parcours user cible

Le flux vise est le suivant :

1. le user ajoute un scraper
2. il choisit `Site` ou `API`
3. il renseigne l'identite de base
4. l'application valide l'accessibilite de la source
5. il active les fonctionnalites utiles
6. il configure chaque fonctionnalite
7. le scraper devient utilisable dans l'application

Informations de base attendues :

- nom
- type de source
- domaine principal ou `baseUrl`
- description optionnelle

Validation minimale attendue :

- verifier que le domaine repond
- afficher un retour simple `succes / echec`
- garder des details techniques en secondaire

## Vision UI

### Liste des scrapers

Chaque scraper doit afficher au minimum :

- nom
- type
- domaine
- etat de validation
- fonctionnalites disponibles
- actions `ouvrir`, `modifier`, `desactiver`

### Detail d'un scraper

Une fois ouvert, un scraper doit exposer uniquement les fonctionnalites configurees.

Exemples d'entrees :

- lancer une recherche
- ouvrir une categorie
- ouvrir une fiche manga
- afficher les pages

### Edition

Le mode edition reprend la meme structure que la creation :

- informations de base
- validation d'acces
- choix des fonctionnalites
- configuration detaillee de chaque fonctionnalite

### Partage

Le produit doit prevoir un partage simple des configurations :

- export de fichier
- import de fichier
- duplication avant modification si besoin

Le presse-papiers ou une galerie communautaire pourront venir plus tard.

## Comportement attendu dans l'application

Quand un scraper est valide :

- il apparait dans la liste des sources
- l'application n'affiche que les fonctionnalites configurees
- les actions inutilisables sont masquees ou desactivees

Exemples :

- si `Recherche` est configuree, on affiche une zone de recherche
- si `Categories` est configuree, on affiche un acces categories
- si `Pages` est configuree, la fiche manga peut afficher lecture et telechargement

## Phasage conseille

### Phase 1

- liste des scrapers
- creation d'un scraper `site`
- informations de base
- validation d'accessibilite
- persistance locale

### Phase 2

- `Recherche`
- `Fiche`
- `Pages`
- test manuel de chaque bloc

### Phase 3

- ouverture d'un scraper dans l'application
- recherche depuis l'app
- ouverture d'une fiche manga
- navigation vers les pages

### Phase 4

- edition complete
- duplication
- desactivation
- logs de validation
- export/import

### Phase 5

- type `api`
- endpoints
- mapping JSON
- auth simple

## Questions ouvertes

- quel nom final donner a la feature dans l'UI
- jusqu'ou autoriser des transformations personnalisees
- faut-il un mode `test live` dans chaque sous-formulaire
- faut-il un partage communautaire integre ou seulement un export/import local au debut
- comment presenter clairement les erreurs de selecteur au user
