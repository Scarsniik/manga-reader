# Bonnes pratiques

## Général

- le code se fait en anglais (commentaire inclus)
- les noms de variables et de fonctions doivent être explicites
- les fonctions doivent être courtes
- eviter au maximum les enormes fichiers. D'une manière générale, un fichier de plus de 400 lignes est mauvais signe. Sauf cas exceptionnel il ne faut pas en arriver là. Mais on évite aussi de découper pour faire jolie. Il faut garder une logique dans les fichiers.
- quand on decoupe un fichier, il faut aussi penser au cout de contexte. Trop de micro-fichiers, de hooks tres fins ou de fonctions qui se passent beaucoup de parametres peuvent rendre la maintenance plus chere pour les humains comme pour les outils bases sur les tokens. Il faut preferer quelques fichiers coherents plutot qu'un decoupage trop fin.
- pas d'import relatif. On utilise des alias pour les imports.
- Quand c'est possible, adopter une structure qui évite les différences de merge inutiles. Exemple : mettre une virgule à la fin de chaque ligne d'un objet, même pour la dernière ligne. Comme ça, quand on ajoute une ligne à l'objet, on n'a pas de diff sur la ligne précédente.

## Structure

- On sépare bien les logique de code:

  - Components
  - Hooks
  - Utils
  - Styles
  - Types

## React

- les components doivent être atomiques. Pas de component qui fait tout. On a un component principal qui est la pour faire le lien entre les autres components. Les autres components sont là pour faire une tâche précise.
- les components doivent être réutilisables. Si on a un component qui peut être réutilisé, il faut le faire. Par exemple, un component de bouton qui peut être utilisé partout dans l'application.
- Pas d'écriture de SVG directement dans les components. Il faut utiliser des fichiers SVG et les importer dans les components.
- Les scrings sont faites avec des "" et pas des ''. Utilisation de `` autorisée pour les template string.

## Commit

- les messages de commit doivent être explicites et en anglais
- Les messages de commit commencent par : fix, feat, refactor, doc

## Versioning

- Les versions de l'application suivent SemVer : `MAJOR.MINOR.PATCH`.
- `package.json` est la source de vérité pour la version de l'application.
- Les tags de release application suivent le format `vX.Y.Z`.
- Pendant le développement et les tests de la mise à jour automatique, la version
  de départ est `0.1.0`, puis on incrémente à partir de cette base.
- La première version considérée stable avec mise à jour automatique fonctionnelle
  sera `1.0.0`.
- Une version publiée ne doit pas être modifiée après coup. S'il faut corriger
  une release déjà distribuée, on publie une nouvelle version.
- Les artefacts OCR doivent avoir leur propre versioning dans un dépôt séparé
  pour éviter toute confusion avec les releases de l'application.

## Deploy

- avant un deploy, verifier que le repo est propre et que le build passe
- incrementer la version dans `package.json`
- rediger un patchnote utilisateur dans `docs/release-notes/vX.Y.Z.md` avant la publication
- le patchnote doit etre pense pour l'utilisateur final : structure claire, phrases courtes, explication des changements visibles, pas un copier-coller du message de commit
- utiliser `npm run release:app:dry-run` pour verifier la release, puis `npm run release:app` pour publier
- une release applicative publie un tag `vX.Y.Z` et les assets GitHub associes

## Documentation

- la documentation doit être à jour. Il faut mettre à jour la documentation à chaque fois qu'on fait une modification qui change le fonctionnement de l'application.
- Eviter les fichier de doc trop longs. Ne pas hésiter à découper la doc en plusieurs fichiers si nécessaire avec un index de fichiers pour indiquer où trouver les différentes parties de la doc.
