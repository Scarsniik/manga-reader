# Procedure de test - Mise a jour automatique application

Date de mise a jour : 2026-04-22

## Objectif

Verifier qu'une version installee de Manga Helper peut etre publiee sur GitHub
Releases, detecter une version superieure, la telecharger, l'installer au
redemarrage et conserver les donnees utilisateur.

Cette procedure cible le MVP auto-update de l'application. Le runtime OCR est
teste seulement comme dependance existante a ne pas casser.

## Prerequis

- Windows x64.
- Node.js et npm installes.
- Dependances npm installees dans le projet.
- Acces au depot GitHub de l'application.
- Depot OCR runtime separe du depot application.
- GitHub CLI (`gh`) installe et authentifie si le script de release local
  l'utilise.
- Script de packaging installeur disponible :

```text
npm run package:app:installer
```

- Script de publication app disponible :

```text
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/release-app.ps1
```

## Versions de test

Les tests auto-update commencent en `0.1.0`.

Sequence minimale :

- `0.1.0` : version installee initiale.
- `0.1.1` : version superieure publiee pour tester l'update.
- `1.0.0` : seulement quand le flux est valide et considere stable.

## Sauvegarde obligatoire avant tests

Avant de lancer un test d'installation, de reinstallation ou de mise a jour, il
faut sauvegarder les fichiers utilisateur existants. Les tests auto-update ne
doivent pas etre faits directement sur la bibliotheque personnelle sans
sauvegarde.

Commande de sauvegarde recommandee :

```powershell
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupRoot = Join-Path $env:USERPROFILE "Desktop\MangaHelper-backups\$timestamp"
New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null

$items = @(
    @{
        Path = Join-Path $env:LOCALAPPDATA "manga-helper-userdata"
        Name = "localappdata-manga-helper-userdata"
    },
    @{
        Path = Join-Path $env:APPDATA "manga-helper"
        Name = "appdata-manga-helper"
    }
)

foreach ($item in $items) {
    if (Test-Path -LiteralPath $item.Path) {
        Copy-Item `
            -LiteralPath $item.Path `
            -Destination (Join-Path $backupRoot $item.Name) `
            -Recurse `
            -Force
    }
}

Write-Host "Backup created in $backupRoot"
```

Le dossier OCR runtime par defaut peut etre tres lourd :

```text
%LOCALAPPDATA%\Manga Helper\ocr-runtime
```

Il n'est pas copie par defaut par la commande precedente. Si le test doit
modifier ou supprimer le runtime OCR, faire une sauvegarde separee ou utiliser
un runtime OCR de test.

Regles de securite pendant les tests :

- noter le chemin de la vraie bibliotheque avant de changer les options ;
- utiliser une bibliotheque de test dediee pour les tests d'update ;
- ne pas lancer de test de desinstallation OCR sur le runtime personnel ;
- verifier que la sauvegarde existe avant d'installer `0.1.0`.

Exemple de bibliotheque de test :

```powershell
$testLibrary = Join-Path $env:TEMP "MangaHelperAutoUpdateTestLibrary"
New-Item -ItemType Directory -Force -Path $testLibrary | Out-Null
```

## Preparation locale

Depuis la racine du projet :

```powershell
npm ci
npm version 0.1.0 --no-git-tag-version
npm run package:app:installer
```

Resultat attendu :

- un installeur NSIS est cree dans `build/` ;
- `latest.yml` est cree dans `build/` ;
- les fichiers `.blockmap` sont crees si `electron-builder` les genere ;
- aucun artefact OCR lourd n'est present dans les assets application.

## Test 1 - Installeur

1. Confirmer que la sauvegarde obligatoire a ete faite.
2. Lancer l'installeur `0.1.0`.
3. Verifier que l'installeur n'est pas en mode one-click.
4. Choisir un dossier parent d'installation.
5. Verifier que l'application est installee dans un sous-dossier `Manga Helper`
   du dossier choisi.
6. Lancer l'application installee.
7. Ouvrir les parametres.
8. Verifier que l'onglet `Options` existe.
9. Verifier que l'onglet `Version et installation` existe.
10. Verifier que la version affichee est `0.1.0`.

Notes :

- si le dossier choisi est protege, par exemple `C:\Program Files`, Windows peut
  demander une elevation administrateur ;
- l'installation par defaut doit rester possible sans droits administrateur.

## Test 2 - Donnees utilisateur avant update

Dans l'application installee `0.1.0` :

1. Configurer un chemin de bibliotheque de test.
2. Ajouter ou verifier au moins un manga local.
3. Modifier une option visible, par exemple l'affichage des numeros de page.
4. Si un runtime OCR est deja installe, verifier son statut dans l'onglet
   `Version et installation`.
