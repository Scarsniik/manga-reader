# Spécification OCR — Reader Manga Helper

Date de mise à jour : 2026-03-31

## Statut du document

Ce document remplace l'ancien mock OCR.

Le but n'est plus seulement de décrire l'UI, mais de fixer :

- le besoin produit
- le choix technique recommandé
- les alternatives écartées
- le contrat de données entre backend OCR et renderer
- la stratégie d'intégration dans l'application Electron actuelle

Le choix n'est pas juridiquement "figé", mais c'est la direction recommandée à ce stade.

## Résumé exécutif

Nous conservons l'idée produit de l'ancien document :

- activer l'OCR dans le Reader
- afficher des zones détectées par-dessus la page
- permettre la sélection d'une ou plusieurs zones
- envoyer le texte détecté dans `JapaneseAnalyse`

En revanche, le moteur OCR visé doit être clarifié.

### Décision recommandée

Pour obtenir un OCR solide sur des mangas japonais, la solution recommandée est :

- détection des zones de texte via `comic-text-detector`
- reconnaissance du texte japonais via `manga-ocr`
- orchestration et format de sortie inspirés de `mokuro`

Autrement dit :

- `manga-ocr` seul n'est pas suffisant comme pipeline complète de page
- `mokuro` est la meilleure base technique pour intégrer un OCR manga japonais robuste
- notre application ne doit pas intégrer le reader HTML de mokuro, seulement sa pipeline OCR et son format logique

### Mode de fonctionnement recommandé

Le mode recommandé pour l'application est hybride :

- par défaut : OCR à la volée, page par page
- avec cache local obligatoire
- avec possibilité de pré-rendu optionnel en arrière-plan ou à la demande

Ce mode donne le meilleur compromis entre confort utilisateur et complexité raisonnable.

## Contexte et constat sur l'état actuel du projet

L'ancien document partait d'une bonne intuition UX, mais il restait ambigu sur le moteur OCR réel.

Dans l'état actuel du repo :

- le reader sait déjà afficher un panneau OCR et des boxes mockées
- le contrat UI actuel attend essentiellement des objets `{ id, text, bbox }`
- le backend Electron OCR est aujourd'hui un stub
- le renderer retombe sur un mock si rien n'est renvoyé

Conséquence :

- l'interface peut donner l'impression que "l'OCR existe"
- mais l'intégration OCR réelle n'est pas en place

Le point le plus important à retenir est le suivant :

- `manga-ocr` est un excellent moteur de reconnaissance japonaise pour le manga
- mais ce n'est pas, à lui seul, un détecteur complet de zones sur page entière

Pour un manga japonais, il faut une chaîne spécialisée, pas un OCR générique posé directement sur la page complète.

## Besoin produit

L'OCR doit être solide sur les cas typiques des mangas japonais :

- texte vertical
- texte horizontal
- furigana
- texte sur fond illustré
- bulles irrégulières
- polices très variées
- scans compressés ou de qualité moyenne
- pages avec beaucoup de petits blocs texte

Le besoin principal n'est pas de faire de la traduction automatique "magique".

Le besoin principal est :

- extraire du texte japonais de façon fiable
- le rattacher à des zones cliquables
- permettre l'analyse lexicale ensuite

## Exigences fonctionnelles

### Expérience utilisateur

- Quand l'utilisateur active l'OCR dans le Reader, le panneau OCR s'ouvre.
- La page courante est analysée.
- Les zones détectées apparaissent sur l'image.
- L'utilisateur peut sélectionner une ou plusieurs zones.
- `JapaneseAnalyse` affiche le texte sélectionné.
- L'utilisateur peut corriger manuellement le texte si nécessaire.

### Exigences techniques

- L'OCR doit fonctionner en priorité hors-ligne après installation des dépendances et téléchargement des modèles.
- Le texte détecté doit être rattaché à des boîtes exploitables dans le renderer.
- Les résultats doivent être mis en cache.
- Le système doit supporter le retraitement d'une page quand le cache est invalide.
- L'échec de JPDB ne doit jamais être confondu avec un échec OCR.

## Évaluation des options

### Option 1 — `manga-ocr` seul

Description :

- utiliser directement `manga-ocr` sur l'image reçue

Avantages :

