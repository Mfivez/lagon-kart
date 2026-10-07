# Éditeur enrichi et présence : contrôle public

Le contrôle du 7 octobre 2026 à 13:08 UTC passe sur [le jeu public](https://miles-blades-tulsa-citizens.trycloudflare.com) : **3 étapes réussies, aucune erreur JavaScript**, deux profils Chromium isolés et connexion HTTP/WSS réelle. Les bundles vérifiés sont `index-M7yQs0w3.js` et `index-CHirTTg6.css`, tous deux servis en HTTP 200.

L’exemple **L’atelier des loopings** reste disponible pour la classe : six tours, un pont, un tremplin, un looping, pluie au tour 2 et turbo temporaire au tour 4. Sa révision est `custom-fa7c993a-0140-4d91-a5e8-35e4feb12f89-v1`. Il a été publié une seule fois par l’interface, puis relu dans l’API. Les deux profils ont rejoint le même salon sur cette révision, vu `1 / 6`, pris le départ et vérifié un déplacement normal de 2,14 m à 5,14 m/s pendant l’appui sur l’accélérateur. Le déplacement est mesuré avant le relâchement ; la capture suivante illustre la scène.

[Rapport complet](browser-validation.json) : un salon a été créé pour l’essai, puis quitté par les deux participants ; la santé du serveur indique 0 salon avant et après. La présence est passée de 0 à 2 profils, puis revenue à 0. Aucune recherche classée n’a été lancée. Les trois captures ont été inspectées :

- [Présence sur écran 320 px](mobile-presence-320.png) : les deux profils se voient ; panneau de 272 px, sans débordement.
- [Circuit publié dans l’éditeur](public-editor-modules.png) : six tours, trois reliefs et événements repérés sur le plan.
- [Course publique à deux joueurs](public-multiplayer-six-laps.png) : compteur sur six tours, deux pilotes et pont visible.

Pour rejouer ce contrôle depuis la racine du dépôt :

```bash
BASE_URL=https://miles-blades-tulsa-citizens.trycloudflare.com \
  node --import tsx scripts/public-editor-presence-check.ts
```

`BASE_URL` doit être remplacée si le tunnel temporaire change. `REPORT_DIR` permet de choisir un autre dossier de preuves. Le script garde ses profils et l’identifiant publié dans `/tmp/lagon-public-editor-presence-check-state.json`, hors dépôt ; `STATE_PATH` permet de choisir ce journal. En reprenant avec le même journal, il réutilise les deux profils et l’exemple existant sans créer de circuit supplémentaire. Un circuit du même nom qui n’appartient pas au journal provoque un arrêt avant toute modification.

Le premier passage avait déjà publié l’exemple et validé le jeu ; son script de préremplissage provoquait deux erreurs en accédant au stockage de la page vide utilisée pour fermer les onglets. Ce script est maintenant limité à l’origine du jeu. Le second passage est intégralement réussi, sans erreur, sans nouvelle publication et sans nouvelle révision. `initialPublication` dans le rapport conserve la trace de la création initiale ; `catalogue.createdIds` est vide lors de la reprise.

Limites : écran et gestes mobiles émulés, aucun téléphone physique ni Safari iOS utilisé. Ce contrôle public ne termine pas les six tours et n’atteint pas les événements des tours 2 et 4. La course complète de six tours avec huit CPU, les effets par tour et les replays longs sont couverts séparément par [les tests de modules](../../../tests/custom-track-modules.test.ts). La recherche classée est vérifiée sur serveur privé par [le contrôle de présence](../../../scripts/presence-browser-check.ts), pour ne pas engager les vrais joueurs dans un match de test.
