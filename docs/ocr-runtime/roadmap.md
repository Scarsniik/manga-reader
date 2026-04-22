# Roadmap OCR externe

Date de mise a jour : 2026-04-20

## Bloc 1 - Externalisation et installation initiale

Livrable attendu :

- package principal sans runtime OCR embarque
- detection runtime OCR installe ou absent
- fenetre bloquante au premier lancement
- choix installer ou continuer sans OCR
- sauvegarde du choix
- installation depuis manifeste
- support du manifeste local et distant
- support structurel du fichier unique et du multipart
- fenetre de statut
- progression claire
- annulation et relance
- nettoyage apres echec
- notifications internes et Windows
- options OCR avec installation, verification, reparation et desinstallation
- mode dev via variables d'environnement
- build separe app/runtime OCR

## Bloc 2 - Maintenance avancee

Livrable attendu :

- mise a jour OCR automatique ou semi-automatique
- signature du manifeste
- deplacement assiste du runtime vers un autre dossier
- installation offline depuis archive locale
- reprise de telechargement plus fine
- strategie d'hebergement definitive
- UI plus complete pour les notes de version OCR

## Criteres d'acceptation du bloc 1

- Le package principal ne contient plus PyTorch ni le runtime OCR.
- L'application se lance sans runtime OCR.
- Au premier lancement, l'utilisateur doit choisir entre installer l'OCR et continuer sans OCR.
- Le choix sans OCR est memorise.
- Une action OCR sans runtime propose l'installation au lieu d'echouer.
- L'utilisateur peut choisir le dossier d'installation OCR.
- L'utilisateur voit un resume avant installation.
- L'installation affiche une progression comprehensible.
- L'application reste utilisable pendant l'installation OCR.
- Une notification interne et une notification Windows annoncent la fin de l'installation.
- Un echec d'installation laisse l'application utilisable sans OCR.
- Les fichiers temporaires volumineux sont nettoyes apres echec.
- Le chemin du runtime est sauvegarde dans un fichier OCR dedie.
- Les options permettent de relancer, verifier, reparer et desinstaller l'OCR.
- Le mode developpeur permet d'utiliser un manifeste local et un runtime OCR local.
- Le build peut produire separement l'application principale et le runtime OCR.

## Decisions MVP verrouillees

- Le fichier de configuration OCR est `ocr-runtime.json`.
- Le fichier de metadata installe dans le runtime est `runtime-metadata.json`.
- En mode standard, la configuration OCR est stockee dans `%APPDATA%\manga-helper\data\ocr-runtime.json`.
- En mode portable, la configuration OCR est stockee dans `Manga Helper Data\ocr-runtime.json`.
- En mode portable, l'emplacement runtime propose est `Manga Helper Data\ocr-runtime`.
- Le manifeste MVP decrit une seule version runtime recommandee.
- Le premier hebergeur de publication est GitHub Releases.
- Les archives OCR sont decoupees en morceaux de 1,8 Go maximum quand necessaire.
- La taille exacte du runtime est mesuree par `package:ocr-runtime` et inscrite dans le manifeste.
- Un runtime deja present est valide par metadata, structure de fichiers, compatibilite plateforme/version et test worker leger sur demande.
- L'UI affiche une erreur courte et propose d'ouvrir `ocr-install-last.log` pour le diagnostic detaille.
