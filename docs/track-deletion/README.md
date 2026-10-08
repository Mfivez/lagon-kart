# Suppression et modération des circuits

Dans **Créer un circuit**, la bibliothèque **Vos circuits et ceux de la classe** propose **Supprimer** sur les circuits du joueur connecté. Le compte dont l’identifiant de connexion est **Admin** peut aussi supprimer les créations des autres joueurs ; son nom affiché peut être différent. Un simple pseudonyme « Admin » ne donne aucun droit supplémentaire.

La confirmation rappelle le nom du circuit et son auteur. **Annuler** et Échap ferment la confirmation. Une suppression réussie retire la création des sélections pour de nouvelles courses. Le dessin ouvert reste un brouillon privé : le republier crée un nouveau circuit. Les versions historiques restent disponibles pour les courses et replays existants.

## Droits et persistance

Le serveur calcule `canModerateTracks` à partir de l'identifiant de compte normalisé, unique et immuable `admin`. Les profils invités, pseudos affichés et propriétés envoyées dans une requête n'accordent aucun droit. Le compte Admin existant bénéficie de ce droit sans changer son mot de passe, son MMR ou sa progression.

`DELETE /api/tracks/:id` attend un Bearer valide et `{ "revision": n }`. Auteur ou Admin seulement ; une version différente renvoie 409. La suppression écrit atomiquement `data/tracks/custom-….deleted.json`, retire toutes les versions du catalogue et libère le quota de publication. Les fichiers de versions restent présents pour les replays et courses déjà engagées. Une nouvelle course, un nouveau programme, le premier départ d'un salon en attente ou une revanche ne peuvent plus sélectionner ce circuit. Un tournoi déjà commencé garde son programme.

La bibliothèque se réconcilie avec le serveur, y compris après une suppression dans un autre navigateur. Les anciennes réponses GET et les chargements de replays ne republient pas les circuits retirés.

## Tests de règles exécutés

La suite complète passe : **485 tests**, aucun échec ni test ignoré, **92,007 s**, dans un conteneur sans volume de données joueur. Elle couvre les permissions de compte, la persistance après réouverture, les conflits de version, l'échec d'écriture, les requêtes concurrentes, les nouvelles sélections refusées et le maintien des courses/tournois engagés. [Rapport](unit-validation.json).

Cette suite précède le dernier correctif d'interface réactivant les boutons de bibliothèque après publication/essai ; les règles serveur sont identiques. Le scénario navigateur complet est rejoué sur le build final pour vérifier ce correctif.

## Validation navigateur

Commande : `node --import tsx scripts/track-deletion-browser-check.ts` après `npm run build`.

Le scénario démarre son propre serveur sur un port local aléatoire, avec des comptes et circuits temporaires créés par l’API. Il ne modifie ni les joueurs ni les circuits du serveur public.

**Exécuté le 8 octobre 2026 : 8 groupes réussis, aucune erreur JavaScript, 5 captures.** Le résultat et les identifiants des fichiers compilés testés figurent dans [browser-validation.json](browser-validation.json). Le scénario couvre :

- Publication, annulation puis suppression par l’auteur ; navigation clavier et verrouillage pendant la requête.
- Retrait du catalogue, circuit sélectionné remplacé par un circuit officiel, brouillon conservé après rechargement et republié sous une nouvelle identité.
- Suppression par un autre client pendant que le catalogue est ouvert : l’actualisation retire l’aperçu supprimé et conserve le brouillon privé.
- Modération d’un circuit d’un autre joueur par le compte Admin, y compris lorsque son nom affiché est différent.
- Changement de compte dans la même page : droits recalculés et brouillons locaux séparés entre Admin et un autre joueur.
- Refus HTTP 403 pour un autre auteur et pour un invité qui choisit le pseudonyme Admin.
- Conflit réel de version HTTP 409, erreur de droits simulée dans l’interface et expiration réelle de session HTTP 401, sans perte du brouillon.
- Émulation tactile 320 × 568 : confirmation avec un nom long, boutons d’au moins 44 px, annulation et suppression, absence de débordement horizontal.

Le téléphone physique et Safari iOS restent à vérifier. Ce scénario ne termine pas de course ; les garanties de persistance et de maintien des courses/replays sont vérifiées séparément côté serveur.

## Captures inspectées

- [Confirmation de l’auteur sur PC](owner-confirmation-desktop.png)
- [Conflit de version conservant le circuit](revision-conflict-desktop.png)
- [Modération Admin sur PC](admin-confirmation-desktop.png)
- [Confirmation sur mobile 320 px](owner-confirmation-mobile-320.png)
- [Bibliothèque après suppression sur mobile](owner-deleted-mobile-320.png)

La première passe a détecté que les boutons de bibliothèque restaient désactivés après publication. Le déverrouillage a été corrigé et la passe complète rejouée avec succès. L’échec initial est conservé séparément dans [before-library-unlock/browser-validation.json](before-library-unlock/browser-validation.json).

## Version déployée

Le build final `index-D77iRu6s.js` / `index-DuMPiEmA.css` est déployé dans Docker. Le compte réel `admin` expose bien `canModerateTracks: true` sans modifier le registre. Les **50 fichiers** du volume avaient exactement la même empreinte avant/après, sans suppression de circuit public pour tester. [Rapport de déploiement](deployment.json).

L’ancien tunnel temporaire avait expiré avant cette mise à jour. Le service tunnel seul a été relancé : **https://dec-automatically-shell-makers.trycloudflare.com**. Le catalogue et les bundles publics correspondent à Docker. Deux SDK anonymes ont rejoint un même salon via WSS, puis fermé leurs connexions, sans course ni replay. [Rapport réseau](public-network.json).

Sur cette nouvelle adresse, reconnectez-vous au compte habituel pour retrouver la progression stockée dans le même volume.

Deux contrôles Chromium en lecture seule passent aussi sur le nouveau tunnel à **1366 × 768** et **320 × 568**, sans erreur JavaScript : accueil, grade/MMR, choix de circuit. [Rapport navigateur public](public-browser/validation.json).
