// ---------------------------------------------------------------------------
// js/nav.js
//
// Header navigation: the Guides dropdown and the mobile menu.
//
// Links live in the HTML rather than being built here, so crawlers and
// no-JS visitors still see them. This file only handles open/close state.
// Desktop hover is pure CSS (group-hover); the click handling below is what
// makes the dropdown usable on touch devices, where hover does not exist.
// ---------------------------------------------------------------------------
(function () {
  function closeEl(el, btn) {
    if (el) el.classList.add('hidden');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }

  function init() {
    var guidesBtn = document.querySelector('[data-guides-toggle]');
    var guidesMenu = document.querySelector('[data-guides-menu]');
    var mobileBtn = document.querySelector('[data-mobile-toggle]');
    var mobileMenu = document.querySelector('[data-mobile-menu]');

    if (guidesBtn && guidesMenu) {
      guidesBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var open = !guidesMenu.classList.contains('hidden');
        closeEl(mobileMenu, mobileBtn);
        if (open) {
          closeEl(guidesMenu, guidesBtn);
        } else {
          guidesMenu.classList.remove('hidden');
          guidesBtn.setAttribute('aria-expanded', 'true');
        }
      });
    }

    if (mobileBtn && mobileMenu) {
      mobileBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var open = !mobileMenu.classList.contains('hidden');
        closeEl(guidesMenu, guidesBtn);
        if (open) {
          closeEl(mobileMenu, mobileBtn);
        } else {
          mobileMenu.classList.remove('hidden');
          mobileBtn.setAttribute('aria-expanded', 'true');
        }
      });
    }

    document.addEventListener('click', function (e) {
      if (guidesMenu && !guidesMenu.contains(e.target) && e.target !== guidesBtn) closeEl(guidesMenu, guidesBtn);
      if (mobileMenu && !mobileMenu.contains(e.target) && e.target !== mobileBtn) closeEl(mobileMenu, mobileBtn);
    });

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      closeEl(guidesMenu, guidesBtn);
      closeEl(mobileMenu, mobileBtn);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
