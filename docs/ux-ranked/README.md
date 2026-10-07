# Accueil classé et invitation locale

L’accueil affiche le grade du profil fourni par le serveur et son MMR. Les libellés sont français : Bronze, Argent, Or, Platine, Diamant et Maître. Pendant la restauration du profil, il affiche un chargement ; aucun MMR provisoire n’est inventé.

Le bouton lance ou annule la recherche directement à l’accueil. L’ancien menu Carrière consulte le même état `CareerUI` : le fermer laisse la recherche continuer. Un seul poller suit la file. Entrer dans un salon, un entraînement ou l’éditeur, ou changer de compte, annule d’abord la recherche. Un POST encore en vol se termine avant le DELETE d’annulation ; une réponse ancienne ne peut plus ouvrir un salon. Une panne affiche une erreur réessayable. Le classement est actualisé après résultat ou changement de compte.

Dans le salon, **Partager le salon** ouvre le partage natif quand il existe ; sinon le lien est copié. Si le presse-papiers est indisponible, le lien reste sélectionnable dans le dialogue. **QR code** encode le vrai lien de la même origine `/room/CODE`, dans un canvas noir sur blanc avec quatre modules de marge. L’encodeur est chargé à la première ouverture du QR. Aucun appel à une API de QR, aucun CDN et aucun coût.

La génération utilise [qrcode-generator 2.0.4](https://github.com/kazuhikoarase/qrcode-generator), sous [licence MIT](https://github.com/kazuhikoarase/qrcode-generator/blob/master/LICENSE), sans dépendance transitive. Le test décode les pixels avec [jsQR 1.4.0](https://github.com/cozmo/jsQR), sous Apache-2.0, uniquement en développement. Les versions sont fixes et la licence du générateur est distribuée avec le jeu.

## Vérifications

- `node --import tsx --test tests/career-ui.test.ts tests/invitation-qr.test.ts` : **8/8**. File unique, fermeture du menu, annulation d’un POST tardif, réponse POST perdue après inscription serveur et premier DELETE échoué, panne récupérable, garde de salon, changement d’identité, déconnexion et décodage réel des URL HTTP/HTTPS.
- `npx tsc --noEmit` : réussi après l’ajout des modules.
- `npm run test:ux-ranked` : **6/6 parcours réussis**, deux profils et un serveur privés. Chargement/recherche/annulation/salon/éditeur/match, comparaison du MMR à l’API, QR décodé depuis les pixels du canvas et second navigateur rejoignant ce lien, déconnexion et reconnexion du compte. La carte classée mesure 115,4 px de haut sur 320 × 568 ; Créer, Entraînement et Rejoindre sont visibles sans défilement. Le vrai appariement a conduit au départ automatique après les deux confirmations Prêt.

Preuves inspectées : [rapport navigateur](browser-validation.json), [accueil mobile](home-ranked-mobile-320.png), [recherche](home-ranked-search.png), [QR bureau](invitation-qr-desktop.png), [QR mobile](invitation-qr-mobile-320.png), [MMR actualisé](home-ranked-updated.png). Aucune erreur JavaScript, aucun salon restant, navigateur et serveur fermés proprement.

Le scénario déclare ses fixtures : requête profil retenue, erreur HTTP 503 simulée, contrat `navigator.share` simulé en navigateur headless, et arrivée classée accélérée uniquement sur son serveur privé pour vérifier l’actualisation du MMR (800 → 780 pour le profil observé). Aucun classement public modifié. Deux essais ont corrigé uniquement le harness : une fonction Playwright sérialisée par tsx puis une attente de clic Lancer inutile dans un salon classé qui démarre automatiquement. Le build de départ est `C8l90P50` / `D0i0Td0K` ; le rechargement invité a pu recevoir `CqXqI6ZA` / `DP5RKQyO`, dont le seul changement était la police de sélection à 16 px pour iOS.

Le smoke public a réussi **3/3 parcours** sur [le tunnel actif de la démo](https://yoga-unlikely-div-converted.trycloudflare.com), build `index-DNUBohE_.js` / `index-CpYYGxpj.css`, avec le QR séparé `invitation-qr-DsiXEY4X.js`. Deux profils de test existants ont été réutilisés depuis `/tmp/lagon-ux-public-identities.json`, après vérification de l’origine et de leur identité via API.

- Accueil 320 × 568 : Bronze et 800 MMR confirmés par le serveur, actions principales visibles sans défilement.
- QR HTTPS décodé depuis le canvas ; second navigateur connecté au lien obtenu. Bouton Prêt resté fixe pendant le défilement du salon.
- Départ ordinaire puis déplacement réel des deux pilotes de plus de 2 mètres, via deux connexions WSS. Mode Fluide appliqué au rendu (`quality: light`).
- Essai du brouillon privé, déplacement normal et retour à l’éditeur avec le brouillon intact. Les cinq circuits publiés et leurs révisions sont restés identiques ; MMR des deux profils inchangé.
- Aucune fixture, aucune requête classée, aucune écriture du catalogue, aucun appel d’asset distant et aucune erreur HTTP/JavaScript. Les modules chargés proviennent de la même origine ; le générateur QR n’a été demandé qu’à son ouverture.

Preuves publiques inspectées : [rapport](public/browser-validation.json), [accueil mobile](public/public-home-mobile-320.png), [QR](public/public-qr-desktop.png), [salon mobile](public/public-lobby-mobile-320.png), [conduite mobile](public/public-driving-mobile-320.png), [brouillon privé](public/public-private-draft.png). Le contrôle a duré environ 70 secondes. Les deux profils ont quitté leurs salons et Chromium s’est fermé. Le serveur comptait un salon tiers avant et après : il n’a pas été touché.

Commande utilisée : `BASE_URL=https://yoga-unlikely-div-converted.trycloudflare.com IDENTITY_FILE=/tmp/lagon-ux-public-identities.json npm run test:ux-public`. Le premier lancement avait expiré pendant la revue automatique d’autorisation avant de créer un processus ; la tentative autorisée suivante a réussi. L’ancien tunnel ayant expiré côté Cloudflare, les preuves publiques de ce lot utilisent la nouvelle adresse ci-dessus.

Panneau de partage natif réel, lecture par caméra de téléphone, Safari iOS et deux machines physiques distinctes restent à vérifier.
