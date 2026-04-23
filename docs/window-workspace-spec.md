# Cahier des charges - Barre de fenetre et workspace a onglets

## Contexte

L'application Electron utilise aujourd'hui une fenetre principale native avec une barre systeme standard.
La navigation interne est principalement portee par React, les modales et quelques routes (`/`, `/reader`).
Certains contenus, comme la configuration des scrapers, sont ouverts dans une vue interne de modal.

L'objectif est d'ajouter une barre de fenetre personnalisee et de preparer un systeme extensible permettant
d'ouvrir certains contenus dans une fenetre secondaire avec des onglets applicatifs.

## Objectifs

- Remplacer la barre systeme visible par une barre de fenetre controlee par l'application.
- Garder les actions natives indispensables : reduire, agrandir/restaurer, fermer.
- Permettre a un clic molette sur une card compatible d'ouvrir son contenu dans une fenetre secondaire.
- Si la fenetre secondaire existe deja, ouvrir le contenu dans un nouvel onglet de cette fenetre.
- Rendre le mecanisme extensible pour d'autres contenus que les scrapers.

## Hors perimetre initial

- Persistance des onglets apres redemarrage.
- Detachement d'un onglet dans une nouvelle fenetre.
- Reorganisation des onglets par drag and drop.
- Historique complet par onglet.
- Synchronisation multi-ecran avancee.
- Fermer la fenetre principale doit fermer les fenetres secondaires.

Ces points pourront etre ajoutes plus tard si le besoin devient concret.

## Comportement attendu

### Barre de fenetre personnalisee

La fenetre principale doit afficher une barre superieure propre a l'application.

Elle doit permettre :

- de deplacer la fenetre par glisser-deposer sur une zone vide de la barre ;
- de reduire la fenetre ;
- d'agrandir ou restaurer la fenetre ;
- de fermer la fenetre ;
- d'afficher un bouton de bascule des DevTools uniquement en environnement de developpement ;
- d'eviter que les boutons, onglets et actions cliquables declenchent le drag de fenetre.

La meme barre doit pouvoir etre reutilisee par la fenetre secondaire.

### Fenetre secondaire

Un clic molette sur une card compatible doit appeler une API applicative generique.

Pour le premier cas supporte :

- cible principale : card de resultat de recherche scraper et card de bookmark scraper ;
- clic gauche : comportement actuel conserve, ouverture de la fiche dans la vue courante ;
- clic molette : ouverture de la fiche dans le workspace secondaire.
- clic molette sur une action ou chip auteur compatible : ouverture de la page auteur dans le workspace secondaire.

La card de scraper dans la liste de configuration peut aussi utiliser le meme mecanisme, mais elle ouvre alors la
configuration du scraper et non une fiche manga.

Si aucun workspace secondaire n'est ouvert :

- l'application cree une nouvelle `BrowserWindow` ;
- cette fenetre charge l'application React sur une route ou un mode dedie au workspace ;
- l'onglet demande est ouvert automatiquement.

Si le workspace secondaire est deja ouvert :

- aucune nouvelle fenetre n'est creee ;
- l'application envoie une demande d'ouverture d'onglet a cette fenetre ;
- la fenetre secondaire passe au premier plan.

### Onglets du workspace

La fenetre secondaire doit afficher une barre d'onglets dans sa barre superieure ou juste sous celle-ci.
La barre d'onglets doit rester fixe en haut du workspace ; seul le contenu de l'onglet actif doit scroller.

Chaque onglet doit avoir :

- un identifiant stable local a la session ;
- un type de cible ;
- un titre lisible ;
- un payload minimal permettant de reconstruire la vue ;
- un bouton de fermeture.

Le clic sur un onglet inactif l'active.
L'onglet actif doit etre visuellement plus marque et son bouton de selection ne doit plus etre cliquable.
Le clic molette sur un onglet ferme cet onglet.
Fermer l'onglet actif active un onglet voisin si disponible.
Fermer le dernier onglet ferme la fenetre secondaire.

## Modele extensible

Le systeme doit passer par une notion generique de cible ouvrable.

Exemple de forme cible :

```ts
type WorkspaceTarget =
  | {
      kind: "scraper.config";
      scraperId: string;
      title?: string;
    }
  | {
      kind: "scraper.details";
      scraperId: string;
      sourceUrl: string;
      title?: string;
    }
  | {
      kind: "scraper.author";
      scraperId: string;
      query: string;
      title?: string;
      templateContext?: Record<string, string | undefined>;
    };
```

L'ajout d'un nouveau type de contenu doit se faire en ajoutant :

- une entree dans le type `WorkspaceTarget` ;
- une fonction de resolution de titre ;
- un composant React capable de rendre cette cible ;
- eventuellement une validation du payload cote Electron ou renderer.

Les composants appelants ne doivent pas connaitre la logique de creation de fenetre.
Ils doivent seulement appeler une API du type :

```ts
window.api.openWorkspaceTarget(target);
```

## Architecture technique cible

### Electron main

Ajouter une gestion explicite de la fenetre workspace :

- conserver une reference `workspaceWindow` separee de `mainWindow` ;
- creer la fenetre avec les memes garanties de preload et de securite que la fenetre principale ;
- charger la meme application Vite ou le meme fichier build selon l'environnement ;
- envoyer les nouvelles cibles via IPC quand la fenetre existe deja ;
- nettoyer la reference quand la fenetre est fermee.

La fenetre principale et la fenetre workspace doivent partager les IPC metier existants.

### Preload

Exposer uniquement les methodes necessaires :

