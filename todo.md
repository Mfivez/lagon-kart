# Lagon Kart — suivi de la démo

État au **6 octobre 2026**. `[x]` = réalisé avec preuve ; `[ ]` = travail ou validation restant à terminer. [Démo intégrée et rapports](docs/DEMO.md).

## Couverture du cahier des charges ajouté à la racine

Le fichier [to-do.md](to-do.md) reste le cahier des charges de référence. Les huit domaines sont désormais implémentés ; la validation finale et le déploiement sont suivis séparément ci-dessous. Les essais automatisés ne remplacent pas le ressenti des joueurs.

| Besoin | Implémentation et preuves | Limites / contrôle restant |
| --- | --- | --- |
| 1. Construction et personnalisation | Garage : six catégories, 18 pièces avec effets réels, compromis et déblocages ; trois modèles importés, huit couleurs et aperçu rapproché. Neuf tests du garage et parcours de reconnexion dans le navigateur. | Contrôle du dernier build à 12 circuits en cours. |
| 2. Circuits évolutifs | 12 pistes ; phases partagées, surfaces/météo, route barrée au tour 2 et raccourci au tour 3. Six nouvelles pistes ont pont et tremplin physiques. [Circuits](docs/CIRCUITS.md). | Captures des nouveaux thèmes et ponts/sauts en cours. |
| 3. Plusieurs stratégies par circuit | 36 branches de 12–14 m ; raccourcis 15–28 % plus courts que la route normale. 24 comparaisons sur kart standard et chargé montrent un gain réel, sans turbo artificiel. [Mesures](docs/branch-comparison.json). | Le confort de conduite au clavier reste à apprécier avec les joueurs. |
| 4. Championnats et progression | Six coupes, paliers 0 à 3 et sauvegarde serveur ; les 12 pistes sont introduites progressivement, finale à huit courses. Tests HTTP, persistance et parcours UI avec arrivées de fixture explicitement signalées. | Aucune conduite humaine complète des six coupes n'est revendiquée. |
| 5. Personnages humoristiques | Pilote, Reine, Obama, Trump et Kim en géométrie cartoon originale ; accessoires, expressions et animations. Sélections transmises entre deux clients. [Personnages](docs/CHARACTERS.md). | Lisibilité artistique à évaluer sur les machines de démo. |
| 6. Mode équipes | 4 contre 4, humains et CPU, scores de tournoi cumulés, rôles CPU et absence de tirs alliés. Deux humains + six CPU contrôlés dans l'interface ; huit CPU finissent les 12 pistes en simulation. [Équipes](docs/TEAMS.md). | Course publique du dernier build à terminer. |
| 7. Ranked amélioré | MMR Bronze à Master, matchmaking réservé aux profils attendus, saisons trimestrielles, statistiques, tournois, replays et fantômes. [Progression](docs/PROGRESSION.md). | Classement commun à cette instance, pas une fédération de serveurs ; essais de charge à grande échelle non exécutés. |
| 8. Philosophie générale | Jeu existant conservé, modes avancés séparés, budget 0 €, aucune API payante ni nouvelle dépendance. | Facilité, équilibre, fluidité GPU et écoute musicale nécessitent un essai humain. |

## Derniers retours et validation intégrée

- [x] Déviations plus larges et entrées progressives ; raccourcis réellement plus courts. 33 tests d'événements réussis, 96 arrivées sur 96 sans reset et 36 branches parcourues sans drift ni sortie de piste.
- [x] Six pistes supplémentaires : volcan, forêt, port, ciel, fonderie, château, pour **12 circuits** au total. Ponts, rampes, décollage/atterrissage et prédiction déterministe ; 44 tests de pistes et sept tests de physique verticale réussis.
- [x] Tours non comptés : portes adaptées aux accotements et aux branches, franchissement ordonné, ligne d'arrivée et passage en l'air ; reset à la bonne hauteur. [Correctif et tests](docs/LAPS.md).
- [x] Build TypeScript/Vite et image Docker construits ; le tirage aléatoire accepte les 12 pistes avec une limite de huit manches.
- [ ] Clore la suite complète du dernier état et les captures navigateur des nouvelles pistes.
- [ ] Vérifier la persistance lors de la recréation d'un conteneur Docker, puis mettre à jour la démo quand les salons sont libres.
- [ ] Rejouer une course complète via le tunnel avec quatre pilotes, deux navigateurs, trois modèles, personnages, sauts et profils enregistrés.

Les réalisations ci-dessous concernent les lots de démo antérieurs ; elles restent des preuves historiques et ne valent pas validation automatique du lot en cours.

## Terminé et vérifié

