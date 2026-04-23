# Cahier des charges - Mise a jour automatique de l'application

Date de mise a jour : 2026-04-22

## Objectif

Ajouter une version installee de Scaramanga capable de se mettre a jour depuis
GitHub Releases, sans melanger ce mecanisme avec le manifeste du runtime OCR.

La version portable peut continuer d'exister pour les utilisateurs qui ne veulent
pas installer l'application, mais la version avec mise a jour automatique doit
etre une version installee.

Le runtime OCR sera publie dans un depot separe afin d'eviter toute confusion
entre les releases de l'application et les releases du runtime OCR.

Le nom produit est centralise via variables d'environnement pour eviter de le
dupliquer dans toutes les configs :

```text
APP_PRODUCT_NAME=Scaramanga
APP_PACKAGE_NAME=scaramanga
APP_ID=com.scarsniik.scaramanga
```

Les valeurs par defaut sont definies dans `scripts/app-identity.cjs` et dans le
runtime Electron. Les variables servent d'override local ou CI.

## Decision MVP

Pour le MVP, la version auto-update utilise un installeur Windows NSIS produit
par `electron-builder`.

Raisons :

- le build portable est pratique, mais il n'est pas une bonne cible pour une
  mise a jour automatique fiable ;
- NSIS est deja supporte par `electron-builder` et par l'ecosysteme Electron
  pour les mises a jour Windows ;
- l'installation peut rester en mode utilisateur, sans droits administrateur ;
- les donnees utilisateur restent dans le dossier `userData`, separees du dossier
  d'installation ;
- le runtime OCR reste externe et n'est pas republie a chaque version de
  l'application.

Le portable reste une distribution secondaire :

- telechargement manuel depuis GitHub Releases ;
- pas d'installation silencieuse de mise a jour ;
- eventuellement un bouton "Voir la derniere version" qui ouvre la page GitHub.

L'installeur doit permettre a l'utilisateur de choisir l'emplacement
d'installation. Le dossier selectionne dans l'interface est considere comme le
dossier parent : si l'utilisateur choisit `C:\Program Files`, l'application doit
s'installer dans `C:\Program Files\Scaramanga`. Les chemins proteges par
Windows peuvent demander une elevation administrateur ; le chemin par defaut doit
rester installable sans droits administrateur.

## Separation avec le runtime OCR

Il y a deux systemes differents.

### Mise a jour application

Responsabilite :

- mettre a jour l'executable Electron, le renderer React, le preload et le code
  main process ;
- utiliser les artefacts produits par `electron-builder` ;
- utiliser les fichiers de metadata d'update generes pour l'application
  (`latest.yml`, blockmap, installeur NSIS) ;
- suivre la version `package.json`.

Ne doit pas :

- installer le runtime OCR ;
- lire le manifeste OCR ;
- modifier `ocr-runtime.json` ;
- embarquer le bundle OCR lourd dans `extraResources`.

### Installation / mise a jour OCR

Responsabilite :

- installer ou reparer le runtime OCR externe ;
- lire le manifeste OCR dedie ;
- verifier les hash SHA256 des archives OCR ;
- gerer les tailles importantes et le multipart.

Ne doit pas :

- declencher la mise a jour de l'application ;
- etre publie comme la derniere release d'application si le meme depot GitHub
  sert aussi au flux auto-update.

## Distribution GitHub Releases

### Recommandation

Utiliser deux depots GitHub separes :

- depot application : artefacts auto-update de Scaramanga ;
- depot OCR runtime : manifeste et archives OCR.

Cette separation est la decision cible pour le MVP, pas seulement une option.

Point critique : si `electron-updater` lit la derniere release GitHub du depot et
que la derniere release est une release OCR sans `latest.yml`, la recherche de
mise a jour applicative peut echouer. Il faut donc eviter que les releases OCR
soient vues comme le flux "latest" de l'application.

Noms de depots possibles :

- `scaramanga` pour l'application, si le depot est renomme ;
- `scaramanga-ocr-runtime` pour l'OCR.

### Assets attendus pour une release application

Pour une version `1.2.3`, la release application doit contenir au minimum :

