# Soirée, Couronne et replays

Dans un salon classique, l’hôte ouvre **Soirée et mode Couronne**, choisit les options puis **Appliquer ces modes**. Un brouillon non appliqué empêche de se déclarer prêt et de lancer la course. Les invités voient les réglages sans pouvoir les modifier.

- **Soirée** : trois pistes choisies par l’hôte, vote de 8 secondes entre les manches, même salon puis confirmation **Prêt** habituelle. Le tournoi conserve son nombre de manches, ses points et ses critères de départage. Depuis une course simple, activer Soirée crée quatre manches. Le vote remplace seulement la prochaine piste ; égalité ou abstention départagées par rotation parmi les trois choix. Les votes des joueurs partis ne comptent pas.
- **Couronne** : 90 secondes, aucun pilote éliminé. Le porteur marque un point tous les 4 mètres de progression valide. Attendre, reculer, retraverser les mêmes mètres déjà crédités ou se replacer ne rapporte rien. Une attaque efficace, y compris un contact avec une étoile, transfère la couronne. Un simple choc ne la transfère pas. Protection de 3 secondes après attribution ou transfert. Si le porteur part, la couronne revient à un pilote actif ; les déconnectés à la fin sont non classés pour les points de manche.
- **Faits marquants** : changement de tête réel, saut mesuré, arrivée serrée ou transfert de couronne. Seuls les pilotes humains présents dans le replay sont proposés ; un CPU en tête reste bien le leader réel. **Revoir** commence 2,5 secondes avant le passage. **Copier le passage** donne un lien de la même origine contenant `replay` et `t` en millisecondes. Les moments restent accessibles dans le salon suivant après le vote.

Les modes restent séparés du classé et des championnats. Couronne ne donne ni XP, ni statistiques de carrière, ni record ou ghost ; son replay reste consultable. Les circuits, collisions et entrées restent gérés par le serveur.

## Vérifications exécutées

- `node --import tsx --test tests/party-room.test.ts` : **9/9**. Vote éditable et délai strict, moments observés sans faux leader humain derrière un CPU, deux clients réseau et tournoi de six manches conservé, mêmes salon et score après vote, replay Couronne relu depuis disque sans progression de carrière, atelier solo/recommencer sans récompense, deux clients ordinaires recevant la même source de plaque et son activation.
- `tests/crown-game.test.ts` : **7/7**, exécutés par l’agent simulation. Impacts réels, protections, bouclier, étoile, recul et retraversée, vraie conduite jusqu’à 90 secondes au-delà du nombre normal de tours, déconnexion du porteur et rang final des actifs.
- Tests réseau de carrière et de poursuite des tournois existants exécutés avec succès ; `npx tsc --noEmit` réussi.

Les tests réseau raccourcissent explicitement l’horloge de fin Couronne et l’échéance du vote sur leur serveur privé. Le contrôle de plaque place un pilote juste avant celle-ci, puis laisse un mouvement normal la déclencher. Ces fixtures ne sont pas des options du jeu.

## Contrôle navigateur

`npm run test:party-browser` utilise un serveur local et des données éphémères dans `/tmp`. Il prévoit deux profils, un écran de 320 × 568, les vraies 90 secondes de Couronne, un vote réel de 8 secondes, un second départ, un replay horodaté et des captures. Une seule fixture privée crée un piège près du porteur pour obtenir un impact et un fait marquant mesurés ; elle ne modifie ni horloge, ni résultat, ni replay.

Pour un smoke du déploiement : `BASE_URL=https://… REPORT_DIR=docs/party-crown/public npm run test:party-browser`. Aucune fixture de simulation n’est utilisée dans ce mode. Les deux identités de test sont réutilisées via `/tmp/lagon-party-public-identities.json` (chemin configurable avec `IDENTITY_FILE`) ; aucun token n’est écrit dans les preuves. Le script conserve un rapport, ferme ses deux clients et vérifie la sortie du salon. Aucun circuit utilisateur ni donnée de classé n’est modifié.

Le navigateur privé a réussi **3 parcours complets** le 7 octobre 2026 sur `index-92gPEffb.js` / `index-oCmcxhXo.css` : 89,993 secondes réelles mesurées pour les 90 secondes de simulation, transfert à 6,133 secondes, vote à deux, reprise de manche et replay à deux pilotes. Le téléphone simulé avait volontairement une horloge locale en avance de 60 secondes : le compteur de vote suivait bien le serveur. Aucune erreur JavaScript, aucun salon restant ; navigateur et serveur arrêtés proprement.

Preuves : [rapport](browser-validation.json), [options sur mobile](party-options-mobile-320.png), [course sur mobile](crown-race-mobile-320.png), [course sur bureau](crown-race-desktop.png), [vote sur mobile](party-vote-mobile-320.png), [replay](party-replay-desktop.png).

Le premier lancement s’était arrêté sur une lecture prématurée du snapshot hôte après réception du seul snapshot invité. Le script attend maintenant la configuration des deux clients ; aucun changement du produit n’a été nécessaire.

Le smoke public a également réussi **3 parcours complets**, sans fixture, sur le [tunnel de la démo](https://miles-blades-tulsa-citizens.trycloudflare.com), avec le même build. Deux profils dans deux contextes Chromium distincts ont rejoint le même salon via HTTPS/WSS, reçu les états, conduit, voté pour Métropole néon et pris le départ suivant. Durée observée : **90,033 secondes réelles** pour 90 secondes de simulation. Le mobile simulé gardait l’horloge avancée de 60 secondes et affichait bien 7 secondes restantes au vote.

Le replay public contient les deux pilotes et dure 90 000 ms. Aucun fait marquant ne s’est produit pendant cette conduite : l’interface l’a indiqué sans en inventer. La reprise de la manche et le [lien direct à 4 secondes](https://miles-blades-tulsa-citizens.trycloudflare.com/?replay=97d03719-2e15-4e7b-a6d1-d4dd082272de&t=4000) ont été ouverts. Le transfert et son bouton de moment restent couverts par le scénario privé déclaré ci-dessus.

Preuves publiques : [rapport](public/browser-validation.json), [options sur mobile](public/party-options-mobile-320.png), [course sur mobile](public/crown-race-mobile-320.png), [course sur bureau](public/crown-race-desktop.png), [vote sur mobile](public/party-vote-mobile-320.png), [replay](public/party-replay-desktop.png). Les cinq captures ont été inspectées : options accessibles par défilement, trois choix de vote visibles, compteur et commandes mobiles lisibles, deux trajectoires dans le replay.

Les deux profils de test ont quitté leur salon, le navigateur s’est fermé et `/healthz` indiquait **0 salon** après le contrôle. Aucune erreur JavaScript ; XP, MMR et statistiques des deux profils inchangés. Le script public ne ferme aucun salon d’autres utilisateurs et n’exige plus un compteur global nul si un collègue ouvre un salon pendant le test.

Téléphone physique, Safari iOS et deux machines physiques distinctes restent à vérifier ; les deux contextes Chromium proviennent de la même machine de test.
