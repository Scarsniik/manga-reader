# Procedures de test MVP OCR runtime

Date de mise a jour : 2026-04-20

Ce fichier sert a valider le MVP d'externalisation du runtime OCR. Les champs
`Resultat reel` sont a remplir pendant les tests manuels.

## Preparation commune

Procedure :

1. Depuis la racine du repo, executer `npm run dev:electron:ocr-test`.
2. Pour rejouer un vrai premier lancement sans runtime installe, fermer l'application puis executer `npm run dev:electron:ocr-test:fresh`.
3. Pour forcer la regeneration du runtime factice local, executer `npm run dev:electron:ocr-test -- -RegenerateRuntime`.

Resultat attendu :

- Le manifeste local pointe vers une archive `file://`.
- L'application utilise ce manifeste pour installer un runtime OCR factice local.
- Sans runtime installe ou configure, l'application ne revient pas sur le worker OCR du repo ni sur le Python global.

Resultat reel :

- RAS

## T-01 - Build Electron

Procedure :

1. Executer `npm run build:electron`.

Resultat attendu :

- La commande se termine avec le code `0`.
- Aucun message TypeScript bloquant n'apparait.

Resultat reel :

- RAS

## T-02 - Build renderer

Procedure :

1. Executer `npm run build`.

Resultat attendu :

- La commande se termine avec le code `0`.
- Les avertissements Sass ou taille de chunk connus ne bloquent pas le build.

Resultat reel :

- RAS

## T-03 - Generation du runtime local factice

Procedure :

1. Executer `npm run ocr:test-runtime`.
2. Ouvrir `build\ocr-runtime-local-test\manifest.json`.

Resultat attendu :

- `manifest.json`, `ocr-runtime-local-test.zip` et `use-local-manifest.ps1` sont generes.
- Le script verifie le worker factice, le manifeste et la re-extraction de l'archive.
- Le manifeste contient une entree `win32-x64` en `delivery: "single"`.

Resultat reel :

- RAS

## T-04 - Packaging runtime OCR externe

Procedure :

1. Executer `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/package-ocr-runtime.ps1 -SourceRuntime build\ocr-runtime-local-test\staging\ocr-runtime -OutputRoot build\ocr-runtime-package-test -RuntimeVersion local-test-1.0.0 -Force`.
2. Ouvrir `build\ocr-runtime-package-test\manifest.json`.
3. Ouvrir `build\ocr-runtime-package-test\audit.json`.

Resultat attendu :

- Le script produit une archive ZIP, un `manifest.json` et un `audit.json`.
- Le manifeste est valide JSON et reference l'archive produite.
- L'audit contient la taille et le detail des dossiers de premier niveau.

Resultat reel :

- RAS

## T-05 - Premier lancement sans runtime

Procedure :

1. Verifier que `MANGA_HELPER_OCR_RUNTIME_DIR` n'est pas defini.
2. Sauvegarder puis retirer temporairement `%APPDATA%\manga-helper\data\ocr-runtime.json`.
3. Demarrer l'application.

Resultat attendu :

- Une fenetre bloquante apparait.
- Elle explique que l'OCR reconnait le texte dans les images de manga.
- Les actions `Installer l'OCR` et `Continuer sans OCR` sont visibles.

Resultat reel :

- RAS mais procédure pas ultra complete

## T-06 - Continuer sans OCR

Procedure :

1. Depuis la fenetre de premier lancement, cliquer sur `Continuer sans OCR`.
2. Fermer puis rouvrir l'application.

Resultat attendu :

- L'application devient utilisable sans OCR.
- Le choix est memorise.
- La fenetre de premier lancement ne reapparait pas au demarrage suivant.

Resultat reel :

- RAS

## T-07 - Installation OCR depuis le premier lancement

Procedure :

1. Rejouer T-05.
2. Cliquer sur `Installer l'OCR`.
3. Dans la fenetre de statut, garder le dossier propose ou choisir un dossier temporaire.
4. Lancer l'installation.
5. Attendre la fin.

