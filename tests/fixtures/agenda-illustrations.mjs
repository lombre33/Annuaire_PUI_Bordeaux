// Les trois illustrations de la fenêtre de connexion du widget « agenda partagé » que l'annuaire reprend (widget.js de ce dépôt, `ILLUSTRATIONS` :
// `bouton`, `boutonIci` et `service`), copiées telles quelles : la référence que tests/login-window.test.mjs compare à login-art.js.
// `__SERVICE__` et `__REFERENCE__` y tiennent la place du service de connexion et du service que les gens connaissent déjà. Pour les mettre à jour,
// recopier ces chaînes depuis le dépôt de l'agenda.

export const AGENDA_BUTTON = `<svg viewBox="0 0 320 120" role="img" aria-label="Page Grist : le bouton « Se connecter » est en haut à droite">
    <rect x="1" y="1" width="318" height="118" rx="10" fill="#fff" stroke="#e5dce3" stroke-width="2"/>
    <path d="M1 11a10 10 0 0 1 10-10h298a10 10 0 0 1 10 10v24H1z" fill="#f4f0f3"/>
    <rect x="14" y="13" width="60" height="9" rx="4.5" fill="#d9cfd7"/><rect x="82" y="13" width="40" height="9" rx="4.5" fill="#e8e0e6"/>
    <rect x="218" y="8" width="90" height="22" rx="11" fill="#b9348b"/>
    <text x="263" y="23" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" font-weight="700" fill="#fff">Se connecter</text>
    <rect x="213" y="3" width="100" height="32" rx="16" fill="none" stroke="#ffcc00" stroke-width="3.5"/>
    <path d="M150 78C190 78 232 66 256 44" fill="none" stroke="#3b1c13" stroke-width="3" stroke-linecap="round"/>
    <path d="M247 43l10-1-3 10" fill="none" stroke="#3b1c13" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    <text x="22" y="84" font-family="Georgia, serif" font-size="13" fill="#3b1c13">En haut à droite</text>
    <rect x="22" y="96" width="190" height="8" rx="4" fill="#efe9ee"/>
  </svg>`;

export const AGENDA_HEREBUTTON = `<svg viewBox="0 0 320 120" role="img" aria-label="Cette fenêtre : le bouton « Se connecter » est en bas à droite">
    <rect x="1" y="1" width="318" height="118" rx="10" fill="#fff" stroke="#e5dce3" stroke-width="2"/>
    <rect x="1" y="1" width="318" height="8" rx="4" fill="#b9348b"/>
    <rect x="18" y="22" width="150" height="10" rx="5" fill="#3b1c13"/>
    <rect x="18" y="42" width="240" height="7" rx="3.5" fill="#d9cfd7"/>
    <rect x="18" y="56" width="200" height="7" rx="3.5" fill="#efe9ee"/>
    <rect x="198" y="80" width="106" height="28" rx="14" fill="#b9348b"/>
    <text x="251" y="98" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" font-weight="700" fill="#fff">Se connecter</text>
    <rect x="193" y="75" width="116" height="38" rx="19" fill="none" stroke="#ffcc00" stroke-width="3.5"/>
    <text x="22" y="98" font-family="Georgia, serif" font-size="13" fill="#3b1c13">Juste ici</text>
    <path d="M78 94C108 94 150 94 184 94" fill="none" stroke="#3b1c13" stroke-width="3" stroke-linecap="round"/>
    <path d="M175 87l10 7-10 7" fill="none" stroke="#3b1c13" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;

export const AGENDA_SERVICE = `<svg viewBox="0 0 320 120" role="img" aria-label="Page de connexion : le bouton « S’identifier avec ProConnect »">
    <rect x="1" y="1" width="318" height="118" rx="10" fill="#fff" stroke="#e5dce3" stroke-width="2"/>
    <text x="160" y="30" text-anchor="middle" font-family="Georgia, serif" font-size="14" font-weight="700" fill="#3b1c13">Connexion</text>
    <rect x="42" y="44" width="236" height="38" rx="6" fill="#000091"/>
    <text x="160" y="68" text-anchor="middle" font-family="Arial, sans-serif" font-size="13" font-weight="700" fill="#fff">S’identifier avec __SERVICE__</text>
    <rect x="37" y="39" width="246" height="48" rx="10" fill="none" stroke="#ffcc00" stroke-width="3.5"/>
    <text x="160" y="106" text-anchor="middle" font-family="Georgia, serif" font-size="11" fill="#615961">Comme pour __REFERENCE__</text>
  </svg>`;