- l'installeur NSIS Windows x64 ;
- `latest.yml` ;
- les fichiers `.blockmap` generes si presents ;
- les notes de version.

La release portable peut aussi etre ajoutee dans la meme release application,
mais elle n'est pas la cible auto-update.

### Versioning

`package.json` est la source de verite de la version application.

Regles :

- version au format semver : `MAJOR.MINOR.PATCH` ;
- tag application recommande : `v1.2.3` ;
- tag OCR recommande : `ocr-runtime-v1.0.0` dans un flux separe ;
- pendant le travail et les tests auto-update, utiliser `0.1.0` comme version
  de depart puis incrementer depuis cette base ;
- quand le flux auto-update est fonctionnel et valide, publier la premiere base
  stable en `1.0.0` ;
- une version publiee ne doit pas etre modifiee apres coup, sauf suppression
  complete et republication avant distribution.

Exemple de sequence de travail :

- `0.1.0` : premiere version installee testable ;
- `0.1.1` : correction ou test d'update ;
- `0.2.0` : ajout d'un comportement visible lie a l'updater ;
- `1.0.0` : premiere version stable avec auto-update valide.

### Automatisation de release

Oui, un script de deploiement automatique est possible.

Pour le MVP, prevoir un script PowerShell :

```text
scripts/release-app.ps1
```

Responsabilites du script :

- verifier que le depot est dans un etat publiable ;
- verifier que la version `package.json` correspond au tag attendu ;
- lancer le build de l'application installee ;
- verifier la presence de l'installeur, de `latest.yml` et des blockmaps ;
- creer le tag Git `vX.Y.Z` ;
- creer la release GitHub ;
- uploader les artefacts application ;
- afficher les URLs de release a tester.

Le script peut utiliser GitHub CLI (`gh`) ou une GitHub Action. Le repo fournit
maintenant les deux :

- le script local `scripts/release-app.ps1` pour les tests manuels ;
- le workflow GitHub Actions `.github/workflows/release-app.yml` pour lancer la
  meme publication depuis GitHub sur un runner Windows.

Le workflow doit :

- etre declenche manuellement avec une version explicite ;
- reutiliser le script PowerShell au lieu de dupliquer la logique ;
- avoir la permission GitHub `contents: write` pour creer le tag et la release ;
- accepter au minimum un mode `publish` et un mode `dry-run`.

Garde-fous obligatoires :

- mode `-DryRun` pour afficher les actions sans rien publier ;
- refus si le tag existe deja, sauf flag explicite de test ;
- refus si la version est inferieure ou egale a la derniere release app ;
- refus si les artefacts OCR sont detectes dans la release application ;
- aucune publication dans le depot OCR runtime.

## Comportement utilisateur cible

### Verification automatique

Au demarrage d'une version packagee installee :

1. attendre que la fenetre soit chargee ;
2. attendre un court delai pour ne pas ralentir le lancement ;
3. verifier les mises a jour si l'option est active ;
4. afficher une notification discrete si une version est disponible.

La verification automatique doit etre limitee, par exemple une fois toutes les
12 ou 24 heures, pour eviter des appels inutiles.

### Verification manuelle

Dans les parametres, l'utilisateur doit pouvoir :

- voir la version actuelle ;
- lancer "Verifier les mises a jour" ;
- voir l'etat : a jour, verification en cours, nouvelle version disponible,
  telechargement, pret a redemarrer, erreur ;
- ouvrir la page GitHub de la derniere release en cas de probleme.

Les parametres doivent etre reorganises en onglets pour eviter une page trop
longue :

- onglet `Options` : options actuelles de bibliotheque, lecteur, services
  externes et preferences courantes ;
- onglet `Version et installation` : version de l'application, mise a jour
  application, installation/reparation/desinstallation OCR.

### Installation d'une mise a jour

Flux MVP :

1. l'application detecte une nouvelle version ;
2. l'utilisateur clique sur "Telecharger" ;
3. le telechargement se fait en arriere-plan ;
4. une fois le telechargement termine, l'application propose :
   - redemarrer maintenant ;
   - installer au prochain redemarrage ;
   - plus tard.

