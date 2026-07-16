# Reader

Le reader n'est plus porté par un seul fichier. `Reader.tsx` est désormais un conteneur qui compose des hooks métier et des composants d'affichage plus petits.

## Structure

- `Reader.tsx`
  - conteneur principal
  - lit les settings utilisateur
  - branche les hooks
  - connecte les composants d'UI
- `hooks/useReaderData.ts`
  - charge le manga et les pages
  - synchronise la page courante dans l'URL
  - persiste la progression de lecture et le nombre de pages connu
  - précharge les images voisines selon `readerImagePreloadPageCount`
  - pour les scrapers a template sequentiel, evite de sonder toutes les pages a l'ouverture du reader : reutilise un total connu si disponible, sinon detecte la derniere page par recherche exponentielle puis dichotomie
- `hooks/useReaderNavigation.ts`
  - gère le retour, le changement de page, les transitions entre chapitres et l'écran de fin de lecture
  - gère la copie de l'image courante
  - expose les états dérivés de navigation
- `hooks/useReaderOcr.ts`
  - charge et met en cache l'OCR du lecteur d'ecran
  - pré-rend le lecteur d'ecran autour de la page courante selon `readerOcrPreloadPageCount`
  - précharge traduction et parsing JPDB des bulles quand `readerOcrAutoAnalyzeBubbles` est actif
  - peut précharger les détails de tous les tokens via `readerOcrPreloadTokenDetails`
  - gère les sélections manuelles
  - persiste les corrections de texte d'une bulle OCR dans le fichier OCR du manga
  - gère l'ordre manuel de traduction des bulles pour chaîner le contexte JPDB
  - gère la sélection/focalisation des bulles avec une navigation clavier configurable via `readerOcrNavigationOffset`, `readerOcrNavigationDeadZone`, `readerOcrNavigationStrictDirection` et `readerOcrNavigationLooseFallback`
- `hooks/useReaderShortcuts.ts`
  - centralise les raccourcis clavier et applique `readerScrollStrength` aux actions de scroll
  - branche aussi les actions VOICEVOX sans raccourci par defaut : lire la bulle courante, relire plus lentement, relire plus rapidement
- `hooks/useReaderVoicevoxSpeech.ts`
  - lit la bulle OCR selectionnee via VOICEVOX
  - garde en cache l'audio genere pour la bulle, le texte courant et les reglages courants afin de relire sans nouvel appel API
  - applique une vitesse temporaire plus lente/rapide limitee a la bulle selectionnee
  - enregistre l'audio OCR dans le dossier utilisateur par defaut ou dans le dossier configure
- `hooks/useReaderFullscreen.ts`
  - cible le bloc image + panneau OCR avec le Fullscreen API, sans inclure l'en-tête du lecteur ni les onglets workspace
- `ReaderStage.tsx`
  - affiche la progression, l'image, la transition de chapitre, la fin de lecture ou l'état vide
  - respecte `readerShowProgressIndicator` pour afficher ou masquer la barre de progression
- `ReaderCompletion.tsx`
  - affiche la fin de manga/série, le retour bibliothèque, la source et les suggestions avec leur progression si elles sont commencées
- `endOfReadingRecommendations.ts` / `readerBookmarkRecommendations.ts` / `readerBookmarkReader.ts`
  - centralisent les règles de suggestions, de manga aléatoire, l'adaptation des bookmarks scraper en recommandations et leur ouverture directe dans le reader
- `ReaderEmptyState.tsx`
  - affiche l'état debug quand aucune image n'est disponible
- `ReaderControls.tsx`
  - affiche les boutons précédent/suivant
- `types.ts` / `utils.ts`
  - types et helpers partagés du reader

## Responsabilités fonctionnelles

- Le reader lit les paramètres d'URL `id` et `page`.
- Il supporte la lecture locale et la lecture issue d'un scraper.
- Il gère la navigation clavier/souris, la progression et le passage au chapitre précédent/suivant.
- En mode liste de lecture, la cible suivante de la liste remplace les transitions de série. La fin intermédiaire affiche
  le prochain manga, tandis que la fin du dernier élément rend le résumé de la liste. Une action dédiée permet aussi
  d'ouvrir cette transition avant la dernière page sans valider le manga courant comme lu.
