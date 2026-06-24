import { html } from "../html.js";
import { Logo } from "./Header.js";
import { getConfig } from "../store.js";

export function Footer() {
  const cfg = getConfig();
  return html`
    <footer class="site-footer">
      <div class="container footer-grid">
        <div>
          <${Logo} size=${30} />
          <p class="footer-tag">Voyagez partout au Congo, en toute sérénité.</p>
        </div>
        <div>
          <h4>Destinations</h4>
          <ul>
            <li>Brazzaville → Pointe-Noire</li>
            <li>Brazzaville → Dolisie</li>
            <li>Brazzaville → Oyo / Owando</li>
            <li>Brazzaville → Ouesso</li>
          </ul>
        </div>
        <div>
          <h4>Aide</h4>
          <ul>
            <li>Paiement Mobile Money (MTN / Airtel)</li>
            <li>Support : ${cfg.supportPhone}</li>
            <li><a href="#/mes-billets">Retrouver mon billet</a></li>
          </ul>
        </div>
      </div>
      <div class="container footer-bottom">
        <span>© ${new Date().getFullYear()} NzelaBus — Démonstration</span>
      </div>
    </footer>
  `;
}