Resultat attendu :

- L'installation ne demarre pas avant le clic sur le bouton `Installer l'OCR` de la fenetre de statut.
- La fenetre de statut affiche lecture du manifeste, telechargement, extraction et activation.
- La progression atteint `100%`.
- Une notification interne et une notification Windows annoncent la fin.
- `ocr-runtime.json` contient `state: "installed"` et le chemin du runtime.
- Le statut runtime passe a `Installe`.

Resultat reel :

- RAS

## T-08 - Action OCR reader sans runtime

Procedure :

1. Mettre l'application dans un etat sans runtime valide.
2. Ouvrir un manga dans le reader.
3. Activer une action OCR du reader ou la selection manuelle OCR.

Resultat attendu :

- L'action ne plante pas le renderer.
- Une proposition d'installation OCR s'ouvre.
- Le message indique que le runtime OCR doit etre installe.

Resultat reel :

- Ca fonctionne mais là c'est juste la fenetre d'installation, je voulait une explication avec pour expliquer au user à quoi ça sert et tout.

## T-09 - Action OCR manga/vocabulaire sans runtime

Procedure :

1. Mettre l'application dans un etat sans runtime valide.
2. Depuis une card manga, ouvrir `OCR / Vocabulaire`.
3. Cliquer sur `Lancer l'OCR` ou `Extraire vocabulaire`.

Resultat attendu :

- La modale affiche `Runtime OCR absent`.
- La fenetre d'installation OCR s'ouvre.
- L'application reste utilisable.

Resultat reel :

- Meme chose que T08

## T-10 - File OCR sans runtime

Procedure :

1. Mettre l'application dans un etat sans runtime valide.
2. Ouvrir `Avancement OCR`.
3. Cliquer sur une action de lancement OCR.

Resultat attendu :

- La file OCR ne demarre pas sans runtime.
- La fenetre d'installation OCR s'ouvre.
- Le bouton `Runtime OCR` ouvre aussi la fenetre de statut.

Resultat reel :

- Meme chose que T09

## T-11 - Options OCR

Procedure :

1. Ouvrir `Parametres`.
2. Observer le panneau `Runtime OCR`.
3. Cliquer sur `Verifier`.
4. Cliquer sur `Installer / statut`.
5. Si un runtime est installe, cliquer sur `Ouvrir le dossier` puis `Ouvrir le log`.

Resultat attendu :

- Le panneau affiche etat, chemin, version et dernier statut.
- `Verifier` met a jour l'etat.
- `Installer / statut` ouvre la fenetre de statut.
- Les actions dossier/log ouvrent les emplacements correspondants quand ils existent.

Resultat reel :

- RAS

## T-12 - Runtime invalide

Procedure :

1. Creer un dossier temporaire vide.
2. Definir `MANGA_HELPER_OCR_RUNTIME_DIR` vers ce dossier.
3. Demarrer l'application.
4. Ouvrir `Parametres`.

Resultat attendu :

- Le runtime est marque `Invalide`.
- Les problemes de structure manquante sont affiches.
- Les actions OCR proposent l'installation au lieu d'utiliser ce dossier.

Resultat reel :

- Echec initial : le runtime force par `MANGA_HELPER_OCR_RUNTIME_DIR` etait contourne si la config contenait un runtime valide.
- Corrige : la source `environment` est maintenant autoritaire.
- Apres correction, un dossier vide est signale invalide avec metadata, Python, worker, modele manga-ocr et modele comic text detector manquants.

## T-13 - Annulation d'installation

Procedure :

1. Lancer une installation OCR.
2. Cliquer sur `Annuler` pendant une etape longue.

Resultat attendu :

- L'installation passe a l'etat annule.
- Les fichiers temporaires sont nettoyes.
- Une notification interne et Windows indique l'annulation.
- L'application reste utilisable sans OCR.

Resultat reel :

