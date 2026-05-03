# Configuration des scrapers

Date : 2026-04-16

Ce document explique le fonctionnement technique de la configuration des scrapers. Il decrit le
modele commun, les regles de selecteurs et de templates, puis chaque module de scraping branche en
V1 : `Recherche`, `Fiche`, `Auteur`, `Chapitres` et `Pages`.

## Perimetre

La V1 execute surtout des scrapers de type `site`, donc des pages HTML recuperees par HTTP puis
parsees avec des selecteurs CSS. Le type `api` existe dans le modele, mais les modules de mapping
JSON ne sont pas encore implementes.

Un scraper sauvegarde contient :

- une identite : `kind`, `name`, `baseUrl`, `description`
- une validation d'accessibilite de la source
- des reglages globaux
- une liste de modules, chacun avec `kind`, `status`, `config` et `validation`

Les scrapers sont persistes dans `scrapers.json`, sous le dossier `data` du `userData` Electron.

## Cycle de configuration

Le flux normal est :

1. Creer ou ouvrir un scraper.
2. Renseigner l'identite de la source.
3. Valider l'accessibilite de `baseUrl`.
4. Configurer les reglages globaux si besoin.
5. Configurer les modules utiles.
6. Tester un module avec une valeur de test.
7. Enregistrer le module.

Un module peut etre enregistre sans validation reussie si ses champs requis sont remplis. Dans ce
cas, son statut reste `configured`. Il passe en `validated` uniquement si la derniere validation
reussie correspond exactement a la configuration sauvegardee. Si la config change apres un test, il
faut relancer la validation avant d'enregistrer pour garder le statut valide.

## Acces HTTP

La validation de source fait un `GET` sur le `baseUrl`, suit les redirections et garde le code HTTP,
l'URL finale et le `content-type`.

Les modules utilisent `fetchScraperDocument` :

- timeout : 10 secondes
- redirections suivies
- `User-Agent` : `Manga Helper Scraper Validation/1.0`
- `Accept` oriente HTML
- pour une image directe, le body n'est pas lu comme HTML ; seul le `content-type` sert a valider

Le module `Recherche` peut aussi envoyer un `POST`. Les autres modules chargent une URL par `GET`.

## Regles communes des selecteurs

Les selecteurs de bloc restent toujours des selecteurs CSS executes avec `querySelectorAll`.
Cela concerne les champs qui delimitent une liste ou un item, par exemple `resultListSelector`,
`resultItemSelector`, `thumbnailsListSelector`, `chapterListSelector` et `chapterItemSelector`.

Les champs d'extraction, eux, peuvent etre en mode CSS ou en mode regex via le bouton `.*` affiche
a gauche du champ dans l'interface. Le JavaScript du site n'est pas execute : il faut donc viser le
HTML present dans la reponse HTTP.

En mode regex, la regex s'applique uniquement au HTML du bloc courant :

- pour `Recherche` et `Auteur`, au HTML de la card trouvee par `resultItemSelector`
- pour `Chapitres`, au HTML du chapitre trouve par `chapterItemSelector`
- pour `Fiche`, `Pages` et les liens de pagination, au HTML du document ou du conteneur courant

Quand le bloc courant est un element, le HTML utilise est son `outerHTML`. Une regex peut donc lire
les attributs et les classes du conteneur direct, par exemple la `div` qui compose une card.

Si la regex contient un groupe capture, le premier groupe est conserve. Sinon, le match complet est
conserve. Exemple pour une classe de drapeau 3hentai : `\bflag-([a-z]{2,4})\b` extrait `eng` depuis
`class="title flag flag-eng"`.

La regex peut etre saisie comme motif brut (`Pages:[\s\S]*?(\d+)`) ou sous forme de litteral
JavaScript (`/Pages:[\s\S]*?(\d+)/i`). Les flags du litteral sont conserves ; l'extraction ajoute
automatiquement le flag global pour recuperer toutes les correspondances.

## Detection de langue

Les modules `Recherche`, `Auteur` et `Fiche` ont une section `Langue` separee. Elle peut combiner
trois sources :

- detection dans le titre, avec les marqueurs explicites comme `[EN]`, `(FR)`, `English`, `RAW`
- selecteur de langue classique, pour une metadonnee texte comme `English`
- selecteur de langue processed, pour une metadonnee non textuelle transformee ensuite

