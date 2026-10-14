# Rôles et missions de l'équipe Aeris

Ce document détaille, pour chacune des 6 personnes, **ce qu'elle possède, ce qui existe déjà, ce qu'elle doit livrer et avec qui elle doit s'accorder**. Il complète le README (sections « Répartition », « Contrats et tests », « Consignes pour les agents IA »).

## Vue d'ensemble

Aeris aide un officier de gendarmerie à **dimensionner et placer ses drones** sur une opération : il décrit la zone, ses moyens (couples télépilote + drone) et ses contraintes ; l'outil propose plusieurs dispositifs chiffrés, puis l'accompagne en temps réel quand la situation change.

Le calcul suit une chaîne fixe, et chaque maillon a un propriétaire :

```
 Configuration (P5)                                    Affichage (P5, P6)
        │                                                     ▲
        ▼                                                     │
 API + pipeline (P1) ──► grille (P3) ──► météo (P4) ──► solveur (P2) ──► séparation (P4) ──► métriques + géométries (P3)
```

Les maillons ne se parlent **que** par les types de `packages/shared` (voir `engines.ts`). Chacun avance seul, contre la mission de démo et les missions de test de `packages/data`, et prouve que son module se branchera en faisant passer **sa suite de contrat** (`packages/contracts`).

| #   | Rôle                          | Dossiers possédés                                                                          | Suite de contrat / tests                              |
| --- | ----------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| P1  | Lead archi / intégration      | `packages/shared`, `packages/contracts`, `apps/api`, racine, `.github`                     | intégration `apps/api/src/api.test.ts`                |
| P2  | Solveur                       | `packages/solver`                                                                          | `solverContract`                                      |
| P3  | Moteur géo + données          | `packages/geo`, `packages/data`                                                            | `gridContract`, `metricsContract`, `coverageContract` |
| P4  | Séparation & météo            | `packages/deconflict`, `packages/weather`                                                  | `deconflictContract`, `weatherFilterContract`         |
| P5  | Front carte & configuration   | `apps/web/src/map`, `apps/web/src/features/config`                                         | tests front + `pnpm dev:mock`                         |
| P6  | Front propositions & conduite | `apps/web/src/features/scenarios`, `apps/web/src/features/live`, `apps/web/src/components` | tests front + `pnpm dev:mock`                         |

Jalons communs : **14 h** intégration n° 1 (tout sur `main`, démo interne) · **16 h 30** gel des fonctionnalités · **17 h 45** répétition avec changements imposés.

---

## P1 — Lead architecture et intégration

### Mission

Garantir que **`main` démarre toujours** et que les cinq autres peuvent travailler en parallèle sans se bloquer. P1 est le seul à toucher aux contrats, à l'API et aux dépendances ; il relit et merge **toutes** les PR, y compris celles produites par des agents IA.

### Ce qui existe déjà

- Contrats complets dans `packages/shared` : schémas zod (mission, propositions, événements, `CoverageLayers`), interfaces des moteurs (`engines.ts`), chemins d'API (`API`).
- Suites de contrat dans `packages/contracts`, branchées dans chaque package.
- API Fastify (`apps/api`) : routes auto-chargées, machine à états `config → phasage → propositions → conduite`, pipeline `grille → solveur → séparation → métriques`, WebSocket temps réel, routes de couverture.
- Test d'intégration du scénario de démo complet, mocks du front (`pnpm mocks`), CI (typecheck, format, tests).

### À livrer

| Quand             | Livrable                                                                                                                                                                         |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dès 10 h 30       | Protection de `main` sur GitHub (CI verte + revue obligatoires), vrais identifiants dans `CODEOWNERS`, vérifier que chacun lance `pnpm dev`.                                     |
| Continu           | Revue et merge des PR toutes les 1 à 2 h ; petites PR dédiées pour chaque besoin « hors périmètre » remonté par les autres (champ, route, dépendance).                           |
| 11 h – 14 h       | **Simulation « avec N TP1 / M TP2 »** : route qui recalcule les propositions avec un jeu de moyens hypothétique, sans modifier la mission. Route de **dimensionnement** pour P2. |
| 14 h              | Intégration n° 1 : tout sur `main`, démo interne, liste des trous.                                                                                                               |
| 14 h – 16 h 30    | **Export du dispositif** (positions, hauteurs, secteurs, créneaux par phase ; GeoJSON + récapitulatif lisible). Branchement de la météo par phase si P4 l'a livrée.              |
| 16 h 30 – 18 h 30 | Robustesse, scénario de démo, section « Usage de l'IA » du README, pilotage de la répétition.                                                                                    |

### Points d'attention

