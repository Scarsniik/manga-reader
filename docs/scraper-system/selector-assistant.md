# Assistant visuel de selecteurs

Date : 2026-06-21

## Objectif

L'assistant visuel simplifie la configuration CSS des modules de scraper. Il ouvre une fenetre
dediee qui affiche la page a scraper a gauche et une toolbox guidee a droite.

La fenetre n'est pas le workspace a onglets. Chaque formulaire de module peut posseder une seule
fenetre d'assistant, mais plusieurs formulaires ouverts dans des fenetres differentes peuvent avoir
leur propre assistant. Quitter le formulaire ferme automatiquement la fenetre correspondante.

## Ouverture

Le bouton `Ouvrir l'assistant` est affiche dans les sections de scraping de :

- Homepage et Recherche
- Fiche
- Auteur et Tag
- Liste de tags
- Chapitres
- Pages

L'URL, la requete POST eventuelle, les valeurs de test et les selecteurs deja saisis viennent de
l'etat courant du formulaire. Il n'est pas necessaire d'enregistrer le module avant l'ouverture.
Si les informations de test ou le pattern ne permettent pas encore de construire cette URL,
l'assistant s'ouvre sur l'URL de base du scraper. Il est alors possible de naviguer jusqu'a la page
voulue et de definir le pattern depuis l'assistant.

## Deux representations de la page

Une barre de navigation reste disponible au-dessus de l'aperçu. Elle fournit les actions precedent,
suivant et recharger, ainsi qu'un champ editable contenant l'URL courante. Saisir une URL absolue
ou relative puis valider la charge dans l'assistant et conserve un historique de navigation commun
aux deux representations.

Quand le module utilise un pattern d'URL, une seconde ligne permet de le modifier sans quitter
l'assistant. Le bouton `Utiliser ce pattern` renvoie la valeur dans le champ correspondant du
formulaire d'origine. Le pattern ne declenche pas de navigation : le champ URL situe au-dessus sert
a ouvrir ponctuellement une page de travail.

La barre superieure permet de basculer entre :

- `HTML du scraper` : reponse HTTP utilisee par le runtime, sans execution du JavaScript du site
- `Page interactive` : page Chromium complete, avec son JavaScript

Les deux vues restent isolees du renderer de l'application. Une navigation suivie dans la page
interactive recharge aussi la reponse HTTP correspondante dans la vue runtime. Les liens suivis
depuis la vue runtime sont recuperes par le meme mecanisme HTTP que le scraper.

Une navigation ou une redirection vers un hostname different est bloquee tant que l'utilisateur ne
l'a pas autorisee dans la modale de confirmation de l'application. Une checkbox permet de refuser
automatiquement toutes les prochaines redirections vers d'autres domaines. Les autorisations et ce
refus global restent limites a la session courante et disparaissent a la fermeture de l'assistant.

Les echantillons des deux vues sont agreges. Le test affiche les resultats separement pour rendre
les divergences visibles.

## Modes d'interaction

Trois modes sont disponibles :

- `Naviguer` laisse la page fonctionner normalement
- `Positif` selectionne un element que le selecteur doit recuperer
- `Negatif` selectionne un element que le selecteur ne doit pas recuperer

Dans un mode de selection :

- le clic gauche descend dans l'element sous le pointeur
- le clic droit remonte vers son parent
- atteindre la limite ne provoque aucune autre action
- les evenements interactifs du site (`pointerdown`, `mousedown`, clavier, formulaire, drag and
  drop) sont bloques avant d'atteindre les scripts de la page

Un exemple positif de champ d'extraction demande une valeur attendue. La toolbox propose le texte,
les attributs `href`, `src`, `class`, `style`, les attributs `data-*` et les autres attributs utiles.
Une valeur peut aussi etre saisie manuellement. Si elle n'existe pas sur l'element, l'exemple reste
visible mais est marque comme refuse.

## Generation

Le generateur cherche un CSS qui :

- couvre tous les exemples positifs
- ne couvre aucun exemple negatif
- reste relatif au conteneur ou a l'item parent quand le runtime fonctionne ainsi
- evite les identifiants uniques, les classes qui ressemblent a des hashes et `:nth-child`
- prefere les classes et attributs communs, avec un chemin d'ancetres court
- compare les attributs des positifs et negatifs pour deduire un prefixe stable, par exemple
  `a[href^="/tag/"]`, sans memoriser l'URL complete d'un exemple unique
- peut produire plusieurs branches separees par des virgules quand la structure varie

Un seul exemple est accepte, mais un avertissement conseille d'en fournir plusieurs pour limiter
le surapprentissage d'une structure particuliere.

## Test et validation

Le bouton de test applique le CSS aux deux representations de la page. Il affiche :

- le nombre d'elements trouves
- la couverture des exemples positifs
- les exemples negatifs trouves par erreur
- les valeurs effectivement retournees
- les elements et valeurs refuses avec leur motif

Les correspondances valides sont surlignees en vert et les valeurs refusees en rouge. Cliquer sur
un element refuse bascule vers la bonne vue et le recentre dans la page.

Quand les deux tests reussissent sans negatif ni valeur refusee, le selecteur peut etre envoye
directement au formulaire. En presence d'erreurs, l'envoi reste possible apres une confirmation
explicite. La validation met a jour immediatement le champ correspondant sans fermer l'assistant,
afin de poursuivre avec les autres selecteurs du module.

Les champs en mode regex restent configurables manuellement dans le formulaire. L'assistant produit
uniquement des selecteurs CSS.

## Architecture

- `selectorAssistantWindow` gere les fenetres, les vues web isolees et les sessions Electron
- `selectorPagePreload` gere la selection DOM sans exposer d'API privilegiee au site
- la route `/selector-assistant` rend la toolbox React
- les contrats IPC sont centralises dans `src/shared/selectorAssistant.ts`
- chaque editeur utilise un identifiant de session de formulaire pour recevoir uniquement ses
  propres selecteurs et fermer sa fenetre lors du demontage
