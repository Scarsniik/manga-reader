# Systeme de scraper site/API - etat d'implementation V1

Date : 2026-04-10

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
14. la configuration reelle de `Auteur`
15. la configuration reelle de `Chapitres`
16. la configuration reelle de `Pages`
17. l'ouverture temporaire d'un scraper depuis le header principal
18. l'execution runtime reelle de `Recherche`
19. l'execution runtime reelle de `Auteur`
20. l'ouverture runtime de `Fiche` depuis `Recherche` ou `Auteur` quand le lien est disponible
21. les liens auteur optionnels recuperes depuis `Recherche` et `Fiche`
22. l'execution runtime de `Chapitres` et `Pages`
23. le telechargement et la lecture en ligne branches sur `Pages`

Pas encore branche :

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
- `src/renderer/components/ScraperConfig/author` pour les blocs lies a `Auteur`
- `src/renderer/components/ScraperConfig/chapters` pour les blocs lies a `Chapitres`
- `src/renderer/components/ScraperConfig/pages` pour les blocs lies a `Pages`
- `src/renderer/components/ScraperBrowser/components` pour les vues du runtime
- `src/renderer/utils/scraperTemplateContext.ts` pour le contexte partage entre `Fiche`, `Chapitres` et `Pages`

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
- `Auteur`
- `Chapitres`
- `Pages`

Etat de chaque composant :

- `Non configure`
- `Configure non valide`
- `Valide`

Code couleur actuel :

- gris
- jaune
- vert

## Reglages globaux actuels

Les reglages globaux du scraper couvrent maintenant :

- les tags appliques automatiquement au telechargement
- la langue par defaut des mangas importes
- la recherche d'accueil eventuelle
- les metadonnees de bookmark a exclure du stockage local

Pour les bookmarks, une section dediee permet de choisir plusieurs informations a ne pas conserver, par exemple :

- le resume
- la description
- les auteurs
- les tags
- le statut
- la couverture

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
- un selecteur optionnel de lien auteur, pour rendre les tags auteur cliquables
- une liste de variables derivees reutilisables par d'autres composants

Pour chaque variable extraite, on peut definir :

- un nom
- une source
- une regex optionnelle

Sources actuellement disponibles :

- un champ deja extrait
- un selecteur personnalise
- l'URL demandee
- l'URL finale
- une regex appliquee directement sur le HTML brut

Regles actuelles :

- la premiere valeur trouvee est utilisee
- si une regex contient un groupe capture, le premier groupe est conserve
- si la source est `HTML brut`, la regex devient obligatoire
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
- pour les champs URL, un selecteur place sur un lien HTML utilise `href` par defaut meme sans `@href`

## Configuration actuelle de `Auteur`

La configuration de `Auteur` repose sur :

- une section `Construction de l'URL`
- une section `Scraping`
- une section `Test`

Le composant permet :

- un acces par URL auteur connue
- ou un acces par template d'URL auteur
- de recopier en un clic les selecteurs de `Recherche` vers `Auteur` quand `Recherche` est deja configuree
- un selecteur de titre obligatoire
- des selecteurs optionnels pour lien fiche, lien auteur, miniature, resume et page suivante
- un rendu de previsualisation identique a une liste de `Recherche`

Regles actuelles :

- le mode `template` accepte `{{value}}`, `{{rawValue}}`, `{{query}}`, `{{rawQuery}}`
- la pagination auteur peut venir de `{{page}}` dans le template
- ou d'un lien HTML de page suivante
- pour les champs URL, un selecteur place sur un lien HTML utilise `href` par defaut meme sans `@href`
- le composant `Recherche` peut stocker un lien auteur optionnel par card
- le composant `Fiche` peut stocker un lien auteur optionnel pour ses tags auteur

Validation actuelle de `Auteur` :

- resolution de l'URL de test
- recuperation HTML via Electron
- parsing cote renderer
- extraction de la liste de cards
- affichage d'un apercu pagine si besoin

## Configuration actuelle de `Chapitres`

La configuration de `Chapitres` repose sur :

- une section `Source`
- une section `Scraping`
- une section `Test`

Le composant reutilise la derniere validation reussie de `Fiche` pour :

- recharger la meme page manga
- ou construire une URL dediee a partir des variables de `Fiche`
- extraire une liste de chapitres
- stocker pour chaque chapitre son URL, son image eventuelle et son label

Regles actuelles :