- excellent OCR japonais spécialisé manga
- gère bien le texte multi-lignes
- robuste sur furigana, texte vertical, texte sur image

Limites :

- ne résout pas la détection complète des zones texte sur page entière
- ne fournit pas naturellement le contrat final attendu par le reader
- pousser `manga-ocr` sur une page entière est une mauvaise hypothèse de départ

Verdict :

- très bonne brique de reconnaissance
- mauvais choix comme solution complète

### Option 2 — `mokuro` en interne

Description :

- utiliser la pipeline interne de `mokuro`
- `comic-text-detector` pour localiser les blocs texte
- `manga-ocr` pour reconnaître le contenu de chaque bloc/ligne

Avantages :

- pipeline spécialisée manga japonais
- format de sortie déjà structuré par page
- gestion de cache déjà pensée dans le projet amont
- possibilité de traitement page par page ou volume par volume
- bien aligné avec notre besoin d'overlay et de sélection

Limites :

- plus lourd à embarquer qu'un simple appel JS
- dépendance Python
- nécessite un worker persistant si on veut un mode "à la volée" fluide

Verdict :

- meilleur choix actuel

### Option 3 — `PaddleOCR` seul

Description :

- utiliser un moteur OCR généraliste moderne qui détecte et reconnaît directement le texte

Avantages :

- pipeline plus simple conceptuellement
- boîtes + texte + confiance souvent disponibles directement
- progrès récents sur le japonais et le texte vertical

Limites :

- moins spécialisé manga que la chaîne `comic-text-detector + manga-ocr`
- risque supérieur sur furigana, bruit visuel, styles manga

Verdict :

- bon plan B
- pas le choix principal tant que la priorité reste "manga japonais robuste"

### Option 4 — `Tesseract`

Description :

- OCR classique avec modèles japonais

Avantages :

- connu
- local
- léger à comparer à certaines solutions deep learning

Limites :

- moins robuste sur les cas manga difficiles
- très mauvais candidat comme base principale pour ce projet

Verdict :

- à écarter comme moteur principal

## Choix technique retenu

### Choix principal

Le choix recommandé est :

- pipeline `mokuro`
- mais intégrée à notre application
- sans embarquer le reader HTML de mokuro

Plus précisément, nous voulons réutiliser ou reproduire cette logique :

1. chargement image
2. détection des blocs texte
3. OCR japonais des zones
4. résultat structuré par page
5. normalisation vers le contrat UI de Manga Helper

### Ce que nous gardons de notre doc initial

- activation OCR depuis `ReaderHeader`
- panneau OCR à droite
- zones cliquables sur l'image
- sélection multiple
- envoi du texte vers `JapaneseAnalyse`

### Ce que nous changeons

- le backend OCR n'est plus pensé comme un simple `manga-ocr(image entière)`
- nous introduisons une vraie pipeline page
- nous ajoutons un cache local
- nous distinguons clairement OCR, analyse JPDB, et éventuelle traduction

## Architecture cible

### Vue d'ensemble

Chaîne recommandée :

1. Le renderer demande l'OCR de la page courante.
2. Electron regarde si un cache valide existe.
3. Si oui, il renvoie immédiatement le résultat normalisé.
4. Sinon, Electron envoie la requête à un worker Python persistant.
5. Le worker charge ou réutilise les modèles.
6. Le worker exécute la pipeline de type mokuro sur la page.
7. Electron normalise le résultat et l'écrit en cache.
8. Le renderer reçoit les boxes et les affiche.

### Pourquoi un worker Python persistant

Le pire design serait :

- lancer un processus Python complet à chaque clic OCR

Ce design ajoute :

- temps de démarrage
- rechargement des modèles
- expérience lente

Le design recommandé est :

- un processus Python démarré une fois
- communication simple via `stdin/stdout` en JSON
- modèles gardés en mémoire tant que l'application tourne

### Pourquoi un cache local est obligatoire

Même en mode "à la volée", le cache n'est pas une optimisation facultative.

Le cache est nécessaire pour :

- éviter de retraiter une page déjà vue
- rendre l'app agréable sur CPU
- permettre une réouverture quasi instantanée des pages déjà analysées
- préparer un pré-rendu discret en arrière-plan

## Mode à la volée vs pré-rendu

### Recommandation produit

Le mode recommandé est :