- Toute évolution de `shared` : petite PR, mergée vite, **annoncée à tous**, puis `pnpm mocks` pour mettre à jour les mocks du front.
- Nouvelle route : l'ajouter dans `API` (shared), `apps/web/src/api/client.ts`, `mock.ts`, `gen-mocks.ts` et le test d'intégration, dans la même PR.
- Arbitre des contrats : si une règle d'une suite bloque quelqu'un à tort, on la corrige ensemble plutôt que de la laisser contourner.

### Fini quand

Le scénario de démo complet tourne sur `main`, la CI est verte, chaque besoin hors périmètre a été traité ou explicitement refusé.

---

## P2 — Solveur

### Mission

Décider **où placer chaque couple, pour chaque phase**, de façon à maximiser la couverture utile, en respectant toutes les contraintes : disponibilité, météo, arrêté préfectoral (`maxDrones`), zone limite, position imposée, capacités exigées par les zones (zoom, thermique, nuit). C'est le cœur de la valeur de l'outil.

### Ce qui existe déjà

- `greedySolve` (`greedy.ts`) : heuristique gloutonne de couverture maximale pondérée (MCLP), avec pénalité de déplacement pour la stabilité, trois stratégies (`couverture_globale`, `priorite`, `economie_moyens`) et diagnostics.
- `ilpSolve` (`ilp.ts`) : pour l'instant un simple appel au glouton ; le modèle mathématique complet est décrit en commentaire.
- `solve` (`index.ts`) : point d'entrée utilisé par l'API.

### Interface à respecter

`Solver = (ctx: SolveContext) => SolveResult | Promise<SolveResult>` — le contexte contient la mission, le catalogue, les règles de pilotage, la grille de la phase, la stratégie, les couples exclus (météo) et la solution précédente (stabilité).

### À livrer

