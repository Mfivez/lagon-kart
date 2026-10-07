# Conduite mobile et coût du rendu

Les modes tactiles portent maintenant leurs noms : **Accélération automatique**
et **Conduite manuelle**. La préférence existante `lagon-touch-auto` est conservée.
Le joystick garde ses deux axes : haut pour avancer, bas pour freiner puis
reculer, diagonales pour combiner direction et pédale. Le frein reste prioritaire
sur l'automatique et sur un autre doigt qui tient l'accélérateur. Changer de mode
relâche les anciens appuis.

Le bouton **?** ouvre une aide réelle, accessible au clavier et au toucher. Elle
explique les modes, le joystick, le drift, les objets, le placement et le clavier.
Elle indique que la course continue pendant l'aide. Fermer cette fenêtre laisse
l'accélération tactile suspendue jusqu'à une reprise volontaire.

Sur les petits écrans en portrait, vitesse, position, tours et mini-carte sont
regroupés en haut ; en paysage, la vitesse reste en bas au centre, sous le kart.
Les commandes gardent une cible
d'au moins 44 px et le centre de la piste reste dégagé en portrait et en paysage.

## Réglages graphiques

| Choix | Effet |
| --- | --- |
| Auto | Rendu détaillé initial. Après trois mesures consécutives de course sous 20 FPS, passe au rendu fluide ; un menu volontairement ralenti ne déclenche pas ce changement. |
| Fluide | Ombres dynamiques coupées, ratio de pixels plafonné à 0,8 ; un tiers des groupes décoratifs répétitifs affiché. Les monuments principaux, routes, rails, ponts, tremplins et loopings restent présents. |
| Détaillé | Ombres actives et ratio de pixels plafonné à 1,6 ; tous les décors affichés. Le choix explicite reste prioritaire sur l'adaptation. |

Le choix est enregistré dans `lagon-graphics-quality`. Il ne change ni la
simulation, ni les collisions, ni les entrées envoyées à Colyseus. Passer d'une
qualité à l'autre reconstruit seulement les décors et libère les buffers précédents.

Les menus sont limités à 15 rendus par seconde. La scène principale ne fait aucun
rendu quand le document est caché ou derrière un dialogue ouvert. Les entrées
neutres, les snapshots et la simulation serveur continuent pendant l'aide. La
mini-carte et la prévisualisation éventuelle d'un garage restent des vues séparées.

## Intégration

- `graphicsSettingsMarkup` et `GraphicsSettings(mode => renderer.setQualityMode(mode))`.
- Importer `driving-ux.css` après `style.css`.
- `renderer.render(world, players, localId, dt, now, { hidden, opaqueDialog })`.
- `#driving-help`, `#driving-help-dialog`, `[data-help-close]` et
  `[data-drive-mode="automatic"|"manual"]` pour l'aide.
- `viewDiagnostics` expose le choix, le ratio réel, les ombres, les détails
  conservés, le nombre cumulé de rendus et la raison de suspension.

## Vérifications

Exécuté : `node --import tsx --test tests/mobile-controls.test.ts tests/graphics-policy.test.ts`
— **18 tests réussis** : commandes simultanées, priorités, diagonales, relâchements,
focus/annulation, adaptation graphique, plafonnement des menus, suspension/reprise
et préservation des structures réelles de Forêt/Ciel/Port en mode fluide.

Exécuté : `node --import tsx scripts/ux-driving-check.ts` — **7 contrôles navigateur
réussis**, aucune erreur JavaScript, le 7 octobre 2026 sur le build
`index-DNUBohE_.js` / `index-CpYYGxpj.css`. Le scénario utilise un serveur et un
stockage privés temporaires, puis ferme Chromium et supprime ce stockage. Il
conduit une vraie session d'entraînement par gestes tactiles CDP et vérifie les
entrées reçues par Colyseus ; aucune position, vitesse ou arrivée n'est modifiée.

- Menu : 18 rendus en 1,2 seconde, conforme au plafond de 15 FPS.
- Graphismes : passage réel entre les trois choix, ombres coupées et ratio 0,8
  en Fluide, 6 groupes décoratifs répétitifs visibles sur 18, choix restauré après
  rechargement. Le mode Détaillé retrouve ses ombres et le ratio du périphérique.
- Conduite : diagonale avec drift simultané, relâchement indépendant du drift,
  frein puis marche arrière, priorité du frein sur l'automatique et reprise de
  l'automatique au relâchement.
- Portrait 320 × 568 et paysage 667 × 375 : cibles tactiles d'au moins 44 px,
  dans l'écran et sans chevauchement ; compteur de vitesse hors du kart projeté.
- Aide : compteur de rendus inchangé à 139 pendant 0,9 seconde, alors que le temps
  du snapshot avance de 11,733 à 12,633 s et les entrées neutres de séquence 251 à
  279. Fermeture avec reprise tactile volontaire ; choix manuel conservé.
- Changement d'orientation pendant deux appuis : commandes neutralisées et
  reprise demandée. Accélération et relâchement au clavier encore fonctionnels.

Le [rapport détaillé](validation.json) conserve les mesures et les rectangles des
commandes. Captures inspectées visuellement :

| Vue | Avant | Après |
| --- | --- | --- |
| Portrait 320 × 568 | [Référence](../fun-experience/baseline/race-mobile-320.png) | [Conduite](race-mobile-320-after.png) |
| Paysage 667 × 375 | — | [Conduite](race-mobile-landscape-after.png) |
| Aide 320 × 568 | — | [Dialogue Commandes](driving-help-mobile-320.png) |

La comparaison portrait utilise le même circuit et la même caméra de poursuite,
à la même taille, après une remise en piste normale ; les instants de course
diffèrent. Le compteur qui couvrait le kart est maintenant en haut de l'écran.

Limites : Chromium tactile émulé avec SwiftShader ne mesure pas les performances
d'un téléphone réel. Le document caché est couvert par les tests du planificateur,
sans changement synthétique de visibilité dans ce parcours navigateur. Un
téléphone physique, Safari iOS et le ressenti humain restent à vérifier ; aucun
débit de 60 FPS n'est promis. Ce scénario d'entraînement ne constitue pas un
nouveau test de course à plusieurs joueurs.
