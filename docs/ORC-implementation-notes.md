# Notes d'implementation OCR - premier jet

Date : 2026-03-31

## Objectif de ce premier jet

Ce premier jet ne cherche pas encore a livrer un OCR "tout-en-un" parfaitement packagé dans l'application portable.

L'objectif est :

- de brancher une vraie pipeline OCR depuis Electron
- de garder l'UI actuelle du reader
- de mettre en place un cache local
- de valider la faisabilite technique avec `mokuro` + `manga-ocr`
- de laisser une base propre pour une future integration completement embarquee

## Ce qui a ete ajoute

### 1. Worker Python OCR

Fichier ajoute :

- [ocr_worker.py](/d:/Cacahouete/Manga-reader/manga-helper/scripts/ocr_worker.py)

Role :

- recevoir des requetes JSON en entree standard
- initialiser `mokuro.manga_page_ocr.MangaPageOcr`
- traiter une image
- renvoyer le resultat OCR brut en JSON

Le worker sait :

- chercher des repos OCR locaux via des chemins candidats
- reutiliser `mokuro` et `manga-ocr` locaux si presents
- renvoyer des erreurs detaillees si l'environnement Python n'est pas pret

### 2. Handler Electron OCR reel

Fichier remplace :

- [ocr.ts](/d:/Cacahouete/Manga-reader/manga-helper/src/electron/handlers/ocr.ts)

Role :

- resoudre un chemin image depuis `local://`, `file://` ou `data:image/...`
- demarrer un worker Python persistant
- utiliser un cache JSON par page
- normaliser la sortie de mokuro vers le format attendu par le reader
- exposer une vraie implementation pour `ocrRecognize`

### 3. Reglages applicatifs OCR

Fichiers modifies :

- [params.ts](/d:/Cacahouete/Manga-reader/manga-helper/src/electron/handlers/params.ts)
- [SettingsModalContent.tsx](/d:/Cacahouete/Manga-reader/manga-helper/src/renderer/components/Modal/modales/SettingsModalContent.tsx)

Champs ajoutes :

- `ocrPythonPath`
- `ocrRepoPath`
- `ocrForceCpu`

Ces champs servent de secours si l'auto-detection ne suffit pas.

### 4. Correction du fallback mock dans le Reader

Fichier modifie :

- [Reader.tsx](/d:/Cacahouete/Manga-reader/manga-helper/src/renderer/components/Reader/Reader.tsx)

Correction :

- le fallback mock reste autorise en dev front-only
- mais un vrai resultat vide venant d'Electron n'est plus automatiquement remplace par le mock

### 5. Ajustements UX Reader OCR

Fichiers modifies :

- [Reader.tsx](/d:/Cacahouete/Manga-reader/manga-helper/src/renderer/components/Reader/Reader.tsx)
- [ImageViewer.tsx](/d:/Cacahouete/Manga-reader/manga-helper/src/renderer/components/Reader/ImageViewer.tsx)
- [OcrPanel.tsx](/d:/Cacahouete/Manga-reader/manga-helper/src/renderer/components/Reader/OcrPanel.tsx)
- [ocr-panel.scss](/d:/Cacahouete/Manga-reader/manga-helper/src/renderer/components/Reader/ocr-panel.scss)
- [ocr.ts](/d:/Cacahouete/Manga-reader/manga-helper/src/electron/handlers/ocr.ts)

Corrections ajoutees apres les premiers tests dans l'application :

- relance automatique de l'OCR quand on change de page si le panneau OCR est actif
- petit cache memoire cote reader pour plusieurs pages deja lues
- deduplication des requetes OCR d'une meme page pour eviter les doubles traitements quand l'affichage et le pre-rendu se chevauchent
- filtrage des boxes vides cote renderer
- filtrage des blocs vides cote backend avant mise en cache
- suppression du texte affiche dans les rectangles de detection
- alignement du panneau OCR au niveau de la zone image au lieu d'un positionnement fixe trop haut
- ajout d'un leger debordement du rectangle affiche autour de la box OCR pour qu'il colle moins au texte reconnu, sans dessiner un deuxieme cadre
- pre-rendu OCR sequentiel base sur `readerPreloadPageCount`, dans l'ordre page courante puis pages suivantes puis pages precedentes
- cache memoire OCR ajuste selon `readerPreloadPageCount` pour garder plus de pages chaudes lors des allers-retours
- enrichissement des metadonnees OCR backend pour chaque bloc : angle, langue, score de masque, aspect ratio
- filtrage conservateur des faux positifs evidents sur les pages compliquees
- passage du schema de cache OCR a `mokuro-page-v2` pour forcer le recalcul avec le nouveau filtrage
- le bouton `Relancer` force maintenant un nouveau calcul OCR backend au lieu de relire le cache disque
- filtrage supplementaire des petits fragments `unknown` melangeant ponctuation et tres peu de vrai texte
- passage du schema de cache OCR a `mokuro-page-v3` pour forcer le recalcul avec ces nouveaux reglages
- le panneau OCR peut maintenant afficher d'ou vient le resultat : cache disque, cache memoire reader, ou recalcul backend
- tentative automatique de recuperation des gros blocs mono-ligne tronques via extension guidee par `mask_refined`, puis re-OCR avec le meme chunking que la pipeline standard
- passage du schema de cache OCR a `mokuro-page-v4` pour forcer le recalcul avec cette tentative de recuperation

