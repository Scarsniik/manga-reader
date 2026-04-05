# Systeme de scraper site/API - etat d'implementation V1

Date : 2026-04-05

## Perimetre effectivement branche

La V1 actuellement branchee couvre :

1. un bouton d'entree dans le header principal
2. une modal `Scrappers`
3. la liste des scrapers deja enregistres
4. la creation depuis cette liste
5. l'edition d'un scraper existant
6. la suppression d'un scraper
7. le choix du type de source
8. la saisie des informations de base
9. la validation d'accessibilite par requete
10. l'enregistrement local d'un premier scraper
11. une etape `Composants`
12. la configuration reelle de `Recherche`
13. la configuration reelle de `Fiche`
14. la configuration reelle de `Pages`
15. l'ouverture temporaire d'un scraper depuis le header principal
16. l'execution runtime reelle de `Recherche`
17. l'ouverture runtime de `Fiche` depuis `Recherche` quand le lien est disponible

Pas encore branche :

- le lecteur complet branche au composant `Pages`
- `Categories` et les autres fonctionnalites secondaires

## Choix UI retenus

Pour cette iteration :

- le point d'entree est un bouton `Scrappers` dans le header du `MangaManager`
- le header contient aussi un selecteur de vue entre `Bibliotheque` et les scrapers sauvegardes
- le flux s'ouvre dans une modal dediee
- la modal ouvre d'abord la liste des scrapers enregistres
- le wizard reste leger et pilote sa navigation depuis son propre contenu

Choix provisoires de V1 :

- l'etape `Source` est pre-remplie avec `Momoniji`
- ce pre-remplissage sert uniquement a accelerer les tests
- l'emplacement final dans l'application n'est pas encore fige

## Choix d'architecture

Les briques ont ete separees pour rester reutilisables :

- un conteneur de wizard
- une etape `source/identite`
- une etape `validation`

Objectifs :

- pouvoir sortir ces etapes de la modal plus tard si besoin
- reutiliser la brique de validation ailleurs
- ajouter les etapes suivantes sans refonte

## Organisation actuelle du code renderer

Le code des ecrans scraper a ete redecoupe pour eviter les gros fichiers monolithiques.

Principe retenu :

- chaque ecran principal garde surtout le role d'orchestrateur
- les sections UI sont sorties dans des composants thematiques
- les helpers purs sont sortis dans des fichiers `*.utils.ts`
- les composants partages du configurateur sont centralises

Structure actuelle :

- `src/renderer/components/ScraperConfig/shared` pour les briques communes
- `src/renderer/components/ScraperConfig/search` pour les blocs lies a `Recherche`
- `src/renderer/components/ScraperConfig/details` pour les blocs lies a `Fiche`
- `src/renderer/components/ScraperConfig/pages` pour les blocs lies a `Pages`
- `src/renderer/components/ScraperBrowser/components` pour les vues du runtime

Objectif pratique :

- garder des fichiers principaux plus lisibles
- faciliter les evolutions sans toucher a tout l'ecran
- limiter les regressions fonctionnelles en isolant les responsabilites

## Validation technique actuelle

La validation est faite cote Electron via un handler dedie.

Comportement :

- normalisation de l'URL de base
- ajout automatique de `https://` si besoin
- requete HTTP `GET`
- suivi des redirections
- timeout de securite
- retour d'un resultat structure

Le resultat remonte :

- succes ou echec
- URL normalisee
- URL finale
- code HTTP
- `content-type`
- warning si le contenu semble inattendu
- message d'erreur en cas d'echec

## Persistance actuelle

Quand la validation de base reussit et que le user continue :

- un premier enregistrement local du scraper est effectue
- le scraper est stocke dans `scrapers.json`
- le scraper est marque comme `validated`

Le fichier sauvegarde contient uniquement :

- des donnees techniques
- des donnees de configuration

Il ne doit pas stocker :

- des libelles UI
- des descriptions de composants
- des messages d'interface

## Composants visibles en V1

L'etape `Composants` expose pour le moment :

- `Recherche`
- `Fiche`
- `Pages`

Etat de chaque composant :

- `Non configure`
- `Configure non valide`
- `Valide`

Code couleur actuel :

- gris
- jaune
- vert

## Configuration actuelle de `Fiche`

La configuration de `Fiche` repose sur :

- une section `Construction de l'URL`
- une section `Scraping`
- une section `Variables extraites`
- une section `Test`

Le composant permet :

- un acces par URL connue
- ou un acces par template d'URL
- un selecteur de titre obligatoire
- des selecteurs optionnels pour couverture, description, auteurs, tags et statut
- une liste de variables derivees reutilisables par d'autres composants

Pour chaque variable extraite, on peut definir :

- un nom
- une source
- une regex optionnelle