| Quand          | Livrable                                                                                                                                                                                                          |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 11 h – 14 h    | **ILP avec HiGHS** (déjà installé) selon le modèle de `ilp.ts` ; démarrage depuis la solution gloutonne, **limite ~3 s**, repli sur le glouton si dépassement ou échec.                                           |
| 11 h – 14 h    | **Stratégies réellement différentes** : les trois propositions doivent donner des dispositifs visiblement distincts (sinon le comparatif n'a pas de sens).                                                        |
| 14 h – 16 h 30 | **Dimensionnement** : « quels moyens me faut-il pour couvrir X % (ou X % des zones prioritaires) ? » — fonction qui cherche le plus petit jeu de couples atteignant l'objectif. La route API est à demander à P1. |
| 14 h – 16 h 30 | **Statut infaisable expliqué** : quand rien n'est possible, dire pourquoi (aucun couple employable, capacités manquantes pour telle zone, arrêté à 0…).                                                           |

### Couplages

- **P4** : le solveur place, la séparation ajuste les hauteurs, secteurs ou créneaux. Si la séparation renonce à un couple, elle le dit dans ses diagnostics : s'accorder dès 11 h sur ce que chacun garantit.
- **P3** : le solveur consomme la grille (`Cell.priorityLevel`, `requires`, `forbidden`, `maxHeightM`) ; la performance du solveur dépend de sa taille.
- **P1** : route de dimensionnement.

### Fini quand

`solverContract` passe pour `greedy` **et** `ilp` (moins de 5 s par cas), l'ILP bat ou égale le glouton sur la démo, les trois stratégies diffèrent, le dimensionnement répond à la question de l'opérateur.

```bash
pnpm --filter @aeris/solver test
```

---

## P3 — Moteur géographique et données

### Mission

Traduire la carte en données calculables, puis **mesurer** ce que vaut un dispositif : couverture totale, couverture des zones prioritaires par un drone capable, chevauchements, surfaces, communes concernées. P3 fournit aussi à la carte les **géométries** à afficher, et maintient les données de référence (catalogue drones, règles de pilotage, missions de test).

### Ce qui existe déjà

- `buildGrid` (`grid.ts`) : grille de cellules de 100 m par phase, avec priorité, capacités requises, interdit, urbain, plafond local.
- `computeMetrics` (`metrics.ts`) : indicateurs d'une phase.
- `coverageGeometry` (`coverage.ts`) : couvert / trous / chevauchement, un carré par cellule (v0, exact mais lourd).
- `packages/data` : catalogue des drones, règles TP1/TP2, mission de démo (forêt de Bouconne), 11 missions de test.

### Interfaces à respecter

`GridBuilder`, `MetricsEngine`, `CoverageGeometryBuilder` (dans `engines.ts`) ; schéma `CoverageLayers` pour la carte.

### À livrer

| Quand          | Livrable                                                                                                                                                                                             |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 11 h – 14 h    | **Géométries fusionnées** pour la carte (union / dissolve des cellules avec turf) : même forme `CoverageLayers`, fichier beaucoup plus léger.                                                        |
| 11 h – 14 h    | **Communes concernées** (`metrics.communes`) via geo.api.gouv.fr — attention : appel réseau, à faire hors des fonctions pures et avec repli si pas de réseau.                                        |
| 14 h – 16 h 30 | **Métrique de stabilité après changement** : combien de couples ont bougé, de combien, entre deux dispositifs (recalcul en conduite, changement de phase). Le champ est à ajouter au contrat via P1. |
| 14 h – 16 h 30 | **Performance** : grille et métriques assez rapides pour que solveur + recalculs restent fluides (indexation spatiale, pré-calcul des voisinages).                                                   |
| Continu        | **Données** : valider les caractéristiques des drones et les règles TP1/TP2, remplacer les géométries de démo par celles de l'organisateur dès qu'elles arrivent.                                    |

### Couplages

- **P5** : la forme `CoverageLayers` est figée ; P3 peut améliorer le calcul sans rien casser côté carte. Se voir à 11 h pour les attentes visuelles (précision, poids).
- **P2** : la grille est l'entrée du solveur ; prévenir avant de changer sa granularité ou son contenu.
- **Tout le monde** : ajouter une mission de test = ajouter un cas aux suites de contrat de tous. Le signaler.

### Fini quand

`gridContract`, `metricsContract` et `coverageContract` passent, la carte affiche couverture et trous sans ralentir, les communes et la stabilité sont visibles dans les métriques.

```bash
pnpm --filter @aeris/geo test
```

---

## P4 — Séparation des drones et météo

### Mission

Garantir que **deux drones ne se gênent jamais** et que l'on n'engage pas un drone que la météo empêche de voler. La séparation applique la cascade du brief : **horizontal → vertical → temporel → renoncement**, et dit toujours ce qu'elle a fait.

### Ce qui existe déjà

- `deconflict` (`packages/deconflict`) : séparation verticale seule, par tranches de 20 m sous le plafond de chaque couple, plafonds locaux (terrain militaire) respectés ; détection des conflits restants.
- `fetchWeather` (`packages/weather`) : météo courante via Open-Meteo (gratuit, sans clé).
- `flyability` et `excludedByWeather` : exclusion d'un couple pour vent, pluie, nuit ou température, avec la raison.

### Interfaces à respecter

`Deconflicter = (assignments, ctx: DeconflictContext) => DeconflictResult` — le contexte donne la mission, le catalogue, les règles, la grille de la phase (plafonds locaux, cellules urbaines). `WeatherProvider`, `WeatherFilter`.

### À livrer

| Quand          | Livrable                                                                                                                                                                      |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 11 h – 14 h    | **Séparation horizontale** : secteurs distincts (Voronoï des positions, découpé par les cercles de portée) → champ `sector`.                                                  |
| 11 h – 14 h    | **Vertical complet** : tranches compatibles avec les plafonds urbains / militaires et les capacités.                                                                          |
| 14 h – 16 h 30 | **Temporel** : créneaux décalés dans la phase (`slot`) quand ni l'horizontal ni le vertical ne suffisent.                                                                     |
| 14 h – 16 h 30 | **Renoncement** : retirer temporairement le couple le moins utile, et le dire explicitement (le contrat l'exige).                                                             |
| 14 h – 16 h 30 | **Météo par phase** : prévision horaire sur la période de la mission, pour exclure un couple sur une phase seulement. Le changement d'interface (phase → météo) passe par P1. |

### Couplages

- **P2** : s'accorder dès 11 h sur la frontière : le solveur ne garantit pas la séparation, la séparation ne déplace pas les positions imposées et ne sort pas des zones limites.
- **P6** : les diagnostics de séparation et les exclusions météo sont affichés à l'opérateur : formulations courtes et lisibles par un non-spécialiste.
- **P1** : branchement de la météo par phase dans le pipeline.

### Fini quand

`deconflictContract` et `weatherFilterContract` passent, la cascade complète fonctionne sur la démo, chaque séparation ou renoncement est expliqué dans les diagnostics.

```bash
pnpm --filter @aeris/deconflict test
pnpm --filter @aeris/weather test
```

---

## P5 — Front : carte et configuration

### Mission

Permettre à l'opérateur de **décrire son opération sur la carte**, vite et sans erreur : zone de travail, zones prioritaires, zones de contrainte, couples, arrêté, phases. Et afficher sur la carte ce que les moteurs calculent : positions, rayons, couverture, trous.

### Ce qui existe déjà

- `MapView` : carte Leaflet avec fonds IGN, OSM, ortho.
- `MissionLayers`, `AssignmentsLayer` : affichage des zones et des drones (déplaçables).
- `ConfigPanel` : chargement de la mission de démo, nombre max de drones, nombre de phases, listes des couples et des zones (lecture seule).
- `leaflet-geoman` déjà installé.

### À livrer

| Quand          | Livrable                                                                                                                                                                           |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 11 h – 14 h    | **Dessin des zones** avec leaflet-geoman : zone de travail, zones prioritaires (niveau, action, capacités requises), contraintes, zones limites des couples → `api.updateMission`. |
| 11 h – 14 h    | **Couches couverture / trous / chevauchement** à partir de `api.coverage` (propositions) et `api.liveCoverage` (conduite).                                                         |
| 14 h – 16 h 30 | **Formulaires** : couples télépilote + drone (catalogue), arrêté (périmètre, période, nombre max), affectation des zones prioritaires aux phases.                                  |
| 14 h – 16 h 30 | **Curseurs de simulation** « avec N TP1 / M TP2 » (route fournie par P1).                                                                                                          |

### Couplages

- **P3** : forme des géométries figée (`CoverageLayers`) ; tant que P3 n'a pas fusionné les cellules, la couche est lourde mais correcte.
- **P6** : P5 possède `map/`, P6 y branche ses couches. Les composants de carte réutilisables (`AssignmentsLayer`…) restent chez P5 : se coordonner avant d'en changer les props.
- **P1** : tout nouveau besoin d'API.

### Méthode

Travailler avec `pnpm dev:mock` (front sans backend) puis vérifier avec `pnpm dev`. Les coordonnées GeoJSON sont `[lng, lat]`, Leaflet attend `[lat, lng]` : piège classique.

### Fini quand

Un opérateur peut créer une mission de bout en bout sans la mission de démo, et voit immédiatement couverture et trous sur la carte.

```bash
pnpm --filter @aeris/web test && pnpm dev:mock
```

---

## P6 — Front : propositions et conduite des opérations

### Mission

Aider l'opérateur à **choisir** un dispositif (comparer les propositions, les retoucher) puis à **conduire** l'opération en temps réel : suivre positions et couverture, déclarer ce qui change, valider ou refuser le recalcul proposé. C'est aussi P6 qui rend la démo devant le jury fluide.

### Ce qui existe déjà

- `ScenariosPanel` : onglets de phase, liste des propositions avec métriques (`MetricsCard`), sélection, positions déplaçables (recalcul des métriques).
- `LivePanel` + `useLiveSocket` : flux temps réel par WebSocket, injection d'événements (TP indisponible…), recalcul et validation.
- Mode mock : le flux temps réel est simulé en mémoire (`subscribeMockLive`).

### À livrer

| Quand             | Livrable                                                                                                                                                   |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 11 h – 14 h       | **Comparaison des propositions** : vue côte à côte, écarts mis en évidence, tri, diagnostics lisibles (exclusions météo, renoncements, statut infaisable). |
| 11 h – 14 h       | **Édition des positions** propre (glisser → `editProposal`), avec retour visuel du changement de métriques.                                                |
| 14 h – 16 h 30    | **Conduite complète** : journal détaillé des événements, avant / après d'un recalcul avant validation, changement de phase.                                |
| 14 h – 16 h 30    | **Nouvelle zone prioritaire en direct**, dessinée sur la carte pendant la conduite (événement `priority_zone_added`).                                      |
| 16 h 30 – 17 h 45 | **Panneau de démo** : boutons pour rejouer les changements imposés par le jury (TP indisponible, coup de vent, nouvelle zone prioritaire).                 |

### Couplages

- **P5** : couches de carte partagées (voir plus haut).
- **P4 / P2** : les diagnostics affichés viennent d'eux ; remonter les formulations peu claires.
- **P1** : export du dispositif à intégrer dans l'interface.

### Fini quand

Le scénario de répétition (TP indisponible → recalcul → validation ; coup de vent ; nouvelle zone) se joue en moins d'une minute, sans recharger la page, avec des écrans compréhensibles par un non-informaticien.

```bash
pnpm --filter @aeris/web test && pnpm dev:mock
```

---

## Règles communes (rappel)

- Chacun écrit **uniquement dans ses dossiers** ; un besoin ailleurs se signale à P1 (section « Besoins hors périmètre » de la PR).
- Branches courtes `p<N>/<sujet>`, PR vers `main` relues par P1, merge toutes les 1 à 2 h.
- Avant chaque PR : `pnpm format && pnpm typecheck && pnpm test`.
- Les agents IA suivent la section « Consignes pour les agents IA » du README.
