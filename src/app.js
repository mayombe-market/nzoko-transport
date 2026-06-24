import { html, useState, useMemo, createContext, useContext } from "./html.js";
import { useRoute } from "./router.js";
import { Header } from "./components/Header.js";
import { Footer } from "./components/Footer.js";
import { Home } from "./pages/Home.js";
import { Results } from "./pages/Results.js";
import { SeatSelection } from "./pages/SeatSelection.js";
import { Passengers } from "./pages/Passengers.js";
import { Payment } from "./pages/Payment.js";
import { Confirmation } from "./pages/Confirmation.js";
import { MyBookings } from "./pages/MyBookings.js";
import { Admin } from "./pages/Admin.js";

// Contexte global : brouillon de réservation en cours (en mémoire)
const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);

function NotFound() {
  return html`
    <div class="container narrow center-block">
      <h1>Page introuvable</h1>
      <p>La page que vous cherchez n'existe pas.</p>
      <a class="btn btn-primary" href="#/">Retour à l'accueil</a>
    </div>
  `;
}

export function App() {
  const route = useRoute();
  // brouillon : { trip, seats, passengers, search }
  const [draft, setDraft] = useState({ trip: null, seats: [], passengers: [], search: null });

  const ctx = useMemo(
    () => ({
      draft,
      setTrip: (trip) => setDraft((d) => ({ ...d, trip, seats: [] })),
      setSeats: (seats) => setDraft((d) => ({ ...d, seats })),
      setPassengers: (passengers) => setDraft((d) => ({ ...d, passengers })),
      setSearch: (search) => setDraft((d) => ({ ...d, search })),
      reset: () => setDraft({ trip: null, seats: [], passengers: [], search: null }),
    }),
    [draft]
  );

  let page;
  switch (route.path) {
    case "/": page = html`<${Home} />`; break;
    case "/resultats": page = html`<${Results} params=${route.params} />`; break;
    case "/sieges": page = html`<${SeatSelection} params=${route.params} />`; break;
    case "/passagers": page = html`<${Passengers} />`; break;
    case "/paiement": page = html`<${Payment} />`; break;
    case "/confirmation": page = html`<${Confirmation} params=${route.params} />`; break;
    case "/mes-billets": page = html`<${MyBookings} params=${route.params} />`; break;
    case "/admin": page = html`<${Admin} />`; break;
    default: page = html`<${NotFound} />`;
  }

  const isAdmin = route.path === "/admin";

  return html`
    <${AppCtx.Provider} value=${ctx}>
      <${Header} active=${route.path} />
      <main class="page">${page}</main>
      ${!isAdmin && html`<${Footer} />`}
    <//>
  `;
}
