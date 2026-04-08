# To do

## 1. Scrappers et découverte

### Features

- [ ] Ajouter lecture et dl sur les cards de scrapper
- [ ] Possibilité de partager les scrappers
- [ ] Import de tag / auteur depuis scrapper
- [ ] Pourvoir cliquer sur les tags et auteurs pour voir les autres scrappers associés
- [ ] Ajouter un système de notification pour les mises à jour des scrappers favoris
- [ ] OCR dispo en lecteur en ligne sur scrapper
- [ ] Ajout de nouveaux types de scrappers modules : auteur, tag, homepage, etc
- [ ] Recherche sur tous les scrappers en même temps
- [ ] Ajout de la source quand on dl un manga depuis un scrapper
- [ ] Log d'erreur des scrappers pour pouvoir les corriger plus facilement dans l'appli
- [ ] Historique de recherche
- [ ] Plus de config dans les scrappeur pour proposer des évitement de protection anti bot ou autre
- [ ] Ajout de tags blacklist qui cache les résultats qu'on ne veut pas voir
- [ ] Miniatures dans les fiches
- [ ] Mode hors-ligne explicite pour n’afficher que le contenu local.
- [ ] Selection de page dans les resultat de recherche
- [ ] Détction de derniere page de resultat de recherche

### Fixes

- [ ] Quand on clique sur télécharger dans un scrapper avec des chapitres, ça change tous les boutons d'un coup
- [ ] Eviter de dl tout le manga avant de lancer le lecteur
- [ ] Erreur étrange : Je vais sur une fiche, lance une recherche, met un truc en bookmark, vais sur la fiche du truc depuis les bookmark, la fiche ne s'affiche pas, je dois cliquer sur "Ouvrir" pour que ça marche

### Reworks

- [ ] Revoir la navigation entre les sections d'un scrapper (recherche, fiche manga)

## 2. Lecture et bibliothèque

### Features

- [ ] Ajouter un système de favoris
- [ ] Pouvoir enregistrer des recherches
- [ ] Suppression d'une serie d'un coup
- [ ] Historique de lecture global
- [ ] Clique droit sur une card pour voir les options comme avec le clique sur le bouton de la card
- [ ] Header : il est moche
- [ ] Lazy loading pour l'acceuil
- [ ] Détection et fusion de doublons quand un même manga vient de plusieurs scrappers.
- [ ] Ecran de fin de lecteur (similaire à la transition entre les chapitres) pour proposer des mangas liés en auteur ou en tag (ou random à default)
- [ ] Filtres combinés sauvegardables, pas seulement la recherche brute.
- [ ] Possibilité de configurer plus le reader (UI, raccourcis, etc)
- [ ] Mode de lecture vertical (pourquoi pas configuration avec tag ou autre)
- [ ] Si maintien de la touche pour changer de page et arrivé à la fin du chapitre, bloquer le changement de page au lieu de passer au chapitre suivant
- [ ] Navigation de chapitre à chapitre dans le reader

### Reworks

- [ ] Refaire style header du reader
- [ ] Revoir l'ui des fenetres de confirmations qui sont les fenetres de base et pas des trucs de l'appli

### Fixes

- [ ] La reprise de lecture ne marche pas toujours, parfois il oublie la page

## 3. Interface et UX

### Features

- [ ] Ajouter des tutos dans l'application
- [ ] Page ou modal de paramètres plus structurée avec sections claires.
- [ ] Ajouter un changelog dans l'application
- [ ] Ajout de boutons pour acceder aux dossier et fichier directement depuis l'application

### Reworks

- [ ] Modals : moche + pas pratique. Prevoire des sections pour regrouper les choses + revoir visuel
- [ ] Modal de tags : visuel + ajout de auteurs et series avec recherche pour chaque type
- [ ] Faire un tour pour retirer des labels inutiles qui prennet de la place pour rien

## 4. Application et technique

### Features

- [ ] Possibilité d'ajouter des langues
- [ ] Systeme de mise à jour auto de l'appli
- [ ] Séparer l'installation de pytorch et ce genre de chose du packaging de base. On ne devrait pas mbarquer autant.

### Reworks

- [ ] Reduire les fichier trop gros (genre 1000 lignes)
