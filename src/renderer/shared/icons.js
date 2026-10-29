'use strict';

// Linien-Icons (24×24, currentColor) für Gerätetypen und Bedienelemente.
(function () {
  const svg = (body, extra = '') =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${body}</svg>`;

  const ICONS = {
    mouse: svg('<rect x="6" y="3" width="12" height="18" rx="6"/><path d="M12 7v4"/>'),
    keyboard: svg('<rect x="2" y="6" width="20" height="12" rx="2.5"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7.5 14h9"/>'),
    headset: svg('<path d="M4 15v-3a8 8 0 0 1 16 0v3"/><path d="M4 14h3v6H6a2 2 0 0 1-2-2v-4zM20 14h-3v6h1a2 2 0 0 0 2-2v-4z"/>'),
    controller: svg('<path d="M7 7h10a4.5 4.5 0 0 1 4.4 5.3l-.6 3.4a2.8 2.8 0 0 1-5 1.2L14.5 15h-5l-1.3 1.9a2.8 2.8 0 0 1-5-1.2l-.6-3.4A4.5 4.5 0 0 1 7 7z"/><path d="M8 9.8v3M6.5 11.3h3M15.5 10.5h.01M17.5 12.3h.01"/>'),
    speaker: svg('<rect x="5" y="2.5" width="14" height="19" rx="3"/><circle cx="12" cy="14" r="3.6"/><path d="M12 7h.01"/>'),
    pen: svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
    phone: svg('<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M11 18h2"/>'),
    watch: svg('<circle cx="12" cy="12" r="6"/><path d="M9 6.6 9.6 2.5h4.8l.6 4.1M9 17.4l.6 4.1h4.8l.6-4.1M12 10v2l1.2 1.2"/>'),
    system: svg('<rect x="4" y="4.5" width="16" height="11" rx="1.5"/><path d="M2 19.5h20"/>'),
    other: svg('<path d="m7 7 10 10-5 5V2l5 5L7 17"/>'),
    bolt: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13.2 2 4.5 13.5h6.3L9.9 22l8.6-11.5h-6.3z"/></svg>',
    refresh: svg('<path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v6h-6"/>'),
    settings: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
    devices: svg('<rect x="2" y="5" width="13" height="10" rx="2"/><rect x="16" y="8" width="6" height="11" rx="3"/><path d="M6 19h5M8.5 15v4"/>'),
    palette: svg('<path d="M12 21a9 9 0 1 1 9-9c0 2.5-2 3.5-3.5 3.5H15a2 2 0 0 0-1.5 3.3c.4.5.5.9.5 1.2 0 .6-.8 1-2 1z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10.5" cy="7" r="1"/><circle cx="15.5" cy="7.5" r="1"/>'),
    sliders: svg('<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>'),
    bell: svg('<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>'),
    info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 16v-4.5M12 8h.01"/>'),
    close: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
    minimize: svg('<path d="M5 12h14"/>'),
    maximize: svg('<rect x="5" y="5" width="14" height="14" rx="2"/>'),
    eye: svg('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
    eyeOff: svg('<path d="M3 3l18 18M10.6 5.1A10.5 10.5 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2"/>'),
    edit: svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
    sparkles: svg('<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>'),
    check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
    alert: svg('<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/>'),
    power: svg('<path d="M12 3v9"/><path d="M6.4 6.4a8 8 0 1 0 11.2 0"/>'),
    battery: svg('<rect x="2.5" y="7" width="17" height="10" rx="2.5"/><path d="M22 10.5v3"/><path d="M6 10.5v3M9.5 10.5v3" stroke-width="2.4"/>'),
  };

  window.AkkuIcons = ICONS;
})();
