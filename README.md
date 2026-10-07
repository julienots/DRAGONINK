# 🐉 XalaMonsters — SUPERESSENCE

Jeu mobile de collection, d’élevage et de combat de monstres sur un archipel d’îles flottantes.
Toutes les créatures, musiques, sons, illustrations et interfaces sont **originaux** (générés procéduralement dans le code).

## Contenu du jeu

| Système | Détails |
|---|---|
| **Xalamons** | 54 espèces originales (10 de base, ~30 hybrides, légendaires à recettes, exclusifs d’événement/Pass), modèles 3D procéduraux, 4 stades d’évolution (Bébé → Adolescent → Adulte → Supérieur) qui changent réellement silhouette, taille, ailes, cornes, aura et statistiques |
| **Éléments** | 10 éléments (Flamme, Aqua, Flora, Volt, Ombre, Glace, Vent, Roche, Lumière, Cosmos), table équilibrée : chaque élément est fort contre 2 et faible contre 2 |
| **Raretés** | Common, Uncommon, Rare, Epic, Mythic, Ancient, Celestial (stats, production, éclat, œufs différents) |
| **Œufs / Nursery** | incubateurs (emplacements selon le niveau), accélération en gemmes, éclosion animée (on tape l’œuf 3 fois) |
| **Élevage** | Sanctuaire d’Union, probabilités affichées, jamais garanties, recettes spéciales, bonus météo/événement, journal des découvertes |
| **Nourriture** | 6 cultures (céréales, fruits, légumes, plantes spéciales, plantes énergétiques), cuisine (4 plats), satiété qui baisse avec le temps, nourriture préférée +50 % |
| **Archipel** | 10 îles (Verdante, Volcanique, Glaciaire, Céleste, Ombres, Cosmique, Tempêtes, Corail, Dunes, Aurore), niveaux d’île, affinités élémentaires, météo par île |
| **Construction** | placement libre sur grille, déplacement, 11 habitats (5 niveaux, de plus en plus impressionnants), fermes, nurserie, sanctuaires, cuisine, entrepôts, puits d’énergie, condensateur d’essence, monuments, 13 décorations |
| **Économie** | 🪙 XalaCoins, 💎 XalaGems, ⚡ XalaEnergy, 🌟 SuperEssence (ultra-rare : évolution supérieure, bâtiments avancés, créatures célestes) ; production hors-ligne, stockage plafonné |
| **Combat** | 3 contre 3 au tour par tour, 4 compétences (normale, élémentaire, spéciale, ultime), statuts, avantages ▲▼ affichés, IA, mode auto, ×1/×2/×3 |
| **Modes** | Campagne (6 mondes × 10 combats + gardiens), Arène (ligues), Tournoi hebdomadaire, Boss géants quotidiens (dégâts cumulés) |
| **Méta** | quêtes de progression / quotidiennes / hebdomadaires + coffre, 11 succès à paliers, connexion quotidienne (7 jours), Codex avec silhouettes, Xala Pass (30 paliers gratuit + premium), 6 événements tournants (monnaie, paliers, boutique, créature et déco exclusives) |
| **Boutique** | 8 catégories, rotation quotidienne, limites d’achat, achats intégrés |
| **Monde vivant** | nuages, oiseaux, cascades animées, cristaux et planètes flottants, Xalamons qui marchent, dorment, mangent, sautent, volent ; météo (soleil, pluie, orage avec éclairs, neige, arc-en-ciel, pluie d’étoiles) |
| **Audio** | musique générative par île (gamme, tempo, timbre), thèmes de combat/boss, ambiances (vent, eau, lave, espace), ~30 effets synthétisés, cris par élément |

## Architecture

