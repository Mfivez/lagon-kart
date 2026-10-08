# Boost en course normale — 7 octobre 2026

Le boost fonctionne hors entraînement sur **Île des Alizés (`lagon`)**, dans des salons ordinaires à deux pilotes (`practice=false`, `ranked=false`, sans atelier). Les essais utilisent le déploiement public par HTTPS/WSS ; aucune position, réserve d'objets ou valeur de boost n'est injectée.

| Vérification exécutée | Résultat mesuré | Preuve |
| --- | --- | --- |
| Navigateur mobile Chromium, commandes tactiles réelles et adversaire SDK | Bande `lagon-boost-0` : boost de 1,05 s, pointe serveur à **46 m/s**, contre une limite normale de 32 m/s ; affichage « TURBO ! » | [Rapport navigateur](validation.json), [capture](boost-in-normal-race.png), [échantillons serveur](samples.json) |
| Deux clients Colyseus sur le serveur public, objets ramassés naturellement | Objet turbo consommé : charge 1 → 0, boost 0 → **2,2 s**, vitesse **32 → 46 m/s** (environ 115 → 166 km/h). Deux bandes activées également | [Rapport réseau](network-validation.json) |
| Simulation partagée, Neon, deux pilotes et trois tours | Deux arrivées, vitesse maximale 46 m/s ; état des pilotes identique à chaque pas avec les drapeaux normal, entraînement et classé | [Rapport simulation](rules-validation.json) |

Aucune erreur JavaScript ou Colyseus observée dans les essais réussis. Les connexions de test et le navigateur ont été fermés. Aucun code du jeu n'a été modifié. Les tests ciblés de simulation, objets, circuits, garage et interactions ainsi que `npm run typecheck` ont réussi.

## Portée et premier essai

Les contrôles publics sont volontairement bornés à l'obtention de la preuve : 28,63 s de course pour le navigateur, 12,93 s pour le scénario SDK. Ils ne constituent pas deux courses terminées. Seule la simulation Neon termine trois tours.

Un [premier essai navigateur](browser-attempt-1.json) avait déjà confirmé une bande à 46 m/s, mais exigeait aussi un objet turbo que le tirage aléatoire n'a pas fourni. Son échec et sa [capture](browser-attempt-1.png) sont conservés. Le contrôle navigateur final cible la bande ; l'objet turbo a été vérifié séparément par les clients réseau.

La capture et les valeurs du HUD sont prises à des instants légèrement différents ; les vitesses de référence proviennent des états serveur. Les fenêtres de mesure du scénario SDK peuvent contenir plusieurs sources successives de boost, comme indiqué dans son rapport.

Restent hors de cette vérification : téléphone physique, Safari, fluidité sur GPU réel, tous les autres circuits en réseau, parcours de matchmaking classé, geste humain de mini-turbo et triple turbo en réseau. Un objet aperçu en simulation ne vaut pas une activation individuellement mesurée.

## Reproduction

Depuis la racine du projet, avec les dépendances installées :

```bash
node --import tsx scripts/boost-rules-check.ts
BASE_URL=https://votre-deploiement node --import tsx scripts/boost-network-check.ts
BASE_URL=https://votre-deploiement IDENTITY_FILE=/tmp/identites-test.json node --import tsx scripts/boost-race-check.ts
```

Le scénario navigateur nécessite Chromium installé pour Playwright et un fichier local de deux comptes de test existants, au format `{ "origin": "https://votre-deploiement", "identities": [{ "token": "...", "profile": { "id": "...", "name": "..." } }, ...] }`. Ce fichier contient des secrets et reste hors du dépôt. Le scénario SDK est anonyme et n'en a pas besoin. Chaque scénario réseau crée et ferme son propre salon. Les rapports par défaut sont remplacés à chaque exécution ; utiliser `REPORT_DIR` pour le navigateur ou `REPORT_FILE` pour les deux autres scripts afin de préserver cette référence.