Dans `Auteur`, la configuration de langue peut etre copiee depuis `Recherche`, comme les selecteurs
de scraping. Cela copie aussi la table de correspondance du mode processed.

Pour le mode processed, la normalisation gere pour l'instant le modele 3hentai : une valeur ou une
classe comme `flag-eng` est convertie en `en`. Le selecteur peut donc etre un CSS comme
`.title@class` ou une regex comme `\bflag-([a-z]{2,4})\b`.

La section `Langue` peut aussi contenir une table de correspondance pour le mode processed. Chaque
ligne associe une valeur extraite a une langue, par exemple `flag-eng -> Anglais` ou
`translated -> Anglais`. Si la table contient au moins une ligne, le selecteur processed n'utilise
plus la detection automatique : il parcourt les valeurs extraites dans l'ordre et conserve la
premiere valeur presente dans la table. Cela permet de gerer les cas ou un selecteur CSS ou une regex
renvoie plusieurs classes ou metadonnees.

Les langues detectees sont exposees sur les cards et les fiches, puis affichees avec les memes
drapeaux compacts que dans la recherche multiple. Lors d'un ajout a la bibliotheque ou d'un
telechargement depuis une fiche, la premiere langue detectee sert de langue par defaut avant la
langue globale du scrapper.

Syntaxe supportee :

| Syntaxe | Effet |
| --- | --- |
| `.title a` | extrait le texte de l'element |
| `img` | extrait `src` par defaut si l'element est une image |
| `a@href` | extrait explicitement l'attribut `href` |
| `img@data-src` | extrait explicitement l'attribut `data-src` |
| `.node@content` | extrait l'attribut `content` |

Le separateur d'attribut est le dernier `@` de l'expression. Sans attribut explicite :

- un selecteur de valeur lit `src` sur une balise `IMG`
- un selecteur de valeur lit `textContent` sur les autres balises
- un selecteur d'URL lit `href` sur une balise `A`
- un selecteur d'URL lit `src` sur une balise `IMG`
- un selecteur d'URL lit `textContent` sinon

Les valeurs sont trimmees et les valeurs vides sont ignorees. Les URLs relatives sont resolues
contre l'URL finale du document charge.

Attention aux champs `srcset` : la valeur est extraite telle quelle, elle n'est pas decoupee en URLs
individuelles.

## Templates d'URL

Les templates remplacent des variables entre doubles accolades.

Par defaut, `{{variable}}` insere une valeur encodee avec `encodeURIComponent`. Quand une variante
brute existe, elle insere la valeur sans encodage. Pour les templates bases sur le contexte de
`Fiche`, la forme brute est `{{raw:variable}}`.

Si un template de contexte contient une variable non resolue, la construction de l'URL echoue.

### Variables de recherche

Utilisees par `Recherche` et par une partie du template `Auteur` :

| Variable | Valeur |
| --- | --- |
| `{{query}}`, `{{search}}`, `{{value}}` | requete encodee |
| `{{rawQuery}}`, `{{rawSearch}}`, `{{rawValue}}` | requete brute |
| `{{page}}` | numero de page 1-based |
| `{{page2}}`, `{{page3}}`, `{{page4}}` | page 1-based avec zero-padding |
| `{{pageIndex}}` | index de page 0-based |
| `{{pageIndex2}}`, `{{pageIndex3}}`, `{{pageIndex4}}` | index 0-based avec zero-padding |

### Variables simples de template

Utilisees par `Fiche` en mode template :

| Variable | Valeur |
| --- | --- |
| `{{value}}`, `{{id}}`, `{{slug}}` | valeur de test ou valeur runtime encodee |
| `{{rawValue}}`, `{{rawId}}`, `{{rawSlug}}` | valeur brute |

En runtime, `Fiche` et `Auteur` acceptent aussi une URL directe meme si le mode template est actif :
si la saisie ressemble a une URL, un chemin relatif ou une ancre, elle est resolue directement.

### Variables issues de Fiche

Quand `Fiche` a ete chargee ou validee, les modules `Auteur`, `Chapitres` et `Pages` peuvent
utiliser ce contexte :

