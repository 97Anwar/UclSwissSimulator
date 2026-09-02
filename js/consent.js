// Cookie-consent banner wired to Google Consent Mode v2. The visitor's choice
// is remembered in localStorage; until they choose, analytics/ads storage stay
// denied (the defaults are set in each page's <head> before gtag loads).
(function () {
  const KEY = 'ucl_consent_v1';
  const gtag = window.gtag || function () { (window.dataLayer = window.dataLayer || []).push(arguments); };

  function apply(granted) {
    const v = granted ? 'granted' : 'denied';
    gtag('consent', 'update', {
      ad_storage: v,
      ad_user_data: v,
      ad_personalization: v,
      analytics_storage: v,
    });
  }

  function persist(v) { try { localStorage.setItem(KEY, v); } catch (e) { /* private mode */ } }

  let stored = null;
  try { stored = localStorage.getItem(KEY); } catch (e) { /* private mode */ }
  if (stored === 'granted') { apply(true); return; }
  if (stored === 'denied') { apply(false); return; }

  const show = () => {
    if (document.getElementById('consent-banner')) return;
    const bar = document.createElement('div');
    bar.id = 'consent-banner';
    bar.className = 'fixed inset-x-0 bottom-0 z-[9999] bg-ink-900 text-ink-50 dark:bg-ink-950 border-t border-pitch-500/40 px-4 py-3 shadow-lg';
    bar.innerHTML = `
      <div class="max-w-4xl mx-auto flex flex-col sm:flex-row items-start sm:items-center gap-3 text-xs sm:text-sm">
        <p class="flex-1 leading-relaxed">We use cookies for analytics and to show ads that keep this tool free. See our <a href="/privacy.html" class="underline font-semibold">Privacy Policy</a>.</p>
        <div class="flex items-center gap-2 shrink-0">
          <button id="consent-reject" class="px-3 py-1.5 rounded-full border border-ink-50/25 hover:bg-ink-50/10 font-semibold transition">Reject</button>
          <button id="consent-accept" class="px-4 py-1.5 rounded-full bg-pitch-500 hover:bg-pitch-600 text-white font-bold transition">Accept</button>
        </div>
      </div>`;
    document.body.appendChild(bar);
    bar.querySelector('#consent-accept').addEventListener('click', () => { apply(true); persist('granted'); bar.remove(); });
    bar.querySelector('#consent-reject').addEventListener('click', () => { apply(false); persist('denied'); bar.remove(); });
  };

  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', show);
  else show();
})();
