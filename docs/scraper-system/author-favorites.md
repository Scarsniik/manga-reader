# Auteurs favoris scraper

Date : 2026-05-04

## Principe

Les auteurs favoris scraper permettent de sauvegarder une page auteur et de regrouper plusieurs sources auteur sous un meme auteur logique.

Un favori auteur contient :

- un nom commun affiche dans l'application
- une image de couverture optionnelle
- une ou plusieurs sources scraper

Chaque source contient :

- le `scraperId`
- l'URL ou la requete de page auteur
- le nom de l'auteur tel qu'il existe sur ce scraper
- une image optionnelle
- le contexte de template optionnel quand la page auteur vient d'une fiche scraper

## Ajout depuis une page auteur

Sur une page auteur scraper, une etoile permet d'ajouter la page aux favoris.

Quand l'utilisateur ajoute la page :

- il peut creer un nouvel auteur favori
- ou rattacher cette source a un auteur favori existant
- il peut renseigner le nom de l'auteur propre au scraper courant

Dans l'onglet auteur existant, le formulaire selectionne par defaut le favori dont le nom commun
ou les noms de sources existantes se rapprochent le plus du nom auteur courant.

L'etoile devient active quand la source auteur courante est deja rattachee a un favori.

## Vue combinee

La vue `Auteurs favoris` liste les auteurs sauvegardes. Ouvrir un auteur combine les resultats de ses sources.

Par defaut, le chargement est volontairement borne :

- le nombre de pages chargees a l'ouverture est controle par le parametre global
  `Pages a charger a l'ouverture d'un auteur favori`
- les pages suivantes sont chargees avec les actions `Charger plus`
- le runtime reutilise le pacing, la concurrence et les retries du multi-search

Le parametre global `Stocker les resultats des auteurs favoris` remplace cette limite :

- le champ `Pages a charger a l'ouverture d'un auteur favori` est desactive tant que l'option est active
- le stockage implique que l'ouverture d'un auteur favori charge toutes les pages disponibles pour chaque source
- si un cache existe deja, il est affiche immediatement pendant que l'application re-scrape l'auteur en arriere-plan
- le cache JSON n'est remplace qu'apres un chargement complet sans erreur

La vue auteur favori expose aussi :

- chaque source auteur, cliquable pour revenir a la page auteur du scrapper correspondant
- une action `Recherche multi-source` qui ouvre la recherche multi-sources avec les noms auteur
  uniques de toutes les sources du favori, separes par `, `, sans lancer la recherche
- `Charger plus`, qui charge une page supplementaire sur les sources encore paginables
- `Charger tout`, qui charge toutes les pages restantes sur les sources encore paginables

La vue combinee reutilise aussi :

- la conversion des cards en `MultiSearchSourceResult`
- la fusion des resultats par titre
- le filtre de langue du multi-search
- le filtre texte du multi-search, applique uniquement a l'affichage des resultats charges
- le filtre multi-choix par etat de lecture, applique a la carte fusionnee entiere
- les cards de resultat multi-source, avec les badges bibliotheque, bookmark et progression de lecture

La page auteur classique peut aussi utiliser cette vue combinee pour une seule source auteur.
Elle utilise le meme reglage `Pages a charger a l'ouverture d'un auteur favori` pour son nombre de
pages initiales. Le reglage global `Afficher les pages auteur en vue combinee` active ce rendu par
defaut, et la page auteur expose un switch immediat entre `Vue combinee` et `Vue par pages`.

Pour le filtre de lecture, un resultat combine garde toujours toutes ses sources quand il est visible. Si une source du merge est terminee, la carte est consideree comme `Lu`. Sinon, si une source est en cours, la carte est consideree comme `En cours`. Sinon elle reste `Non lu`.

Le bouton compact de lecture sur une carte combinee suit la progression affichee : si une source du merge est en cours, le marquage lu cible seulement cette source. Si aucune source n'a commence, le marquage lu cible seulement la premiere source. Le retrait du marquage lu ne retire que les marques explicites deja posees.

Cliquer sur le bloc `En cours` ouvre directement le lecteur a la page sauvegardee pour la source concernee, y compris quand la progression vient d'un chapitre resolu par le scrapper.

## Stockage

Les donnees sont stockees dans `scraper-author-favorites.json` dans le dossier de donnees utilisateur de l'application.

Les resultats complets caches par auteur favori sont stockes dans le dossier
`scraper-author-favorite-cache` du dossier de donnees utilisateur. Chaque favori
utilise un fichier JSON dedie, nomme a partir de son identifiant interne.
