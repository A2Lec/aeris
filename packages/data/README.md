# @aeris/data — données de référence (P3)

| Fichier                      | Contenu                                                   | Source                                                                         |
| ---------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `drones.json`                | Catalogue des 3 drones de référence                       | Fiches constructeur et revendeurs, **valeurs indicatives**                     |
| `pilot-rules.json`           | Capacités TP1 / TP2 en hors vue (scénario 2.2)            | Mémo « scénarios drone » de l'organisateur                                     |
| `fixtures/mission-demo.json` | Mission de démonstration, forêt de Bouconne               | **Fictive** (géométries et noms)                                               |
| `fixtures/index.ts`          | Missions de test (cas limites) pour les suites de contrat | Équipe (P1)                                                                    |
| `communes-demo.json`         | Contours des 21 communes autour de la démo (31, 32)       | API Géo de l'État, geo.api.gouv.fr (IGN Admin Express), extraits le 14/10/2026 |

## Valeurs à confirmer

| Donnée                    | Valeur retenue | Commentaire                                                     |
| ------------------------- | -------------- | --------------------------------------------------------------- |
| DJI Mini 5 Pro, vent max  | 12 m/s         | Fiches revendeurs ; l'ancien 10,7 m/s était celui du Mini 4 Pro |
| DJI Mini 5 Pro, zoom      | ×4             | Zoom numérique (×4 en Full HD, ×3 en 4K)                        |
| DJI Mavic 3 Enterprise    | sans thermique | Version 3E ; la 3T en a une                                     |
| Températures, pluie       | voir fichier   | Indicatif, non vérifié une à une                                |
| Vol en vue (scénario 1.1) | non modélisé   | Seules les portées hors vue (1 km, 2 km) sont utilisées         |

Les trois drones résistent au même vent (12 m/s) : un coup de vent les clouera tous au sol en
même temps, aucun n'est plus fragile que les autres.

## Communes pour une autre zone

Les moteurs n'appellent pas le réseau. Pour une mission ailleurs, extraire une fois les
communes du ou des départements concernés :
`https://geo.api.gouv.fr/departements/{code}/communes?fields=nom,code,contour&format=geojson&geometry=contour`,
ne garder que celles qui touchent la zone de travail, et les ranger au même format.