Le filtrage ajoute ne cherche pas encore a "comprendre" toute la page. Il retire surtout les cas les plus suspects :

- texte tres charge en ponctuation sans vrai contenu lexical
- longues suites du meme caractere
- segments de texte repetes plusieurs fois dans un meme bloc
- densite de texte reconnue incoherente par rapport a la taille de la box et a la taille de police estimee
- faible couverture du masque texte pour les petits blocs qui renvoient quand meme un texte long

### 6. Packaging de base du script Python

Fichier modifie :

- [package.json](/d:/Cacahouete/Manga-reader/manga-helper/package.json)

Changement :

- ajout de `scripts/**/*` dans les fichiers inclus au packaging

Important :

- cela inclut le script Python
- cela n'inclut pas encore un runtime Python embarque ni les dependances OCR

## Ce qui a ete fait hors du repo applicatif

Pour disposer d'une base locale a jour de reference, les copies suivantes ont ete clonees :

- `D:\Cacahouete\projects\Manga OCR\manga-ocr-upstream`
- `D:\Cacahouete\projects\Manga OCR\mokuro-upstream`

En plus :

- le sous-module `comic_text_detector` de `mokuro-upstream` a ete initialise

Cela a servi a verifier qu'on pouvait charger la vraie pipeline localement.

## Ce qui a ete teste

### Tests de build

Commandes passees avec succes :

- `npm run build:electron`
- `npm run prestart`
- `npm run build`

Resultat :

- la partie TypeScript/Electron compile
- le build renderer passe aussi

### Test du worker Python

Commande de ping testee avec succes :

- le worker repond bien en JSON

Test OCR reel realise sur un exemple local :

- l'initialisation de `mokuro`
- le chargement de `manga-ocr`
- l'execution OCR
- la serialisation du resultat
- le renvoi des metadonnees supplementaires de bloc

Resultat :

- la chaine locale fonctionne deja en CPU sur la machine actuelle

Exemple de resultat obtenu :

- blocs detectes
- orientation verticale/horizontale
- texte OCR reconnu

## Etat actuel du premier jet

### Ce qui est deja en place

- tuyau Electron -> Python
- worker persistant
- cache local OCR
- pre-rendu OCR sequentiel des pages en avance depuis le reader
- normalisation du resultat
- configuration minimale dans les settings
- base documentaire pour le choix technique

### Ce qui manque encore

- integration utilisateur complete testee directement depuis l'application Electron en lecture reelle
- meilleure gestion des erreurs cote UI
- bouton de pre-rendu
- edition manuelle des resultats OCR
- invalidation de cache plus fine
- packaging complet du runtime Python et des dependances

## Reponse claire a la question "externe ou integre ?"

### Aujourd'hui, dans ce premier jet

L'approche est :

- application Electron
- worker Python externe
- dependances Python disponibles sur la machine

Donc aujourd'hui, ce n'est pas encore un vrai "tout-en-un" autonome.

### Direction cible

La direction reste bien :

- OCR integre a l'application
- sans demander a l'utilisateur final d'installer Python a cote

Mais cela correspond a une phase suivante de packaging et d'embarquement du runtime.

## Comment utiliser ce premier jet

### Logique de pre-rendu OCR actuelle

Quand le panneau OCR est actif :

- la page courante est chargee en priorite
- puis le reader prepare l'OCR des pages suivantes dans l'ordre
- puis le reader prepare aussi l'OCR des pages precedentes
- le nombre de pages preparees de chaque cote suit `readerPreloadPageCount`
- les resultats prepares sont gardes en memoire et en cache disque

Exemple :

- si `readerPreloadPageCount = 3`
- le reader tente de garder pretes la page courante, puis les 3 pages suivantes, puis les 3 pages precedentes
- l'ordre de traitement est strictement sequentiel

### Cas ideal

- Python disponible
- dependances OCR installees ou accessibles
- repo OCR local detecte automatiquement

### Cas de secours

Si l'auto-detection ne fonctionne pas :

- renseigner `ocrPythonPath` dans les settings
- renseigner `ocrRepoPath` dans les settings
- activer `ocrForceCpu` si besoin

## Limitations connues

- le runtime Python n'est pas embarque
- PyTorch et les dependances OCR ne sont pas encore gerees par l'installeur de l'application
- le choix des chemins OCR repose encore sur l'auto-detection ou sur les settings manuels
- ce premier jet privilegie la validation technique plutot que la distribution finale

## Suite logique recommandee

1. tester l'OCR depuis le reader sur de vraies pages de manga dans l'app
2. corriger les points de friction UX
3. ajouter prefetch et pre-rendu optionnel
4. stabiliser la configuration utilisateur
5. seulement ensuite, travailler le vrai mode tout-en-un embarque
