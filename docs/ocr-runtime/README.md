# Cahier des charges - Runtime OCR externe

Date de mise a jour : 2026-04-19

## Statut

Ce dossier decrit la cible produit et technique pour sortir le systeme OCR du package principal de Manga Helper.

La specification OCR metier reste dans :

- [ORC-doc.md](../ORC-doc.md)
- [ORC-implementation-notes.md](../ORC-implementation-notes.md)

Ce cahier des charges se concentre sur l'installation, la detection, la distribution et la maintenance du runtime OCR.

## Documents

- [Parcours utilisateur](./user-flow.md)
- [Specification technique](./technical-spec.md)
- [Packaging et distribution](./packaging-distribution.md)
- [Roadmap et criteres d'acceptation](./roadmap.md)

## Probleme a resoudre

Aujourd'hui, l'OCR et ses dependances lourdes sont inclus dans le package principal.
Le package actuel approche environ 8 Go, ce qui le rend difficile a partager, long a produire et peu pratique a distribuer.

Les elements lourds concernes sont notamment :

- Python embarque
- PyTorch
- `manga-ocr`
- `mokuro`
- `comic-text-detector`
- modeles et caches necessaires a l'execution OCR

L'application principale doit redevenir legere, tout en gardant une installation OCR simple pour les utilisateurs qui en ont besoin.

## Objectifs

- Retirer le runtime OCR du package principal.
- Garder une application principale utilisable sans OCR.
- Proposer l'installation OCR au premier lancement.
- Installer un environnement OCR complet dans un dossier choisi par l'utilisateur.
- Embarquer Python dans le runtime OCR pour limiter les problemes de compatibilite.
- Conserver le support GPU actuel.
- Afficher clairement l'etat d'installation et la progression.
- Permettre de revenir plus tard a l'installation depuis les options ou depuis une action OCR.
- Produire separement l'application et le runtime OCR.
- Utiliser un manifeste pour decoupler l'application de l'hebergeur.
- Prevoir un telechargement en un fichier ou en plusieurs morceaux.

## Decisions validees

- Le package principal cible prioritairement un executable portable Windows.
- Un installateur peut rester disponible en parallele si cela reste peu couteux.
- Le premier lancement affiche une fenetre bloquante avec deux choix : installer l'OCR ou continuer sans OCR.
- Le choix sans OCR est memorise.
- Si l'utilisateur lance l'installation OCR, l'application devient utilisable apres la configuration initiale.
- L'installation continue en arriere-plan.
- Une fenetre dediee affiche le statut et la progression.
- Une notification interne et une notification Windows sont envoyees a la fin.
- Le runtime OCR est installe dans un dossier choisi par l'utilisateur.
- Un emplacement par defaut est propose.
- L'utilisateur peut choisir un autre disque ou un dossier externe.
- L'installation doit fonctionner sans droits administrateur.
- Les echecs d'installation ne bloquent pas l'utilisation sans OCR.
- Les fichiers temporaires volumineux sont nettoyes apres un echec.
- Un log leger est conserve pour diagnostic.
- Les informations techniques OCR sont stockees dans un fichier dedie, pas dans `params.json`.
- Les variables d'environnement doivent permettre le developpement et les tests locaux.
- Le manifeste OCR peut pointer vers un gros fichier unique ou vers plusieurs morceaux.
- Le choix exact de l'hebergeur est reporte.

## Hors perimetre du premier bloc

Ces elements sont souhaitables, mais ne doivent pas bloquer le premier livrable :

- mise a jour automatique complete du runtime OCR
- signature cryptographique du manifeste
- deplacement automatique d'une installation existante vers un autre dossier
- reprise fine d'un telechargement interrompu
- installation offline depuis une archive locale
- choix avance des variantes CPU/GPU au moment de l'installation

## Vocabulaire utilisateur

Les boutons et badges peuvent utiliser le sigle `OCR`.

Dans les explications, la premiere occurrence doit vulgariser le terme :

> L'OCR permet de reconnaitre le texte present dans les images de manga pour l'analyser dans l'application.

Ensuite, l'interface peut utiliser `OCR` de facon courte.
