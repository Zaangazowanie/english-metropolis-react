/**
 * Bajla — English Metropolis in-app tutor (v5)
 * ---------------------------------------------------------------------------
 * Replaces the missing /students/conversa-widget-v5.js that index.html has been
 * requesting (and 404-ing on) since the React ChatWidget was commented out.
 *
 * The idea: Bajla already knows an enormous amount about each student — every
 * lesson, every fossilised Polish-L1 habit, every weak word, every pronunciation
 * score. v4 hid all of it behind a blank text box. v5 puts it on the surface:
 *
 *   • Fossil strip  — the student's recurring errors drawn across the real
 *                     calendar span they've been happening over. Tap to drill.
 *   • Say-it card   — hold to speak, MEASURED score (server-side, deterministic)
 *                     with per-word colouring and the Polish-L1 slip named.
 *   • Opening moves — prompts generated from that student's own live profile,
 *                     so the first screen is never "Ask me anything".
 *
 * Backend: /api/conversa -> :8800  (GET /suggestions/:slug, POST /chat, /voice)
 * Identity: never defaults to another student. No slug -> widget stays hidden.
 * Self-contained: no deps, no build step. Honours prefers-reduced-motion.
 */
(function () {
  'use strict';

  if (window.__BAJLA_V5) return;
  window.__BAJLA_V5 = true;

  var API = '/api/conversa';
  var MAX_HISTORY = 10;
  var CHAT_TIMEOUT_MS = 30000;   // a hung /chat must become a message, not a spinner
  var REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var HOVER_OK = window.matchMedia && window.matchMedia('(hover:hover) and (pointer:fine)').matches;
  // Bumped together with the ?v= on the widget tag in index.html so a new orb
  // never pairs with a Cloudflare-cached old widget.
  var ORB_URL = '/students/bajla-orb.js?v=motion-20260903';

  // ── Language ─────────────────────────────────────────────────────────────
  // The SPA persists the choice as em.lang.v2 and mirrors it onto <html lang>
  // on every change; Polish is the site default. A MutationObserver on <html>
  // (see boot) re-paints the static strings when the toggle is used.
  function currentLang() {
    var v = null;
    try { v = localStorage.getItem('em.lang.v2'); } catch (e) { /* private mode */ }
    if (v !== 'en' && v !== 'pl') v = (document.documentElement.lang || '').slice(0, 2);
    return v === 'en' ? 'en' : 'pl';
  }
  var STR = {
    pl: {
      name: 'Bajla', sub: 'Twoja nauczycielka angielskiego',
      knows: function (n, c) { return 'zna Twoje lekcje: ' + n + (c ? ' · ' + c : ''); },
      openFab: 'Otwórz Bajlę, Twoją nauczycielkę angielskiego', closeFab: 'Zamknij Bajlę',
      dialog: 'Bajla, Twoja nauczycielka angielskiego', close: 'Zamknij', home: 'Wróć do początku', chat: 'Wróć do rozmowy',
      loading: 'Wczytuję Twoje lekcje…',
      hi: 'Cześć', lede: function (n) { return 'Pamiętam wszystkie Twoje lekcje (' + n + '). Oto, co wciąż wraca.'; },
      habits: 'Twoje nawyki', fossilised: function (n) { return n + ' utrwalone'; },
      times: function (n, l) { return n + '× · ' + l + ' ' + plural(l, 'lekcja', 'lekcje', 'lekcji'); },
      whyPrompt: function (t) { return 'Dlaczego wciąż mylę: ' + t + '? Pokaż mi dokładnie kiedy to robię i jak przestać.'; },
      sayIt: 'Powiedz to', holdMic: 'przytrzymaj mikrofon', holdSay: function (w) { return 'Przytrzymaj, żeby powiedzieć: ' + w; },
      hear: function (w) { return 'Posłuchaj, jak native speaker mówi „' + w + '”'; },
      loadingClips: 'Wczytuję nagrania…', noClips: 'Nie mam jeszcze nagrań dla tego słowa',
      hint: 'Przytrzymaj i mów, albo stuknij raz, by zacząć, i drugi raz, by skończyć',
      heard: 'usłyszałam: ', playClip: function (w) { return 'Odtwórz nagranie ze słowem „' + w + '”'; },
      prev: 'Poprzednie', next: 'Następne', hearIt: 'Posłuchaj', pause: 'Pauza',
      placeholder: 'Zapytaj Bajlę o cokolwiek…', send: 'Wyślij', mic: 'Przytrzymaj, żeby mówić, albo stuknij, by zacząć i skończyć',
      listening: 'Słucham…', releaseSend: 'Puść, żeby wysłać · przesuń palec poza przycisk, żeby anulować',
      tapStop: 'Stuknij jeszcze raz, żeby wysłać', releaseCancel: 'Puść, żeby anulować', cancelled: 'Anulowano. Nic nie wysłałam.',
      listeningBack: 'Odsłuchuję…', thinking: 'Bajla pisze…',
      noReply: 'Nie dostałam odpowiedzi. Spróbuj jeszcze raz za chwilę.',
      offline: 'Bajla jest offline. Spróbuj ponownie za minutę.', timeout: 'To trwa za długo. Spróbuj ponownie za chwilę.',
      noProfile: 'Nie mogę teraz wczytać Twoich lekcji.', retry: 'Spróbuj ponownie',
      noMic: 'Ta przeglądarka nie pozwala mi tu użyć mikrofonu.', micPerm: 'Potrzebuję dostępu do mikrofonu, żeby Cię usłyszeć.',
      tooShort: 'To było za krótkie. Przytrzymaj mikrofon, kiedy mówisz, albo stuknij raz, by zacząć, i drugi raz, by skończyć.',
      notHeard: 'Nie usłyszałam tego. Spróbujesz jeszcze raz?', noSlug: 'Nie wiem, z kim rozmawiam. Zaloguj się ponownie.',
      unread: 'Nowa odpowiedź od Bajli', month: 'pl-PL'
    },
    en: {
      name: 'Bajla', sub: 'your English tutor',
      knows: function (n, c) { return 'knows your ' + n + ' lessons' + (c ? ' · ' + c : ''); },
      openFab: 'Open Bajla, your English tutor', closeFab: 'Close Bajla',
      dialog: 'Bajla, your English tutor', close: 'Close', home: 'Back to the start', chat: 'Back to the conversation',
      loading: 'Loading your lessons…',
      hi: 'Hi', lede: function (n) { return 'I remember all ' + n + ' of your lessons. Here is what keeps coming back.'; },
      habits: 'Your recurring habits', fossilised: function (n) { return n + ' fossilised'; },
      times: function (n, l) { return n + '× · ' + l + (l === 1 ? ' lesson' : ' lessons'); },
      whyPrompt: function (t) { return 'Why do I keep getting ' + t + ' wrong? Show me exactly when I\'ve done it and how to stop.'; },
      sayIt: 'Say it', holdMic: 'hold the mic', holdSay: function (w) { return 'Hold to say ' + w; },
      hear: function (w) { return 'Hear a native speaker say “' + w + '”'; },
      loadingClips: 'Loading clips…', noClips: 'No clips for this one yet',
      hint: 'Hold to speak, or tap to start and tap again to stop',
      heard: 'heard: ', playClip: function (w) { return 'Play clip of “' + w + '”'; },
      prev: 'Prev', next: 'Next', hearIt: 'Hear it', pause: 'Pause',
      placeholder: 'Ask Bajla anything…', send: 'Send', mic: 'Hold to speak, or tap to start and stop',
      listening: 'Listening…', releaseSend: 'Release to send · slide off the button to cancel',
      tapStop: 'Tap again to send', releaseCancel: 'Release to cancel', cancelled: 'Cancelled. Nothing was sent.',
      listeningBack: 'Listening back…', thinking: 'Bajla is typing…',
      noReply: 'No reply came back. Try again in a moment.',
      offline: 'Bajla is offline. Try again in a minute.', timeout: 'That took too long. Try again in a moment.',
      noProfile: 'I could not load your lessons just now.', retry: 'Try again',
      noMic: 'Your browser will not let me use the microphone here.', micPerm: 'I need microphone permission to hear you.',
      tooShort: 'That was too short for me to hear. Hold the mic while you speak, or tap it once to start and again to stop.',
      notHeard: 'I could not hear that one. Try again?', noSlug: 'I do not know who I am talking to. Please sign in again.',
      unread: 'New reply from Bajla', month: 'en-GB'
    }
  };
  function plural(n, one, few, many) {
    if (n === 1) return one;
    var m10 = n % 10, m100 = n % 100;
    return (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) ? few : many;
  }
  var langActive = currentLang();
  var L = STR[langActive];
  function t(key) {
    var v = L[key];
    if (typeof v === 'function') return v.apply(null, Array.prototype.slice.call(arguments, 1));
    return v == null ? key : v;
  }

  // ── Identity ─────────────────────────────────────────────────────────────
  // Priority: admin override -> /app/<slug>/... URL -> legacy localStorage.
  // Returning null is a valid answer and means "render nothing" — guessing a
  // slug here would show one student another student's lessons.
  function currentSlug() {
    if (window.__STUDENT_SLUG) return String(window.__STUDENT_SLUG);
    var m = location.pathname.match(/\/app\/([^/]+)/) || location.pathname.match(/^\/([^/]+)\/(dashboard|vocabulary|lessons|practice|calendar|knowledge)/);
    if (m && m[1] && m[1] !== 'app') return m[1];
    try { return localStorage.getItem('studentSlug') || null; } catch (e) { return null; }
  }
  function isAdmin() { return !!window.__EM_ADMIN_MODE; }
  // Default must match the server's DEFAULT_VOICE (af_nova) or every prewarmed
  // answer misses the cache on voice and gets re-synthesised for nothing.
  function voiceId() {
    try { return localStorage.getItem('tts_voice') || 'af_nova'; } catch (e) { return 'af_nova'; }
  }

  // ── State ────────────────────────────────────────────────────────────────
  var open = false, busy = false, recording = false, unread = false;
  var history = [], profile = null, loadedFor = null, profileFailed = false;
  var mediaRecorder = null, chunks = [], currentAudio = null, drillMode = null;
  var wantRec = false, starting = false, stopTimer = null, cancelRec = false;
  var HOLD_MS = 350;        // shorter than this is a tap, not a hold
  var MAX_REC_MS = 20000;   // hard ceiling so the mic can never stay open
  var els = {};
  var view = 'home';        // 'home' (fossils, drill, chips) or 'chat'
  var lastFocus = null;     // element to hand focus back to on close
  var closeTimer = null, chatTimer = null, recTick = null;
  var meter = null;         // { ctx, analyser, data, stop } while recording
  var orb = null, orbHost = null, orbBtn = null, orbTimer = null;
  var orbModule = null, orbLoad = null, orbDisabled = false;

  // ── Styles ───────────────────────────────────────────────────────────────
  // One set of colour tokens on .bjl-root, redefined for day mode by mirroring
  // the data-v3-mode attribute the app stamps on <html>: the widget follows the
  // theme toggle with no JS listener and no colour is written twice.
  // Type floor: nothing visible renders under 13px.
  // Motion: transform/opacity only, transitions (interruptible) over keyframes
  // wherever a state can flip mid-flight; spring-ish curves from the v3 tokens.
  var CSS = [
    '.bjl-root{position:fixed;right:20px;bottom:calc(20px + env(safe-area-inset-bottom));z-index:2147483000;',
    'font-family:"Plus Jakarta Sans","Space Grotesk",Inter,system-ui,sans-serif;font-size:13px;',
    '--bjl-bg0:rgba(24,15,50,.985);--bjl-bg1:rgba(11,7,26,.985);--bjl-text:#F4F0FF;--bjl-soft:#CEC8E8;--bjl-dim:#8A83AE;',
    '--bjl-border:rgba(255,255,255,.10);--bjl-border-hi:rgba(255,255,255,.17);--bjl-surface:rgba(255,255,255,.055);',
    '--bjl-surface-hi:rgba(255,255,255,.09);--bjl-track:rgba(255,255,255,.09);--bjl-brand:#D946EF;--bjl-brand-ink:#F0ABFC;',
    '--bjl-brand-soft:rgba(217,70,239,.12);--bjl-brand-line:rgba(217,70,239,.5);',
    '--bjl-good:#34D399;--bjl-good-ink:#6EE7B7;--bjl-good-bg:rgba(52,211,153,.14);--bjl-good-line:rgba(52,211,153,.3);',
    '--bjl-warn:#FCD34D;--bjl-warn-ink:#FDE68A;--bjl-warn-bg:rgba(252,211,77,.14);--bjl-warn-line:rgba(252,211,77,.3);',
    '--bjl-bad:#FB7185;--bjl-bad-ink:#FDA4AF;--bjl-bad-bg:rgba(251,113,133,.12);--bjl-bad-line:rgba(251,113,133,.32);',
    '--bjl-code:#FCE7FF;--bjl-em:#CDBBFF;--bjl-link:#E879F9;--bjl-link-hi:#F5B4FF;--bjl-white:#fff;',
    '--bjl-grad:linear-gradient(135deg,#8B5CF6 0%,#D946EF 55%,#F472B6 100%);',
    // The student bubble is body text on colour, so it uses a deeper cut of the
    // brand gradient: white on #6D28D9/#A21CAF/#BE185D clears 5.5:1 everywhere,
    // where the bright button gradient only manages 2.4:1 at its pink end.
    '--bjl-me:linear-gradient(135deg,#6D28D9 0%,#A21CAF 55%,#BE185D 100%);',
    '--bjl-shadow:0 30px 90px -30px rgba(139,92,246,.5),0 8px 28px -12px rgba(0,0,0,.75);',
    '--bjl-hd-glow:radial-gradient(ellipse 70% 120% at 12% 0%,rgba(217,70,239,.20),transparent 70%);',
    '--bjl-ease:cubic-bezier(.16,1,.3,1);--bjl-spring:cubic-bezier(.34,1.56,.64,1);--bjl-drawer:cubic-bezier(.32,.72,0,1)}',
    'html[data-v3-mode="day"] .bjl-root{--bjl-bg0:#FFFFFF;--bjl-bg1:#FBFAFF;--bjl-text:#0E0A1B;--bjl-soft:#2B2542;--bjl-dim:#5F5780;',
    '--bjl-border:rgba(16,10,40,.10);--bjl-border-hi:rgba(16,10,40,.16);--bjl-surface:rgba(124,58,237,.055);--bjl-surface-hi:rgba(124,58,237,.10);',
    '--bjl-track:rgba(16,10,40,.08);--bjl-brand:#A21CAF;--bjl-brand-ink:#86198F;--bjl-brand-soft:rgba(162,28,175,.08);--bjl-brand-line:rgba(162,28,175,.45);',
    '--bjl-good:#059669;--bjl-good-ink:#047857;--bjl-good-bg:rgba(16,185,129,.13);--bjl-good-line:rgba(16,185,129,.3);',
    '--bjl-warn:#D97706;--bjl-warn-ink:#B45309;--bjl-warn-bg:rgba(245,158,11,.14);--bjl-warn-line:rgba(245,158,11,.32);',
    '--bjl-bad:#E11D48;--bjl-bad-ink:#BE123C;--bjl-bad-bg:rgba(225,29,72,.07);--bjl-bad-line:rgba(225,29,72,.24);',
    '--bjl-code:#86198F;--bjl-em:#6D28D9;--bjl-link:#A21CAF;--bjl-link-hi:#701A75;',
    '--bjl-shadow:0 30px 80px -24px rgba(124,58,237,.22),0 8px 22px -10px rgba(0,0,0,.12);',
    '--bjl-hd-glow:radial-gradient(ellipse 70% 120% at 12% 0%,rgba(217,70,239,.10),transparent 70%)}',
    '.bjl-root *{box-sizing:border-box}',
    '.bjl-root button{font-family:inherit;-webkit-tap-highlight-color:transparent}',
    '.bjl-root :focus-visible{outline:2px solid var(--bjl-brand);outline-offset:2px}',
    '.bjl-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;font-size:13px}',
    // ── Launcher. Idle = still. It pulses only when something is waiting for
    // the student (a reply that landed while the panel was closed), so the
    // motion carries information instead of nagging.
    '.bjl-fab{width:60px;height:60px;border-radius:50%;border:none;cursor:pointer;padding:0;position:relative;color:#fff;',
    'background:var(--bjl-grad);box-shadow:0 14px 40px -10px rgba(217,70,239,.55),0 6px 16px -6px rgba(0,0,0,.4);',
    'display:flex;align-items:center;justify-content:center;transform:translateZ(0);transition:transform .32s var(--bjl-spring),box-shadow .32s ease}',
    '@media (hover:hover) and (pointer:fine){.bjl-fab:hover{transform:translateY(-3px) scale(1.04);box-shadow:0 18px 44px -10px rgba(217,70,239,.65),0 8px 18px -6px rgba(0,0,0,.4)}}',
    '.bjl-fab:active{transform:scale(.94);transition-duration:.12s}',
    // The brand icon is a full-bleed plate, so it fills the button and the
    // circle does the cropping; a contained version would float inside a ring
    // and read as two competing marks.
    '.bjl-fab img{position:absolute;inset:0;width:100%;height:100%;border-radius:50%;object-fit:cover;display:block;',
    'transition:opacity .22s ease,transform .32s var(--bjl-spring),filter .22s ease}',
    '.bjl-fab-x{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;opacity:0;transform:scale(.6) rotate(-90deg);filter:blur(3px);',
    'transition:opacity .22s ease,transform .32s var(--bjl-spring),filter .22s ease}',
    '.bjl-open .bjl-fab img{opacity:0;transform:scale(.7) rotate(25deg);filter:blur(3px)}',
    '.bjl-open .bjl-fab-x{opacity:1;transform:none;filter:none}',
    '.bjl-halo{position:absolute;inset:-5px;border-radius:50%;border:2px solid rgba(217,70,239,.6);opacity:0;pointer-events:none}',
    '.bjl-unread .bjl-halo{animation:bjlHalo 2.4s ease-out infinite}',
    '@keyframes bjlHalo{0%{transform:scale(.92);opacity:.8}70%{transform:scale(1.3);opacity:0}100%{opacity:0}}',
    '.bjl-badge{position:absolute;top:-2px;right:-2px;width:16px;height:16px;border-radius:50%;background:var(--bjl-bad);border:2px solid var(--bjl-bg1);',
    'opacity:0;transform:scale(.4);transition:opacity .2s ease,transform .32s var(--bjl-spring)}',
    '.bjl-unread .bjl-badge{opacity:1;transform:none}',
    // ── Panel. Always in the DOM (visibility gates focus and readers); the
    // open state is a transition from the launcher's corner, so a close that
    // interrupts an open simply retargets from wherever it is.
    '.bjl-panel{position:absolute;right:0;bottom:76px;width:min(392px,calc(100vw - 28px));',
    'height:min(624px,calc(100vh - 150px));border-radius:22px;overflow:hidden;display:flex;flex-direction:column;',
    'background:linear-gradient(180deg,var(--bjl-bg0),var(--bjl-bg1));color:var(--bjl-text);',
    'border:1px solid var(--bjl-border-hi);box-shadow:var(--bjl-shadow);',
    'transform-origin:calc(100% - 30px) calc(100% + 16px);visibility:hidden;opacity:0;transform:translateY(14px) scale(.9);',
    'transition:transform .2s var(--bjl-drawer),opacity .16s ease-out,visibility 0s linear .2s}',
    '.bjl-open .bjl-panel{visibility:visible;opacity:1;transform:none;transition:transform .36s var(--bjl-drawer),opacity .2s ease-out,visibility 0s}',
    '.bjl-hd{display:flex;align-items:center;gap:11px;padding:14px 15px;border-bottom:1px solid var(--bjl-border);background:var(--bjl-hd-glow)}',
    '.bjl-av{width:38px;height:38px;border-radius:12px;flex:0 0 auto;display:flex;align-items:center;justify-content:center;',
    'background:var(--bjl-grad);box-shadow:0 0 0 1px rgba(217,70,239,.45),0 0 30px -6px rgba(217,70,239,.55)}',
    '.bjl-av img{width:100%;height:100%;border-radius:12px;object-fit:cover;display:block}',
    '.bjl-name{font-size:15px;font-weight:600;color:var(--bjl-text);letter-spacing:-.01em;line-height:1.2}',
    '.bjl-sub{font-size:13px;color:var(--bjl-dim);margin-top:2px;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.bjl-x{background:transparent;border:none;color:var(--bjl-dim);cursor:pointer;padding:6px;border-radius:9px;line-height:0;',
    'transition:color .18s,background .18s,transform .16s var(--bjl-ease)}',
    '.bjl-x:hover{color:var(--bjl-text);background:var(--bjl-surface-hi)}.bjl-x:active{transform:scale(.92)}',
    '.bjl-nav{display:none}.bjl-has-chat .bjl-nav{display:inline-flex}',
    '.bjl-body{flex:1;overflow-y:auto;overflow-x:hidden;padding:15px;display:flex;flex-direction:column;gap:13px;',
    'scrollbar-width:thin;scrollbar-color:var(--bjl-border-hi) transparent;overscroll-behavior:contain}',
    '.bjl-body::-webkit-scrollbar{width:7px}.bjl-body::-webkit-scrollbar-thumb{background:var(--bjl-border-hi);border-radius:4px}',
    '.bjl-view{display:flex;flex-direction:column;gap:13px}.bjl-view[hidden]{display:none}',
    '.bjl-greet{font-size:19px;font-weight:600;color:var(--bjl-text);letter-spacing:-.02em;line-height:1.25}',
    '.bjl-greet em{font-style:normal;background:linear-gradient(135deg,#A855F7,#D946EF 55%,#F472B6);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}',
    'html[data-v3-mode="day"] .bjl-greet em{background:linear-gradient(135deg,#7C3AED,#A21CAF 55%,#BE185D);-webkit-background-clip:text;background-clip:text}',
    '.bjl-lede{font-size:13.5px;color:var(--bjl-soft);line-height:1.55;margin-top:-4px}',
    // ── Entrance: cards, chips and bubbles rise in. A class flip on the next
    // frame, not a keyframe, so a bubble that is still rising when the next one
    // lands simply keeps going.
    '.bjl-rise{opacity:0;transform:translateY(10px) scale(.98);transition:transform .38s var(--bjl-ease),opacity .22s ease-out;transition-delay:var(--d,0ms)}',
    '.bjl-rise.in{opacity:1;transform:none}',
    // ── Section shell
    '.bjl-card{border:1px solid var(--bjl-border);border-radius:15px;padding:13px;background:linear-gradient(180deg,var(--bjl-surface),transparent)}',
    '.bjl-ttl{font-size:13px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--bjl-dim);display:flex;align-items:center;gap:6px;margin-bottom:11px}',
    '.bjl-ttl b{color:var(--bjl-brand-ink);font-weight:600;text-transform:none;letter-spacing:0}',
    // ── Fossil strip
    '.bjl-fos{display:flex;flex-direction:column;gap:9px}',
    '.bjl-fr{display:grid;grid-template-columns:1fr;gap:4px;cursor:pointer;border-radius:9px;padding:4px;margin:-4px;transition:background .18s,transform .18s var(--bjl-ease)}',
    '@media (hover:hover) and (pointer:fine){.bjl-fr:hover{background:var(--bjl-surface-hi)}}',
    '.bjl-fr:active{transform:scale(.985)}',
    '.bjl-fl{display:flex;align-items:baseline;justify-content:space-between;gap:8px}',
    '.bjl-fn{font-size:13px;color:var(--bjl-text);font-weight:500;letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}',
    '.bjl-fc{font-size:13px;color:var(--bjl-dim);flex:0 0 auto;font-variant-numeric:tabular-nums}',
    '.bjl-tr{position:relative;height:7px;border-radius:4px;background:var(--bjl-track);overflow:hidden}',
    '.bjl-bar{position:absolute;top:0;bottom:0;border-radius:4px;background:linear-gradient(90deg,#8B5CF6,#D946EF);transform-origin:left}',
    '.bjl-bar.on{background:linear-gradient(90deg,#D946EF,#FB7185);box-shadow:0 0 14px -2px rgba(217,70,239,.85)}',
    '.bjl-live-dot{position:absolute;right:-1px;top:50%;width:7px;height:7px;margin-top:-3.5px;border-radius:50%;background:#FB7185;box-shadow:0 0 9px rgba(251,113,133,.9)}',
    '.bjl-fscale{display:flex;justify-content:space-between;font-size:13px;color:var(--bjl-dim);margin-top:5px;font-variant-numeric:tabular-nums}',
    // ── Say-it
    '.bjl-word{font-size:23px;font-weight:600;color:var(--bjl-text);letter-spacing:-.02em;line-height:1.15;overflow-wrap:anywhere}',
    '.bjl-ipa{font-family:"JetBrains Mono",ui-monospace,monospace;font-size:13px;color:var(--bjl-brand-ink);margin-top:3px}',
    '.bjl-tra{font-size:13px;color:var(--bjl-dim);margin-top:3px}',
    // The mic is a pressable instrument: hold, tap, slide off to cancel. While
    // recording it hosts either the three.js orb (level = shape, score = colour)
    // or the CSS ring below it, whose scale follows the same level.
    '.bjl-mic{width:52px;height:52px;border-radius:50%;border:none;cursor:pointer;flex:0 0 auto;color:#fff;position:relative;touch-action:none;user-select:none;-webkit-user-select:none;',
    'background:var(--bjl-grad);display:flex;align-items:center;justify-content:center;',
    'box-shadow:0 8px 26px -8px rgba(217,70,239,.75);transition:transform .22s var(--bjl-spring),background .2s ease,box-shadow .2s ease}',
    '@media (hover:hover) and (pointer:fine){.bjl-mic:hover{transform:scale(1.06)}}',
    '.bjl-mic:active{transform:scale(.94);transition-duration:.12s}',
    '.bjl-mic svg,.bjl-btn svg{position:relative;z-index:2;transition:opacity .2s ease,transform .2s var(--bjl-ease)}',
    '.bjl-mic.rec,.bjl-btn.ghost.rec{background:linear-gradient(135deg,#FB7185,#E11D48);border-color:transparent;color:#fff;box-shadow:0 8px 26px -8px rgba(251,113,133,.8)}',
    '.bjl-mic.rec.cancel,.bjl-btn.ghost.rec.cancel{background:#5E567C;box-shadow:none}',
    '.bjl-mic.wait,.bjl-btn.ghost.wait{background:linear-gradient(135deg,#7C3AED,#A855F7)}',
    '.bjl-lvl{position:absolute;inset:-3px;border-radius:50%;border:2px solid rgba(251,113,133,.9);opacity:0;pointer-events:none;transform:scale(.9);transition:opacity .2s ease}',
    '.rec .bjl-lvl{opacity:1}.rec.cancel .bjl-lvl{border-color:#8A83AE}',
    '.bjl-orb{position:absolute;inset:0;border-radius:50%;overflow:hidden;pointer-events:none;opacity:0;transition:opacity .22s ease}',
    '.bjl-orb-on .bjl-orb{opacity:1}.bjl-orb-on svg{opacity:0;transform:scale(.6)}',
    '.bjl-hint{font-size:13px;color:var(--bjl-dim);text-align:center;margin-top:9px;line-height:1.4}',
    // ── Score readout
    '.bjl-score{display:flex;align-items:center;gap:13px}',
    '.bjl-ring{width:58px;height:58px;flex:0 0 auto;position:relative}',
    '.bjl-ring svg{transform:rotate(-90deg)}',
    '.bjl-ringv{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:600;color:var(--bjl-text);font-variant-numeric:tabular-nums}',
    '.bjl-words{display:flex;flex-wrap:wrap;gap:5px;min-width:0}',
    '.bjl-w{font-size:13px;padding:3px 8px;border-radius:7px;border:1px solid transparent;line-height:1.3}',
    '.bjl-w.correct{background:var(--bjl-good-bg);color:var(--bjl-good-ink);border-color:var(--bjl-good-line)}',
    '.bjl-w.slip{background:var(--bjl-bad-bg);color:var(--bjl-bad-ink);border-color:var(--bjl-bad-line)}',
    '.bjl-w.close{background:var(--bjl-warn-bg);color:var(--bjl-warn-ink);border-color:var(--bjl-warn-line)}',
    '.bjl-w.wrong,.bjl-w.missed{background:var(--bjl-surface);color:var(--bjl-dim);border-color:var(--bjl-border);text-decoration:line-through}',
    '.bjl-slip{margin-top:10px;padding:10px;border-radius:11px;border:1px solid var(--bjl-bad-line);background:var(--bjl-bad-bg)}',
    '.bjl-slip b{color:var(--bjl-bad-ink);font-size:13px;display:block;margin-bottom:3px}',
    '.bjl-slip span{font-size:13px;color:var(--bjl-soft);line-height:1.5}',
    // ── YouGlish player (inline, X-style: poster -> iframe in place)
    '.bjl-yg{margin-top:10px;border-radius:13px;overflow:hidden;border:1px solid var(--bjl-border-hi);background:rgba(0,0,0,.35)}',
    'html[data-v3-mode="day"] .bjl-yg{background:rgba(0,0,0,.06)}',
    '.bjl-ygp{position:relative;width:100%;aspect-ratio:16/9;background:#000;cursor:pointer;display:block;border:none;padding:0;overflow:hidden}',
    '.bjl-ygp img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .5s var(--bjl-ease)}',
    '@media (hover:hover) and (pointer:fine){.bjl-ygp:hover img{transform:scale(1.03)}}',
    '.bjl-ygp:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.05),rgba(0,0,0,.45))}',
    '.bjl-play{position:absolute;left:50%;top:50%;width:52px;height:52px;margin:-26px 0 0 -26px;border-radius:50%;z-index:2;',
    'background:var(--bjl-grad);display:flex;align-items:center;justify-content:center;color:#fff;',
    'box-shadow:0 8px 26px -6px rgba(0,0,0,.65);transition:transform .22s var(--bjl-spring)}',
    '@media (hover:hover) and (pointer:fine){.bjl-ygp:hover .bjl-play{transform:scale(1.1)}}',
    '.bjl-ygp:active .bjl-play{transform:scale(.94)}',
    '.bjl-yg iframe{width:100%;aspect-ratio:16/9;border:0;display:block}',
    '.bjl-ygc{padding:9px 11px;font-size:13px;line-height:1.45;color:var(--bjl-soft);border-top:1px solid var(--bjl-border)}',
    '.bjl-ygc b{color:var(--bjl-brand-ink);font-weight:600}',
    '.bjl-ygn{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 11px;border-top:1px solid var(--bjl-border)}',
    '.bjl-ygn button{background:var(--bjl-surface-hi);border:1px solid var(--bjl-border-hi);color:var(--bjl-soft);border-radius:8px;',
    'cursor:pointer;padding:4px 10px;font-size:13px;line-height:1.5;transition:border-color .18s,color .18s,transform .16s var(--bjl-ease)}',
    '.bjl-ygn button:hover{color:var(--bjl-text);border-color:var(--bjl-brand-line)}.bjl-ygn button:active{transform:scale(.96)}',
    '.bjl-ygn span{font-size:13px;color:var(--bjl-dim);font-variant-numeric:tabular-nums}',
    '.bjl-real{margin-top:9px;width:100%;padding:9px;border-radius:10px;cursor:pointer;font-size:13px;line-height:1.4;',
    'border:1px solid var(--bjl-brand-line);background:var(--bjl-brand-soft);color:var(--bjl-brand-ink);transition:background .18s,transform .16s var(--bjl-ease)}',
    '.bjl-real:hover{background:var(--bjl-surface-hi)}.bjl-real:active{transform:scale(.985)}.bjl-real:disabled{cursor:default;opacity:.7}',
    // ── Chips
    '.bjl-chips{display:flex;flex-direction:column;gap:7px}',
    '.bjl-chip{width:100%;text-align:left;display:flex;align-items:center;gap:9px;padding:10px 12px;border-radius:12px;cursor:pointer;',
    'border:1px solid var(--bjl-border);background:linear-gradient(180deg,var(--bjl-surface),transparent);',
    'color:var(--bjl-text);font-size:13.5px;line-height:1.4;transition:transform .2s var(--bjl-ease),border-color .18s,background .18s,opacity .22s ease-out}',
    '@media (hover:hover) and (pointer:fine){.bjl-chip:hover{transform:translateX(3px);border-color:var(--bjl-brand-line);background:var(--bjl-brand-soft)}}',
    '.bjl-chip:active{transform:scale(.985)}',
    '.bjl-chip i{font-style:normal;font-size:15px;flex:0 0 auto;opacity:.95}',
    // ── Messages
    '.bjl-msg{max-width:86%;padding:10px 13px;border-radius:15px;font-size:13.5px;line-height:1.55;white-space:pre-wrap;word-break:break-word}',
    '.bjl-msg.me{align-self:flex-end;background:var(--bjl-me);color:#fff;border-bottom-right-radius:5px;transform-origin:100% 100%}',
    '.bjl-msg.her{align-self:flex-start;background:var(--bjl-surface);color:var(--bjl-text);border:1px solid var(--bjl-border);border-bottom-left-radius:5px;transform-origin:0 100%}',
    '.bjl-msg.sys{align-self:center;max-width:92%;font-size:13px;color:var(--bjl-dim);font-style:italic;background:none;border:none;text-align:center;line-height:1.5}',
    '.bjl-sys-retry{display:inline-block;margin-top:6px;font-style:normal;font-size:13px;font-weight:600;color:var(--bjl-brand-ink);background:var(--bjl-brand-soft);',
    'border:1px solid var(--bjl-brand-line);border-radius:9px;padding:5px 11px;cursor:pointer;transition:transform .16s var(--bjl-ease),background .18s}',
    '.bjl-sys-retry:hover{background:var(--bjl-surface-hi)}.bjl-sys-retry:active{transform:scale(.96)}',
    // ── Rendered markdown inside Bajla's bubble.
    // Block elements own the rhythm here, so pre-wrap has to go or every
    // newline in the source would double as a blank line on screen.
    '.bjl-rich{white-space:normal;max-width:92%;line-height:1.62;padding:12px 14px}',
    '.bjl-rich>*{margin:0}',
    '.bjl-rich>*+*{margin-top:9px}',
    '.bjl-rich ul,.bjl-rich ol{list-style:none;padding:0;display:flex;flex-direction:column;gap:6px}',
    '.bjl-rich li{position:relative;padding-left:15px}',
    // A 4px dot rather than a disc bullet: at 13px the browser default sits
    // too low and too far out, and breaks the left edge of the bubble.
    '.bjl-rich ul li::before{content:"";position:absolute;left:2px;top:.62em;width:4px;height:4px;border-radius:50%;background:var(--bjl-brand)}',
    '.bjl-rich ol{counter-reset:bjl}',
    '.bjl-rich ol li{counter-increment:bjl}',
    // Line-height in px, not a ratio: the marker is smaller than the text, so
    // a ratio would give it a shorter line box and float the numeral upward.
    '.bjl-rich ol li::before{content:counter(bjl);position:absolute;left:0;top:0;font-size:13px;line-height:21px;font-weight:600;color:var(--bjl-brand);font-variant-numeric:tabular-nums}',
    '.bjl-rich strong{font-weight:600;color:var(--bjl-text)}',
    '.bjl-rich em{font-style:italic;color:var(--bjl-em)}',
    // Backticks carry the actual language being corrected, the one thing the
    // eye should land on first, so it gets a chip rather than just a font.
    // Deliberately NOT monospace: these are English phrases the student said,
    // not code. Body font, tinted, with the outline as an inset shadow so the
    // chip cannot alter the line box it sits in.
    '.bjl-rich code{font-family:inherit;font-size:13px;font-weight:500;padding:1px 6px;border-radius:6px;',
    'background:var(--bjl-brand-soft);box-shadow:inset 0 0 0 1px var(--bjl-brand-line);color:var(--bjl-code);white-space:normal;',
    '-webkit-box-decoration-break:clone;box-decoration-break:clone}',
    '.bjl-rich a{color:var(--bjl-link);text-decoration:underline;text-underline-offset:2px;text-decoration-thickness:1px;',
    'text-decoration-color:var(--bjl-brand-line);transition:color .16s ease,text-decoration-color .16s ease}',
    '.bjl-rich a:hover{color:var(--bjl-link-hi);text-decoration-color:var(--bjl-link-hi)}',
    // ── Streaming reveal.
    // Unrevealed words are display:none rather than transparent, so the bubble
    // genuinely GROWS as they land, and that growth is what the autoscroll
    // follows. Reserving the full height up front would be smoother but dead.
    '.bjl-blk{display:none}',
    '.bjl-blk.on{display:block;animation:bjlBlk .26s var(--bjl-ease) both}',
    '.bjl-rich li.bjl-blk.on{display:list-item}',
    // Words flip to display:inline with NO per-word animation: an opacity
    // keyframe on every word promoted a hundred compositor layers per reply,
    // and a long transcript turned each reveal tick into a >50ms task. The
    // block-level rise (bjlBlk) carries the motion; the caret carries the pace.
    '.bjl-wd{display:none}',
    '.bjl-wd.on{display:inline}',
    // An inline wrapper draws its own chrome (a code chip's tint and outline)
    // even while every word inside it is still hidden, which reads as an empty
    // pill floating at the reveal edge. Hide the wrapper until it has content.
    '.bjl-inl{display:none}',
    '.bjl-inl.on{display:inline}',
    '@keyframes bjlBlk{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}',
    // The caret marks where she is mid-sentence; it goes when the reveal ends.
    '.bjl-rich.streaming>*:last-child::after{content:"";display:inline-block;width:2px;height:.95em;',
    'margin-left:2px;vertical-align:-.12em;background:var(--bjl-brand);animation:bjlCaret .9s steps(1) infinite}',
    '@keyframes bjlCaret{0%,55%{opacity:1}56%,100%{opacity:0}}',
    '.bjl-typing{align-self:flex-start;display:flex;align-items:center;gap:4px;padding:11px 14px;background:var(--bjl-surface);border-radius:15px;border:1px solid var(--bjl-border);transform-origin:0 100%}',
    '.bjl-typing i{width:6px;height:6px;border-radius:50%;background:var(--bjl-brand);animation:bjlDot 1.2s cubic-bezier(.45,0,.55,1) infinite}',
    '.bjl-typing i:nth-child(2){animation-delay:.15s}.bjl-typing i:nth-child(3){animation-delay:.3s}',
    '@keyframes bjlDot{0%,60%,100%{opacity:.3;transform:translateY(0) scale(.9)}30%{opacity:1;transform:translateY(-4px) scale(1)}}',
    '.bjl-spk{display:inline-flex;align-items:center;gap:5px;margin-top:8px;font-size:13px;color:var(--bjl-dim);cursor:pointer;background:none;border:none;padding:2px 0;transition:color .18s}',
    '.bjl-spk:hover{color:var(--bjl-brand-ink)}.bjl-spk.on{color:var(--bjl-brand-ink)}',
    // ── Composer
    '.bjl-ft{position:relative;padding:11px;border-top:1px solid var(--bjl-border);display:flex;gap:7px;align-items:flex-end;background:var(--bjl-surface)}',
    '.bjl-in{flex:1;min-width:0;resize:none;max-height:110px;padding:10px 13px;border-radius:13px;background:var(--bjl-surface-hi);',
    'border:1px solid var(--bjl-border-hi);color:var(--bjl-text);font-family:inherit;font-size:13.5px;line-height:1.45;outline:none;transition:border-color .18s,box-shadow .18s,opacity .18s}',
    'html[data-v3-mode="day"] .bjl-in{background:#fff}',
    '.bjl-in:focus{border-color:var(--bjl-brand-line);box-shadow:0 0 0 3px var(--bjl-brand-soft)}',
    '.bjl-in::placeholder{color:var(--bjl-dim)}',
    '.bjl-btn{flex:0 0 auto;width:40px;height:40px;border:none;border-radius:13px;cursor:pointer;color:#fff;position:relative;touch-action:none;user-select:none;-webkit-user-select:none;',
    'background:var(--bjl-grad);display:flex;align-items:center;justify-content:center;transition:transform .2s var(--bjl-spring),opacity .18s,background .2s ease}',
    '@media (hover:hover) and (pointer:fine){.bjl-btn:hover{transform:scale(1.06)}}',
    '.bjl-btn:active{transform:scale(.94);transition-duration:.12s}',
    '.bjl-btn:disabled{opacity:.42;cursor:not-allowed;transform:none}',
    '.bjl-btn.ghost{background:var(--bjl-surface-hi);border:1px solid var(--bjl-border-hi);color:var(--bjl-soft)}',
    // The recording bar slides over the textarea while the mic is held: what
    // is happening, for how long, and the two ways out (release / slide off).
    '.bjl-recbar{position:absolute;left:11px;right:105px;top:11px;bottom:11px;display:flex;align-items:center;gap:9px;padding:0 13px;border-radius:13px;',
    'background:var(--bjl-bad-bg);border:1px solid var(--bjl-bad-line);color:var(--bjl-text);font-size:13px;line-height:1.3;',
    'opacity:0;transform:translateY(6px);pointer-events:none;transition:opacity .18s ease,transform .26s var(--bjl-ease),background .2s,border-color .2s}',
    '.bjl-rec-on .bjl-recbar{opacity:1;transform:none}',
    '.bjl-rec-on .bjl-in,.bjl-rec-on .bjl-send{visibility:hidden}',
    '.bjl-recbar.cancel{background:var(--bjl-surface-hi);border-color:var(--bjl-border-hi)}',
    '.bjl-recdot{width:9px;height:9px;border-radius:50%;background:var(--bjl-bad);flex:0 0 auto;animation:bjlBlink 1s steps(1) infinite}',
    '.bjl-recbar.cancel .bjl-recdot{background:var(--bjl-dim);animation:none}',
    '@keyframes bjlBlink{0%,60%{opacity:1}61%,100%{opacity:.25}}',
    '.bjl-rectime{font-variant-numeric:tabular-nums;font-weight:600;flex:0 0 auto}',
    '.bjl-rechint{color:var(--bjl-dim);min-width:0;line-height:1.25;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}',
    // ── Reduced motion: no movement, keep the opacity fades that carry meaning.
    '@media (prefers-reduced-motion:reduce){.bjl-root *{animation:none!important;transition-duration:.01ms!important}',
    '.bjl-rise{transform:none}.bjl-panel{transform:none}.bjl-blk,.bjl-wd,.bjl-inl{display:revert!important}',
    '.bjl-rich.streaming>*:last-child::after{display:none}}',
    // ── Phones: a full-height sheet that rides the visual viewport, so the
    // keyboard shrinks the sheet instead of shoving it off screen.
    '@media (max-width:480px){.bjl-root{right:14px;bottom:calc(14px + env(safe-area-inset-bottom))}',
    '.bjl-panel{position:fixed;left:0;right:0;top:var(--bjl-vvt,0px);bottom:auto;width:100%;height:var(--bjl-vvh,100dvh);border-radius:0;border:none;',
    'transform-origin:50% 100%;transform:translateY(100%)}',
    '.bjl-open .bjl-panel{transform:none}',
    '.bjl-hd{padding-top:calc(14px + env(safe-area-inset-top))}',
    '.bjl-ft{padding-bottom:calc(11px + env(safe-area-inset-bottom))}',
    '.bjl-recbar{bottom:calc(11px + env(safe-area-inset-bottom))}',
    '.bjl-open .bjl-fab{opacity:0;pointer-events:none;transform:scale(.8)}}',
    // The WhatsApp connect popup is aria-modal with a scrim; the launcher must
    // not float over it, clickable, at a higher z-index. BajlaConnectModal
    // stamps this class on <body> while it is open (a :has() on body would make
    // every DOM change in the app re-evaluate the selector).
    'body.em-bjp-open .bjl-root{opacity:0;pointer-events:none;transition:opacity .2s ease}'
  ].join('');

  function injectCSS() {
    // Re-boot safe: a hot-reloaded or twice-included script must not stack a
    // second copy of the sheet.
    var s = document.getElementById('bjl-style');
    if (!s) {
      s = document.createElement('style');
      s.id = 'bjl-style';
      document.head.appendChild(s);
    }
    s.textContent = CSS;
  }

  // Entrance for anything that "rises in": the class flips on the next frame so
  // the transition runs from the hidden state. --d staggers siblings.
  function rise(node, delayMs) {
    node.classList.add('bjl-rise');
    if (delayMs) node.style.setProperty('--d', delayMs + 'ms');
    if (REDUCED) { node.classList.add('in'); return node; }
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { node.classList.add('in'); });
    });
    return node;
  }

  // ── Tiny DOM helper ──────────────────────────────────────────────────────
  function el(tag, cls, txt) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt != null) n.textContent = txt;
    return n;
  }
  function svgIcon(path, size) {
    return '<svg width="' + (size || 20) + '" height="' + (size || 20) + '" viewBox="0 0 24 24" fill="none" ' +
      'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + path + '</svg>';
  }
  var IC = {
    close: '<path d="M18 6 6 18M6 6l12 12"/>',
    send: '<path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z"/>',
    mic: '<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4"/>',
    stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
    play: '<path d="M6 3l14 9-14 9V3z"/>',
    back: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
    home: '<path d="M3 11l9-8 9 8v9a2 2 0 0 1-2 2h-4v-7H9v7H5a2 2 0 0 1-2-2z"/>',
    down: '<path d="M6 9l6 6 6-6"/>'
  };

  // ── Data ─────────────────────────────────────────────────────────────────
  function loadProfile(slug) {
    // /suggestions returns this student's CEFR, lesson history and
    // fossilised error patterns, so it is no longer public. Same token.
    return fetch(API + '/suggestions/' + encodeURIComponent(slug)
                 + '?token=' + encodeURIComponent(studentToken()))
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
  }

  // ── Fossil strip ─────────────────────────────────────────────────────────
  // Each pattern drawn across the real calendar window it spans. This is the
  // whole point: "you have done this for 14 months" is a shape, not a sentence.
  function buildFossils(fossils) {
    var wrap = el('div', 'bjl-card');
    var tt = el('div', 'bjl-ttl');
    tt.appendChild(document.createTextNode(t('habits') + ' '));
    tt.appendChild(el('b', null, t('fossilised', fossils.filter(function (f) { return f.fossilized; }).length)));
    wrap.appendChild(tt);

    var dates = [];
    fossils.forEach(function (f) {
      if (f.first) dates.push(f.first);
      if (f.last) dates.push(f.last);
    });
    if (!dates.length) return null;
    dates.sort();
    var t0 = new Date(dates[0]).getTime();
    var t1 = new Date(dates[dates.length - 1]).getTime();
    var span = Math.max(1, t1 - t0);

    var list = el('div', 'bjl-fos');
    fossils.forEach(function (f, i) {
      var row = el('div', 'bjl-fr');
      row.setAttribute('role', 'button');
      row.setAttribute('tabindex', '0');

      var line = el('div', 'bjl-fl');
      line.appendChild(el('span', 'bjl-fn', f.title));
      line.appendChild(el('span', 'bjl-fc', t('times', f.count, f.lessons)));
      row.appendChild(line);

      var track = el('div', 'bjl-tr');
      var bar = el('div', 'bjl-bar' + (f.fossilized ? ' on' : ''));
      var a = (new Date(f.first).getTime() - t0) / span;
      var b = (new Date(f.last).getTime() - t0) / span;
      bar.style.left = (a * 100).toFixed(1) + '%';
      bar.style.width = Math.max(3, (b - a) * 100).toFixed(1) + '%';
      if (!REDUCED) {
        bar.style.transform = 'scaleX(0)';
        bar.style.transition = 'transform .7s cubic-bezier(.16,1,.3,1) ' + (120 + i * 90) + 'ms';
        setTimeout(function () { bar.style.transform = 'scaleX(1)'; }, 30);
      }
      if (f.fossilized) bar.appendChild(el('span', 'bjl-live-dot'));
      track.appendChild(bar);
      row.appendChild(track);

      // f.prompt is the server's canonical wording. Composing it here instead
      // is how this row used to miss its own prebaked answer over one
      // apostrophe, so only fall back if an old server omits the field.
      function ask() {
        send(f.prompt || t('whyPrompt', f.title.toLowerCase()), true);
      }
      row.addEventListener('click', ask);
      row.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ask(); }
      });
      list.appendChild(row);
    });
    wrap.appendChild(list);

    var scale = el('div', 'bjl-fscale');
    scale.appendChild(el('span', null, fmtMonth(dates[0])));
    scale.appendChild(el('span', null, fmtMonth(dates[dates.length - 1])));
    wrap.appendChild(scale);
    return wrap;
  }

  function fmtMonth(d) {
    try {
      return new Date(d).toLocaleDateString(t('month'), { month: 'short', year: '2-digit' });
    } catch (e) { return d; }
  }

  // ── Say-it card ──────────────────────────────────────────────────────────
  function buildDrill(drill) {
    var wrap = el('div', 'bjl-card');
    var tt = el('div', 'bjl-ttl');
    tt.appendChild(document.createTextNode(t('sayIt') + ' '));
    tt.appendChild(el('b', null, t('holdMic')));
    wrap.appendChild(tt);

    var row = el('div');
    row.style.cssText = 'display:flex;align-items:center;gap:13px';
    var left = el('div');
    left.style.cssText = 'flex:1;min-width:0';
    left.appendChild(el('div', 'bjl-word', drill.word));
    if (drill.ipa) left.appendChild(el('div', 'bjl-ipa', '/' + drill.ipa + '/'));
    if (drill.translation) left.appendChild(el('div', 'bjl-tra', drill.translation));
    row.appendChild(left);

    var mic = micButton('bjl-mic', t('holdSay', drill.word), 22);
    bindHold(mic, drill.word);
    row.appendChild(mic);
    wrap.appendChild(row);

    var res = el('div');
    res.id = 'bjl-drill-res';
    wrap.appendChild(res);

    // Hearing a native speaker BEFORE attempting it is the natural order, so
    // offer it up front rather than only after a score.
    if (drill.hasClips) {
      var real = el('button', 'bjl-real', '▶  ' + t('hear', drill.word));
      real.addEventListener('click', function () {
        real.disabled = true;
        real.textContent = t('loadingClips');
        fetchYouglish(drill.word).then(function (yg) {
          var p = renderYouglish(yg);
          if (p) { real.replaceWith(rise(p)); }
          else { real.textContent = t('noClips'); }
        });
      });
      wrap.appendChild(real);
    }
    wrap.appendChild(el('div', 'bjl-hint', t('hint')));
    return wrap;
  }

  // A mic button carries its own level ring (CSS fallback) and an empty host
  // the three.js orb mounts into on demand. Both are pointer-events:none so
  // the hold gesture always lands on the button itself.
  function micButton(cls, label, iconSize) {
    var b = el('button', cls);
    b.type = 'button';
    b.setAttribute('aria-label', label);
    b.innerHTML = svgIcon(IC.mic, iconSize) + '<span class="bjl-lvl" aria-hidden="true"></span><span class="bjl-orb" aria-hidden="true"></span>';
    return b;
  }

  function renderScore(container, scored, coaching, yg) {
    container.innerHTML = '';
    container.style.marginTop = '13px';
    var box = el('div', 'bjl-score');

    var pct = Math.max(0, Math.min(100, scored.score));
    var col = pct >= 80 ? 'var(--bjl-good)' : pct >= 55 ? 'var(--bjl-warn)' : 'var(--bjl-bad)';
    // The orb in the mic button settles to the same verdict colour, so the
    // instrument the student just spoke into tells them how it went.
    settleOrb(pct >= 80 ? '#34D399' : pct >= 55 ? '#FCD34D' : '#FB7185');
    var C = 2 * Math.PI * 24;
    var ring = el('div', 'bjl-ring');
    ring.setAttribute('role', 'img');
    ring.setAttribute('aria-label', pct + ' / 100');
    ring.innerHTML =
      '<svg width="58" height="58" viewBox="0 0 58 58" aria-hidden="true">' +
      '<circle cx="29" cy="29" r="24" stroke="var(--bjl-track)" stroke-width="5" fill="none"/>' +
      '<circle cx="29" cy="29" r="24" stroke="' + col + '" stroke-width="5" fill="none" stroke-linecap="round" ' +
      'stroke-dasharray="' + C + '" stroke-dashoffset="' + C + '" style="transition:stroke-dashoffset .85s cubic-bezier(.16,1,.3,1)"/></svg>' +
      '<div class="bjl-ringv">' + pct + '</div>';
    box.appendChild(ring);
    setTimeout(function () {
      var c = ring.querySelector('circle:last-of-type');
      if (c) c.style.strokeDashoffset = String(C * (1 - pct / 100));
    }, 40);

    var words = el('div', 'bjl-words');
    (scored.words || []).forEach(function (w) {
      var c = el('span', 'bjl-w ' + w.state, w.word);
      if (w.heard && w.heard !== w.word) c.title = t('heard') + w.heard;
      words.appendChild(c);
    });
    box.appendChild(words);
    container.appendChild(box);

    (scored.slips || []).forEach(function (s) {
      var d = el('div', 'bjl-slip');
      d.appendChild(el('b', null, s.detail));
      d.appendChild(el('span', null, s.tip));
      container.appendChild(d);
    });
    if (coaching) {
      var c = el('div', 'bjl-msg her');
      c.style.cssText = 'align-self:stretch;max-width:100%;margin-top:10px';
      c.textContent = coaching;
      container.appendChild(rise(c, 120));
    }
    var player = renderYouglish(yg);
    if (player) container.appendChild(rise(player, 200));
    announce(coaching || (pct + ' / 100'));
  }

  // ── YouGlish inline player ───────────────────────────────────────────────
  // Poster first, iframe only on tap: an autoplaying embed per reply would be
  // hostile, and the poster keeps the panel light until the student wants it.
  // NOTE: must be www.youtube.com — the site CSP frames that host only.
  function renderYouglish(yg) {
    if (!yg || !yg.clips || !yg.clips.length) return null;
    var i = 0;
    var wrap = el('div', 'bjl-yg');
    var stage = el('div');
    var cap = el('div', 'bjl-ygc');
    var nav = el('div', 'bjl-ygn');

    function paint() {
      var c = yg.clips[i];
      stage.innerHTML = '';
      var poster = el('button', 'bjl-ygp');
      poster.type = 'button';
      poster.setAttribute('aria-label', t('playClip', yg.word));
      var img = el('img');
      img.src = c.thumb;
      img.alt = '';
      img.loading = 'lazy';
      poster.appendChild(img);
      var play = el('span', 'bjl-play');
      play.innerHTML = svgIcon(IC.play, 20);
      poster.appendChild(play);
      poster.addEventListener('click', function () {
        var f = document.createElement('iframe');
        f.src = c.embed;
        f.allow = 'accelerometer; autoplay; encrypted-media; picture-in-picture';
        f.setAttribute('allowfullscreen', '');
        f.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
        stage.innerHTML = '';
        stage.appendChild(f);
      });
      stage.appendChild(poster);
      cap.innerHTML = '';
      cap.appendChild(el('b', null, '“' + yg.word + '”'));
      if (c.caption) cap.appendChild(document.createTextNode(' · ' + c.caption));
      nav.querySelector('span').textContent = (i + 1) + ' / ' + yg.clips.length;
    }

    var prev = el('button', null, '‹ ' + t('prev'));
    var count = el('span');
    var next = el('button', null, t('next') + ' ›');
    prev.type = 'button'; next.type = 'button';
    prev.addEventListener('click', function () { i = (i - 1 + yg.clips.length) % yg.clips.length; paint(); });
    next.addEventListener('click', function () { i = (i + 1) % yg.clips.length; paint(); });
    nav.appendChild(prev); nav.appendChild(count); nav.appendChild(next);

    wrap.appendChild(stage);
    wrap.appendChild(cap);
    if (yg.clips.length > 1) wrap.appendChild(nav);
    paint();
    return wrap;
  }

  function fetchYouglish(word) {
    return fetch(API + '/youglish/' + encodeURIComponent(word))
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
  }

  // ── Home view ────────────────────────────────────────────────────────────
  // The body holds two views: the home screen (fossils, drill, chips) and the
  // chat transcript. Switching detaches nothing, so a student can go back to
  // the drill card mid-conversation and return to the transcript intact.
  function showView(name) {
    view = name;
    els.home.hidden = name !== 'home';
    els.chat.hidden = name !== 'chat';
    els.nav.setAttribute('aria-label', name === 'chat' ? t('home') : t('chat'));
    els.nav.innerHTML = svgIcon(name === 'chat' ? IC.home : IC.back, 18);
    scroll();
  }

  function renderHome() {
    var b = els.home;
    b.innerHTML = '';
    if (!profile) {
      if (profileFailed) {
        sysMsg(b, t('noProfile'), function () { loadStudent(currentSlug()); });
      } else {
        b.appendChild(rise(el('div', 'bjl-msg sys', t('loading'))));
      }
      return;
    }
    var g = el('div', 'bjl-greet');
    g.innerHTML = esc(t('hi')) + ' <em>' + esc(profile.student || '') + '</em> 👋';
    b.appendChild(rise(g));
    b.appendChild(rise(el('div', 'bjl-lede', t('lede', profile.lessons)), 40));

    var d = 90;
    if (profile.fossils && profile.fossils.length) {
      var f = buildFossils(profile.fossils);
      if (f) { b.appendChild(rise(f, d)); d += 70; }
    }
    if (profile.drill) { b.appendChild(rise(buildDrill(profile.drill), d)); d += 70; }

    if (profile.chips && profile.chips.length) {
      var box = el('div', 'bjl-chips');
      profile.chips.forEach(function (c, i) {
        var btn = el('button', 'bjl-chip');
        btn.type = 'button';
        var ic = el('i', null, iconFor(c.icon));
        ic.setAttribute('aria-hidden', 'true');
        btn.appendChild(ic);
        btn.appendChild(el('span', null, c.label));
        btn.addEventListener('click', function () { send(c.prompt, true); });
        box.appendChild(rise(btn, d + i * 45));
      });
      b.appendChild(box);
    }
  }

  // A system line that says what happened and offers the one thing to do next.
  function sysMsg(parent, text, retry) {
    if (parent === els.chat) {
      if (view !== 'chat') showView('chat');
      els.panel.classList.add('bjl-has-chat');
    }
    var m = el('div', 'bjl-msg sys', text);
    if (retry) {
      m.appendChild(document.createElement('br'));
      var r = el('button', 'bjl-sys-retry', t('retry'));
      r.type = 'button';
      r.addEventListener('click', function () { m.remove(); retry(); });
      m.appendChild(r);
    }
    parent.appendChild(rise(m));
    announce(text);
    scroll();
    return m;
  }

  // One polite live region, so a reader hears replies and errors without the
  // transcript itself being marked live (which would read every word twice as
  // the reveal lands).
  function announce(text) {
    if (!els.live) return;
    els.live.textContent = '';
    setTimeout(function () { els.live.textContent = text; }, 30);
  }

  function iconFor(name) {
    return ({ history: '🕰', style: '🃏', graphic_eq: '🎙', sports_esports: '🎮' })[name] || '✨';
  }
  function esc(s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  // ── Markdown ─────────────────────────────────────────────────────────────
  // Bajla answers in markdown. This renders the small subset she is allowed to
  // use — bullets, bold, italics, backticks, links — and nothing else.
  //
  // Everything is HTML-escaped BEFORE any tag is introduced, so a reply is
  // never a route into the DOM. Links are whitelisted to in-app paths for the
  // same reason: the model composes them, so they are not trusted input.
  function mdInline(s) {
    var out = esc(s);
    out = out.replace(/`([^`\n]+)`/g, '<code>$1</code>');
    out = out.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    out = out.replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s.,!?;:)]|$)/g, '$1<em>$2</em>');
    out = out.replace(/(^|[\s(])_([^_\n]+)_(?=[\s.,!?;:)]|$)/g, '$1<em>$2</em>');
    // The URL group tolerates one nested (...) so a rejected link is consumed
    // whole — otherwise its closing bracket survives as litter in the text.
    out = out.replace(/\[([^\]\n]+)\]\(([^()\s]*(?:\([^()]*\))?[^()\s]*)\)/g, function (m, label, href) {
      if (!/^\/[A-Za-z0-9/_-]*$/.test(href)) return label;   // in-app paths only
      return '<a href="' + href + '">' + label + '</a>';
    });
    return out;
  }

  function mdToHtml(src) {
    var lines = String(src == null ? '' : src).replace(/\r/g, '').split('\n');
    var html = '', para = [], list = null;

    // A single newline stays a line break, the way every chat client treats it.
    // Joining with a space instead would silently flatten the replies that are
    // NOT markdown — admin answers, escalation notes — into one run-on block.
    function flushPara() {
      if (para.length) {
        html += '<p>' + mdInline(para.join('\n')).replace(/\n/g, '<br>') + '</p>';
        para = [];
      }
    }
    function flushList() {
      if (list) { html += '<' + list.tag + '>' + list.items + '</' + list.tag + '>'; list = null; }
    }

    lines.forEach(function (raw) {
      var line = raw.trim();
      if (!line) { flushPara(); flushList(); return; }

      var bullet = line.match(/^[-*+]\s+(.*)$/);
      var number = line.match(/^\d+[.)]\s+(.*)$/);
      if (bullet || number) {
        flushPara();
        var tag = bullet ? 'ul' : 'ol';
        if (list && list.tag !== tag) flushList();
        if (!list) list = { tag: tag, items: '' };
        list.items += '<li>' + mdInline((bullet || number)[1]) + '</li>';
        return;
      }
      flushList();
      para.push(line);
    });
    flushPara();
    flushList();
    return html;
  }

  // ── Streaming reveal ─────────────────────────────────────────────────────
  // The answer arrives complete — usually from cache, in under half a second —
  // so there is nothing to stream off the network. Revealing it word by word is
  // what makes it read as alive instead of blinking into existence whole.
  var finishReveal = null;   // completes the in-flight reveal, if any

  // Whether the transcript is pinned to its end. Updated from the scroll
  // event, so the reveal loop never has to read layout on every tick.
  var stuck = true;
  function nearBottom() {
    return els.body.scrollHeight - els.body.scrollTop - els.body.clientHeight < 70;
  }
  function watchScroll() {
    els.body.addEventListener('scroll', function () { stuck = nearBottom(); }, { passive: true });
  }

  function revealRich(node, html, onDone) {
    node.innerHTML = html;
    var blocks = [], words = [], raf = null, ended = false;

    // Reveal units: each top-level block, and each list item inside one.
    Array.prototype.forEach.call(node.children, function (c) {
      c.classList.add('bjl-blk');
      blocks.push(c);
      Array.prototype.forEach.call(c.querySelectorAll('li'), function (li) {
        li.classList.add('bjl-blk');
        blocks.push(li);
      });
    });

    // Wrap words in spans so they can appear one at a time. Splitting text
    // nodes rather than the HTML keeps every code chip, bold run and link
    // intact — rebuilding the string would tear them apart.
    var walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null, false);
    var texts = [];
    while (walker.nextNode()) texts.push(walker.currentNode);
    texts.forEach(function (t) {
      var frag = document.createDocumentFragment();
      t.nodeValue.split(/(\s+)/).forEach(function (p) {
        if (!p) return;
        if (/^\s+$/.test(p)) { frag.appendChild(document.createTextNode(p)); return; }
        var s = el('span', 'bjl-wd', p);
        frag.appendChild(s);
        words.push(s);
      });
      t.parentNode.replaceChild(frag, t);
    });
    Array.prototype.forEach.call(node.querySelectorAll('code,strong,em,b,i,a'), function (e) {
      e.classList.add('bjl-inl');
      blocks.push(e);   // must be re-shown by finish() too, or skipping hides them
    });

    function finish() {
      if (ended) return;
      ended = true;
      if (raf) clearTimeout(raf);
      node.classList.remove('streaming');
      node.removeEventListener('click', finish);
      blocks.forEach(function (b) { b.classList.add('on'); });
      words.forEach(function (w) { w.classList.add('on'); });
      if (finishReveal === finish) finishReveal = null;
      if (onDone) onDone();
      scroll();
    }

    if (REDUCED || !words.length) { finish(); return; }

    finishReveal = finish;
    node.classList.add('streaming');
    node.addEventListener('click', finish);   // impatient tap shows it all

    // Pace it to land in about a second whatever the length — long answers
    // should not become long waits, which is the whole complaint.
    var budget = Math.min(1100, 260 + words.length * 12);
    var started = Date.now();
    var i = 0;

    // Driven off the clock, not off frames. requestAnimationFrame stops in a
    // backgrounded tab, which would strand a half-written answer and never fire
    // onDone — no speak button, no clips. Reading elapsed time also lets a late
    // tick catch up in one go instead of falling permanently behind.
    function step() {
      var stick = stuck;
      var want = Math.min(words.length, Math.ceil(words.length * (Date.now() - started) / budget));
      for (; i < want; i++) {
        var p = words[i].parentNode;
        while (p && p !== node) {          // open every container on the way up
          if (p.classList && (p.classList.contains('bjl-blk') ||
                              p.classList.contains('bjl-inl'))) p.classList.add('on');
          p = p.parentNode;
        }
        words[i].classList.add('on');
      }
      if (stick) scroll();                 // follow only if they haven't scrolled up
      if (i < words.length) raf = setTimeout(step, 16);
      else finish();
    }
    raf = setTimeout(step, 16);
    // Backstop: however badly the timer is throttled, the answer completes.
    setTimeout(finish, budget + 2000);
  }

  // ── Chat ─────────────────────────────────────────────────────────────────
  function addMsg(role, text, onDone) {
    if (finishReveal) finishReveal();   // never run two reveals at once
    if (view !== 'chat') showView('chat');
    els.panel.classList.add('bjl-has-chat');
    var rich = role === 'assistant';
    var m = el('div', 'bjl-msg ' + (role === 'user' ? 'me' : role === 'system' ? 'sys' : 'her') +
      (rich ? ' bjl-rich' : ''), rich ? null : text);
    els.chat.appendChild(rise(m));
    if (rich) revealRich(m, mdToHtml(text), onDone);
    else if (onDone) onDone();
    if (role !== 'user') announce(text);
    if (role === 'assistant' && !open) setUnread(true);
    scroll();
    return m;
  }
  function scroll() {
    // One write per frame: several appends in a row (reply, speak button,
    // clips) coalesce instead of forcing a layout each.
    if (scroll.pending) return;
    scroll.pending = true;
    requestAnimationFrame(function () {
      scroll.pending = false;
      els.body.scrollTop = els.body.scrollHeight;
      stuck = true;
    });
  }

  function setUnread(on) {
    unread = !!on;
    els.root.classList.toggle('bjl-unread', unread);
    els.fab.setAttribute('aria-label', unread ? t('unread') : (open ? t('closeFab') : t('openFab')));
  }

  function typing(on) {
    var node = els.chat.querySelector('.bjl-typing');
    if (on && !node) {
      var d = el('div', 'bjl-typing');
      d.innerHTML = '<i></i><i></i><i></i><span class="bjl-sr">' + esc(t('thinking')) + '</span>';
      d.setAttribute('role', 'status');
      if (view !== 'chat') showView('chat');
      els.chat.appendChild(rise(d));
      scroll();
    } else if (!on && node) node.remove();
  }

  function stopAudio() {
    if (currentAudio) { try { currentAudio.pause(); } catch (e) { /* already stopped */ } }
    currentAudio = null;
    var on = els.chat.querySelector('.bjl-spk.on');
    if (on) on.classList.remove('on');
  }

  function playChunks(urls, btn) {
    if (!urls || !urls.length) return;
    stopAudio();
    var i = 0;
    if (btn) btn.classList.add('on');
    function next() {
      if (i >= urls.length || (btn && !btn.classList.contains('on') && i > 0)) {
        currentAudio = null;
        if (btn) btn.classList.remove('on');
        return;
      }
      var a = new Audio(API + urls[i++]);
      currentAudio = a;
      a.onended = next;
      a.onerror = next;
      a.play().catch(function () { if (btn) btn.classList.remove('on'); });
    }
    next();
  }

  function attachSpeak(node, urls) {
    if (!urls || !urls.length) return;
    var b = el('button', 'bjl-spk');
    b.type = 'button';
    b.innerHTML = svgIcon(IC.play, 12) + ' <span>' + esc(t('hearIt')) + '</span>';
    b.addEventListener('click', function () {
      if (b.classList.contains('on')) { stopAudio(); return; }
      playChunks(urls, b);
    });
    // No <br>: inside a rich bubble the block flow already owns the spacing,
    // and a line break there would sit on top of the rule's own margin.
    if (!node.classList.contains('bjl-rich')) node.appendChild(document.createElement('br'));
    node.appendChild(b);
  }

  // canned = the student tapped a chip or a fossil row rather than typing, so
  // the server may serve its prebaked answer even mid-conversation.

  // The student's own Convex session, as StudentAuthContext stores it. The
  // widget never read this before, so every /chat turn was authenticated by
  // nothing but a slug in the body, which meant naming someone loaded their
  // profile, and would have meant booking on their account. Sending the real
  // token lets the server verify who is actually asking.
  function studentToken() {
    try {
      var raw = window.localStorage.getItem('em-student-session');
      if (!raw) return '';
      return (JSON.parse(raw) || {}).sessionToken || '';
    } catch (e) { return ''; }
  }

  function send(text, canned) {
    if (busy || !text) return;
    var slug = currentSlug();
    if (!slug) { sysMsg(els.chat, t('noSlug')); return; }
    addMsg('user', text);
    history.push({ role: 'user', content: text });
    busy = true;
    setSendState();
    typing(true);

    var ctrl = window.AbortController ? new AbortController() : null;
    clearTimeout(chatTimer);
    var timedOut = false;
    if (ctrl) chatTimer = setTimeout(function () { timedOut = true; ctrl.abort(); }, CHAT_TIMEOUT_MS);

    fetch(API + '/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: ctrl ? ctrl.signal : undefined,
      body: JSON.stringify({
        student_id: slug,
        message: text,
        history: history.slice(-MAX_HISTORY, -1),
        voice: voiceId(),
        admin_mode: isAdmin(),
        canned: !!canned,
        student_session_token: studentToken()
      })
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        typing(false);
        var reply = d && (d.reply || d.text) || '';
        if (!reply) { failLast(t('noReply'), text, canned); return; }
        // Trailers wait for the reveal to finish, otherwise the speak button
        // and the clips sit under a half-written answer.
        var node = addMsg('assistant', reply, function () {
          attachSpeak(node, d.audio_chunks);
          var yg = renderYouglish(d.youglish);
          if (yg) { els.chat.appendChild(rise(yg)); }
          scroll();
        });
        history.push({ role: 'assistant', content: reply });
      })
      .catch(function () {
        typing(false);
        failLast(timedOut ? t('timeout') : t('offline'), text, canned);
      })
      .finally(function () { clearTimeout(chatTimer); busy = false; setSendState(); });
  }

  // A failed turn is popped from history (the server never saw it) and the
  // student gets one button that sends the same message again.
  function failLast(msg, text, canned) {
    if (history.length && history[history.length - 1].role === 'user') history.pop();
    sysMsg(els.chat, msg, function () { send(text, canned); });
  }

  // ── Voice ────────────────────────────────────────────────────────────────
  // Three ways out of a recording, because people try all of them: HOLD and
  // release to send, TAP once to start and again to send, or slide the finger
  // off the button (or press Esc) to CANCEL. Anything shorter than HOLD_MS is
  // treated as a tap, which is what a normal click is.
  function bindHold(btn, target) {
    var pressActive = false, pressAt = 0, pid = null;
    var CANCEL_PX = 44;   // how far off the button the pointer must be to arm cancel

    function outside(e) {
      var r = btn.getBoundingClientRect();
      var dx = Math.max(r.left - e.clientX, 0, e.clientX - r.right);
      var dy = Math.max(r.top - e.clientY, 0, e.clientY - r.bottom);
      return Math.sqrt(dx * dx + dy * dy) > CANCEL_PX;
    }

    function start(e) {
      if (e.button != null && e.button !== 0) return;
      e.preventDefault();
      if (busy) return;
      if (recording) {          // second tap: stop and send
        wantRec = false;
        endRec();
        return;
      }
      pressActive = true;
      pressAt = Date.now();
      pid = e.pointerId;
      try { btn.setPointerCapture(pid); } catch (err) { /* older browsers */ }
      wantRec = true;
      cancelRec = false;
      beginRec(target, btn);
    }

    function move(e) {
      if (!pressActive || !recording) return;
      var off = outside(e);
      if (off !== cancelRec) setCancelState(off);
    }

    function stop(e) {
      if (e) e.preventDefault();
      if (!pressActive) return;
      pressActive = false;
      try { if (pid != null) btn.releasePointerCapture(pid); } catch (err) { /* not captured */ }
      pid = null;
      if (cancelRec) {          // slid off: discard, whatever the timing
        wantRec = false;
        endRec(true);
        return;
      }
      if (!wantRec) return;
      if (Date.now() - pressAt >= HOLD_MS) {
        wantRec = false;        // it was a hold, so release means send
        endRec();
      } else {
        setRecHint(t('tapStop'));  // it was a tap: keep recording until the next tap
      }
    }

    function lost() {           // capture lost (e.g. alt-tab mid-hold): treat as cancel
      if (!pressActive) return;
      pressActive = false;
      wantRec = false;
      endRec(true);
    }

    if (window.PointerEvent) {
      btn.addEventListener('pointerdown', start);
      btn.addEventListener('pointermove', move);
      btn.addEventListener('pointerup', stop);
      btn.addEventListener('pointercancel', lost);
      btn.addEventListener('lostpointercapture', function () { if (pressActive) lost(); });
    } else {
      btn.addEventListener('mousedown', start);
      btn.addEventListener('touchstart', start, { passive: false });
      ['mouseup', 'mouseleave', 'touchend', 'touchcancel'].forEach(function (ev) { btn.addEventListener(ev, stop); });
    }
    // Keyboard: Space/Enter toggles tap-mode recording, so the drill is usable
    // without a pointer at all.
    btn.addEventListener('keydown', function (e) {
      if (e.key !== ' ' && e.key !== 'Enter') return;
      e.preventDefault();
      if (recording) { wantRec = false; endRec(); return; }
      if (busy) return;
      wantRec = true; cancelRec = false;
      beginRec(target, btn);
      setRecHint(t('tapStop'));
    });
  }

  function setCancelState(on) {
    cancelRec = on;
    if (orbBtn) orbBtn.classList.toggle('cancel', on);
    if (els.recbar) els.recbar.classList.toggle('cancel', on);
    if (orb) { if (on) orb.setMode('cancel'); else orb.setColor('#FB7185'); }
    setRecHint(on ? t('releaseCancel') : t('releaseSend'));
  }
  function setRecHint(s) { if (els.rechint) els.rechint.textContent = s; }

  // ── Level meter: one AnalyserNode on the live stream. Drives the orb when it
  // is there and the CSS ring when it is not, so the fallback is the same
  // instrument in 2D.
  function startMeter(stream, btn) {
    stopMeter();
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    var ctx, analyser, data;
    try {
      ctx = new AC();
      var src = ctx.createMediaStreamSource(stream);
      analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      data = new Uint8Array(analyser.fftSize);
    } catch (e) { return; }
    var ring = btn && btn.querySelector('.bjl-lvl');
    var raf = null;
    function tick() {
      raf = requestAnimationFrame(tick);
      analyser.getByteTimeDomainData(data);
      var sum = 0;
      for (var i = 0; i < data.length; i += 4) { var v = (data[i] - 128) / 128; sum += v * v; }
      var rms = Math.sqrt(sum / (data.length / 4));
      var level = Math.min(1, rms * 4.5);
      if (orb) orb.setLevel(level);
      else if (ring && !REDUCED) ring.style.transform = 'scale(' + (0.9 + level * 0.45).toFixed(3) + ')';
    }
    raf = requestAnimationFrame(tick);
    meter = {
      stop: function () {
        if (raf) cancelAnimationFrame(raf);
        try { ctx.close(); } catch (e) { /* already closed */ }
        if (ring) ring.style.transform = '';
      }
    };
  }
  function stopMeter() { if (meter) { meter.stop(); meter = null; } }

  // ── Orb: three.js, fetched the first time the mic is used. Any failure
  // (offline vendor file, no WebGL, reduced motion) leaves orbDisabled set and
  // the CSS ring does the job from then on.
  function hasWebGL() {
    try {
      var c = document.createElement('canvas');
      return !!(c.getContext('webgl2') || c.getContext('webgl'));
    } catch (e) { return false; }
  }
  function loadOrb() {
    if (orbModule) return Promise.resolve(orbModule);
    if (orbDisabled || REDUCED || !hasWebGL()) { orbDisabled = true; return Promise.resolve(null); }
    if (!orbLoad) {
      orbLoad = import(ORB_URL).then(function (m) {
        orbModule = m;
        return m;
      }).catch(function () { orbDisabled = true; return null; });
    }
    return orbLoad;
  }
  function mountOrb(btn) {
    loadOrb().then(function (m) {
      if (!m || !recording || orbBtn !== btn) return;
      var host = btn.querySelector('.bjl-orb');
      if (!host || orb) return;
      try {
        orb = m.createOrb(host, { size: btn.clientWidth || 40, color: '#FB7185', onLost: function () { disposeOrb(); orbDisabled = true; } });
      } catch (e) { orb = null; orbDisabled = true; }
      if (!orb) return;
      orbHost = host;
      btn.classList.add('bjl-orb-on');
    });
  }
  // After a drill the orb holds the verdict colour long enough to be read,
  // then gets out of the way and gives the button its icon back.
  function settleOrb(hex) {
    if (!orb || !orbBtn) return;
    orb.setColor(hex);
    orbBtn.classList.remove('wait');
    clearTimeout(orbTimer);
    orbTimer = setTimeout(disposeOrb, 2200);
  }
  function disposeOrb() {
    clearTimeout(orbTimer);
    if (orbBtn) { orbBtn.classList.remove('bjl-orb-on'); orbBtn.classList.remove('wait'); orbBtn.classList.remove('cancel'); }
    if (orb) { try { orb.dispose(); } catch (e) { /* context already gone */ } }
    orb = null; orbHost = null; orbBtn = null;
  }

  function beginRec(target, btn) {
    if (recording || starting || busy) return;
    if (!navigator.mediaDevices || !window.MediaRecorder) {
      sysMsg(els.chat, t('noMic'));
      return;
    }
    starting = true;
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      starting = false;
      // THE RACE: getUserMedia is async, so on a normal click the release fires
      // before the stream arrives. Without this check the recorder starts after
      // the user has already let go and nothing ever stops it: the mic stays
      // live, the button pulses forever and no reply comes.
      if (!wantRec) {
        stream.getTracks().forEach(function (tr) { tr.stop(); });
        return;
      }
      recording = true;
      drillMode = target || null;
      disposeOrb();
      orbBtn = btn || els.mic;
      if (orbBtn) orbBtn.classList.add('rec');
      if (els.mic && orbBtn !== els.mic) els.mic.classList.add('rec');
      els.ft.classList.add('bjl-rec-on');
      els.recbar.classList.remove('cancel');
      setRecHint(t('releaseSend'));
      startRecClock();
      startMeter(stream, orbBtn);
      mountOrb(orbBtn);
      chunks = [];
      var rec = mediaRecorder = new MediaRecorder(stream);
      mediaRecorder.ondataavailable = function (e) { if (e.data.size) chunks.push(e.data); };
      mediaRecorder.onstop = function () {
        stream.getTracks().forEach(function (tr) { tr.stop(); });
        var discarded = !!rec.__cancel;
        stopMeter();
        stopRecClock();
        els.ft.classList.remove('bjl-rec-on');
        if (btn) btn.classList.remove('rec');
        if (els.mic) els.mic.classList.remove('rec');
        if (discarded || !target) { disposeOrb(); }
        else if (orbBtn) { orbBtn.classList.add('wait'); if (orb) orb.setMode('wait'); }
        if (discarded) { sysMsg(els.chat, t('cancelled')); return; }
        sendVoice(new Blob(chunks, { type: 'audio/webm' }), target);
      };
      mediaRecorder.start();
      // Hard ceiling. Whatever else goes wrong, the mic cannot stay open.
      clearTimeout(stopTimer);
      stopTimer = setTimeout(function () {
        if (recording) { wantRec = false; endRec(); }
      }, MAX_REC_MS);
    }).catch(function () {
      starting = false;
      wantRec = false;
      sysMsg(els.chat, t('micPerm'));
    });
  }

  function endRec(discard) {
    clearTimeout(stopTimer);
    if (!recording || !mediaRecorder) return;
    recording = false;
    cancelRec = false;
    if (els.recbar) els.recbar.classList.remove('cancel');
    mediaRecorder.__cancel = !!discard;
    var mr = mediaRecorder;
    try { mr.stop(); } catch (e) { mr.__cancel = true; if (mr.onstop) mr.onstop(); }
    mediaRecorder = null;
  }

  function startRecClock() {
    var t0 = Date.now();
    els.rectime.textContent = '0:00';
    clearInterval(recTick);
    recTick = setInterval(function () {
      var s = Math.floor((Date.now() - t0) / 1000);
      els.rectime.textContent = Math.floor(s / 60) + ':' + (s % 60 < 10 ? '0' : '') + (s % 60);
    }, 250);
  }
  function stopRecClock() { clearInterval(recTick); recTick = null; }

  function sendVoice(blob, target) {
    if (!blob || blob.size < 1200) {
      // Previously returned silently, so a short clip looked like a dead button.
      disposeOrb();
      sysMsg(els.chat, t('tooShort'));
      return;
    }
    var slug = currentSlug();
    if (!slug) { disposeOrb(); sysMsg(els.chat, t('noSlug')); return; }
    busy = true;
    setSendState();
    var res = document.getElementById('bjl-drill-res');
    if (target && res) res.innerHTML = '<div class="bjl-hint">' + esc(t('listeningBack')) + '</div>';
    else typing(true);

    var fd = new FormData();
    fd.append('audio', blob, 'a.webm');
    fd.append('student_id', slug);
    fd.append('voice', voiceId());
    fd.append('history', JSON.stringify(history.slice(-MAX_HISTORY)));
    fd.append('student_session_token', studentToken());
    if (target) {
      fd.append('mode', 'pronunciation_drill');
      fd.append('pronunciation_target', target);
    }

    fetch(API + '/voice', { method: 'POST', body: fd })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        typing(false);
        if (target && d && d.scored) {
          var box = document.getElementById('bjl-drill-res');
          if (box) renderScore(box, d.scored, d.reply, d.youglish); else disposeOrb();
          playChunks(d.audio_chunks);
          return;
        }
        disposeOrb();
        if (d && d.transcript) { addMsg('user', d.transcript); history.push({ role: 'user', content: d.transcript }); }
        if (d && d.reply) {
          var node = addMsg('assistant', d.reply, function () {
            attachSpeak(node, d.audio_chunks);
          });
          history.push({ role: 'assistant', content: d.reply });
          playChunks(d.audio_chunks);   // audio starts with the reveal, not after
        } else if (!(d && d.transcript)) {
          sysMsg(els.chat, t('notHeard'));
        }
      })
      .catch(function () {
        typing(false);
        disposeOrb();
        if (target && res) res.innerHTML = '';
        sysMsg(els.chat, t('notHeard'));
      })
      .finally(function () { busy = false; setSendState(); });
  }

  function setSendState() {
    if (!els.send) return;
    els.send.disabled = busy || !els.input.value.trim();
  }

  // ── Build ────────────────────────────────────────────────────────────────
  function build() {
    var root = el('div', 'bjl-root');

    var panel = el('div', 'bjl-panel');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', t('dialog'));
    panel.id = 'bjl-panel';

    var hd = el('div', 'bjl-hd');
    var av = el('div', 'bjl-av');
    av.innerHTML = '<img src="/brand/em-bajla-icon.webp" alt="">';
    hd.appendChild(av);
    var who = el('div');
    who.style.cssText = 'flex:1;min-width:0';
    els.name = el('div', 'bjl-name', t('name'));
    who.appendChild(els.name);
    els.sub = el('div', 'bjl-sub', t('sub'));
    who.appendChild(els.sub);
    hd.appendChild(who);
    els.nav = el('button', 'bjl-x bjl-nav');
    els.nav.type = 'button';
    els.nav.addEventListener('click', function () { showView(view === 'chat' ? 'home' : 'chat'); });
    hd.appendChild(els.nav);
    els.x = el('button', 'bjl-x');
    els.x.type = 'button';
    els.x.setAttribute('aria-label', t('close'));
    els.x.innerHTML = svgIcon(IC.close, 19);
    els.x.addEventListener('click', function () { toggle(false); });
    hd.appendChild(els.x);
    panel.appendChild(hd);

    els.body = el('div', 'bjl-body');
    els.home = el('div', 'bjl-view');
    els.chat = el('div', 'bjl-view');
    els.chat.hidden = true;
    els.body.appendChild(els.home);
    els.body.appendChild(els.chat);
    panel.appendChild(els.body);
    watchScroll();
    els.live = el('div', 'bjl-sr');
    els.live.setAttribute('aria-live', 'polite');
    els.live.setAttribute('aria-atomic', 'true');
    panel.appendChild(els.live);

    var ft = el('div', 'bjl-ft');
    els.ft = ft;
    els.input = el('textarea', 'bjl-in');
    els.input.rows = 1;
    els.input.placeholder = t('placeholder');
    els.input.setAttribute('aria-label', t('placeholder'));
    els.input.addEventListener('input', function () {
      this.style.height = 'auto';
      this.style.height = Math.min(110, this.scrollHeight) + 'px';
      setSendState();
    });
    els.input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        submit();
      }
    });
    ft.appendChild(els.input);

    // Recording bar: sits over the textarea only while the mic is live.
    els.recbar = el('div', 'bjl-recbar');
    els.recbar.setAttribute('role', 'status');
    els.recbar.appendChild(el('span', 'bjl-recdot'));
    els.rectime = el('span', 'bjl-rectime', '0:00');
    els.recbar.appendChild(els.rectime);
    els.rechint = el('span', 'bjl-rechint', t('releaseSend'));
    els.recbar.appendChild(els.rechint);
    ft.appendChild(els.recbar);

    els.mic = micButton('bjl-btn ghost', t('mic'), 19);
    bindHold(els.mic, null);
    ft.appendChild(els.mic);

    els.send = el('button', 'bjl-btn bjl-send');
    els.send.type = 'button';
    els.send.setAttribute('aria-label', t('send'));
    els.send.innerHTML = svgIcon(IC.send, 18);
    els.send.disabled = true;
    els.send.addEventListener('click', submit);
    ft.appendChild(els.send);
    panel.appendChild(ft);

    var fab = el('button', 'bjl-fab');
    fab.type = 'button';
    fab.setAttribute('aria-label', t('openFab'));
    fab.setAttribute('aria-expanded', 'false');
    fab.setAttribute('aria-controls', 'bjl-panel');
    fab.innerHTML = '<span class="bjl-halo" aria-hidden="true"></span><img src="/brand/em-bajla-icon.webp" alt="">' +
      '<span class="bjl-fab-x" aria-hidden="true">' + svgIcon(IC.down, 26) + '</span><span class="bjl-badge" aria-hidden="true"></span>';
    fab.addEventListener('click', function () { toggle(); });

    root.appendChild(panel);
    root.appendChild(fab);
    document.body.appendChild(root);
    els.root = root; els.panel = panel; els.fab = fab;
  }

  function submit() {
    var v = els.input.value.trim();
    if (!v || busy) return;
    els.input.value = '';
    els.input.style.height = 'auto';
    setSendState();
    send(v);
  }

  // Static strings repainted when the language toggle is used with the panel
  // already built. Content already in the transcript stays as it was said.
  function relabel() {
    langActive = currentLang();
    L = STR[langActive];
    els.panel.setAttribute('aria-label', t('dialog'));
    els.name.textContent = t('name');
    els.sub.textContent = profile ? t('knows', profile.lessons, profile.cefr || '') : t('sub');
    els.x.setAttribute('aria-label', t('close'));
    els.input.placeholder = t('placeholder');
    els.input.setAttribute('aria-label', t('placeholder'));
    els.mic.setAttribute('aria-label', t('mic'));
    els.send.setAttribute('aria-label', t('send'));
    setUnread(unread);
    showView(view);
    if (view === 'home' || !els.chat.children.length) renderHome();
  }

  function loadStudent(slug) {
    loadedFor = slug;
    history = [];
    profile = null;
    profileFailed = false;
    els.chat.innerHTML = '';
    els.panel.classList.remove('bjl-has-chat');
    showView('home');
    renderHome();
    loadProfile(slug).then(function (p) {
      if (loadedFor !== slug) return;
      profile = p;
      profileFailed = !p;
      if (p) els.sub.textContent = t('knows', p.lessons, p.cefr || '');
      renderHome();
    });

    // Anything left for this student while they were away. The panel is
    // request/response with no push, and it wipes its history on open, so
    // before this there was NO route for an answer to reach a student:
    // an escalation to Mike was a dead end in both directions.
    // Delivered once; the server consumes it as it hands it over.
    fetch(API + '/pending/' + encodeURIComponent(slug)
          + '?token=' + encodeURIComponent(studentToken()))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || !d.message || loadedFor !== slug) return;
        addMsg('assistant', d.message);
        history.push({ role: 'assistant', content: d.message });
      })
      .catch(function () { /* never block the panel on this */ });
  }

  function toggle(want) {
    var next = typeof want === 'boolean' ? want : !open;
    if (next === open) return;
    open = next;
    clearTimeout(closeTimer);
    els.root.classList.toggle('bjl-open', open);
    els.fab.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
      lastFocus = document.activeElement;
      setUnread(false);
      var slug = currentSlug();
      if (slug && slug !== loadedFor) loadStudent(slug);
      else if (!slug) { els.home.innerHTML = ''; sysMsg(els.home, t('noSlug')); }
      syncViewport();
      // A phone keyboard would cover half the sheet the moment it opens, so
      // the composer only takes focus where there is a physical keyboard.
      if (HOVER_OK) setTimeout(function () { els.input.focus({ preventScroll: true }); }, REDUCED ? 0 : 160);
    } else {
      els.fab.setAttribute('aria-label', unread ? t('unread') : t('openFab'));
      if (recording) { wantRec = false; endRec(true); }
      stopAudio();
      disposeOrb();
      if (lastFocus && lastFocus.focus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
      else els.fab.focus({ preventScroll: true });
    }
  }

  // ── Phone keyboard: size the sheet to the visual viewport so the composer
  // stays above the keyboard and the page underneath never jumps.
  function syncViewport() {
    var vv = window.visualViewport;
    if (!vv || !els.root) return;
    if (window.innerWidth > 480) {
      els.root.style.removeProperty('--bjl-vvh');
      els.root.style.removeProperty('--bjl-vvt');
      return;
    }
    els.root.style.setProperty('--bjl-vvh', Math.round(vv.height) + 'px');
    els.root.style.setProperty('--bjl-vvt', Math.round(vv.offsetTop) + 'px');
  }

  // Tab stays inside the open panel; the page behind is still there, but a
  // reader or keyboard user should not fall out of the dialog by accident.
  function trapTab(e) {
    if (!open || e.key !== 'Tab') return;
    var nodes = els.panel.querySelectorAll('button:not([disabled]),textarea,[tabindex="0"],iframe,a[href]');
    var list = Array.prototype.filter.call(nodes, function (n) { return n.offsetParent !== null || n === els.input; });
    if (!list.length) return;
    var first = list[0], last = list[list.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    else if (!els.panel.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
  }

  // ── Boot ─────────────────────────────────────────────────────────────────
  function boot() {
    if (!currentSlug()) return;   // not a student context: render nothing
    injectCSS();
    build();
    // Product surfaces can hand a completed activity to Bajla without
    // duplicating chat UI. The custom event opens the existing tutor and can
    // optionally send a contextual coaching prompt.
    window.addEventListener('bajla:open', function (event) {
      var detail = event && event.detail || {};
      if (!open) toggle(true);
      if (detail.prompt) {
        window.setTimeout(function () { send(String(detail.prompt), false); }, 180);
      }
    });
    window.BajlaTutor = {
      open: function (detail) {
        window.dispatchEvent(new CustomEvent('bajla:open', { detail: detail || {} }));
      }
    };
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (recording) { e.preventDefault(); wantRec = false; endRec(true); return; }
        if (open) { e.preventDefault(); toggle(false); }
        return;
      }
      trapTab(e);
    });
    // Language and theme both arrive as attributes on <html>; the theme is
    // pure CSS, the language needs the strings repainted.
    if (window.MutationObserver) {
      new MutationObserver(function () {
        if (currentLang() !== langActive) relabel();
      }).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
    }
    window.addEventListener('storage', function (e) {
      if (e.key === 'em.lang.v2' && currentLang() !== langActive) relabel();
    });
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', syncViewport);
      window.visualViewport.addEventListener('scroll', syncViewport);
    }
    // Leaving the tab mid-recording must not leave the mic open behind it.
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && recording) { wantRec = false; endRec(true); }
    });
    window.addEventListener('pagehide', function () { if (recording) endRec(true); disposeOrb(); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
