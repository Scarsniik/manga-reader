# Multi-search

Le multi-search est une fonctionnalité permettant d'effectuer une recherche simultanée sur plusieurs scrapers.

L'objectif est de permettre à l'utilisateur de rechercher un manga sur plusieurs sources en même temps, tout en gardant une interface lisible malgré les différences entre les scrapers, les doublons potentiels, les langues disponibles et les paginations propres à chaque site.

---

## Objectifs

- Rechercher simultanément sur plusieurs scrapers.
- Afficher les résultats sous forme de cartes.
- Regrouper les résultats similaires lorsque c'est possible.
- Permettre à l'utilisateur de choisir la profondeur de recherche.
- Permettre un mode de recherche rapide ou prudent.
- Afficher clairement le statut de chaque scraper pendant et après la recherche.
- Laisser l'utilisateur choisir sur quel scraper ouvrir un résultat lorsqu'une carte regroupe plusieurs sources.
- Gérer la notion de langue dans les résultats.

---

## Sélection des scrapers

L'utilisateur peut choisir les scrapers concernés par la recherche.

### Méthodes de sélection

- Sélection individuelle de scrapers.
- Filtrage par propriétés des scrapers.

### Propriétés des scrapers — V1

- **Langue** : langue du scraper.
  - Choix multiples.
  - Exemple : japonais, anglais, français.
- **Type** : type du scraper.
  - Choix multiples.
  - Exemple : manga, comics, hentai, doujinshi.

---

## Page de recherche multiple — éléments

La page de recherche multiple contient :

- Champ de recherche.
- Sélection multiple de scrapers.
- Sélection multiple de langues.
- Sélection multiple de types.
- Profondeur de recherche.
- Mode de recherche.
- Résumé des scrapers concernés.
- Statut détaillé des scrapers.
- Résultats de la recherche.
- Filtre texte des résultats chargés.

---

## Profondeur de recherche

La profondeur de recherche permet à l'utilisateur de choisir combien de pages de résultats doivent être chargées pour chaque scraper.

Cela permet de contrôler le compromis entre :

- vitesse de recherche ;
- quantité de résultats ;
- nombre de requêtes envoyées ;
- risque d'erreur, de ralentissement ou de blocage côté scraper.

### Options possibles — V1

- **Rapide** : 1 page par scraper.
- **Étendue** : 3 pages par scraper.
- **Avancée** : choix manuel du nombre de pages.

Exemple d'affichage :

```txt
Profondeur de recherche
[ Rapide : 1 page ] [ Étendue : 3 pages ] [ Avancée... ]
```

En mode avancé, l'utilisateur peut choisir une valeur fixe ou charger jusqu'a la fin de pagination :

```txt
Pages par scraper : 1 / 2 / 3 / 5 / 10 / 20 / Maximum
```

`Maximum` charge chaque scraper jusqu'a ce qu'il n'y ait plus de page suivante, qu'une erreur ferme la pagination, ou qu'une page ne retourne que des URLs deja vues.

### Recommandation V1

Par défaut, la recherche utilise :

```txt
1 page par scraper
```

Les pages suivantes peuvent être chargées à la demande avec un bouton du type :

```txt
Charger plus
```

ou :

```txt
Charger plus pour ce scraper
```

---

## Mode de recherche : rapide ou prudent

L'utilisateur peut choisir le rythme de recherche.

### Mode rapide

Le mode rapide privilégie la réactivité.

Il peut utiliser :

- plus de requêtes en parallèle ;
- moins de délai entre les requêtes ;
- des timeouts plus courts ;
- moins de tentatives en cas d'erreur.

Ce mode est adapté pour les scrapers stables ou peu sensibles.

### Mode prudent

Le mode prudent privilégie la stabilité.

Il peut utiliser :

- moins de requêtes en parallèle ;
- des délais entre les requêtes ;
- des timeouts plus longs ;
- une nouvelle tentative en cas d'erreur.

Ce mode est adapté pour les scrapers plus fragiles, plus lents ou plus susceptibles de refuser trop de requêtes.

### Libellé conseillé

