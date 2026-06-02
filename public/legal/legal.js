/* English Metro. — legal pages: language toggle + TOC scroll-spy.
   Shares the SPA's em.lang / em.lang.userExplicit localStorage keys. 2026-06-02 */
(function () {
  'use strict';

  // ── Language ──────────────────────────────────────────────────
  function storedLang() {
    try {
      var v = window.localStorage.getItem('em.lang');
      if (v === 'pl' || v === 'en') return v;
    } catch (e) {}
    return null;
  }

  function browserLang() {
    var langs = navigator.languages || [navigator.language || 'en'];
    for (var i = 0; i < langs.length; i++) {
      if (/^pl/i.test(langs[i])) return 'pl';
    }
    return 'en';
  }

  function setLang(lang, explicit) {
    document.documentElement.setAttribute('data-lang', lang);
    document.documentElement.setAttribute('lang', lang);
    try {
      window.localStorage.setItem('em.lang', lang);
      if (explicit) window.localStorage.setItem('em.lang.userExplicit', 'true');
    } catch (e) {}
    var btns = document.querySelectorAll('.lang-toggle button');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('active', btns[i].getAttribute('data-lang') === lang);
    }
  }

  // initial: stored preference > browser language
  setLang(storedLang() || browserLang(), false);

  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('.lang-toggle button');
    if (!btn) return;
    setLang(btn.getAttribute('data-lang'), true);
  });

  // ── TOC scroll-spy ─────────────────────────────────────────────
  function initTocSpy() {
    var links = Array.prototype.slice.call(document.querySelectorAll('.legal-toc a[href^="#"]'));
    if (!links.length || !('IntersectionObserver' in window)) return;
    var map = {};
    links.forEach(function (a) { map[a.getAttribute('href').slice(1)] = a; });

    var current = null;
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          if (current) current.classList.remove('active');
          current = map[entry.target.id];
          if (current) current.classList.add('active');
        }
      });
    }, { rootMargin: '-15% 0px -70% 0px' });

    Object.keys(map).forEach(function (id) {
      var el = document.getElementById(id);
      if (el) observer.observe(el);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTocSpy);
  } else {
    initTocSpy();
  }
})();
