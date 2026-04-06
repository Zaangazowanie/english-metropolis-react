/**
 * Conversa AI Tutor — Voice-First Chat Widget (v4 — Liquid Luminary)
 * Premium glass-morphism design. Pre-cached greeting. Suggested questions.
 */
(function() {
    'use strict';

    const API_BASE = '/api/conversa';
    const STUDENT_ID = window.__STUDENT_SLUG || 'szymon';
    const MAX_HISTORY = 10;

    let isOpen = false;
    let isRecording = false;
    let isThinking = false;
    let isSpeaking = false;
    let chatHistory = [];
    let currentAudio = null;
    let mediaRecorder = null;
    let audioChunks = [];
    let hasGreeted = false;

    // Student names
    const NAMES = {
        'szymon-karpinski': 'Szymon',
        'mikolaj-karpinski': 'Mikołaj',
        'ilona-karpinska': 'Ilona'
    };

    // Suggested questions for ESL students
    const SUGGESTIONS = [
        { icon: '📊', text: 'Which mistake did I make most in my last 4 lessons?' },
        { icon: '📝', text: 'What grammatical pattern should I work on most?' },
        { icon: '🏆', text: 'Which words have I mastered? Test me on them!' },
        { icon: '❓', text: 'How does the quiz system work? Explain the grades and progression.' },
    ];

    // Voice definitions with user-friendly labels
    const QUICK_VOICES = [
        { id: 'af_heart', name: 'Heart', displayName: 'Heart (US Female)', flag: '🇺🇸', accent: 'American', gender: 'Female' },
        { id: 'am_adam', name: 'Adam', displayName: 'Adam (US Male)', flag: '🇺🇸', accent: 'American', gender: 'Male' },
        { id: 'bf_emma', name: 'Emma', displayName: 'Emma (UK Female)', flag: '🇬🇧', accent: 'British', gender: 'Female' },
        { id: 'bm_george', name: 'George', flag: '🇬🇧' },
    ];
    const ALL_VOICES = [
        { id: 'af_alloy', name: 'Alloy', flag: '🇺🇸' }, { id: 'af_aoede', name: 'Aoede', flag: '🇺🇸' },
        { id: 'af_bella', name: 'Bella', flag: '🇺🇸' }, { id: 'af_jessica', name: 'Jessica', flag: '🇺🇸' },
        { id: 'af_kore', name: 'Kore', flag: '🇺🇸' }, { id: 'af_nicole', name: 'Nicole', flag: '🇺🇸' },
        { id: 'af_nova', name: 'Nova', flag: '🇺🇸' }, { id: 'af_river', name: 'River', flag: '🇺🇸' },
        { id: 'af_sarah', name: 'Sarah', flag: '🇺🇸' }, { id: 'af_sky', name: 'Sky', flag: '🇺🇸' },
        { id: 'am_echo', name: 'Echo', flag: '🇺🇸' }, { id: 'am_eric', name: 'Eric', flag: '🇺🇸' },
        { id: 'am_fenrir', name: 'Fenrir', flag: '🇺🇸' }, { id: 'am_liam', name: 'Liam', flag: '🇺🇸' },
        { id: 'am_michael', name: 'Michael', flag: '🇺🇸' }, { id: 'am_onyx', name: 'Onyx', flag: '🇺🇸' },
        { id: 'am_puck', name: 'Puck', flag: '🇺🇸' },
        { id: 'bf_alice', name: 'Alice', flag: '🇬🇧' }, { id: 'bf_isabella', name: 'Isabella', flag: '🇬🇧' },
        { id: 'bf_lily', name: 'Lily', flag: '🇬🇧' },
        { id: 'bm_daniel', name: 'Daniel', flag: '🇬🇧' }, { id: 'bm_fable', name: 'Fable', flag: '🇬🇧' },
        { id: 'bm_lewis', name: 'Lewis', flag: '🇬🇧' },
    ];

    function getStudentName() {
        return NAMES[STUDENT_ID] || 'there';
    }

    function getSelectedVoice() {
        return localStorage.getItem('tts_voice') || 'af_heart';
    }

    // ── Build UI ────────────────────────────────────────────────
    function buildWidget() {
        const container = document.createElement('div');
        container.id = 'conversa-container';
        container.innerHTML = `
            <button id="conversa-bubble" onclick="window.__CONVERSA.toggle()">
                <svg class="bubble-icon" width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="3" fill="white" opacity="0.95"/>
                    <circle cx="12" cy="12" r="6.5" stroke="white" stroke-width="1.2" fill="none" opacity="0.5"/>
                    <circle cx="12" cy="12" r="10" stroke="white" stroke-width="0.8" fill="none" opacity="0.25"/>
                    <line x1="12" y1="2" x2="12" y2="5" stroke="white" stroke-width="1" stroke-linecap="round" opacity="0.6"/>
                    <line x1="12" y1="19" x2="12" y2="22" stroke="white" stroke-width="1" stroke-linecap="round" opacity="0.6"/>
                    <line x1="2" y1="12" x2="5" y2="12" stroke="white" stroke-width="1" stroke-linecap="round" opacity="0.6"/>
                    <line x1="19" y1="12" x2="22" y2="12" stroke="white" stroke-width="1" stroke-linecap="round" opacity="0.6"/>
                </svg>
            </button>
            <div id="conversa-panel">
                <!-- Header -->
                <div class="cv-header">
                    <div class="cv-header-left">
                        <span class="cv-avatar">🎓</span>
                        <div>
                            <div class="cv-title">Conversa AI</div>
                            <div class="cv-status"><span class="cv-dot"></span> Online</div>
                        </div>
                    </div>
                    <button class="cv-close" onclick="window.__CONVERSA.toggle()">✕</button>
                </div>

                <!-- Messages -->
                <div class="cv-messages" id="conversa-messages"></div>

                <!-- Suggestions (shown before first message) -->
                <div class="cv-suggestions" id="cv-suggestions">
                    ${SUGGESTIONS.map((s, i) => `
                        <button class="cv-suggest-btn" onclick="window.__CONVERSA.askSuggestion(${i})">
                            <span class="cv-suggest-icon">${s.icon}</span>
                            <span class="cv-suggest-text">${s.text}</span>
                        </button>
                    `).join('')}
                </div>

                <!-- Voice chips -->
                <div class="cv-voices">
                    <div class="cv-voices-row">
                        ${QUICK_VOICES.map(v => `
                            <button class="cv-voice-chip${v.id === getSelectedVoice() ? ' active' : ''}" data-voice="${v.id}"
                                onclick="window.__CONVERSA.selectVoice('${v.id}')">
                                ${v.flag} ${v.name}
                            </button>
                        `).join('')}
                        <button class="cv-voice-more" id="cv-voice-more" onclick="window.__CONVERSA.showAllVoices()">More ▾</button>
                    </div>
                    <div class="cv-voices-extra" id="cv-voices-extra" style="display:none">
                        <div class="cv-voices-group-label">🇺🇸 US Female</div>
                        ${ALL_VOICES.filter(v => v.id.startsWith('af_')).map(v => `
                            <button class="cv-voice-chip-sm" data-voice="${v.id}" onclick="window.__CONVERSA.selectVoice('${v.id}')">${v.name}</button>
                        `).join('')}
                        <div class="cv-voices-group-label">🇺🇸 US Male</div>
                        ${ALL_VOICES.filter(v => v.id.startsWith('am_')).map(v => `
                            <button class="cv-voice-chip-sm" data-voice="${v.id}" onclick="window.__CONVERSA.selectVoice('${v.id}')">${v.name}</button>
                        `).join('')}
                        <div class="cv-voices-group-label">🇬🇧 UK Female</div>
                        ${ALL_VOICES.filter(v => v.id.startsWith('bf_')).map(v => `
                            <button class="cv-voice-chip-sm" data-voice="${v.id}" onclick="window.__CONVERSA.selectVoice('${v.id}')">${v.name}</button>
                        `).join('')}
                        <div class="cv-voices-group-label">🇬🇧 UK Male</div>
                        ${ALL_VOICES.filter(v => v.id.startsWith('bm_')).map(v => `
                            <button class="cv-voice-chip-sm" data-voice="${v.id}" onclick="window.__CONVERSA.selectVoice('${v.id}')">${v.name}</button>
                        `).join('')}
                    </div>
                </div>

                <!-- Input -->
                <div class="cv-input-area">
                    <button class="cv-mic-btn" id="conversa-mic" onclick="window.__CONVERSA.toggleRecording()">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
                            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                            <line x1="12" y1="19" x2="12" y2="22"/>
                        </svg>
                    </button>
                    <input type="text" id="conversa-input" placeholder="Message Conversa..."
                           onkeydown="if(event.key==='Enter') window.__CONVERSA.sendText()">
                    <button class="cv-send-btn" onclick="window.__CONVERSA.sendText()">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                            <line x1="22" y1="2" x2="11" y2="13"/>
                            <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                        </svg>
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(container);

        window.__CONVERSA = {
            toggle, toggleRecording, sendText, playAudio, selectVoice,
            askSuggestion: (i) => { const inp = document.getElementById('conversa-input'); inp.value = SUGGESTIONS[i].text; sendText(); },
            showAllVoices: () => {
                const el = document.getElementById('cv-voices-extra');
                const btn = document.getElementById('cv-voice-more');
                if (el) {
                    const show = el.style.display === 'none';
                    el.style.display = show ? 'flex' : 'none';
                    if (btn) btn.textContent = show ? 'Less ▴' : 'More ▾';
                }
            }
        };
    }

    function toggle() {
        isOpen = !isOpen;
        const panel = document.getElementById('conversa-panel');
        const bubble = document.getElementById('conversa-bubble');
        if (isOpen) {
            panel.classList.add('open');
            bubble.classList.add('hidden');
            if (!hasGreeted) { hasGreeted = true; showGreeting(); }
        } else {
            panel.classList.remove('open');
            bubble.classList.remove('hidden');
            stopSpeaking();
        }
    }

    function selectVoice(voiceId) {
        localStorage.setItem('tts_voice', voiceId);
        // Update chip highlights
        document.querySelectorAll('.cv-voice-chip, .cv-voice-chip-sm').forEach(b => {
            b.classList.toggle('active', b.dataset.voice === voiceId);
        });
        // Play preview
        if (window.__CONVERSA._voiceCache && window.__CONVERSA._voiceCache[voiceId]) {
            try { const a = window.__CONVERSA._voiceCache[voiceId]; a.currentTime = 0; a.play().catch(()=>{}); } catch(e) {}
        } else {
            fetch(`${API_BASE}/tts`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: 'Hey! This is my voice.', voice: voiceId, lang_code: voiceId[0], speed: 1.0 })
            }).then(r => r.json()).then(d => { if (d.audio) playAudio(d.audio); }).catch(() => {});
        }
    }

    function showGreeting() {
        const name = getStudentName();
        // Suggestions stay visible — only hidden when user sends a message

        addMsg('ai', `Hey ${name}! 👋 I'm your Conversa tutor. I know your lessons, your mistakes, and what to work on. <strong>Tap the 🎤 mic and speak to me</strong> — I'll listen and talk back! Pick any voice below — try a few and see which clicks.`);

        // Play pre-cached greeting or fetch immediately
        if (window.__CONVERSA && window.__CONVERSA._greetingAudio) {
            try { window.__CONVERSA._greetingAudio.currentTime = 0; window.__CONVERSA._greetingAudio.play().catch(()=>{}); } catch(e) {}
        } else {
            fetchGreeting();
        }
    }

    function fetchGreeting() {
        const text = `Hey ${getStudentName()}! I'm your Conversa tutor. I know your lessons, your mistakes, and what to work on. Tap the mic and speak to me, I'll listen and talk back!`;
        fetch(`${API_BASE}/tts`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, voice: 'af_heart', lang_code: 'a', speed: 1.2 })
        }).then(r => r.json()).then(d => { if (d.audio) playAudio(d.audio); }).catch(() => {});
    }

    // ── Messages ────────────────────────────────────────────────
    function addMsg(role, html, audioUrl) {
        const c = document.getElementById('conversa-messages');
        const d = document.createElement('div');
        d.className = `cv-msg cv-msg-${role}`;
        let content = `<div class="cv-bubble">${html}</div>`;
        if (audioUrl && role === 'ai') {
            content += `<button class="cv-play-btn" onclick="window.__CONVERSA.playAudio('${audioUrl}')">▶ Play</button>`;
        }
        d.innerHTML = content;
        c.appendChild(d);
        c.scrollTop = c.scrollHeight;
    }

    function addThinking() {
        const c = document.getElementById('conversa-messages');
        const d = document.createElement('div');
        d.className = 'cv-msg cv-msg-ai';
        d.id = 'thinking-msg';
        d.innerHTML = `<div class="cv-bubble"><div class="cv-dots"><span></span><span></span><span></span></div></div>`;
        c.appendChild(d);
        c.scrollTop = c.scrollHeight;
    }

    function removeThinking() { const e = document.getElementById('thinking-msg'); if (e) e.remove(); }

    // ── Voice recording ─────────────────────────────────────────
    async function toggleRecording() {
        if (isThinking || isSpeaking) return;
        if (isRecording) { stopRecording(); } else { await startRecording(); }
    }

    async function startRecording() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
            audioChunks = [];
            mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunks.push(e.data); };
            mediaRecorder.onstop = async () => {
                const blob = new Blob(audioChunks, { type: 'audio/webm' });
                stream.getTracks().forEach(t => t.stop());
                await sendVoice(blob);
            };
            mediaRecorder.start();
            isRecording = true;
            document.getElementById('conversa-mic').classList.add('recording');
        } catch (e) {
            addMsg('system', '🎤 Please allow microphone access.');
        }
    }

    function stopRecording() {
        if (mediaRecorder && mediaRecorder.state === 'recording') mediaRecorder.stop();
        isRecording = false;
        document.getElementById('conversa-mic').classList.remove('recording');
    }

    async function sendVoice(blob) {
        isThinking = true;
        addMsg('user', '🎤 You spoke...');
        addThinking();
        const voice = getSelectedVoice();
        const fd = new FormData();
        fd.append('audio', blob, 'recording.webm');
        fd.append('student_id', STUDENT_ID);
        fd.append('history', JSON.stringify(chatHistory.slice(-MAX_HISTORY)));
        fd.append('voice', voice);
        try {
            const r = await fetch(`${API_BASE}/voice`, { method: 'POST', body: fd });
            const d = await r.json();
            removeThinking(); isThinking = false;
            if (d.transcript) {
                const msgs = document.querySelectorAll('.cv-msg-user .cv-bubble');
                const last = msgs[msgs.length - 1];
                if (last) last.textContent = d.transcript;
            }
            addMsg('ai', d.reply, d.audio);
            chatHistory.push({ role: 'user', content: d.transcript || '' }, { role: 'assistant', content: d.reply });
            if (d.audio) playAudio(d.audio);
        } catch (e) { removeThinking(); isThinking = false; addMsg('system', '⚠️ Connection issue.'); }
    }

    async function sendText() {
        const inp = document.getElementById('conversa-input');
        const text = inp.value.trim();
        if (!text || isThinking) return;
        inp.value = '';
        // Hide suggestions on first interaction
        const sug = document.getElementById('cv-suggestions');
        if (sug) sug.style.display = 'none';
        addMsg('user', text);
        addThinking(); isThinking = true;
        const voice = getSelectedVoice();
        try {
            const r = await fetch(`${API_BASE}/chat`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ student_id: STUDENT_ID, message: text, history: chatHistory.slice(-MAX_HISTORY), voice })
            });
            const d = await r.json();
            removeThinking(); isThinking = false;
            addMsg('ai', d.reply, d.audio);
            chatHistory.push({ role: 'user', content: text }, { role: 'assistant', content: d.reply });
            if (d.audio) playAudio(d.audio);
        } catch (e) { removeThinking(); isThinking = false; addMsg('system', '⚠️ Connection issue.'); }
    }

    function playAudio(url) {
        stopSpeaking();
        currentAudio = new Audio(`${API_BASE}${url}`);
        isSpeaking = true;
        currentAudio.onended = currentAudio.onerror = () => { isSpeaking = false; currentAudio = null; };
        currentAudio.play().catch(() => { isSpeaking = false; });
    }

    function stopSpeaking() {
        if (currentAudio) { currentAudio.pause(); currentAudio = null; }
        isSpeaking = false;
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buildWidget);
    else buildWidget();

    // ── Pre-cache: greeting + voice previews IMMEDIATELY ────────
    setTimeout(() => {
        // Pre-cache greeting in af_heart with speed 1.2 for snappier playback
        const greetText = `Hey ${getStudentName()}! I'm your Conversa tutor. I know your lessons, your mistakes, and what to work on. Tap the mic and speak to me, I'll listen and talk back!`;
        fetch(`${API_BASE}/tts`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: greetText, voice: 'af_heart', lang_code: 'a', speed: 1.2 })
        }).then(r => r.json()).then(d => {
            if (d.audio) {
                const a = new Audio(); a.src = `${API_BASE}${d.audio}`; a.preload = 'auto';
                window.__CONVERSA._greetingAudio = a;
            }
        }).catch(() => {});

        // Pre-cache 4 quick voice previews
        window.__CONVERSA._voiceCache = {};
        QUICK_VOICES.forEach(v => {
            fetch(`${API_BASE}/tts`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: 'Hey! This is my voice.', voice: v.id, lang_code: v.id[0], speed: 1.0 })
            }).then(r => r.json()).then(d => {
                if (d.audio) {
                    const a = new Audio(); a.src = `${API_BASE}${d.audio}`; a.preload = 'auto';
                    window.__CONVERSA._voiceCache[v.id] = a;
                }
            }).catch(() => {});
        });
    }, 200);

    // ── Styles (Liquid Luminary) ────────────────────────────────
    const s = document.createElement('style');
    s.textContent = `
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Inter:wght@400;500;600&display=swap');

        #conversa-container {
            position: fixed; bottom: 24px; right: 24px; z-index: 99999;
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
        }

        /* ── Floating Button ── */
        #conversa-bubble {
            width: 56px; height: 56px; border-radius: 50%; border: none; cursor: pointer;
            background: linear-gradient(135deg, #0052d0, #4c49c9); color: white;
            display: flex; align-items: center; justify-content: center;
            box-shadow: 0 8px 32px rgba(0,82,208,0.3);
            transition: all 0.35s cubic-bezier(0.34,1.56,0.64,1);
        }
        #conversa-bubble:hover { transform: scale(1.1); box-shadow: 0 12px 40px rgba(0,82,208,0.4); }
        #conversa-bubble:active { transform: scale(0.92); }
        #conversa-bubble.hidden { transform: scale(0); opacity: 0; pointer-events: none; }
        .bubble-icon { filter: drop-shadow(0 0 4px rgba(255,255,255,0.4)); }

        /* ── Panel ── */
        #conversa-panel {
            position: absolute; bottom: 0; right: 0;
            width: 400px; height: 600px;
            background: #f2f7ff;
            border-radius: 24px;
            display: flex; flex-direction: column;
            box-shadow: 0 40px 100px rgba(0,82,208,0.12);
            transform: scale(0.85) translateY(20px); opacity: 0;
            pointer-events: none;
            transition: all 0.4s cubic-bezier(0.34,1.56,0.64,1);
            overflow: hidden;
        }
        #conversa-panel.open { transform: scale(1) translateY(0); opacity: 1; pointer-events: all; }

        /* ── Header ── */
        .cv-header {
            background: rgba(255,255,255,0.7); backdrop-filter: blur(40px); -webkit-backdrop-filter: blur(40px);
            padding: 16px 20px; display: flex; align-items: center; justify-content: space-between;
            border-bottom: 1px solid rgba(168,174,181,0.12);
        }
        .cv-header-left { display: flex; align-items: center; gap: 12px; }
        .cv-avatar { font-size: 32px; filter: drop-shadow(0 2px 8px rgba(0,0,0,0.1)); }
        .cv-title {
            font-family: 'Plus Jakarta Sans', sans-serif; font-weight: 800; font-size: 18px;
            background: linear-gradient(to right, #0052d0, #4c49c9); -webkit-background-clip: text;
            -webkit-text-fill-color: transparent; background-clip: text;
        }
        .cv-status { font-size: 10px; font-weight: 600; color: #565c63; text-transform: uppercase; letter-spacing: 0.1em; display: flex; align-items: center; gap: 5px; margin-top: 1px; }
        .cv-dot { width: 7px; height: 7px; background: #10b981; border-radius: 50%; display: inline-block; }
        .cv-close {
            background: rgba(0,82,208,0.08); border: none; color: #0052d0;
            width: 34px; height: 34px; border-radius: 50%; font-size: 14px; cursor: pointer;
            display: flex; align-items: center; justify-content: center;
            transition: all 0.2s cubic-bezier(0.34,1.56,0.64,1);
        }
        .cv-close:hover { background: rgba(0,82,208,0.15); transform: scale(1.1); }

        /* ── Messages ── */
        .cv-messages {
            flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 12px;
            background: #f2f7ff;
        }
        .cv-msg { max-width: 82%; animation: cvMsgIn 0.35s cubic-bezier(0.34,1.56,0.64,1); }
        @keyframes cvMsgIn { from { opacity: 0; transform: translateY(10px) scale(0.95); } to { opacity: 1; transform: translateY(0) scale(1); } }
        .cv-msg-user { align-self: flex-end; }
        .cv-msg-ai { align-self: flex-start; }
        .cv-msg-system { align-self: center; max-width: 90%; }
        .cv-msg-system .cv-bubble { background: rgba(141,58,139,0.08); color: #8d3a8b; font-size: 12px; text-align: center; border-radius: 16px; }
        .cv-bubble { padding: 12px 16px; border-radius: 20px; font-size: 14px; line-height: 1.6; }
        .cv-msg-user .cv-bubble {
            background: linear-gradient(135deg, #0052d0, #4c49c9); color: #f1f2ff;
            border-bottom-right-radius: 6px;
            box-shadow: 0 8px 24px rgba(0,82,208,0.2);
        }
        .cv-msg-ai .cv-bubble {
            background: rgba(255,255,255,0.9); color: #2a2f35;
            border-bottom-left-radius: 6px;
            border: 1px solid rgba(168,174,181,0.12);
        }
        .cv-play-btn {
            display: inline-flex; align-items: center; gap: 5px; margin-top: 8px;
            padding: 6px 14px; background: linear-gradient(135deg, #0052d0, #4c49c9); color: white;
            border: none; border-radius: 9999px; font-size: 11px; font-weight: 600; cursor: pointer;
            transition: all 0.2s;
        }
        .cv-play-btn:hover { transform: scale(1.05); box-shadow: 0 4px 12px rgba(0,82,208,0.3); }

        /* ── Thinking dots ── */
        .cv-dots { display: flex; gap: 5px; padding: 4px 0; }
        .cv-dots span { width: 7px; height: 7px; background: #799dff; border-radius: 50%; animation: cvDot 1.4s infinite ease-in-out; }
        .cv-dots span:nth-child(2) { animation-delay: 0.2s; }
        .cv-dots span:nth-child(3) { animation-delay: 0.4s; }
        @keyframes cvDot { 0%,80%,100% { transform: scale(0.5); opacity: 0.3; } 40% { transform: scale(1); opacity: 1; } }

        /* ── Suggestions ── */
        .cv-suggestions {
            padding: 8px 16px 12px; display: flex; flex-direction: column; gap: 6px;
            background: rgba(255,255,255,0.5); border-top: 1px solid rgba(168,174,181,0.08);
        }
        .cv-suggest-btn {
            display: flex; align-items: center; gap: 10px;
            padding: 10px 14px; border-radius: 14px;
            background: rgba(255,255,255,0.8); border: 1px solid rgba(168,174,181,0.12);
            cursor: pointer; transition: all 0.25s cubic-bezier(0.34,1.56,0.64,1);
            text-align: left;
        }
        .cv-suggest-btn:hover {
            background: rgba(0,82,208,0.06); border-color: rgba(0,82,208,0.2);
            transform: translateX(4px);
        }
        .cv-suggest-icon { font-size: 16px; flex-shrink: 0; }
        .cv-suggest-text { font-size: 12px; color: #2a2f35; font-weight: 500; line-height: 1.4; }

        /* ── Voice Chips ── */
        .cv-voices {
            padding: 8px 16px; background: rgba(255,255,255,0.6);
            backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
            border-top: 1px solid rgba(168,174,181,0.08);
        }
        .cv-voices-row { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
        .cv-voice-chip {
            padding: 5px 12px; border-radius: 9999px;
            background: rgba(168,174,181,0.15); border: none;
            font-size: 11px; font-weight: 600; color: #565c63; cursor: pointer;
            transition: all 0.2s cubic-bezier(0.34,1.56,0.64,1);
        }
        .cv-voice-chip:hover { background: rgba(0,82,208,0.1); color: #0052d0; }
        .cv-voice-chip.active {
            background: #0052d0; color: #f1f2ff;
            box-shadow: 0 2px 8px rgba(0,82,208,0.25);
        }
        .cv-voice-more {
            padding: 5px 10px; border-radius: 9999px; background: none; border: none;
            font-size: 10px; font-weight: 700; color: #0052d0; cursor: pointer;
            text-transform: uppercase; letter-spacing: 0.05em;
        }
        .cv-voice-more:hover { text-decoration: underline; }
        .cv-voices-extra {
            display: none; flex-wrap: wrap; gap: 4px; margin-top: 6px;
            padding-top: 6px; border-top: 1px solid rgba(168,174,181,0.12);
            max-height: 140px; overflow-y: auto;
        }
        .cv-voices-group-label {
            width: 100%; font-size: 9px; font-weight: 700; text-transform: uppercase;
            letter-spacing: 0.1em; color: #94a3b8; margin-top: 4px;
        }
        .cv-voice-chip-sm {
            padding: 4px 10px; border-radius: 9999px;
            background: rgba(168,174,181,0.1); border: none;
            font-size: 10px; font-weight: 500; color: #565c63; cursor: pointer;
            transition: all 0.15s;
        }
        .cv-voice-chip-sm:hover { background: rgba(0,82,208,0.1); color: #0052d0; }
        .cv-voice-chip-sm.active { background: #0052d0; color: #f1f2ff; }

        /* ── Input Area ── */
        .cv-input-area {
            display: flex; align-items: center; gap: 8px; padding: 12px 16px;
            background: rgba(255,255,255,0.8); backdrop-filter: blur(20px);
            border-top: 1px solid rgba(168,174,181,0.12);
        }
        .cv-input-area input {
            flex: 1; border: none; border-radius: 16px; padding: 12px 16px;
            font-size: 14px; font-family: 'Inter', sans-serif; outline: none;
            background: rgba(235,241,250,0.5); color: #2a2f35;
            transition: all 0.2s;
        }
        .cv-input-area input:focus { background: rgba(235,241,250,0.8); box-shadow: 0 0 0 2px rgba(0,82,208,0.12); }
        .cv-input-area input::placeholder { color: #94a3b8; }
        .cv-mic-btn {
            width: 44px; height: 44px; border-radius: 50%; border: none; cursor: pointer;
            background: rgba(220,227,237,0.8); color: #0052d0;
            display: flex; align-items: center; justify-content: center; flex-shrink: 0;
            transition: all 0.25s cubic-bezier(0.34,1.56,0.64,1);
        }
        .cv-mic-btn:hover { background: #0052d0; color: white; transform: scale(1.08); }
        .cv-mic-btn:active { transform: scale(0.92); }
        .cv-mic-btn.recording { background: #b31b25; color: white; animation: cvMicPulse 1s ease-in-out infinite; }
        @keyframes cvMicPulse { 0%,100% { box-shadow: 0 0 0 0 rgba(179,27,37,0.4); } 50% { box-shadow: 0 0 0 10px rgba(179,27,37,0); } }
        .cv-send-btn {
            width: 36px; height: 36px; border-radius: 50%; border: none; cursor: pointer;
            background: rgba(168,174,181,0.15); color: #565c63;
            display: flex; align-items: center; justify-content: center; flex-shrink: 0;
            transition: all 0.2s;
        }
        .cv-send-btn:hover { background: #0052d0; color: white; }

        /* ── Mobile ── */
        @media (max-width: 480px) {
            #conversa-container { bottom: 16px; right: 16px; }
            #conversa-bubble { width: 52px; height: 52px; }
            #conversa-panel { width: calc(100vw - 32px); height: calc(100vh - 100px); border-radius: 20px; }
        }

        /* ── Scrollbar ── */
        .cv-messages::-webkit-scrollbar { width: 4px; }
        .cv-messages::-webkit-scrollbar-track { background: transparent; }
        .cv-messages::-webkit-scrollbar-thumb { background: rgba(0,82,208,0.15); border-radius: 4px; }
        .cv-voices-extra::-webkit-scrollbar { width: 3px; }
        .cv-voices-extra::-webkit-scrollbar-thumb { background: rgba(0,82,208,0.15); border-radius: 3px; }
    `;
    document.head.appendChild(s);
})();
