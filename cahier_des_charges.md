---

# Cahier des Charges global — Outil d'Aide à la Décision (OAD) Drones

## 1. Contexte et Objectif Opérationnel

- **Événement :** Hackathon Drones organisé par la Région de gendarmerie d'Occitanie à Toulouse le 14 octobre 2026.

- **Contexte métier :** Le nombre de drones disponibles dans les unités de gendarmerie augmente et leur emploi opérationnel est appelé à se développer.

- **Objectif principal :** Concevoir un outil d'aide à la décision (OAD) capable de **planifier** les moyens nécessaires à une mission, puis de **coordonner** leur emploi dans un même espace aérien pendant la conduite des opérations.

- **Finalité :** Passer d'un besoin opérationnel à un dispositif cohérent, réalisable et adaptable, en intégrant une boucle décisionnelle permettant de générer des propositions puis de les valider ou de lancer un recalcul.

---

## 2. Modélisation des Moyens et des Contraintes

### 2.1 Capacités des Télépilotes (TP1 / TP2)

Tous les télépilotes n'ont pas les mêmes capacités de couverture (vol en vue ou hors vue, distance maximale, hauteur maximale, drone pouvant être employé). Le mémo « scénarios drone » définit trois capacités de référence (hors contraintes particulières liées à l'espace aérien) :

| Cas d'usage               | Niveau Télépilote | Portée maximale | Hauteur maximale |
| ------------------------- | ----------------- | --------------- | ---------------- |
| **En vue (scénario 1.1)** | **TP1**           | En vue          |

| 120 m/sol

|
| **Hors vue (scénario 2.2)** | **TP1** | 1 km

| 50 m en zone rurale / 80 m en zone urbaine

|
| **Hors vue (scénario 2.2)** | **TP2** | 2 km

| 120 m/sol

|

### 2.2 Moyens Matériels (Drones)

- **Catalogue simplifié :** Trois drones de référence sont retenus sans catalogue complexe : **DJI Matrice 4T**, **DJI Mavic 3 Enterprise** et **DJI Mini 5**.

- **Autonomie :** L'autonomie opérationnelle est déclarée au début de la mission, sans gestion des batteries, des rotations ou des recharges.