- [x] Quatre circuits avec tracés et surfaces propres ; aspiration et départ turbo ; tournois de 2 à 8 courses, sélection manuelle ou aléatoire et classement cumulé. Version de référence : commit [`51bbbab`](https://github.com/Mfivez/lagon-kart/commit/51bbbab3c78cc5454124ae67682fad2fdfcd5dde). Voir [README](README.md#circuits-et-tournois) et [historique des validations](VALIDATION.md).
- [x] Kart gratuit **Go Kart de Zsky**, source et licence CC BY 3.0 conservées, crédits accessibles ; GLB local versionné et conversion reproductible sans Blender. Budget **0 €**, aucune API IA payante. Voir [inspection et préparation](docs/KART_ASSET.md).
- [x] Huit peintures indépendantes, géométries partagées, un chargement GLB par page, quatre roues avec pivots et rayons adaptés, braquage avant, inclinaison visuelle et ombre de contact ; ancien kart disponible en secours. La présentation ne modifie pas les trajectoires ni les collisions.
- [x] **63 tests réussis**, build TypeScript/Vite et image Docker construits ; conversion `npm run check:kart` vérifiée. Voir [rapport de démo](docs/DEMO.md#tests-exécutés).
- [x] **8 contrôles visuels réussis**, dont partage des géométries, couleurs, animation, garde au sol et secours après HTTP 404. [Captures avant/après à cadrage identique](docs/kart-visuals/README.md).
- [x] Correction du suivi de caméra à faible cadence vérifiée à **3 FPS** : kart dans le champ et état physique intact. Commande : `node --import tsx scripts/kart-visual-check.ts --camera-only` ; rapport local : `test-results/kart-camera.json`.
- [x] Course complète via **Docker et tunnel public** : quatre pilotes SDK terminent trois tours, deux sessions Chromium observatrices affichent les mêmes résultats, sans erreur JavaScript. GLB et crédits sur la même origine HTTPS, connexion WSS vérifiée. Ce résultat ne représente pas deux machines physiques.

- [x] Nouvelle course avec caméra corrigée : réussite en 70,02 s, quatre pilotes et deux observateurs ; résultat consigné dans [KART_DEMO.md](docs/KART_DEMO.md) et [VALIDATION.md](VALIDATION.md).
- [x] Première musique synthétique intégrée et testée, puis remplacée à la demande par les MP3 fournis. Les résultats de son ancien séquenceur restent archivés.
- [x] MP3 fournis intégrés : Lap 1 au premier tour, Lap 2 aux suivants, sur tous les circuits. Originaux conservés, fichiers versionnés locaux, volume/pauses/boucles vérifiés ; **10 contrôles Chromium réussis**, build hôte et Docker valides. [Preuves et fonctionnement](docs/MUSIC.md).
- [x] MP3 déployés et validés sur le tunnel : **course complète en 67,4 s, sortie 0**, quatre pilotes SDK et deux observateurs Chromium ; Lap 1 puis Lap 2, volume, arrêt à l'arrivée, fichiers identiques et zéro erreur JavaScript. [Course](docs/mp3-public.json) · [Intégrité des fichiers](docs/mp3-public-assets.json).
- [x] Huit objets, dont fusée rouge, comète bleue, triple turbo, étoile et bouclier : 13 nouveaux tests des règles, refus de la falsification d'inventaire et **7 contrôles navigateur** couvrant les huit objets. Trois pressions E réelles, durées et HUD vérifiés. [Objets](docs/ITEMS.md).
- [x] Version intégrée reconstruite et course publique complète réussie en **65,036 s** : quatre pilotes SDK, deux navigateurs observateurs, résultats communs, musique/volume/GLB et zéro erreur JavaScript. [Rapport](docs/DEMO.md).

- [x] Tournoi public complet à deux pilotes sur les quatre circuits : **303,565 s, sortie 0**, trois tours chacun, reconnexion, scores, revanche, programme aléatoire et isolation des salons. L'historique du premier lancement interrompu après ses résultats est conservé dans [le rapport](docs/DEMO.md).

## Priorités restantes et critères de validation

- [ ] **Priorité 2 — essai humain sur deux ordinateurs.** Depuis le lien public, deux personnes rejoignent le même salon, conduisent au clavier, utilisent les objets, terminent une course et lancent la suivante. Vérifier aussi une reconnexion. Si possible, utiliser deux réseaux distincts. Suivre la [procédure manuelle](VALIDATION.md#refaire-les-vérifications-manuelles).
- [ ] **Priorité 2 — fluidité sur les machines de démo.** Activer l'accélération graphique, relever les performances dans les navigateurs habituels et vérifier la lisibilité du kart, les roues, la caméra et le son en conduite. Les captures SwiftShader et le contrôle à 3 FPS ne démontrent pas une fluidité à 60 FPS sur GPU.
- [ ] **Priorité 2 — écouter les MP3 en jeu.** Vérifier à l'oreille l'équilibre musique/moteur sur les haut-parleurs des collègues, ainsi que la transition du premier au deuxième tour. La validation automatisée ne remplace pas cette écoute.
- [ ] **Conditionnel — téléphone.** Si le public de la démo utilise un mobile, tester commandes tactiles, cadrage, audio et connexion au salon sur un vrai téléphone. Ce support reste non validé.
- [ ] **Suivi ultérieur — dépendances transitives.** Les trois entrées d'audit liées à NanoID 2.1.11/Colyseus 0.16 restent documentées dans [les limites connues](VALIDATION.md#limites-connues). Une éventuelle mise à niveau devra revalider le réseau ; aucune migration de dépendances n'est incluse dans cette démo.

Les rapports de travail sont dans `test-results/` et ignorés par Git ; les preuves de livraison sont conservées dans `docs/demo-results/` et `docs/kart-visuals/`. Mettre à jour les cases uniquement après une exécution ou une vérification effective, puis synchroniser les comptes rendus de validation.
