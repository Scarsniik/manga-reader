# Test local du runtime OCR

Date de mise a jour : 2026-04-20

Cette procedure permet de tester le manifeste et le parcours d'installation OCR
sans hebergeur externe.

## Runtime factice rapide

Commande principale pour preparer uniquement le runtime de test :

```powershell
npm run ocr:test-runtime
```

La commande cree :

- `build/ocr-runtime-local-test/ocr-runtime-local-test.zip`
- `build/ocr-runtime-local-test/manifest.json`
- `build/ocr-runtime-local-test/use-local-manifest.ps1`

Le runtime genere est volontairement factice. Il contient un Python local copie
depuis le `PATH`, un worker OCR minimal et les fichiers attendus par la
detection du runtime. Il sert a valider :

- la lecture d'un manifeste local ;
- le telechargement depuis une URL `file://` en developpement ;
- la verification SHA256 ;
- l'extraction ZIP ;
- l'activation du runtime installe ;
- le lancement du worker OCR sans les 8 Go du bundle reel.

Le runtime factice contient aussi `runtime-metadata.json` pour pouvoir etre
detecte directement pendant les tests. Pendant une installation depuis le
manifeste, l'installeur reecrit cette metadata avec le chemin d'installation
final.

Le script verifie aussi le manifeste genere et, en mode factice, re-extrait
l'archive pour controler la structure attendue. Il lance aussi le worker
factice et verifie une reponse `ping`.

## Lancement de l'application avec le manifeste local

Commande principale :

```powershell
npm run dev:electron:ocr-test
```

Cette commande verifie que `manifest.json` et l'archive locale existent, les
regenere si necessaire, charge `MANGA_HELPER_OCR_MANIFEST_PATH`, puis demarre
Electron avec `dev:electron`.

Pour forcer la regeneration du runtime factice avant le demarrage :

```powershell
npm run dev:electron:ocr-test -- -RegenerateRuntime
```

Pour rejouer un vrai premier lancement sans runtime installe :

```powershell
npm run dev:electron:ocr-test:fresh
```

Cette variante sauvegarde temporairement la config OCR et le runtime OCR par
defaut avant de demarrer l'application.

Alternative manuelle si la commande npm de test ne doit pas etre utilisee :

```powershell
. .\build\ocr-runtime-local-test\use-local-manifest.ps1
npm run dev:electron
```

Au premier lancement, utiliser le bouton d'installation OCR. L'application lit
alors `MANGA_HELPER_OCR_MANIFEST_PATH`, installe l'archive locale, puis ecrit
`ocr-runtime.json` avec le chemin du runtime installe.

Pour rejouer un test sans runtime, fermer l'application puis renommer
temporairement `%LOCALAPPDATA%\Manga Helper\ocr-runtime` et retirer
temporairement `%APPDATA%\manga-helper\data\ocr-runtime.json`, ou utiliser
`npm run dev:electron:ocr-test:fresh`. L'application ne doit pas utiliser
`scripts/ocr_worker.py`, le Python global, ni
`build-resources/ocr-bundle` comme fallback.

## Runtime reel deja prepare

Si `build-resources/ocr-bundle` existe et qu'il faut tester le parcours avec le
bundle reel :

```powershell
npm run ocr:test-runtime:bundle
```

Cette variante archive le bundle OCR existant. Elle peut etre lente et produire
un gros fichier, mais elle genere le meme type de manifeste local.

Pour verifier aussi la re-extraction de cette grosse archive :

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/create-local-ocr-runtime-test.ps1 -Mode ExistingBundle -Force -VerifyArchive
```

## Nettoyage

Les fichiers generes sont dans `build/ocr-runtime-local-test`, donc dans un
dossier de build local. Ils peuvent etre supprimes sans impact sur le code
source.
