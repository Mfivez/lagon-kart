# Accueil et ergonomie — 7 octobre 2026

Le grade et le MMR du profil serveur sont visibles directement sur l’accueil, avec un bouton pour rechercher ou annuler une course classée. Le menu Carrière conserve championnats, classement et replays. Le fermer ne coupe pas une recherche ; entrer dans un salon ou l’éditeur l’annule. Le classement se rafraîchit après résultat ou connexion à un autre compte.

## Parcours plus courts

- **Jouer** : pseudo, kart, classé, Créer, Entraînement et Rejoindre apparaissent avant les options secondaires. À 320×568, Entraînement demande désormais 0 px de défilement, contre 827 px dans l’audit précédent.
- **Préparer le départ** : la liste des pilotes et les réglages défilent dans le salon ; la barre Prêt reste en bas. Elle indique combien sont prêts et les pseudos encore attendus.
- **Inviter** : partage natif, copie du lien et QR généré localement. Le lien utilise la même origine que le jeu. L’encodeur gratuit n’est chargé qu’à l’ouverture du QR.
- **Conduire** : modes Accélération automatique et Conduite manuelle explicites, aide accessible en course, compteur déplacé pour dégager le kart. Les deux axes et les appuis simultanés restent disponibles.
- **Régler le rendu** : Auto, Fluide ou Détaillé, mémorisé sur l’appareil. Le rendu du menu est plafonné à 15 images/s et la scène 3D suspendue derrière les dialogues ; le serveur et les snapshots continuent.
- **Créer un circuit** : déplacement direct des modules sur le plan, clavier et annuler/rétablir. Essayer en privé lance le brouillon sans publication ni progression. Publier pour la classe reste une action explicite.

## Preuves par domaine

[Classé et invitations](../ux-ranked/README.md) · [Éditeur privé](../ux-editor/README.md) · [Mobile et rendu](../ux-driving/README.md).

Les essais Chromium utilisent SwiftShader et des stockages temporaires. Ils ne prouvent pas la fluidité GPU ni le confort sur téléphone physique. Le scénario classé privé impose seulement ses arrivées pour contrôler le rafraîchissement du MMR ; les commandes de recherche, d’appariement et de départ sont réelles. Aucun classement public ne doit être modifié par une fixture.

## Comparaison de l’accueil

Même cadrage 320×568, même circuit et vue de menu : [avant](../fun-experience/baseline/home-mobile-320.png) · [après](home-mobile-320.png).

[Accueil ordinateur](home-desktop.png) · [Salon ordinateur](lobby-desktop.png) · [Salon mobile](lobby-mobile-320.png).

Les mesures, noms de bundles et éventuelles limites propres à chaque exécution sont conservés dans les rapports de ce lot ; les rapports historiques restent inchangés.

## Vérifications exécutées

- **426/426 tests**, zéro échec/ignoré, en 135,856 s : [suite complète](unit-validation.json).
- **19 parcours privés** : 6 ranked/QR, 4 éditeur, 7 conduite/rendu et 2 audit final. Les nombres désignent des groupes de contrôles, pas 19 courses complètes.
- [Audit final](audit.json) sur `index-DNUBohE_.js` / `index-CpYYGxpj.css` : barre Prêt stable à 320px et sur ordinateur, aucun recouvrement du footer, défilement vers Entraînement égal à 0.

Les captures finales de ce dossier remplacent l’essai intermédiaire du même lot.
Elles ont été relues : actions principales visibles, grade/MMR lisibles,
commandes de départ accessibles, vitesse placée hors du kart. Les preuves
historiques citées pour l’avant ne sont pas modifiées.

## Version Docker et lien public

[Ouvrir la démo](https://yoga-unlikely-div-converted.trycloudflare.com).
L’ancienne adresse `miles-blades-tulsa-citizens.trycloudflare.com` ne répondait
plus : Cloudflare indiquait « Unauthorized: Tunnel not found » avant le
redémarrage de l’application. Le tunnel seul a été relancé ; l’adresse a changé.

La recréation de l’application, à zéro salon actif, a conservé **42 fichiers et
39 profils** à l’identique par SHA-256 et le même montage `data`. Un 40e profil est
apparu ensuite pendant l’usage du serveur ; il est distingué du contrôle du
redémarrage. Trois fichiers JS/CSS publics, dont le chunk QR différé, les licences
et 19 modules serveur correspondent au build local. [Preuve de déploiement et de
rétablissement du tunnel](deployment.json).

Les **3 parcours publics** passent sur le nouveau tunnel : deux profils de test
rejoignent le même salon via un QR réellement décodé, confirment Prêt et se
déplacent avec les commandes ordinaires en WSS. Le mode Fluide est actif ; un
brouillon est conduit en privé puis retrouvé dans l’éditeur, sans publication
ni variation de MMR. Zéro erreur JS/HTTP, chunks locaux et cinq captures.
Aucune recherche ranked ni fixture de simulation en public. Les tests quittent
leurs propres salons ; un autre salon actif avant/après est laissé intact.
Ce contrôle démarre une course à deux mais ne la termine pas.
[Rapport public](../ux-ranked/public/browser-validation.json).
