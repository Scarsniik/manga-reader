# Cahier des charges — Manga Helper (version initiale)

ATTENTION : CECI N'EST PAS A JOUR. NE PAS UTILISER TEL QUEL.

## But

Créer une application de bureau légère, portable (sans installation requise), permettant d'apprendre le japonais en lisant des mangas.

## Contraintes techniques obligatoires

- Langages/technos front-end : TypeScript + SCSS.
- Framework UI : React (Vite comme bundler/dev server). Next.js n'est plus requis pour le MVP.
- Technologie de packaging pour application de bureau : Electron (choisi). Voir section "Prérequis de build" pour les détails.
- L'application doit être exécutable en tant qu'application de bureau (Windows au minimum) sans procédure d'installation lourde.

## Justification technologique proposée

- React + Vite + TypeScript : démarrage rapide, build léger et dev server ultra-rapide (Vite). Vite est plus simple et bien adapté pour une application de bureau packagée avec Electron quand le SSR n'est pas nécessaire.
- SCSS : styles structurés et variables.
- Electron (choisi) : solution mature et largement supportée pour packager des applications web en applications de bureau (Chromium + Node). Electron produit des binaires généralement plus volumineux que des alternatives comme Tauri, mais offre un écosystème de packaging et d'outils (par ex. `electron`, `electron-builder`, `electron-packager`) simple à mettre en place et adapté aux pipelines CI classiques sans nécessiter Rust.

> Si l'utilisateur préfère une alternative plus légère en taille binaire (par exemple Tauri), on peut adapter — Tauri est une option mais nécessite le toolchain Rust pour builder les binaires.

## Fonctionnalités principales (MVP)

1. Lecteur de mangas intégré

   - Acceptation d'images (formats courants : JPG, PNG, WebP). Import depuis dossier ou glisser-déposer d'images/archives ZIP.
   - Affichage configurable : single-page, double-page, vertical continuous (scroll), zoom et rotation.
   - Navigation : clavier, molette, et gestes (si écran tactile).

2. Panes / cases et annotations

   - Possibilité de définir des zones (cases) sur une image (manuellement) ou via OCR automatique (optionnel pour MVP).
   - Chaque case est liée à : image (crop), transcription (kana/kanji), romanization (optionnelle), traduction en français/anglais, métadonnées (confiance, source, horodatage).

3. Panneau latéral ouvrable/fermable

   - Affiche pour l'image courante la liste des cases détectées/annotées.
   - Pour chaque case : miniature, transcription, traduction, bouton pour éditer, bouton pour jouer synthèse vocale (TTS) si disponible.
   - Recherche/filter (par niveau JLPT, par mot-clé) — optionnel pour MVP.

4. Édition et workflow d'apprentissage

   - Interface d'édition pour corriger la transcription et la traduction.
   - Historique des modifications (version courte) et possibilité de marquer comme "appris".
   - Mode quiz / révision basique (cartes associées aux cases) — stretch goal.

5. Stockage et import/export

   - Projet enregistré localement dans un dossier (JSON + assets) pour une portabilité sans installation.
   - Export/Import d'un projet (fichier compressé) pour partager.

6. Options d'OCR / traduction

   - Support pour brancher un moteur OCR local ou API (ex : Tesseract local, ou service cloud).
   - Support pour brancher un service de traduction (API) ou utiliser un modèle local léger (selon contrainte hors-ligne).
   - Indiquer clairement si les services exigent une connexion réseau et une clé API.

7. Support de lecture en ligne via API (profiles utilisateur)

      - Permettre à l'utilisateur d'ajouter des profils d'API personnalisés pour lire des mangas directement depuis des services en ligne.
      - Chaque profil API peut contenir : nom, base URL, endpoints (liste des endpoints pour listes de chapitres/pages, téléchargement d'images), méthode d'authentification (clé header, Bearer token, OAuth2 configuration optionnelle), en‑têtes personnalisés, paramètres de pagination, et règles de transformation/normalisation des réponses (mapping JSON vers structure attendue).
      - UI de gestion des profils : ajouter/éditer/supprimer, tester la connexion, activer/désactiver, importer/exporter un profil (fichier JSON).
      - Intégration au lecteur : choisir une source API active, parcourir les titres/chapitres récupérés via l'API, et streamer/charger les images pages depuis l'API dans le lecteur.
      - Options de cache local et mode hors‑ligne : possibilité de télécharger un chapitre pour consultation hors‑ligne et stocker les images dans le projet local.
      - Limites et sécurité : affichage clair des limites de taux d'une API (si renseigné), et gestion des erreurs réseau/403/429.

## Contrat minimal (inputs/outputs et critères de succès)

- Entrée : dossier d'images ou images individuelles (JPG/PNG/WebP). Option : archive ZIP.
- Sortie : projet local contenant les images, les zones/cases, les transcriptions et traductions, accessible depuis l'UI.
- Critères de succès MVP :

  - Ouvrir et afficher correctement une séquence d'images.
  - Permettre de définir au moins une zone/case manuellement et d'y ajouter transcription et traduction.
  - Panneau latéral ouvrable/fermable montrant transcription + traduction pour chaque case.
  - L'application se lance comme exécutable de bureau (pas d'installation lourde nécessaire).