| Variable | Valeur |
| --- | --- |
| `{{requestedUrl}}` | URL demandee pour charger la fiche |
| `{{finalUrl}}` | URL finale apres redirection, ou URL demandee si absente |
| `{{title}}` | titre extrait |
| `{{cover}}` | couverture extraite |
| `{{description}}` | description extraite |
| `{{authors}}` | auteurs extraits, joints par virgule + espace |
| `{{tags}}` | tags extraits, joints par virgule + espace |
| `{{status}}` | statut extrait |
| `{{pageCount}}` | nombre de pages extrait |
| `{{nomVariable}}` | variable derivee configuree dans `Fiche` |
| `{{raw:nomVariable}}` | meme valeur sans encodage |

`Chapitres` ajoute `{{chapterPage}}` pour paginer les listes de chapitres.

`Pages` ajoute :

| Variable | Valeur |
| --- | --- |
| `{{chapter}}` | URL du chapitre courant, si les pages sont liees aux chapitres |
| `{{page}}`, `{{page2}}`, `{{page3}}`, `{{page4}}` | page 1-based |
| `{{pageIndex}}`, `{{pageIndex2}}`, `{{pageIndex3}}`, `{{pageIndex4}}` | index 0-based |

## Reglages globaux

Les reglages globaux ne scrapent rien directement, mais modifient le comportement runtime du
scraper.

| Reglage | Role |
| --- | --- |
| `defaultTagIds` | tags ajoutes automatiquement aux mangas telecharges depuis ce scraper |
| `defaultLanguage` | langue appliquee aux mangas telecharges |
| `bookmark.excludedFields` | metadonnees a ne pas enregistrer dans les bookmarks |
| `chapterDownloads.autoAssignSeries` | rattache les telechargements de chapitre a une serie creee depuis le titre de la fiche |
| `homeSearch.enabled` | lance une recherche automatiquement a l'ouverture du scraper |
| `homeSearch.query` | requete utilisee pour cette recherche d'accueil, vide pour une recherche globale |

Les champs de bookmark excluables sont : `cover`, `summary`, `description`, `authors`, `tags`,
`mangaStatus`, `pageCount`.

## Module Recherche

`Recherche` construit une page de resultats depuis une requete utilisateur, puis extrait une liste de
cards.

### URL et requete

| Champ | Requis | Description |
| --- | --- | --- |
| `urlTemplate` | oui | URL ou chemin de recherche, avec les variables de recherche |
| `testQuery` | non | requete utilisee dans l'ecran de validation |
| `request.method` | non | `GET` par defaut, `POST` si le site attend un body |
| `request.bodyMode` | non | `form` ou `raw` en `POST` |
| `request.bodyFields` | si POST form | couples cle/valeur envoyes en `application/x-www-form-urlencoded` |
| `request.body` | si POST raw | body texte libre, utile pour JSON ou payload specifique |
| `request.contentType` | non | surcharge du `Content-Type`; en form, defaut `application/x-www-form-urlencoded;charset=UTF-8` |

Les variables de recherche sont appliquees a `urlTemplate` et, en `POST`, aux cles/valeurs du body ou
au body brut.

### Selecteurs

| Selecteur | Requis | Zone | Description |
| --- | --- | --- | --- |
| `resultListSelector` | non | document | limite la recherche a un ou plusieurs conteneurs |
| `resultItemSelector` | oui | conteneur ou document | detecte chaque card de resultat |
| `titleSelector` | oui | card | extrait le titre ; une card sans titre est ignoree |
| `detailUrlSelector` | non | card | extrait l'URL de fiche, necessaire pour ouvrir `Fiche` depuis une card |
| `authorUrlSelector` | non | card | extrait l'URL auteur, necessaire pour ouvrir `Auteur` directement depuis une card |
| `thumbnailSelector` | non | card | extrait l'image de miniature |
| `summarySelector` | non | card | extrait un resume court |
| `pageCountSelector` | non | card | extrait le nombre de pages affiche sur la card |
| `nextPageSelector` | non | document | extrait l'URL de page suivante |

Les resultats sont dedoublonnes par couple `detailUrl + title`.

### Validation et runtime

La validation reussit si au moins un titre est extrait. Les selecteurs optionnels sans resultat
remontent comme informations ou warnings, mais ne bloquent pas la validation.

Pour la pagination, deux modes existent :

- si `urlTemplate` contient une variable de page, la page suivante est reconstruite avec `pageIndex + 1`
- sinon, `nextPageSelector` est utilise

Si les deux sont presents, la pagination par template est prioritaire.

## Module Fiche