Regles actuelles :

- la premiere valeur trouvee est utilisee
- si une regex contient un groupe capture, le premier groupe est conserve
- si une variable configuree ne peut pas etre extraite pendant le test, la validation echoue

Exemple utile pour `Momoniji` :

- variable : `mangaId`
- source : selecteur personnalise
- selecteur : `#cif .iw img@src`
- regex : `d_(\\d+)`

Validation actuelle de `Fiche` :

- resolution de l'URL de test
- recuperation HTML via Electron
- parsing cote renderer
- verification des selecteurs
- extraction des variables derivees
- affichage d'une previsualisation de fiche

Regles pratiques :

- la validation n'est pas obligatoire pour enregistrer
- le titre sert de verification principale
- les selecteurs optionnels absents remontent en warning
- le mode `template` supporte deja `{{id}}`, `{{slug}}`, `{{value}}` et leurs variantes `raw`

## Configuration actuelle de `Pages`

La configuration de `Pages` repose sur :

- une section `Source des pages`
- une section `Scraping`
- une section `Test`

Modes disponibles :

- `Depuis la fiche`
- `Depuis un template`

Le mode `Depuis la fiche` reutilise :

- l'URL validee du composant `Fiche`

Le mode `Depuis un template` reutilise :

- l'URL validee de `Fiche`
- les champs extraits par `Fiche`
- les variables derivees de `Fiche`

Regles actuelles du template :

- `{{nomVariable}}` insere une valeur encodee
- `{{raw:nomVariable}}` insere une valeur brute
- `{{page}}` insere un numero 1-based
- `{{page3}}` insere un numero 1-based zero-padde sur 3 chiffres
- `{{pageIndex}}` insere un index 0-based
- `{{pageIndex3}}` insere un index 0-based zero-padde sur 3 chiffres

Quand le template pointe directement vers une image :

- la section `Scraping` peut rester vide
- la validation teste l'image directe
- si le template contient un placeholder de page, la validation tente de detecter plusieurs pages consecutives

Validation actuelle de `Pages` :

- resolution de l'URL de test a partir de `Fiche`
- recuperation HTML
- extraction des pages
- affichage d'un mini lecteur de previsualisation

Le mini lecteur montre :

- une image
- un bouton `Precedent`
- un bouton `Suivant`

## Runtime temporaire dans l'application

Quand un scraper est actif :

- le header remplace `Gestion des mangas` par un selecteur de vue
- `Bibliotheque` conserve l'UI historique
- un scraper actif masque l'UI specifique a la bibliotheque

Elements conserves hors `Bibliotheque` :

- `Parametres`
- `Scrappers`

La vue temporaire du scraper affiche :

- son identite
- l'etat de `Recherche`, `Fiche` et `Pages`
- une barre de saisie runtime
- un select `Recherche / Manga` seulement si les deux composants sont utilisables

Dans la V1 actuelle, le runtime reel branche est surtout :

- `Recherche`
- `Manga` via `Fiche`

Le mode `Recherche` permet deja :

- de lancer une vraie requete
- d'extraire les cartes de resultats
- de naviguer entre les pages de recherche
- d'ouvrir `Fiche` depuis un resultat quand un lien detail est disponible

Le rendu temporaire affiche :

- titre
- couverture
- description
- auteurs
- tags
- statut
- URL demandee / URL finale
- variables derivees resolues

## Telechargement et lecture en ligne temporaires

Quand `Pages` est configure, la vue `Manga` expose :

- un bouton `Telecharger`
- un bouton `Lecteur`

### Telechargement

Comportement actuel :

- resolution de toutes les pages du manga
- telechargement dans la bibliotheque definie dans les parametres
- creation d'un dossier avec le titre du manga
- ajout du dossier a la bibliotheque locale

Limites volontaires :

- pas d'import des tags
- pas d'import des auteurs
- pas d'import de serie
- pas de mapping de metadonnees supplementaires
- telechargement sequentiel

### Lecteur en ligne

Comportement actuel :

- resolution des pages sans telechargement
- ouverture du `Reader` existant en mode lecture en ligne
- chargement des URLs via un mode `scraper`
- desactivation du bouton OCR dans ce mode

Pour garder la progression :

- un identifiant stable est derive du scraper et de l'URL stable de la fiche
- la progression est stockee a part des mangas locaux
- rouvrir la meme fiche reprend a la derniere page connue
- le bouton `Retour` renvoie a la fiche scraper precedemment ouverte

## Limites volontaires de cette V1

La V1 n'essaie pas encore de :

- brancher concretement `Recherche`
- couvrir le JavaScript complexe cote site
- generaliser les selecteurs HTML avances
- gerer l'authentification API
- finaliser la navigation produit
