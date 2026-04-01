// === PROGRESS GRAPH + FEEDBACK COMPONENT ===
(function() {
    const CONVEX_URL = 'https://wooden-manatee-881.convex.cloud';
    let analysesData = [];

    // Fetch analyses from Convex
    async function loadAnalyses() {
        // Get student slug from page context
        const slug = window.__STUDENT_SLUG || document.querySelector('[data-student-slug]')?.dataset.studentSlug;
        if (!slug) return;

        try {
            const resp = await fetch(CONVEX_URL + '/api/query', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: 'analytics:getProgressChart', args: { studentId: window.__STUDENT_ID } })
            });
            const data = await resp.json();
            if (data.status === 'success' && data.value) {
                analysesData = data.value;
                renderChart();
            }
        } catch (e) {
            console.error('Failed to load analyses:', e);
        }
    }

    // Also load full analysis details
    async function loadFullAnalyses() {
        try {
            window.__FULL_ANALYSES = [];
            window.__CONVEX_LESSONS_MAP = {};
            const [analysisResp, lessonsResp] = await Promise.all([
                fetch(CONVEX_URL + '/api/query', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ path: 'analytics:getStudentAnalyses', args: { studentId: window.__STUDENT_ID, limit: 50 } })
                }),
                fetch(CONVEX_URL + '/api/query', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ path: 'students:listLessons', args: { studentId: window.__STUDENT_ID } })
                })
            ]);
            const [analysisData, lessonsData] = await Promise.all([analysisResp.json(), lessonsResp.json()]);
            if (analysisData.status === 'success' && Array.isArray(analysisData.value)) {
                window.__FULL_ANALYSES = analysisData.value;
            }
            if (lessonsData.status === 'success' && Array.isArray(lessonsData.value)) {
                window.__CONVEX_LESSONS_MAP = Object.fromEntries(
                    lessonsData.value
                        .filter((lesson) => lesson?._id)
                        .map((lesson) => [lesson._id, lesson])
                );
            }
            if (Array.isArray(window.__FULL_ANALYSES)) {
                renderLessonsDashboard();
                renderCumulativeAnalysis();
            }
        } catch(e) {
            console.error('Failed to load full analyses:', e);
        }
    }

    function renderCumulativeAnalysis() {
        const section = document.getElementById('cumulativeAnalysisSection');
        const card = document.getElementById('cumulativeAnalysisCard');
        const analyses = Array.isArray(window.__FULL_ANALYSES) ? window.__FULL_ANALYSES.filter(Boolean) : [];

        if (!section || !card) return;
        if (!analyses.length) {
            section.classList.add('hidden');
            card.innerHTML = '';
            return;
        }

        const average = (values) => {
            const nums = values.map((value) => Number(value)).filter((value) => Number.isFinite(value));
            return nums.length ? nums.reduce((sum, value) => sum + value, 0) / nums.length : 0;
        };
        const clampScore = (value) => Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
        const toBand = (score) => {
            if (score >= 85) return 'C2';
            if (score >= 70) return 'C1';
            if (score >= 55) return 'B2';
            return 'B1';
        };
        const scoreTone = (score) => score >= 70 ? 'bg-blue-500' : score >= 55 ? 'bg-amber-500' : 'bg-rose-500';
        const normalizeTheme = (text) => String(text || '')
            .toLowerCase()
            .replace(/&/g, 'and')
            .replace(/[^a-z0-9\s]/g, ' ')
            .replace(/\b(the|a|an|to|of|in|on|for|with|more|better|strong|stronger|use|using)\b/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        const stripMarkdown = (text) => String(text || '').replace(/\*\*/g, '').replace(/__/g, '').replace(/[*_]{1,2}([^*_]+)[*_]{1,2}/g, '$1');
        const summarizeTheme = (text) => {
            const cleaned = stripMarkdown(String(text || '').trim().replace(/\s+/g, ' '));
            if (!cleaned) return '';
            return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
        };
        const aggregateThemes = (items) => {
            const map = new Map();
            items.forEach((item) => {
                const label = summarizeTheme(item);
                const key = normalizeTheme(label);
                if (!key || key.length < 3) return;
                if (!map.has(key)) {
                    map.set(key, { label, count: 0 });
                }
                map.get(key).count += 1;
            });
            return Array.from(map.values())
                .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
                ;
        };
        const summaryFragments = (analyses.map((analysis) => String(analysis.lessonSummary || '').trim()).filter(Boolean));

        const sortedAnalyses = analyses.slice().sort((a, b) => {
            const aTime = getAnalysisSortTimestamp(a);
            const bTime = getAnalysisSortTimestamp(b);
            return aTime - bTime || Number(a?.createdAt || 0) - Number(b?.createdAt || 0);
        });

        const scoreConfig = [
            { key: 'vocabularyRange', label: 'Vocabulary' },
            { key: 'grammaticalAccuracy', label: 'Grammar' },
            { key: 'fluencyAndCoherence', label: 'Fluency' },
            { key: 'pronunciation', label: 'Pronunciation' },
            { key: 'communicativeEffectiveness', label: 'Communication' }
        ];
        const scoreAverages = scoreConfig.map((item) => {
            const value = average(analyses.map((analysis) => analysis[item.key]));
            return { ...item, value: clampScore(value) };
        });
        const overallAverage = clampScore(average(analyses.map((analysis) => analysis.overallScore)));
        const latestCefr = sortedAnalyses.length ? sortedAnalyses[sortedAnalyses.length - 1]?.cefrBand : '';
        const overallBand = latestCefr || toBand(overallAverage);

        const midpoint = Math.ceil(sortedAnalyses.length / 2);
        const firstHalf = sortedAnalyses.slice(0, midpoint);
        const secondHalf = sortedAnalyses.slice(midpoint);
        const firstHalfAvg = average(firstHalf.map((analysis) => analysis.overallScore));
        const secondHalfAvg = average((secondHalf.length ? secondHalf : firstHalf).map((analysis) => analysis.overallScore));
        const trendDelta = secondHalfAvg - firstHalfAvg;
        const trend = sortedAnalyses.length < 2
            ? { icon: 'trending_flat', label: 'Steady', color: 'text-amber-600', bg: 'bg-amber-50' }
            : trendDelta > 3
            ? { icon: 'trending_up', label: 'Improving', color: 'text-emerald-600', bg: 'bg-emerald-50' }
            : trendDelta < -3
                ? { icon: 'trending_down', label: 'Needs attention', color: 'text-rose-600', bg: 'bg-rose-50' }
                : { icon: 'trending_flat', label: 'Steady', color: 'text-amber-600', bg: 'bg-amber-50' };

        const strengths = aggregateThemes(analyses.flatMap((analysis) => getAnalysisListField(analysis, 'strengths', 'strengthSummary')));
        const improvements = aggregateThemes(analyses.flatMap((analysis) => getAnalysisListField(analysis, 'improvements', 'improvementsSummary')));

        // Collect errors by category with details
        const errorsByCategory = {};
        analyses.forEach((analysis) => {
            (Array.isArray(analysis.keyErrors) ? analysis.keyErrors : []).forEach((entry) => {
                const category = String(entry?.category || '').toLowerCase();
                if (!category) return;
                if (!errorsByCategory[category]) errorsByCategory[category] = [];
                errorsByCategory[category].push({
                    error: normalizeAnalysisText(entry?.error),
                    correction: normalizeAnalysisText(entry?.correction),
                    lesson: analysis.lessonTitle || analysis.date || '',
                    date: analysis.date || ''
                });
            });
        });
        const errorCounts = Object.fromEntries(Object.entries(errorsByCategory).map(([k, v]) => [k, v.length]));
        const errorMeta = [
            { key: 'grammar', label: 'Grammar', icon: 'spellcheck', classes: 'bg-rose-50 text-rose-700 border border-rose-200', dotClass: 'bg-rose-400' },
            { key: 'vocabulary', label: 'Vocabulary', icon: 'menu_book', classes: 'bg-amber-50 text-amber-700 border border-amber-200', dotClass: 'bg-amber-400' },
            { key: 'pronunciation', label: 'Pronunciation', icon: 'record_voice_over', classes: 'bg-sky-50 text-sky-700 border border-sky-200', dotClass: 'bg-sky-400' }
        ].filter((item) => errorCounts[item.key]);

        const summaryHighlights = aggregateThemes(summaryFragments).map((item) => item.label.toLowerCase());
        const highlightText = summaryHighlights.length
            ? `Across recent lessons, the work consistently highlights ${summaryHighlights.slice(0, 2).join(' and ')}.`
            : 'Across recent lessons, the student is building a broader, more confident command of English.';
        const strengthLine = strengths.length
            ? `The strongest recurring wins are ${strengths.map((item) => item.label.toLowerCase()).slice(0, 2).join(' and ')}.`
            : 'The strongest recurring wins show up in confidence, consistency, and lesson-to-lesson carryover.';
        const nextStepSource = improvements.length
            ? improvements[0].label.toLowerCase()
            : scoreAverages.slice().sort((a, b) => a.value - b.value)[0]?.label.toLowerCase() || 'accuracy under pressure';
        const encouragementLine = `Keep pushing on ${nextStepSource}, and the overall profile should continue to strengthen with each lesson.`;
        const summaryBullets = [highlightText, strengthLine, encouragementLine].filter(Boolean);

        card.innerHTML = `
            <div class="space-y-5">
                <!-- Header -->
                <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                        <p class="font-label text-[11px] font-bold uppercase tracking-[0.28em] text-sky-700">Cumulative Analysis</p>
                        <h2 class="mt-2 font-headline text-3xl text-slate-900 sm:text-4xl">Overall Assessment</h2>
                    </div>
                    <div class="flex flex-wrap items-center gap-3">
                        <a href="progress_report_1774802121.pdf" download class="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-4 py-2 font-label text-[11px] font-bold uppercase tracking-[0.18em] text-blue-700 transition hover:border-blue-300 hover:bg-blue-100">
                            <span class="material-symbols-outlined text-[18px]">picture_as_pdf</span>
                            <span>Download Progress Report</span>
                        </a>
                        <div class="inline-flex items-center rounded-full bg-white px-4 py-2 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.18)]">
                            <span class="cefr-badge text-primary">${overallBand}</span>
                        </div>
                        <div class="inline-flex items-center gap-2 rounded-full px-4 py-2 ${trend.bg}">
                            <span class="material-symbols-outlined text-[18px] ${trend.color}">${trend.icon}</span>
                            <span class="font-label text-[11px] font-bold uppercase tracking-[0.2em] ${trend.color}">${trend.label}</span>
                        </div>
                    </div>
                </div>

                <!-- Score bars + Overall score badge row -->
                <div class="rounded-[1.5rem] bg-white/80 p-4 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.14)] sm:p-5">
                    <button type="button" onclick="toggleOverallDetails()" class="flex w-full flex-col gap-3 rounded-[1rem] border border-slate-200/80 bg-slate-50/80 px-4 py-3 text-left transition hover:border-slate-300 hover:bg-slate-100/80" aria-expanded="false" aria-controls="overallDetailsPanel" id="overallDetailsToggle">
                        <div class="flex items-center justify-between gap-3">
                            <div class="flex items-center gap-2">
                                <span class="text-sm text-slate-400">Overall:</span>
                                <span class="text-lg font-bold ${overallAverage >= 70 ? 'text-blue-600' : overallAverage >= 55 ? 'text-amber-600' : 'text-rose-600'}">${overallAverage}%</span>
                            </div>
                            <span class="material-symbols-outlined text-[18px] transition-transform duration-200" id="overallChevron">expand_more</span>
                        </div>
                        <div id="compactMetricsRow" class="grid grid-cols-5 gap-x-3 gap-y-0">
                            ${scoreAverages.map((item) => `
                                <div class="flex flex-col items-center gap-1">
                                    <span class="text-[10px] font-semibold text-slate-500 leading-none">${item.label}</span>
                                    <div class="w-full h-1.5 rounded-full bg-slate-200/80 overflow-hidden">
                                        <div class="h-full rounded-full ${scoreTone(item.value)} transition-all duration-500" style="width:${item.value}%"></div>
                                    </div>
                                    <span class="text-[11px] font-bold ${item.value >= 70 ? 'text-blue-600' : item.value >= 55 ? 'text-amber-600' : 'text-rose-600'} leading-none">${item.value}%</span>
                                </div>
                            `).join('')}
                        </div>
                    </button>
                    <div id="overallDetailsPanel" class="overflow-hidden transition-all duration-300" style="max-height:0;opacity:0">
                        <div class="pt-4">
                            <div class="grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-5">
                                ${scoreAverages.map((item) => `
                                    <div>
                                        <div class="mb-1.5 flex items-center justify-between gap-2">
                                            <span class="text-[13px] font-semibold text-slate-700">${item.label}</span>
                                            <span class="text-[13px] font-bold ${item.value >= 70 ? 'text-blue-600' : item.value >= 55 ? 'text-amber-600' : 'text-rose-600'}">${item.value}%</span>
                                        </div>
                                        <div class="analysis-score-bar">
                                            <div class="analysis-score-fill ${scoreTone(item.value)} cumulative-score-fill" data-score-width="${item.value}" style="width:0%"></div>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                            <div class="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                                <p class="text-sm text-slate-500">Based on ${analyses.length} lessons analyzed</p>
                            </div>
                            <div class="mt-4 grid gap-4 lg:grid-cols-2">
                                <div class="rounded-[1.5rem] bg-white/85 p-4 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.14)]">
                                    <div class="mb-3 flex items-center gap-2">
                                        <span class="material-symbols-outlined text-[18px] text-emerald-600">check_circle</span>
                                        <p class="font-label text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">Top Strengths</p>
                                    </div>
                                    <ul class="space-y-2">
                                        ${(strengths.length ? strengths : [{ label: 'Strengths will appear as more analyses are added.' }]).map((item) => `
                                            <li class="flex gap-2 text-sm leading-relaxed text-slate-700">
                                                <span class="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400"></span>
                                                <span>${escapeHtml(item.label)}</span>
                                            </li>
                                        `).join('')}
                                    </ul>
                                </div>
                                <div class="rounded-[1.5rem] bg-white/85 p-4 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.14)]">
                                    <div class="mb-3 flex items-center gap-2">
                                        <span class="material-symbols-outlined text-[18px] text-amber-600">arrow_circle_up</span>
                                        <p class="font-label text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">Areas To Improve</p>
                                    </div>
                                    <ul class="space-y-2">
                                        ${(improvements.length ? improvements : [{ label: 'Improvement priorities will appear as more analyses are added.' }]).map((item) => `
                                            <li class="flex gap-2 text-sm leading-relaxed text-slate-700">
                                                <span class="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400"></span>
                                                <span>${escapeHtml(item.label)}</span>
                                            </li>
                                        `).join('')}
                                    </ul>
                                </div>
                            </div>

                            <!-- Error patterns — clickable expandable -->
                            ${errorMeta.length ? `
                            <div class="mt-4 space-y-3" id="errorPatternsContainer">
                                <div class="flex flex-wrap items-center gap-2">
                                    <p class="mr-1 font-label text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">Error Patterns:</p>
                                    ${errorMeta.map((item) => `
                                        <button type="button" class="error-category-btn group inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-200 cursor-pointer hover:scale-105 hover:shadow-sm ${item.classes}" data-error-category="${item.key}">
                                            <span class="material-symbols-outlined text-[16px]">${item.icon}</span>
                                            <span>${escapeHtml(item.label)}</span>
                                            <span class="ml-0.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-white/60 px-1 text-[10px] font-bold">${errorCounts[item.key]}</span>
                                            <span class="material-symbols-outlined text-[14px] transition-transform duration-200 group-hover:translate-y-px">expand_more</span>
                                        </button>
                                    `).join('')}
                                </div>
                                <div id="errorDetailPanel" class="overflow-hidden transition-all duration-300 ease-in-out" style="max-height:0;opacity:0">
                                    <div class="rounded-[1.25rem] border border-slate-200/80 bg-white/90 p-4">
                                        <div class="mb-3 flex items-center justify-between">
                                            <div class="flex items-center gap-2">
                                                <span id="errorDetailIcon" class="material-symbols-outlined text-[20px]"></span>
                                                <p id="errorDetailTitle" class="font-label text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500"></p>
                                                <span id="errorDetailCount" class="text-[11px] text-slate-400"></span>
                                            </div>
                                            <button type="button" id="errorDetailClose" class="material-symbols-outlined text-[18px] text-slate-400 hover:text-slate-600 transition-colors cursor-pointer">close</button>
                                        </div>
                                        <ul id="errorDetailList" class="space-y-2.5"></ul>
                                    </div>
                                </div>
                            </div>
                            ` : ''}
                        </div>
                    </div>
                </div>

                <!-- Teacher summary — broken into bullet points -->
                <div class="rounded-[1.5rem] border border-slate-200/80 bg-white/70 px-5 py-4 sm:px-6">
                    <div class="flex items-center gap-2 mb-3">
                        <span class="material-symbols-outlined text-[20px] text-slate-400">format_quote</span>
                        <p class="font-label text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">Teacher's Assessment</p>
                    </div>
                    <ul class="space-y-2">
                        ${summaryBullets.map((text) => `
                            <li class="flex gap-2 text-sm leading-relaxed text-slate-600">
                                <span class="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300"></span>
                                <span>${escapeHtml(text)}</span>
                            </li>
                        `).join('')}
                    </ul>
                </div>
            </div>
        `;

        section.classList.remove('hidden');
        requestAnimationFrame(() => {
            card.querySelectorAll('.cumulative-score-fill').forEach((fill) => {
                fill.style.width = `${fill.dataset.scoreWidth || 0}%`;
            });
        });

        // Wire up error pattern category buttons
        const errBtns = card.querySelectorAll('.error-category-btn');
        const errPanel = document.getElementById('errorDetailPanel');
        const errList = document.getElementById('errorDetailList');
        const errTitle = document.getElementById('errorDetailTitle');
        const errIcon = document.getElementById('errorDetailIcon');
        const errCount = document.getElementById('errorDetailCount');
        const errClose = document.getElementById('errorDetailClose');
        let activeErrCategory = null;

        const categoryMeta = { grammar: { icon: 'spellcheck', color: 'text-rose-600' }, vocabulary: { icon: 'menu_book', color: 'text-amber-600' }, pronunciation: { icon: 'record_voice_over', color: 'text-sky-600' } };

        function closeErrPanel() {
            if (errPanel) { errPanel.style.maxHeight = '0px'; errPanel.style.opacity = '0'; }
            activeErrCategory = null;
            errBtns.forEach((b) => b.classList.remove('ring-2', 'ring-offset-1', 'scale-105', 'shadow-sm'));
        }

        function openErrPanel(cat) {
            if (!errorsByCategory[cat] || !errPanel) return;
            const meta = categoryMeta[cat] || {};
            activeErrCategory = cat;
            errTitle.textContent = cat.charAt(0).toUpperCase() + cat.slice(1) + ' Errors';
            errIcon.textContent = meta.icon || 'error';
            errIcon.className = 'material-symbols-outlined text-[20px] ' + (meta.color || 'text-slate-600');
            errCount.textContent = errorsByCategory[cat].length + ' found';

            // Deduplicate errors by error+correction text
            const seen = new Set();
            const unique = [];
            errorsByCategory[cat].forEach((e) => {
                const key = (e.error + '|' + e.correction).toLowerCase();
                if (!seen.has(key)) { seen.add(key); unique.push(e); }
            });

            errList.innerHTML = unique.map((e) => `
                <li class="flex items-start gap-3 text-sm">
                    <span class="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${categoryMeta[cat]?.color === 'text-rose-600' ? 'bg-rose-400' : categoryMeta[cat]?.color === 'text-amber-600' ? 'bg-amber-400' : 'bg-sky-400'}"></span>
                    <div class="flex-1 min-w-0">
                        <span class="font-medium text-slate-700 line-through decoration-rose-300/60">${escapeHtml(e.error)}</span>
                        <span class="mx-1.5 text-slate-300">→</span>
                        <span class="font-medium text-slate-900">${escapeHtml(e.correction)}</span>
                    </div>
                </li>
            `).join('');

            // Animate open
            errPanel.style.maxHeight = errPanel.scrollHeight + 200 + 'px';
            errPanel.style.opacity = '1';

            // Highlight active button
            errBtns.forEach((b) => {
                if (b.dataset.errorCategory === cat) {
                    b.classList.add('ring-2', 'ring-offset-1', 'scale-105', 'shadow-sm');
                } else {
                    b.classList.remove('ring-2', 'ring-offset-1', 'scale-105', 'shadow-sm');
                }
            });
        }

        errBtns.forEach((btn) => {
            btn.addEventListener('click', () => {
                const cat = btn.dataset.errorCategory;
                if (activeErrCategory === cat) { closeErrPanel(); } else { openErrPanel(cat); }
            });
        });
        if (errClose) errClose.addEventListener('click', closeErrPanel);
    }

    // Simple canvas chart (no external lib needed)
    function renderChart() {
        const canvas = document.getElementById('progressChart');
        if (!canvas || !analysesData.length) return;

        const container = document.getElementById('chartContainer');
        const ctx = canvas.getContext('2d');
        const rect = container.getBoundingClientRect();
        canvas.width = rect.width * 2;
        canvas.height = rect.height * 2;
        canvas.style.width = rect.width + 'px';
        canvas.style.height = rect.height + 'px';
        ctx.scale(2, 2);

        const w = rect.width;
        const h = rect.height;
        const pad = { top: 30, right: 20, bottom: 40, left: 45 };
        const chartW = w - pad.left - pad.right;
        const chartH = h - pad.top - pad.bottom;

        const sorted = [...analysesData].sort((a, b) => new Date(a.date) - new Date(b.date));

        // CEFR bands background with subtle liquid glass gradient
        const bands = [
            { label: 'C2', min: 85, max: 100, color: 'rgba(6,95,70,0.05)' },
            { label: 'C1', min: 70, max: 85, color: 'rgba(37,99,235,0.05)' },
            { label: 'B2', min: 55, max: 70, color: 'rgba(180,83,9,0.04)' },
            { label: 'B1', min: 40, max: 55, color: 'rgba(190,24,93,0.04)' },
        ];

        bands.forEach(b => {
            const y1 = pad.top + chartH * (1 - (b.max - 30) / 70);
            const y2 = pad.top + chartH * (1 - (b.min - 30) / 70);
            const gradient = ctx.createLinearGradient(pad.left, y1, pad.left + chartW, y2);
            gradient.addColorStop(0, b.color);
            gradient.addColorStop(1, b.color.replace(/[\d.]+\)$/, '0.02)'));
            ctx.fillStyle = gradient;
            ctx.fillRect(pad.left, y1, chartW, y2 - y1);
            ctx.fillStyle = '#94a3b8';
            ctx.font = '9px Inter, sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText(b.label, pad.left - 6, (y1 + y2) / 2 + 3);
        });

        // Subtle grid
        ctx.strokeStyle = 'rgba(226,232,240,0.5)';
        ctx.lineWidth = 0.5;
        for (let v = 40; v <= 100; v += 15) {
            const y = pad.top + chartH * (1 - (v - 30) / 70);
            ctx.beginPath();
            ctx.moveTo(pad.left, y);
            ctx.lineTo(pad.left + chartW, y);
            ctx.stroke();
        }

        ctx.fillStyle = '#94a3b8';
        ctx.font = '10px Inter, sans-serif';
        ctx.textAlign = 'right';
        for (let v = 40; v <= 100; v += 15) {
            const y = pad.top + chartH * (1 - (v - 30) / 70);
            ctx.fillText(v, pad.left - 8, y + 3);
        }

        // Lines with gradient strokes
        const lines = [
            { key: 'overallScore', color: '#3b82f6', colorEnd: '#8b5cf6', width: 2.5 },
            { key: 'vocabularyRange', color: '#10b981', colorEnd: '#34d399', width: 1.5 },
            { key: 'fluencyAndCoherence', color: '#f59e0b', colorEnd: '#fbbf24', width: 1.5 },
            { key: 'grammaticalAccuracy', color: '#fb7185', colorEnd: '#f472b6', width: 1.5 },
            { key: 'pronunciation', color: '#a78bfa', colorEnd: '#c084fc', width: 1.5 },
        ];

        const activeMetric = window.activeLegendMetric || 'overallScore';
        // Draw non-active lines first (dimmed), then active line on top
        const sortedLines = [...lines].sort((a, b) => (a.key === activeMetric ? 1 : 0) - (b.key === activeMetric ? 1 : 0));
        
        sortedLines.forEach(line => {
            const isActive = line.key === activeMetric;
            // Draw line with glow
            ctx.save();
            if (isActive) {
                ctx.shadowColor = line.color + '80';
                ctx.shadowBlur = 12;
                ctx.strokeStyle = line.color;
                ctx.lineWidth = line.width + 1.5;
            } else {
                ctx.shadowColor = 'transparent';
                ctx.shadowBlur = 0;
                ctx.strokeStyle = line.color + '30';
                ctx.lineWidth = line.width * 0.6;
            }
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';
            ctx.beginPath();

            sorted.forEach((d, i) => {
                const x = pad.left + (i / Math.max(sorted.length - 1, 1)) * chartW;
                const y = pad.top + chartH * (1 - ((d[line.key] || 50) - 30) / 70);
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            });
            ctx.stroke();
            ctx.restore();

            // Small canvas dots
            sorted.forEach((d, i) => {
                const x = pad.left + (i / Math.max(sorted.length - 1, 1)) * chartW;
                const y = pad.top + chartH * (1 - ((d[line.key] || 50) - 30) / 70);
                ctx.fillStyle = isActive ? line.color : line.color + '30';
                ctx.beginPath();
                const dotR = isActive ? (line.key === 'overallScore' ? 5 : 3.5) : 1.5;
                ctx.arc(x, y, dotR, 0, Math.PI * 2);
                ctx.fill();
                if (isActive && line.key === 'overallScore') {
                    ctx.fillStyle = 'white';
                    ctx.beginPath();
                    ctx.arc(x, y, 2.5, 0, Math.PI * 2);
                    ctx.fill();
                }
            });
        });

        // X-axis labels
        ctx.fillStyle = '#64748b';
        ctx.font = '9px Inter, sans-serif';
        ctx.textAlign = 'center';
        const step = Math.max(1, Math.floor(sorted.length / 6));
        sorted.forEach((d, i) => {
            if (i % step === 0 || i === sorted.length - 1) {
                const x = pad.left + (i / Math.max(sorted.length - 1, 1)) * chartW;
                const parts = d.date.split('-');
                ctx.fillText(parts[2] + '/' + parts[1], x, h - pad.bottom + 18);
            }
        });

        // === Build interactive HTML data points for ALL metric lines ===
        // Remove old points
        container.querySelectorAll('.chart-data-point').forEach(el => el.remove());

        const metricColors = {
            overallScore: { from: '#3b82f6', to: '#6366f1', label: 'Overall' },
            vocabularyRange: { from: '#10b981', to: '#34d399', label: 'Vocabulary' },
            fluencyAndCoherence: { from: '#f59e0b', to: '#fbbf24', label: 'Fluency' },
            grammaticalAccuracy: { from: '#fb7185', to: '#f472b6', label: 'Grammar' },
            pronunciation: { from: '#a78bfa', to: '#c084fc', label: 'Pronunciation' }
        };

        // Create points for each metric line
        lines.forEach(line => {
            sorted.forEach((d, i) => {
                const x = pad.left + (i / Math.max(sorted.length - 1, 1)) * chartW;
                const y = pad.top + chartH * (1 - ((d[line.key] || 50) - 30) / 70);
                const isLatest = i === sorted.length - 1;
                const isOverall = line.key === 'overallScore';
                const mc = metricColors[line.key];

                const point = document.createElement('div');
                point.className = 'chart-data-point' + (isLatest && isOverall ? ' is-latest' : '');
                point.style.left = x + 'px';
                point.style.top = y + 'px';
                point.style.background = `radial-gradient(circle, ${mc.from} 0%, ${mc.to} 100%)`;
                if (!isOverall) {
                    point.style.width = '11px';
                    point.style.height = '11px';
                    point.style.opacity = '0.85';
                }
                point.dataset.analysisIndex = i;
                point.dataset.metric = line.key;
                point.dataset.metricLabel = mc.label;
                point.title = `${mc.label}: ${Math.round(d[line.key] || 0)} — click for details`;

                // Hover tooltip
                point.addEventListener('mouseenter', () => {
                    showChartTooltip(d, x, y, container, line.key);
                });
                point.addEventListener('mouseleave', () => {
                    hideChartTooltip();
                });

                // Click to expand detail
                point.addEventListener('click', () => {
                    toggleChartDetail(d, i, point, line.key);
                });

                container.appendChild(point);
            });
        });

        // Update latest badge
        if (sorted.length > 0) {
            const latest = sorted[sorted.length - 1];
            const badge = document.getElementById('latestCefrBadge');
            if (badge) {
                badge.innerHTML = `<span class="cefr-badge text-primary">${latest.cefrBand}</span>
                    <p class="font-label text-[10px] text-slate-500 uppercase tracking-widest mt-0.5">${Math.round(latest.overallScore)}/100</p>`;
            }
        }
    }

    // === Tooltip & Detail Panel ===
    function showChartTooltip(d, px, py, container, metric) {
        const tooltip = document.getElementById('chartTooltip');
        const content = document.getElementById('tooltipContent');
        if (!tooltip || !content) return;

        const lesson = getLessonForAnalysis ? getLessonForAnalysis(d) : null;
        const title = lesson?.title || d.title || d.lessonTitle || 'Lesson';
        const date = d.date ? formatLessonDate(getResolvedAnalysisDate ? getResolvedAnalysisDate(d) : d.date) : '';
        const metricLabels = { overallScore: 'Overall', vocabularyRange: 'Vocabulary', fluencyAndCoherence: 'Fluency', grammaticalAccuracy: 'Grammar', pronunciation: 'Pronunciation' };
        const metricLabel = metricLabels[metric] || 'Overall';
        const metricVal = Math.round(d[metric] || d.overallScore || 0);
        const metricColors = { overallScore: 'text-blue-600', vocabularyRange: 'text-emerald-600', fluencyAndCoherence: 'text-amber-600', grammaticalAccuracy: 'text-rose-600', pronunciation: 'text-violet-600' };

        content.innerHTML = `
            <p class="font-headline text-base text-slate-900">${escapeHtml(title)}</p>
            <p class="text-[11px] text-slate-400 uppercase tracking-widest mt-0.5">${date}</p>
            <div class="flex items-center gap-2 mt-2">
                <span class="text-xs font-semibold text-slate-500">${metricLabel}:</span>
                <span class="text-sm font-bold ${metricColors[metric] || 'text-blue-600'}">${metricVal}/100</span>
                ${metric === 'overallScore' ? `<span class="cefr-badge text-primary ml-1">${d.cefrBand || 'B1'}</span>` : ''}
            </div>
            <p class="text-[11px] text-slate-400 mt-1.5">Click to expand details</p>
        `;

        const cRect = container.getBoundingClientRect();
        let left = px - 110;
        let top = py - 130;
        if (left < 0) left = 10;
        if (left + 240 > cRect.width) left = cRect.width - 250;
        if (top < 0) top = py + 20;

        tooltip.style.left = left + 'px';
        tooltip.style.top = top + 'px';
        tooltip.style.opacity = '1';
        tooltip.style.transform = 'translateY(0)';
    }

    function hideChartTooltip() {
        const tooltip = document.getElementById('chartTooltip');
        if (tooltip) {
            tooltip.style.opacity = '0';
            tooltip.style.transform = 'translateY(4px)';
        }
    }

    let activeChartPoint = null;

    // Global state for inline onclick on score cards
    window.__chartDetailState = { d: null, index: 0, metric: 'overallScore' };
    window.switchMetric = function(metricKey) {
        
        const st = window.__chartDetailState;
        if (st.d && metricKey) toggleChartDetail(st.d, st.index, null, metricKey);
    };

    // Active legend highlight state
    window.activeLegendMetric = 'overallScore';
    
    window.highlightChartLine = function(metric) {
        window.activeLegendMetric = metric;
        const metricPillColors = {
            overallScore: { bg: 'rgba(59,130,246,0.15)', border: 'rgba(59,130,246,0.5)', text: '#2563eb', shadow: '0 2px 8px rgba(59,130,246,0.2)' },
            vocabularyRange: { bg: 'rgba(16,185,129,0.15)', border: 'rgba(16,185,129,0.5)', text: '#059669', shadow: '0 2px 8px rgba(16,185,129,0.2)' },
            fluencyAndCoherence: { bg: 'rgba(245,158,11,0.15)', border: 'rgba(245,158,11,0.5)', text: '#d97706', shadow: '0 2px 8px rgba(245,158,11,0.2)' },
            grammaticalAccuracy: { bg: 'rgba(251,113,133,0.15)', border: 'rgba(251,113,133,0.5)', text: '#e11d48', shadow: '0 2px 8px rgba(251,113,133,0.2)' },
            pronunciation: { bg: 'rgba(167,139,250,0.15)', border: 'rgba(167,139,250,0.5)', text: '#7c3aed', shadow: '0 2px 8px rgba(167,139,250,0.2)' }
        };
        document.querySelectorAll('#chartLegendPills .liquid-legend-pill').forEach(pill => {
            const m = pill.dataset.legendMetric;
            if (m === metric) {
                const c = metricPillColors[metric] || metricPillColors.overallScore;
                pill.style.background = c.bg;
                pill.style.borderColor = c.border;
                pill.style.color = c.text;
                pill.style.fontWeight = '700';
                pill.style.transform = 'scale(1.12)';
                pill.style.boxShadow = c.shadow;
            } else {
                pill.style.background = '';
                pill.style.borderColor = '';
                pill.style.color = '';
                pill.style.fontWeight = '';
                pill.style.transform = '';
                pill.style.boxShadow = '';
            }
        });
        renderChart();
        const st = window.__chartDetailState;
        if (st && st.d) {
            toggleChartDetail(st.d, st.index, null, metric);
        }
    }

    function toggleChartDetail(d, index, pointEl, metric) {
        hideChartTooltip();
        // Store for inline onclick access
        window.__chartDetailState = { d, index, metric: metric || 'overallScore' };
        const panel = document.getElementById('chartDetailPanel');
        if (!panel) return;

        metric = metric || 'overallScore';
        const metricLabels = { overallScore: 'Overall', vocabularyRange: 'Vocabulary', fluencyAndCoherence: 'Fluency', grammaticalAccuracy: 'Grammar', pronunciation: 'Pronunciation' };
        const metricIcons = { overallScore: 'analytics', vocabularyRange: 'menu_book', fluencyAndCoherence: 'graphic_eq', grammaticalAccuracy: 'spellcheck', pronunciation: 'record_voice_over' };
        const metricGradients = { overallScore: 'from-blue-500/20 to-violet-500/20', vocabularyRange: 'from-emerald-500/20 to-teal-500/20', fluencyAndCoherence: 'from-amber-500/20 to-orange-500/20', grammaticalAccuracy: 'from-rose-500/20 to-pink-500/20', pronunciation: 'from-violet-500/20 to-purple-500/20' };
        const metricColors = { overallScore: 'text-blue-600', vocabularyRange: 'text-emerald-600', fluencyAndCoherence: 'text-amber-600', grammaticalAccuracy: 'text-rose-600', pronunciation: 'text-violet-600' };
        const metricLabel = metricLabels[metric] || 'Overall';

        // If clicking same point, close (skip if switching metric via score card)
        if (pointEl && activeChartPoint === index + '_' + metric) {
            panel.style.maxHeight = '0px';
            panel.style.opacity = '0';
            activeChartPoint = null;
            document.querySelectorAll('.chart-data-point').forEach(p => p.classList.remove('active'));
            return;
        }

        activeChartPoint = index + '_' + metric;
        document.querySelectorAll('.chart-data-point').forEach(p => p.classList.remove('active'));
        if (pointEl) pointEl.classList.add('active');

        const lesson = getLessonForAnalysis ? getLessonForAnalysis(d) : null;
        const title = lesson?.title || d.title || d.lessonTitle || 'Lesson';
        const date = d.date ? formatLessonDate(getResolvedAnalysisDate ? getResolvedAnalysisDate(d) : d.date) : '';

        // Populate header with metric icon
        const iconEl = document.getElementById('detailPanelIcon');
        iconEl.className = 'flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ' + (metricGradients[metric] || metricGradients.overallScore) + ' backdrop-blur-sm border border-white/30';
        iconEl.innerHTML = `<span class="material-symbols-outlined text-[20px] ${metricColors[metric] || 'text-blue-600'}">${metricIcons[metric] || 'analytics'}</span>`;
        document.getElementById('detailPanelTitle').textContent = title;
        document.getElementById('detailPanelDate').textContent = date + ' · ' + metricLabel;
        document.getElementById('detailPanelBadge').textContent = (d.cefrBand || 'B1') + ' ' + Math.round(d[metric] || d.overallScore);

        // Score mini-cards (highlight active metric)
        const scores = [
            { label: 'Vocabulary', value: d.vocabularyRange, gradient: 'from-emerald-400 to-emerald-600', key: 'vocabularyRange' },
            { label: 'Grammar', value: d.grammaticalAccuracy, gradient: 'from-rose-400 to-rose-600', key: 'grammaticalAccuracy' },
            { label: 'Fluency', value: d.fluencyAndCoherence, gradient: 'from-amber-400 to-amber-600', key: 'fluencyAndCoherence' },
            { label: 'Pronunciation', value: d.pronunciation || d.communicativeEffectiveness, gradient: 'from-sky-400 to-sky-600', key: 'pronunciation' },
            { label: 'Overall', value: d.overallScore, gradient: 'from-blue-400 to-violet-600', key: 'overallScore' },
        ];
        document.getElementById('detailPanelScores').innerHTML = scores.map(s => {
            const v = Math.round(s.value || 0);
            const tone = v >= 70 ? 'text-blue-600' : v >= 55 ? 'text-amber-600' : 'text-rose-600';
            const isActive = s.key === metric;
            const activeBg = s.key === 'vocabularyRange' ? 'rgba(16,185,129,0.08)' : s.key === 'grammaticalAccuracy' ? 'rgba(251,113,133,0.08)' : s.key === 'fluencyAndCoherence' ? 'rgba(245,158,11,0.08)' : s.key === 'pronunciation' ? 'rgba(167,139,250,0.08)' : 'rgba(59,130,246,0.08)';
            const activeText = s.key === 'vocabularyRange' ? 'text-emerald-600' : s.key === 'grammaticalAccuracy' ? 'text-rose-600' : s.key === 'fluencyAndCoherence' ? 'text-amber-600' : s.key === 'pronunciation' ? 'text-violet-600' : 'text-blue-600';
            const activeVal = s.key === 'vocabularyRange' ? 'text-emerald-700' : s.key === 'grammaticalAccuracy' ? 'text-rose-700' : s.key === 'fluencyAndCoherence' ? 'text-amber-700' : s.key === 'pronunciation' ? 'text-violet-700' : 'text-blue-700';
            const ringClr = s.key === 'vocabularyRange' ? 'ring-emerald-400/50' : s.key === 'grammaticalAccuracy' ? 'ring-rose-400/50' : s.key === 'fluencyAndCoherence' ? 'ring-amber-400/50' : s.key === 'pronunciation' ? 'ring-violet-400/50' : 'ring-blue-400/50';
            return `
                <button type="button" class="liquid-score-card cursor-pointer transition-all duration-200 ${isActive ? 'ring-2 ring-offset-1 scale-[1.04] shadow-md ' + ringClr : 'hover:scale-[1.02] hover:shadow-sm'}" style="${isActive ? 'background:' + activeBg : ''};border:none;outline:none;width:100%" data-switch-metric="${s.key}" data-switch-index="${index}">
                    <p class="text-[10px] font-semibold uppercase tracking-wider ${isActive ? activeText : 'text-slate-400'}">${s.label}</p>
                    <p class="text-lg font-bold ${isActive ? activeVal : tone}">${v}<span class="text-[10px] text-slate-300">%</span></p>
                    <div class="mt-1 h-1 rounded-full bg-slate-100 overflow-hidden">
                        <div class="h-full rounded-full bg-gradient-to-r ${s.gradient}" style="width:${v}%;transition:width 0.6s ease"></div>
                    </div>
                </button>
            `;
        }).join('');

        // Look up full analysis for deep content
        const fullAnalyses = Array.isArray(window.__FULL_ANALYSES) ? window.__FULL_ANALYSES : [];
        let fullA = d;
        if (fullAnalyses.length) {
            const chartTitle = (d.title || '').toLowerCase();
            const chartScore = Math.round(Number(d.overallScore || 0));
            fullA = fullAnalyses.find(a => a._id === d._id) ||
                    fullAnalyses.find(a => a.lessonId === d.lessonId) ||
                    fullAnalyses.find(a => {
                        const summary = (a.lessonSummary || '').toLowerCase();
                        return chartTitle && summary && (summary.includes(chartTitle) || chartTitle.includes(summary.substring(0, 30)));
                    }) ||
                    fullAnalyses.find(a => Math.round(Number(a.overallScore || 0)) === chartScore) ||
                    d;
        }

        const allStrengths = getAnalysisListField(fullA, 'strengths', 'strengthSummary');
        const allImprovements = getAnalysisListField(fullA, 'improvements', 'improvementsSummary');
        const errors = Array.isArray(fullA.keyErrors) ? fullA.keyErrors : [];

        const metricKeywords = {
            vocabularyRange: ['vocab', 'word', 'lexic', 'term', 'expression', 'phrase', 'idiom', 'register', 'formal', 'informal', 'language', 'range', 'breadth', 'topic'],
            fluencyAndCoherence: ['fluen', 'flow', 'hesitat', 'pause', 'natural', 'smooth', 'coherence', 'connect', 'discourse', 'pace', 'speed', 'rhythm', 'confident'],
            grammaticalAccuracy: ['grammar', 'tense', 'article', 'preposition', 'conditional', 'sentence', 'structure', 'agreement', 'plural', 'syntax', 'correct', 'error', 'accuracy'],
            pronunciation: ['pronun', 'sound', 'stress', 'intonation', 'clarity', 'accent', 'speech', 'articul', 'enunc', 'delivery'],
            overallScore: []
        };
        const metricErrorMap = {
            vocabularyRange: ['vocabulary'],
            fluencyAndCoherence: ['fluency'],
            grammaticalAccuracy: ['grammar'],
            pronunciation: ['pronunciation'],
            overallScore: ['grammar', 'vocabulary', 'pronunciation', 'fluency']
        };
        const metricSectionTitles = {
            overallScore: 'Overall Performance Analysis',
            vocabularyRange: 'Vocabulary Analysis',
            fluencyAndCoherence: 'Fluency Analysis',
            grammaticalAccuracy: 'Grammar Analysis',
            pronunciation: 'Pronunciation Analysis'
        };
        const metricInsightCopy = {
            overallScore: 'Snapshot of the full speaking performance at this point in the course.',
            vocabularyRange: 'Focused on word choice, range, precision, and topic-specific language.',
            fluencyAndCoherence: 'Focused on pace, flow, hesitation, and how clearly ideas connect.',
            grammaticalAccuracy: 'Focused on sentence control, grammar choices, and error patterns.',
            pronunciation: 'Focused on clarity, delivery, stress, and how easy the speech is to follow.'
        };
        const keywords = metricKeywords[metric] || [];
        const metricTitle = metricSectionTitles[metric] || 'Detailed Analysis';

        const filterByMetric = (items) => {
            if (metric === 'overallScore' || !keywords.length) return items;
            const filtered = items.filter((item) => keywords.some((keyword) => item.toLowerCase().includes(keyword)));
            return filtered.length ? filtered : [];
        };
        const metricStrengths = filterByMetric(allStrengths);
        const metricImprovements = filterByMetric(allImprovements);
        const errorCategories = metricErrorMap[metric] || [];
        const metricErrors = errorCategories.length
            ? errors.filter((entry) => {
                const category = String(entry?.category || '').toLowerCase();
                const errorText = normalizeAnalysisText(entry?.error).toLowerCase();
                const correctionText = normalizeAnalysisText(entry?.correction).toLowerCase();
                return errorCategories.includes(category) || keywords.some((keyword) => errorText.includes(keyword) || correctionText.includes(keyword));
            })
            : [];

        const sortedChartData = [...analysesData].sort((a, b) => new Date(a.date) - new Date(b.date));
        const priorPoint = index > 0 ? sortedChartData[index - 1] : null;
        const currentMetricValue = Math.round(Number(d[metric] || d.overallScore || 0));
        const previousMetricValue = priorPoint ? Math.round(Number(priorPoint[metric] || priorPoint.overallScore || 0)) : null;
        const metricDelta = previousMetricValue == null ? null : currentMetricValue - previousMetricValue;
        const trendDirection = metricDelta == null ? 'steady' : metricDelta > 0 ? 'up' : metricDelta < 0 ? 'down' : 'steady';
        const trendIcon = trendDirection === 'up' ? 'trending_up' : trendDirection === 'down' ? 'trending_down' : 'trending_flat';
        const trendTone = trendDirection === 'up'
            ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
            : trendDirection === 'down'
                ? 'text-rose-700 bg-rose-50 border-rose-200'
                : 'text-slate-600 bg-slate-50 border-slate-200';
        const trendSummary = metricDelta == null
            ? 'First recorded point for this metric.'
            : metricDelta === 0
                ? `Flat versus the previous lesson at ${previousMetricValue}/100.`
                : `${metricDelta > 0 ? '+' : ''}${metricDelta} points versus the previous lesson (${previousMetricValue}/100).`;
        const priorDateLabel = priorPoint?.date ? formatLessonDate(priorPoint.date) : '';

        const renderInsightItems = (items, toneClass, emptyState) => {
            if (!items.length) {
                return `<div class="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-3 py-2 text-xs leading-relaxed text-slate-500">${escapeHtml(emptyState)}</div>`;
            }
            return items.slice(0, 4).map((item) => `
                <div class="liquid-linked-item" ${lesson?.lessonKey ? `data-jump-lesson="${escapeHtml(lesson.lessonKey)}"` : ''}>
                    <span class="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full ${toneClass}"></span>
                    <span>${escapeHtml(item)}</span>
                </div>
            `).join('');
        };

        const errorBlock = metricErrors.length ? `
            <div class="rounded-2xl border border-rose-100 bg-rose-50/60 p-3">
                <p class="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-rose-600 mb-2 flex items-center gap-1.5">
                    <span class="material-symbols-outlined text-[16px]">error_outline</span>Specific Errors
                </p>
                <div class="space-y-1.5">
                    ${metricErrors.slice(0, 4).map((entry) => {
                        const errorText = normalizeAnalysisText(entry?.error);
                        const correctionText = normalizeAnalysisText(entry?.correction);
                        return `<div class="liquid-linked-item" ${lesson?.lessonKey ? `data-jump-lesson="${escapeHtml(lesson.lessonKey)}"` : ''}>
                            <span class="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-400"></span>
                            <span><strong class="line-through decoration-rose-300/60">${escapeHtml(errorText || 'Issue noted')}</strong>${correctionText ? ` → ${escapeHtml(correctionText)}` : ''}</span>
                        </div>`;
                    }).join('')}
                </div>
            </div>
        ` : '';

        document.getElementById('detailPanelBody').innerHTML = `
            <div class="lg:col-span-2 min-w-0 rounded-2xl border border-slate-200/80 bg-white/75 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
                <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div class="min-w-0">
                        <p class="font-label text-[10px] font-bold uppercase tracking-[0.22em] ${metricColors[metric] || 'text-blue-600'}">${escapeHtml(metricTitle)}</p>
                        <p class="mt-1 text-sm leading-relaxed text-slate-600">${escapeHtml(metricInsightCopy[metric] || 'Focused feedback for this metric.')}</p>
                    </div>
                    <div class="shrink-0 rounded-2xl border px-3 py-2 ${trendTone}">
                        <div class="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em]">
                            <span class="material-symbols-outlined text-[16px]">${trendIcon}</span>
                            <span>${metricLabel} trend</span>
                        </div>
                        <p class="mt-1 text-sm font-semibold normal-case tracking-normal">${escapeHtml(trendSummary)}</p>
                        ${priorDateLabel ? `<p class="mt-1 text-[11px] normal-case tracking-normal text-slate-500">Compared with ${escapeHtml(priorDateLabel)}</p>` : ''}
                    </div>
                </div>
            </div>
            <div class="min-w-0">
                <p class="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-600 mb-2 flex items-center gap-1.5">
                    <span class="material-symbols-outlined text-[16px]">check_circle</span>${metricLabel} strengths
                </p>
                <div class="space-y-1.5">
                    ${renderInsightItems(metricStrengths, 'bg-emerald-400', `No ${metricLabel.toLowerCase()} strengths were tagged for this lesson.`)}
                </div>
            </div>
            <div class="min-w-0 space-y-4">
                <div>
                    <p class="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-amber-600 mb-2 flex items-center gap-1.5">
                        <span class="material-symbols-outlined text-[16px]">arrow_circle_up</span>${metricLabel} improvements
                    </p>
                    <div class="space-y-1.5">
                        ${renderInsightItems(metricImprovements, 'bg-amber-400', `No ${metricLabel.toLowerCase()} improvement notes were tagged for this lesson.`)}
                    </div>
                </div>
                ${errorBlock}
            </div>
        `;

        // Jump to lesson button
        const actionDiv = document.getElementById('detailPanelAction');
        if (lesson?.lessonKey && lesson) {
            actionDiv.innerHTML = `
                <button type="button" class="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50/80 px-4 py-2 text-sm font-semibold text-blue-700 backdrop-blur-sm transition-all hover:bg-blue-100 hover:shadow-sm cursor-pointer" data-goto-lesson="${escapeHtml(lesson.lessonKey)}">
                    <span class="material-symbols-outlined text-[18px]">open_in_new</span>
                    Open in Lesson Browser
                </button>
            `;
        } else {
            actionDiv.innerHTML = '';
        }

        // Load verbatim quotes from transcript
        const quotesSection = document.getElementById('detailPanelQuotes');
        const quotesLabel = document.getElementById('detailPanelQuotesLabel');
        const quotesList = document.getElementById('quotesList');
        if (quotesSection && quotesList) {
            const quotesData = window.__VERBATIM_QUOTES || {};
            const studentName = window.__STUDENT_SLUG === 'szymon-karpinski' ? 'Szymon' : window.__STUDENT_SLUG === 'mikolaj-karpinski' ? 'Mikołaj' : window.__STUDENT_SLUG === 'ilona-karpinska' ? 'Ilona' : '';
            const studentQuotes = quotesData[studentName] || {};
            
            // Find quotes for this lesson date
            // The chart data has 'date' in YYYY-MM-DD format
            const lessonDate = d.date;
            const lessonQuotes = studentQuotes[lessonDate] || {};
            
            // Map chart metric names to quote metric names
            const metricToQuote = { overallScore: null, vocabularyRange: 'vocabulary', fluencyAndCoherence: 'fluency', grammaticalAccuracy: 'grammar', pronunciation: 'fluency' };
            const quoteMetric = metricToQuote[metric] || metric;
            
            // Get quotes matching the current metric
            let metricQuoteKeys = quoteMetric ? [`${quoteMetric}|strength`, `${quoteMetric}|improvement`] : [];
            let relevantQuotes = [];
            for (const mk of metricQuoteKeys) {
                if (lessonQuotes[mk]) {
                    for (const q of lessonQuotes[mk]) {
                        const type = mk.split('|')[1];
                        relevantQuotes.push({ ...q, type });
                    }
                }
            }
            
            // If metric is overall, show a mix from all categories
            if (metric === 'overallScore') {
                relevantQuotes = [];
                const quoteMetricNames = ['vocabulary', 'grammar', 'fluency'];
                for (const [key, items] of Object.entries(lessonQuotes)) {
                    const parts = key.split('|');
                    const qMetric = parts[0];
                    const qType = parts[1];
                    for (const q of items.slice(0, 2)) {
                        relevantQuotes.push({ ...q, type: qType, metricLabel: qMetric });
                    }
                }
                // Limit to 6 best
                relevantQuotes = relevantQuotes.slice(0, 6);
            } else {
                // Limit to 6 for specific metrics
                relevantQuotes = relevantQuotes.slice(0, 6);
            }
            
            if (relevantQuotes.length > 0) {
                quotesSection.style.display = '';
                if (quotesLabel) quotesLabel.textContent = metric === 'overallScore' ? 'What the student said across metrics' : `${metricLabel} quotes`;
                quotesList.innerHTML = relevantQuotes.map(q => {
                    const badgeClass = q.type === 'strength' ? 'strength' : 'improvement';
                    const badgeLabel = q.type === 'strength' ? '✓ Strength' : '↑ Improve';
                    const metricTag = q.metricLabel ? `<span class="quote-badge improvement">${q.metricLabel}</span>` : '';
                    return `
                        <div class="verbatim-quote-card">
                            <div class="flex items-start gap-2">
                                <span class="material-symbols-outlined text-[16px] text-slate-300 mt-0.5 shrink-0">format_quote</span>
                                <div class="min-w-0">
                                    <p class="quote-text">"${escapeHtml(q.q)}"</p>
                                    <div class="flex items-center gap-2 mt-1.5">
                                        <span class="quote-badge ${badgeClass}">${badgeLabel}</span>
                                        ${metricTag}
                                        ${q.t ? `<span class="text-[10px] text-slate-300">${q.t}</span>` : ''}
                                    </div>
                                </div>
                            </div>
                        </div>
                    `;
                }).join('');
            } else {
                quotesSection.style.display = 'none';
                if (quotesLabel) quotesLabel.textContent = 'What the student said';
                quotesList.innerHTML = '';
            }
        }

        // Animate open
        panel.style.maxHeight = panel.scrollHeight + 200 + 'px';
        panel.style.opacity = '1';

        panel.querySelectorAll('[data-switch-metric]').forEach((el) => {
            el.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                const metricKey = el.dataset.switchMetric;
                if (metricKey) switchMetric(metricKey);
            });
        });

        panel.querySelectorAll('[data-jump-lesson]').forEach(el => {
            el.addEventListener('click', () => {
                const key = el.dataset.jumpLesson;
                if (key) openLessonByKey(key, { scroll: true });
            });
        });
        panel.querySelectorAll('[data-goto-lesson]').forEach(el => {
            el.addEventListener('click', () => {
                const key = el.dataset.gotoLesson;
                if (key) openLessonByKey(key, { scroll: true });
            });
        });
    }

    // Close detail panel
    document.getElementById('detailPanelClose')?.addEventListener('click', () => {
        const panel = document.getElementById('chartDetailPanel');
        if (panel) { panel.style.maxHeight = '0px'; panel.style.opacity = '0'; }
        activeChartPoint = null;
        document.querySelectorAll('.chart-data-point').forEach(p => p.classList.remove('active'));
    });

    // Populate lesson dropdown
    function populateDropdown() {
        const list = document.getElementById('feedbackDropdownList');
        const analyses = [...getAllAnalyses()].sort((a, b) => getAnalysisSortTimestamp(b) - getAnalysisSortTimestamp(a) || Number(b?.createdAt || 0) - Number(a?.createdAt || 0));
        if (!list || !analyses.length) return;

        list.innerHTML = analyses.map((a, i) => {
            const bandClass = a.cefrBand === 'C1' ? 'c1' : a.cefrBand === 'B2' ? 'b2' : a.cefrBand === 'C2' ? 'c2' : 'b1';
            const lesson = getLessonForAnalysis(a);
            const summaryPreview = lesson?.title || normalizeAnalysisText(a.lessonSummary).substring(0, 56) || 'Lesson';
            return `<div class="feedback-dropdown-item" data-analysis-index="${i}">
                <div class="flex items-center justify-between gap-3">
                    <div class="min-w-0">
                        <span class="block text-sm text-slate-700 truncate">${escapeHtml(summaryPreview)}</span>
                        <span class="block text-[11px] uppercase tracking-[0.16em] text-slate-400">${escapeHtml(formatLessonDate(getResolvedAnalysisDate(a)))}</span>
                    </div>
                    <span class="score-pill ${bandClass} shrink-0">${a.cefrBand} ${Math.round(a.overallScore)}</span>
                </div>
            </div>`;
        }).join('');

        // Click handlers
        list.querySelectorAll('.feedback-dropdown-item').forEach(item => {
            item.addEventListener('click', () => {
                const idx = parseInt(item.dataset.analysisIndex);
                showFeedback(analyses[idx]);
                list.classList.remove('open');
                document.getElementById('feedbackDropdownBtn').classList.remove('open');
                document.getElementById('feedbackDropdownLabel').textContent = item.querySelector('.text-sm').textContent;
            });
        });
    }

    // Show feedback for selected analysis
    function showFeedback(analysis) {
        const lesson = getLessonForAnalysis(analysis);
        if (!lesson) return;
        openLessonByKey(lesson.lessonKey, { scroll: true });
    }

    // Dropdown toggle
    document.getElementById('feedbackDropdownBtn')?.addEventListener('click', function() {
        const list = document.getElementById('feedbackDropdownList');
        this.classList.toggle('open');
        list.classList.toggle('open');
    });

    // Close dropdown on outside click
    document.addEventListener('click', function(e) {
        const dd = document.querySelector('.feedback-dropdown');
        if (dd && !dd.contains(e.target)) {
            document.getElementById('feedbackDropdownList')?.classList.remove('open');
            document.getElementById('feedbackDropdownBtn')?.classList.remove('open');
        }
    });

    // Resize handler
    window.addEventListener('resize', () => { if (analysesData.length) renderChart(); });

    // Init when data is ready
    function init() {
        if (window.__STUDENT_ID) {
            loadFullAnalyses().then(() => loadAnalyses());
        }
    }

    // Wait for Convex data to be loaded
    const observer = new MutationObserver(() => {
        if (window.__STUDENT_ID) {
            observer.disconnect();
            init();
        }
    });
    observer.observe(document.body, { attributes: true });

    // Also try immediately
    if (window.__STUDENT_ID) init();
})();