Éviter d'utiliser une formulation trop technique ou anxiogène comme :

```txt
Contre-mesures anti-scraping
```

Préférer :

```txt
Rythme de recherche
[ Rapide ] [ Prudent ]
```

Avec une description :

```txt
Rapide : plus réactif, peut échouer sur certains sites.
Prudent : plus lent, mais plus stable sur les sites sensibles.
```

---

## Résumé des scrapers concernés

La page doit afficher un résumé des scrapers concernés par la recherche.

Ce résumé permet à l'utilisateur de comprendre rapidement :

- combien de scrapers sont utilisés ;
- quelles langues sont concernées ;
- quels types de contenus sont concernés ;
- combien de scrapers ont terminé ;
- combien sont encore en cours ;
- combien ont échoué ;
- combien sont en attente.

Exemple :

```txt
Recherche sur 8 scrapers

Langues : japonais, anglais
Types : manga, hentai

5 terminés
2 en cours
1 erreur
```

---

## Statut détaillé par scraper

La fonctionnalité doit afficher le statut de chaque scraper individuellement.

Cette information peut être affichée dans un panneau dédié, une section repliable, une sidebar ou une zone de détails.

L'important est de permettre à l'utilisateur de voir clairement l'état de chaque source.

### Informations affichées par scraper

Pour chaque scraper, afficher :

- nom du scraper ;
- statut ;
- nombre de résultats trouvés ;
- page actuellement chargée ;
- présence ou non d'une page suivante ;
- erreur éventuelle.

### Statuts possibles

```ts
type ScraperStatus =
  | "idle"
  | "waiting"
  | "loading"
  | "success"
  | "done"
  | "cancelled"
  | "error";
```

### Exemple

```txt
MangaDex
12 résultats
Page 1 chargée
Terminé

NHentai
8 résultats
Page 1 chargée
Terminé

3Hentai
Erreur
Impossible de récupérer les résultats

Rawkuma
En cours...
Page 1 en chargement

Comick
0 résultat
Terminé
```

---

## Résultats avec cartes mergées

Les résultats sont affichés sous forme de cartes.

Une carte peut représenter :

- un résultat unique provenant d'un seul scraper ;
- un résultat mergé provenant de plusieurs scrapers.

L'objectif du merge est de réduire le bruit visuel lorsque plusieurs scrapers retournent probablement le même manga.

---

## Carte de résultat

Une carte de résultat peut contenir :

- image de couverture ;
- titre principal ;
- auteur, si disponible ;
- type ;
- tags principaux, si disponibles ;
- langue ou langues disponibles ;
- nombre de sources trouvées ;
- liste des scrapers associés ;
- action d'ouverture.

### Exemple de carte simple

```txt
[Cover]

One Piece
Eiichiro Oda

Langue : japonais
Type : manga

1 source trouvée
[MangaDex]

[Ouvrir]
```

### Exemple de carte mergée

```txt
[Cover]

One Piece
Eiichiro Oda

Langues disponibles :
- japonais
- anglais

3 sources trouvées
[MangaDex] [NHentai] [Rawkuma]

[Ouvrir]
```

### Historique de vue

Les cartes de resultats multi-source utilisent le meme historique de vue que les cartes de scrapper classiques.
Pour une carte fusionnee, l'etat est calcule sur toutes les sources de la carte : si au moins une source n'a jamais
ete vue dans l'historique courant, la carte est marquee comme nouvelle.

Quand au moins 80% d'une carte fusionnee reste visible dans le viewport pendant 1 seconde, toutes ses sources sont enregistrees comme
vues.

---

## Ouverture d'une carte mergée

Lorsqu'une carte contient plusieurs scrapers, un clic sur la carte ou sur le bouton d'ouverture ne doit pas ouvrir directement un lien arbitraire.

À la place, l'interface ouvre un menu permettant à l'utilisateur de choisir le scraper à ouvrir.

### Exemple

```txt
Ouvrir avec...

MangaDex
Japonais
Page du manga

NHentai
Anglais
Page du manga

Rawkuma
Anglais
Page du manga
```

### Variante possible