`Fiche` charge une page manga et extrait ses metadonnees. C'est le module central : `Chapitres`,
`Pages` et une partie de `Auteur` reutilisent ses URLs, champs et variables derivees.

### Construction de l'URL

| Champ | Requis | Description |
| --- | --- | --- |
| `urlStrategy` | oui | `result_url` ou `template` |
| `urlTemplate` | si template | pattern construit avec `{{value}}`, `{{id}}`, `{{slug}}` ou leurs variantes brutes |
| `testUrl` | validation en `result_url` | URL absolue, chemin relatif ou ancre utilisee pour tester |
| `testValue` | validation en `template` | valeur injectee dans le template de test |

En runtime, `result_url` ouvre l'URL issue de `Recherche`, d'un bookmark ou de la saisie directe.
En mode `template`, une saisie qui ressemble deja a une URL est ouverte directement ; sinon elle est
injectee dans le template.

### Selecteurs

| Selecteur | Requis | Description |
| --- | --- | --- |
| `titleSelector` | oui | titre de la fiche ; verification principale de la validation |
| `coverSelector` | non | couverture ; une image sans `@src` lit `src` par defaut |
| `descriptionSelector` | non | description longue |
| `authorsSelector` | non | auteurs ; plusieurs valeurs possibles, dedoublonnees |
| `authorUrlSelector` | non | liens auteur ; doit viser la meme logique d'ordre que `authorsSelector` |
| `tagsSelector` | non | tags ; plusieurs valeurs possibles, dedoublonnees |
| `statusSelector` | non | statut du manga |
| `pageCountSelector` | non | nombre de pages du manga |
| `thumbnailsListSelector` | non | conteneur optionnel des vignettes/pages visibles sur la fiche |
| `thumbnailsSelector` | non | vignettes extraites depuis le document ou depuis chaque conteneur |
| `thumbnailsNextPageSelector` | non | lien pour charger plus de vignettes |

Si `thumbnailsListSelector` ou `thumbnailsNextPageSelector` est renseigne, `thumbnailsSelector` est
obligatoire a l'enregistrement.

Les vignettes de `Fiche` servent a l'affichage et peuvent ouvrir le lecteur a une page donnee, mais
la liste definitive des pages lues ou telechargees vient toujours du module `Pages`.

### Variables derivees

Les variables derivees permettent d'extraire des valeurs personnelles reutilisables ensuite dans les
templates `Auteur`, `Chapitres` et `Pages`.

Regles de nommage :

- le nom est obligatoire des que la ligne est configuree
- il doit respecter `^[A-Za-z_][A-Za-z0-9_]*$`
- il doit etre unique dans la fiche
- il s'utilise ensuite avec `{{nomVariable}}` ou `{{raw:nomVariable}}`

Sources disponibles :

| Source | Champs requis | Comportement |
| --- | --- | --- |
| `field` | `sourceField` | reutilise un champ deja extrait : `title`, `cover`, `description`, `authors`, `tags`, `status`, `pageCount` |
| `selector` | `selector` | execute un selecteur personnalise sur la fiche |
| `requested_url` | aucun | utilise l'URL demandee |
| `final_url` | aucun | utilise l'URL finale, puis fallback sur l'URL demandee |
| `html` | `pattern` | applique une regex sur le HTML brut de la fiche |

La premiere valeur trouvee est utilisee. Si `pattern` est renseigne, il est applique sur cette
valeur source. Si la regex contient un groupe capture, le premier groupe est conserve ; sinon le
match complet est conserve.

Une regex est obligatoire pour la source `html`. Pour les autres sources, elle est optionnelle.

La validation de `Fiche` echoue si une variable configuree ne peut pas etre resolue, si son selecteur
est invalide, si sa regex est invalide ou si la regex ne matche pas.

Exemple :

```text
key: mangaId
sourceType: selector
selector: #cif .iw img@src
pattern: d_(\d+)
```

Avec une source qui contient `.../d_12345.jpg`, la variable `{{mangaId}}` vaut `12345`.

### Validation et runtime

La validation charge l'URL de test, parse le HTML, teste les selecteurs, extrait les variables
derivees et produit un apercu. Seul `titleSelector` est strictement requis pour que la fiche soit
valide ; les champs optionnels peuvent rester absents.

En runtime, une fiche est consideree exploitable si au moins un contenu est extrait : titre,
couverture, description, auteurs, tags, vignettes, statut ou nombre de pages.

