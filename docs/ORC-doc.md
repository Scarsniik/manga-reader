# Specification OCR - Reader Manga Helper

Date de mise a jour : 2026-03-31

## Statut du document

Ce document fixe la cible produit et technique de l'OCR pour Manga Helper.

Le premier jet actuellement branche dans le code existe deja, mais ce document decrit la direction voulue a moyen terme, pas seulement l'etat courant.

Pour la trace des iterations deja codees, voir aussi :

- [ORC-implementation-notes.md](/d:/Cacahouete/Manga-reader/manga-helper/docs/ORC-implementation-notes.md)

## Resume executif

Nous gardons l'idee produit de base :

- activer l'OCR dans le Reader
- afficher des zones detectees sur l'image
- permettre la selection d'une ou plusieurs zones
- envoyer le texte detecte dans `JapaneseAnalyse`

En revanche, la strategie de stockage et d'orchestration est maintenant la suivante :

- deux modes OCR : `a la volee` et `OCR complet du manga`
- une pipeline OCR japonaise de type `mokuro`
- un fichier OCR unique par manga, stocke dans le dossier du manga
- un petit cache applicatif possible en plus, mais uniquement comme acceleration
- une file d'attente globale cote Electron pour gerer les OCR longs
- une detection du japonais avant les traitements automatiques massifs
- une option pour appliquer automatiquement la langue `japonais` aux mangas detectes comme japonais

La source de verite ne doit donc plus etre le cache applicatif. La source de verite doit etre le fichier OCR du manga.

## Besoin produit

L'OCR doit etre solide sur les cas typiques des mangas japonais :

- texte vertical
- texte horizontal
- furigana
- texte sur fond illustre
- bulles irregulieres
- polices tres variees
- scans compresses ou de qualite moyenne
- pages avec beaucoup de petits blocs texte
- pages de titre ou pages decoratives plus difficiles

Le besoin principal n'est pas de faire une traduction automatique complete.

Le besoin principal est :

- extraire du texte japonais de facon fiable
- le rattacher a des zones cliquables
- permettre l'analyse lexicale ensuite
- conserver ce resultat pour eviter de retraiter les memes pages

## Decision technique recommandee

### Choix principal

Le choix recommande reste :

- detection des zones de texte via `comic-text-detector`
- reconnaissance du texte japonais via `manga-ocr`
- orchestration et logique de page inspirees de `mokuro`

Autrement dit :

- `manga-ocr` seul n'est pas suffisant comme pipeline complete
- `mokuro` est la meilleure base technique actuelle pour un OCR manga japonais robuste
- notre application n'a pas besoin du reader HTML de mokuro, seulement de sa pipeline OCR

### Pourquoi ce choix reste le bon

Cette chaine est aujourd'hui la plus coherente avec notre besoin reel :

- elle est specialisee manga japonais
- elle gere mieux le texte vertical et le furigana qu'un OCR generaliste
- elle est deja orientee blocs/ligne/page, donc compatible avec notre overlay
- elle permet de traiter une page a la volee ou un manga entier

## Modes de fonctionnement

### Mode 1 - OCR a la volee

Quand l'utilisateur ouvre un manga dans le Reader :

- la page courante est traitee en priorite
- les pages voisines peuvent etre preparees ensuite pour fluidifier la lecture
- le resultat OCR de chaque page est ecrit dans le fichier OCR du manga
- si la page existe deja dans le fichier OCR, on la relit au lieu de la recalculer

Important :

- `a la volee` ne veut pas dire `temporaire`
- `a la volee` veut dire `calcule au moment du besoin, puis persiste`

### Priorite de traitement en lecture

Le comportement cible pour la lecture est :

1. page actuelle
2. `x` pages suivantes
3. `x` pages precedentes
4. puis continuation par vagues jusqu'a la limite voulue

Exemple :

- page 40 ouverte
- OCR page 40
- puis 41 a 40 + x
- puis 39 a 40 - x
- puis 40 + x + 1 a 40 + 2x
- puis 40 - x - 1 a 40 - 2x

Ce comportement peut servir :

- soit comme simple confort de lecture autour de la page courante
- soit comme base d'un traitement progressif qui finit par couvrir tout le manga

### Mode 2 - OCR complet du manga

Ce mode prepare tout le manga, pas seulement les pages vues.

Deux declencheurs sont prevus :

- un bouton dans la bibliotheque pour lancer l'OCR complet d'un manga
- une option dans les parametres pour lancer automatiquement l'OCR a l'importation

Le resultat est ecrit dans le meme fichier OCR unique du manga.

Si un OCR existe deja pour ce manga, on n'ecrase pas silencieusement.

Un dialogue doit s'ouvrir avec des choix du type :

- `Ouvrir l'avancement`
- `Reprendre`
- `Relancer en ecrasant`
- `Annuler`

