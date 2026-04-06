# Bonnes pratiques

## Général

- le code se fait en anglais (commentaire inclus)
- les noms de variables et de fonctions doivent être explicites
- les fonctions doivent être courtes
- eviter au maximum les enormes fichiers

## React

- les components doivent être atomiques. Pas de component qui fait tout. On a un component principal qui est la pour faire le lien entre les autres components. Les autres components sont là pour faire une tâche précise.
- les components doivent être réutilisables. Si on a un component qui peut être réutilisé, il faut le faire. Par exemple, un component de bouton qui peut être utilisé partout dans l'application.

## Commit

- les messages de commit doivent être explicites et en anglais
- Les messages de commit commencent par : fix, feat, refactor, doc

## Documentation

- la documentation doit être à jour. Il faut mettre à jour la documentation à chaque fois qu'on fait une modification qui change le fonctionnement de l'application.
- Eviter les fichier de doc trop longs. Ne pas hésiter à découper la doc en plusieurs fichiers si nécessaire avec un index de fichiers pour indiquer où trouver les différentes parties de la doc.