L'application ne doit pas se fermer toute seule pendant une lecture, un OCR en
cours, ou un telechargement de manga. Le redemarrage doit rester une action
explicite de l'utilisateur.

## Contraintes techniques

### Packaging

La configuration `electron-builder` de reference est
`electron-builder.config.cjs`, afin de pouvoir lire les variables
d'environnement d'identite applicative.

Le fichier `electron-builder.json` separe a ete retire pour supprimer l'ancienne
configuration qui pouvait encore referencer le bundle OCR.

Changements attendus ou deja engages :

- ajouter une cible `nsis` pour la version auto-update ;
- conserver eventuellement une cible `portable` separee ;
- ajouter la configuration `publish` pour GitHub Releases ou pour un flux
  generic stable ;
- retirer le bundle OCR lourd de `extraResources` pour le build application ;
- stabiliser `appId`, `productName` et `artifactName`.

`appId` doit etre choisi une fois et rester stable. Il faut aussi l'aligner avec
`app.setAppUserModelId(...)` cote Electron.

Configuration NSIS attendue :

- installation par utilisateur par defaut, sans droits administrateur ;
- elevation possible si l'utilisateur choisit un emplacement protege comme
  `C:\Program Files` ;
- `oneClick: false` pour afficher les etapes utiles ;
- `allowToChangeInstallationDirectory: true` ;
- le dossier choisi par l'utilisateur doit etre traite comme un parent et non
  comme le dossier final de l'application ;
- si le comportement parent n'est pas disponible directement avec NSIS via
  `electron-builder`, ajouter un include NSIS personnalise ou ajuster clairement
  le libelle de l'etape d'installation.

### Dependances

Ajouter une dependance runtime :

```text
electron-updater
```

`electron-builder` reste la dependance de packaging.

### Securite MVP

Regles minimales :

- HTTPS obligatoire pour le flux de mise a jour ;
- pas de token GitHub embarque dans l'application ;
- releases publiques ou flux generique public pour le MVP ;
- ne jamais executer un artefact qui ne vient pas du flux configure ;
- conserver les checks integres d'`electron-updater` sur les fichiers generes ;
- ne pas modifier manuellement `latest.yml`.

La signature Windows est recommandee pour une distribution publique serieuse,
mais elle peut etre reportee apres le MVP si l'application reste diffusee a un
cercle de test. Sans signature, Windows SmartScreen peut afficher des alertes.

### Donnees utilisateur

La mise a jour de l'application ne doit pas toucher :

- `params.json` ;
- `mangas.json` ;
- auteurs, tags, series ;
- favoris et historiques scrapers ;
- configuration OCR ;
- runtime OCR installe.

Le changement de nom initial vers Scaramanga prevoit une migration automatique
non destructive du dossier `userData` historique : au premier lancement, si le
nouveau dossier Scaramanga ne contient pas encore `data/mangas.json`,
l'application copie seulement les fichiers de donnees utilisateur geres
(`mangas.json`, `params.json`, auteurs, tags, series, scrapers, historiques,
configuration OCR) depuis l'ancien dossier trouve, par exemple
`%APPDATA%\manga-helper` ou `%LOCALAPPDATA%\manga-helper-userdata`, vers
`%LOCALAPPDATA%\scaramanga-userdata\data`. Les caches Electron, logs, fichiers
temporaires OCR et autres repertoires techniques ne doivent pas etre recopies.
Si le nouveau dossier contient deja ces donnees geres, aucune copie automatique
n'est faite.

Point d'implementation : `app.setPath("userData", ...)` doit etre appele avant
le chargement des handlers IPC, car les chemins de donnees sont calcules dans
`src/electron/utils.ts`. Le dossier `userData` utilise en build installe doit
rester stable entre deux versions.

Pour les parametres utilisateur, l'ecriture de `params.json` doit etre
resistante a un redemarrage rapide ou a un `quitAndInstall` : ecriture dans un
fichier temporaire, conservation d'un backup local, puis remplacement du
fichier courant. Si `params.json` est vide ou invalide au lancement, l'application
doit tenter une restauration depuis ce backup avant de revenir aux valeurs par
defaut.

## Architecture applicative proposee

### Main process

Ajouter un module dedie :