- RAS fonctionnel : installation annulee, message `This operation was aborted`, runtime absent, notification interne OK, application utilisable.
- Ajustement UX : la notification Windows ne doit se declencher que si l'application n'est pas au premier plan.
- Temporaire nettoye : `ocr-runtime-install-temp` absent apres annulation.
- Changements à faire : Pourquoi de l'anglais ?

## T-14 - Echec d'installation

Procedure :

1. Modifier temporairement le manifeste local pour casser le `sha256` de l'archive.
2. Lancer une installation OCR.
3. Ouvrir le log depuis la fenetre de statut.

Resultat attendu :

- L'installation echoue sur la verification SHA256.
- La fenetre affiche une erreur courte.
- Le log contient le diagnostic.
- Une notification interne et Windows indique l'echec.

Resultat reel :

- RAS : l'installation echoue sur `SHA256 mismatch for ocr-runtime.zip`.
- Le log contient la selection du runtime, le telechargement de l'archive locale et le diagnostic SHA256.
- Notification OK.

## T-15 - Desinstallation OCR

Procedure :

1. Installer le runtime OCR factice avec T-07.
2. Ouvrir `Parametres`.
3. Cliquer sur `Desinstaller`.
4. Confirmer.

Resultat attendu :

- Le dossier runtime installe est supprime.
- `ocr-runtime.json` repasse a un etat sans runtime installe.
- Le panneau OCR affiche un runtime absent ou non configure.

Resultat reel :

- Echec initial : la suppression echouait avec `EBUSY` parce que le worker OCR prechauffe gardait `python.exe` ouvert dans le dossier runtime.
- Corrige : la desinstallation arrete le worker OCR avant de supprimer le runtime.
- Apres correction, la desinstallation fonctionne, le dossier runtime est supprime, `ocr-runtime.json` repasse a `state: "unknown"` avec `runtimePath: null`, et le panneau affiche `Absent`.
- Ajustement UX : ajouter une notification interne de fin de desinstallation reussie.

## T-16 - Package app sans runtime OCR

Procedure :

1. Executer `npm run package:app:dir`.
2. Inspecter `build\win-unpacked\resources`.

Resultat attendu :

- Le package applicatif est produit.
- `resources\ocr-bundle` n'existe pas.
- Le package principal ne contient pas le runtime OCR lourd.

Resultat reel :

- RAS : `npm run package:app:dir` se termine avec le code `0`.
- `build\win-unpacked\resources` contient `app.asar` et `app.asar.unpacked`.
- `build\win-unpacked\resources\ocr-bundle` est absent et aucun runtime OCR lourd evident n'est present dans `resources`.

## T-17 - Package runtime OCR reel

Procedure :

1. Verifier que `build-resources\ocr-bundle` contient le runtime OCR reel.
2. Executer `npm run package:ocr-runtime`.
3. Ouvrir `build\ocr-runtime\manifest.json` et `build\ocr-runtime\audit.json`.

Resultat attendu :

- L'archive OCR externe est produite.
- Le manifeste est en `single` si l'archive tient dans un fichier, sinon en `multipart`.
- Aucun morceau ne depasse la taille limite configuree.
- `runtime-metadata.json` est present dans le runtime source avant archivage.

Resultat reel :

- Echec initial : `Compress-Archive` echouait sur le runtime reel avec `Le flux etait trop long`.
- Corrige : le packaging utilise `tar.exe`/libarchive pour creer le ZIP volumineux.
- RAS apres correction : archive produite, manifeste et audit generes.
- Manifeste en `delivery: "multipart"` avec 3 morceaux, taille max `1932735283` octets.
- `runtime-metadata.json` est present dans `build-resources\ocr-bundle`.

## T-18 - OCR avec runtime factice installe

Procedure :

1. Installer le runtime factice avec T-07.
2. Ouvrir un manga dans le reader.
3. Lancer une reconnaissance OCR sur une page.

Resultat attendu :

- Le worker OCR demarre depuis le runtime installe.
- Une boite OCR factice est retournee.
- Le texte de test du worker apparait dans le resultat OCR.

Resultat reel :

