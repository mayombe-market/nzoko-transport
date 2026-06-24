import { html, useState } from "../html.js";
import { cityOptions } from "../data.js";
import { todayISO } from "../format.js";
import { navigate } from "../router.js";

export function SearchForm({ initial = {}, compact = false }) {
  const options = cityOptions();
  const [from, setFrom] = useState(initial.from || "brazzaville");
  const [to, setTo] = useState(initial.to || "pointenoire");
  const [date, setDate] = useState(initial.date || todayISO());
  const [pax, setPax] = useState(Number(initial.pax) || 1);
  const [error, setError] = useState("");

  function swap() {
    setFrom(to);
    setTo(from);
  }

  function submit(e) {
    e.preventDefault();
    if (from === to) {
      setError("Le départ et l'arrivée doivent être différents.");
      return;
    }
    setError("");
    navigate("/resultats", { from, to, date, pax: String(pax) });
  }

  const cityField = (value, setValue, label, id) => html`
    <div class="field">
      <label for=${id}>${label}</label>
      <select id=${id} value=${value} onChange=${(e) => setValue(e.target.value)}>
        ${options.map((o) => html`<option key=${o.id} value=${o.id}>${o.name} · ${o.region}</option>`)}
      </select>
    </div>
  `;

  return html`
    <form class=${"search-form" + (compact ? " compact" : "")} onSubmit=${submit}>
      <div class="search-row">
        ${cityField(from, setFrom, "Départ", "f-from")}
        <button type="button" class="swap-btn" onClick=${swap} title="Inverser" aria-label="Inverser départ et arrivée">⇄</button>
        ${cityField(to, setTo, "Arrivée", "f-to")}
        <div class="field">
          <label for="f-date">Date</label>
          <input id="f-date" type="date" value=${date} min=${todayISO()} onChange=${(e) => setDate(e.target.value)} />
        </div>
        <div class="field field-pax">
          <label for="f-pax">Passagers</label>
          <select id="f-pax" value=${String(pax)} onChange=${(e) => setPax(Number(e.target.value))}>
            ${[1, 2, 3, 4, 5].map((n) => html`<option key=${n} value=${String(n)}>${n}</option>`)}
          </select>
        </div>
        <button type="submit" class="btn btn-primary search-submit">Rechercher</button>
      </div>
      ${error && html`<p class="form-error">${error}</p>`}
    </form>
  `;
}