- `openWorkspaceTarget(target)` ;
- `minimizeWindow()` ;
- `toggleMaximizeWindow()` ;
- `closeWindow()` ;
- `getWindowState()` ou un equivalent minimal ;
- un listener pour recevoir les cibles a ouvrir dans le workspace.

Les noms exacts peuvent etre ajustes, mais l'API doit rester generique et ne pas etre nommee autour des scrapers.

### Renderer

Ajouter un composant commun de barre de fenetre.

Responsabilites :

- afficher le titre ou le contexte courant ;
- fournir une zone drag ;
- afficher les boutons systeme ;
- accepter une zone optionnelle d'onglets pour le workspace.

Ajouter une vue workspace.

Responsabilites :

- stocker les onglets ouverts en memoire ;
- recevoir les demandes d'ouverture via l'API preload ;
- dedupliquer ou non les onglets selon une option claire ;
- rendre le bon composant selon le type de cible.

Pour la V1, la recommandation est de ne pas dedupliquer : chaque clic molette ouvre un nouvel onglet, meme si une
fiche scraper identique est deja ouverte. Ce comportement est plus proche d'un navigateur.

### Contenus rendus dans un onglet

Un contenu ouvert dans un onglet ne doit pas afficher les actions de navigation qui servent uniquement dans son
contexte d'origine.

Exemples :

- un bouton `Retour a la liste` venant d'une modal de liste ne doit pas apparaitre dans un onglet ;
- un bouton de fermeture de modal ne doit pas etre rendu dans un onglet ;
- une action qui renvoie a une page parente hors workspace doit etre masquee ou remplacee par une action locale a
  l'onglet.

Les navigations internes au contenu restent autorisees si elles font partie du flux de travail de ce contenu.
Par exemple, dans la configuration d'un scraper, les boutons `Retour aux composants` ou `Retour` entre etapes
peuvent rester visibles s'ils naviguent seulement dans le wizard de configuration de l'onglet.

Chaque composant reutilise dans le workspace doit donc accepter un contexte d'affichage explicite, par exemple :

```ts
type RenderSurface = "modal" | "page" | "workspace-tab";
```

Ce contexte doit permettre au composant ou a son wrapper de masquer les actions de navigation externes sans dupliquer
la logique metier.

## Contraintes UI

- La barre doit rester compacte.
- Les boutons de fenetre doivent etre toujours accessibles.
- La zone draggable ne doit pas recouvrir les boutons ni les onglets.
- Les onglets doivent rester lisibles avec plusieurs ouvertures.
- L'onglet actif doit etre identifiable sans ambiguite.
- Les onglets du workspace doivent rester accessibles pendant le scroll du contenu.
- Les onglets doivent etre visuellement separes du contenu de l'onglet actif.
- Les textes longs doivent etre tronques avec ellipsis plutot que de casser la barre.
- Le design doit rester coherent avec le style existant de l'application.

## Compatibilite et securite

- Le changement vers une barre personnalisee implique probablement `frame: false` sur les fenetres Electron.
- Les navigations HTTP externes doivent continuer a etre ouvertes dans le navigateur systeme.
- Les fenetres applicatives ne doivent pas permettre a un site externe de se charger comme contenu interne.
- Le preload doit rester l'unique pont entre renderer et Electron.
- Les payloads recus par IPC doivent etre valides avant utilisation.

## Plan de livraison recommande

1. Ajouter les IPC de controle de fenetre et le composant de barre personnalisee.
2. Passer la fenetre principale en barre personnalisee et verifier les actions natives.
3. Ajouter la creation de la fenetre workspace cote Electron.
4. Ajouter la vue React workspace avec onglets en memoire.
5. Brancher le clic molette des cards de recherche et bookmarks scraper sur `openWorkspaceTarget`.
6. Ajouter la fiche de configuration scraper comme premiere cible supportee.
7. Tester en dev et en build Electron.

## Criteres d'acceptation

- La fenetre principale n'affiche plus la barre native.
- La fenetre reste deplacable via la barre personnalisee.
- Les boutons reduire, agrandir/restaurer et fermer fonctionnent.
- En developpement, un bouton de la barre permet d'ouvrir ou fermer les DevTools.
- Le clic gauche sur une card scraper garde le comportement actuel.
- Le clic molette sur une card de recherche ou bookmark scraper ouvre la fiche dans une fenetre workspace.
- Le clic molette sur une action ou chip auteur ouvre la page auteur dans une fenetre workspace.
- Un second clic molette ouvre un nouvel onglet dans la fenetre workspace existante.
- Les onglets peuvent etre actives et fermes.
- Le clic molette sur un onglet ferme cet onglet.
- Fermer le dernier onglet ferme la fenetre workspace.
- Les contenus ouverts dans un onglet ne montrent pas les boutons de navigation propres a leur contexte d'origine.
- Les liens HTTP externes continuent a partir dans le navigateur systeme.
- Le systeme permet d'ajouter un nouveau type de cible sans modifier la logique de creation de fenetre.

## Risques connus

- Le passage a `frame: false` peut reveler des differences de comportement selon Windows, notamment sur le
  redimensionnement et la zone de drag.
- Les composants aujourd'hui concus pour une modal peuvent avoir besoin d'etre adaptes pour fonctionner dans une
  vue pleine fenetre.
- Les evenements IPC entre fenetres doivent etre nettoyes correctement pour eviter des ecoutes multiples pendant le
  developpement avec hot reload.
- Si la fiche scraper modifie des donnees, il faudra verifier que les autres fenetres recoivent bien les evenements
  de rafraichissement existants.
