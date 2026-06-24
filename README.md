# NzelaBus — Réservation de bus au Congo-Brazzaville

Plateforme de réservation de billets de bus (style FlixBus) adaptée au
Congo-Brazzaville : axes routiers réels, prix en Francs CFA (XAF), sélection
du siège sur plan du bus, et **paiement manuel par Mobile Money (MTN / Airtel)**
avec confirmation par un agent.

## Fonctionnalités

- 🔎 Recherche de trajets (ville de départ / arrivée / date / passagers)
- 🛣️ Axes réels : RN1 (Brazzaville ↔ Pointe-Noire), RN2 (Brazzaville ↔ Ouesso),
  axe des Plateaux (Djambala), axe Niari (Sibiti)
- 💺 Sélection du siège sur un plan de bus interactif
- 📲 Paiement Mobile Money manuel : le client envoie l'argent au numéro MTN,
  reçoit un code de transaction par SMS et le saisit sur le site
- 🛠️ Espace agent pour confirmer ou refuser chaque paiement
- 🎫 Billet avec statut en temps réel
- 📱 Design responsive, mobile-first

## Lancer le site

C'est un site statique « no-build ». Aucune installation requise.

- **En ligne** : activez GitHub Pages (Settings → Pages → branche `main`, dossier `/root`).
- **En local** : servez le dossier avec un serveur statique, par ex. :
  ```bash
  python3 -m http.server 8000
  ```
  puis ouvrez http://localhost:8000

> React est chargé via CDN (esm.sh) avec `htm` — pas d'étape de build.

## Espace agent (démo)

- URL : `#/admin`
- Code d'accès par défaut : `nzela2026` (modifiable dans l'onglet Paramètres)

## Structure

```
index.html          Point d'entrée + importmap (React via CDN)
assets/styles.css    Styles
src/
  data.js            Villes, axes, opérateurs, recherche de trajets
  store.js           Stockage local (réservations, config, session agent)
  format.js          Formatage XAF / dates / références
  router.js          Routeur par hash
  app.js             Application + routes
  components/        Header, Footer, SearchForm, Ticket
  pages/             Home, Results, SeatSelection, Passengers, Payment,
                     Confirmation, MyBookings, Admin
```

## Limites (version démo)

Les réservations sont stockées dans le navigateur (localStorage). Pour une
mise en production multi-utilisateurs, prévoir un backend (base de données,
comptes agents, notifications SMS, vérification des paiements Mobile Money).