## Stockage et persistance

### Principe

La source de verite OCR doit etre stockee dans le dossier du manga.

La recommandation cible est :

```text
<dossier-du-manga>/.manga-helper.ocr.json
```

Il y a un seul fichier OCR par manga.

Le cache applicatif peut rester utile pour :

- accelerer certaines lectures immediates
- garder quelques pages chaudes en memoire
- eviter des relectures disque inutiles a court terme

Mais ce cache ne doit pas etre la base fonctionnelle du systeme.

### Contraintes de robustesse

Comme on veut un seul fichier par manga, il faut une ecriture robuste :

- ecriture incrementale
- sauvegarde atomique via fichier temporaire puis remplacement
- schema versionne
- reprise possible apres fermeture ou crash

Le fichier OCR doit pouvoir contenir :

- les metadonnees du manga
- la version du schema
- le moteur OCR utilise
- l'etat de progression global
- les pages deja faites
- les pages en erreur
- les indicateurs de langue detectee
- les parametres OCR importants

### Structure cible recommandee

Exemple logique :

```json
{
  "version": "manga-ocr-file-v1",
  "engine": "mokuro",
  "manga": {
    "id": "library-123",
    "title": "Example",
    "rootPath": "D:/Mangas/Example"
  },
  "languageDetection": {
    "status": "likely_japanese",
    "sampledPages": [3, 11, 27],
    "score": 0.94,
    "appliedLanguageTag": true
  },
  "progress": {
    "totalPages": 180,
    "completedPages": 52,
    "failedPages": 1,
    "lastProcessedPage": 53,
    "mode": "full_manga"
  },
  "pages": {
    "0001": {
      "status": "done",
      "width": 827,
      "height": 1170,
      "blocks": []
    },
    "0002": {
      "status": "pending"
    }
  }
}
```

Le contenu exact pourra evoluer, mais l'idee doit rester :

- un fichier
- des pages internes
- une progression persistante

## Detection du japonais avant OCR massif

### Pourquoi cette etape est necessaire

Nous ne voulons pas lancer automatiquement un OCR japonais complet sur :

- un manga non japonais
- un comic occidental
- un dossier melange
- des imports massifs non qualifies

Il faut donc une etape d'eligibilite avant les traitements automatiques lourds.

### Strategie recommandee

Avant un OCR automatique complet :

- echantillonner quelques pages du manga
- lancer un OCR rapide sur ces pages
- mesurer si le texte detecte ressemble majoritairement a du japonais

Signaux utiles :

- presence de hiragana
- presence de katakana
- presence de kanji
- ratio de caracteres japonais par rapport aux caracteres latins
- quantite minimale de texte utile detecte

Le resultat de cette detection doit donner un des etats suivants :

- `likely_japanese`
- `likely_non_japanese`
- `uncertain`

### Regle de lancement

- `likely_japanese` : autoriser le lancement automatique
- `likely_non_japanese` : ne pas lancer automatiquement
- `uncertain` : demander confirmation utilisateur

### Cas incertain

Si la detection est incertaine, l'application doit pouvoir ouvrir un dialogue montrant :

- quelques pages echantillons
- un resume tres court du diagnostic
- une action `Lancer quand meme`
- une action `Ne pas lancer`

## Auto-assignation de la langue japonaise

Quand un manga est detecte comme japonais pendant la phase OCR, l'application peut aussi lui appliquer automatiquement la langue `japonais`.

Ce comportement doit etre controle par un parametre utilisateur :

- `Activer la langue japonaise automatiquement pour les mangas detectes comme japonais`

Comportement recommande :

- active par defaut si l'OCR japonais global est active
- desactivable dans les parametres

Regle :

- on ne modifie pas la langue du manga si la detection est `likely_non_japanese`
- on ne la modifie pas automatiquement si la detection est `uncertain`
- si la detection est `likely_japanese`, on peut appliquer le tag langue automatiquement si l'option est active

Cette auto-assignation doit etre tracee dans le fichier OCR du manga pour savoir :

- si la langue a ete detectee
- si elle a ete appliquee automatiquement
- sur quelle base

## Actions utilisateur prevues

### Bouton OCR dans la bibliotheque

Chaque manga doit pouvoir exposer une action OCR dans la bibliotheque.

Cas 1 :

- pas de fichier OCR present
- l'action lance l'OCR complet du manga

Cas 2 :

- un fichier OCR existe deja
- l'action ouvre un dialogue

Choix recommandes :

- `Voir l'avancement`
- `Reprendre`
- `Relancer en ecrasant`
- `Annuler`

### Bouton d'avancement OCR

L'application doit aussi proposer un bouton dedie a l'avancement OCR global.

Quand l'utilisateur clique dessus, il doit voir :

- la file d'attente OCR
- chaque manga en file
- l'etat de chaque manga
- la progression par manga
- l'eventuelle page en cours

