# Packaging et distribution OCR

Date de mise a jour : 2026-04-20

## Packaging principal

Le package principal ne doit plus inclure `build-resources/ocr-bundle` dans `extraResources`.

Les commandes de packaging principales ne doivent plus executer la preparation OCR si le runtime est separe.

Commandes cible possibles :

```text
npm run package:app
npm run package:ocr-runtime
npm run package:all
```

`package:app` produit l'application principale legere.

`package:ocr-runtime` produit l'archive OCR externe.

`package:all` produit les deux artefacts.

Commandes implementees :

```text
npm run package:app
npm run package:app:dir
npm run package:ocr-runtime
npm run package:ocr-runtime:force
npm run package:all
```

`package:ocr-runtime` appelle `scripts/package-ocr-runtime.ps1`. Le script
verifie la structure du runtime, ecrit `runtime-metadata.json`, produit un audit
de taille, cree l'archive ZIP et genere `manifest.json`. Si l'archive depasse la
taille de morceau configuree, le manifeste passe automatiquement en
`delivery: "multipart"`.

Sans `AssetBaseUrl`, le script derive maintenant une base HTTPS depuis le depot
OCR GitHub configure. Par defaut, il pointe vers :

```text
https://github.com/Scarsniik/manga-runtime-OCR/releases/download/ocr-runtime-vX.Y.Z
```

`-AssetBaseUrl` reste disponible si la release OCR doit etre publiee ailleurs ou
si la structure d'URL doit etre surchargee.

Par defaut, le script de packaging runtime genere aussi
`compatibleAppVersions: ">=0.1.0 <1.0.0"`. Si la plage cible change, il faut la
passer explicitement via `-CompatibleAppVersions`.

Les anciens scripts de preparation OCR peuvent etre conserves seulement s'ils servent encore a produire le runtime externe.
Les scripts qui n'ont plus de role doivent etre retires ou renommes pour eviter toute confusion.

## Distribution

Le premier hebergeur MVP est GitHub Releases.

Les artefacts OCR sont publies sous un tag dedie, par exemple :

```text
ocr-runtime-v1.0.0
```

Le manifeste est publie comme asset de release, avec les archives ou morceaux
qu'il reference.

Pour que l'application packagee retrouve automatiquement ce manifeste sans
variable d'environnement utilisateur, le build application doit embarquer une
URL de manifeste OCR par defaut. Cette URL peut etre fournie :

- directement via `MANGA_HELPER_OCR_MANIFEST_URL` ;
- ou via `MANGA_HELPER_OCR_GITHUB_REPOSITORY` ;
- ou via `MANGA_HELPER_OCR_GITHUB_OWNER` et `MANGA_HELPER_OCR_GITHUB_REPO`.

Si rien n'est fourni, le build utilise le depot OCR GitHub par defaut du
projet et pointe vers `releases/latest/download/manifest.json`.

Contraintes connues :

- le runtime actuel peut approcher ou depasser 8 Go
- GitHub Releases limite la taille d'un asset individuel
- le manifeste doit permettre un fichier unique ou plusieurs morceaux

Regles MVP :

- utiliser `delivery: "single"` si l'archive runtime tient dans un seul asset
- utiliser `delivery: "multipart"` avec des morceaux de 1,8 Go maximum sinon
- refuser la publication si un morceau depasse cette taille cible
- garder des URLs HTTPS directes dans le manifeste
- ne pas appeler d'API GitHub depuis l'application pendant l'installation

L'application ne doit pas dependre d'une API specifique d'hebergeur pour installer l'OCR.
Elle doit pouvoir telecharger des fichiers via des URLs HTTPS declarees dans le manifeste.

Si GitHub Releases devient insuffisant, le plan de secours est un stockage objet
HTTP compatible fichiers volumineux, par exemple Cloudflare R2. Ce changement ne
doit pas modifier l'application : seule l'URL du manifeste ou les URLs declarees
dans le manifeste changent.

## Securite

Regles minimales :

- telechargement en HTTPS obligatoire pour un utilisateur final
- verification SHA256 obligatoire
- refus des dossiers systeme evidents comme cible d'installation
- pas de droits administrateur requis
- extraction dans un dossier temporaire avant activation
- nettoyage des fichiers temporaires apres echec
- validation que les operations destructives restent dans le dossier runtime configure

La signature cryptographique du manifeste est recommandee pour un second bloc.

## Desinstallation

Les options OCR doivent permettre de desinstaller le runtime.

La desinstallation doit :

- demander confirmation
- supprimer le dossier runtime configure
- proteger contre les suppressions hors du dossier attendu
- mettre a jour `ocr-runtime.json`
- garder les parametres utilisateur OCR dans `params.json`

Si le dossier runtime ne peut pas etre supprime completement, l'application affiche les fichiers restants et garde un log.

## Audit de taille

Avant de publier le premier runtime separe, le script `package:ocr-runtime`
audite le contenu du bundle OCR.

Objectif :

- supprimer les tests inutiles
- supprimer les caches non necessaires
- supprimer les metadata lourdes inutiles a l'execution
- eviter les doublons
- conserver uniquement ce qui est necessaire au runtime

Le support GPU reste prioritaire, car il fonctionne deja correctement.

Le resultat de l'audit renseigne la taille exacte des fichiers produits dans le
manifeste. La taille exacte n'est donc plus un point de validation manuel avant
l'implementation.