- **Pistes de cadrage initiales (notes d'équipe) :** Prise en compte éventuelle de drones fixes ou mobiles (filaires) et d'une dotation de base de 2 drones par unité.

### 2.3 Contraintes Opérationnelles et Environnementales

- **Cadre réglementaire (Arrêté préfectoral) :** Fixe le périmètre autorisé, la période autorisée et le nombre maximal de drones déployables simultanément.

- **Environnement et terrain :** Zones contraintes (interdites ou à plafond limité), champ d'évolution (limites droite/gauche) et conditions d'emploi jour/nuit.

- **Météo :** Intégration de la météo comme aide à la décision via une API simple, sans qu'un moteur météo complexe ne soit attendu.

- **Disponibilité :** Prise en compte de la disponibilité réelle des moyens humains et matériels.

---

## 3. Périmètre Fonctionnel

### Phase 1 : PLANIFIER (Dimensionner, Simuler, Positionner)

L'outil doit répondre à deux questions : _« Quels moyens me faut-il ? »_ et _« Avec les moyens dont je dispose, que puis-je couvrir ? »_.

1. **Simuler :** Partir de la zone de travail et faire varier le nombre de TP1, le nombre de TP2 et les drones disponibles.

2. **Dimensionner et Positionner :** Estimer le nombre de couples drone-télépilote nécessaires, le niveau des télépilotes et les capacités requises, puis suggérer les positions offrant la meilleure couverture possible.

3. **Prioriser et Optimiser :** Toutes les zones n'ayant pas la même importance, l'outil doit maximiser une couverture pondérée arbitrant entre le taux de couverture global et les zones à priorité opérationnelle supérieure.

4. **Identifier stratégiquement :** Identifier les zones non couvertes, les zones de chevauchement et les communes concernées.

5. **Filtrer selon l'autorisation :** Appliquer l'entonnoir décisionnel en passant du dispositif **Demandé** (préparation et identification des besoins) au cadre **Autorisé** (arrêté préfectoral fixant périmètre, période et nombre maximal de drones), puis au dispositif **Réalisable** qui s'y conforme et se recalcule en conséquence.

### Phase 2 : CONDUIRE LES OPÉRATIONS (Coordonner, Séparer, Recalculer)

1. **Coordonner en 4 dimensions :** Gérer simultanément plusieurs drones dans un même espace aérien selon une coordination horizontale, verticale et éventuellement temporelle :

- **X/Y (Où ?) :** une position et un secteur.

- **Radius (Jusqu'où ?) :** une zone compatible avec la capacité du télépilote.

- **Z (À quelle hauteur ?) :** une hauteur compatible avec son scénario d'emploi.

- **T (Quand ?) :** un créneau temporel lorsque cela est nécessaire.

2. **Visualiser sur une carte utile au calcul :** Afficher clairement le fond de carte, la zone de travail, les zones prioritaires, les zones contraintes, les positions TP/drones et les zones de couverture pour voir immédiatement qui couvre quoi. Détecter les chevauchements, mesurer leur surface, les visualiser et réduire les chevauchements inutiles (un chevauchement pouvant être conservé s'il présente un intérêt opérationnel).

3. **Séparer les drones (Cascade de résolution de conflit) :** Lorsqu'un conflit apparaît, appliquer dans l'ordre strict :

- **Niveau 1 — Horizontal :** attribuer des secteurs distincts.

- **Niveau 2 — Vertical (si échec) :** attribuer des hauteurs différentes selon les capacités.

- **Niveau 3 — Temporel (si échec) :** décaler les créneaux si nécessaire.

- **Niveau 4 — Renoncer (si échec) :** réduire temporairement le nombre de drones employés ; l'outil doit savoir indiquer explicitement qu'aucune solution valide n'existe.

4. **Recalculer lorsque la situation évolue :** Adapter le dispositif de manière rapide, compréhensible et en limitant les changements inutiles :

- **Cas 1 — Télépilote indisponible :** identifier la perte, proposer une nouvelle organisation et afficher les zones non couvertes.

- **Cas 2 — Déplacement :** actualiser la position, recalculer la zone et détecter les nouveaux trous ou chevauchements.

---

## 4. Défis Algorithmiques et Indicateurs d'Évaluation

### Les 4 Problèmes Algorithmiques au Cœur du Défi

- **PLACER :** Où positionner les moyens pour maximiser la couverture utile ?

- **DÉCOUPER :** Comment répartir l'espace entre les télépilotes en limitant les trous et les chevauchements ?

- **SÉPARER :** Comment résoudre un conflit horizontalement, verticalement ou dans le temps ?

- **RECALCULER :** Comment adapter le dispositif lorsqu'un élément change ?

### Les 4 Métriques d'Évaluation Attendues

L'outil doit permettre de mesurer, expliquer et comparer les résultats obtenus via quatre indicateurs :

1. **Couverture totale (%) :** Pourcentage de la zone de travail couverte (et affichage du pourcentage non couvert).

2. **Couverture prioritaire (%) :** Pourcentage des zones prioritaires couvertes.

3. **Chevauchement (%) :** Part de couverture redondante entre plusieurs drones.

4. **Stabilité après un changement :** Évaluation du maintien de la solution lorsqu'un télépilote devient indisponible ou est déplacé (ex. `STABLE / -5%`).

---

## 5. Spécifications Techniques et Critères d'Évaluation du Jury

- **Stack de développement :** Application web en **JavaScript** ou **TypeScript** utilisant obligatoirement **Leaflet** pour la cartographie ; le choix des bibliothèques complémentaires et des frameworks reste libre.

- **Fonds de cartes :** Un fond simple (type Plan IGN et/ou OpenStreetMap) ainsi qu'un fond de type satellite.

- **Flux météo :** Utilisation d'une API météo gratuite accessible sans connexion (sans authentification par compte/clé).

- **Formats de données :** Données géographiques au format **GeoJSON** et autres données au format **JSON**.

- **Usage de l'IA :** L'intelligence artificielle est autorisée mais son usage doit être déclaré.

- **Livrables et soutenance :** Fourniture du code source documenté et démonstration finale devant le jury incluant des changements imposés en direct.

- **Philosophie d'évaluation :** Toutes les équipes travaillent sur les mêmes données et critères ; _« un résultat modeste, bien analysé et bien expliqué, vaut mieux qu'un résultat opaque »_.

---