Le bouton principal peut ouvrir la source considérée comme la plus pertinente, tandis que la flèche ouvre le menu complet.

Exemple :

```txt
[Ouvrir sur MangaDex] [▼]
```

Mais pour une V1, il est plus sûr d'ouvrir systématiquement un menu si plusieurs sources sont disponibles.

---

## Gestion des langues dans les cartes

La langue est une information importante parce qu'un même manga peut exister sur plusieurs scrapers dans des langues différentes.

La question reste ouverte côté design :

- soit une carte globale par manga, avec les langues affichées pour chaque scraper ;
- soit une carte séparée par langue ;
- soit un comportement configurable.

---

## Option A — une carte globale par manga

Dans ce modèle, les résultats similaires sont regroupés dans une seule carte, même si les langues diffèrent.

La carte affiche ensuite les langues disponibles par source.

### Exemple

```txt
One Piece

Sources :
- MangaDex — japonais
- NHentai — anglais
- Rawkuma — anglais

Langues disponibles :
japonais, anglais
```

### Avantages

- Interface plus compacte.
- Réduit davantage les doublons.
- Pratique si l'utilisateur veut juste trouver le manga, peu importe la langue.

### Inconvénients

- Peut masquer une différence importante.
- Moins clair si l'utilisateur cherche une langue précise.
- Le menu d'ouverture devient plus important.

---

## Option B — une carte par langue

Dans ce modèle, un même manga peut apparaître plusieurs fois si les langues sont différentes.

### Exemple

```txt
One Piece — japonais
Sources :
- MangaDex

One Piece — anglais
Sources :
- NHentai
- Rawkuma
```

### Avantages

- Plus clair si la langue est un critère important.
- Évite de mélanger des versions différentes.
- Plus simple à comprendre côté utilisateur.

### Inconvénients

- Affichage plus long.
- Plus de cartes visibles.
- Peut donner une impression de doublons.

---

## Option C — choix utilisateur

L'utilisateur peut choisir le mode d'affichage des langues.

Exemple :

```txt
Affichage des langues
[ Regrouper les langues ] [ Séparer par langue ]
```

### Recommandation V1

Pour une V1, utiliser une carte globale par manga, mais afficher clairement les langues par source dans la carte et dans le menu d'ouverture.

Cela garde l'interface compacte tout en évitant de cacher l'information.

---

## Merge des résultats

Le merge consiste à regrouper plusieurs résultats qui correspondent au même manga.

La V1 retient une fusion déterministe et prudente :

- même URL source si elle est disponible ;
- ou même titre normalisé après découpe des titres alternatifs et suppression des contextes connus ;
- ou titre quasi identique avec une seule difference de caractere, uniquement si les auteurs provisoires sont compatibles et si le titre est assez long.

Il n'y a pas de score de similarité réglable. Un doublon visible est moins grave qu'un mauvais regroupement.

---

## Résultats partiels

Les résultats affichés peuvent être partiels.

La page doit indiquer clairement que la fusion et les résultats affichés dépendent des pages déjà chargées.

Exemple :

```txt
Résultats fusionnés à partir des pages actuellement chargées.
Page 1 chargée pour 6 scrapers sur 8.
```

Cela évite de donner l'impression que la recherche a forcément parcouru tous les résultats disponibles sur tous les scrapers.

---

## Chargement de pages supplémentaires

La page doit permettre de charger plus de résultats après la première recherche.

### Chargement global

```txt
Charger plus
```

Charge la page suivante pour chaque scraper qui possède encore une page disponible.

### Chargement par scraper

```txt
Charger plus pour MangaDex
```

Charge uniquement la page suivante du scraper concerné.

Cette option peut être placée dans le détail du statut des scrapers.

---

## Vue fusionnée et vue par scraper

La vue principale peut être la vue fusionnée.

Cependant, une vue par scraper doit rester disponible.

### Vue fusionnée

- Affiche les cartes mergées.
- Réduit les doublons.
- Donne une vision globale des résultats.

### Vue par scraper