```text
src/electron/handlers/appUpdate/
```

Fichiers proposes :

- `index.ts` : API publique du module ;
- `types.ts` : types de statut et payloads IPC ;
- `service.ts` : integration `electron-updater` ;
- `log.ts` : log leger d'update si necessaire.

Etats exposes :

- `idle`
- `checking`
- `available`
- `not-available`
- `downloading`
- `downloaded`
- `error`

Informations exposees :

- version actuelle ;
- version disponible ;
- date de derniere verification ;
- progression de telechargement ;
- message court d'erreur ;
- URL de release si disponible.

### IPC

Handlers MVP :

```text
app-update-status
app-update-check
app-update-download
app-update-install
app-update-open-release-page
```

Evenement renderer :

```text
app-update-notification
```

Le preload expose ces methodes via `window.api`, comme pour l'OCR runtime.

### Renderer

Ajouter un panneau dans l'onglet `Version et installation` :

```text
src/renderer/components/AppUpdate/AppUpdateSettingsPanel.tsx
src/renderer/components/AppUpdate/style.scss
src/renderer/components/AppUpdate/types.ts
```

Affichage minimal :

- version actuelle ;
- statut ;
- bouton de verification manuelle ;
- bouton de telechargement si update disponible ;
- bouton de redemarrage si update telechargee ;
- message d'erreur court avec bouton "Ouvrir la release".

L'UI ne doit pas afficher de details techniques longs. Les details peuvent aller
dans un log ou rester dans la console main process pour le MVP.

### Parametres

Ajouter dans `params.json` :

```json
{
  "appUpdateAutoCheck": true,
  "appUpdateLastCheckedAt": null,
  "appUpdateSkippedVersion": null
}
```

Ces champs sont des preferences utilisateur. Le statut courant du telechargement
reste en memoire dans le main process.

## Plan de programmation MVP

### Bloc 1 - Nettoyage packaging

Objectif : produire un installeur stable sans encore activer l'updater.

Taches :

- choisir la source de configuration `electron-builder` ;
- aligner `appId`, `productName`, `artifactName` et `app.setAppUserModelId` ;
- passer la version de travail a `0.1.0` avant les tests auto-update ;
- ajouter un script `package:app:installer` ;
- conserver `package:app:portable` ou renommer le script portable existant ;
- retirer le runtime OCR du build application principal ;
- verifier que l'installation NSIS se fait sans droits admin ;
- verifier que l'utilisateur peut choisir un dossier parent d'installation ;
- verifier que les donnees utilisateur survivent a une reinstall.

Critere de validation :

- un `.exe` d'installation est produit ;
- l'application installee demarre ;
- les donnees utilisateur ne sont pas supprimees lors d'une reinstall.

### Bloc 2 - Integration updater main process

Objectif : brancher `electron-updater` sans UI definitive.

Taches :

- ajouter `electron-updater` ;
- creer `src/electron/handlers/appUpdate` ;
- configurer les events updater :
  - checking ;
  - update available ;
  - update not available ;
  - download progress ;
  - update downloaded ;
  - error ;
- exposer les handlers IPC ;
- exposer les methodes preload ;
- bloquer l'updater en developpement sauf mode test explicite ;
- loguer les erreurs courtes.

Pour le mode de test explicite en developpement, l'implementation peut utiliser
une variable d'environnement dediee, par exemple :

```text
APP_UPDATE_ENABLE_DEV=1
```

Critere de validation :

- l'appel IPC de verification retourne un statut coherent ;
- aucun appel reseau d'update n'est lance en dev sans configuration explicite ;
- une erreur de feed est affichee proprement.

### Bloc 3 - UI parametres

Objectif : rendre l'update utilisable par l'utilisateur.

Taches :

- reorganiser les parametres en onglets ;
- deplacer les options courantes dans l'onglet `Options` ;
- deplacer OCR runtime et auto-update dans l'onglet `Version et installation` ;
- ajouter `AppUpdateSettingsPanel` ;
- afficher la version actuelle ;
- afficher les etats de mise a jour ;
- ajouter les boutons de verification, telechargement et redemarrage ;
- ajouter l'option `appUpdateAutoCheck` ;
- envoyer les notifications renderer quand le statut change.