Et depuis cette vue, il faut aussi pouvoir lancer un OCR massif sur la bibliotheque entiere.

### Action `OCR toute la bibliotheque`

Depuis le panneau d'avancement, un bouton doit ouvrir un popup avec au minimum deux choix :

- `Seulement les mangas sans OCR`
- `Refaire une passe complete en ecrasant`

Comportement recommande :

- appliquer d'abord la detection du japonais pour les lancements automatiques
- ne pas lancer aveuglement les mangas detectes `likely_non_japanese`
- demander confirmation si certains mangas restent `uncertain`

## File d'attente OCR

### Principe

La file d'attente OCR doit vivre cote Electron main process, pas seulement dans le renderer.

Raisons :

- la bibliotheque peut lancer plusieurs OCR de mangas
- l'import peut ajouter plusieurs mangas d'un coup
- la lecture ne doit pas perdre l'etat de la file a chaque changement d'ecran
- il faut pouvoir suivre la progression globalement

### Granularite

La bonne unite de file est :

- un job par manga

Chaque job peut contenir :

- le mode `on_demand`
- ou le mode `full_manga`
- l'etat de detection de langue
- la progression par page

### Etats recommandes

Chaque job manga doit pouvoir etre dans un etat du type :

- `queued`
- `detecting_language`
- `running`
- `paused`
- `completed`
- `error`
- `cancelled`

### Gestion des imports multiples

Point important :

- un import massif peut ajouter plusieurs mangas a la fois

Le systeme doit donc :

- empiler les jobs proprement
- eviter les doublons pour un meme manga
- reouvrir le bon dialogue si un OCR existe deja
- separer les jobs interactifs de lecture des jobs longs de bibliotheque

### Priorites recommandees

Pour garder une bonne UX :

- priorite haute pour l'OCR interactif du Reader
- priorite basse ou normale pour l'OCR complet de fond

La version simple a viser d'abord est :

- un seul manga traite a la fois pour les jobs lourds
- mais avec possibilite de petites taches interactives prioritaires

## Contrat de donnees OCR

Le renderer actuel est deja aligne avec un contrat simple.

Nous devons conserver cette simplicite cote UI, tout en gardant un format plus riche dans le fichier OCR du manga.

### Contrat backend riche recommande

```ts
type OcrLine = {
  text: string;
  polygon?: Array<[number, number]>;
};

type OcrBlock = {
  id: string;
  text: string;
  bboxPx: { x1: number; y1: number; x2: number; y2: number };
  bbox: { x: number; y: number; w: number; h: number };
  vertical: boolean;
  fontSize?: number;
  lines: OcrLine[];
  confidence?: number | null;
};

type OcrPageEntry = {
  status: "pending" | "done" | "error";
  width?: number;
  height?: number;
  blocks?: OcrBlock[];
  errorMessage?: string;
};

type MangaOcrFile = {
  version: string;
  engine: "mokuro";
  progress: {
    totalPages: number;
    completedPages: number;
    failedPages: number;
    lastProcessedPage?: number;
    mode?: "on_demand" | "full_manga";
  };
  pages: Record<string, OcrPageEntry>;
};
```

### Contrat minimal compatible renderer

```ts
type Box = {
  id: string;
  text: string;
  bbox: { x: number; y: number; w: number; h: number };
  vertical?: boolean;
  lines?: string[];
};

type OcrRecognizeResult = {
  engine: "mokuro";
  width: number;
  height: number;
  boxes: Box[];
  page?: OcrPageEntry;
  fromCache?: boolean;
};
```

### Regle de normalisation

Depuis la sortie de mokuro :

- `block.box = [x1, y1, x2, y2]`
- `text = block.lines.join("")` par defaut
- `bbox.x = x1 / img_width`
- `bbox.y = y1 / img_height`
- `bbox.w = (x2 - x1) / img_width`
- `bbox.h = (y2 - y1) / img_height`

## Architecture cible

### Vue d'ensemble

Chaine cible :

1. Le Reader ou la Bibliotheque demande un OCR de page ou un OCR manga.
2. Electron verifie d'abord le fichier OCR du manga.
3. Si la page existe deja, Electron renvoie le resultat normalise.
4. Sinon, Electron envoie la requete a un worker Python persistant.
5. Le worker execute la pipeline de type mokuro.
6. Electron normalise le resultat.
7. Electron ecrit le resultat dans le fichier OCR du manga.
8. Electron met a jour la progression du job si besoin.
9. Le renderer affiche les boxes ou l'avancement.

### Pourquoi un worker Python persistant

Le pire design serait :

- lancer un processus Python complet a chaque clic OCR

Ce design ajoute :

- temps de demarrage
- rechargement des modeles
- experience lente

Le design recommande est :

