# Spécification OCR (mock) — ORC-doc

But : fournir une spécification claire et un mock pour l'UI OCR du Reader, afin de faciliter la transition vers manga-ocr et l'intégration de l'API jpdb.

## Résumé fonctionnel

- Quand l'utilisateur active l'OCR dans le Reader (bouton dans `ReaderHeader`), le panneau OCR s'ouvre à droite et lance automatiquement une détection.

- La détection retourne une liste de bulles détectées : chaque bulle est un objet `{ id, text, bbox }` où `bbox` est en coordonnées relatives `(x, y, w, h)` dans [0..1].

- Sur l'image (à gauche), chaque bulle détectée est entourée visuellement par un carré cliquable. Ces éléments sont réactifs : hover, focus, et accessibles au clavier.

- L'utilisateur peut sélectionner une ou plusieurs bulles : clic simple sélectionne une bulle, `Ctrl+clic` permet la sélection multiple (et `Ctrl+clic` sur une bulle déjà sélectionnée la désélectionne).

- Quand une ou plusieurs bulles sont sélectionnées, le panneau OCR affiche un composant `JapaneseAnalyse` (nouveau) qui reçoit la liste des textes sélectionnés (concaténés ou comme tableau) et affiche :

  - La/les phrases détectées (texte brut).
  - Un découpage en mots (segmentation JP) — pour le mock, on fournira un découpage simple par espace ou par token simulé.
  - Un panneau de détails : quand l'utilisateur clique sur un mot, `JapaneseAnalyse` affiche la fiche détaillée (mock) venant de l'API jpdb (forme : liste de senses, lecture, exemples).

## Contrat d'API / forme de données

- Résultat de détection (exposé par `window.api.ocrRecognize(imageSrc)` ou depuis le mock) :

  - `{ boxes: Array<Box> }`

  - `Box = { id: string, text: string, bbox: { x: number, y: number, w: number, h: number } }`

  - Les coordonnées `bbox` sont relatives à l'image (0..1). Le Reader convertira en pixels pour l'affichage.

- Contrat pour `JapaneseAnalyse` props (mock) :

  - `selectedBoxes: Box[]`

  - `onWordClick?: (word: string) => void`

  - `onClose?: () => void` (optionnel)

- Contrat jpdb (mock) :

  - Pour un mot, la réponse simulée aura la forme :

    `{ word: string, readings: string[], senses: Array<{ gloss: string, pos?: string }>, examples?: string[] }`

## UI / Interaction details

- Détection automatique : dès que `ocrEnabled` passe de `false` à `true`, Reader déclenche `window.api.ocrRecognize(images[currentIndex])`. Pendant la détection, afficher un spinner dans le panneau.

- Affichage des boxes : sur le composant `ImageViewer`, dessiner des éléments positionnés en absolu par-dessus l'image. Chaque box est un bouton accessible avec un label court (ex : "Bulle 1: preview").

- Sélection multiple : maintenir un `Set<string>` d'ids sélectionnés. `Ctrl+clic` ajoute/enlève ; clic simple remplace la sélection.

- Keyboard : permettre la navigation entre bulles via `Tab`/`Shift+Tab`; `Enter` pour sélectionner/désélectionner.

## Mocking & utilitaires de test

- Fournir un mock de `window.api.ocrRecognize` si l'API Electron n'est pas disponible, pour développement front-only. Exemple de données fournies dans le mock : 3 boxes autour d'une zone à droite de l'image.

- Fournir un mock `jpdb` qui retourne des données pour quelques mots courants (ex : 私, は, 日本人, です).

## Notes d'intégration futures

- Lorsque `manga-ocr` sera intégré, s'assurer qu'il produit le même shape `boxes` ou écrire une couche d'adaptation qui normalise la sortie vers le contrat ci‑dessus.

- Pour la traduction et le découpage en tokens, conserver la responsabilité côté renderer (JS) : `JapaneseAnalyse` consomera le texte et fera appel à jpdb ou autre service.

## Annexe : exemple d'objet de test

```json
{
  "boxes": [
    { "id": "b1", "text": "私は日本人です。", "bbox": { "x": 0.6, "y": 0.2, "w": 0.18, "h": 0.25 } },
    { "id": "b2", "text": "日本語を話す！", "bbox": { "x": 0.63, "y": 0.5, "w": 0.16, "h": 0.18 } }
  ]
}
```

Fin du document.
- Résultat de détection (exposé par `window.api.ocrRecognize(imageSrc)` ou depuis le mock) :

  - `{ boxes: Array<Box> }`

  - `Box = { id: string, text: string, bbox: { x: number, y: number, w: number, h: number } }`

  - Les coordonnées `bbox` sont relatives à l'image (0..1). Le Reader convertira en pixels pour l'affichage.


- Contrat pour `JapaneseAnalyse` props (mock) :

  - `selectedBoxes: Box[]`

  - `onWordClick?: (word: string) => void`

  - `onClose?: () => void` (optionnel)


- Contrat jpdb (mock) :

  - Pour un mot, la réponse simulée aura la forme :

    `{ word: string, readings: string[], senses: Array<{ gloss: string, pos?: string }>, examples?: string[] }`



## UI / Interaction details

- Détection automatique : dès que `ocrEnabled` passe de `false` à `true`, Reader déclenche `window.api.ocrRecognize(images[currentIndex])`. Pendant la détection, afficher un spinner dans le panneau.

- Affichage des boxes : sur le composant `ImageViewer`, dessiner des éléments positionnés en absolu par-dessus l'image. Chaque box est un bouton accessible avec un label court (ex : "Bulle 1: preview").

- Sélection multiple : maintenir un `Set<string>` d'ids sélectionnés. `Ctrl+clic` ajoute/enlève ; clic simple remplace la sélection.

- Keyboard : permettre la navigation entre bulles via `Tab`/`Shift+Tab`; `Enter` pour sélectionner/désélectionner.


## Mocking & utilitaires de test

- Fournir un mock de `window.api.ocrRecognize` si l'API Electron n'est pas disponible, pour développement front-only. Exemple de données fournies dans le mock : 3 boxes autour d'une zone à droite de l'image.

- Fournir un mock `jpdb` qui retourne des données pour quelques mots courants (ex : 私, は, 日本人, です).


## Notes d'intégration futures

- Lorsque `manga-ocr` sera intégré, s'assurer qu'il produit le même shape `boxes` ou écrire une couche d'adaptation qui normalise la sortie vers le contrat ci‑dessus.

- Pour la traduction et le découpage en tokens, conserver la responsabilité côté renderer (JS) : `JapaneseAnalyse` consommera le texte et fera appel à jpdb ou autre service.


## Annexe : exemple d'objet de test

```json
{
  "boxes": [
    { "id": "b1", "text": "私は日本人です。", "bbox": { "x": 0.6, "y": 0.2, "w": 0.18, "h": 0.25 } },
    { "id": "b2", "text": "日本語を話す！", "bbox": { "x": 0.63, "y": 0.5, "w": 0.16, "h": 0.18 } }
  ]
}
```


Fin du document.
