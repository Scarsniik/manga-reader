# To do

## 1. Scrappers et découverte

### Features

- [x] Ajouter lecture sur les cards de scrapper
- [ ] Possibilité de partager les scrappers
- [ ] Import de tag / auteur depuis scrapper
- [ ] Pourvoir cliquer sur les tags et auteurs pour voir les autres scrappers associés
- [ ] Ajouter un système de notification pour les mises à jour des scrappers favoris
- [ ] OCR dispo en lecteur en ligne sur scrapper
- [ ] Ajout de nouveaux types de scrappers modules : tag, homepage, etc
- [ ] Recherche sur tous les scrappers en même temps
- [ ] Log d'erreur des scrappers pour pouvoir les corriger plus facilement dans l'appli
- [ ] Historique de recherche
- [ ] Plus de config dans les scrappeur pour proposer des évitement de protection anti bot ou autre
- [ ] Ajout de tags blacklist qui cache les résultats qu'on ne veut pas voir
- [ ] Mode hors-ligne pour contenu local uniquement (scrapper désactivés, option forçage mode en ligne)
- [ ] Selection de page dans les resultat de recherche
- [ ] Détection de derniere page de resultat de recherche
- [ ] Gerer le systeme de téléchargement natif du site avec le scrapper (nouveau module)
- [ ] Gerer les apis
- [x] Nombre de page dans module fiche
- [ ] Ajout détection langue (bien étudier type de détéction : titre, drapeau, autre ?)
- [x] Recherche multiple : Liste des scrapper dans une card s'ouvre en hover pour que ça ne déplace pas ce qu'il y a en dessous
- [x] Recherche multiple : lazy loading
- [x] Recherche multiple : Pouvoir mettre plusieurs thermes de recherche
- [x] Recherche multiple : Affiche quand un des resultat est déjà dans la bibliotheque ou en bookmark
- [x] Bookmark : Tri sur les bookmarks

### Fixes

- [ ] Quand on clique sur télécharger dans un scrapper avec des chapitres, ça change tous les boutons d'un coup
- [x] Eviter de dl tout le manga avant de lancer le lecteur
- [ ] Erreur étrange : Je vais sur une fiche, lance une recherche, met un truc en bookmark, vais sur la fiche du truc depuis les bookmark, la fiche ne s'affiche pas, je dois cliquer sur "Ouvrir" pour que ça marche

### Reworks

- [ ] Revoir la navigation entre les sections d'un scrapper (recherche, fiche manga)

## 2. Lecture et bibliothèque

### Features

- [ ] Ajouter un système de favoris
- [ ] Suppression d'une serie d'un coup
- [ ] Historique de lecture global
- [ ] Clique droit sur une card pour voir les options comme avec le clique sur le bouton de la card
- [ ] Header : il est moche
- [ ] Lazy loading pour l'acceuil
- [ ] Détection et fusion de doublons quand un même manga vient de plusieurs scrappers.
- [x] Possibilité de configurer plus le reader (UI, raccourcis, etc)
- [ ] Mode de lecture vertical (pourquoi pas configuration avec tag ou autre)
- [x] Navigation de chapitre à chapitre dans le reader
- [ ] Auteur : Relier auteur avec ceux de scrappers

### Reworks

- [ ] Refaire style header du reader
- [ ] Revoir l'ui des fenetres de confirmations qui sont les fenetres de base et pas des trucs de l'appli

### Fixes

- [ ] La reprise de lecture ne marche pas toujours, parfois il oublie la page

## 3. Interface et UX

### Features

- [ ] Ajouter des tutos dans l'application
- [x] Page ou modal de paramètres plus structurée avec sections claires.
- [x] Ajouter un changelog dans l'application
- [x] Ajout de boutons pour acceder aux dossier et fichier directement depuis l'application

### Reworks

- [x] Modals : moche + pas pratique. Prevoire des sections pour regrouper les choses + revoir visuel
- [ ] Modal de tags : visuel + ajout de auteurs et series avec recherche pour chaque type
- [ ] Faire un tour pour retirer des labels inutiles qui prennet de la place pour rien

### Fixes

- [ ] Onglets : Ne pas concerver le scroll entre les onglets
- [ ] Onglets : Si on ouvre un lecteur en onglet, on ne voit plus les onglet mais juste le lecteur. Ca reviens quand on fait retour

## 4. Application et technique

### Features

- [ ] Possibilité d'ajouter des langues
- [x] Systeme de mise à jour auto de l'appli
- [x] Séparer l'installation de pytorch et ce genre de chose du packaging de base. On ne devrait pas mbarquer autant.

### Reworks

- [x] Reduire les fichier trop gros (genre 1000 lignes)
