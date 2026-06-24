import { html } from "../html.js";

export function Logo({ size = 34 }) {
  return html`
    <span class="logo" aria-label="NzelaBus">
      <svg width=${size} height=${size} viewBox="0 0 100 100" aria-hidden="true">
        <rect width="100" height="100" rx="22" fill="#0a7d3b" />
        <rect x="22" y="30" width="56" height="34" rx="6" fill="#fff" />
        <rect x="28" y="36" width="16" height="12" rx="2" fill="#0a7d3b" />
        <rect x="56" y="36" width="16" height="12" rx="2" fill="#0a7d3b" />
        <circle cx="36" cy="68" r="7" fill="#1a1a1a" />
        <circle cx="64" cy="68" r="7" fill="#1a1a1a" />
        <rect x="20" y="22" width="60" height="6" rx="3" fill="#f7d117" />
      </svg>
      <span class="logo-text">Nzela<span class="logo-accent">Bus</span></span>
    </span>
  `;
}

export function Header({ active }) {
  const link = (path, label) =>
    html`<a class=${"nav-link" + (active === path ? " active" : "")} href=${"#" + path}>${label}</a>`;

  return html`
    <header class="site-header">
      <div class="container header-inner">
        <a class="brand" href="#/">
          <${Logo} />
        </a>
        <nav class="nav">
          ${link("/", "Accueil")}
          ${link("/mes-billets", "Mes billets")}
          <a class="nav-link nav-admin" href="#/admin">Espace agent</a>
        </nav>
      </div>
    </header>
  `;
}
