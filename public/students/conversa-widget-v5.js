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
  var REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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
  var open = false, busy = false, recording = false;
  var history = [], profile = null, loadedFor = null;
  var mediaRecorder = null, chunks = [], currentAudio = null, drillMode = null;
  var wantRec = false, starting = false, stopTimer = null;
  var HOLD_MS = 350;        // shorter than this is a tap, not a hold
  var MAX_REC_MS = 20000;   // hard ceiling so the mic can never stay open
  var els = {};

  // ── Styles ───────────────────────────────────────────────────────────────
  var CSS = [
    '.bjl-root{position:fixed;right:20px;bottom:calc(20px + env(safe-area-inset-bottom));z-index:2147483000;font-family:"Space Grotesk",Inter,system-ui,sans-serif}',
    '.bjl-fab{width:60px;height:60px;border-radius:50%;border:none;cursor:pointer;padding:0;position:relative;',
    'background:linear-gradient(135deg,#8B5CF6 0%,#D946EF 55%,#F472B6 100%);',
    'box-shadow:0 14px 40px -10px rgba(217,70,239,.55),0 6px 16px -6px rgba(0,0,0,.4);',
    'display:flex;align-items:center;justify-content:center;transition:transform .28s cubic-bezier(.34,1.56,.64,1)}',
    '.bjl-fab:hover{transform:translateY(-3px) scale(1.04)}',
    '.bjl-fab:active{transform:scale(.96)}',
    // The brand icon is a full-bleed plate, so it fills the button and the
    // circle does the cropping; a contained 42px version would float inside a
    // gradient ring and read as two competing marks.
    '.bjl-fab img{width:100%;height:100%;border-radius:50%;object-fit:cover;display:block}',
    '.bjl-halo{position:absolute;inset:-5px;border-radius:50%;border:2px solid rgba(217,70,239,.55);opacity:0;pointer-events:none}',
    '.bjl-live .bjl-halo{animation:bjlHalo 2.8s ease-out infinite}',
    '@keyframes bjlHalo{0%{transform:scale(.92);opacity:.75}70%{transform:scale(1.25);opacity:0}100%{opacity:0}}',
    '.bjl-panel{position:absolute;right:0;bottom:76px;width:min(392px,calc(100vw - 28px));',
    'height:min(624px,calc(100vh - 150px));border-radius:22px;overflow:hidden;display:flex;flex-direction:column;',
    'background:linear-gradient(180deg,rgba(24,15,50,.985),rgba(11,7,26,.985));',
    'border:1px solid rgba(255,255,255,.16);box-shadow:0 30px 90px -30px rgba(139,92,246,.5),0 8px 28px -12px rgba(0,0,0,.75);',
    'animation:bjlIn .26s cubic-bezier(.16,1,.3,1)}',
    '@keyframes bjlIn{from{opacity:0;transform:translateY(14px) scale(.97)}to{opacity:1;transform:none}}',
    '.bjl-hd{display:flex;align-items:center;gap:11px;padding:14px 15px;border-bottom:1px solid rgba(255,255,255,.09);',
    'background:radial-gradient(ellipse 70% 120% at 12% 0%,rgba(217,70,239,.20),transparent 70%)}',
    '.bjl-av{width:38px;height:38px;border-radius:12px;flex:0 0 auto;display:flex;align-items:center;justify-content:center;',
    'background:linear-gradient(135deg,#8B5CF6,#D946EF 55%,#F472B6);box-shadow:0 0 0 1px rgba(217,70,239,.45),0 0 30px -6px rgba(217,70,239,.55)}',
    '.bjl-av img{width:100%;height:100%;border-radius:12px;object-fit:cover;display:block}',
    '.bjl-name{font-size:14.5px;font-weight:600;color:#F4F0FF;letter-spacing:-.01em;line-height:1.2}',
    '.bjl-sub{font-size:11px;color:#8A83AE;margin-top:2px;line-height:1.3}',
    '.bjl-x{background:transparent;border:none;color:#8A83AE;cursor:pointer;padding:5px;border-radius:9px;line-height:0;transition:color .18s,background .18s}',
    '.bjl-x:hover{color:#F4F0FF;background:rgba(255,255,255,.07)}',
    '.bjl-body{flex:1;overflow-y:auto;overflow-x:hidden;padding:15px;display:flex;flex-direction:column;gap:13px;scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.16) transparent}',
    '.bjl-body::-webkit-scrollbar{width:7px}.bjl-body::-webkit-scrollbar-thumb{background:rgba(255,255,255,.14);border-radius:4px}',
    '.bjl-greet{font-size:19px;font-weight:600;color:#F4F0FF;letter-spacing:-.02em;line-height:1.25}',
    '.bjl-greet em{font-style:normal;background:linear-gradient(135deg,#A855F7,#D946EF 55%,#F472B6);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}',
    '.bjl-lede{font-size:12.5px;color:#CEC8E8;line-height:1.55;margin-top:-4px}',
    // ── Section shell
    '.bjl-card{border:1px solid rgba(255,255,255,.10);border-radius:15px;padding:13px;',
    'background:linear-gradient(180deg,rgba(255,255,255,.055),rgba(255,255,255,.02))}',
    '.bjl-ttl{font-size:10.5px;font-weight:600;letter-spacing:.09em;text-transform:uppercase;color:#8A83AE;display:flex;align-items:center;gap:6px;margin-bottom:11px}',
    '.bjl-ttl b{color:#F0ABFC;font-weight:600}',
    // ── Fossil strip
    '.bjl-fos{display:flex;flex-direction:column;gap:9px}',
    '.bjl-fr{display:grid;grid-template-columns:1fr;gap:4px;cursor:pointer;border-radius:9px;padding:4px;margin:-4px;transition:background .18s}',
    '.bjl-fr:hover{background:rgba(255,255,255,.05)}',
    '.bjl-fl{display:flex;align-items:baseline;justify-content:space-between;gap:8px}',
    '.bjl-fn{font-size:12.5px;color:#F4F0FF;font-weight:500;letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.bjl-fc{font-size:10.5px;color:#8A83AE;flex:0 0 auto;font-variant-numeric:tabular-nums}',
    '.bjl-tr{position:relative;height:7px;border-radius:4px;background:rgba(255,255,255,.07);overflow:hidden}',
    '.bjl-bar{position:absolute;top:0;bottom:0;border-radius:4px;background:linear-gradient(90deg,#8B5CF6,#D946EF);transform-origin:left;}',
    '.bjl-bar.on{background:linear-gradient(90deg,#D946EF,#FB7185);box-shadow:0 0 14px -2px rgba(217,70,239,.85)}',
    '.bjl-live-dot{position:absolute;right:-1px;top:50%;width:7px;height:7px;margin-top:-3.5px;border-radius:50%;background:#FB7185;box-shadow:0 0 9px rgba(251,113,133,.9)}',
    '.bjl-fscale{display:flex;justify-content:space-between;font-size:9.5px;color:#5E567C;margin-top:3px;font-variant-numeric:tabular-nums}',
    // ── Say-it
    '.bjl-word{font-size:23px;font-weight:600;color:#F4F0FF;letter-spacing:-.02em;line-height:1.15}',
    '.bjl-ipa{font-family:"JetBrains Mono",ui-monospace,monospace;font-size:12px;color:#F0ABFC;margin-top:3px}',
    '.bjl-tra{font-size:11.5px;color:#8A83AE;margin-top:3px}',
    '.bjl-mic{width:52px;height:52px;border-radius:50%;border:none;cursor:pointer;flex:0 0 auto;color:#fff;',
    'background:linear-gradient(135deg,#8B5CF6,#D946EF 55%,#F472B6);display:flex;align-items:center;justify-content:center;',
    'box-shadow:0 8px 26px -8px rgba(217,70,239,.75);transition:transform .2s cubic-bezier(.34,1.56,.64,1)}',
    '.bjl-mic:hover{transform:scale(1.06)}',
    '.bjl-mic.rec{background:linear-gradient(135deg,#FB7185,#E11D48);animation:bjlRec 1.1s ease-in-out infinite}',
    '@keyframes bjlRec{0%,100%{box-shadow:0 0 0 0 rgba(251,113,133,.6)}50%{box-shadow:0 0 0 13px rgba(251,113,133,0)}}',
    '.bjl-hint{font-size:10.5px;color:#5E567C;text-align:center;margin-top:9px}',
    // ── Score readout
    '.bjl-score{display:flex;align-items:center;gap:13px}',
    '.bjl-ring{width:58px;height:58px;flex:0 0 auto;position:relative}',
    '.bjl-ring svg{transform:rotate(-90deg)}',
    '.bjl-ringv{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:600;color:#F4F0FF;font-variant-numeric:tabular-nums}',
    '.bjl-words{display:flex;flex-wrap:wrap;gap:5px}',
    '.bjl-w{font-size:12px;padding:3px 8px;border-radius:7px;border:1px solid transparent;line-height:1.3}',
    '.bjl-w.correct{background:rgba(52,211,153,.14);color:#6EE7B7;border-color:rgba(52,211,153,.3)}',
    '.bjl-w.slip{background:rgba(251,113,133,.15);color:#FDA4AF;border-color:rgba(251,113,133,.36)}',
    '.bjl-w.close{background:rgba(252,211,77,.14);color:#FDE68A;border-color:rgba(252,211,77,.3)}',
    '.bjl-w.wrong,.bjl-w.missed{background:rgba(255,255,255,.05);color:#8A83AE;border-color:rgba(255,255,255,.12);text-decoration:line-through}',
    '.bjl-slip{margin-top:10px;padding:10px;border-radius:11px;border:1px solid rgba(251,113,133,.26);background:rgba(251,113,133,.08)}',
    '.bjl-slip b{color:#FDA4AF;font-size:11.5px;display:block;margin-bottom:3px}',
    '.bjl-slip span{font-size:11.5px;color:#CEC8E8;line-height:1.5}',
    // ── YouGlish player (inline, X-style: poster -> iframe in place)
    '.bjl-yg{margin-top:10px;border-radius:13px;overflow:hidden;border:1px solid rgba(255,255,255,.12);background:rgba(0,0,0,.35)}',
    '.bjl-ygp{position:relative;width:100%;aspect-ratio:16/9;background:#000;cursor:pointer;display:block;border:none;padding:0}',
    '.bjl-ygp img{width:100%;height:100%;object-fit:cover;display:block}',
    '.bjl-ygp:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.05),rgba(0,0,0,.45))}',
    '.bjl-play{position:absolute;left:50%;top:50%;width:52px;height:52px;margin:-26px 0 0 -26px;border-radius:50%;z-index:2;',
    'background:linear-gradient(135deg,#8B5CF6,#D946EF 55%,#F472B6);display:flex;align-items:center;justify-content:center;color:#fff;',
    'box-shadow:0 8px 26px -6px rgba(0,0,0,.65);transition:transform .2s cubic-bezier(.34,1.56,.64,1)}',
    '.bjl-ygp:hover .bjl-play{transform:scale(1.1)}',
    '.bjl-yg iframe{width:100%;aspect-ratio:16/9;border:0;display:block}',
    '.bjl-ygc{padding:9px 11px;font-size:11.5px;line-height:1.45;color:#CEC8E8;border-top:1px solid rgba(255,255,255,.08)}',
    '.bjl-ygc b{color:#F0ABFC;font-weight:600}',
    '.bjl-ygn{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 11px;border-top:1px solid rgba(255,255,255,.07)}',
    '.bjl-ygn button{background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);color:#CEC8E8;border-radius:8px;',
    'cursor:pointer;padding:3px 9px;font-size:11px;font-family:inherit;line-height:1.5}',
    '.bjl-ygn button:hover{color:#fff;border-color:rgba(217,70,239,.5)}',
    '.bjl-ygn span{font-size:10.5px;color:#8A83AE;font-variant-numeric:tabular-nums}',
    '.bjl-real{margin-top:9px;width:100%;padding:8px;border-radius:10px;cursor:pointer;font-family:inherit;font-size:11.5px;',
    'border:1px solid rgba(217,70,239,.35);background:rgba(217,70,239,.10);color:#F0ABFC;transition:background .18s}',
    '.bjl-real:hover{background:rgba(217,70,239,.18)}',
    'html[data-v3-mode="day"] .bjl-yg{border-color:rgba(16,10,40,.14);background:rgba(0,0,0,.06)}',
    'html[data-v3-mode="day"] .bjl-ygc{color:#2B2542;border-top-color:rgba(16,10,40,.09)}',
    'html[data-v3-mode="day"] .bjl-ygc b{color:#A21CAF}',
    'html[data-v3-mode="day"] .bjl-ygn{border-top-color:rgba(16,10,40,.08)}',
    'html[data-v3-mode="day"] .bjl-ygn button{background:rgba(16,10,40,.05);border-color:rgba(16,10,40,.12);color:#2B2542}',
    'html[data-v3-mode="day"] .bjl-ygn span{color:#5F5780}',
    // ── Chips
    '.bjl-chips{display:flex;flex-direction:column;gap:7px}',
    '.bjl-chip{width:100%;text-align:left;display:flex;align-items:center;gap:9px;padding:10px 12px;border-radius:12px;cursor:pointer;',
    'border:1px solid rgba(255,255,255,.11);background:linear-gradient(180deg,rgba(255,255,255,.05),rgba(255,255,255,.018));',
    'color:#F4F0FF;font-size:12.5px;font-family:inherit;line-height:1.4;transition:transform .18s cubic-bezier(.16,1,.3,1),border-color .18s,background .18s}',
    '.bjl-chip:hover{transform:translateX(3px);border-color:rgba(217,70,239,.5);background:rgba(217,70,239,.10)}',
    '.bjl-chip i{font-style:normal;font-size:15px;flex:0 0 auto;opacity:.95}',
    // ── Messages
    '.bjl-msg{max-width:86%;padding:10px 13px;border-radius:15px;font-size:13px;line-height:1.55;white-space:pre-wrap;word-break:break-word}',
    '.bjl-msg.me{align-self:flex-end;background:linear-gradient(135deg,#8B5CF6,#D946EF 55%,#F472B6);color:#fff;border-bottom-right-radius:5px}',
    '.bjl-msg.her{align-self:flex-start;background:rgba(255,255,255,.055);color:#F4F0FF;border:1px solid rgba(255,255,255,.09);border-bottom-left-radius:5px}',
    '.bjl-msg.sys{align-self:center;font-size:11px;color:#8A83AE;font-style:italic;background:none;border:none;text-align:center}',
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
    '.bjl-rich ul li::before{content:"";position:absolute;left:2px;top:.62em;width:4px;height:4px;border-radius:50%;background:#D946EF}',
    '.bjl-rich ol{counter-reset:bjl}',
    '.bjl-rich ol li{counter-increment:bjl}',
    // Line-height in px, not a ratio: the marker is smaller than the text, so
    // a ratio would give it a shorter line box and float the numeral upward.
    '.bjl-rich ol li::before{content:counter(bjl);position:absolute;left:0;top:0;font-size:12px;line-height:21px;font-weight:600;color:#D946EF;font-variant-numeric:tabular-nums}',
    '.bjl-rich strong{font-weight:600;color:#fff}',
    '.bjl-rich em{font-style:italic;color:#CDBBFF}',
    // Backticks carry the actual language being corrected — the one thing the
    // eye should land on first, so it gets a chip rather than just a font.
    // Deliberately NOT monospace. These are English phrases the student said,
    // not code — a mono face makes a language tutor read like a terminal. Body
    // font, tinted, with the outline as an inset shadow so the chip cannot
    // alter the line box it sits in.
    '.bjl-rich code{font-family:inherit;font-size:12.5px;font-weight:500;padding:1px 6px;border-radius:6px;',
    'background:rgba(217,70,239,.13);box-shadow:inset 0 0 0 1px rgba(217,70,239,.22);color:#FCE7FF;white-space:normal;',
    '-webkit-box-decoration-break:clone;box-decoration-break:clone}',
    '.bjl-rich a{color:#E879F9;text-decoration:underline;text-underline-offset:2px;text-decoration-thickness:1px;',
    'text-decoration-color:rgba(232,121,249,.45);transition:color .16s ease,text-decoration-color .16s ease}',
    '.bjl-rich a:hover{color:#F5B4FF;text-decoration-color:#F5B4FF}',
    // ── Streaming reveal.
    // Unrevealed words are display:none rather than transparent, so the bubble
    // genuinely GROWS as they land — that growth is what the autoscroll follows.
    // Reserving the full height up front would be smoother but dead still.
    '.bjl-blk{display:none}',
    '.bjl-blk.on{display:block;animation:bjlBlk .26s cubic-bezier(.16,1,.3,1) both}',
    '.bjl-rich li.bjl-blk.on{display:list-item}',
    '.bjl-wd{display:none}',
    '.bjl-wd.on{display:inline;animation:bjlWd .2s ease both}',
    // An inline wrapper draws its own chrome — a code chip's tint and outline —
    // even while every word inside it is still hidden, which reads as an empty
    // pill floating at the reveal edge. Hide the wrapper until it has content.
    '.bjl-inl{display:none}',
    '.bjl-inl.on{display:inline}',
    '@keyframes bjlBlk{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}',
    '@keyframes bjlWd{from{opacity:0}to{opacity:1}}',
    // The caret marks where she is mid-sentence; it goes when the reveal ends.
    '.bjl-rich.streaming>*:last-child::after{content:"";display:inline-block;width:2px;height:.95em;',
    'margin-left:2px;vertical-align:-.12em;background:#D946EF;animation:bjlCaret .9s steps(1) infinite}',
    '@keyframes bjlCaret{0%,55%{opacity:1}56%,100%{opacity:0}}',
    '@media (prefers-reduced-motion:reduce){.bjl-blk,.bjl-wd,.bjl-inl{display:revert!important;animation:none!important}',
    '.bjl-rich.streaming>*:last-child::after{display:none}}',
    '.bjl-typing{align-self:flex-start;display:flex;gap:4px;padding:11px 14px;background:rgba(255,255,255,.055);border-radius:15px;border:1px solid rgba(255,255,255,.09)}',
    '.bjl-typing i{width:6px;height:6px;border-radius:50%;background:#D946EF;animation:bjlDot 1.3s ease-in-out infinite}',
    '.bjl-typing i:nth-child(2){animation-delay:.18s}.bjl-typing i:nth-child(3){animation-delay:.36s}',
    '@keyframes bjlDot{0%,60%,100%{opacity:.28;transform:translateY(0)}30%{opacity:1;transform:translateY(-4px)}}',
    '.bjl-spk{display:inline-flex;align-items:center;gap:4px;margin-top:7px;font-size:10.5px;color:#8A83AE;cursor:pointer;background:none;border:none;padding:0;font-family:inherit}',
    '.bjl-spk:hover{color:#F0ABFC}',
    // ── Composer
    '.bjl-ft{padding:11px;border-top:1px solid rgba(255,255,255,.09);display:flex;gap:7px;align-items:flex-end;background:rgba(255,255,255,.022)}',
    '.bjl-in{flex:1;resize:none;max-height:110px;padding:10px 13px;border-radius:13px;background:rgba(255,255,255,.06);',
    'border:1px solid rgba(255,255,255,.12);color:#F4F0FF;font-family:inherit;font-size:13px;line-height:1.45;outline:none;transition:border-color .18s}',
    '.bjl-in:focus{border-color:rgba(217,70,239,.6)}',
    '.bjl-in::placeholder{color:#5E567C}',
    '.bjl-btn{flex:0 0 auto;width:40px;height:40px;border:none;border-radius:13px;cursor:pointer;color:#fff;',
    'background:linear-gradient(135deg,#8B5CF6,#D946EF 55%,#F472B6);display:flex;align-items:center;justify-content:center;transition:transform .18s,opacity .18s}',
    '.bjl-btn:hover{transform:scale(1.06)}.bjl-btn:disabled{opacity:.42;cursor:not-allowed;transform:none}',
    '.bjl-btn.ghost{background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.13)}',
    '.bjl-btn.ghost.rec{background:linear-gradient(135deg,#FB7185,#E11D48);border-color:transparent;animation:bjlRec 1.1s ease-in-out infinite}',
    '@media (prefers-reduced-motion:reduce){.bjl-root *{animation:none!important;transition:none!important}}',
    '@media (max-width:480px){.bjl-panel{width:calc(100vw - 20px);height:min(76vh,600px);right:-2px}}',
    // ── Day mode. The app stamps data-v3-mode on <html>; mirroring it in CSS
    // means the widget follows the theme toggle with no JS listener.
    'html[data-v3-mode="day"] .bjl-panel{background:linear-gradient(180deg,#FFFFFF,#FBFAFF);',
    'border-color:rgba(16,10,40,.14);box-shadow:0 30px 80px -24px rgba(124,58,237,.22),0 8px 22px -10px rgba(0,0,0,.12)}',
    'html[data-v3-mode="day"] .bjl-hd{border-bottom-color:rgba(16,10,40,.09);background:radial-gradient(ellipse 70% 120% at 12% 0%,rgba(217,70,239,.10),transparent 70%)}',
    'html[data-v3-mode="day"] .bjl-name,html[data-v3-mode="day"] .bjl-greet,',
    'html[data-v3-mode="day"] .bjl-fn,html[data-v3-mode="day"] .bjl-word,',
    'html[data-v3-mode="day"] .bjl-ringv,html[data-v3-mode="day"] .bjl-chip{color:#0E0A1B}',
    'html[data-v3-mode="day"] .bjl-lede,html[data-v3-mode="day"] .bjl-slip span{color:#2B2542}',
    'html[data-v3-mode="day"] .bjl-sub,html[data-v3-mode="day"] .bjl-ttl,',
    'html[data-v3-mode="day"] .bjl-fc,html[data-v3-mode="day"] .bjl-tra{color:#5F5780}',
    'html[data-v3-mode="day"] .bjl-fscale,html[data-v3-mode="day"] .bjl-hint{color:#8F87AC}',
    'html[data-v3-mode="day"] .bjl-ttl b{color:#A21CAF}',
    'html[data-v3-mode="day"] .bjl-ipa{color:#A21CAF}',
    'html[data-v3-mode="day"] .bjl-card,html[data-v3-mode="day"] .bjl-chip{background:linear-gradient(180deg,rgba(124,58,237,.055),rgba(124,58,237,.02));border-color:rgba(16,10,40,.10)}',
    'html[data-v3-mode="day"] .bjl-fr:hover{background:rgba(124,58,237,.07)}',
    'html[data-v3-mode="day"] .bjl-tr{background:rgba(16,10,40,.08)}',
    'html[data-v3-mode="day"] .bjl-msg.her{background:rgba(124,58,237,.07);color:#0E0A1B;border-color:rgba(16,10,40,.10)}',
    'html[data-v3-mode="day"] .bjl-typing{background:rgba(124,58,237,.07);border-color:rgba(16,10,40,.10)}',
    'html[data-v3-mode="day"] .bjl-ft{background:rgba(124,58,237,.03);border-top-color:rgba(16,10,40,.09)}',
    'html[data-v3-mode="day"] .bjl-in{background:#fff;border-color:rgba(16,10,40,.14);color:#0E0A1B}',
    'html[data-v3-mode="day"] .bjl-in::placeholder{color:#8F87AC}',
    'html[data-v3-mode="day"] .bjl-btn.ghost{background:rgba(16,10,40,.05);border-color:rgba(16,10,40,.12);color:#2B2542}',
    'html[data-v3-mode="day"] .bjl-x{color:#5F5780}',
    'html[data-v3-mode="day"] .bjl-x:hover{color:#0E0A1B;background:rgba(16,10,40,.06)}',
    'html[data-v3-mode="day"] .bjl-w.correct{background:rgba(16,185,129,.13);color:#047857;border-color:rgba(16,185,129,.3)}',
    'html[data-v3-mode="day"] .bjl-w.slip{background:rgba(225,29,72,.10);color:#BE123C;border-color:rgba(225,29,72,.3)}',
    'html[data-v3-mode="day"] .bjl-w.close{background:rgba(245,158,11,.14);color:#B45309;border-color:rgba(245,158,11,.32)}',
    'html[data-v3-mode="day"] .bjl-w.wrong,html[data-v3-mode="day"] .bjl-w.missed{background:rgba(16,10,40,.05);color:#8F87AC;border-color:rgba(16,10,40,.10)}',
    'html[data-v3-mode="day"] .bjl-slip{background:rgba(225,29,72,.06);border-color:rgba(225,29,72,.22)}',
    'html[data-v3-mode="day"] .bjl-slip b{color:#BE123C}',
    'html[data-v3-mode="day"] .bjl-msg.sys,html[data-v3-mode="day"] .bjl-spk{color:#5F5780}',
    'html[data-v3-mode="day"] .bjl-rich strong{color:#0E0A1B}',
    'html[data-v3-mode="day"] .bjl-rich em{color:#6D28D9}',
    'html[data-v3-mode="day"] .bjl-rich code{background:rgba(217,70,239,.10);box-shadow:inset 0 0 0 1px rgba(217,70,239,.26);color:#86198F}',
    'html[data-v3-mode="day"] .bjl-rich a{color:#A21CAF;text-decoration-color:rgba(162,28,175,.4)}',
    'html[data-v3-mode="day"] .bjl-rich a:hover{color:#701A75;text-decoration-color:#701A75}'
  ].join('');

  function injectCSS() {
    var s = document.createElement('style');
    s.id = 'bjl-style';
    s.textContent = CSS;
    document.head.appendChild(s);
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
    back: '<path d="M19 12H5M12 19l-7-7 7-7"/>'
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
    var t = el('div', 'bjl-ttl');
    t.innerHTML = 'Your recurring habits &nbsp;<b>' +
      fossils.filter(function (f) { return f.fossilized; }).length + ' fossilised</b>';
    wrap.appendChild(t);

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
      line.appendChild(el('span', 'bjl-fc', f.count + '× · ' + f.lessons + ' lessons'));
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
        send(f.prompt || ('Why do I keep getting ' + f.title.toLowerCase() +
          ' wrong? Show me exactly when I\'ve done it and how to stop.'), true);
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
      return new Date(d).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
    } catch (e) { return d; }
  }

  // ── Say-it card ──────────────────────────────────────────────────────────
  function buildDrill(drill) {
    var wrap = el('div', 'bjl-card');
    var t = el('div', 'bjl-ttl');
    t.innerHTML = 'Say it &nbsp;<b>hold the mic</b>';
    wrap.appendChild(t);

    var row = el('div');
    row.style.cssText = 'display:flex;align-items:center;gap:13px';
    var left = el('div');
    left.style.cssText = 'flex:1;min-width:0';
    left.appendChild(el('div', 'bjl-word', drill.word));
    if (drill.ipa) left.appendChild(el('div', 'bjl-ipa', '/' + drill.ipa + '/'));
    if (drill.translation) left.appendChild(el('div', 'bjl-tra', drill.translation));
    row.appendChild(left);

    var mic = el('button', 'bjl-mic');
    mic.setAttribute('aria-label', 'Hold to say ' + drill.word);
    mic.innerHTML = svgIcon(IC.mic, 22);
    bindHold(mic, drill.word);
    row.appendChild(mic);
    wrap.appendChild(row);

    var res = el('div');
    res.id = 'bjl-drill-res';
    wrap.appendChild(res);

    // Hearing a native speaker BEFORE attempting it is the natural order, so
    // offer it up front rather than only after a score.
    if (drill.hasClips) {
      var real = el('button', 'bjl-real', '▶  Hear a native speaker say “' + drill.word + '”');
      real.addEventListener('click', function () {
        real.disabled = true;
        real.textContent = 'Loading clips…';
        fetchYouglish(drill.word).then(function (yg) {
          var p = renderYouglish(yg);
          if (p) { real.replaceWith(p); }
          else { real.textContent = 'No clips for this one yet'; }
        });
      });
      wrap.appendChild(real);
    }
    wrap.appendChild(el('div', 'bjl-hint', 'Hold to speak, or tap to start and tap again to stop'));
    return wrap;
  }

  function renderScore(container, scored, coaching, yg) {
    container.innerHTML = '';
    container.style.marginTop = '13px';
    var box = el('div', 'bjl-score');

    var pct = Math.max(0, Math.min(100, scored.score));
    var col = pct >= 80 ? '#34D399' : pct >= 55 ? '#FCD34D' : '#FB7185';
    var C = 2 * Math.PI * 24;
    var ring = el('div', 'bjl-ring');
    ring.innerHTML =
      '<svg width="58" height="58" viewBox="0 0 58 58">' +
      '<circle cx="29" cy="29" r="24" stroke="rgba(255,255,255,.09)" stroke-width="5" fill="none"/>' +
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
      if (w.heard && w.heard !== w.word) c.title = 'heard: ' + w.heard;
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
      container.appendChild(c);
    }
    var player = renderYouglish(yg);
    if (player) container.appendChild(player);
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
      poster.setAttribute('aria-label', 'Play clip of "' + yg.word + '"');
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
      if (c.caption) cap.appendChild(document.createTextNode(' — ' + c.caption));
      nav.querySelector('span').textContent = (i + 1) + ' / ' + yg.clips.length;
    }

    var prev = el('button', null, '‹ Prev');
    var count = el('span');
    var next = el('button', null, 'Next ›');
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
  function renderHome() {
    var b = els.body;
    b.innerHTML = '';
    if (!profile) {
      var s = el('div', 'bjl-msg sys', 'Loading your lessons…');
      b.appendChild(s);
      return;
    }
    var g = el('div', 'bjl-greet');
    g.innerHTML = 'Hi <em>' + esc(profile.student || 'there') + '</em> 👋';
    b.appendChild(g);
    b.appendChild(el('div', 'bjl-lede',
      'I remember all ' + profile.lessons + ' of your lessons. Here is what keeps coming back.'));

    if (profile.fossils && profile.fossils.length) {
      var f = buildFossils(profile.fossils);
      if (f) b.appendChild(f);
    }
    if (profile.drill) b.appendChild(buildDrill(profile.drill));

    if (profile.chips && profile.chips.length) {
      var box = el('div', 'bjl-chips');
      profile.chips.forEach(function (c) {
        var btn = el('button', 'bjl-chip');
        var i = el('i', null, iconFor(c.icon));
        btn.appendChild(i);
        btn.appendChild(el('span', null, c.label));
        btn.addEventListener('click', function () { send(c.prompt, true); });
        box.appendChild(btn);
      });
      b.appendChild(box);
    }
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

  function nearBottom() {
    return els.body.scrollHeight - els.body.scrollTop - els.body.clientHeight < 70;
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
      var stick = nearBottom();
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
    if (els.body.querySelector('.bjl-greet')) els.body.innerHTML = '';
    var rich = role === 'assistant';
    var m = el('div', 'bjl-msg ' + (role === 'user' ? 'me' : role === 'system' ? 'sys' : 'her') +
      (rich ? ' bjl-rich' : ''), rich ? null : text);
    els.body.appendChild(m);
    if (rich) revealRich(m, mdToHtml(text), onDone);
    else if (onDone) onDone();
    scroll();
    return m;
  }
  function scroll() { els.body.scrollTop = els.body.scrollHeight; }

  function typing(on) {
    var t = els.body.querySelector('.bjl-typing');
    if (on && !t) {
      var d = el('div', 'bjl-typing');
      d.innerHTML = '<i></i><i></i><i></i>';
      els.body.appendChild(d);
      scroll();
    } else if (!on && t) t.remove();
  }

  function playChunks(urls) {
    if (!urls || !urls.length) return;
    var i = 0;
    function next() {
      if (i >= urls.length) { currentAudio = null; return; }
      var a = new Audio(API + urls[i++]);
      currentAudio = a;
      a.onended = next;
      a.onerror = next;
      a.play().catch(function () {});
    }
    next();
  }

  function attachSpeak(node, urls) {
    if (!urls || !urls.length) return;
    var b = el('button', 'bjl-spk');
    b.innerHTML = svgIcon(IC.play, 12) + ' <span>Hear it</span>';
    b.addEventListener('click', function () { playChunks(urls); });
    // No <br>: inside a rich bubble the block flow already owns the spacing,
    // and a line break there would sit on top of the rule's own margin.
    if (!node.classList.contains('bjl-rich')) node.appendChild(document.createElement('br'));
    node.appendChild(b);
  }

  // canned = the student tapped a chip or a fossil row rather than typing, so
  // the server may serve its prebaked answer even mid-conversation.

  // The student's own Convex session, as StudentAuthContext stores it. The
  // widget never read this before, so every /chat turn was authenticated by
  // nothing but a slug in the body — which meant naming someone loaded their
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
    if (!slug) return;
    addMsg('user', text);
    history.push({ role: 'user', content: text });
    busy = true;
    setSendState();
    typing(true);

    fetch(API + '/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
        if (!reply) { addMsg('system', 'No reply came back. Try again in a moment.'); return; }
        // Trailers wait for the reveal to finish, otherwise the speak button
        // and the clips sit under a half-written answer.
        var node = addMsg('assistant', reply, function () {
          attachSpeak(node, d.audio_chunks);
          var yg = renderYouglish(d.youglish);
          if (yg) { els.body.appendChild(yg); }
          scroll();
        });
        history.push({ role: 'assistant', content: reply });
      })
      .catch(function () {
        typing(false);
        addMsg('system', 'I could not reach the tutor service just now.');
      })
      .finally(function () { busy = false; setSendState(); });
  }

  // ── Voice ────────────────────────────────────────────────────────────────
  // Two ways to use the mic, because people try both: HOLD it down and release,
  // or TAP once to start and tap again to stop. Anything shorter than HOLD_MS
  // is treated as a tap, which is what a normal click is.
  function bindHold(btn, target) {
    var pressActive = false, pressAt = 0;

    function start(e) {
      e.preventDefault();
      if (busy) return;
      if (recording) {          // second tap: stop
        wantRec = false;
        endRec();
        return;
      }
      pressActive = true;
      pressAt = Date.now();
      wantRec = true;
      beginRec(target, btn);
    }

    function stop(e) {
      if (e) e.preventDefault();
      if (!pressActive) return; // ignore stray mouseleave after a tap
      pressActive = false;
      if (!wantRec) return;
      if (Date.now() - pressAt >= HOLD_MS) {
        wantRec = false;        // it was a hold, so release means send
        endRec();
      }
      // otherwise it was a tap: keep recording until the next tap
    }

    btn.addEventListener('mousedown', start);
    btn.addEventListener('touchstart', start, { passive: false });
    ['mouseup', 'mouseleave', 'touchend', 'touchcancel'].forEach(function (ev) {
      btn.addEventListener(ev, stop);
    });
  }

  function beginRec(target, btn) {
    if (recording || starting || busy) return;
    if (!navigator.mediaDevices || !window.MediaRecorder) {
      addMsg('system', 'Your browser will not let me use the microphone here.');
      return;
    }
    starting = true;
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      starting = false;
      // THE RACE: getUserMedia is async, so on a normal click mouseup fires
      // before the stream arrives. Without this check the recorder starts after
      // the user has already let go and nothing ever stops it: the mic stays
      // live, the button pulses forever and no reply comes.
      if (!wantRec) {
        stream.getTracks().forEach(function (t) { t.stop(); });
        return;
      }
      recording = true;
      drillMode = target || null;
      if (btn) btn.classList.add('rec');
      if (els.mic) els.mic.classList.add('rec');
      chunks = [];
      mediaRecorder = new MediaRecorder(stream);
      mediaRecorder.ondataavailable = function (e) { if (e.data.size) chunks.push(e.data); };
      mediaRecorder.onstop = function () {
        stream.getTracks().forEach(function (t) { t.stop(); });
        if (btn) btn.classList.remove('rec');
        if (els.mic) els.mic.classList.remove('rec');
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
      addMsg('system', 'I need microphone permission to hear you.');
    });
  }

  function endRec() {
    clearTimeout(stopTimer);
    if (!recording || !mediaRecorder) return;
    recording = false;
    try { mediaRecorder.stop(); } catch (e) {}
    mediaRecorder = null;
  }

  function sendVoice(blob, target) {
    if (!blob || blob.size < 1200) {
      // Previously returned silently, so a short clip looked like a dead button.
      addMsg('system', 'That was too short for me to hear. Hold the mic while you speak, or tap it once to start and again to stop.');
      return;
    }
    var slug = currentSlug();
    if (!slug) return;
    busy = true;
    setSendState();
    var res = document.getElementById('bjl-drill-res');
    if (target && res) res.innerHTML = '<div class="bjl-hint">Listening back…</div>';
    else typing(true);

    var fd = new FormData();
    fd.append('audio', blob, 'a.webm');
    fd.append('student_id', slug);
    fd.append('voice', voiceId());
    fd.append('history', JSON.stringify(history.slice(-MAX_HISTORY)));
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
          if (box) renderScore(box, d.scored, d.reply, d.youglish);
          playChunks(d.audio_chunks);
          return;
        }
        if (d && d.transcript) { addMsg('user', d.transcript); history.push({ role: 'user', content: d.transcript }); }
        if (d && d.reply) {
          var node = addMsg('assistant', d.reply, function () {
            attachSpeak(node, d.audio_chunks);
          });
          history.push({ role: 'assistant', content: d.reply });
          playChunks(d.audio_chunks);   // audio starts with the reveal, not after
        }
      })
      .catch(function () {
        typing(false);
        addMsg('system', 'I could not hear that one. Try again?');
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
    panel.setAttribute('aria-label', 'Bajla, your English tutor');
    panel.style.display = 'none';

    var hd = el('div', 'bjl-hd');
    var av = el('div', 'bjl-av');
    av.innerHTML = '<img src="/brand/em-bajla-icon.webp" alt="">';
    hd.appendChild(av);
    var who = el('div');
    who.style.cssText = 'flex:1;min-width:0';
    who.appendChild(el('div', 'bjl-name', 'Bajla'));
    els.sub = el('div', 'bjl-sub', 'your English tutor');
    who.appendChild(els.sub);
    hd.appendChild(who);
    var x = el('button', 'bjl-x');
    x.setAttribute('aria-label', 'Close');
    x.innerHTML = svgIcon(IC.close, 19);
    x.addEventListener('click', toggle);
    hd.appendChild(x);
    panel.appendChild(hd);

    els.body = el('div', 'bjl-body');
    panel.appendChild(els.body);

    var ft = el('div', 'bjl-ft');
    els.input = el('textarea', 'bjl-in');
    els.input.rows = 1;
    els.input.placeholder = 'Ask Bajla anything…';
    els.input.addEventListener('input', function () {
      this.style.height = 'auto';
      this.style.height = Math.min(110, this.scrollHeight) + 'px';
      setSendState();
    });
    els.input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        var v = els.input.value.trim();
        if (v) { els.input.value = ''; els.input.style.height = 'auto'; send(v); }
      }
    });
    ft.appendChild(els.input);

    els.mic = el('button', 'bjl-btn ghost');
    els.mic.setAttribute('aria-label', 'Hold to speak, or tap to start and stop');
    els.mic.innerHTML = svgIcon(IC.mic, 19);
    bindHold(els.mic, null);
    ft.appendChild(els.mic);

    els.send = el('button', 'bjl-btn');
    els.send.setAttribute('aria-label', 'Send');
    els.send.innerHTML = svgIcon(IC.send, 18);
    els.send.disabled = true;
    els.send.addEventListener('click', function () {
      var v = els.input.value.trim();
      if (v) { els.input.value = ''; els.input.style.height = 'auto'; send(v); }
    });
    ft.appendChild(els.send);
    panel.appendChild(ft);

    var fab = el('button', 'bjl-fab');
    fab.setAttribute('aria-label', 'Open Bajla, your English tutor');
    fab.innerHTML = '<span class="bjl-halo"></span><img src="/brand/em-bajla-icon.webp" alt="">';
    fab.addEventListener('click', toggle);

    root.appendChild(panel);
    root.appendChild(fab);
    document.body.appendChild(root);
    els.root = root; els.panel = panel; els.fab = fab;
  }

  function toggle() {
    open = !open;
    els.panel.style.display = open ? 'flex' : 'none';
    els.root.classList.toggle('bjl-live', !open);
    if (open) {
      var slug = currentSlug();
      if (slug && slug !== loadedFor) {
        loadedFor = slug;
        history = [];
        renderHome();
        loadProfile(slug).then(function (p) {
          profile = p;
          if (p) {
            els.sub.textContent = 'knows your ' + p.lessons + ' lessons · ' + (p.cefr || '');
            if (!history.length) renderHome();
          } else {
            els.body.innerHTML = '';
            addMsg('system', 'I could not load your lessons yet.');
          }
        });

        // Anything left for this student while they were away. The panel is
        // request/response with no push, and it wipes its history on open, so
        // before this there was NO route for an answer to reach a student —
        // an escalation to Mike was a dead end in both directions.
        // Delivered once; the server consumes it as it hands it over.
        fetch(API + '/pending/' + encodeURIComponent(slug)
              + '?token=' + encodeURIComponent(studentToken()))
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (d) {
            if (!d || !d.message) return;
            addMsg('assistant', d.message);
            history.push({ role: 'assistant', content: d.message });
          })
          .catch(function () { /* never block the panel on this */ });
      }
      setTimeout(function () { els.input.focus(); }, 120);
    } else if (currentAudio) {
      try { currentAudio.pause(); } catch (e) {}
    }
  }

  // ── Boot ─────────────────────────────────────────────────────────────────
  function boot() {
    if (!currentSlug()) return;   // not a student context — render nothing
    injectCSS();
    build();
    els.root.classList.add('bjl-live');
    // Product surfaces can hand a completed activity to Bajla without
    // duplicating chat UI. The custom event opens the existing tutor and can
    // optionally send a contextual coaching prompt.
    window.addEventListener('bajla:open', function (event) {
      var detail = event && event.detail || {};
      if (!open) toggle();
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
      if (e.key === 'Escape' && open) toggle();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
