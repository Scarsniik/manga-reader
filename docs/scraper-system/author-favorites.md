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

L'etoile devient active quand la source auteur courante est deja rattachee a un favori.

## Vue combinee

La vue `Auteurs favoris` liste les auteurs sauvegardes. Ouvrir un auteur combine les resultats de ses sources.

Le chargement est volontairement borne :

- le nombre de pages chargees a l'ouverture est controle par le parametre global
  `Pages a charger a l'ouverture d'un auteur favori`
- les pages suivantes sont chargees avec les actions `Charger plus`
- le runtime reutilise le pacing, la concurrence et les retries du multi-search

La vue combinee reutilise aussi :

- la conversion des cards en `MultiSearchSourceResult`
- la fusion des resultats par titre
- le filtre de langue du multi-search
- les cards de resultat multi-source

## Stockage

Les donnees sont stockees dans `scraper-author-favorites.json` dans le dossier de donnees utilisateur de l'application.