- RAS : le worker OCR demarre depuis le runtime factice installe.
- Le reader indique `Source: calcul backend force`.
- Une reconnaissance OCR retourne 1 match avec le texte factice `ãƒ†ã‚¹ãƒˆOCR`.

## T-19 - OCR avec runtime reel force

Procedure :

1. Definir `MANGA_HELPER_OCR_RUNTIME_DIR` vers `build-resources\ocr-bundle`.
2. Demarrer l'application.
3. Ouvrir `Parametres` et verifier que le runtime OCR est valide.
4. Ouvrir un manga dans le reader.
5. Lancer une reconnaissance OCR sur une page.

Resultat attendu :

- Le worker OCR demarre depuis `build-resources\ocr-bundle`.
- Le resultat OCR contient du texte reel, pas le texte factice `ãƒ†ã‚¹ãƒˆOCR`.
- L'application ne revient pas sur le worker OCR du repo ni sur le Python global.
- Le renderer ne plante pas.

Resultat reel :

- RAS : le runtime force depuis `build-resources\ocr-bundle` est valide.
- Le worker reel demarre depuis `build-resources\ocr-bundle`.
- Le log indique le chargement du modele `models\manga-ocr-base`, l'utilisation CUDA et `OCR ready`.
- Une reconnaissance OCR dans le reader fonctionne.

## T-20 - Installation et OCR avec package runtime reel

Procedure :

1. Verifier que T-17 a produit `build\ocr-runtime\manifest.json` et les morceaux du runtime reel.
2. Demarrer un serveur HTTP local qui expose `manifest.json` et les fichiers `ocr-runtime-1.0.0-win32-x64.zip.*`.
3. Rejouer un lancement sans runtime installe.
4. Installer l'OCR depuis la fenetre d'installation avec le manifeste HTTP local.
5. Attendre la fin de l'installation.
6. Ouvrir un manga dans le reader.
7. Lancer une reconnaissance OCR sur une page.

Resultat attendu :

- L'installation lit le manifeste via HTTP.
- Le telechargement multipart recupere tous les morceaux.
- La verification SHA256 de chaque morceau et de l'archive assemblee passe.
- Le runtime extrait est installe dans le dossier choisi.
- Le worker OCR demarre depuis le runtime installe, pas depuis `build-resources\ocr-bundle`.
- Le resultat OCR contient du texte reel.
- L'application reste utilisable apres l'installation.

Resultat reel :

- Installation terminee avec succes depuis le manifeste HTTP local multipart.
- Le log contient le telechargement et la verification SHA256 des 3 morceaux, puis l'assemblage, l'extraction, l'activation et la fin d'installation.
- `ocr-runtime.json` contient `state: "installed"`, `runtimeVersion: "1.0.0"` et `manifestUrl: "http://127.0.0.1:43175/manifest.json"`.
- Le dossier installe contient metadata, Python, worker et modele OCR.
- Une reconnaissance OCR reelle dans le reader fonctionne avec le runtime installe.
- Remarque UX : pendant l'installation, les etapes n'etaient pas assez visibles et donnaient l'impression d'un blocage.
- Remarque UX : pendant l'activation a 94 %, un warning transitoire de runtime incomplet pouvait apparaitre alors que l'installation finissait ensuite en succes.
- Corrige : la fenetre d'installation affiche maintenant les etapes explicites et masque les problemes runtime transitoires pendant l'installation.
- Remarque UX : si la fenetre d'installation est fermee pendant l'installation, le panneau Parametres affichait `Absent` au lieu de l'etat en cours.
- Corrige : le panneau Parametres lit le statut d'installation en arriere-plan, affiche `Installation en cours`, montre la progression et desactive les actions incompatibles tant que l'installation tourne.
- Remarque UX : la decompression restait longtemps sur un message fixe et donnait l'impression que l'installation etait bloquee.
- Corrige : la decompression publie maintenant un pourcentage base sur les octets extraits, affiche dans le message d'installation pendant l'etape `extract`.