- un processus Python demarre une fois
- communication simple via `stdin/stdout` en JSON
- modeles gardes en memoire tant que l'application tourne

### Separation des responsabilites

Le systeme doit bien distinguer :

- OCR
- stockage OCR
- file d'attente OCR
- analyse lexicale
- traduction

`JapaneseAnalyse` ne doit pas etre responsable du succes ou de l'echec de l'OCR.

Si JPDB est indisponible :

- le texte OCR doit quand meme s'afficher
- l'utilisateur doit pouvoir le corriger
- le message d'erreur doit parler d'analyse ou de traduction, pas d'OCR

## Integration cible dans ce repo

### Cote Electron

Les points d'integration principaux sont :

- `src/electron/handlers/ocr.ts` pour le worker et la normalisation
- un futur gestionnaire de file OCR dans le main process
- la persistance du fichier OCR dans le dossier du manga
- la detection du japonais avant les jobs automatiques massifs

### Cote preload / IPC

L'API existante peut evoluer vers des appels du type :

```ts
window.api.ocrRecognize(imagePath, options?)
window.api.ocrStartManga(mangaId, options?)
window.api.ocrQueueStatus()
window.api.ocrStartLibrary(options?)
window.api.ocrPauseJob(mangaId)
window.api.ocrResumeJob(mangaId)
```

### Cote renderer

Le Reader reste focalise sur :

- afficher les boxes
- permettre la selection
- lancer ou relancer la page courante

La Bibliotheque et le panneau d'avancement doivent porter :

- lancement OCR manga
- lancement OCR bibliotheque
- affichage de la file
- affichage de la progression

### Parametres a prevoir

Parametres produit recommandes :

- activer/desactiver l'OCR japonais
- nombre de pages prechargees autour de la page courante
- lancer l'OCR complet a l'importation
- appliquer automatiquement la langue japonaise si detectee
- comportement par defaut si un fichier OCR existe deja

## Risques et mitigations

### Risque 1 - Latence trop elevee

Mitigation :

- worker persistant
- priorite a la page courante
- petit cache memoire/applicatif
- prechauffage du moteur OCR au demarrage

### Risque 2 - Ecriture du fichier OCR trop fragile

Mitigation :

- ecriture atomique
- schema versionne
- progression persistante
- reprise apres fermeture

### Risque 3 - Mauvaise qualite sur certaines pages

Mitigation :

- filtrage des faux positifs
- relance OCR
- traitement special de certains gros blocs
- correction manuelle du texte

### Risque 4 - Lancement automatique sur des mangas non japonais

Mitigation :

- detection prealable par echantillonnage
- etat `uncertain`
- dialogue utilisateur avant lancement

### Risque 5 - File d'attente mal geree lors des imports multiples

Mitigation :

- file centrale dans le main process
- deduplication par manga
- priorites explicites
- suivi visuel de la progression

## Roadmap recommandee

### Phase 1 - Premier jet integre

- worker Python persistant
- OCR page par page dans le Reader
- prechauffage du moteur
- pre-render autour de la page courante

### Phase 2 - Stockage cible par manga

- remplacer la source principale de cache par le fichier OCR du manga
- ecrire les pages OCR au fil de l'eau dans ce fichier
- garder le cache applicatif seulement comme acceleration

### Phase 3 - Detection du japonais et auto-langue

- echantillonnage de pages
- score de langue
- dialogue en cas d'incertitude
- option d'auto-assignation de la langue japonaise

### Phase 4 - OCR complet et file d'attente

- bouton OCR par manga dans la bibliotheque
- dialogue si OCR deja present
- file d'attente globale
- panneau d'avancement OCR

### Phase 5 - OCR sur toute la bibliotheque

- bouton `OCR toute la bibliotheque`
- popup avec choix `sans OCR seulement` ou `reecraser tout`
- bonne gestion des imports multiples

## Conclusion

La bonne decision n'est pas seulement `manga-ocr ou pas manga-ocr`.

La bonne decision est :

- utiliser `manga-ocr` comme moteur de reconnaissance
- l'integrer dans une vraie pipeline de detection de texte manga
- faire du fichier OCR du manga la source de verite
- garder le cache applicatif comme acceleration legere
- gerer les OCR longs via une vraie file d'attente produit

L'objectif final est un systeme ou :

- le Reader reste fluide
- l'OCR est persistant
- la Bibliotheque peut lancer des traitements massifs
- la langue japonaise peut etre deduite et appliquee intelligemment
- l'utilisateur garde toujours le controle quand la detection est incertaine

## References

- `manga-ocr` : https://github.com/kha-white/manga-ocr
- `mokuro` : https://github.com/kha-white/mokuro
- `comic-text-detector` : https://github.com/dmMaze/comic-text-detector
- `PaddleOCR` : https://www.paddleocr.ai/
- `Tesseract` : https://tesseract-ocr.github.io/tessdoc/
