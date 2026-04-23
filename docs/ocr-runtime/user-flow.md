# Parcours utilisateur OCR

Date de mise a jour : 2026-04-20

## Premier lancement

Au premier lancement, si aucun choix OCR n'a ete memorise et aucun runtime OCR valide n'est detecte, l'application affiche une fenetre bloquante.

Cette fenetre explique :

- que l'OCR permet de reconnaitre le texte present dans les images de manga
- que cette fonction necessite un runtime lourd a installer separement
- que l'application peut fonctionner sans OCR
- que l'installation peut etre lancee maintenant ou plus tard

Actions disponibles :

- `Installer l'OCR`
- `Continuer sans OCR`

Il n'y a pas de troisieme choix `Redemander plus tard`.
Continuer sans OCR est un choix memorise, mais l'installation reste disponible ensuite depuis les options et les actions OCR.

## Installation depuis le premier lancement

Si l'utilisateur choisit `Installer l'OCR`, l'application demande :

- l'emplacement d'installation
- le mode de stockage de la configuration, si le mode portable est possible
- une confirmation apres affichage d'un resume

Le mode portable est propose au moment du choix d'emplacement, via une case a cocher.

Le resume avant installation affiche :

- emplacement choisi
- taille estimee du telechargement
- espace disque necessaire si disponible
- mention du telechargement Internet
- contenu installe : Python, dependances OCR, modeles
- rappel que l'application restera utilisable pendant l'installation

Une fois le resume valide :

- le choix utilisateur est memorise
- l'application principale s'ouvre
- l'installation continue en arriere-plan
- une fenetre de statut OCR reste accessible

Implementation MVP : le bouton `Installer l'OCR` ouvre la fenetre de statut et
lance l'installation depuis le manifeste configure. Le dossier propose peut etre
modifie avant relance depuis cette fenetre.

## Continuer sans OCR

Si l'utilisateur choisit `Continuer sans OCR` :

- le choix est memorise
- l'application s'ouvre normalement
- les traitements OCR automatiques sont desactives
- les actions OCR proposent l'installation au lieu d'echouer

Les fonctionnalites non-OCR restent utilisables :

- bibliotheque locale
- import de mangas
- lecture
- favoris
- tags
- recherche non-OCR
- scrapers et lecture en ligne hors dependance OCR

## Actions OCR sans runtime

Sans runtime OCR valide, les points d'entree OCR sont proteges :

- bouton OCR du reader
- panel OCR
- bouton OCR sur les cards
- avancement OCR
- filtres lies a l'OCR complet
- options OCR
- lancement automatique OCR apres import

Quand l'utilisateur clique sur une action OCR sans runtime installe, l'application affiche une explication courte et propose l'installation.

Cette explication contient :

- une phrase simple sur l'utilite de l'OCR
- un bouton `Installer l'OCR`
- un bouton ou lien `En savoir plus`

Le lien `En savoir plus` ouvre une fiche plus detaillee.

## Fenetre de statut

Une fenetre dediee affiche la progression de l'installation OCR.

Elle affiche les etapes suivantes quand elles existent :

- lecture du manifeste
- verification de compatibilite
- choix ou validation de l'emplacement
- telechargement
- verification SHA256
- assemblage des morceaux si necessaire
- extraction
- verification de la structure installee
- enregistrement de la configuration
- installation terminee

Elle affiche aussi :

- progression globale
- progression du fichier ou morceau courant
- vitesse de telechargement si disponible
- taille telechargee
- etape en cours
- erreur lisible en cas d'echec
- bouton annuler
- bouton relancer apres echec
- bouton ouvrir le log apres echec si le log existe

Le bouton de statut dans le header n'est visible que lorsqu'une installation est en cours ou lorsqu'une action utilisateur est necessaire.
Une fois l'installation terminee et notifiee, ce bouton peut disparaitre.

Implementation MVP : la fenetre de statut est ouverte depuis le premier
lancement, les options, les actions OCR sans runtime et le bouton `Runtime OCR`
de la file OCR.

## Notifications

L'application envoie une notification interne et une notification Windows dans les cas suivants :

- installation OCR terminee
- installation OCR echouee
- installation OCR annulee

Les notifications d'echec expliquent que l'application reste utilisable sans OCR.

## Options OCR

Une section OCR existe dans les options.

Elle affiche :

- etat : non installe, installation en cours, installe, echec
- chemin d'installation
- version installee
- version recommandee si disponible
- dernier message d'erreur si applicable

Actions :

- installer
- ouvrir la fenetre de statut
- verifier
- reparer
- desinstaller
- relancer apres echec

Les options OCR actuelles qui ne sont pas en conflit restent disponibles.
