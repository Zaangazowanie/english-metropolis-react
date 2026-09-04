/* English Metro. — cold pages: language toggle, mobile menu, TOC scroll-spy,
   scroll reveal. Shares the em.legal.lang localStorage key with the SPA's
   FoundationLegalPage. 2026-06-02, reworked 2026-09-03 */
(function () {
  'use strict';

  var html = document.documentElement;
  // Flag JS availability before first paint so CSS may hide .reveal blocks
  // until they enter the viewport. Without JS nothing is ever hidden.
  html.setAttribute('data-reveal', '');

  // ── Language ──────────────────────────────────────────────────
  // Land on Polish (the binding version) unless the visitor explicitly chose
  // EN on a legal page. The app-wide em.lang key is deliberately not touched.
  function storedLang() {
    try {
      var v = window.localStorage.getItem('em.legal.lang');
      if (v === 'pl' || v === 'en') return v;
    } catch (e) {}
    return null;
  }

  function setLang(lang, explicit) {
    html.setAttribute('data-lang', lang);
    html.setAttribute('lang', lang);
    try {
      if (explicit) window.localStorage.setItem('em.legal.lang', lang);
    } catch (e) {}
    var btns = document.querySelectorAll('.lang-toggle button');
    for (var i = 0; i < btns.length; i++) {
      var on = btns[i].getAttribute('data-lang') === lang;
      btns[i].classList.toggle('active', on);
      btns[i].setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    // Blocks revealed while hidden (display:none) never intersected; show them.
    if (explicit) revealVisible();
  }

  setLang(storedLang() || 'pl', false);

  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('.lang-toggle button');
    if (btn) { setLang(btn.getAttribute('data-lang'), true); return; }
    var menu = e.target.closest && e.target.closest('.legal-menu-btn');
    if (menu) {
      var bar = menu.closest('.legal-topbar');
      var open = bar.classList.toggle('is-open');
      menu.setAttribute('aria-expanded', open ? 'true' : 'false');
      return;
    }
    // Close the mobile menu after choosing a link.
    var link = e.target.closest && e.target.closest('.legal-topnav a');
    if (link) {
      var openBar = link.closest('.legal-topbar.is-open');
      if (openBar) {
        openBar.classList.remove('is-open');
        var b = openBar.querySelector('.legal-menu-btn');
        if (b) b.setAttribute('aria-expanded', 'false');
      }
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    var openBar = document.querySelector('.legal-topbar.is-open');
    if (!openBar) return;
    openBar.classList.remove('is-open');
    var b = openBar.querySelector('.legal-menu-btn');
    if (b) { b.setAttribute('aria-expanded', 'false'); b.focus(); }
  });

  // ── Scroll reveal ─────────────────────────────────────────────
  var REVEAL = '.legal-content .reveal, .fl-doc .fl-sec, .fl-doc > section, .fl-en-notice';
  var revealObserver = null;

  function revealVisible() {
    // Anything already inside the viewport (or above it) shows immediately.
    var els = document.querySelectorAll(REVEAL);
    var vh = window.innerHeight || 800;
    for (var i = 0; i < els.length; i++) {
      var r = els[i].getBoundingClientRect();
      if (r.top < vh * 0.92) els[i].classList.add('is-in');
    }
  }

  function initReveal() {
    var els = document.querySelectorAll(REVEAL);
    if (!els.length) return;
    if (!('IntersectionObserver' in window)) {
      for (var i = 0; i < els.length; i++) els[i].classList.add('is-in');
      return;
    }
    revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
    for (var j = 0; j < els.length; j++) revealObserver.observe(els[j]);
    revealVisible();
  }

  // ── TOC scroll-spy ─────────────────────────────────────────────
  function initTocSpy() {
    var links = Array.prototype.slice.call(document.querySelectorAll('.legal-toc a[href^="#"]'));
    if (!links.length || !('IntersectionObserver' in window)) return;
    var map = {};
    links.forEach(function (a) { map[a.getAttribute('href').slice(1)] = a; });

    var current = null;
    function activate(id) {
      var next = map[id];
      if (!next || next === current) return;
      if (current) current.classList.remove('active');
      current = next;
      current.classList.add('active');
      // Keep the active entry in view inside a scrolling TOC.
      if (current.scrollIntoView && current.closest('.legal-toc').scrollHeight > current.closest('.legal-toc').clientHeight) {
        current.scrollIntoView({ block: 'nearest' });
      }
    }
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) activate(entry.target.id);
      });
    }, { rootMargin: '-15% 0px -70% 0px' });

    Object.keys(map).forEach(function (id) {
      var el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    // Highlight the first entry until the reader scrolls.
    var first = links[0];
    if (first) activate(first.getAttribute('href').slice(1));
  }

  function init() { initTocSpy(); initReveal(); }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
