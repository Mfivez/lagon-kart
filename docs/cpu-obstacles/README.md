# Bots devant les fermetures tardives

Validation du 7 octobre 2026, dans un serveur Colyseus privé avec stockage temporaire. Un CPU est ajouté par la commande normale `configure`, et un navigateur Chromium rejoint le salon comme spectateur.

| Fixture | Situation à la fermeture | Checkpoints réellement franchis | Temps de simulation | Replacements |
| --- | --- | --- | --- | --- |
| Mangrove sinueuse | CPU déjà après le futur barrage | 2 | 2,63 s | 0 |
| Citadelle royale | CPU juste avant le futur barrage | 2 | 7,40 s | 1 |

Le changement de circuit est déclenché par un pilote SDK qui franchit réellement la ligne. Les positions initiales, les checkpoints antérieurs et leur point de replacement sont une fixture préparée pendant le compte à rebours. Les objets sont retirés avant le départ pour isoler l'obstacle. Après le départ, `RaceRoom` produit les commandes CPU et la simulation calcule seule les mouvements, replacements et passages de checkpoints. Aucun tour ni résultat final n'est attribué artificiellement.

Le navigateur reçoit les snapshots du serveur et rend le CPU. Aucune erreur JavaScript ou ressource HTTP manquante n'a été relevée. Les quatre images ont été inspectées : kart visible, cadrage et HUD lisibles. La durée maximale continue à moins de 3 m/s est de 0 s en Mangrove et 0,17 s en Citadelle.

- [Mangrove avant fermeture](mangrove-before-closure.png) et [après deux checkpoints](mangrove-after-checkpoints.png).
- [Citadelle avant fermeture](castle-before-closure.png) et [après récupération puis deux checkpoints](castle-after-checkpoints.png).
- [Rapport détaillé et positions mesurées](browser-validation.json).

Les captures utilisent toutes une fenêtre de 1280 × 800 et la caméra spectateur habituelle. La simulation privée est suspendue pour les captures initiales, puis après les deux checkpoints réellement atteints. Elles montrent deux moments de la version corrigée, pas une comparaison visuelle de versions du code.

Reproduction après compilation :

```bash
npm run build
node --import tsx scripts/cpu-obstacles-browser-check.ts
```

Ces deux scénarios ne constituent ni une course complète ni un essai sur deux machines physiques. Chromium utilise SwiftShader ; aucune mesure de performances sur téléphone n'est revendiquée. Le jeu public et les données des élèves ne sont pas modifiés par ce script.

Une validation distincte a ensuite parcouru une **course publique complète sur
Mangrove**, avec un pilote SDK et sept CPU serveur : **8/8 arrivées**, trois
phases, sept CPU sur la déviation et **aucun reset observé**. Aucun placement
ni checkpoint forcé ; le contrôle dure 78,65 s et rend le serveur sans salon
actif. Il vérifie le réseau et les CPU, sans navigateur.
[Rapport de la course publique](public-race.json) ·
[312 tests et déploiement](../../VALIDATION.md#7-octobre-2026--bots-fermetures-et-rails-des-déviations).
