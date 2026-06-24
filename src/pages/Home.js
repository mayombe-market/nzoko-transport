import { html } from "../html.js";
import { SearchForm } from "../components/SearchForm.js";
import { navigate } from "../router.js";
import { formatXAF } from "../format.js";

const POPULAR = [
  { from: "brazzaville", to: "pointenoire", label: "Brazzaville → Pointe-Noire", price: 13000, duration: "8 h" },
  { from: "brazzaville", to: "dolisie", label: "Brazzaville → Dolisie", price: 9500, duration: "6 h" },
  { from: "brazzaville", to: "oyo", label: "Brazzaville → Oyo", price: 8000, duration: "5 h" },
  { from: "brazzaville", to: "ouesso", label: "Brazzaville → Ouesso", price: 20000, duration: "12 h" },
  { from: "brazzaville", to: "nkayi", label: "Brazzaville → Nkayi", price: 7000, duration: "4 h 30" },
  { from: "pointenoire", to: "dolisie", label: "Pointe-Noire → Dolisie", price: 4000, duration: "2 h 30" },
];

const STEPS = [
  { icon: "🔎", title: "Cherchez", text: "Choisissez votre ville de départ, d'arrivée et la date." },
  { icon: "💺", title: "Choisissez votre place", text: "Sélectionnez votre siège sur le plan du bus." },
  { icon: "📲", title: "Payez par Mobile Money", text: "Envoyez le montant au numéro MTN et saisissez le code reçu." },
  { icon: "🎫", title: "Voyagez", text: "Votre billet est confirmé par notre agent. Bon voyage !" },
];

export function Home() {
  return html`
    <section class="hero">
      <div class="container hero-inner">
        <div class="hero-text">
          <h1>Tout le Congo,<br /><span class="hl">une seule route.</span></h1>
          <p class="hero-sub">
            Réservez votre billet de bus en quelques clics. Brazzaville, Pointe-Noire,
            Dolisie, Oyo, Ouesso… Paiement simple par Mobile Money.
          </p>
        </div>
        <div class="hero-search">
          <${SearchForm} />
        </div>
      </div>
    </section>

    <section class="container section">
      <h2 class="section-title">Destinations populaires</h2>
      <div class="route-grid">
        ${POPULAR.map(
          (r) => html`
            <button
              key=${r.from + r.to}
              class="route-card"
              onClick=${() => navigate("/resultats", { from: r.from, to: r.to, date: "", pax: "1" })}
            >
              <div class="route-card-top">
                <span class="route-card-label">${r.label}</span>
                <span class="route-card-arrow">→</span>
              </div>
              <div class="route-card-meta">
                <span>dès ${formatXAF(r.price)}</span>
                <span class="dot">•</span>
                <span>${r.duration}</span>
              </div>
            </button>
          `
        )}
      </div>
    </section>

    <section class="section section-alt">
      <div class="container">
        <h2 class="section-title">Comment ça marche ?</h2>
        <div class="steps-grid">
          ${STEPS.map(
            (s, i) => html`
              <div class="step-card" key=${i}>
                <div class="step-icon">${s.icon}</div>
                <h3>${i + 1}. ${s.title}</h3>
                <p>${s.text}</p>
              </div>
            `
          )}
        </div>
      </div>
    </section>

    <section class="container section features">
      <div class="feature"><span>✅</span><div><strong>Paiement Mobile Money</strong><p>MTN & Airtel Money — pas besoin de carte bancaire.</p></div></div>
      <div class="feature"><span>🪑</span><div><strong>Place garantie</strong><p>Vous choisissez votre siège à l'avance.</p></div></div>
      <div class="feature"><span>❄️</span><div><strong>Bus climatisés</strong><p>Confort, Wi-Fi et prises USB sur les grandes lignes.</p></div></div>
      <div class="feature"><span>📞</span><div><strong>Support local</strong><p>Une équipe joignable pour confirmer votre billet.</p></div></div>
    </section>
  `;
}