## Module Auteur

`Auteur` charge une page auteur et extrait une liste de cards, avec le meme modele que `Recherche`.

### Construction de l'URL

| Champ | Requis | Description |
| --- | --- | --- |
| `urlStrategy` | oui | `result_url` ou `template` |
| `urlTemplate` | si template | URL auteur construite avec la valeur auteur, la pagination et/ou le contexte de `Fiche` |
| `testUrl` | validation en `result_url` | URL ou chemin de test |
| `testValue` | selon template | requis en validation si le template contient `{{value}}`, `{{rawValue}}`, `{{query}}` ou `{{rawQuery}}` |

En mode template, `Auteur` accepte les variables de recherche, les variables de pagination et le
contexte de `Fiche`. Si `Fiche` n'est pas validee, les variables issues de `Fiche` ne sont pas
disponibles dans l'ecran de test.

Depuis une fiche chargee en runtime, un clic auteur envoie aussi le contexte complet de la fiche au
module `Auteur`.

### Selecteurs

| Selecteur | Requis | Zone | Description |
| --- | --- | --- | --- |
| `resultListSelector` | non | document | limite la zone de parsing |
| `resultItemSelector` | oui | conteneur ou document | detecte chaque card |
| `titleSelector` | oui | card | titre de la card ; une card sans titre est ignoree |
| `detailUrlSelector` | non | card | URL de fiche pour ouvrir `Fiche` depuis la page auteur |
| `authorUrlSelector` | non | card | URL auteur si les cards exposent aussi un auteur |
| `thumbnailSelector` | non | card | miniature |
| `summarySelector` | non | card | resume |
| `pageCountSelector` | non | card | nombre de pages affiche sur la card |
| `nextPageSelector` | non | document | lien de page suivante |

L'ecran peut copier les selecteurs de `Recherche` pour accelerer une page auteur qui rend les memes
cards.

### Validation et runtime

La validation reussit si au moins un titre de card est extrait. La pagination fonctionne comme pour
`Recherche` : template de page en priorite, sinon `nextPageSelector`.

Le runtime peut ouvrir `Auteur` :

- depuis une URL auteur extraite par `Recherche`
- depuis une URL auteur extraite par `Fiche`
- depuis un nom d'auteur si `Auteur` est en mode template

## Module Chapitres

`Chapitres` extrait une liste de chapitres associes a une fiche manga. Il peut lire directement la
fiche ou construire une URL dediee a partir du contexte de `Fiche`.

### Source

| Champ | Requis | Description |
| --- | --- | --- |
| `urlStrategy` | oui | `details_page` pour lire la fiche, `template` pour charger une URL dediee |
| `urlTemplate` | si template | URL construite avec le contexte de `Fiche` |
| `templateBase` | en template | `scraper_base` ou `details_page` pour resoudre les URLs relatives |

La validation de `Chapitres` necessite une validation reussie de `Fiche`, car elle utilise son URL et
son contexte de variables. En runtime, le contexte vient de la fiche effectivement chargee.

Si `urlTemplate` contient `{{chapterPage}}`, le module charge automatiquement les pages de chapitres
successives jusqu'a une page sans nouveau chapitre exploitable. La limite par defaut est 100 pages.

### Selecteurs

| Selecteur | Requis | Zone | Description |
| --- | --- | --- | --- |
| `chapterListSelector` | non | document | limite la zone a une ou plusieurs listes de chapitres |
| `chapterItemSelector` | oui | liste ou document | detecte chaque bloc chapitre |
| `chapterUrlSelector` | oui | bloc chapitre | extrait l'URL du chapitre |
| `chapterLabelSelector` | oui | bloc chapitre | extrait le label affiche |
| `chapterImageSelector` | non | bloc chapitre | extrait une image de chapitre |
| `reverseOrder` | non | liste finale | inverse l'ordre apres extraction et dedoublonnage |

Un chapitre est conserve seulement si son URL et son label sont presents. Les chapitres sont
dedoublonnes par couple `url + label`. Les URLs et images relatives sont resolues contre l'URL du
document qui contient la liste.

### Validation et runtime

La validation reussit si au moins un chapitre est extrait. Les chapitres valides alimentent ensuite
le test du module `Pages` quand celui-ci est lie aux chapitres.

