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
Un clic molette sur un auteur de la liste l'ouvre dans un nouvel onglet du workspace.
Le bouton `Mettre a jour tous les auteurs` de la liste planifie un rescrape complet de chaque favori
en arriere-plan. Chaque auteur est mis a jour dans son propre fichier de cache et reste consultable
pendant la collecte.

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
- les sources et les mangas sont dedoublonnes par leur cible canonique avant chaque sauvegarde

La vue auteur favori expose aussi :

- une action sur chaque manga pour utiliser sa couverture comme image de l'auteur dans la liste des favoris
- chaque source auteur, cliquable pour revenir a la page auteur du scrapper correspondant
- une action `Trouver les correspondances`, egalement disponible sur les pages auteur classiques,
  qui recherche les pages du meme auteur sur plusieurs sources
- une action `Recherche multi-source` qui ouvre la recherche multi-sources avec les noms auteur
  uniques de toutes les sources du favori, separes par `, `, sans lancer la recherche
- `Charger plus`, qui charge une page supplementaire sur les sources encore paginables
- `Charger tout`, qui charge toutes les pages restantes sur les sources encore paginables

La recherche de correspondances auteur analyse les resultats de recherche manga pour en extraire les
liens auteur, puis teste aussi directement les modules Auteur configures avec un gabarit d'URL. La page
de resultat affiche une ligne par page auteur, avec un apercu de ses premiers mangas. Chaque ligne permet
d'ouvrir la page auteur et d'ajouter ou retirer cette source des auteurs favoris.
Quand une page provient deja de l'auteur favori utilise comme reference, son URL ou sa requete exacte
reste prioritaire afin que le resultat soit correctement signale comme favori.
Deux candidats d'un meme scraper ne sont regroupes que lorsqu'ils partagent la meme cible ou lorsque
le scraper les resout vers la meme page canonique. Un nom identique ne suffit pas a les fusionner.
Les differences d'encodage sans effet, comme la casse des octets `%E3` et `%e3` dans une URL,
designent la meme cible et ne produisent plus deux lignes.

La vue combinee reutilise aussi :

- la conversion des cards en `MultiSearchSourceResult`
- la fusion des resultats par titre
- le filtre de langue du multi-search
- le filtre texte du multi-search, applique uniquement a l'affichage des resultats charges
- le filtre multi-choix par etat de lecture, applique a la carte fusionnee entiere
- les cards de resultat multi-source, avec les badges bibliotheque, bookmark et progression de lecture

La liste des mangas propose deux modes d'affichage :

- `Cartes`, qui conserve la grille fusionnee historique
- `Par serie`, qui analyse toutes les cards visibles, regroupe les titres d'une meme serie et trie
  leurs chapitres dans l'ordre

Le regroupement par serie reutilise l'analyse de titre, la construction des cards de chapitre et la
grille `Chapitres fusionnes` des correspondances manga. Les chapitres d'une serie apparaissent donc
directement cote a cote sous son en-tete. Les titres alternatifs d'une card fusionnee servent de pont
entre les traductions d'une meme serie. Les marqueurs explicites `Part` sont conserves comme numeros
de publication. Dans un titre bilingue, un numero suivi d'un sous-titre sans separateur peut aussi etre
confirme par la traduction correctement structuree. Un prefixe d'evenement numerote place avant le
bloc auteur est retire avant cette comparaison. Un sous-titre descriptif nomme ne suffit pas, a lui
seul, a transformer une œuvre en serie : une publication isolee reste dans `One Shot`. Plusieurs
sous-titres distincts sous un meme titre de base continuent en revanche de former une serie.

Quand le reglage utilisateur `Utiliser la ressemblance visuelle pour fusionner les fiches et
regrouper les series` est actif, les resultats calculent aussi une empreinte perceptuelle basse
resolution des couvertures. Cette preuve complete d'abord la fusion des cards dans les recherches
multi-sources, les nouveautes et les vues combinees auteur ou tag, puis elle est reutilisee par la
vue `Par serie` pour rapprocher les publications restantes.

Une ressemblance visuelle ne suffit jamais seule : les titres doivent conserver un
prefixe commun significatif, sauf dans une vue auteur combinee ou l'auteur est deja considere comme
valide et ou deux publications au meme emplacement de chapitre peuvent etre comparees directement.
Une correction manuelle reste prioritaire. Cette preuve peut relier
un titre descriptif a un chapitre numerote et fusionner leurs sources sous le numero explicite. Le
rapprochement visuel ne fusionne jamais deux numeros de chapitre explicites incompatibles. Le
calcul, le cache et la comparaison d'empreintes sont exposes par un service generique partage, afin
que d'autres vues puissent reutiliser l'analyse sans dependre du regroupement des series. Le reglage
est active par defaut et peut etre desactive dans `Settings > Scraping`.

Une serie peut ouvrir un vrai job de correspondance manga pre-rempli avec ses cards, sans lancer de
scraping. La vue complete permet de corriger les numeros, invalider ou ajouter des sources, puis de
demarrer volontairement la recherche avec le rejeu normal des correspondances. Le job est reutilise
si la serie est rouverte. Ses resultats et corrections sont reinjectes dans la liste de toutes les
series, de sorte que la grille globale reste synchronisee avec la vue de correspondance ouverte.

Chaque card de la vue par serie propose aussi `Corriger le classement`. Cette action permet de
modifier ensemble son chapitre et sa serie, pour toutes les sources de la card fusionnee. Le champ
serie accepte un texte libre et affiche sous la saisie les series existantes correspondant au texte.
Une action permet de supprimer cette correction et de revenir a l'analyse automatique des titres.
Les œuvres isolees sans numero ni categorie de chapitre explicite sont reunies dans un groupe racine
`One Shot`, au meme niveau que les series. Chaque one-shot reste une entrée distincte dans ce groupe.
Les cards de ce groupe sont affichees directement : le groupe ne propose pas de sous-vue serie.
Si d'autres chapitres de la meme serie existent, l'œuvre sans numero reste inferee comme chapitre 1
et demeure dans sa serie.

Lancer la review rapide depuis le mode `Par serie` conserve cet ordre et affiche un bandeau compact
pour chaque vraie serie. Il resume les langues disponibles avec leur couverture de chapitres, permet
de choisir directement un chapitre, de passer a la serie precedente ou suivante et d'ouvrir la
correspondance de la serie dans un nouvel onglet workspace en arriere-plan. Seule la fiche courante
est prechargee afin de ne pas multiplier les requetes sur toutes les series. Le groupe `One Shot`
reste une simple suite de fiches independantes dans la review et n'affiche aucun de ces controles de
serie.

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

Une recherche de nouveautes dans l'onglet `Auteurs` fusionne aussi les cards nouvellement scrapees
dans ces fichiers. Cette mise a jour conserve le contenu deja enregistre et dedoublonne les sources
ainsi que les mangas par leur URL canonique.

Quand l'utilisation du cache est activee pour les nouveautes auteurs, un cache complet et assez
recent peut etre relu sans rescraper l'auteur. Modifier le favori apres sa mise en cache invalide
automatiquement ce fichier pour cette recherche.
