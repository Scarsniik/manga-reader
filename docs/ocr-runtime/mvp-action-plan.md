# Plan d'action MVP OCR runtime

Date de mise a jour : 2026-04-20

Ce fichier sert de suivi pour le MVP d'externalisation du runtime OCR. Chaque
point garde son numero d'origine pour pouvoir demander la suite sans ambiguite.

## Suivi

1. Decisions MVP a verrouiller
   - Etat : termine le 2026-04-20
   - Notes : decisions documentees dans `technical-spec.md`, `packaging-distribution.md` et `roadmap.md`.

2. Separer configuration utilisateur et configuration runtime
   - Etat : termine le 2026-04-20
   - Notes : module Electron `ocrRuntime` ajoute avec lecture/ecriture de `ocr-runtime.json`. Les informations techniques runtime sont separees de `params.json`.

3. Ajouter la detection du runtime OCR
   - Etat : termine le 2026-04-20
   - Notes : detection ajoutee via `MANGA_HELPER_OCR_RUNTIME_DIR`, `ocr-runtime.json` et emplacement par defaut. Le statut expose `available`, `missing` ou `invalid`.

4. Brancher le worker OCR sur le runtime externe
   - Etat : termine le 2026-04-20
   - Notes : le worker utilise le runtime detecte avant les chemins legacy. En developpement, les anciens chemins restent utilisables en secours.

5. Proteger toutes les actions OCR sans runtime valide
   - Etat : termine le 2026-04-20
   - Notes : les actions qui lancent un calcul OCR passent par une garde commune et retournent `OCR_RUNTIME_MISSING` quand aucun runtime exploitable n'est disponible.

6. Creer les IPC runtime OCR
   - Etat : termine le 2026-04-20
   - Notes : les IPC runtime exposent defaults, statut, choix sans OCR, manifeste, statut d'installation, demarrage installation, annulation, verification, reparation et desinstallation. Le telechargement/extraction reel reste dans le point 8.

7. Implementer le client de manifeste
   - Etat : termine le 2026-04-20
   - Notes : le client lit un manifeste local ou distant, valide le schema MVP, verifie compatibilite application/plateforme et selectionne un telechargement `single` ou `multipart`.

8. Implementer l'installation runtime en tache de fond
   - Etat : termine le 2026-04-20
   - Notes : installation asynchrone ajoutee avec telechargement `single` ou `multipart`, verification SHA256, extraction ZIP, activation du dossier final, metadata locale et mise a jour de `ocr-runtime.json`.

9. Gerer annulation, echec et nettoyage
   - Etat : termine le 2026-04-20
   - Notes : annulation via `AbortController`, nettoyage du dossier temporaire, conservation de `ocr-install-last.log`, et IPC d'ouverture du log.

10. Ajouter la fenetre bloquante au premier lancement
    - Etat : termine le 2026-04-20
    - Notes : un ecran bloquant renderer apparait si aucun runtime valide n'est detecte et si le choix sans OCR n'a pas ete memorise.

11. Ajouter la fenetre de statut installation
    - Etat : termine le 2026-04-20
    - Notes : modale renderer ajoutee pour afficher statut runtime, etape, progression, tailles, erreur, annulation, relance, choix du dossier, ouverture du log et ouverture du dossier runtime.

12. Adapter les points d'entree OCR cote UI
    - Etat : termine le 2026-04-20
    - Notes : les actions OCR du reader, de la file OCR et du panneau manga/vocabulaire detectent `OCR_RUNTIME_MISSING` et ouvrent la proposition d'installation.

13. Refondre la section OCR des options
    - Etat : termine le 2026-04-20
    - Notes : panneau runtime OCR ajoute dans les parametres avec etat, chemin, version, dernier statut, erreurs, installation/statut, verification, reparation, log, ouverture du dossier et desinstallation.

14. Separer le packaging app et runtime
    - Etat : termine le 2026-04-20
    - Notes : `extraResources` n'embarque plus `build-resources/ocr-bundle`. Les commandes `package:app`, `package:app:dir`, `package:ocr-runtime` et `package:all` separent les artefacts.

15. Transformer le script OCR existant en build runtime externe
    - Etat : termine le 2026-04-20
    - Notes : `scripts/package-ocr-runtime.ps1` produit metadata, audit, archive ZIP, manifeste `single` ou `multipart`, avec URLs locales ou base URL de publication.

16. Ajouter notifications internes et Windows
    - Etat : termine le 2026-04-20
    - Notes : fin, echec et annulation d'installation publient une notification Electron/Windows et un toast renderer.

17. Tester les scenarios MVP
    - Etat : pret pour validation manuelle le 2026-04-20
    - Notes : script local ajoute pour generer un manifeste `file://`, une archive ZIP de runtime OCR factice et verifier manifeste/structure avant test dans Electron. Le script de packaging runtime a ete valide sur ce runtime factice. Les scenarios manuels sont listes dans `mvp-test-procedures.md` avec une zone `Resultat reel` a remplir.

18. Mettre a jour la documentation
    - Etat : termine le 2026-04-20
    - Notes : README, specification, packaging, parcours utilisateur, test local, procedures de test et suivi MVP sont a jour pour les points 1 a 17.