- Le bouton plein écran et le raccourci configurable `F` affichent seulement l'image et le panneau OCR en plein écran. `Échap`, `F` ou le bouton flottant à gauche permettent d'en sortir.
- Les dialogues ouverts depuis le panneau OCR, dont les fiches d'aide grammaticale, restent affichables en plein écran.
- Pour les mangas en bibliothèque rangés dans une série, le passage au chapitre précédent/suivant s'appuie sur les métadonnées de série et de chapitre, y compris pour les entrées distantes issues d'un scraper.
- En fin de manga ou de dernier chapitre de série, il affiche des suggestions de mangas non lus à partir des tags et de la langue. Les séries ne proposent que leur prochain chapitre non lu, la série courante est exclue, les mangas finis sont exclus, les mangas avec tags cachés sont exclus quand le contenu caché n'est pas affiché, et la langue doit correspondre à la lecture en cours.
- Une option de fin de lecture permet au bouton `Suivant` d'ouvrir un manga surprise quand aucune suite logique n'est disponible. Le manga surprise réutilise les critères des suggestions, reste caché sur l'écran de fin et exclut les mangas déjà commencés.
- Une option de l'onglet Lecteur permet d'inclure les bookmarks scraper lisibles directement dans les recommandations et dans le bouton de manga aléatoire. Le manga aléatoire garde la même langue que la lecture en cours et exclut les mangas rattachés à une série.
- Le lecteur d'ecran reste optionnel et s'affiche dans un panneau latéral dédié.
- Les zones de lecture peuvent être détectées automatiquement ou ajoutées manuellement.
- Le panneau OCR permet de corriger le texte d'une bulle depuis la zone `Texte analysé`. `Entrée`, le bouton `Analyser` ou la sortie du champ enregistrent la correction dans l'OCR, puis les actions audio utilisent le texte corrige.
- Les bulles corrigees sont marquees dans les donnees OCR pour conserver la correction lors d'un recalcul OCR lorsque l'identifiant de bulle reste stable.
- Le bouton de telechargement audio OCR enregistre la bulle courante via VOICEVOX sans rappeler l'API si l'audio est deja en cache avec les memes reglages. Le dossier cible est configurable dans l'onglet Lecteur ; vide, l'application utilise le dossier utilisateur par defaut.
- Le detail d'un token peut lire uniquement le texte de ce token via les reglages VOICEVOX courants.
- Les raccourcis configurables permettent de lire la bulle OCR courante, puis de la relire plus lentement ou plus rapidement. Le pas de vitesse est regle dans l'onglet Lecteur et cette vitesse temporaire revient a la valeur par defaut quand la selection OCR change.
- Le détail d'un token JPDB peut afficher son type grammatical et sa forme détectée pour les verbes, les adjectifs en `い` et les adjectifs en `な`. Ces libellés ouvrent une fiche explicative en Markdown, avec un fil d'Ariane interne pour naviguer entre les fiches liées.
- Le panneau OCR permet de choisir manuellement l'ordre des bulles, avec un raccourci configurable sans valeur par défaut ; les traductions sont alors relancées en chaîne avec la phrase japonaise et la traduction anglaise précédentes comme contexte JPDB. Une fois l'ordre validé, deux raccourcis configurables sans valeur par défaut permettent d'aller à la bulle ordonnée précédente ou suivante, même si aucune bulle n'est encore sélectionnée.
- L'onglet Lecteur des paramètres pilote la largeur maximale de l'image, la barre de progression, la force de scroll, la vitesse du scroll maintenu, l'impulsion initiale du scroll clavier, le préchargement image et une section `Lecteur d’écran` dédiée au pré-rendu OCR, au préchargement de l'analyse JPDB des bulles, au préchargement optionnel des détails de token, aux garde-fous de navigation clavier et à l'ouverture automatique du panneau pour les mangas marqués en japonais (`language = ja`). Il pilote aussi l'inclusion optionnelle des bookmarks dans les propositions de fin de lecture et l'ouverture surprise via `Suivant`.
