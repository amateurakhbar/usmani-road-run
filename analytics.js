/* ============================================================
   USMANI ROAD RUN: lightweight analytics (Google Analytics 4)
   ------------------------------------------------------------
   TO TURN IT ON: paste your GA4 Measurement ID below. It looks
   like  G-XXXXXXXXXX  and is free:
     1. analytics.google.com  →  Admin (gear, bottom-left)
     2. Create a Property (or pick one)  →  Data Streams  →  Web
     3. Add your site URL  →  copy the "Measurement ID"
     4. paste it over the placeholder on the next line.
   Until a real ID is set, tracking is a silent no-op (the game
   runs exactly the same), so it is safe to ship as-is.

   What gets captured:
     • how many users      → GA "Users" / "Active users" + first-party visitor_id
     • from which devices  → device_type (mobile/tablet/desktop), os, screen, lang
     • for how long        → GA engagement time, plus our own game_end
                              "duration_sec" per play (completed/died/abandoned)
   ============================================================ */
'use strict';
const GA_MEASUREMENT_ID = 'G-XXXXXXXXXX';   // <-- replace with your GA4 ID to enable

(function () {
  const enabled = /^G-[A-Z0-9]{6,}$/.test(GA_MEASUREMENT_ID) && GA_MEASUREMENT_ID !== 'G-XXXXXXXXXX';

  // --- device / platform classification (reported as params; GA also derives its own) ---
  function deviceInfo() {
    const ua = navigator.userAgent || '';
    const touch = navigator.maxTouchPoints || 0;
    let type = 'desktop';
    if (/iPad/i.test(ua) || (/Macintosh/.test(ua) && touch > 1)) type = 'tablet';
    else if (/Tablet|Android(?!.*Mobile)/i.test(ua)) type = 'tablet';
    else if (/Mobi|Android|iPhone|iPod/i.test(ua)) type = 'mobile';
    let os = 'other';
    if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && touch > 1)) os = 'iOS';
    else if (/Android/i.test(ua)) os = 'Android';
    else if (/Windows/i.test(ua)) os = 'Windows';
    else if (/Mac OS X|Macintosh/i.test(ua)) os = 'macOS';
    else if (/Linux|X11/i.test(ua)) os = 'Linux';
    return {
      device_type: type,
      os: os,
      screen: (screen.width || 0) + 'x' + (screen.height || 0),
      lang: navigator.language || ''
    };
  }
  const DEV = deviceInfo();

  // --- persistent anonymous visitor id (first-party "unique users" sense) ---
  let vid = '';
  try {
    vid = localStorage.getItem('urr_vid') || '';
    if (!vid) {
      vid = 'v' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      localStorage.setItem('urr_vid', vid);
    }
  } catch (e) {}

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };

  if (enabled) {
    const s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_MEASUREMENT_ID;
    document.head.appendChild(s);
    gtag('js', new Date());
    gtag('config', GA_MEASUREMENT_ID, { send_page_view: true });
    // make device + visitor available on every event
    gtag('set', 'user_properties', { device_type: DEV.device_type, os: DEV.os });
  }

  // --- global tracker used by the game ---
  window.track = function (name, params) {
    const p = Object.assign({ visitor_id: vid }, DEV, params || {});
    if (enabled) gtag('event', name, p);
    else if (window.__ANALYTICS_DEBUG) console.debug('[analytics]', name, p);   // window.__ANALYTICS_DEBUG=true to preview events
  };
  window.analyticsEnabled = enabled;
  window.analyticsDevice = DEV;
})();
