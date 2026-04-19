# Specification technique OCR externe

Date de mise a jour : 2026-04-19

## Runtime OCR

Le runtime OCR est un dossier autonome contenant tout le necessaire pour executer l'OCR sans dependance Python externe.

Contenu attendu :

- executable Python
- bibliotheques standard Python necessaires
- dependances Python runtime
- PyTorch
- pipeline OCR
- scripts worker Manga Helper
- modeles OCR
- cache necessaire a `mokuro` ou `comic-text-detector`
- manifeste local du runtime installe

Le support GPU existant doit etre conserve.
L'option utilisateur existante pour forcer le CPU reste disponible.

## Emplacement par defaut

L'emplacement par defaut recommande est :

```text
%LOCALAPPDATA%\Manga Helper\ocr-runtime
```

Raisons :

- le runtime est une donnee technique lourde
- il n'a pas vocation a etre synchronise comme une preference utilisateur
- l'installation ne demande pas de droits administrateur

En mode portable, l'emplacement propose peut etre relatif au dossier de l'executable :

```text
Manga Helper Data\ocr-runtime
```

## Configuration OCR

Les informations techniques d'installation sont stockees dans un fichier dedie, par exemple :

```text
ocr-runtime.json
```

Emplacement standard :

```text
%APPDATA%\manga-helper\data\ocr-runtime.json
```

Emplacement portable possible :

```text
Manga Helper Data\ocr-runtime.json
```

Exemple :

```json
{
  "schemaVersion": 1,
  "state": "installed",
  "installMode": "user",
  "runtimePath": "D:\\MangaHelperOCR",
  "runtimeVersion": "1.0.0",
  "manifestUrl": "https://example.com/manga-helper/ocr/manifest.json",
  "skippedAt": null,
  "installedAt": "2026-04-19T20:00:00.000Z",
  "lastCheckedAt": "2026-04-19T20:00:00.000Z",
  "lastError": null
}
```

Etats possibles :

- `unknown`
- `skipped`
- `installing`
- `installed`
- `failed`
- `uninstalling`

`params.json` reste reserve aux parametres utilisateur, par exemple :

- forcer CPU
- activation automatique OCR apres import
- assignation automatique de la langue japonaise

## Metadata du runtime

Le runtime installe contient un fichier de metadata local.

Exemple :

```json
{
  "schemaVersion": 1,
  "runtimeVersion": "1.0.0",
  "platform": "win32-x64",
  "installedAt": "2026-04-19T20:00:00.000Z",
  "sourceManifestUrl": "https://example.com/manga-helper/ocr/manifest.json",
  "installPath": "D:\\MangaHelperOCR",
  "supportsGpu": true
}
```

## Manifeste distant

L'application lit un manifeste qui decrit les versions OCR approuvees et les URLs de telechargement.

Le manifeste permet :

- de connaitre la version OCR recommandee
- de connaitre la compatibilite avec l'application
- d'afficher la taille estimee
- de verifier les fichiers telecharges
- de changer d'hebergeur sans changer l'architecture applicative
- de supporter un fichier unique ou plusieurs morceaux

Exemple multipart :

```json
{
  "schemaVersion": 1,
  "runtimeVersion": "1.0.0",
  "compatibleAppVersions": ">=1.0.0 <2.0.0",
  "recommended": true,
  "downloads": [
    {
      "platform": "win32-x64",
      "archiveType": "zip",
      "delivery": "multipart",
      "totalSizeBytes": 8589934592,
      "installedSha256": "...",
      "parts": [
        {
          "index": 1,
          "url": "https://example.com/ocr-runtime-1.0.0-win-x64.zip.001",
          "sizeBytes": 1900000000,
          "sha256": "..."
        }
      ]
    }
  ]
}
```

Exemple fichier unique :

```json
{
  "platform": "win32-x64",
  "archiveType": "zip",
  "delivery": "single",
  "url": "https://example.com/ocr-runtime-1.0.0-win-x64.zip",
  "sizeBytes": 1800000000,
  "sha256": "..."
}
```

## Version approuvee par l'application

Le premier bloc utilise une approbation simple :

- l'application controle l'URL du manifeste
- le manifeste declare la plage de versions compatibles
- l'application refuse un runtime incompatible
- l'application verifie les hash SHA256 des fichiers telecharges

La signature cryptographique du manifeste est reportee au second bloc.

## Variables d'environnement

Variables supportees en developpement :

```text
MANGA_HELPER_OCR_MANIFEST_URL
MANGA_HELPER_OCR_MANIFEST_PATH
MANGA_HELPER_OCR_RUNTIME_DIR
```

Usage attendu :

- `MANGA_HELPER_OCR_MANIFEST_URL` force une URL distante de manifeste.
- `MANGA_HELPER_OCR_MANIFEST_PATH` force un manifeste local.
- `MANGA_HELPER_OCR_RUNTIME_DIR` force l'utilisation d'un runtime deja present.

Ces variables ne sont pas necessaires pour un utilisateur final.

## Installation

Flux cible :

1. Charger le manifeste.
2. Selectionner l'entree compatible avec la plateforme.
3. Verifier la compatibilite avec la version de l'application.
4. Afficher le resume utilisateur.
5. Creer un dossier temporaire.
6. Telecharger le fichier ou les morceaux.
7. Verifier le SHA256 de chaque fichier ou morceau.
8. Assembler les morceaux si necessaire.
9. Extraire dans un dossier temporaire.
10. Verifier la structure attendue.
11. Ecrire les metadata locales du runtime.
12. Remplacer ou activer le dossier final.
13. Ecrire `ocr-runtime.json`.
14. Notifier l'utilisateur.

L'installation finale n'est declaree valide que si toutes les verifications passent.

## Annulation et echec

En cas d'annulation :

- le telechargement en cours est stoppe
- les fichiers temporaires volumineux sont supprimes
- l'application reste utilisable sans OCR

En cas d'echec :

- les fichiers temporaires volumineux sont supprimes
- un log leger est conserve
- `ocr-runtime.json` conserve le dernier message d'erreur
- l'utilisateur peut relancer l'installation

Nom de log propose :

```text
ocr-install-last.log
```

## Dossier existant

Si le dossier choisi contient deja un runtime OCR :

- l'application tente de verifier sa structure et ses metadata
- si le runtime est valide et compatible, elle propose de le reutiliser
- si le runtime est invalide ou inconnu, elle demande quoi faire

Actions possibles :

- utiliser si detecte comme valide
- remplacer
- choisir un autre dossier
- annuler

Le remplacement passe par un dossier temporaire pour eviter de laisser une installation partiellement ecrasee.
