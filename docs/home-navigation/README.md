# Accueil et choix des circuits

L'accueil rassemble le circuit actif, les actions de jeu, le grade et le MMR. Les quatre vues **Jouer**, **Pilote**, **En ligne** et **Options** partagent une navigation persistante. Le catalogue s'ouvre dans une fenêtre dédiée, avec recherche, filtres, pages et confirmation explicite. Fermer cette fenêtre conserve le circuit précédent.

## Comparaison visuelle

| Format | Avant | Après |
| --- | --- | --- |
| PC 1827 × 860 | [Ancien accueil](baseline/1827x860.png) | [Accueil](home-1827x860.png) · [Catalogue](picker-1827x860.png) |
| PC 1366 × 768 | [Ancien accueil](baseline/1366x768.png) | [Accueil](home-1366x768.png) · [Catalogue](picker-1366x768.png) |
| Tablette 1024 × 768 | [Ancien accueil](baseline/1024x768.png) | [Accueil](home-1024x768.png) · [Catalogue](picker-1024x768.png) |
| Mobile 320 × 568 | [Ancien accueil](baseline/320x568.png) | [Accueil](home-320x568.png) · [Catalogue](picker-320x568.png) |
| Mobile 390 × 844 | [Ancien accueil](baseline/390x844.png) | [Accueil](home-390x844.png) · [Catalogue](picker-390x844.png) |
| Paysage 568 × 320 | [Ancien accueil](baseline/568x320.png) | [Accueil](home-568x320.png) · [Catalogue](picker-568x320.png) |

Les captures utilisent la même taille CSS et un zoom de 100 %. Le décor 3D tourne et les informations de profil varient : le cadrage des interfaces reste comparable. Le catalogue est fermé par défaut après la refonte.

## Scénario reproductible

```sh
npm run build
node --import tsx scripts/home-navigation-browser-check.ts
```

Le script démarre le client compilé sur un serveur local isolé. Il crée deux profils et 32 circuits aux noms de 48 caractères via les API normales, dans un dossier temporaire supprimé à la fin. Il ne modifie pas les sauvegardes du déploiement public.

Il contrôle les limites visibles et le point central cliquable des actions, les débordements horizontaux, le défilement de l'écran Jouer, la navigation entre vues, la recherche sans accents, les filtres, la pagination, les choix provisoires, la confirmation et l'annulation. Il simule une erreur de chargement de catalogue, puis réessaie. Il vérifie aussi qu'une réponse tardive ne remplace pas un choix récent et qu'elle ne bloque pas un salon officiel. Une création de salon normale utilise le circuit personnalisé sélectionné, puis un retour à l'accueil conserve ce choix et les réglages.

`VIEWPORT_MODE=mobile` ou `desktop` permet un passage ciblé ; le rapport indique ce périmètre. `REPORT_DIR` change le répertoire des preuves.

## État des vérifications

Le passage complet du **7 octobre 2026, 21:19–21:20 UTC**, est réussi : **13 groupes de contrôles**, les **6 tailles normales**, **15 captures**, aucune erreur JavaScript. Les trois salons temporaires ont été quittés et supprimés ; navigateur et serveur de test ont été fermés, données temporaires effacées. Le rapport contient les résultats détaillés et les dimensions mesurées : [browser-validation.json](browser-validation.json).

Le client testé utilise `index-Ahb8Ic8L.js` et `index-6X77iw5y.css`, après correction du rafraîchissement du MMR. Le résultat couvre ce build ; la validation du déploiement public est distincte.

L'écran Jouer garde les actions, le circuit choisi, le grade/MMR et la navigation dans la zone visible sans défilement, y compris après sélection d'un nom de 48 caractères. Les vues secondaires peuvent défiler dans leur propre zone de contenu ; la navigation reste fixe. À **320 × 260**, une [vérification supplémentaire](picker-reduced-320x260.png) réduit réellement la fenêtre : un seul défilement de secours reste actif et les commandes Fermer/Choisir restent accessibles. Ce cas ne représente pas un clavier système.

Contrôles complémentaires sur ce lot :

- [Six parcours classés](ranked/browser-validation.json) réussis sur le même client : vraie file et salon à deux, annulation, QR décodé, compte et MMR actualisé. L'arrivée de la course classée utilise une fixture explicite sur serveur privé ; ce contrôle ne représente pas une course classée complète conduite par des humains.
- [17 tests catalogue et présence](unit-validation.json) réussis, sans échec ni test ignoré.
- [16 tests profil/progression](ranked/profile-refresh-tests.json) réussis : neuf côté client, sept côté serveur, dont une sauvegarde volontairement retardée pour vérifier le signal de mise à jour et l'absence de réponse obsolète.

L'[audit initial](baseline/README.md) documente les défauts avant intervention. La première tentative a corrigé une assertion du test sur le comportement natif de Tab vers la barre du navigateur. La deuxième a détecté 21 px de défilement résiduel en 320 × 568 ; son [rapport](attempt-2-mobile-overflow.json) et sa [capture](attempt-2-mobile-overflow.png) sont conservés. Un [passage mobile intermédiaire](mobile-targeted/browser-validation.json) a ensuite détecté 6 px résiduels en paysage. Ces deux défauts de disposition sont corrigés et ne se reproduisent plus dans le passage final.

## Déploiement et contrôle public

Le build de production et l'image Docker ont été reconstruits. Le déploiement a eu lieu sans salon actif : les **49 fichiers de sauvegarde** ont les mêmes empreintes avant/après et le conteneur du tunnel est resté inchangé. Les bundles du lien HTTPS et du serveur local sont identiques. [Rapport de déploiement](deployment.json).

Deux contrôles Chromium publics, à **1366 × 768** et **320 × 568**, passent : grade/MMR réel, accueil sans scroll, recherche et confirmation d'un circuit, options et choix conservé. [Rapport public](public/validation.json) · [Capture PC](public/home-1366.png) · [Capture mobile](public/home-320.png).

Ce contrôle public est en lecture seule : identité de test existante, présence lue via GET et mutations API bloquées. Aucun compte, circuit, salon ou classement public n'est créé ou modifié. Les essais multijoueurs avec résultat ont eu lieu sur les serveurs privés ci-dessus.

Les accès au menu de **18 scripts historiques** ont été adaptés aux onglets et au catalogue paginé avec `scripts/menu-navigation.ts`. Le typecheck final et `git diff --check` passent. Les longues courses de ces anciens scénarios n'ont pas été rejouées ; leurs helpers de navigation et de catalogue sont exercés par le contrôle public ci-dessus.

## Limites

Tests exécutés dans Chromium avec souris, clavier et émulation tactile, rendu 3D logiciel. Aucun téléphone physique ni Safari iOS testé. Le clavier logiciel Android/iOS n'est pas ouvert par Chromium headless. Les captures ne prouvent pas les performances d'un GPU mobile. Ce scénario vérifie la navigation et l'entrée en salon ; il ne simule pas une course complète.