## Schéma de données (proposé)

- Projet.json
  - id, nom, chemin, createdAt, updatedAt
  - pages: [{ pageIndex, sourcePath, width, height, panels: [{ id, bbox: {x,y,w,h}, transcription, romanization, translation, confidence, author, updatedAt }] }]

## Modes d'erreur et cas limites

- Images corrompues/non lisibles : Affichage d'un placeholder avec un message d'erreur.
- OCR/Traduction indisponible : indiquer le mode hors-ligne et proposer de configurer une API/option locale.
- Très grand nombre d'images (mémoire) : pagination / streaming d'images depuis disque pour éviter chargement en mémoire.

## Sécurité & confidentialité

- Les données utilisateur (images, transcriptions) restent locales par défaut.
- Si l'utilisateur configure une API externe, afficher clairement où la clé est stockée et offrir une option pour l'effacer.

## Tests et qualité

- Tests unitaires pour les fonctions critiques (parsing d'images, gestion de projet JSON, import/export).
- Smoke test qui ouvre un petit jeu d'images et vérifie que le panneau latéral affiche les cases ajoutées.

## Deliverables (initial)

- Document de cahier des charges (ce fichier) mis à jour pour l'approche Vite.
- Skeleton de projet Vite + React + TypeScript + SCSS prêt à être packagé avec Electron (configuration Electron à ajouter ensuite).
- POC minimal du lecteur d'images (affichage + panneau latéral toggle + ajouter une case manuellement).

## Réponses fournies (Q1–Q7)

1. Formats d'import : formats d'image de base (JPG/PNG/WebP) ; ZIP et PDF en option pour les étapes suivantes.

2. OCR/Traduction : priorité à une solution locale si possible, sinon basculer vers une API externe.

3. Offline : pas obligatoire, mais préférable d'avoir une base offline si possible (pas contraignant).

4. Plateformes : idéalement multi-plateforme, sinon Windows en priorité.

5. Packaging : Electron choisi (mature). Tauri reste une option alternative si on préfère une taille binaire plus légère mais nécessitant le toolchain Rust.

6. Langues : français en priorité, anglais en secondaire; fallback vers EN si FR impossible.

7. Droits d'auteur : usage personnel, pas de fonctionnalités spéciales requises pour le MVP.

## Qu'est-ce qu'un MVP ?

MVP (Minimum Viable Product) : version minimale qui permet d'atteindre la valeur métier principale. Pour ce projet, le MVP consiste à :

- Ouvrir et afficher une suite d'images de manga.
- Permettre de définir manuellement au moins une case par page et d'ajouter transcription + traduction pour cette case.
- Afficher un panneau latéral ouvrable/fermable listant les cases et montrant transcription + traduction.
- Packager l'application pour qu'elle puisse s'exécuter comme application de bureau (sans installation lourde) sur Windows.

Fonctionnalités avancées (OCR automatique, quiz, TTS, import CBZ/PDF, multi-plateforme complète) sont des extensions post-MVP.

## Prochaines étapes proposées

1. Générer maintenant le skeleton Vite + React + TypeScript + SCSS + configuration Electron (prérequis listés ci‑dessous).
2. Générer le POC minimal : affichage d'images + panneau latéral toggle + création manuelle d'une case.
3. Fournir instructions de build/run pour Windows (pwsh) et tests smoke.

## Prérequis de build (Electron)

- Node.js (version LTS recommandée, ex. 18+). Un gestionnaire de paquets (npm, yarn ou pnpm).
- Outils natifs de compilation pour la plateforme cible si des modules natifs sont utilisés (par ex. Visual Studio Build Tools / MSVC sur Windows).
- Outils et dépendances de packaging Electron (par ex. `electron`, `electron-builder` ou `electron-packager`) listés dans `package.json`.

Notes : si tu veux, je peux générer des scripts d'installation automatisés pour préparer l'environnement de build sur Windows (installation Node, dépendances, et instructions pour installer les Visual Studio Build Tools si nécessaire).

---

Fichier mis à jour automatiquement : réponses intégrées et clarification MVP. Indique si tu veux que je lance la création du skeleton et du POC.