```
src/
  core/        types, état, sauvegarde robuste, orchestrateur (Game), utilitaires déterministes
  data/        contenu : éléments, espèces, îles, bâtiments, cultures, compétences, progression
  systems/     logique pure et testable (aucune dépendance au rendu)
    actions.ts registre des actions joueur nommées et sérialisables
  render/      Three.js : îles, bâtiments, Xalamons procéduraux, combat, effets, météo
  ui/          interface mobile (HTML/CSS), panneaux, écran de lancement, tutoriel
  audio/       moteur audio WebAudio (musique générative + effets)
  platform/    qualité graphique, magasin d’achats intégrés
android/       coque native (WebView, pont natif, Google Play Billing), projet Gradle
tools/         synchronisation des assets, icônes, chaîne APK hors-ligne
tests/         unitaires (Vitest) et bout en bout (Playwright)
```

### Prêt pour le jeu en ligne
- **Toute mutation passe par une action nommée** (`game.act('farm.plant', {...})`) qui valide puis modifie une copie de l’état : une action invalide ne change rien. Un serveur pourra rejouer ces mêmes actions de façon autoritaire.
- **Combats déterministes** (graine + actions enregistrées) : rejouables côté serveur pour valider un résultat (anti-triche). Un combat doit être démarré (énergie dépensée) avant de pouvoir être terminé (`activeBattle`).
- **Horloge injectable** (`clockOffset`) pour une heure serveur ; production robuste aux retours d’horloge.
- **Événements, météo et rotation de boutique** calculés à partir de l’heure (remplaçables par des données serveur).
- Achats : le reçu (jeton + signature Play) est l’unité de validation — à vérifier côté serveur dans la version en ligne.

### Sauvegarde
Double emplacement A/B écrit en alternance + somme de contrôle + copie de secours + relecture de vérification.
Sur Android, écriture native **atomique** (fichier temporaire + `fsync` + renommage) en plus de `localStorage`.
Sauvegarde après chaque action (≤ 0,4 s), toutes les 15 s, et à la mise en pause de l’app. Export/import par code.

### Achats intégrés
Flux sans perte ni double récompense : achat → récompense + n° de commande enregistré → **sauvegarde** → seulement ensuite `consume/acknowledge`.
Au lancement, les achats payés mais non confirmés sont réappliqués (dédupliqués). Restauration des achats non consommables. Gestion des annulations, paiements en attente et erreurs réseau.
Aucun contenu n’est réservé aux achats : tout s’obtient en jouant.

### Performances Android
Géométries fusionnées à couleurs par sommet (≈ 1 à 3 draw calls par Xalamon, 1 par bâtiment/île), matériaux partagés, 4 niveaux **LOW / MEDIUM / HIGH / ULTRA** (résolution, ombres, contours, particules, nuages, détail des modèles) avec détection automatique du matériel et rétrogradation si le FPS chute.

## Commandes

```bash
npm install
npm run dev          # développement (http://localhost:5173)
npm test             # tests unitaires
npm run build && npm run test:e2e   # tests de bout en bout (Chromium)
```

### Android
**Avec Android Studio / SDK (recommandé, produit l’APK et l’AAB Play Store) :**
```bash
npm run build && npm run android:sync
cd android
gradle wrapper              # une fois, si gradlew est absent
./gradlew assembleStandaloneDebug     # APK de test (magasin de test intégré)
./gradlew bundlePlayRelease           # AAB pour le Play Store (Google Play Billing réel)
```
Signature release : placer `android/release.keystore` et définir `XALA_STORE_PASSWORD`, `XALA_KEY_ALIAS`, `XALA_KEY_PASSWORD`.
Produits à créer dans la Play Console : `gems_80`, `gems_500`, `gems_1200`, `gems_2600`, `gems_7000`, `starter_pack`, `food_pack`, `event_pack`, `xala_pass_premium`, `cosmetic_aurora`.

**Sans SDK Android (chaîne hors-ligne, ne dépend que de Maven Central) :**
```bash
npm run android:apk     # → build-output/XalaMonsters-<version>-standalone.apk
```
Cette chaîne compile le Java, produit le dex (dalvik-dx), encode le manifeste binaire et `resources.arsc` (`tools/android-offline/axml.py`), aligne et signe (schéma v2, apksig). Elle ne produit pas d’AAB : l’AAB se génère avec Gradle ci-dessus.

L’APK `standalone` utilise un **magasin de test** clairement signalé (aucun paiement réel) ; la variante `play` utilise Google Play Billing 7.