Critere de validation :

- l'utilisateur peut verifier une mise a jour depuis les parametres ;
- l'utilisateur peut lancer le telechargement ;
- l'utilisateur peut redemarrer pour installer.

### Bloc 4 - Publication GitHub Releases

Objectif : rendre la mise a jour testable de bout en bout.

Taches :

- configurer `publish` pour le flux GitHub retenu ;
- creer le script `scripts/release-app.ps1` avec un mode `-DryRun` ;
- produire les assets attendus ;
- publier une release de test `v0.1.0` ;
- installer `v0.1.0` ;
- publier `v0.1.1` ;
- verifier que `v0.1.0` detecte, telecharge et installe `v0.1.1`.

Si le depot de release application est different du `repository.url`
historique, le script et la config builder peuvent etre pilotes par variables
d'environnement, par exemple :

```text
APP_UPDATE_GITHUB_OWNER=...
APP_UPDATE_GITHUB_REPO=...
```

Critere de validation :

- la mise a jour fonctionne depuis une vraie release GitHub ;
- le portable n'est pas presente comme auto-updatable ;
- le depot OCR separe ne casse pas la detection de mise a jour application.

### Bloc 5 - Durcissement minimal

Objectif : eviter les mauvaises surprises avant diffusion.

Taches :

- sauvegarder les fichiers utilisateur avant les tests d'installation et
  d'update ;
- utiliser `scripts/backup-user-data.ps1` pour sauvegarder et
  `scripts/load-user-data.ps1` pour restaurer si necessaire ;
- tester coupure reseau ;
- tester release absente ou incomplete ;
- tester refus utilisateur ;
- tester redemarrage avec OCR/scraper actif ;
- tester reinstall manuelle par-dessus une version existante ;
- documenter la procedure de release.
- documenter la procedure de test MVP dans un fichier dedie.

Critere de validation :

- aucun test MVP n'est lance sans sauvegarde prealable des donnees utilisateur ;
- aucun echec d'update ne rend l'application inutilisable ;
- l'utilisateur peut toujours ouvrir la page GitHub et installer manuellement.

## Tests MVP

La procedure detaillee est dans :

```text
docs/app-auto-update-test-procedure.md
```

Elle couvre le passage `0.1.0` vers `0.1.1`, l'installeur, la publication
GitHub Releases, la sauvegarde prealable, la conservation des donnees
utilisateur, le portable et la separation avec le depot OCR runtime.

## Hors scope MVP

Non prevu dans le MVP :

- mise a jour automatique de la version portable ;
- signature cryptographique maison d'un manifeste app custom ;
- support macOS/Linux ;
- channels beta/stable ;
- rollback automatique ;
- update forcee ;
- updater pour depot GitHub prive avec token embarque ;
- mise a jour automatique du runtime OCR via l'updater application.

## Risques et points d'attention

- Mauvaise separation des depots OCR et app : risque de casser la detection de
  `latest.yml` ou de publier les mauvais assets.
- Identite application instable : changer `appId` apres diffusion peut creer une
  deuxieme installation ou un autre dossier de donnees.
- Absence de signature Windows : alertes SmartScreen possibles.
- Configuration builder dupliquee : risque de builder le portable alors qu'on
  pense builder l'installeur.
- Runtime OCR volumineux : ne doit pas revenir dans le package app.
- Installeur NSIS : le choix d'un dossier parent peut necessiter une
  personnalisation si le comportement par defaut selectionne le dossier final.

## Definition de fini MVP

Le MVP est termine quand :

- un installeur Windows x64 est genere ;
- l'application installee verifie les mises a jour depuis GitHub Releases ;
- une version installee peut passer de `N` a `N+1` sans intervention manuelle
  autre que l'accord utilisateur ;
- les donnees utilisateur et la configuration OCR restent intactes ;
- une sauvegarde utilisateur est documentee et executee avant les tests MVP ;
- le portable reste disponible mais clairement separe de l'auto-update ;
- le script de publication app existe en mode testable ;
- la procedure de publication est documentee et reproductible ;
- la procedure de test MVP existe dans un fichier dedie.
