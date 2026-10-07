# Joueurs en ligne

Le panneau de l’accueil affiche les pilotes connectés, leur activité et le nombre de recherches classées. Un même profil ouvert dans plusieurs onglets ou sur plusieurs appareils n’apparaît qu’une fois. Les CPU ne sont jamais comptés.

Le pseudo est sauvegardé quand on quitte le champ après l’avoir modifié. La liste est actualisée sans lancer de course ; une sauvegarde lente ne remplace pas une saisie plus récente.

Le navigateur renouvelle sa présence toutes les 12 secondes sur `/api/presence`, à la même origine que le jeu. Une fermeture normale retire son onglet ; après une interruption brutale, sa présence expire au bout de 45 secondes sans renouvellement et disparaît à la prochaine actualisation. Les salons et courses viennent de l’état Colyseus ; la recherche classée vient de la file serveur. Lire cette liste ne prolonge jamais une recherche abandonnée.

La présence reste en mémoire et ne modifie pas les sauvegardes de progression. L’API publique renvoie seulement l’identifiant public du pilote, son pseudo, son activité et les compteurs. Les identifiants de connexion, mots de passe, jetons et codes des salons ne sont pas renvoyés.

## Vérifications exécutées

- 13 tests unitaires/API : déduplication, expiration, changement de profil, protection des données privées, vraie file classée, vrai salon Colyseus avec sept CPU exclus du compteur.
- 8 parcours Chromium : deux profils et trois onglets, pseudo modifié à l’accueil et vu depuis l’autre navigateur, saisie préservée pendant une réponse retardée, recherche classée via l’interface, annulation, entraînement et fermeture du dernier onglet.
- Affichage inspecté sur ordinateur et en émulation mobile de 320 × 568 px. Aucun téléphone physique utilisé.

[Rapport navigateur](browser-validation.json) · [Capture ordinateur](desktop-presence.png) · [Capture mobile](mobile-320-presence.png)

```sh
node --import tsx --test tests/presence.test.ts tests/presence-api.test.ts
npm run build
node --import tsx scripts/presence-browser-check.ts
```

Le scénario navigateur démarre son propre serveur et des profils dans un répertoire temporaire. Il ne crée aucun compte ni résultat classé sur le serveur public.