5. Fermer l'application.
6. Relancer l'application.
7. Verifier que les donnees sont toujours presentes.

Resultat attendu :

- les fichiers de donnees utilisateur restent stables ;
- la configuration OCR n'est pas modifiee.
- la vraie bibliotheque personnelle n'a pas ete modifiee.

## Test 3 - Publication `0.1.0`

Commencer par un dry-run :

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/release-app.ps1 -Version 0.1.0 -DryRun
```

Verifier que le script annonce :

- le tag `v0.1.0` ;
- les artefacts application a uploader ;
- l'absence d'artefacts OCR ;
- aucune action destructive.

Publier ensuite la release si le dry-run est correct :

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/release-app.ps1 -Version 0.1.0 -Publish
```

Resultat attendu :

- le tag `v0.1.0` existe sur GitHub ;
- la release `v0.1.0` contient l'installeur, `latest.yml` et les blockmaps ;
- la release ne contient pas le runtime OCR.

## Test 4 - Publication `0.1.1`

Preparer une version superieure :

```powershell
npm version 0.1.1 --no-git-tag-version
npm run package:app:installer
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/release-app.ps1 -Version 0.1.1 -DryRun
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/release-app.ps1 -Version 0.1.1 -Publish
```

Resultat attendu :

- le tag `v0.1.1` existe sur GitHub ;
- la release `v0.1.1` contient les assets application ;
- `latest.yml` pointe vers `0.1.1`.

## Test 5 - Detection de mise a jour

Avec l'application installee en `0.1.0` :

1. Lancer l'application.
2. Ouvrir `Version et installation`.
3. Cliquer sur `Verifier les mises a jour`.
4. Attendre la reponse.

Resultat attendu :

- l'application detecte `0.1.1` ;
- l'etat devient `available` ou equivalent ;
- aucune interaction avec le depot OCR runtime n'est necessaire.

## Test 6 - Telechargement et installation

Depuis `0.1.0` avec `0.1.1` detectee :

1. Cliquer sur `Telecharger`.
2. Verifier que la progression s'affiche.
3. Attendre l'etat `downloaded` ou equivalent.
4. Choisir `Redemarrer maintenant`.
5. Laisser l'application se fermer et redemarrer.
6. Ouvrir `Version et installation`.

Resultat attendu :

- la version affichee est `0.1.1` ;
- les donnees utilisateur creees en `0.1.0` sont toujours presentes ;
- le runtime OCR existant reste detecte ;
- l'application n'a pas modifie `ocr-runtime.json`.

## Test 7 - Reinstall manuelle

1. Fermer Manga Helper.
2. Relancer l'installeur `0.1.1`.
3. Installer par-dessus l'installation existante.
4. Relancer l'application.

Resultat attendu :

- la version reste `0.1.1` ;
- les donnees utilisateur sont conservees ;
- l'installeur ne cree pas une deuxieme installation inattendue.

## Test 8 - Erreurs reseau et release incomplete

### Reseau coupe

1. Couper la connexion reseau.
2. Lancer `Verifier les mises a jour`.

Resultat attendu :

- l'application affiche une erreur courte ;
- l'application reste utilisable ;
- un bouton ou lien permet d'ouvrir la page GitHub quand le reseau revient.

### Release incomplete

Sur une release de test non destinee aux utilisateurs :

1. Publier une release sans `latest.yml` ou avec un asset manquant.
2. Lancer la verification de mise a jour.

Resultat attendu :

- l'erreur est claire ;
- aucune installation partielle n'est appliquee.

## Test 9 - Portable

1. Construire la version portable.
2. Lancer la version portable.
3. Ouvrir `Version et installation`.

Resultat attendu :

- la version portable n'essaye pas d'installer automatiquement une mise a jour ;
- l'UI peut proposer d'ouvrir la derniere release GitHub ;
- aucune confusion n'est faite avec l'installeur NSIS.

## Test 10 - Depot OCR separe

1. Publier ou simuler une release dans le depot OCR runtime.
2. Relancer l'application installee.
3. Verifier les mises a jour application.

Resultat attendu :

- l'application ne lit pas les releases OCR pour son auto-update ;
- le statut OCR continue de fonctionner via son manifeste dedie ;
- les deux flux restent independants.

## Validation finale MVP

Le test est valide si :

- une sauvegarde des fichiers utilisateur a ete faite avant les tests ;
- `0.1.0` detecte `0.1.1` depuis GitHub Releases ;
- `0.1.0` telecharge et installe `0.1.1` ;
- les donnees utilisateur restent presentes ;
- l'OCR externe reste intact ;
- le portable reste separe du mecanisme auto-update ;
- le script de publication refuse les releases ambigues ou incompletes.
