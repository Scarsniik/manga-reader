# Packaging et distribution OCR

Date de mise a jour : 2026-04-19

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

Les anciens scripts de preparation OCR peuvent etre conserves seulement s'ils servent encore a produire le runtime externe.
Les scripts qui n'ont plus de role doivent etre retires ou renommes pour eviter toute confusion.

## Distribution

Le choix final de l'hebergeur est reporte.

Contraintes connues :

- le runtime actuel peut approcher ou depasser 8 Go
- certains hebergeurs limitent la taille par fichier
- le manifeste doit permettre un fichier unique ou plusieurs morceaux

Pistes possibles :

- GitHub Releases si la taille et le nombre de fichiers restent compatibles
- stockage objet type Cloudflare R2
- autre hebergement HTTP compatible avec fichiers volumineux

L'application ne doit pas dependre d'une API specifique d'hebergeur pour installer l'OCR.
Elle doit pouvoir telecharger des fichiers via des URLs HTTPS declarees dans le manifeste.

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

Avant de publier le premier runtime separe, il faut auditer le contenu du bundle OCR.

Objectif :

- supprimer les tests inutiles
- supprimer les caches non necessaires
- supprimer les metadata lourdes inutiles a l'execution
- eviter les doublons
- conserver uniquement ce qui est necessaire au runtime

Le support GPU reste prioritaire, car il fonctionne deja correctement.
