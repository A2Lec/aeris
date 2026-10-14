# Aeris — Planifier · Coordonner · Couvrir

Outil d'aide à la décision pour **dimensionner et coordonner l'emploi des drones** en opération de gendarmerie (Hackathon Drones, Région de gendarmerie d'Occitanie, 14/10/2026).

## Démarrer

```bash
pnpm install        # toutes les dépendances sont déjà déclarées : ne pas en ajouter sans prévenir P1
pnpm dev            # API sur :3001, front sur http://localhost:5173
pnpm typecheck      # avant chaque merge request
pnpm test
```

Le squelette fonctionne déjà de bout en bout : charger la mission de démo → phasage → 3 propositions → lancer l'opération → déclarer un TP indisponible → recalculer → appliquer.

## Hypothèses retenues

| Sujet                  | Décision                                                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Langage                | TypeScript partout (front, back, solveur)                                                                          |
| Couples TP + drone     | Fixés à la configuration, l'algo ne les recompose pas                                                              |
| Zone limite d'un drone | Polygone configurable (`allowedArea`) **ou** position imposée (`fixedPosition`), sinon l'algo propose              |
| Relief                 | Hauteur /sol uniquement, pas de masques de relief                                                                  |
| Portée                 | Portées max uniquement (TP1 1 km, TP2 2 km), pas de gestion du vol en vue                                          |
| Temporalité            | N phases choisies par l'opérateur ; les zones prioritaires changent selon la phase ; pas de gestion de l'autonomie |
| Temps réel             | Un seul poste fixe ; positions et couverture poussées par WebSocket                                                |
| Zone de travail        | Polygone défini au début, tout le calcul se fait dedans                                                            |
| Hauteurs               | TP1 : 50 m rural / 80 m urbain ; TP2 : 120 m ; 50 m près d'un terrain militaire (zone `hauteur_limitee`)           |

## Architecture

```
            ┌──────────────── apps/web (React + Leaflet) ────────────────┐
            │ features/config   features/scenarios   features/live        │
            │        map/ (fonds IGN · OSM · ortho, couches partagées)    │
            └──────────── REST /api/* ────────────── WebSocket live ──────┘
                                     │
            ┌──────────────── apps/api (Fastify) ─────────────────────────┐
            │ routes/*.ts (auto-chargées)   store (mémoire)   services/   │
            │ pipeline : grille → solveur → séparation → métriques        │
            └──────┬──────────────┬──────────────┬──────────────┬─────────┘
                   │              │              │              │
             packages/geo   packages/solver  packages/deconflict  packages/weather
                   └──────────────┴──── packages/shared (contrats zod) ─┘
                                        packages/data (catalogue, fixtures)
```

Cycle de vie d'une mission (machine à états côté API) :
`config` → `phasage` → `propositions` → `conduite` (événements → recalcul proposé → validation opérateur).

### Le modèle de calcul

1. **Grille** (`geo/buildGrid`) : la zone de travail est découpée en cellules de 100 m, une grille par phase. Chaque cellule porte sa priorité (zones actives dans la phase), ses capacités requises (zoom, thermique, nuit), et ses contraintes (interdite, plafond, urbain).
2. **Placement** (`solver`) : couverture maximale pondérée (MCLP). v0 = glouton ; v1 = programme linéaire en nombres entiers avec HiGHS (`ilp.ts`, modèle décrit en commentaire). Contraintes : disponibilité, météo, arrêté (`maxDrones`), zone limite, position imposée, capacités. Une pénalité de déplacement par rapport à la solution précédente assure la **stabilité** entre phases et lors des recalculs.
3. **Séparation** (`deconflict`) : cascade du brief horizontal → vertical → temporel → renoncement. v0 = tranches d'altitude de 20 m.
4. **Mesure** (`geo/computeMetrics`) : couverture totale, prioritaire (par un drone capable), pondérée, chevauchement, surfaces.
5. **Plusieurs propositions** : une par stratégie (`couverture_globale`, `priorite`, `economie_moyens`), calculées en parallèle.

## Répartition (6 personnes)

Chaque personne **possède un dossier** : personne d'autre n'y écrit sans la prévenir (voir `.github/CODEOWNERS`).

| #      | Rôle                          | Dossiers possédés                                                                          | Livrables clés                                                                                                                                                      |
| ------ | ----------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P1** | Lead archi / intégration      | `packages/shared`, `apps/api`, racine                                                      | dépôt + CI, contrats, routes, pipeline, simulation « avec N TP1 / M TP2 », export du dispositif, merges, démo                                                       |
| **P2** | Solveur                       | `packages/solver`                                                                          | ILP HiGHS (limite ~3 s, repli glouton), stratégies réellement différentes, **dimensionnement** (« quels moyens me faut-il pour X % ? »), statut infaisable expliqué |
| **P3** | Moteur géo                    | `packages/geo`, `packages/data`                                                            | polygones de couverture / trous / chevauchements en GeoJSON pour la carte, communes concernées, métrique de **stabilité après changement**, performance             |
| **P4** | Séparation & météo            | `packages/deconflict`, `packages/weather`                                                  | cascade complète (secteurs Voronoï, plafonds locaux urbain/militaire, créneaux, renoncement), météo par phase (prévision horaire)                                   |
| **P5** | Front carte & configuration   | `apps/web/src/map`, `apps/web/src/features/config`                                         | dessin des zones (leaflet-geoman), formulaires couples/arrêté/phases, curseurs de simulation, couches couverture/trous                                              |
| **P6** | Front propositions & conduite | `apps/web/src/features/scenarios`, `apps/web/src/features/live`, `apps/web/src/components` | comparaison des propositions, édition des positions, conduite temps réel, ajout de zone prioritaire en direct, panneau de démo                                      |

Points de couplage à anticiper :

- **P3 ↔ P5** : P3 expose les géométries de couverture, P5 les affiche (se mettre d'accord sur la signature dès 11 h).
- **P2 ↔ P4** : le solveur place, la séparation ajuste ; si la séparation renonce à un couple, elle le dit dans `diagnostics`.
- **P1 ↔ tous** : toute évolution de `packages/shared` passe par P1.

## Règles pour éviter les conflits de merge

1. **Contrats d'abord** : `packages/shared` est la seule interface entre les équipes. Modification = petite MR dédiée, mergée vite par P1, annoncée à tous.
2. **Dépendances** : tout est installé. Besoin d'un paquet ? Le demander à P1, qui l'ajoute en une MR (le `pnpm-lock.yaml` est la première source de conflits).
3. **Pas de fichier central à enrichir** : les routes API sont auto-chargées (`apps/api/src/routes/`, un fichier par sujet), chaque fonctionnalité front a son store (`features/<nom>/store.ts`), `App.tsx` ne fait qu'assembler.
4. **Formatage** : `pnpm format` avant chaque commit (Prettier commité, même config pour tous).
5. **Branches courtes** : `p2/ilp`, `p5/geoman`… Rebase sur `main` et merge toutes les 1 à 2 h. Une MR = un sujet.
6. **Travailler contre des mocks** : la mission de démo (`packages/data/src/fixtures`) permet à chacun de tester seul.
7. **CI** : typecheck + tests sur chaque MR ; `main` doit toujours démarrer.

## Planning (8 h)

| Heure             | Jalon                                                                                          |
| ----------------- | ---------------------------------------------------------------------------------------------- |
| 10 h 30 – 11 h    | Chacun clone, lance `pnpm dev`, lit `packages/shared` et le README ; accords P3/P5 et P2/P4    |
| 11 h – 14 h       | v1 de chaque module, merges réguliers                                                          |
| **14 h**          | **Intégration n°1** : tout est sur `main`, démo interne                                        |
| 14 h – 16 h 30    | v2 : ILP, cascade de séparation, dessin des zones, conduite complète, dimensionnement          |
| **16 h 30**       | **Gel des fonctionnalités**                                                                    |
| 16 h 30 – 17 h 45 | Robustesse, scénario de démo, documentation du code, déclaration d'usage de l'IA               |
| 17 h 45 – 18 h 30 | Répétition avec changements imposés (TP indisponible, coup de vent, nouvelle zone prioritaire) |

## Données à valider

- `packages/data/src/drones.json` : autonomie, vent max, zoom, thermique et nuit sont **indicatifs** (Mavic 3 Enterprise = version 3E sans thermique ; la 3T en a une).
- `packages/data/src/pilot-rules.json` : capacités TP1/TP2 du mémo « scénarios drone ».
- `PRIORITY_WEIGHTS` et `MILITARY_MAX_HEIGHT_M` dans `packages/shared/src/rules.ts`.
- Mission de démo (forêt de Bouconne) : géométries fictives, à remplacer par les données de l'organisateur dès qu'elles arrivent.

## Usage de l'IA (à déclarer)

Squelette, contrats et documentation initiale générés avec Claude (Anthropic), puis relus par l'équipe. Compléter cette section avec les usages de chacun.
