# Recherches de correspondances liées

Une recherche de correspondances manga peut lancer une recherche de correspondances auteur
indépendante afin d'approfondir les pages auteur disponibles sans intégrer ce parcours dans
l'affichage des résultats manga.

## Liaison des recherches

- La recherche auteur conserve l'identifiant de la recherche manga d'origine.
- Les deux recherches restent consultables, annulables, rejouables et supprimables séparément.
- La liste des recherches indique la provenance du job auteur et permet d'ouvrir son parent.
- La page auteur permet également de revenir à la recherche manga d'origine.
- La page manga suit le statut de chaque recherche auteur liée sans charger son résultat complet.

Une recherche auteur peut aussi être réutilisée par plusieurs recherches manga. Dans ce cas,
elle conserve sa provenance éventuelle : la nouvelle utilisation est enregistrée dans chaque
recherche manga et ne déplace pas le parent d'origine du job auteur.

## Réutilisation d'une recherche auteur existante

À la fin d'une recherche manga, l'orchestrateur cherche un corpus auteur déjà terminé et encore
disponible. La liaison automatique reste stricte : elle exige soit la même URL de page auteur,
soit le même nom d'auteur après normalisation. Si plusieurs corpus conviennent, celui qui contient
le plus de pages et de mangas approfondis est prioritaire, puis le plus récent.

Un corpus qui a déclenché une protection anti-emballement n'est jamais choisi automatiquement.
Une recherche déjà issue du manga courant respecte également ses propres options de liaison et
n'est pas reprise par ce mécanisme générique.

La page manga expose toujours l'action `Lier une recherche existante`. Son sélecteur :

- place les correspondances automatiques en premier ;
- permet de filtrer par auteur ou nom de recherche ;
- laisse choisir n'importe quelle recherche auteur terminée ou arrêtée avec un résultat partiel ;
- avertit lorsque l'auteur n'a pas pu être confirmé automatiquement ;
- permet l'import manuel malgré une alerte anti-emballement.

Après l'import, l'identifiant du job auteur est conservé dans le manga. Par défaut, si ce même job
auteur est approfondi puis termine une nouvelle fois, son nouveau cache est réimporté dans tous les
mangas qui ont gardé l'actualisation automatique active. Une révision déjà importée ne provoque pas
de nouveau rejeu.

## Lancement depuis une correspondance manga

L'action `Approfondir les auteurs` réutilise la modale de lancement auteur standard.

La recherche poussée y expose le nombre de mangas à analyser avec les mêmes règles dans tous
les contextes :

- une valeur positive analyse ce nombre de mangas ;
- `0` analyse tous les mangas disponibles.

Dans le contexte d'une recherche manga, la modale propose aussi :

- l'import et le rejeu automatiques du parent à la fin du job auteur ;
- le blocage de cette automatisation lorsqu'une protection anti-emballement s'est déclenchée.

## Corpus importé

L'import ne se limite pas aux URLs des pages auteur. Le snapshot complet du cache de session
auteur est fusionné dans un cache appartenant au job manga :

- listings et cards déjà collectés sur les pages auteur ;
- état et profondeur de pagination ;
- métadonnées de cards déjà enrichies ;
- correspondances manga découvertes pendant l'approfondissement ;
- mangas déjà traités et pages auteur découvertes.

Le moteur manga analyse ce corpus avant ses nouvelles tâches réseau. Les recherches auteur et
pages directes déjà couvertes par l'import sont marquées comme traitées, ce qui évite de les
scraper une deuxième fois. Les données invalidées restent conservées dans le cache, mais ne sont
pas utilisées comme pistes actives.

Le snapshot importé appartient au parent : la suppression ou l'expiration ultérieure du job
auteur ne retire pas les données déjà intégrées à la recherche manga.

## Automatisation et sécurité

Une recherche auteur liée agrège les alertes émises par les recherches manga exécutées pendant
son approfondissement. Ces alertes dépendent des protections de correspondance configurées par
l'utilisateur.

À la fin de la recherche auteur :

1. sans alerte bloquante, le corpus est importé et le parent est rejoué lorsque l'automatisation
   est active ;
2. avec une alerte et l'option de blocage active, aucun rejeu automatique n'est lancé ;
3. le corpus reste importable manuellement depuis la page manga, y compris après ce blocage ;
4. après une annulation ou une erreur, un résultat partiel sauvegardé reste importable
   manuellement ;
5. si le parent est encore actif, l'import automatique attend qu'il redevienne rejouable.

Chaque import est identifié par l'identifiant du job auteur et la révision de son cache. Une même
révision ne peut donc pas provoquer deux rejeux concurrents. Une nouvelle vague
d'approfondissement remet la liaison en attente et pourra importer sa nouvelle révision.

Les recherches manga internes à l'approfondissement ne créent jamais de nouveau job auteur lié,
ce qui évite une boucle de recherches.
