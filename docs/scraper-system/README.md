# Systeme de scraper site/API

Date : 2026-04-10

Ce dossier regroupe la documentation du theme `scraper` / `connecteur de source`.

## Documents

- [`product-overview.md`](./product-overview.md) : vision produit, perimetre, parcours user, vision UI et phasage
- [`technical-design.md`](./technical-design.md) : structure des donnees, configuration site/API, validation et points techniques
- [`scraper-config-guide.md`](./scraper-config-guide.md) : guide technique de configuration des scrapers, des selecteurs et des modules V1
- [`source-linking.md`](./source-linking.md) : liaison entre une fiche scraper, un manga local et sa source externe
- [`v1-implementation-status.md`](./v1-implementation-status.md) : ce qui est effectivement branche dans l'application aujourd'hui
- [`first-draft-archive.md`](./first-draft-archive.md) : archive integrale du brouillon initial, conservee sans perte d'information

## Direction retenue

- penser le systeme comme un connecteur de source configurable
- implementer d'abord le chemin `site`
- preparer des maintenant la structure `api`
- modeliser chaque fonctionnalite comme un bloc autonome
- rendre un scraper configure directement utilisable dans l'application
- centraliser aussi les regles de bookmarks dans la config globale du scraper
- pour un telechargement de chapitre, prioriser la couverture issue de `Fiche`, puis fallback sur l'image du chapitre si besoin

## Site de reference

Le site de reference pour la premiere iteration reste :

- `https://momoniji.com/`

Il sert a verifier en priorite :

- le flux de creation d'un `site scraper`
- la configuration de `Recherche`
- la configuration de `Fiche`
- la configuration de `Auteur`
- la configuration de `Chapitres`
- la configuration de `Pages`
