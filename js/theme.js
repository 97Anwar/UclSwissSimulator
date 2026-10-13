// ---------------------------------------------------------------------------
// js/theme.js
//
// Shared by every page. The simulator's app.js only loads on the homepage, so
// keeping the theme here is what lets a choice made on one page survive
// navigation to a team, matchday or guide page.
//
// Classic script (no module/defer) on purpose: it must run before the body
// paints, otherwise a dark-mode visitor gets a white flash on every page load.
// ---------------------------------------------------------------------------
(function () {
  var THEME_KEY = 'ucl_sim_theme';

  function isDark() {
    try {
      // Anything other than an explicit "dark" means light, including unset.
      return localStorage.getItem(THEME_KEY) === 'dark';
    } catch (e) {
      return false; // private mode / storage blocked
    }
  }

  function paint(dark) {
    document.documentElement.classList.toggle('dark', dark);
    var icon = document.getElementById('theme-icon');
    if (icon) icon.textContent = dark ? '☀️' : '🌙';
  }

  paint(isDark());

  function wire() {
    var btn = document.getElementById('btn-theme-toggle');
    paint(isDark()); // the icon lives in the body, which may not have existed above
    if (!btn) return;
    btn.addEventListener('click', function () {
      var next = !isDark();
      try { localStorage.setItem(THEME_KEY, next ? 'dark' : 'light'); } catch (e) { /* non-fatal */ }
      paint(next);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire);
  } else {
    wire();
  }
})();