- Affiche les résultats séparés par source.
- Plus fiable pour vérifier ce que chaque scraper a retourné.
- Utile pour debug et pour comprendre les différences entre scrapers.

Exemple :

```txt
Vue
[ Fusionnée ] [ Par scraper ]
```

---

## Comportement recommandé — V1

### Au lancement d'une recherche

1. L'utilisateur saisit une recherche.
2. Il choisit éventuellement les scrapers, langues et types.
3. Il garde les options par défaut ou choisit :
   - profondeur de recherche ;
   - rythme rapide ou prudent.
4. La recherche démarre sur les scrapers sélectionnés.
5. Les résultats sont affichés dès qu'ils arrivent.
6. Les cartes sont mergees par correspondance d'URL, par titre normalise, ou par titre quasi identique avec auteurs compatibles.
7. Les statuts des scrapers sont mis à jour en temps réel.

### Paramètres par défaut

```txt
Profondeur : rapide, 1 page par scraper
Rythme : rapide
Vue : fusionnée
Langues : carte globale avec langues affichées par source
```

---

## Points à décider plus tard

- Gestion avancée des titres alternatifs.
- Gestion des résultats avec plusieurs langues sur un même scraper.
- Choix final entre carte globale ou carte par langue.
- Possibilité de définir un scraper prioritaire pour l'ouverture rapide.
- Possibilité de cacher certains scrapers après la recherche.
- Tri global des résultats mergés.
- Tri par pertinence, nombre de sources ou date de mise à jour.

---

## Résumé V1

La V1 du multi-search repose sur les choix suivants :

- recherche simultanée sur plusieurs scrapers ;
- chargement limité par profondeur de recherche ;
- rythme rapide ou prudent ;
- affichage des statuts par scraper ;
- résultats sous forme de cartes ;
- cartes pouvant être mergées ;
- merge prudent par URL, titre normalise ou titre quasi identique avec auteurs compatibles ;
- ouverture d'une carte mergée via un menu de choix du scraper ;
- langue affichée au niveau de la carte et/ou de chaque source ;
- vue fusionnée par défaut ;
- vue par scraper disponible en fallback.

---

## Decisions d'implementation V1