- `Depuis la fiche` et `Depuis une URL` sont disponibles
- le mode URL supporte les variables derivees de `Fiche`
- `{{chapterPage}}` peut etre utilise dans l'URL des chapitres pour paginer automatiquement
- `templateBase = scraper_base` ou `details_page` controle la resolution des URLs relatives
- pour `URL du chapitre`, un selecteur place sur un lien HTML utilise `href` par defaut meme sans `@href`
- `Bloc chapitre` est obligatoire
- `URL du chapitre` est obligatoire
- `Label du chapitre` est obligatoire
- `Bloc liste` et `Image du chapitre` restent optionnels

Validation actuelle de `Chapitres` :

- resolution de la source a partir de `Fiche`
- recuperation HTML
- si `{{chapterPage}}` est present, enchainement automatique des pages jusqu'a absence de resultat
- parsing cote renderer
- extraction de la liste de chapitres
- affichage d'un apercu de la liste detectee

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
- ou l'URL du chapitre choisi si `Pages` est lie a des chapitres

Le mode `Depuis un template` reutilise :

- l'URL validee de `Fiche`
- les champs extraits par `Fiche`
- les variables derivees de `Fiche`
- l'URL du chapitre choisi via `{{chapter}}` si le checkbox correspondant est actif

Regles actuelles du template :

- `{{nomVariable}}` insere une valeur encodee
- `{{raw:nomVariable}}` insere une valeur brute
- `{{requestedUrl}}` et `{{finalUrl}}` encodent donc les `/` en `%2F`
- `{{chapter}}` insere l'URL du chapitre choisi quand `Pages` est lie a des chapitres
- `{{page}}` insere un numero 1-based
- `{{page3}}` insere un numero 1-based zero-padde sur 3 chiffres
- `{{pageIndex}}` insere un index 0-based
- `{{pageIndex3}}` insere un index 0-based zero-padde sur 3 chiffres
- `templateBase = scraper_base` resout les URLs relatives a partir du `baseUrl` du scraper
- `templateBase = details_page` resout les URLs relatives a partir de l'URL finale validee de `Fiche`

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
- l'etat de `Recherche`, `Fiche`, `Auteur`, `Chapitres` et `Pages`
- une barre de saisie runtime
- un select `Recherche / Manga / Auteur` selon les composants utilisables

Dans la V1 actuelle, le runtime reel branche est surtout :

- `Recherche`
- `Manga` via `Fiche`
- `Auteur`

Le mode `Recherche` permet deja :

- de lancer une vraie requete
- d'extraire les cartes de resultats
- de naviguer entre les pages de recherche
- d'ouvrir `Fiche` depuis un resultat quand un lien detail est disponible
- d'ouvrir `Auteur` depuis un resultat quand un lien auteur est disponible

Le mode `Auteur` permet deja :

- d'ouvrir une page auteur par URL complete, chemin relatif ou valeur libre
- d'extraire les cartes de la page auteur
- de naviguer entre les pages auteur
- d'ouvrir `Fiche` depuis les cartes retournees

Le rendu temporaire affiche :

- titre
- couverture
- description
- auteurs
- tags
- statut
- tags auteur cliquables vers le mode `Auteur` quand la configuration le permet
- la liste des chapitres extraits sous la fiche manga
- URL demandee / URL finale
- variables derivees resolues

### Navigation produit actuelle dans le navigateur de scraper

Le navigateur de scraper s'appuie maintenant sur le vrai historique du routeur pour les transitions produit.

Cela couvre deja :

- `Recherche -> Fiche -> retour` avec le bouton retour interne ou un retour navigateur / souris
- `Recherche -> Fiche -> Auteur -> Fiche -> retours successifs` en revenant bien jusqu'a la recherche d'origine
- `Bookmarks -> Fiche -> retour` avec le meme comportement

Les boutons retour affiches dans les vues `Fiche` et `Auteur` suivent la meme logique que l'historique reel.

## Telechargement et lecture en ligne temporaires

Quand `Pages` est configure, la vue `Manga` expose :

- un bouton `Telecharger` et un bouton `Lecteur` au niveau manga
- ou ces actions au niveau de chaque chapitre si `Pages` est lie a des chapitres

### Telechargement

Comportement actuel :

- resolution de toutes les pages du manga
- telechargement dans la bibliotheque definie dans les parametres
- creation d'un dossier avec le titre du manga
- ajout du dossier a la bibliotheque locale
- pour un telechargement lance depuis un chapitre, la couverture locale priorise l'image de `Fiche`, puis fallback sur l'image du chapitre si la fiche n'a pas de couverture

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