- OCR à la volée lors de la première ouverture d'une page
- puis cache
- puis préfetch éventuel des pages voisines

### Pré-rendu

Le pré-rendu doit rester possible, mais comme option :

- préparer tout le volume
- préparer le chapitre courant
- préparer les N pages suivantes

Ce mode est utile :

- pour les machines lentes
- pour les sessions de lecture longues
- pour réduire l'attente pendant la navigation

### Stratégie hybride recommandée

- ouverture page : OCR si cache absent
- navigation : lecture du cache si présent
- arrière-plan : pré-analyse des 1 à 3 pages suivantes
- action utilisateur optionnelle : "Préparer l'OCR du manga" ou "Préparer l'OCR du chapitre"

## Contrat de données

Le renderer actuel est déjà aligné avec un contrat simple.

Nous devons conserver cette simplicité côté UI, mais accepter un format plus riche côté backend.

### Contrat backend riche recommandé

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

type OcrPageResult = {
  version: string;
  engine: "mokuro";
  source: {
    imagePath: string;
    width: number;
    height: number;
  };
  fromCache: boolean;
  blocks: OcrBlock[];
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
  page?: OcrPageResult;
  fromCache?: boolean;
};
```

### Règle de normalisation

Depuis la sortie de mokuro :

- `block.box = [x1, y1, x2, y2]`
- `text = block.lines.join("")` par défaut
- `bbox.x = x1 / img_width`
- `bbox.y = y1 / img_height`
- `bbox.w = (x2 - x1) / img_width`
- `bbox.h = (y2 - y1) / img_height`

### Texte d'une zone

Le texte affiché dans le reader doit être :

- `block.lines.join("")` par défaut

Option possible plus tard :

- `block.lines.join("\n")` pour mieux préserver la structure visuelle dans certains cas

## Exemple de résultat normalisé

```json
{
  "engine": "mokuro",
  "width": 827,
  "height": 1170,
  "fromCache": true,
  "boxes": [
    {
      "id": "p000-b000",
      "text": "あたしはナナ！！５さい！",
      "bbox": { "x": 0.856, "y": 0.074, "w": 0.076, "h": 0.162 },
      "vertical": true,
      "lines": ["あたしはナナ！！", "５さい！"]
    }
  ]
}
```

## Cache

### Principe

Le cache doit être géré côté application, pas seulement laissé à l'amont.

### Recommandation

Stocker un JSON par page OCR dans un dossier applicatif dédié, par exemple :

```text
<app-data>/ocr-cache/<manga-id-or-hash>/<page-key>.json
```

La clé de cache doit dépendre au minimum de :

- chemin absolu de l'image
- taille du fichier
- date de modification
- version moteur OCR
- paramètres OCR importants

### Pourquoi ne pas stocker uniquement à côté des images

Écrire à côté des images du manga peut être pratique, mais présente plusieurs limites :

- certains dossiers peuvent être en lecture seule
- cela mélange données utilisateur et données d'application
- cela complique la portabilité

À court terme, le cache applicatif est plus sûr.

## Détails d'intégration dans ce repo

### Côté Electron

Le fichier à remplacer en priorité est :

- `src/electron/handlers/ocr.ts`

Il doit :

- vérifier le cache
- lancer ou réutiliser le worker Python
- récupérer le résultat brut
- normaliser la sortie
- renvoyer `{ boxes, ... }` au renderer

### Côté preload / IPC

L'API existante peut être conservée :

```ts
window.api.ocrRecognize(imagePathOrDataUrl)
```

Mais le résultat renvoyé doit devenir réel et non plus mocké.

Extensions utiles possibles :

- `window.api.ocrRecognize(imagePath, options?)`
- `window.api.ocrPrefetch(imagePaths[])`
- `window.api.ocrClearCache(mangaId?)`
- `window.api.ocrTerminate()`

### Côté renderer

Le reader actuel peut rester globalement identique.

Il faut toutefois corriger la philosophie :

- le mock doit rester un outil de dev
- il ne doit plus masquer un backend OCR cassé en production

Autrement dit :

- en dev pur front : fallback mock acceptable
- en application réelle : un échec backend doit remonter comme erreur OCR

### Côté `JapaneseAnalyse`

`JapaneseAnalyse` ne doit pas être responsable du succès de l'OCR.

Il faut bien séparer :

- OCR
- segmentation/analyse lexicale
- traduction

Si JPDB est indisponible :

- le texte OCR doit quand même s'afficher
- l'utilisateur doit pouvoir le corriger
- le message d'erreur doit dire que l'analyse lexicale ou la traduction est indisponible, pas l'OCR

## Choix d'implémentation recommandé

### Base recommandée

Nous ne devons pas intégrer :

- le reader HTML de mokuro
- le format legacy HTML de mokuro

Nous devons intégrer :

- `mokuro.manga_page_ocr.MangaPageOcr`
- ou une logique équivalente dérivée de cette classe

### Pourquoi cette classe est intéressante

Elle fait déjà le travail utile pour nous :

- charge `comic-text-detector`
- charge `manga-ocr`
- traite une seule page
- renvoie des blocs avec position, orientation et texte

Elle est donc plus proche de notre besoin réel que la CLI volume complète.

### Utilisation recommandée

Le worker Python doit exposer quelque chose de très simple :

```json
{ "type": "recognize", "imagePath": "C:/..." }
```

Réponse :

```json
{
  "ok": true,
  "result": {
    "version": "...",
    "img_width": 827,
    "img_height": 1170,
    "blocks": [...]
  }
}
```

## Packaging et distribution

### Risque principal

Le vrai coût d'intégration n'est pas seulement le code.

Le vrai coût est :

- Python
- PyTorch
- modèles
- packaging Windows portable

### Stratégie réaliste à court terme

Pour un prototype ou une première version intégrée :

- dépendre d'un environnement Python externe configuré par l'utilisateur ou par le développeur
- documenter l'installation
- laisser les modèles se télécharger au premier lancement

### Stratégie à moyen terme

Pour une vraie version utilisateur propre :

- embarquer un runtime Python dédié
- préinstaller les dépendances critiques
- contrôler l'emplacement de cache des modèles

### Ce qu'il ne faut pas sous-estimer

- la taille des dépendances
- les problèmes GPU/CPU
- les problèmes antivirus ou SmartScreen sur Windows portable

## Risques et mitigations

### Risque 1 — Latence trop élevée

Mitigation :

- worker persistant
- cache obligatoire
- préfetch des pages voisines

### Risque 2 — Packaging trop lourd

Mitigation :

- commencer avec une intégration Python externe
- ne packager qu'après validation fonctionnelle

### Risque 3 — Mauvaise qualité sur certaines pages

Mitigation :

- correction manuelle du texte
- possibilité de relancer l'OCR sur une zone sélectionnée
- conserver le résultat riche, pas seulement le texte aplati

### Risque 4 — Confusion entre panne OCR et panne JPDB

Mitigation :

- séparer clairement les messages d'erreur
- afficher le texte OCR même sans JPDB

## Roadmap recommandée

### Phase 1 — Intégration technique minimale

- remplacer le stub OCR Electron
- appeler un worker Python
- traiter une page
- normaliser vers `{ boxes }`
- afficher les boxes réelles

### Phase 2 — Cache et robustesse

- ajouter cache par page
- éviter le fallback mock en production
- améliorer les erreurs et le logging

### Phase 3 — Confort utilisateur

- préfetch des pages voisines
- bouton de pré-rendu du manga ou du chapitre
- indicateur `cache / calcul en cours / erreur`

### Phase 4 — Correction et affinage

- édition manuelle du texte OCR
- fusion/split de zones
- relance OCR sur zone recadrée

## Conclusion

La bonne décision n'est pas "manga-ocr ou pas manga-ocr".

La bonne décision est :

- utiliser `manga-ocr` comme moteur de reconnaissance
- mais l'intégrer dans une vraie pipeline de détection de texte manga

Le meilleur choix actuel pour ce projet est donc :

- garder l'UX de ce document
- remplacer le backend mock/stub par une intégration inspirée de `mokuro`
- privilégier un mode à la volée avec cache
- garder le pré-rendu comme optimisation et non comme obligation

## Références

- `manga-ocr` : https://github.com/kha-white/manga-ocr
- `mokuro` : https://github.com/kha-white/mokuro
- `comic-text-detector` : https://github.com/dmMaze/comic-text-detector
- `PaddleOCR` : https://www.paddleocr.ai/
- `Tesseract` : https://tesseract-ocr.github.io/tessdoc/