- La vue `Recherche multi-sources` est accessible depuis la liste deroulante principale, au meme niveau que la bibliotheque, les bookmarks et les scrapers.
- La langue utilisee pour filtrer les scrapers est une metadonnee dediee (`sourceLanguages`) et reste distincte de la langue par defaut appliquee aux imports et telechargements (`defaultLanguage`).
- Les types de contenu sont libres (`contentTypes`) et ne reposent pas sur une liste predefinie. La page multi-search propose les types deja renseignes sur les scrapers.
- Les scrapers sans langue ou sans type renseignes restent utilisables et apparaissent sous `Non renseigne`.
- La page conserve le dernier etat de recherche dans la session de l'onglet afin qu'un retour arriere depuis une fiche restaure les resultats charges. Une nouvelle recherche remplace cet etat.
- Le statut detaille d'un scraper affiche l'adresse de la derniere page chargee quand elle est disponible.
- Le merge ignore les marqueurs de langue explicites presents dans les titres, par exemple `[EN]`, `VF`, `RAW` ou `English`, et ces marqueurs enrichissent aussi l'affichage des langues detectees.
- Les codes de langue courts (`de`, `en`, `fr`, etc.) ne sont detectes dans les titres que lorsqu'ils sont dans un marqueur explicite comme `[DE]` ou `(EN)`, afin d'eviter les faux positifs sur des mots ordinaires.
- La detection de langue se fait d'abord sur le titre original. Si le titre indique une langue, elle remplace l'inference depuis le scraper. Si le scraper n'a qu'une langue source, elle sert de fallback. Si le scraper en a plusieurs, elles ne sont pas utilisees pour determiner la langue du manga.
- La normalisation de merge retire ensuite les blocs entre crochets et accolades, puis supprime les apostrophes avant comparaison. Une variante retire aussi les blocs entre parentheses pour comparer le titre coeur sans le contexte de serie.
- Pour les titres japonais composes de kana sans kanji, le merge ajoute des variantes romaji legeres basees sur la lecture hiragana/katakana. Ces variantes couvrent aussi un repli prudent des voyelles longues et une cle compacte sans espaces pour rapprocher les sources japonaises et les sources romanisees.
- Pour les titres avec kanji ou japonais mixte, le renderer demande aussi une romanisation avancee a Kuroshiro + Kuromoji via Electron. Les cibles envoyees a l'outil lourd utilisent le meme decoupage que le merge : alternatives separees par `|` ou `/`, blocs auteur/contexte retires, puis auteurs provisoires traites separement. Les variantes normales, espacees, issues des lectures/prononciations Kuromoji, avec macrons (`imōto`), sans macrons (`imouto`), et selon plusieurs systemes romaji (`hepburn`, `passport`, `nippon`) sont ajoutees aux cles de merge avant l'envoi au worker.
- Une option de parametres permet d'ajouter une cle phonétique romaji legere et bornee aux variantes normalisees pour reduire les faux negatifs entre conventions proches, par exemple voyelles longues, lettres latines differentes ou katakana de type gairaigo (`chiimu` / `team`). Elle n'est creee que sur des chaines romaji assez longues.
- Les blocs entre crochets places au tout debut d'un titre sont extraits comme `tentativeAuthorNames`, meme lorsqu'ils sont precedes par un prefixe de convention entre parentheses comme `(SC37)`. Les marqueurs de langue evidents sont ignores. Cette information est exposee dans les exports et sert de veto faible : si deux sources ont des auteurs provisoires differents, elles ne fusionnent pas par titre. Une URL identique reste prioritaire.
- Les auteurs provisoires extraits depuis ces blocs utilisent les memes variantes romaji legeres ou avancees que les titres, afin de ne pas bloquer une fusion lorsqu'un auteur japonais correspond a une source romanisee.
- Les caracteres `|` et `/` dans un titre de resultat sont traites comme des separateurs de titres alternatifs, souvent deux langues pour un meme manga. Chaque alternative est comparee aux autres titres, et une alternative qui ne matche pas n'empeche pas la fusion si une autre alternative matche.
- Le merge refuse une paire de titres alternatifs qui ne porte pas les memes marqueurs numeriques ou romains (`2`, `II`, `III`, etc.), afin d'eviter de fusionner deux volumes distincts. Ce refus s'applique par paire d'alternatives, pas au titre complet separe par `|` ou `/`.
- Quand les auteurs provisoires sont identiques ou manquants d'un cote, le merge accepte aussi une seule difference de caractere entre deux alternatives normalisees longues. Ce fallback ne s'applique pas si les deux sources ont des auteurs provisoires contradictoires.
- Une erreur de pagination apres au moins une page chargee ferme simplement la pagination de ce scraper et conserve les resultats deja recuperes.
- Pour chaque scraper, les resultats de recherche multi-sources dedoublonnent les URLs deja vues sur les pages precedentes. Si une page ne contient que des URLs deja vues, la pagination de ce scraper s'arrete.
- Si la couverture affichee dans une card multi-search ne charge pas, la card essaie les couvertures des autres sources du meme resultat avant d'afficher le placeholder.
- Le champ de recherche accepte plusieurs termes separes par virgule, point-virgule, barre verticale ou retour a la ligne. La pagination est suivie par terme et par scraper.
- Dans les cards multi-search, les langues sont affichees sous forme de drapeaux compacts via la librairie `flag-icons`, avec le nom de langue conserve en aide au survol. Le chinois (`zh`) est pris en charge comme langue frequente.
- Dans les listes de langues, les codes qui ne correspondent pas a une langue connue sont affiches avec `?`.
- La section de resultats affiche sous le compteur un drapeau par langue trouvee dans les resultats charges. Chaque drapeau filtre seulement l'affichage et les compteurs, sans supprimer les resultats charges. Le clic gauche alterne `only` et `default`, le clic droit alterne `without` et `default`.
- La section de resultats affiche au-dessus des drapeaux un filtre texte qui filtre seulement l'affichage et les compteurs, sans relancer les scrapers ni supprimer les resultats charges.
- Le filtre texte accepte plusieurs termes avec les memes separateurs que la recherche principale : virgule, point-virgule, barre verticale ou retour a la ligne.
- Le filtre texte est applique apres un court delai de saisie pour eviter de recalculer l'affichage a chaque frappe.
- Le filtre texte propose un bouton pour reprendre la recherche principale comme valeur de filtre, et un bouton pour vider la valeur.
- Les resultats peuvent aussi etre filtres par etat de lecture avec des choix cumulables : `Non lu`, `En cours` et `Lu`. Le filtre utilise les progressions scraper et les mangas lies a une source.
- La liste des scrapers associes a une card multi-search et le menu `Ouvrir avec` s'ouvrent au clic comme des menus deroulants en overlay pour ne pas deplacer les cards suivantes, et se ferment quand l'utilisateur clique en dehors.
- Les couvertures multi-search distantes passent par un protocole local de vignette redimensionnee quand l'application Electron est disponible, avec fallback vers l'image originale.
- Les cards multi-search indiquent quand une source correspond deja a un manga en bibliotheque, a un bookmark scraper ou a une progression de lecture en cours/terminee.
- Dans le menu `Ouvrir avec`, chaque source affiche aussi ses etats bibliotheque, bookmark et progression, avec une bordure distincte quand la source a une progression.
- La section de resultats expose un bouton JSON qui ecrit un export temporaire dans le dossier temporaire systeme puis l'ouvre avec l'application associee aux fichiers JSON.
- En environnement de developpement uniquement, la section de resultats fusionnes expose un bouton `Recharger fusion` qui force le recalcul de la fusion depuis les sources deja chargees.
- En environnement de developpement uniquement, la section de resultats fusionnes expose aussi un bouton `Merged JSON` qui ouvre un export limite aux `mergedResults`.
- Les grilles de resultats virtualisent les cards par lignes mesurees : seules les cards visibles, une marge autour du viewport et les cards avec focus ou menu ouvert restent montees dans le DOM.
- Pendant le scraping, les mises a jour de resultats sont groupees avant d'etre poussees a React afin de limiter les recalculs de fusion, de filtres et d'affichage sur les grosses recherches.
- La fusion des resultats est incrementale et executee dans un Web Worker pendant une recherche : les nouvelles sources sont inserees dans les groupes existants hors du thread UI, et le bouton de developpement `Recharger fusion` force une reconstruction complete si necessaire.
- La fusion expose une progression visible pendant le traitement et le tri. Le merge utilise un index URL/titres/fuzzy pour eviter de comparer chaque nouvelle source avec tous les groupes existants.
- La recherche multi-sources peut etre arretee globalement. Les requetes deja parties ne sont pas interrompues cote IPC, mais leurs resultats sont ignores et les scrapers encore actifs passent en statut `cancelled`.
- Une recherche peut aussi etre arretee pour un scraper precis depuis son statut detaille. Les resultats deja charges sont conserves et la pagination de ce scraper est fermee pour cette recherche.
- La section de resultats expose un bouton `Extraire auteurs`. Il deduplique les auteurs par couple scraper + URL auteur normalisee, jamais par nom affiche.
- L'extraction d'auteurs utilise d'abord les informations deja presentes dans les cards de resultat (`authorUrlSelector` de la recherche). Elle ne charge la fiche detaillee que pour les sources qui n'ont pas donne d'auteur via la card et seulement si la fiche fournit un selecteur d'URL auteur.
- A la fin de l'extraction, une dialog affiche les auteurs trouves avec leur nom et leur scraper. Chaque auteur est ouvrable en onglet auteur workspace quand le composant Auteur est configure, avec un fallback vers l'ouverture externe du lien. La dialog propose aussi `Tout ouvrir`.
- Dans cette dialog, un auteur deja present dans un favori auteur affiche un pictogramme bookmark jaune a droite de sa ligne.
- Depuis une page auteur ou un auteur favori, une action peut pre-remplir le champ de recherche
  multi-sources avec les noms auteur uniques connus, joints par `, `. Cette action ne lance pas la
  recherche automatiquement.