En runtime, les chapitres sont affiches sur la fiche. Si `Pages` est configure pour utiliser les
chapitres, chaque chapitre expose ses actions `Lecteur` et `Telecharger`.

## Module Pages

`Pages` resout la liste d'images a envoyer au lecteur ou au telechargement.

### Source

| Mode | Description | Dependances |
| --- | --- | --- |
| `details_page` | lit les images depuis le HTML de la fiche | `Fiche` |
| `chapter_page` | lit les images depuis le HTML du chapitre choisi | `Fiche` + `Chapitres` |
| `template` | construit une URL avec le contexte de `Fiche`, et optionnellement `{{chapter}}` | `Fiche`, plus `Chapitres` si lie aux chapitres |

Champs :

| Champ | Requis | Description |
| --- | --- | --- |
| `urlTemplate` | si template | URL de page, de lecteur HTML ou d'image directe |
| `templateBase` | en template | base de resolution des URLs relatives : `scraper_base` ou `details_page` |
| `linkedToChapters` | non | en mode template, rend `{{chapter}}` disponible et active les actions par chapitre |
| `pageImageSelector` | selon mode | selecteur des URLs d'images dans le HTML cible |

`pageImageSelector` est obligatoire en `details_page` et `chapter_page`. En `template`, il est
optionnel : s'il est absent, le template doit pointer directement vers une image.

### Extraction HTML

Quand `pageImageSelector` est renseigne :

1. le module charge la source cible
2. il parse le HTML
3. il extrait toutes les valeurs du selecteur
4. il transforme les URLs relatives en URLs absolues
5. il dedoublonne la liste

Ce mode convient aux pages qui contiennent deja des balises `img`, par exemple `#reader img@src` ou
`.page img@data-src`.

### Template vers image directe

Quand `pageImageSelector` est vide en mode `template`, le template doit repondre avec une ressource
dont le `content-type` commence par `image/`.

Cas possibles :

- template sans variable de page : une seule image est resolue
- template avec `{{page}}` ou `{{pageIndex}}` : le runtime incremente les pages jusqu'a la premiere
  reponse non image, avec une limite par defaut de 2000 pages

La validation de l'ecran ne teste que les 8 premieres pages directes pour l'apercu.

Si le template direct ne donne pas d'image au runtime, un fallback essaie de deduire une sequence
depuis la couverture de `Fiche` quand son URL finit par un nombre et une extension, par exemple
`/001.jpg`, `/002.jpg`, etc.

### Validation et runtime

La validation de `Pages` necessite une validation reussie de `Fiche`. Si les pages utilisent un
chapitre, elle necessite aussi une validation reussie de `Chapitres` et utilise le premier chapitre
valide comme chapitre de test.

La validation reussit si au moins une page est resolue. En runtime, cette liste sert directement au
lecteur en ligne, a la reprise de progression et au telechargement.

La meme resolution de pages sert aussi a l'ajout en bibliotheque sans telechargement. Dans ce mode,
le manga en bibliotheque reste lie au scraper, n'ecrit pas les pages sur disque et ouvre le lecteur
en rechargeant les pages depuis le runtime du scraper. Lors de l'ajout ou de la mise a jour, la
premiere image resolue est telechargee pour generer une miniature stockee localement.

## Ordre conseille de configuration

Pour une source HTML classique :

1. `Fiche` : commencer par obtenir un titre fiable, puis ajouter couverture, auteurs, tags et
   variables derivees.
2. `Recherche` : ajouter les cards et le lien fiche.
3. `Auteur` : optionnel, souvent en copiant les selecteurs de `Recherche`.
4. `Chapitres` : si le site a une lecture par chapitre.
5. `Pages` : brancher le lecteur et le telechargement.
6. Reglages globaux : tags, langue, bookmarks, recherche d'accueil.

Si le site ne propose pas de recherche utile, `Fiche` peut suffire pour ouvrir une URL ou une valeur
manuelle. Si le site ne propose pas de chapitres, `Pages` peut lire directement depuis la fiche ou
depuis un template non lie aux chapitres.

## Limites connues

- pas d'execution JavaScript cote site
- pas de configuration de cookies ou headers generiques, hors `POST` de recherche
- pas de parse dedie pour `srcset`
- pas de fallbacks multiples par selecteur
- pas de module API/JSON encore branche
- les sites avec anti-bot, rendu client obligatoire ou tokens dynamiques peuvent necessiter une
  evolution du runtime
