# @aeris/geo — moteur géo (P3)

Mesure ce que couvre un dispositif. Ne place rien (solveur, P2) et ne sépare rien
(séparation, P4) : il dit ce qui est couvert, ce qui reste à découvert, ce qui se chevauche,
qui couvre quoi et ce qui a changé après un recalcul. Fonctions pures, sans réseau.

## Méthode

1. **Grille** (`buildGrid`) : la zone de travail est découpée en cellules carrées
   (`mission.gridCellM`, 100 m par défaut ; une grille par phase). Une cellule appartient à
   une zone si son **centre** y tombe.
2. **Couverture** : une cellule est couverte par un drone si son centre est à moins de la
   portée du couple (TP1 1 km, TP2 2 km). On ne parcourt que le voisinage de chaque drone
   (`pourChaqueCelluleAPortee`), même résultat qu'un parcours complet.
3. **Pire moment** (`presenceAuPireMoment`) : si des drones alternent par créneaux, on compte
   ceux présents au moment le moins couvert de la phase. « À tout instant, au moins n drones
   voient cette cellule. » Sans créneau, c'est un simple comptage.
4. **Surfaces** = nombre de cellules × surface d'une cellule. Pour la carte, les cellules
   voisines sont fusionnées en rectangles (quelques centaines de polygones au lieu de milliers).

## Ce que le module fournit

| Fonction                                 | Réponse                                                                                                  |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `computeMetrics`                         | Couverture totale, prioritaire, pondérée, chevauchement, surfaces                                        |
| `coverageGeometry`                       | Carte : couvert, trous, chevauchement                                                                    |
| `couchesParCouple`                       | Carte « qui couvre quoi » : une surface par couple (le plus proche est responsable)                      |
| `couvertureParZone`                      | « Lisière nord : 92 % servie », zone par zone                                                            |
| `mesurerStabilite`                       | Après un recalcul : couples déplacés, retirés, écarts de couverture, résumé en phrases                   |
| `mesurerRedondance`, `couchesRedondance` | Zones qui exigent r drones : redondance atteinte, chevauchement utile ou superflu, où il manque un drone |
| `verifierRedondance`                     | Contrôle de saisie : r possible avec l'arrêté et les capacités des drones ?                              |
| `communesConcernees`                     | Communes touchées, surface couverte et non couverte                                                      |

Plusieurs types (`Stabilite`, `CouverturePropre`, `CouvertureZone`, `IndicateursRedondance`,
`CommuneConcernee`…) sont déclarés ici en attendant leur place dans `@aeris/shared`
(marqués `TODO(P1)`).

## Définitions

- **Servie** : vue par au moins un drone qui a les capacités requises par la zone (zoom,
  thermique, nuit).
- **Redondance** (r, fixé par l'utilisateur, 1 par défaut) : chevauchement **utile** = de 2 à
  r drones ; **superflu** = plus de r ; crédit partiel min(n, r) / r dans la couverture
  pondérée. Avec r = 1 partout, on retrouve exactement `computeMetrics`.
- **Responsable** d'une cellule : le couple le plus proche parmi ceux qui la couvrent ; à
  égalité, le plus petit identifiant (résultat indépendant de l'ordre).

## Limites assumées

- **Pas de relief ni de masque de vue** : la couverture est un disque. Un drone en forêt ou
  derrière une colline voit moins que ce qui est affiché.
- **Précision d'une cellule** : à 100 m, les bords de zone sont approchés à ±1 cellule
  (quelques % de surface). Afficher des pourcentages arrondis, pas au dixième.
- **Petites zones** : une zone plus petite qu'une cellule peut ne contenir aucun centre de
  cellule ; `couvertureParZone` la signale par `cells: 0`.
- **Zone limite d'un couple** (`allowedArea`) : pas encore prise en compte dans la couverture
  (le calcul ne reçoit pas la mission ; demande à P1).

## Tests

`pnpm --filter @aeris/geo test` : suites de contrat de P1 (grille, métriques, couches) et tests
propres au module (équivalence avec le parcours complet, surfaces des couches, pire moment,
redondance, stabilité, communes).

## Usage de l'IA

Code, tests et documentation écrits avec Claude Code (Anthropic, Opus 5.5), relus par P3.
