# Lagon Kart — suivi de la démo

État au **7 octobre 2026**. `[x]` = réalisé avec preuve ; `[ ]` = travail ou validation restant à terminer. [Démo intégrée et rapports](docs/DEMO.md).

## Accueil classé et ergonomie

- [x] Grade et MMR réels sur l’accueil ; recherche et annulation classées directes, file unique, actualisation après résultat et connexion.
- [x] Créer, Rejoindre et Entraînement sans scroll à 320×568 ; barre Prêt fixe avec pilotes attendus, au-dessus des réglages du bas.
- [x] Invitations par partage/copie et QR local réellement décodé et suivi par un second navigateur.
- [x] Modes tactiles explicites, aide en course, HUD dégagé ; graphismes Auto/Fluide/Détaillé mémorisés, menu plafonné et scène suspendue derrière les dialogues.
- [x] Modules déplacés directement sur le plan ; essais privés sans publication ni progression, puis publication explicite pour la classe.
- [x] **426/426 tests**, **19 parcours navigateur privés** répartis entre ranked/QR, éditeur, conduite et audit final ; captures avant/après et limites distinctes. [Preuves](docs/ux-home/README.md) · [Validation](VALIDATION.md#7-octobre-2026--accueil-classé-et-ergonomie).
- [x] Docker déployé sans salon actif : 42 fichiers/39 profils préservés, bundles/modules vérifiés. Tunnel Cloudflare invalide rétabli avec un nouveau lien. [Déploiement](docs/ux-home/deployment.json).
- [x] **3 parcours publics** passent à deux profils : QR/Prêt, départ et déplacement WSS, essai privé sans publication, MMR inchangé ; aucun salon d’autres joueurs interrompu. [Rapport](docs/ux-ranked/public/browser-validation.json).
- [ ] Téléphones physiques, Safari iOS, fluidité GPU et partage natif réel.

## Conduite, atelier et soirées

- [x] Contacts de mur selon l’angle, sans avantage à rouler contre le rail ; enchaînements de drift, saut, looping et réception avec bonus plafonnés.
- [x] Objets de remontée selon l’écart réel, protection contre les attentes/reculs/resets, relais d’aspiration alliés limités. [Règles](docs/race-fun/README.md).
- [x] Plaques partageant temporairement turbo ou impulsion de tremplin, annonce préalable, géométrie stable et sources sauvegardées. Quatre CPU terminent trois tours avec ces modules.
- [x] Essayer un passage, recommencer instantanément et revenir aux réglages ; aucune récompense de carrière. **4 contrôles navigateur** réussis, mobile 320 px inclus. [Preuves atelier](docs/interactive-workshop/README.md).
- [x] Soirée : trois choix de circuit, vote de huit secondes, même salon et scores conservés ; faits marquants calculés et replay partageable au bon passage.
- [x] Couronne : 90 secondes sans élimination, points par progression, vols après attaques efficaces, protection temporaire, aucun XP/MMR/record. **3 parcours navigateur** à deux profils passent. [Mode d’emploi et preuves](docs/party-crown/README.md).
- [x] **407/407 tests**, TypeScript, build de production et image Docker réussis. [Validation](VALIDATION.md#7-octobre-2026--conduite-atelier-et-soirées).
- [x] Essai de l’expérience existante et neuf améliorations UX proposées, avec observations et critères de réussite. [Audit](docs/fun-experience/README.md).
- [x] Docker déployé sans salon actif : **31 fichiers et 36 profils conservés**, modules et bundles identiques au build, tunnel inchangé. [Preuve](docs/fun-experience/deployment.json).
- [x] **3 parcours publics** sans fixture passent : deux profils, Couronne 90 s, vote 8 s, salon et points conservés, second départ, replay horodaté ; zéro erreur JS et salon fermé. [Rapport](docs/party-crown/public/browser-validation.json).
- [ ] Essai humain de l’équilibrage ; téléphone physique, Safari iOS, deux machines et performances GPU.

## Accueil connecté et circuits à plusieurs tours

- [x] Panneau des joueurs en ligne : pseudos, nombre de joueurs, activités et recherches classées réelles ; déduplication multi-onglets, exclusion des CPU et expiration des connexions coupées. [Fonctionnement](docs/PRESENCE.md).
- [x] Pseudo de l’accueil synchronisé après validation du champ, sans requête par frappe ni écrasement d’une saisie plus récente.
- [x] Éditeur : **1–20 tours**, ponts, tremplins, loopings et **événements au tour choisi**, avec réglages, aperçu, annuler/rétablir, brouillon et révisions persistantes. [Mode d’emploi](docs/TRACK_EDITOR.md).
- [x] Météo et surfaces temporaires réelles, communes à tous au tour du premier pilote ; compteur, limite de course et replays adaptés au nombre de tours. Anciennes pistes inchangées.
- [x] **372/372 tests** de la suite passent. Huit CPU terminent **six tours** avec pont, vol et looping inversé observés ; replay de vingt tours et 2 000 s sauvegardé puis relu. Deux clients Colyseus reçoivent les mêmes règles/modules. [Suite](docs/editor-features/unit-validation.json).
- [x] **6 contrôles navigateur** de l’éditeur passent : création des modules et événements 1/4/5, persistance relue, essai normal avec compteur /6, duplication mobile et salon partagé à deux. Aucun tour ni arrivée injecté. [Rapport](docs/editor-features/browser-validation.json).
- [x] **2 contrôles visuels** sur le build final : badges des tours regroupés et légende lisible en portrait 320 px et sur ordinateur. [Captures et protocole](docs/editor-features/visual-validation.json).
- [x] **8 parcours navigateur de présence** passent : vrai invité et pseudo, sauvegarde lente, deux profils/trois onglets, recherche classée réelle, annulation, entraînement et déconnexion ; aucune erreur JS. [Preuves](docs/presence/README.md).
- [x] Version finale déployée : 26 fichiers, 32 profils et circuit historique conservés, quatorze modules et bundles publics identiques au build, tunnel inchangé. [Déploiement](docs/editor-features/deployment.json).
- [x] **3 contrôles publics** passent : présence réciproque, sauvegarde et relecture du circuit enrichi, course WSS à deux avec compteur /6 et déplacement normal. Aucune erreur JS, trois captures inspectées, salons fermés. Exemple « L’atelier des loopings » conservé ; six tours complets et file classée non rejoués en public. [Rapport](docs/editor-features/public/browser-validation.json).
- [ ] Téléphone physique et Safari iOS ; l’éditeur ne dessine pas encore de bifurcations distinctes du tracé principal.

## Joystick complet et liberté de création

- [x] Joystick mobile sur deux axes : haut pour accélérer, bas pour freiner puis reculer, diagonales et multitouch. Le frein prime sur AUTO ; AUTO OFF permet le pilotage manuel au même pouce.
- [x] Suppression des blocages de proximité, virages serrés, croisements, portions superposées et longueur du circuit. Points exactement collés et zones superposées acceptés ; géométrie des anciennes versions conservée. [Mode d’emploi](docs/TRACK_EDITOR.md).
- [x] Capacité étendue à 3–128 points, route de 4–80 m, coordonnées ±2 000 m et 64 zones. Les valeurs non finies et routes entièrement réduites à un point restent refusées.
- [x] **349/349 tests** passent, dont les entrées mobiles, la publication/persistance des points collés et dix formes créatives avec huit CPU sans état invalide. Build et image Docker réussis. [Rapport](docs/mobile-stick/unit-validation.json).
- [x] **12 contrôles mobiles Chromium** passent à 320 × 568 et 667 × 375 : mouvements réels, entrées Colyseus, AUTO, drift/objet multitouch et neutralisation. Trois captures inspectées ; triple turbo privé et perte de focus synthétique déclarés. [Rapport](docs/mobile-stick/validation.json).
- [x] **6 contrôles de l’atelier** passent : points collés réellement publiés, essai en jeu et retour, brouillon restauré, duplication tactile à 320 px ; aucune erreur JS. [Rapport](docs/creative-tracks/browser-validation.json).
- [x] Docker mis à jour à zéro salon ; 25 fichiers de données et 31 profils conservés, circuit rouvert et tunnel inchangé. [Preuve](docs/mobile-stick/deployment.json).
- [ ] Confort sur téléphone physique et Safari iOS ; la simulation finie ne garantit pas que chaque création extrême soit terminable par les CPU.

## Tournois : nombre de courses conservé

- [x] Bug reproduit : un tournoi de huit courses non encore appliqué revenait à deux lors de l’activation des équipes. Le brouillon survit désormais aux réglages CPU/événements/équipes ; un message et les boutons Prêt/Départ évitent de partir sur l’ancien programme. [Détails](docs/tournament-fix/README.md).
- [x] **9 tests ciblés**, **8 contrôles navigateur de configuration** et **quatre vraies courses complètes** à deux clients SDK réussis ; aucun changement du moteur de course.
- [x] **15 contrôles navigateur des huit manches** réussis : départs et touches ordinaires, arrivées synthétiques déclarées, bouton suivant après la deuxième jusqu’à la huitième, podium, revanche et huit replays privés relus. [Rapport](docs/tournament-fix/browser-transitions.json).
- [x] Docker corrigé, données et tunnel conservés ; **4 contrôles publics** confirment huit courses après réglages, application et départ réel 1/8 avec sept CPU. Aucune erreur JS/asset, zéro salon restant. [Rapport](docs/tournament-fix/public.json).

## Éditeur de circuits et bibliothèque de la classe

- [x] Atelier visuel : points manipulables, ajout/suppression, départ déplaçable, annuler/rétablir, dix thèmes, largeur et zones turbo/glace/boue. Brouillon local par profil et contrôle des données ; les restrictions créatives du lot initial sont désormais levées. [Mode d’emploi](docs/TRACK_EDITOR.md).
- [x] Sauvegardes dans `data/tracks/`, révisions immuables, bibliothèque partagée, édition par l’auteur et duplication pour les autres joueurs ; authentification et montage de données existants conservés.
- [x] Créations jouables en entraînement, salon et tournoi ; définitions synchronisées avec Colyseus et anciennes versions conservées pendant les courses et pour les replays.
- [x] **330/330 tests** de la suite complète et **8/8 tests complémentaires** de salon réussis. **8/8 pilotes** terminent trois tours dans une vraie course réseau malgré une publication pendant la course, sans reset CPU, avec progression sauvegardée. [Rapport](docs/editor/race-validation.json).
- [x] **6 contrôles navigateur** réussis : édition souris/clavier/tactile, annulation, erreur réseau sans perte, brouillon restauré, entraînement et retour à l’éditeur, duplication par un second profil à 320 px. Cinq captures inspectées ; corrections d’ergonomie appliquées. [Rapport](docs/editor/browser-validation.json).
- [x] Décors raccordés aux créations : **10 thèmes contrôlés**, empreintes hors route et forêt inspectée en jeu. **4 contrôles publics** réussis : publication par l’UI, découverte par un autre profil et conduite réelle dans un salon partagé à deux, sans erreur JS/asset. Exemple « La boucle de l’atelier » conservé. [Rapport public](docs/editor/public/browser-validation.json).
- [x] Build et Docker déployés ; recréation réelle après publication, **22 fichiers de données et 29 profils inchangés**, circuit toujours proposé, bundles/modules identiques au build et tunnel conservé. [Persistance et déploiement](docs/editor/deployment.json).
- [ ] Essai humain sur téléphone physique. Les déviations distinctes du tracé principal ne sont pas encore dessinables ; ponts, sauts et loopings sont ajoutés dans le lot ci-dessus.

## Pilotes caricaturaux : quatorze choix

- [x] Retrait du personnage ambigu demandé par l’utilisateur ; le catalogue conserve les cinq anciens, Macron, Merkel, Napoléon et six références aux jeux, séries et films, soit neuf ajouts. Accessoires distinctifs et descriptions humoristiques. [Casting](docs/CHARACTERS.md).
- [x] Animations de conduite, impact et victoire sur trois châssis et huit peintures ; géométries partagées et couleurs indépendantes. Aucun asset ou service payant, aucune dépendance ajoutée : **0 €**.

- [x] Catalogue à 14 et repli de l’ancien choix vers le pilote casqué validés ; **6 contrôles de rendu** réussis sur **84 instances**. Galerie régénérée et portrait retiré. [Rapport actuel](docs/characters/validation.json).
- [x] Build et Docker réussis ; déploiement sans salon actif, **21 fichiers de sauvegarde inchangés** et tunnel conservé. [Contrôle du retrait](docs/characters/removal-deployment.json).

- [x] Chromium public : 14 choix, ancienne sélection remplacée par le pilote casqué et aperçu rendu à 320 px sans erreur JS. [Rapport](docs/characters/removal-browser.json).

### Historique du lot initial à quinze pilotes, avant retrait

Ces résultats concernent les dix ajouts initiaux. Ils ne valident pas le retrait
ultérieur ; les nouveaux contrôles sont indiqués dans [VALIDATION.md](VALIDATION.md).

- [x] **27 tests ciblés** et **6 contrôles de rendu Chromium** réussis sur le casting initial ; 90 instances, quinze portraits inspectés, conduite identique pour les 45 couples pilote/châssis. La [galerie courante](docs/characters/lineup.png) est régénérée après retrait.
- [x] Sélecteurs du garage agrandis à 44 px sur petit écran ; capture à 320 × 568 sans débordement horizontal.
- [x] **6 contrôles privés du garage/réseau**, les dix choix répliqués entre deux navigateurs, restauration et départ réel à huit karts ; aucune erreur JS/asset. [Rapport](docs/characters/roster-browser-validation.json).
- [x] Déploiement Docker validé, cinq modules et deux assets identiques au build ; **21 fichiers de sauvegarde intacts**, tunnel conservé. [Preuves](docs/characters/deployment.json).
- [x] **7 contrôles publics réussis** : garage mobile 320 px, deux navigateurs HTTPS/WSS, choix conservé et partagé, départ/conduite réels à deux, aucune erreur et retour à zéro salon. [Rapport](docs/characters/public/roster-browser-validation.json).
- [ ] Essai sur téléphone physique ; ce lot n’a pas rejoué une course complète ou un championnat.

## Bots bloqués par les fermetures et les rails

- [x] Cas reproduits sur plusieurs circuits : un CPU visait une autre voie à travers un rail. Conservation de la branche engagée, poursuite sur la principale après le barrage, anticipation et vitesse adaptées à la voie réelle.
- [x] Remise en piste ordinaire en cas de contact bloquant, respectant les ouvertures, sauts, hauteur et délai ; aucun gain artificiel de tour ou checkpoint.
- [x] **29 nouveaux tests**, 234 scénarios conduits ; matrice complémentaire de **360 placements : 34 échecs avant → 0 après**. **96 CPU sur 96** terminent les douze pistes. [Preuves](docs/cpu-obstacles/simulation-validation.json).
- [x] **312/312 tests** de la suite complète réussis ; **3 contrôles navigateur** avec fermetures réelles dans deux salons privés et quatre captures inspectées. [Protocole](docs/cpu-obstacles/README.md).
- [x] Docker déployé, sept modules identiques au build ; sauvegardes et tunnel conservés. [Déploiement](docs/cpu-obstacles/deployment.json).
- [x] Course publique Mangrove : **8/8 arrivées**, dont sept CPU serveur, trois phases, **0 reset observé**, aucune immobilisation durable ni erreur Colyseus ; résultats réellement gagnés sauvegardés et salon fermé. [Rapport](docs/cpu-obstacles/public-race.json).

## Comptes de classe et sauvegardes sur la machine

- [x] Compte par nom d'utilisateur et mot de passe, sans courriel ni service externe ; mot de passe dérivé avec scrypt et sel individuel. L'inscription conserve le pilote invité actuel ; connexion et déconnexion depuis l'accueil.
- [x] Dossier hôte `data/players`, monté dans Docker et conservé après recréation ou `down -v` ; initialisation des droits et scripts de migration, archive et reset. [Mode d'emploi](docs/ACCOUNTS_STORAGE.md).
- [x] Récupération du même ID, des XP, coupes, déblocages, statistiques et replays depuis une nouvelle session ; plusieurs sessions indépendantes. **283/283 tests** de la suite complète réussis. [Validation](VALIDATION.md#7-octobre-2026--comptes-et-sauvegardes-sur-la-machine-hôte).
- [x] **9 contrôles navigateur privés**, écran de 320 px, aucun échec JS/asset ; fixture de progression déclarée et vrai salon Colyseus. [Rapport et captures](docs/accounts/browser-validation.json).
- [x] **4 contrôles Docker de persistance** après `down -v` et changement de projet, puis connexion sans ancien jeton ; **8 contrôles de migration** et archive restaurable. [Persistance](docs/accounts-persistence.json) · [Migration](docs/storage-migration-check.json).
- [x] Données de la démo migrées : **21 profils, 20 fichiers**, ancien volume conservé et archive locale créée. **Reset réel exécuté**, fichiers SHA-256 identiques après recréation, tunnel inchangé et jeu sain. [Déploiement](docs/accounts/deployment.json).
- [ ] Essai humain de connexion depuis deux machines physiques et saisie sur téléphone réel.
- [x] **4 contrôles publics** : inscription et connexion sur deux navigateurs indépendants via HTTPS, même pilote dans un salon Colyseus, déconnexion et retour à zéro salon ; aucune erreur JS/asset. [Rapport](docs/accounts/public-validation.json).

## Petits écrans, identité des pistes et loopings — lot précédent

- [x] Analyse des commandes de Mario Kart Tour et Asphalt à partir de leurs sources officielles ; direction au pouce gauche, actions au pouce droit, accélération automatique facultative. [Analyse et décisions](docs/MOBILE_CONTROLS.md).
- [x] HUD tactile compact, boutons d’au moins 44 px, appuis simultanés et neutralisation sur interruption : six tests d’état et **15 contrôles Chromium** sur cinq formats de 320 × 568 à 667 × 375. [Rapport et captures avant/après](docs/mobile-controls/validation.json).
- [x] **Douze tracés redessinés**, 36 branches conservées ; **deux loopings magnétiques** de 32 m et 27 m, retournement réel partagé par simulation et rendu, collisions en 3D, arrêt/reprise et marche arrière. [Fonctionnement](docs/LOOPINGS.md).
- [x] **Douze compositions de décor** : terrains adaptés à chaque piste, phare, canyon, glacier, ville, mangrove, oasis, volcan, arbre-maison, port, observatoire, fonderie et citadelle. Géométries regroupées et arbre Kenney CC0 local versionné, chargé une fois. Coût ajouté **0 €**, aucune dépendance nouvelle. [Sources et contrôles des voies dégagées](docs/SCENERY.md).
- [x] Anciennes courses conservées ; anciens replays indiqués comme tracés historiques, exclus des fantômes sur les nouvelles pistes. Révision de circuit enregistrée dans les nouveaux replays, tests de persistance et compatibilité réussis.
- [x] Suite complète **266/266 tests réussis**, sans test ignoré, en 63,21 s. Les essais de rendu et du déploiement sont consignés séparément dans [VALIDATION.md](VALIDATION.md).
- [x] Revue visuelle terminée : **12 panoramas actuels**, **12 vues de loopings** et **7 captures mobiles**, avec portée et builds distincts. Route et kart visibles dans les deux loopings ; panoramas cadrés, stries des branches supprimées, compteur et panneaux dégagés sur petit écran. [Galerie et rapports](docs/scenes-v2/README.md).
- [x] TypeScript et Docker réussis ; déploiement sans salon actif, volume de progression conservé. Huit assets publics et sept modules serveur identiques au build local par SHA-256. [Empreintes finales](docs/mobile-scenes-public-assets.json).
- [x] Course publique sur le build courant : **4/4 pilotes SDK terminent trois tours**, sautent et passent inversés dans le looping de Sky ; six connexions, dont deux observateurs desktop/mobile, partagent le même classement. Contrôle en **143,537 s**, replay de révision 2 avec 603 images par pilote, profils enregistrés et aucune erreur JS/asset. Commandes ordinaires, sans arrivée forcée. [Rapport](docs/mobile-scenes-public-race.json) · [Résultats](docs/mobile-scenes-public-resultats.png). SwiftShader à 2,25/2,65 FPS ne valide pas la fluidité GPU ou deux machines physiques.

Les résultats des sections suivantes concernent le lot du 6 octobre et les lots antérieurs. Ils restent des preuves historiques ; les versions de leurs rapports font foi.

## Couverture du cahier des charges ajouté à la racine

Le fichier [to-do.md](to-do.md) reste le cahier des charges de référence. Les huit domaines sont désormais implémentés ; le build, Docker et la course publique finale ont été validés. Les preuves et les essais humains restants sont distingués ci-dessous. Les essais automatisés ne remplacent pas le ressenti des joueurs.

| Besoin | Implémentation et preuves | Limites / contrôle restant |
| --- | --- | --- |
| 1. Construction et personnalisation | Garage : six catégories, 18 pièces avec effets réels, compromis et déblocages ; trois modèles importés, huit couleurs et aperçu rapproché. Neuf tests du garage et parcours de reconnexion dans le navigateur. | Parcours UI à 12 circuits : 11 contrôles réussis, avec les arrivées de fixture signalées. |
| 2. Circuits évolutifs | 12 pistes ; phases partagées, surfaces/météo, route barrée au tour 2 et raccourci au tour 3. Six nouvelles pistes ont pont et tremplin physiques. [Circuits](docs/CIRCUITS.md). | Huit contrôles navigateur réussis, 25 captures ; positions de départ et pauses de capture documentées. |
| 3. Plusieurs stratégies par circuit | 36 branches de 12–14 m ; raccourcis 15–28 % plus courts que la route normale. 24 comparaisons sur kart standard et chargé montrent un gain réel, sans turbo artificiel. [Mesures](docs/branch-comparison.json). | Le confort de conduite au clavier reste à apprécier avec les joueurs. |
| 4. Championnats et progression | Six coupes, paliers 0 à 3 et sauvegarde serveur ; les 12 pistes sont introduites progressivement, finale à huit courses. Tests HTTP, persistance et parcours UI avec arrivées de fixture explicitement signalées. | Aucune conduite humaine complète des six coupes n'est revendiquée. |
| 5. Personnages humoristiques | Pilote, Reine, Obama, Trump et Kim en géométrie cartoon originale ; accessoires, expressions et animations. Sélections transmises entre deux clients. [Personnages](docs/CHARACTERS.md). | Lisibilité artistique à évaluer sur les machines de démo. |
| 6. Mode équipes | 4 contre 4, humains et CPU, scores de tournoi cumulés, rôles CPU et absence de tirs alliés. Deux humains + six CPU contrôlés dans l'interface ; huit CPU finissent les 12 pistes en simulation. [Équipes](docs/TEAMS.md). | Interface et simulations vérifiées ; ressenti humain du 4 contre 4 à apprécier en démo. |
| 7. Ranked amélioré | MMR Bronze à Master, matchmaking réservé aux profils attendus, saisons trimestrielles, statistiques, tournois, replays et fantômes. [Progression](docs/PROGRESSION.md). | Classement commun à cette instance, pas une fédération de serveurs ; essais de charge à grande échelle non exécutés. |
| 8. Philosophie générale | Jeu existant conservé, modes avancés séparés, budget 0 €, aucune API payante ni nouvelle dépendance. | Facilité, équilibre, fluidité GPU et écoute musicale nécessitent un essai humain. |

## Derniers retours et validation intégrée

- [x] Murs et obstacles à hauteur finie : passage réel au-dessus des rails/barrages, collisions basses et sous les ponts, réentrée, ouvertures par phase et portes de tour. Un vrai tremplin permet de sauter un rail fermé puis d’atterrir dehors. [Preuves](docs/VERTICAL_COLLISIONS.md).
- [x] Déviations plus larges et entrées progressives ; raccourcis réellement plus courts. 33 tests d'événements réussis, 96 arrivées sur 96 sans reset et 36 branches parcourues sans drift ni sortie de piste.
- [x] Six pistes supplémentaires : volcan, forêt, port, ciel, fonderie, château, pour **12 circuits** au total. Ponts, rampes, décollage/atterrissage et prédiction déterministe ; 44 tests de pistes et sept tests de physique verticale réussis.
- [x] Tours non comptés : portes adaptées aux accotements et aux branches, franchissement ordonné, ligne d'arrivée et passage en l'air ; reset à la bonne hauteur. [Correctif et tests](docs/LAPS.md).
- [x] Build TypeScript/Vite et image Docker construits ; le tirage aléatoire accepte les 12 pistes avec une limite de huit manches.
- [x] Suite complète : **237/237 tests réussis**, sans test ignoré ; un test supplémentaire tremplin → rail → atterrissage extérieur réussit ensuite séparément. Build TypeScript/Vite et image Docker reconstruits.
- [x] Six nouveaux décors, ponts et sauts : **8 contrôles navigateur réussis**, 25 captures ; six accélérations clavier, décollages et atterrissages normaux, puis tournoi aléatoire de huit manches parmi les six nouvelles pistes. [Preuves et limites](docs/circuits-expanded/validation.json).
- [x] Persistance : une course SDK complète crée XP, statistiques, replay et fantôme ; tout est conservé après recréation d’un conteneur sur son volume temporaire. Test sur le build précédent à 12 circuits, avant les murs finis. [Rapport et empreinte](docs/docker-persistence.json).
- [x] Démo Docker mise à jour en l’absence de salons ; les fichiers physiques partagés et les assets publics correspondent aux fichiers compilés locaux. [Empreintes](docs/final-public-assets.json).
- [x] Course publique finale : **4/4 pilotes SDK finissent trois tours**, deux navigateurs observateurs, trois modèles, quatre personnages, sauts et phases 0/1/2, profils et replay commun enregistrés. **125,721 s** pour le contrôle ; aucune erreur JavaScript ni ressource manquante. [Rapport](docs/final-public-race.json) · [Résultats](docs/final-public-resultats.png).
- [x] Panoramas : précision de profondeur corrigée, huit comparaisons à cadrage fixe avec et sans ombres. [Captures avant/après](docs/overview-depth/README.md).

Le premier conducteur SDK sur `sky` avait dépassé le délai au deuxième tour : [échec conservé](docs/docker-race-timeout.json). Sa cause initiale n’est pas établie. Les reproductions suivantes ont terminé avec les commandes ordinaires, dont la course Docker de persistance en **108,4 s simulées** (**117,697 s** pour le test complet). Ces preuves précisent leur image/bundle ; elles ne sont pas présentées comme la course publique finale.

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
- [ ] **Priorité 1 — téléphones physiques.** Les contrôles tactiles et cinq formats sont validés en émulation Chromium. Essayer désormais une course sur Android et Safari iOS : confort des pouces, interruptions système, audio après verrouillage, fluidité GPU et réseau mobile restent à valider sur les appareils réels.
- [ ] **Suivi ultérieur — dépendances transitives.** Les trois entrées d'audit liées à NanoID 2.1.11/Colyseus 0.16 restent documentées dans [les limites connues](VALIDATION.md#limites-connues). Une éventuelle mise à niveau devra revalider le réseau ; aucune migration de dépendances n'est incluse dans cette démo.

Les rapports de travail sont dans `test-results/` et ignorés par Git ; les preuves de livraison sont conservées dans `docs/demo-results/` et `docs/kart-visuals/`. Mettre à jour les cases uniquement après une exécution ou une vérification effective, puis synchroniser les comptes rendus de validation.
