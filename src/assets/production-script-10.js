const LESSON_TOPIC_COLORS = {
    'speaking': ['#2563eb', '#38bdf8'],
    'grammar': ['#7c3aed', '#a78bfa'],
    'travel': ['#0f766e', '#2dd4bf'],
    'business': ['#0f172a', '#475569'],
    'work': ['#1d4ed8', '#60a5fa'],
    'culture': ['#be185d', '#fb7185'],
    'technology': ['#0f766e', '#14b8a6'],
    'education': ['#0891b2', '#67e8f9'],
    'health': ['#059669', '#34d399'],
    'food': ['#ea580c', '#fb923c'],
    'relationships': ['#db2777', '#f9a8d4'],
    'media': ['#7c2d12', '#f59e0b'],
    'nature': ['#15803d', '#86efac'],
    'motivation': ['#dc2626', '#fb7185'],
    'daily life': ['#4f46e5', '#818cf8'],
    'communication': ['#8b5cf6', '#ec4899'],
    'teamwork': ['#2563eb', '#06b6d4'],
    'learning': ['#10b981', '#06b6d4']
};

const LESSON_TOPIC_FALLBACKS = [
    ['#2563eb', '#38bdf8'],
    ['#7c3aed', '#c084fc'],
    ['#ea580c', '#f59e0b'],
    ['#0f766e', '#14b8a6'],
    ['#db2777', '#fb7185'],
    ['#4f46e5', '#818cf8']
];

const KOKORO_VOICES = {
    'a': ['af_alloy','af_aoede','af_bella','af_heart','af_jessica','af_kore','af_nicole','af_nova','af_river','af_sarah','af_sky','am_adam','am_echo','am_eric','am_fenrir','am_liam','am_michael','am_onyx','am_puck','am_santa'],
    'b': ['bf_alice','bf_emma','bf_isabella','bf_lily','bm_daniel','bm_fable','bm_george','bm_lewis'],
    'e': ['ef_dora','em_alex','em_santa'],
    'f': ['ff_siwis'],
    'h': ['hf_alpha','hf_beta','hm_omega','hm_psi'],
    'i': ['if_sara','im_nicola'],
    'j': ['jf_alpha','jf_gongitsune','jf_nezumi','jf_tebukuro','jm_kumo'],
    'p': ['pf_dora','pm_alex','pm_santa'],
    'z': ['zf_xiaobei','zf_xiaoni','zf_xiaoxiao','zf_xiaoyi','zm_yunjian','zm_yunxi','zm_yunxia','zm_yunyang']
};

const VOICE_LABELS = {
    af_alloy:'🇺🇸 Alloy (Female)',af_aoede:'🇺🇸 Aoede (Female)',af_bella:'🇺🇸 Bella (Female)',af_heart:'🇺🇸 Heart (Female)',af_jessica:'🇺🇸 Jessica (Female)',af_kore:'🇺🇸 Kore (Female)',af_nicole:'🇺🇸 Nicole (Female)',af_nova:'🇺🇸 Nova (Female)',af_river:'🇺🇸 River (Female)',af_sarah:'🇺🇸 Sarah (Female)',af_sky:'🇺🇸 Sky (Female)',
    am_adam:'🇺🇸 Adam (Male)',am_echo:'🇺🇸 Echo (Male)',am_eric:'🇺🇸 Eric (Male)',am_fenrir:'🇺🇸 Fenrir (Male)',am_liam:'🇺🇸 Liam (Male)',am_michael:'🇺🇸 Michael (Male)',am_onyx:'🇺🇸 Onyx (Male)',am_puck:'🇺🇸 Puck (Male)',am_santa:'🇺🇸 Santa (Male)',
    bf_alice:'🇬🇧 Alice (Female)',bf_emma:'🇬🇧 Emma (Female)',bf_isabella:'🇬🇧 Isabella (Female)',bf_lily:'🇬🇧 Lily (Female)',
    bm_daniel:'🇬🇧 Daniel (Male)',bm_fable:'🇬🇧 Fable (Male)',bm_george:'🇬🇧 George (Male)',bm_lewis:'🇬🇧 Lewis (Male)',
    ef_dora:'🇪🇸 Dora (Female)',em_alex:'🇪🇸 Alex (Male)',em_santa:'🇪🇸 Santa (Male)',
    ff_siwis:'🇫🇷 Siwis (Female)',
    hf_alpha:'🇮🇳 Alpha (Female)',hf_beta:'🇮🇳 Beta (Female)',hm_omega:'🇮🇳 Omega (Male)',hm_psi:'🇮🇳 Psi (Male)',
    if_sara:'🇮🇹 Sara (Female)',im_nicola:'🇮🇹 Nicola (Male)',
    jf_alpha:'Alpha (Female)',jf_gongitsune:'Gongitsune (Female)',jf_nezumi:'Nezumi (Female)',jf_tebukuro:'Tebukuro (Female)',jm_kumo:'Kumo (Male)',
    pf_dora:'🇧🇷 Dora (Female)',pm_alex:'🇧🇷 Alex (Male)',pm_santa:'🇧🇷 Santa (Male)',
    zf_xiaobei:'🇨🇳 Xiaobei (Female)',zf_xiaoni:'🇨🇳 Xiaoni (Female)',zf_xiaoxiao:'🇨🇳 Xiaoxiao (Female)',zf_xiaoyi:'🇨🇳 Xiaoyi (Female)',
    zm_yunjian:'🇨🇳 Yunjian (Male)',zm_yunxi:'🇨🇳 Yunxi (Male)',zm_yunxia:'🇨🇳 Yunxia (Male)',zm_yunyang:'🇨🇳 Yunyang (Male)'
};

const LANG_NAMES = {
    a:'🇺🇸 American',b:'🇬🇧 British',e:'🇪🇸 Spanish',f:'🇫🇷 French',h:'🇮🇳 Hindi',i:'🇮🇹 Italian',j:'🇯🇵 Japanese',p:'🇧🇷 Portuguese',z:'🇨🇳 Chinese'
};

const LESSON_DASHBOARD_STUDENT_RAW = 'Szymon Karpinski';
const LESSON_DASHBOARD_STUDENT_DISPLAY = 'Szymon Karpiński';
const LESSON_QUIZ_PLACEHOLDER = Object.freeze({
    completed: 0,
    averageScore: 0,
    bestScore: 0,
    readinessPercent: 0
});

let currentLangCode = 'b';
let currentVoice = 'bm_fable';
let isPlaying = false;
let currentAudio = null;
let mobileAudioUnlocked = false;
let currentLyricsInterval = null;
let lessonsData = [];
let lessonsFetchState = 'idle';
let lessonsErrorMessage = '';
let selectedLessonStudent = LESSON_DASHBOARD_STUDENT_RAW;
let selectedLessonPack = 'all';
let lessonKeywordSearchTerm = '';
let expandedLessonKey = null;
let expandedLessonKeywordKey = null;
let expandedLessonCollocationKey = null;
let expandedLessonSynonymKey = null;
let expandedLessonLearnerNotesKey = null;

function resetExpandedLessonKeywordPanels() {
    expandedLessonCollocationKey = null;
    expandedLessonSynonymKey = null;
    expandedLessonLearnerNotesKey = null;
}
let lessonKeywordTopicFilters = {};
let activeSectionId = 'page-dashboard';
let recentLessonExpanded = false;
let recentLessonTopicSearchVisible = false;
let recentLessonTopicSearchTerm = '';
let dashboardLessonNavigatorExpanded = false;
let lessonNavSearchTerm = '';
let flashcardMode = 'browse';
let flashcardActiveTopic = '';
let flashcardBrowsePage = 0;
let flashcardBrowseCompact = true;
let flashcardBrowseIndex = 0;
let flashcardCurrentIndex = 0;
let flashcardIsFlipped = false;
let flashcardDeckSignature = '';
let flashcardShuffledKeys = [];
const flashcardReviewedKeys = new Set();
let videoOccurrences = [];
let currentVideoIndex = 0;
let currentOccurrenceIndex = 0;
let currentKeyword = '';
let lastYouGlishKeyword = '';
let currentYTPlayer = null;
let captionSyncInterval = null;
let currentCaptionChunks = [];
let currentCaptionStartTime = 0;
let currentCaptionDuration = 0;
let whisperWords = null;
let whisperAbsoluteStart = 0;
const WHISPER_SYNC_OFFSET = -0.4;
let whisperFetched = false;
const youglishCache = new Map();
const youglishPendingRequests = new Map();
const ttsAudioCache = new Map();
const ttsPendingRequests = new Map();
const ttsPrecacheQueue = [];
let ttsPrecacheActiveCount = 0;
let ttsPrecacheGeneration = 0;

function unlockMobileAudio() {
    if (mobileAudioUnlocked) return;
    const silentAudio = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA');
    silentAudio.play().then(() => {
        mobileAudioUnlocked = true;
    }).catch(() => {});
}

document.addEventListener('click', unlockMobileAudio, { once: true });
document.addEventListener('touchstart', unlockMobileAudio, { once: true });

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function escapeJsString(value) {
    return String(value ?? '')
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'");
}

function formatLessonStudentDisplayName(name) {
    const normalized = String(name || '').trim();
    if (!normalized) return 'Unknown student';
    return normalized === LESSON_DASHBOARD_STUDENT_RAW ? LESSON_DASHBOARD_STUDENT_DISPLAY : normalized;
}

function getLessonStudentFirstName(name) {
    return formatLessonStudentDisplayName(name).split(/\s+/)[0] || 'Student';
}

function formatLessonDate(rawDate) {
    if (!rawDate) return 'Date unavailable';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate) || rawDate.includes('-00')) {
        return rawDate;
    }
    const parsed = new Date(`${rawDate}T12:00:00`);
    if (Number.isNaN(parsed.getTime())) return rawDate;
    return new Intl.DateTimeFormat('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
    }).format(parsed);
}

function getLessonSortTimestamp(rawDate) {
    if (!rawDate || !/^\d{4}-\d{2}-\d{2}$/.test(rawDate) || rawDate.includes('-00')) {
        return Number.NEGATIVE_INFINITY;
    }
    const parsed = Date.parse(`${rawDate}T12:00:00Z`);
    return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

function formatLessonCountLabel(count, singular, plural = `${singular}s`) {
    return `${count} ${count === 1 ? singular : plural}`;
}

function normalizeLessonDateKey(value) {
    const raw = String(value || '');
    const match = raw.match(/\d{4}-\d{2}-\d{2}/);
    return match ? match[0] : raw.trim();
}

function normalizeAnalysisText(value) {
    let text = String(value || '')
        .replace(/\*\*/g, '')
        .replace(/__/g, '')
        .replace(/_[^_]+_/g, (m) => m.slice(1, -1))
        
        .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu, '')
        .replace(/\s+/g, ' ')
        .trim();
    // Remove cringey AI prefixes
    text = text.replace(/^(What a cracking lesson!|Love the enthusiasm today!|Proper solid session!|Brilliant session today!|Fantastic session!|Great session!|Awesome session!)\s*/i, '');
    // Truncate "About X:" personal sections
    text = text.replace(/\*\*About[^*]*\*\*:?\s*/gi, '');
    text = text.replace(/About [A-Z][a-z]+:[^.]*/gi, '');
    return text.trim();
}

function getAnalysisSummaryField(analysis, key, fallback = '') {
    return normalizeAnalysisText(analysis?.[key] || fallback);
}

function getAnalysisListField(analysis, listKey, summaryKey) {
    const list = Array.isArray(analysis?.[listKey])
        ? analysis[listKey].map(normalizeAnalysisText).filter(Boolean)
        : [];
    if (list.length) return list;
    const summary = getAnalysisSummaryField(analysis, summaryKey);
    return summary ? [summary] : [];
}

function getAllAnalyses() {
    return Array.isArray(window.__FULL_ANALYSES) ? window.__FULL_ANALYSES : [];
}

function getConvexLessonsMap() {
    return window.__CONVEX_LESSONS_MAP && typeof window.__CONVEX_LESSONS_MAP === 'object'
        ? window.__CONVEX_LESSONS_MAP
        : {};
}

function getConvexLessonForAnalysis(analysis) {
    if (!analysis?.lessonId) return null;
    return getConvexLessonsMap()[analysis.lessonId] || null;
}

function getResolvedAnalysisDate(analysis) {
    return normalizeLessonDateKey(getConvexLessonForAnalysis(analysis)?.date || analysis?.date || '');
}

function getAnalysisSortTimestamp(analysis) {
    return getLessonSortTimestamp(getResolvedAnalysisDate(analysis));
}

function getSortedAnalyses() {
    return [...getAllAnalyses()].sort((a, b) => {
        const dateDiff = getAnalysisSortTimestamp(a) - getAnalysisSortTimestamp(b);
        if (dateDiff !== 0) return dateDiff;
        return Number(a?.createdAt || 0) - Number(b?.createdAt || 0);
    });
}

function getAnalysisForLesson(lesson) {
    const lessonDateKey = normalizeLessonDateKey(lesson?.date);
    if (!lessonDateKey) return null;
    return [...getAllAnalyses()]
        .sort((a, b) => getAnalysisSortTimestamp(b) - getAnalysisSortTimestamp(a) || Number(b?.createdAt || 0) - Number(a?.createdAt || 0))
        .find((analysis) => getResolvedAnalysisDate(analysis) === lessonDateKey) || null;
}

function getLessonForAnalysis(analysis) {
    const dateKey = getResolvedAnalysisDate(analysis);
    return lessonsData.find((lesson) => normalizeLessonDateKey(lesson.date) === dateKey) || null;
}

function getAnalysisTakeaways(analysis, limit = 2) {
    if (!analysis) return [];
    const items = [
        ...getAnalysisListField(analysis, 'strengths', 'strengthSummary'),
        ...getAnalysisListField(analysis, 'improvements', 'improvementsSummary'),
        ...(analysis.practiceAdvice || [])
    ].map(normalizeAnalysisText).filter(Boolean);
    return [...new Set(items)].slice(0, limit);
}

function getAnalysisTrend(analysis) {
    const sorted = getSortedAnalyses();
    const targetKey = getResolvedAnalysisDate(analysis);
    const idx = sorted.findIndex((entry) => getResolvedAnalysisDate(entry) === targetKey && String(entry?.lessonId || '') === String(analysis?.lessonId || ''));
    const currentScore = Number(analysis?.overallScore || 0);
    if (idx <= 0) return { label: 'First recorded lesson', icon: 'north_east', tone: 'text-slate-100', delta: 0 };
    const previous = sorted[idx - 1];
    const delta = currentScore - Number(previous?.overallScore || 0);
    if (delta > 2) return { label: `Improving ${Math.round(delta)} pts`, icon: 'north', tone: 'text-emerald-300', delta };
    if (delta < -2) return { label: `Down ${Math.round(Math.abs(delta))} pts`, icon: 'south', tone: 'text-amber-300', delta };
    return { label: 'Steady', icon: 'east', tone: 'text-slate-100', delta };
}

function getScoreBarClass(color) {
    return {
        blue: 'from-blue-500 to-sky-400',
        emerald: 'from-emerald-500 to-teal-400',
        rose: 'from-rose-500 to-pink-400',
        amber: 'from-amber-500 to-orange-400',
        purple: 'from-violet-500 to-fuchsia-400'
    }[color] || 'from-blue-500 to-sky-400';
}

function buildLessonSearchText(lesson) {
    const keywordText = (lesson.keywords || []).map((keyword) => [
        keyword.word,
        keyword.translation,
        keyword.definition_en,
        keyword.definition_pl,
        keyword.example_en,
        keyword.example_pl,
        keyword.ipa
    ].join(' ')).join(' ');

    return [
        lesson.title,
        lesson.student,
        lesson.level,
        lesson.date,
        lesson.conversation_preview,
        (lesson.topics || []).join(' '),
        keywordText
    ].join(' ').toLowerCase();
}

function normalizeLessonTopics(topics) {
    const normalized = Array.isArray(topics)
        ? topics
        : typeof topics === 'string'
            ? topics.split(',')
            : [];

    return [...new Set(normalized.map((topic) => String(topic || '').trim()).filter(Boolean))];
}

function formatLessonTopicLabel(topic) {
    return String(topic || '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeKeywordTopicValues(topics) {
    return [...new Set((Array.isArray(topics) ? topics : []).map((topic) => String(topic || '').trim()).filter(Boolean))];
}

function getKeywordTopicAssignment(keyword, lessonTopics, keywordIdx = 0) {
    // Use pre-computed topic from lessons.json if available
    if (keyword?.topic) return normalizeKeywordTopicValues([keyword.topic]);
    // Fallback: use first lesson topic (no more random round-robin)
    const topics = normalizeLessonTopics(lessonTopics);
    return topics.length ? [topics[0]] : [];
}

function scorePersonalizedTopic(topic, lessonIndex, totalLessons) {
    const normalized = formatLessonTopicLabel(topic).toLowerCase();
    let score = Math.max(0, totalLessons - lessonIndex);

    if (/(artificial intelligence|ai|robotics|automation|technology ethics|technological singularity|future of work)/.test(normalized)) score += 8;
    if (/(prohibition|organized crime|censorship|law and society|misinformation)/.test(normalized)) score += 7;
    if (/(video games|gaming|counter-strike|gambling and regulation|consumer rights)/.test(normalized)) score += 6;
    if (/(polish politics|economic inequality|office environment|workplace culture|personal finance|plastic pollution)/.test(normalized)) score += 5;
    if (/(vocabulary|technology|sports|food|restaurants|career development|personal growth)/.test(normalized)) score -= 3;
    if (normalized.length > 42) score -= 1;

    return score;
}

function getFeaturedLessonTopics(lessons, count = 3) {
    const rankedTopics = [];
    const seenTopics = new Set();
    const sortedLessons = [...lessons].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

    sortedLessons.forEach((lesson, lessonIndex) => {
        normalizeLessonTopics(lesson.topics).forEach((topic) => {
            const displayTopic = formatLessonTopicLabel(topic);
            const dedupeKey = displayTopic.toLowerCase();
            if (!displayTopic || seenTopics.has(dedupeKey)) return;
            seenTopics.add(dedupeKey);
            rankedTopics.push({
                topic: displayTopic,
                score: scorePersonalizedTopic(displayTopic, lessonIndex, sortedLessons.length)
            });
        });
    });

    return rankedTopics
        .sort((a, b) => b.score - a.score || a.topic.localeCompare(b.topic))
        .slice(0, count)
        .map((entry) => entry.topic);
}

function buildLessonEncouragement(lessons, profile) {
    const featuredTopics = getFeaturedLessonTopics(lessons, 3);
    const topicLine = featuredTopics.length >= 3
        ? `You covered some fascinating topics - from ${featuredTopics[0]} to ${featuredTopics[1]} and ${featuredTopics[2]}.`
        : featuredTopics.length === 2
            ? `You covered some fascinating topics - from ${featuredTopics[0]} to ${featuredTopics[1]}.`
            : featuredTopics.length === 1
                ? `You explored some fascinating material, especially ${featuredTopics[0]}.`
                : 'Each lesson is expanding your range and sharpening your fluency.';

    return [
        `Your recent lessons show real range and steady progress at ${profile.level}.`,
        topicLine,
        'Keep up the excellent work! 🌟'
    ];
}

function getLessonsForStudent(student = selectedLessonStudent) {
    return lessonsData.filter((lesson) => lesson.student === student);
}

function getLessonPackOptions() {
    return getLessonsForStudent().map((lesson) => ({
        value: lesson.lessonKey,
        label: lesson.title || formatLessonDate(lesson.date),
        note: formatLessonDate(lesson.date)
    }));
}

function getCurrentLessonProfile() {
    const studentLessons = getLessonsForStudent();
    const filteredByPack = selectedLessonPack === 'all'
        ? studentLessons
        : studentLessons.filter((lesson) => lesson.lessonKey === selectedLessonPack);
    const lessonPool = filteredByPack.length ? filteredByPack : studentLessons;
    const latestLesson = lessonPool[0] || lessonsData[0] || null;
    const uniqueLevels = [...new Set(studentLessons.map((lesson) => lesson.level).filter(Boolean))];
    const keywordTotal = studentLessons.reduce((sum, lesson) => sum + (lesson.keyword_count || (lesson.keywords || []).length || 0), 0);

    return {
        name: formatLessonStudentDisplayName(selectedLessonStudent),
        greeting: `Hey ${getLessonStudentFirstName(selectedLessonStudent)}!`,
        initials: formatLessonStudentDisplayName(selectedLessonStudent)
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((part) => part[0]?.toUpperCase() || '')
            .join('') || 'EM',
        level: uniqueLevels.length === 1 ? uniqueLevels[0] : (uniqueLevels.length > 1 ? 'Mixed levels' : (latestLesson?.level || 'Level n/a')),
        lessonCount: studentLessons.length,
        keywordCount: keywordTotal,
        packCount: studentLessons.length,
        latestLessonTitle: latestLesson?.title || 'Lesson archive'
    };
}

function getFilteredLessons() {
    const search = lessonKeywordSearchTerm.trim().toLowerCase();
    return getLessonsForStudent().filter((lesson) => {
        const matchesPack = selectedLessonPack === 'all' || lesson.lessonKey === selectedLessonPack;
        const matchesSearch = !search || lesson.searchText.includes(search);
        return matchesPack && matchesSearch;
    });
}

function getMostRecentStudentLesson() {
    const studentLessons = getLessonsForStudent();
    return studentLessons[0] || null;
}

function getRecentLessonAnalysis(lesson) {
    return lesson ? getAnalysisForLesson(lesson) : null;
}

function getRecentLessonErrorSummary(analysis, limit = 3) {
    return Array.isArray(analysis?.keyErrors) ? analysis.keyErrors.slice(0, limit) : [];
}

function getRecentLessonScoreItems(analysis) {
    return [
        { label: 'Grammar', value: Number(analysis?.grammaticalAccuracy || 0), gradient: 'from-rose-500 to-pink-400' },
        { label: 'Vocab', value: Number(analysis?.vocabularyRange || 0), gradient: 'from-emerald-500 to-teal-400' },
        { label: 'Fluency', value: Number(analysis?.fluencyAndCoherence || 0), gradient: 'from-amber-500 to-orange-400' },
        { label: 'Pronunciation', value: Number(analysis?.pronunciation || 0), gradient: 'from-violet-500 to-fuchsia-400' }
    ];
}

function flattenFlashcardCollocations(value, bucket = []) {
    if (!value) return bucket;
    if (typeof value === 'string') {
        const text = normalizeAnalysisText(value);
        if (text) bucket.push(text);
        return bucket;
    }
    if (Array.isArray(value)) {
        value.forEach((entry) => flattenFlashcardCollocations(entry, bucket));
        return bucket;
    }
    if (typeof value === 'object') {
        Object.values(value).forEach((entry) => flattenFlashcardCollocations(entry, bucket));
    }
    return bucket;
}

function getFlashcardCollocationText(keyword) {
    const collocations = [...new Set(flattenFlashcardCollocations(keyword?.collocations).filter(Boolean))];
    return collocations.slice(0, 6).join(' • ') || 'No collocations recorded.';
}

function getFlashcardIpa(keyword) {
    return keyword?.ipa || keyword?.stressUK || keyword?.stressUS || 'IPA unavailable';
}

function ipaToRespelling(ipa) {
    if (!ipa || ipa === 'IPA unavailable') return '';
    return ipa
        .replace(/\\/g, '')
        .replace(/\//g, '')
        .replace(/ˈ/g, "'")
        .replace(/ˌ/g, ',')
        .replace(/æ/g, 'a')
        .replace(/ʌ/g, 'uh')
        .replace(/ɑ/g, 'ah')
        .replace(/ɔ/g, 'aw')
        .replace(/ɛ/g, 'e')
        .replace(/ɪ/g, 'i')
        .replace(/iː/g, 'ee')
        .replace(/uː/g, 'oo')
        .replace(/ʊ/g, 'u')
        .replace(/ə/g, 'uh')
        .replace(/ɜː/g, 'ur')
        .replace(/ʃ/g, 'sh')
        .replace(/ʒ/g, 'zh')
        .replace(/tʃ/g, 'ch')
        .replace(/dʒ/g, 'j')
        .replace(/ŋ/g, 'ng')
        .replace(/θ/g, 'th')
        .replace(/ð/g, 'th')
        .replace(/ɹ/g, 'r')
        .replace(/ɡ/g, 'g')
        .trim();
}

function buildFlashcardEntries(options = {}) {
    const { ignoreTopic = false } = options;
    const search = lessonKeywordSearchTerm.trim().toLowerCase();
    const lessons = getLessonsForStudent().filter((lesson) => selectedLessonPack === 'all' || lesson.lessonKey === selectedLessonPack);
    const entries = [];

    lessons.forEach((lesson, lessonIdx) => {
        const lessonTopics = normalizeLessonTopics(lesson.topics);
        (lesson.keywords || []).forEach((keyword, keywordIdx) => {
            const keywordTopics = getLessonKeywordDataTopics(keyword, lessonTopics, keywordIdx);
            const searchText = [
                keyword?.word,
                keyword?.translation,
                keyword?.definition_en,
                keyword?.definition_pl,
                keyword?.example_en,
                keyword?.example_pl,
                lesson?.title,
                lesson?.date,
                lessonTopics.join(' ')
            ].join(' ').toLowerCase();
            const matchesSearch = !search || searchText.includes(search);
            const matchesTopic = ignoreTopic || !flashcardActiveTopic || keywordTopics.includes(flashcardActiveTopic);
            if (!matchesSearch || !matchesTopic) return;
            entries.push({
                entryKey: `${lesson.lessonKey}::${keywordIdx}`,
                lessonKey: lesson.lessonKey,
                lessonIdx,
                keywordIdx,
                lesson,
                keyword,
                topicValues: keywordTopics,
                topicLabels: keywordTopics.map(formatLessonTopicLabel)
            });
        });
    });

    return entries;
}

function getFlashcardDeck(entries = buildFlashcardEntries()) {
    if (flashcardMode !== 'study') return entries;
    const signature = entries.map((entry) => entry.entryKey).join('|');
    if (signature !== flashcardDeckSignature) {
        flashcardDeckSignature = signature;
        flashcardShuffledKeys = entries.map((entry) => entry.entryKey).sort(() => Math.random() - 0.5);
        flashcardCurrentIndex = 0;
    }
    const map = new Map(entries.map((entry) => [entry.entryKey, entry]));
    return flashcardShuffledKeys.map((key) => map.get(key)).filter(Boolean);
}

function syncFlashcardIndex(deck) {
    if (!deck.length) {
        flashcardBrowseIndex = 0;
        flashcardCurrentIndex = 0;
        return;
    }
    if (flashcardCurrentIndex >= deck.length) flashcardCurrentIndex = deck.length - 1;
    if (flashcardCurrentIndex < 0) flashcardCurrentIndex = 0;
    if (flashcardBrowseIndex >= deck.length) flashcardBrowseIndex = deck.length - 1;
    if (flashcardBrowseIndex < 0) flashcardBrowseIndex = 0;
}

function setFlashcardMode(mode) {
    flashcardMode = mode === 'study' ? 'study' : 'browse';
    flashcardBrowsePage = 0;
    flashcardBrowseCompact = true;
    flashcardBrowseIndex = 0;
    flashcardDeckSignature = '';
    flashcardIsFlipped = false;
    renderLessonsDashboard();
}

function applyFlashcardTopicFilter(topic) {
    flashcardActiveTopic = topic || '';
    flashcardBrowsePage = 0;
    flashcardBrowseCompact = true;
    flashcardBrowseIndex = 0;
    flashcardCurrentIndex = 0;
    flashcardDeckSignature = '';
    flashcardIsFlipped = false;
    renderLessonsDashboard();
}

function setFlashcardTopicFilter(topic) {
    applyFlashcardTopicFilter(flashcardActiveTopic === topic ? '' : topic);
}

function stepFlashcard(delta) {
    const deck = getFlashcardDeck();
    if (!deck.length) return;
    flashcardCurrentIndex = Math.min(deck.length - 1, Math.max(0, flashcardCurrentIndex + delta));
    flashcardBrowseIndex = flashcardCurrentIndex;
    flashcardIsFlipped = false;
    renderVocabularyFlashcards();
}

function setFlashcardIndex(index) {
    const deck = getFlashcardDeck();
    if (!deck.length) return;
    flashcardCurrentIndex = Math.min(deck.length - 1, Math.max(0, index));
    flashcardBrowseIndex = flashcardCurrentIndex;
    flashcardIsFlipped = false;
    renderVocabularyFlashcards();
}

function toggleFlashcardFlip(force) {
    flashcardIsFlipped = typeof force === 'boolean' ? force : !flashcardIsFlipped;
    const scene = document.getElementById('flashcardFlipButton');
    if (scene) scene.classList.toggle('is-flipped', flashcardIsFlipped);
    scene?.setAttribute('aria-pressed', flashcardIsFlipped ? 'true' : 'false');
    const front = scene ? scene.querySelector('.flashcard-face-front') : null;
    const back = scene ? scene.querySelector('.flashcard-face-back') : null;
    if (front) front.style.display = flashcardIsFlipped ? 'none' : 'flex';
    if (back) back.style.display = flashcardIsFlipped ? 'flex' : 'none';
}

function toggleOverallDetails() {
    const panel = document.getElementById("overallDetailsPanel");
    const chevron = document.getElementById("overallChevron");
    const toggle = document.getElementById("overallDetailsToggle");
    const compactMetrics = document.getElementById("compactMetricsRow");
    if (!panel) return;
    const isOpen = panel.style.maxHeight !== "0px" && panel.style.maxHeight !== "";
    if (isOpen) {
        panel.style.maxHeight = "0px";
        panel.style.opacity = "0";
        if (chevron) chevron.style.transform = "rotate(0deg)";
        if (toggle) toggle.setAttribute("aria-expanded", "false");
        if (compactMetrics) compactMetrics.style.display = "";
    } else {
        panel.style.maxHeight = panel.scrollHeight + "px";
        panel.style.opacity = "1";
        if (chevron) chevron.style.transform = "rotate(180deg)";
        if (toggle) toggle.setAttribute("aria-expanded", "true");
        if (compactMetrics) compactMetrics.style.display = "none";
    }
}

function getAllAvailableLessonTopics() {
    const seen = new Set();
    const allTopics = [];
    getLessonsForStudent().forEach((lesson) => {
        normalizeLessonTopics(lesson.topics).forEach((topic) => {
            const normalized = String(topic || '').trim();
            const key = normalized.toLowerCase();
            if (!normalized || seen.has(key)) return;
            seen.add(key);
            allTopics.push(normalized);
        });
    });
    return allTopics;
}

function renderRecentLessonTopicTags(lesson) {
    const allTopics = normalizeLessonTopics(lesson?.topics);
    if (!allTopics.length) {
        return '<span class="text-sm text-slate-500">No topics recorded.</span>';
    }

    const visibleTopics = allTopics.slice(0, 3);
    const hiddenCount = Math.max(0, allTopics.length - visibleTopics.length);
    const searchTerm = recentLessonTopicSearchTerm.trim().toLowerCase();
    const matchingTopics = recentLessonTopicSearchVisible
        ? getAllAvailableLessonTopics()
            .filter((topic) => !searchTerm || formatLessonTopicLabel(topic).toLowerCase().includes(searchTerm))
            .slice(0, 8)
        : [];

    const topicChips = visibleTopics.map((topic, idx) => {
        const [c1, c2] = getLessonTopicGradient(topic, idx);
        return `<span class="inline-flex items-center rounded-full px-3 py-1 text-[10px] font-label font-bold uppercase tracking-[0.18em] text-white" style="background:linear-gradient(135deg, ${c1}, ${c2})">${escapeHtml(formatLessonTopicLabel(topic))}</span>`;
    }).join('');

    const moreButton = hiddenCount > 0
        ? `<button type="button" data-recent-topic-search-toggle class="inline-flex items-center rounded-full px-3 py-1 text-[10px] font-label font-bold uppercase tracking-[0.18em] text-sky-700 bg-sky-50 hover:bg-sky-100 transition-colors">+${hiddenCount} more</button>`
        : '';

    const searchPanel = recentLessonTopicSearchVisible ? `
        <div class="recent-topic-search-shell">
            <input id="recentLessonTopicSearchInput" type="search" class="recent-topic-search-input" placeholder="Search any lesson topic" value="${escapeHtml(recentLessonTopicSearchTerm)}" autocomplete="off">
            <div class="recent-topic-search-results">
                ${matchingTopics.length
                    ? matchingTopics.map((topic) => `<button type="button" class="recent-topic-search-option" data-recent-topic-select="${escapeHtml(topic)}">${escapeHtml(formatLessonTopicLabel(topic))}</button>`).join('')
                    : '<div class="recent-topic-search-empty">No matching topics found.</div>'}
            </div>
        </div>
    ` : '';

    return `${topicChips}${moreButton}${searchPanel}`;
}

function renderRecentLessonCard() {
    const lesson = getMostRecentStudentLesson();
    const analysis = getRecentLessonAnalysis(lesson);
    const title = document.getElementById('recentLessonTitle');
    const meta = document.getElementById('recentLessonMeta');
    const details = document.getElementById('recentLessonFullDetails');
    const toggle = document.getElementById('recentLessonToggle');
    if (!title || !meta || !details || !toggle) return;

    if (!lesson) {
        title.textContent = 'No lesson data available';
        meta.textContent = 'The lesson archive is still loading.';
        details.innerHTML = '';
        details.hidden = true;
        toggle.hidden = true;
        return;
    }

    const scoreValue = Math.round(Number(analysis?.overallScore || 0));
    const levelLabel = analysis?.cefrBand || lesson.level || 'Level n/a';
    title.textContent = lesson.title || 'Untitled lesson';
    meta.textContent = `${formatLessonDate(lesson.date)} • ${scoreValue}/100 • ${levelLabel}`;

    const barsHtml = getRecentLessonScoreItems(analysis).map((item) => `
        <div class="recent-score-mini">
            <div class="flex items-center justify-between gap-3">
                <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">${item.label}</p>
                <p class="text-sm font-semibold text-slate-700">${Math.round(item.value)}</p>
            </div>
            <div class="recent-score-track mt-3">
                <div class="recent-score-fill bg-gradient-to-r ${item.gradient}" style="width:${Math.max(0, Math.min(100, Math.round(item.value)))}%"></div>
            </div>
        </div>
    `).join('');

    const errorsHtml = getRecentLessonErrorSummary(analysis).map((entry) => `
        <div class="error-tag ${escapeHtml(entry?.category || 'grammar')}"><strong>${escapeHtml(normalizeAnalysisText(entry?.error || 'Error'))}</strong> → ${escapeHtml(normalizeAnalysisText(entry?.correction || 'Correction'))}</div>
    `).join('') || '<span class="text-sm text-slate-500">No key errors were recorded.</span>';

    details.innerHTML = `
        <div class="space-y-4">
            <div>
                <p class="font-label text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">Performance Breakdown</p>
                <div class="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">${barsHtml}</div>
            </div>
            <div>
                <p class="font-label text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">Key Topics</p>
                <div id="recentLessonTopics" class="mt-2 flex flex-wrap gap-2">${renderRecentLessonTopicTags(lesson)}</div>
            </div>
            <div>
                <p class="font-label text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">Top 3 Errors</p>
                <div id="recentLessonErrors" class="mt-2 flex flex-wrap gap-2">${errorsHtml}</div>
            </div>
            <button type="button" id="recentLessonShowFullDetails" class="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-white/85 px-4 py-2 font-label text-[11px] font-bold uppercase tracking-[0.18em] text-blue-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-blue-50">
                <span>Show Full Details</span>
                <span aria-hidden="true">→</span>
            </button>
        </div>
    `;

    details.classList.toggle('is-open', recentLessonExpanded);
    details.hidden = !recentLessonExpanded;
    toggle.hidden = false;
    toggle.setAttribute('aria-expanded', recentLessonExpanded ? 'true' : 'false');
    window.requestAnimationFrame(() => {
        document.getElementById('recentLessonTopicSearchInput')?.focus({ preventScroll: true });
    });
}

function getDashboardLessonNavigatorResults() {
    const studentLessons = getLessonsForStudent();
    const search = lessonNavSearchTerm.trim().toLowerCase();
    return studentLessons.filter((lesson) => !search || lesson.searchText.includes(search));
}

function renderDashboardLessonNavigator() {
    const container = document.getElementById('dashboardLessonNavigator');
    const jumpList = document.getElementById('lessonJumpList');
    if (!container && !jumpList) return;
    const studentLessons = getLessonsForStudent();
    const latestLesson = studentLessons[0] || null;
    const filteredLessons = getDashboardLessonNavigatorResults();
    const lessonsToShow = lessonNavSearchTerm.trim()
        ? filteredLessons
        : (dashboardLessonNavigatorExpanded ? filteredLessons : filteredLessons.slice(0, 3));
    const renderLessonJumpButton = (lesson, variant = 'dashboard') => {
        const isLatest = latestLesson?.lessonKey === lesson.lessonKey;
        const itemClass = variant === 'dropdown'
            ? 'lesson-jump-menu-item'
            : `dashboard-mini-nav-item lesson-jump-compact ${isLatest ? 'is-latest' : ''}`;
        return `
            <button type="button" class="${itemClass}" data-dashboard-lesson-jump="${escapeHtml(lesson.lessonKey)}">
                <span class="lesson-jump-item">
                    <span class="lesson-jump-item-date">${escapeHtml(formatLessonDate(lesson.date))}</span>
                    <span class="lesson-jump-item-title">${escapeHtml(lesson.title || 'Untitled lesson')}</span>
                    ${isLatest ? '<span class="lesson-jump-latest-dot" aria-label="Latest lesson"></span>' : ''}
                </span>
            </button>
        `;
    };
    const emptyLabel = '<p class="px-2 py-1 text-xs text-slate-500">No lessons available yet.</p>';
    if (container) {
        container.innerHTML = `
            <div class="dashboard-mini-nav-meta">
                <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">${lessonNavSearchTerm.trim() ? 'Matching Lessons' : 'Recent Lessons'}</p>
                <p class="text-[11px] font-label font-bold uppercase tracking-[0.18em] text-slate-400">${filteredLessons.length}</p>
            </div>
            <div class="dashboard-mini-nav-list mt-2">
                ${lessonsToShow.map((lesson) => renderLessonJumpButton(lesson, 'dashboard')).join('') || '<div class="dashboard-mini-nav-empty">No lessons match this search.</div>'}
            </div>
            ${!lessonNavSearchTerm.trim() && filteredLessons.length > 3 ? `
                <button type="button" id="dashboardLessonNavigatorMore" class="mt-2 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-white/85 px-4 py-2 font-label text-[11px] font-bold uppercase tracking-[0.18em] text-blue-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-blue-50">
                    <span>${dashboardLessonNavigatorExpanded ? 'Show Fewer' : 'More lessons'}</span>
                    <span aria-hidden="true">→</span>
                </button>
            ` : ''}
        `;
    }
    if (jumpList) {
        jumpList.innerHTML = studentLessons.map((lesson) => renderLessonJumpButton(lesson, 'dropdown')).join('') || emptyLabel;
    }

    window.requestAnimationFrame(() => {
        const input = document.getElementById('lessonNavSearch');
        if (input && lessonNavSearchTerm && document.activeElement !== input) {
            input.value = lessonNavSearchTerm;
        }
    });
}

function closeLessonJumpDropdown() {
    document.getElementById('lessonJumpDropdown')?.classList.add('hidden');
}

function toggleLessonJumpDropdown() {
    document.getElementById('lessonJumpDropdown')?.classList.toggle('hidden');
}

function handleLessonJumpSelection(lessonKey) {
    if (!lessonKey) return;
    closeLessonJumpDropdown();
    jumpToLessonSectionAndOpen(lessonKey);
}

function renderFlashcardTopicFilters(entries) {
    const container = document.getElementById('flashcardTopicFilters');
    if (!container) return;
    const topics = [...new Set(entries.flatMap((entry) => entry.topicValues))];
    const maxVisible = 4;
    const visibleTopics = topics.slice(0, maxVisible);
    const hiddenTopics = topics.slice(maxVisible);
    let html = [
        `<button type="button" class="flashcard-topic-filter ${flashcardActiveTopic ? '' : 'is-active'}" data-flashcard-topic="">All Topics</button>`,
        ...visibleTopics.map((topic) => `<button type="button" class="flashcard-topic-filter ${flashcardActiveTopic === topic ? 'is-active' : ''}" data-flashcard-topic="${escapeHtml(topic)}">${escapeHtml(formatLessonTopicLabel(topic))}</button>`)
    ].join('');
    if (hiddenTopics.length > 0) {
        html += `<button type="button" id="showMoreTopicFilters" class="flashcard-topic-filter !bg-sky-50 !text-sky-700 hover:!bg-sky-100" onclick="this.parentElement.querySelectorAll('.topic-filter-hidden').forEach(e=>e.style.display='inline-flex'); this.remove();">+${hiddenTopics.length} more</button>`;
        html += hiddenTopics.map((topic) => `<button type="button" class="flashcard-topic-filter topic-filter-hidden ${flashcardActiveTopic === topic ? 'is-active' : ''}" data-flashcard-topic="${escapeHtml(topic)}" style="display:none">${escapeHtml(formatLessonTopicLabel(topic))}</button>`).join('');
    }
    container.innerHTML = html;
}

function renderVocabularyFlashcards() {
    const availableEntries = buildFlashcardEntries({ ignoreTopic: true });
    const baseEntries = buildFlashcardEntries();
    const deck = getFlashcardDeck(baseEntries);
    const focusLabel = document.getElementById('vocabularyFocusLabel');
    const counter = document.getElementById('flashcardCounter');
    const lessonLabel = document.getElementById('flashcardLessonLabel');
    const word = document.getElementById('flashcardWord');
    const ipa = document.getElementById('flashcardIpa');
    const definition = document.getElementById('flashcardDefinition');
    const translation = document.getElementById('flashcardTranslation');
    const example = document.getElementById('flashcardExample');
    const collocations = document.getElementById('flashcardCollocations');
    const lessonBack = document.getElementById('flashcardLessonBack');
    const prevBtn = document.getElementById('flashcardPrevBtn');
    const nextBtn = document.getElementById('flashcardNextBtn');
    const reviewedLabel = document.getElementById('flashcardReviewedLabel');
    const reviewedBar = document.getElementById('flashcardReviewedBar');
    const browseList = document.getElementById('flashcardBrowseList');
    const browseGrid = document.getElementById('flashcardBrowseGrid');
    const browsePage = document.getElementById('flashcardBrowsePageLabel');
    const browsePrev = document.getElementById('flashcardBrowsePrevPage');
    const browseNext = document.getElementById('flashcardBrowseNextPage');
    const browseCompactShell = document.getElementById('flashcardBrowseCompactShell');
    const browseGridShell = document.getElementById('flashcardBrowseGridShell');
    const browseViewSelect = document.getElementById('flashcardBrowseViewSelect');
    const lessonTopLabel = document.getElementById('flashcardLessonLabel');
    const browseModeBtn = document.getElementById('flashcardBrowseModeBtn');
    const studyModeBtn = document.getElementById('flashcardStudyModeBtn');
    if (!counter || !word || !ipa || !definition || !translation || !example || !collocations || !lessonBack || !prevBtn || !nextBtn || !reviewedLabel || !reviewedBar || !browseList || !browseGrid || !browsePage || !browsePrev || !browseNext || !browseCompactShell || !browseGridShell || !browseViewSelect || !focusLabel || !browseModeBtn || !studyModeBtn || !lessonTopLabel) return;

    browseModeBtn.classList.toggle('is-active', flashcardMode === 'browse');
    studyModeBtn.classList.toggle('is-active', flashcardMode === 'study');
    browseViewSelect.value = flashcardBrowseCompact ? 'compact' : 'grid';
    browseCompactShell.classList.toggle('hidden', !flashcardBrowseCompact);
    browseGridShell.classList.toggle('hidden', flashcardBrowseCompact);
    renderFlashcardTopicFilters(availableEntries);

    syncFlashcardIndex(deck);
    const entry = deck[flashcardCurrentIndex] || null;
    if (!entry) {
        counter.textContent = '0 of 0';
        focusLabel.textContent = 'No flashcards match the current lesson, topic, or search filters.';
        lessonLabel.textContent = 'No lesson selected';
        word.textContent = 'No flashcards';
        ipa.textContent = 'Adjust the filters to reopen the deck.';
        definition.textContent = 'Definitions will appear here once the filter returns results.';
        translation.textContent = 'Translation unavailable';
        example.textContent = 'Example sentence unavailable';
        collocations.textContent = 'No collocations recorded.';
        lessonBack.textContent = 'Lesson unavailable';
        browseList.innerHTML = '<p class="text-sm text-slate-500 text-center">No cards found for this filter.</p>';
        browseGrid.innerHTML = '';
        browsePage.textContent = '0/0';
        prevBtn.disabled = true;
        nextBtn.disabled = true;
        browsePrev.disabled = true;
        browseNext.disabled = true;
        reviewedLabel.textContent = '0%';
        reviewedBar.style.width = '0%';
        toggleFlashcardFlip(false);
        return;
    }

    flashcardReviewedKeys.add(entry.entryKey);
    const reviewedCount = deck.filter((item) => flashcardReviewedKeys.has(item.entryKey)).length;
    const reviewedPercent = deck.length ? Math.round((reviewedCount / deck.length) * 100) : 0;
    flashcardBrowseIndex = Math.min(deck.length - 1, Math.max(0, flashcardBrowseIndex));
    const browseEntry = deck[flashcardBrowseIndex] || entry;

    counter.textContent = `${flashcardCurrentIndex + 1} of ${deck.length}`;
    focusLabel.textContent = flashcardMode === 'study'
        ? `Study Mode is shuffling ${deck.length} filtered cards.`
        : `Browse All is showing ${deck.length} filtered cards in archive order.`;
    lessonLabel.textContent = `${entry.lesson.title || 'Untitled lesson'} • ${formatLessonDate(entry.lesson.date)}`;
    word.textContent = entry.keyword.word || 'Untitled keyword';
    ipa.textContent = getFlashcardIpa(entry.keyword);
    // Respelling: convert IPA to a more readable form
    const respellingEl = document.getElementById('flashcardRespelling');
    if (respellingEl) {
        const rawIpa = getFlashcardIpa(entry.keyword);
        respellingEl.textContent = ipaToRespelling(rawIpa);
    }
    // Speaker button: use TTS to pronounce the word
    const speakerBtn = document.getElementById('flashcardSpeakerBtn');
    if (speakerBtn) {
        speakerBtn.onclick = () => {
            const w = entry.keyword.word;
            if (!w) return;
            const voice = (typeof currentVoice === 'string' && currentVoice) ? currentVoice : 'af_nova';
            fetch('/api/conversa/tts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: w, voice: voice })
            }).then(r => r.json()).then(d => {
                if (d.audio) {
                    const a = new Audio('/api/conversa' + d.audio);
                    a.play().catch(() => {});
                }
            }).catch(() => {});
        };
    }
    definition.textContent = getLessonKeywordDefinition(entry.keyword);
    translation.textContent = entry.keyword.translation || 'Translation unavailable';
    example.textContent = getLessonKeywordExample(entry.keyword);
    collocations.textContent = getFlashcardCollocationText(entry.keyword);
    lessonBack.textContent = `${entry.lesson.title || 'Untitled lesson'} • ${formatLessonDate(entry.lesson.date)}`;
    prevBtn.disabled = flashcardCurrentIndex === 0;
    nextBtn.disabled = flashcardCurrentIndex >= deck.length - 1;
    reviewedLabel.textContent = `${reviewedPercent}%`;
    reviewedBar.style.width = `${reviewedPercent}%`;
    browsePage.textContent = `${flashcardBrowseIndex + 1}/${deck.length}`;
    browsePrev.disabled = flashcardBrowseIndex === 0;
    browseNext.disabled = flashcardBrowseIndex >= deck.length - 1;
    browseList.innerHTML = browseEntry ? `
        <button type="button" class="flashcard-browse-item ${flashcardBrowseIndex === flashcardCurrentIndex ? 'is-active' : ''}" data-flashcard-jump-index="${flashcardBrowseIndex}">
            <div class="space-y-4">
                <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0">
                        <p class="font-headline text-xl leading-tight text-slate-900">${escapeHtml(browseEntry.keyword.word || 'Untitled')}</p>
                        <p class="mt-2 font-mono text-sm text-sky-700">${escapeHtml(getFlashcardIpa(browseEntry.keyword))}</p>
                    </div>
                    <button type="button" class="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-50 text-sky-600 transition-colors hover:bg-sky-100" data-flashcard-play-index="${flashcardBrowseIndex}" aria-label="Play pronunciation">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
                    </button>
                </div>
                <div class="flex items-center justify-between gap-3">
                    <span class="inline-flex items-center rounded-full bg-sky-50 px-3 py-1 text-[10px] font-label font-bold uppercase tracking-[0.18em] text-sky-700">${escapeHtml(formatLessonTopicLabel(normalizeLessonTopics(browseEntry.lesson.topics)[0] || 'General'))}</span>
                    <span class="text-[10px] font-label font-bold uppercase tracking-[0.16em] text-slate-400">${escapeHtml(formatLessonDate(browseEntry.lesson.date))}</span>
                </div>
            </div>
        </button>
    ` : '<p class="text-sm text-slate-500 text-center">No cards found for this filter.</p>';
    browseGrid.innerHTML = deck.map((item, index) => `
        <button type="button" class="flashcard-browse-item ${index === flashcardCurrentIndex ? 'is-active' : ''}" data-flashcard-jump-index="${index}">
            <div class="space-y-3">
                <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0">
                        <p class="font-headline text-lg leading-none text-slate-900">${escapeHtml(item.keyword.word || 'Untitled')}</p>
                        <p class="mt-1 text-sm text-slate-500">${escapeHtml(getFlashcardIpa(item.keyword))}</p>
                    </div>
                    <span class="text-[10px] font-label font-bold uppercase tracking-[0.16em] text-slate-400">${index + 1}/${deck.length}</span>
                </div>
                <div class="flex items-center justify-between gap-3">
                    <span class="inline-flex items-center rounded-full bg-sky-50 px-3 py-1 text-[10px] font-label font-bold uppercase tracking-[0.18em] text-sky-700">${escapeHtml(formatLessonTopicLabel(normalizeLessonTopics(item.lesson.topics)[0] || 'General'))}</span>
                    <span class="text-[10px] font-label font-bold uppercase tracking-[0.16em] text-slate-400">${escapeHtml(formatLessonDate(item.lesson.date))}</span>
                </div>
            </div>
        </button>
    `).join('');
    toggleFlashcardFlip(false);
}

function getLessonTopicGradient(topic, index = 0) {
    const normalized = String(topic || '').trim().toLowerCase();
    return LESSON_TOPIC_COLORS[normalized] || LESSON_TOPIC_FALLBACKS[index % LESSON_TOPIC_FALLBACKS.length];
}

function renderLessonTopicTags(lesson, options = {}) {
    const {
        interactive = false,
        activeTopic = '',
        sizeClasses = 'px-1.5 py-0.5 text-[7px] md:px-2 md:py-0.5 md:text-[9px]'
    } = options;
    const topics = normalizeLessonTopics(lesson?.topics);
    if (!topics.length) return '';

    return `
        <div class="lesson-topic-tags">
            ${topics.map((topic, topicIdx) => {
                const [c1, c2] = getLessonTopicGradient(topic, topicIdx);
                const isActive = activeTopic === topic;
                const attrs = interactive
                    ? `type="button" data-lesson-topic-badge="${escapeHtml(topic)}" data-lesson-topic-click="${escapeHtml(lesson.lessonKey)}" data-topic-value="${escapeHtml(topic)}" aria-pressed="${isActive ? 'true' : 'false'}"`
                    : '';
                return `
                    <button
                        ${attrs}
                        class="lesson-topic-tag inline-flex items-center rounded-full font-label font-bold uppercase tracking-[0.18em] text-white ${sizeClasses} ${isActive ? 'is-active' : ''}"
                        style="background: linear-gradient(135deg, ${c1}, ${c2})"
                    >${escapeHtml(topic)}</button>
                `;
            }).join('')}
        </div>
    `;
}

function renderLessonKeywordToolbar(lesson) {
    const activeTopic = lessonKeywordTopicFilters[lesson.lessonKey] || '';
    const tags = renderLessonTopicTags(lesson, {
        interactive: true,
        activeTopic,
        sizeClasses: 'px-2 py-1 text-[7px] md:px-2.5 md:py-1 md:text-[9px]'
    });

    if (!tags) return '';

    return `
        <div class="lesson-keyword-toolbar rounded-2xl px-3 py-3 md:px-4">
            <div class="min-w-0">
                <p class="font-label text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">Filter Keywords</p>
                <p class="mt-1 font-body text-xs text-slate-500" data-lesson-topic-active-label>${activeTopic ? `Filtered by ${escapeHtml(activeTopic)}` : 'Showing all keywords'}</p>
            </div>
            <div class="flex flex-wrap items-center justify-end gap-2">
                ${activeTopic ? `<span class="inline-flex min-h-[44px] items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-2 font-label text-[10px] font-bold uppercase tracking-[0.2em] text-blue-700">Active: ${escapeHtml(activeTopic)}</span>` : ''}
                ${tags}
                <button
                    type="button"
                    data-lesson-topic-clear="${escapeHtml(lesson.lessonKey)}"
                    class="lesson-topic-clear inline-flex items-center gap-1 rounded-full border border-blue-200 bg-white px-3 py-2 font-label text-[10px] font-bold uppercase tracking-[0.2em] text-blue-700 shadow-sm"
                    ${activeTopic ? '' : 'hidden'}
                >
                    <span class="material-symbols-outlined text-xs">close</span>
                    Show All
                </button>
            </div>
        </div>
    `;
}

function getLessonKeywordKey(lessonKey, keywordIdx) {
    return `${lessonKey}::${keywordIdx}`;
}

function getLessonKeywordRef(lessonIdx, keywordIdx) {
    const lesson = lessonsData[lessonIdx];
    const keyword = lesson?.keywords?.[keywordIdx];
    return { lesson, keyword };
}

function getLessonKeywordDefinition(keyword) {
    return keyword?.definition_en || keyword?.definition_pl || 'No definition available.';
}

function getLessonKeywordExample(keyword) {
    return keyword?.example_en || 'No example available.';
}

function getLessonBadgeGradient(lessonIdx) {
    const palette = [
        ['#0f766e', '#14b8a6'],
        ['#2563eb', '#38bdf8'],
        ['#7c3aed', '#a78bfa'],
        ['#ea580c', '#f59e0b'],
        ['#be123c', '#fb7185']
    ];
    return palette[Math.abs(lessonIdx) % palette.length];
}

function getLessonKeywordDataTopics(keyword, lessonTopics, keywordIdx) {
    return getKeywordTopicAssignment(keyword, lessonTopics, keywordIdx);
}

function ensureExpandedLessonVisible(lessonKey, behavior = 'smooth') {
    const card = document.querySelector(`.lesson-card[data-lesson-key="${escapeJsString(lessonKey)}"]`);
    if (!card) return;
    const offset = 110;
    const y = card.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top: y, behavior });
}

function syncLessonNavigation(filteredLessons = getFilteredLessons()) {
    const desktop = document.getElementById('lessonNavSidebar');
    const mobile = document.getElementById('lessonMobileStrip');
    if (!desktop || !mobile) return;

    desktop.innerHTML = filteredLessons.map((lesson) => {
        const analysis = getAnalysisForLesson(lesson);
        const isActive = lesson.lessonKey === expandedLessonKey;
        return `
            <button type="button" class="lesson-nav-card w-full rounded-[1.35rem] border px-4 py-3 text-left ${isActive ? 'is-active border-blue-300 bg-blue-50/90' : 'border-slate-200 bg-white/80'}" data-lesson-nav-jump="${escapeHtml(lesson.lessonKey)}">
                <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0">
                        <p class="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">${escapeHtml(formatLessonDate(lesson.date))}</p>
                        <p class="mt-1 text-sm font-semibold leading-snug text-slate-900">${escapeHtml(lesson.title || 'Untitled lesson')}</p>
                    </div>
                    ${analysis?.cefrBand ? `<span class="score-pill ${String(analysis.cefrBand).toLowerCase()} shrink-0">${escapeHtml(analysis.cefrBand)}</span>` : ''}
                </div>
                <div class="mt-3 flex items-center justify-between gap-2 text-[11px] font-label font-bold uppercase tracking-[0.16em]">
                    <span class="text-slate-500">${escapeHtml(formatLessonCountLabel(lesson.keyword_count || (lesson.keywords || []).length || 0, 'keyword'))}</span>
                    <span class="text-slate-400">${escapeHtml(lesson.level || 'Level n/a')}</span>
                </div>
            </button>
        `;
    }).join('');

    mobile.innerHTML = filteredLessons.map((lesson) => {
        const analysis = getAnalysisForLesson(lesson);
        const isActive = lesson.lessonKey === expandedLessonKey;
        return `
            <button type="button" class="lesson-nav-card shrink-0 rounded-full border px-4 py-2 text-left ${isActive ? 'is-active border-blue-300 bg-blue-50/90' : 'border-slate-200 bg-white/90'}" data-lesson-nav-jump="${escapeHtml(lesson.lessonKey)}">
                <span class="block font-label text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">${escapeHtml(formatLessonDate(lesson.date))}</span>
                <span class="mt-1 block text-sm font-semibold text-slate-900">${escapeHtml(lesson.title || 'Untitled lesson')}</span>
                <span class="mt-1 block text-[11px] text-slate-500">${escapeHtml(formatLessonCountLabel(lesson.keyword_count || (lesson.keywords || []).length || 0, 'keyword'))}${analysis?.cefrBand ? ` · ${escapeHtml(analysis.cefrBand)}` : ''}</span>
            </button>
        `;
    }).join('');
}

function openLessonByKey(lessonKey, options = {}) {
    const { scroll = true, behavior = 'smooth' } = options;
    if (expandedLessonKey !== lessonKey) {
        expandedLessonKey = lessonKey;
        expandedLessonKeywordKey = null;
        resetExpandedLessonKeywordPanels();
        renderLessonsDashboard();
    }
    if (lessonKey) preloadYouGlishForLesson(lessonKey);
    if (scroll) {
        window.setTimeout(() => ensureExpandedLessonVisible(lessonKey, behavior), 80);
    }
}

function jumpToKeywordInLesson(lessonKey, keywordKey) {
    openLessonByKey(lessonKey, { scroll: true });
    expandedLessonKeywordKey = keywordKey;
    resetExpandedLessonKeywordPanels();
    window.setTimeout(() => {
        syncLessonKeywordExpansion(true);
        const row = document.querySelector(`[data-lesson-keyword-key="${escapeJsString(keywordKey)}"]`);
        row?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 110);
}

function renderLessonAnalysisList(items, tone, icon, emptyLabel) {
    if (!items?.length) {
        return `<p class="text-sm leading-relaxed text-slate-500">${escapeHtml(emptyLabel)}</p>`;
    }
    return `
        <ul class="analysis-section-list space-y-2">
            ${items.map((item) => {
                const text = normalizeAnalysisText(item);
                const escaped = escapeHtml(text);
                const linked = escaped.replace(/(https?:\/\/[^\s<]+\.?)(?=[^\w/]|$)/g, '<a href="$1" target="_blank" class="underline text-blue-600 hover:text-blue-800 break-all">$1</a>');
                return `<li><span class="material-symbols-outlined ${tone} text-base mt-0.5">${icon}</span><span>${linked}</span></li>`;
            }).join('')}
        </ul>
    `;
}

function renderLessonAnalysisErrors(lesson, analysis) {
    const errors = analysis?.keyErrors || [];
    if (!errors.length) {
        return `<p class="text-sm leading-relaxed text-slate-500">No key errors were recorded for this lesson.</p>`;
    }

    return `
        <div class="flex flex-wrap gap-2">
            ${errors.map((entry) => {
                const errorText = normalizeAnalysisText(entry?.error);
                const correctionText = normalizeAnalysisText(entry?.correction);
                const matchedKeywordIndex = lesson?.keywords?.findIndex((keyword) => {
                    const probe = `${errorText} ${correctionText}`.toLowerCase();
                    return probe.includes(String(keyword.word || '').toLowerCase());
                }) ?? -1;

                if (matchedKeywordIndex >= 0 && lesson) {
                    const keywordKey = getLessonKeywordKey(lesson.lessonKey, matchedKeywordIndex);
                    return `<button type="button" class="error-tag ${entry?.category || 'grammar'}" data-jump-keyword="${escapeHtml(keywordKey)}"><strong>${escapeHtml(errorText)}</strong> → ${escapeHtml(correctionText)}</button>`;
                }

                return `<div class="error-tag ${entry?.category || 'grammar'}"><strong>${escapeHtml(errorText)}</strong> → ${escapeHtml(correctionText)}</div>`;
            }).join('')}
        </div>
    `;
}

function renderLessonAnalysisSummary(lesson) {
    const analysis = getAnalysisForLesson(lesson);
    if (!analysis) return '';
    const trend = getAnalysisTrend(analysis);
    const scores = [
        { label: 'Vocabulary', value: analysis.vocabularyRange, color: 'emerald' },
        { label: 'Grammar', value: analysis.grammaticalAccuracy, color: 'rose' },
        { label: 'Fluency', value: analysis.fluencyAndCoherence, color: 'amber' },
        { label: 'Pronunciation', value: analysis.pronunciation, color: 'purple' },
        { label: 'Communication', value: analysis.communicativeEffectiveness, color: 'blue' }
    ];
    const resolvedDate = getResolvedAnalysisDate(analysis) || lesson.date;
    const lessonSummary = getAnalysisSummaryField(analysis, 'lessonSummary');
    const strengthSummary = getAnalysisSummaryField(analysis, 'strengthSummary');
    const improvementsSummary = getAnalysisSummaryField(analysis, 'improvementsSummary');
    const strengths = getAnalysisListField(analysis, 'strengths', 'strengthSummary');
    const improvements = getAnalysisListField(analysis, 'improvements', 'improvementsSummary');
    const practiceAdvice = (analysis.practiceAdvice || []).map(normalizeAnalysisText).filter(Boolean);

    return `
        <section class="lesson-analysis-summary space-y-4" id="lesson-summary-${escapeHtml(lesson.lessonKey)}">
            <div class="feedback-card feedback-report-card">
                <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div class="max-w-2xl">
                        <p class="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-sky-700">Lesson Analysis</p>
                        <div class="mt-2 flex flex-wrap items-center gap-3">
                            <span class="score-pill ${String(analysis.cefrBand || 'b1').toLowerCase()}">${escapeHtml(analysis.cefrBand || 'B1')} ${Math.round(Number(analysis.overallScore || 0))}</span>
                            <span class="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-[11px] font-label font-bold uppercase tracking-[0.18em] text-slate-700">
                                <span class="material-symbols-outlined text-sm ${trend.tone}">${trend.icon}</span>
                                <span>${escapeHtml(trend.label)}</span>
                            </span>
                            <span class="font-label text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">${escapeHtml(formatLessonDate(resolvedDate))}</span>
                        </div>
                        <p class="mt-4 text-sm leading-relaxed text-slate-700">${escapeHtml(lessonSummary || 'No summary available.')}</p>
                    </div>
                    <div class="feedback-meta-card rounded-[1.35rem] px-4 py-4 min-w-[180px]">
                        <p class="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Overall Score</p>
                        <p class="mt-2 font-headline text-2xl text-slate-900">${Math.round(Number(analysis.overallScore || 0))}/100</p>
                        <p class="mt-2 text-sm text-slate-600">${escapeHtml(lesson.title || 'Lesson analysis')}</p>
                    </div>
                </div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
                ${scores.map((score) => `
                    <div class="analysis-score-card">
                        <div class="flex items-center justify-between gap-3">
                            <p class="font-label text-[10px] font-bold uppercase tracking-widest text-slate-400">${score.label}</p>
                            <p class="analysis-score-value ${score.color}">${Math.round(Number(score.value || 0))}</p>
                        </div>
                        <div class="analysis-score-bar mt-3">
                            <div class="analysis-score-fill bg-gradient-to-r ${getScoreBarClass(score.color)}" style="width:${Math.round(Number(score.value || 0))}%"></div>
                        </div>
                    </div>
                `).join('')}
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div class="feedback-card">
                    <h4><span class="material-symbols-outlined text-sm align-middle mr-1 text-emerald-600">thumb_up</span>Strengths</h4>
                    ${strengthSummary ? `<p class="mt-2 text-sm leading-relaxed text-slate-700">${escapeHtml(strengthSummary)}</p>` : ''}
                    <div class="mt-2">${renderLessonAnalysisList(strengths, 'text-emerald-500', 'check_circle', 'No strengths were saved for this lesson.')}</div>
                </div>
                <div class="feedback-card">
                    <h4><span class="material-symbols-outlined text-sm align-middle mr-1 text-amber-600">trending_up</span>Areas to Improve</h4>
                    ${improvementsSummary ? `<p class="mt-2 text-sm leading-relaxed text-slate-700">${escapeHtml(improvementsSummary)}</p>` : ''}
                    <div class="mt-2">${renderLessonAnalysisList(improvements, 'text-amber-500', 'arrow_upward', 'No improvement notes were saved for this lesson.')}</div>
                </div>
            </div>

            <div class="feedback-card">
                <h4><span class="material-symbols-outlined text-sm align-middle mr-1 text-rose-500">error_outline</span>Key Errors</h4>
                <div class="mt-2">${renderLessonAnalysisErrors(lesson, analysis)}</div>
            </div>

            <div class="feedback-card">
                <h4><span class="material-symbols-outlined text-sm align-middle mr-1 text-purple-500">fitness_center</span>Practice Advice</h4>
                <div class="mt-2">${renderLessonAnalysisList(practiceAdvice, 'text-purple-500', 'tips_and_updates', 'No practice advice was recorded for this lesson.')}</div>
            </div>

            <details class="feedback-card group">
                <summary class="flex cursor-pointer list-none items-center justify-between gap-3">
                    <div>
                        <p class="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Detailed Analysis</p>
                        <p class="mt-1 text-sm text-slate-500">Open the full report for the complete teacher notes.</p>
                    </div>
                    <span class="material-symbols-outlined text-slate-400 transition-transform group-open:rotate-180">expand_more</span>
                </summary>
                <div class="mt-4 space-y-4">
                    <div>
                        <h4>Summary</h4>
                        <p class="mt-2 text-sm leading-relaxed text-slate-700">${escapeHtml(lessonSummary || 'No summary available.')}</p>
                    </div>
                    <div>
                        <h4>Strengths</h4>
                        ${strengthSummary ? `<p class="mt-2 text-sm leading-relaxed text-slate-700">${escapeHtml(strengthSummary)}</p>` : ''}
                        <div class="mt-2">${renderLessonAnalysisList(getAnalysisListField(analysis, 'strengths', 'strengthSummary'), 'text-emerald-500', 'check_circle', 'No strengths were saved for this lesson.')}</div>
                    </div>
                    <div>
                        <h4>Areas to Improve</h4>
                        ${improvementsSummary ? `<p class="mt-2 text-sm leading-relaxed text-slate-700">${escapeHtml(improvementsSummary)}</p>` : ''}
                        <div class="mt-2">${renderLessonAnalysisList(getAnalysisListField(analysis, 'improvements', 'improvementsSummary'), 'text-amber-500', 'arrow_upward', 'No improvement notes were saved for this lesson.')}</div>
                    </div>
                    <div>
                        <h4>Practice Advice</h4>
                        <div class="mt-2">${renderLessonAnalysisList((analysis.practiceAdvice || []).map(normalizeAnalysisText).filter(Boolean), 'text-purple-500', 'tips_and_updates', 'No practice advice was recorded for this lesson.')}</div>
                    </div>
                </div>
            </details>
        </section>
    `;
}

function normalizeCollocationEntries(items, options = {}) {
    if (!Array.isArray(items)) return [];
    const {
        fallbackLabel = '',
        compact = false
    } = options;

    return items.map((item) => {
        if (!item) return null;
        if (typeof item === 'string') {
            return {
                title: item.trim(),
                detail: '',
                badge: fallbackLabel || ''
            };
        }
        if (typeof item !== 'object') return null;

        const title = [
            item.phrase,
            item.pattern,
            item.title,
            item.term,
            item.synonym,
            item.word,
            item.name,
            item.label,
            item.example,
            item.context
        ].map((value) => String(value || '').trim()).find(Boolean) || '';
        const detail = [
            item.example,
            item.description,
            item.context,
            item.note,
            item.usage,
            item.reason,
            item.meaning,
            item.explanation,
            item.nuance
        ].map((value) => String(value || '').trim()).find((value) => value && value !== title) || '';
        const badge = [
            item.industry,
            item.category,
            item.domain,
            item.register,
            item.type,
            fallbackLabel
        ].map((value) => String(value || '').trim()).find(Boolean) || '';

        if (!title && !detail) return null;
        return { title: title || detail, detail: title && detail === title ? '' : detail, badge };
    }).filter(Boolean).map((entry) => {
        const titleClass = compact ? 'font-label text-sm font-bold text-sky-700 leading-snug break-words' : 'font-label text-sm font-bold text-primary leading-snug break-words';
        return `
            <div class="collocation-section-entry space-y-2">
                <div class="flex flex-wrap items-start justify-between gap-2">
                    <p class="${titleClass}">${escapeHtml(entry.title)}</p>
                    ${entry.badge ? `<span class="inline-flex items-center rounded-full border border-sky-100 bg-sky-50 px-2.5 py-1 font-label text-[10px] font-bold uppercase tracking-[0.16em] text-sky-700">${escapeHtml(entry.badge)}</span>` : ''}
                </div>
                ${entry.detail ? `<p class="font-body text-sm leading-relaxed text-slate-600 break-words">${escapeHtml(entry.detail)}</p>` : ''}
            </div>
        `;
    });
}

function buildCollocationSections(collocations, synonyms = []) {
    if (!collocations || typeof collocations !== 'object') return [];

    const sections = [
        {
            title: 'Usage Examples',
            items: normalizeCollocationEntries(
                collocations.usageExamples || collocations.examples || collocations.exampleSentences || [],
                { fallbackLabel: 'example', compact: true }
            )
        },
        {
            title: 'Common Patterns',
            items: normalizeCollocationEntries(
                collocations.commonPatterns || collocations.usagePatterns || collocations.commonCollocations || collocations.patterns || [],
                { fallbackLabel: 'pattern', compact: true }
            )
        },
        {
            title: 'Industry Context',
            items: normalizeCollocationEntries(
                collocations.industryContext || collocations.industryContexts || collocations.contexts || collocations.domainExamples || [],
                { fallbackLabel: 'context', compact: true }
            )
        },
        {
            title: 'Synonyms',
            items: normalizeCollocationEntries(
                collocations.synonyms || synonyms || [],
                { fallbackLabel: 'alternative', compact: true }
            )
        }
    ];

    return sections.filter((section) => section.items.length);
}

function renderCollocationSections(collocations, compact = false, synonyms = []) {
    const sectionClass = compact ? 'collocation-section-card rounded-[1.15rem] p-4 space-y-3 bg-white/[0.85] border border-slate-200/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]' : 'collocation-section-card rounded-2xl bg-slate-50 p-4 space-y-3';
    const labelClass = compact ? 'font-label text-[11px] font-bold uppercase tracking-widest text-slate-400' : 'font-label text-xs font-bold uppercase tracking-widest text-slate-400';
    const sections = buildCollocationSections(collocations, synonyms);
    if (!sections.length) return '';

    return sections.map((section) => `
        <div class="${sectionClass}">
            <p class="${labelClass}">${section.title}</p>
            <div class="space-y-3">
                ${section.items.join('')}
            </div>
        </div>
    `).join('');
}

function renderLessonSynonymCards(synonyms) {
    if (!Array.isArray(synonyms) || !synonyms.length) return '';
    return synonyms.map((entry) => {
        if (!entry?.synonym) return '';
        return `
            <div class="lesson-synonym-card rounded-[1.15rem] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.78)]">
                <div class="flex flex-wrap items-start justify-between gap-3">
                    <p class="font-headline text-[1.1rem] leading-tight text-slate-900">${escapeHtml(entry.synonym)}</p>
                    ${entry.industry ? `<span class="lesson-synonym-badge font-label text-[11px] font-semibold">${escapeHtml(entry.industry)}</span>` : ''}
                </div>
                ${entry.nuance ? `
                    <div class="lesson-synonym-nuance mt-3 rounded-[1rem] p-3">
                        <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-amber-700">Nuance</p>
                        <p class="mt-2 text-sm leading-relaxed text-slate-700">${escapeHtml(entry.nuance)}</p>
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');
}

function renderLessonLearnerNotes(learnerNotes) {
    if (!learnerNotes || typeof learnerNotes !== 'object') return '';
    const falseFriends = Array.isArray(learnerNotes.falseFriends) ? learnerNotes.falseFriends.filter((entry) => entry?.polish) : [];
    const commonMistakes = Array.isArray(learnerNotes.commonMistakes) ? learnerNotes.commonMistakes.filter((entry) => entry?.mistake || entry?.correction) : [];
    const usageTip = typeof learnerNotes.usageTip === 'string' ? learnerNotes.usageTip.trim() : '';

    if (!falseFriends.length && !commonMistakes.length && !usageTip) return '';

    return `
        <div class="lesson-learner-notes-card rounded-[1.15rem] p-4 space-y-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.74)]">
            ${falseFriends.length ? `
                <div class="space-y-3">
                    <p class="font-label text-[11px] font-bold uppercase tracking-[0.18em] text-amber-700">False Friends</p>
                    ${falseFriends.map((entry) => `
                        <div class="lesson-false-friend-card rounded-[1rem] p-3">
                            <p class="text-sm leading-relaxed text-slate-700"><span class="font-serif italic text-[1rem] text-rose-700">${escapeHtml(entry.polish)}</span>${entry.polishMeaning ? ` <span class="text-slate-400">→</span> <span class="font-medium text-slate-800">${escapeHtml(entry.polishMeaning)}</span>` : ''}</p>
                            ${entry.confusion ? `<p class="mt-2 text-sm leading-relaxed text-slate-600">${escapeHtml(entry.confusion)}</p>` : ''}
                        </div>
                    `).join('')}
                </div>
            ` : ''}
            ${commonMistakes.length ? `
                <div class="space-y-3">
                    <p class="font-label text-[11px] font-bold uppercase tracking-[0.18em] text-amber-700">Common Mistakes</p>
                    ${commonMistakes.map((entry) => `
                        <div class="lesson-mistake-card rounded-[1rem] p-3">
                            ${entry.mistake ? `<p class="text-sm font-medium leading-relaxed text-rose-700">❌ ${escapeHtml(entry.mistake)}</p>` : ''}
                            ${entry.correction ? `<p class="mt-2 text-sm font-medium leading-relaxed text-emerald-700">✅ ${escapeHtml(entry.correction)}</p>` : ''}
                            ${entry.reason ? `<p class="mt-2 text-xs leading-relaxed text-slate-500">${escapeHtml(entry.reason)}</p>` : ''}
                        </div>
                    `).join('')}
                </div>
            ` : ''}
            ${usageTip ? `
                <div class="rounded-[1rem] border border-amber-200/80 bg-white/80 px-4 py-3">
                    <p class="font-label text-[11px] font-bold uppercase tracking-[0.18em] text-amber-700">Usage Tip</p>
                    <p class="mt-2 text-sm leading-relaxed text-slate-700">${escapeHtml(usageTip)}</p>
                </div>
            ` : ''}
        </div>
    `;
}

function renderLessonKeywordRows(lesson, lessonIdx) {
    const keywords = lesson.keywords || [];
    const lessonTopics = normalizeLessonTopics(lesson.topics);
    const activeTopic = lessonKeywordTopicFilters[lesson.lessonKey] || '';

    if (!keywords.length) {
        return `
            <div class="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-5 text-sm text-slate-500">
                No keywords were saved for this lesson.
            </div>
        `;
    }

    return keywords.map((keyword, keywordIdx) => {
        const keywordKey = getLessonKeywordKey(lesson.lessonKey, keywordIdx);
        const keywordTopics = getLessonKeywordDataTopics(keyword, lessonTopics, keywordIdx);
        const isExpanded = expandedLessonKeywordKey === keywordKey;
        const isCollocationsExpanded = expandedLessonCollocationKey === keywordKey;
        const isSynonymsExpanded = expandedLessonSynonymKey === keywordKey;
        const isLearnerNotesExpanded = expandedLessonLearnerNotesKey === keywordKey;
        const example = getLessonKeywordExample(keyword);
        const definition = getLessonKeywordDefinition(keyword);
        const collocationMarkup = keyword.collocations ? renderCollocationSections(keyword.collocations, true, keyword.synonyms) : '';
        const hasCollocationContent = !!collocationMarkup;
        const spellingVariations = Array.isArray(keyword.spellingVariations) ? keyword.spellingVariations.filter(Boolean) : [];
        const synonymMarkup = renderLessonSynonymCards(Array.isArray(keyword.synonyms) ? keyword.synonyms.filter((entry) => entry?.synonym) : []);
        const learnerNotesMarkup = renderLessonLearnerNotes(keyword.learnerNotes);
        const isTopicMatch = !activeTopic || keywordTopics.includes(activeTopic);

        return `
            <article
                class="vocab-item lesson-keyword-entry ${isTopicMatch ? '' : 'is-filter-hidden'}"
                style="animation-delay: ${keywordIdx * 40}ms"
                data-lesson-keyword-key="${escapeHtml(keywordKey)}"
                data-lesson-topics="${escapeHtml(keywordTopics.join('||'))}"
                id="keyword-anchor-${escapeHtml(keywordKey)}"
            >
                <div class="vocab-row ${isExpanded ? 'is-expanded bg-white/95 text-slate-900 border-blue-200/80' : 'bg-white/[0.88] text-slate-900 border-slate-200/80'} backdrop-blur-xl rounded-2xl border shadow-[0_2px_8px_rgba(0,0,0,0.05)]" data-lesson-keyword-key="${escapeHtml(keywordKey)}" data-lesson-key="${escapeHtml(lesson.lessonKey)}">
                    <div
                        class="vocab-header w-full px-3 py-3 text-left md:px-4 md:py-3 flex items-center justify-between gap-2 md:gap-3"
                        data-lesson-keyword-toggle="${escapeHtml(keywordKey)}"
                        aria-expanded="${isExpanded ? 'true' : 'false'}"
                        role="button"
                        tabindex="0"
                    >
                        <div class="min-w-0 flex-1 flex items-center gap-2 md:gap-3">
                            <span class="inline-flex items-center px-2 py-1 rounded-full text-[9px] font-bold uppercase tracking-[0.18em] text-white shrink-0" style="background: linear-gradient(135deg, ${getLessonBadgeGradient(lessonIdx)[0]}, ${getLessonBadgeGradient(lessonIdx)[1]})">${escapeHtml(formatLessonDate(lesson.date))}</span>
                            <div class="flex flex-col min-w-0 flex-1">
                                <div class="flex items-center gap-2 min-w-0">
                                    <h3 class="vocab-keyword font-headline text-[1.05rem] leading-tight truncate md:text-[1.35rem] md:leading-none">${escapeHtml(keyword.word || 'Untitled keyword')}</h3>
                                </div>
                                <p class="mt-1 truncate text-sm text-slate-500">${escapeHtml(keyword.translation || 'Translation unavailable')}</p>
                            </div>
                        </div>
                        <div class="flex items-center gap-1.5 shrink-0 md:gap-2">
                            <button onclick="event.stopPropagation(); playLessonWord(${lessonIdx}, ${keywordIdx})" class="inline-flex items-center justify-center w-8 h-8 rounded-full bg-sky-50 hover:bg-sky-100 border border-sky-200 transition-colors" title="Preview">
                                <span class="material-symbols-outlined text-sky-600 text-base">volume_up</span>
                            </button>
                            <span class="vocab-chevron material-symbols-outlined text-slate-400 text-lg md:text-xl">expand_more</span>
                        </div>
                    </div>
                    <div id="lesson-vocab-details-${lessonIdx}-${keywordIdx}" class="vocab-details" ${isExpanded ? '' : 'hidden'}>
                        <div class="px-4 pb-4 md:px-5 md:pb-5">
                            <div class="vocab-detail-card lesson-vocab-detail-card rounded-2xl bg-slate-50/90 ring-1 ring-slate-200 p-4 md:p-5">
                                <div class="keyword-two-col">
                                    <div class="space-y-4 min-w-0">
                                        <div class="vocab-expanded-keyword">
                                            <h4 class="font-headline text-[2.2rem] leading-none mb-2">${escapeHtml(keyword.word || 'Untitled keyword')}</h4>
                                            ${spellingVariations.length ? `
                                                <div class="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-500">
                                                    <span class="material-symbols-outlined text-[18px] text-slate-400">spellcheck</span>
                                                    <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Also</span>
                                                    ${spellingVariations.map((variation) => `
                                                        <span class="keyword-spelling-variation-chip text-xs font-medium">${escapeHtml(variation)}</span>
                                                    `).join('')}
                                                </div>
                                            ` : ''}
                                        </div>
                                        <div class="vocab-expanded-ipa" style="display:flex;flex-direction:column;gap:0.25rem">
                                            ${(keyword.stressUK || keyword.stressUS) ? `<div style="display:flex;flex-wrap:wrap;align-items:baseline;gap:0.75rem">
                                                ${keyword.stressUK ? `<span class="font-mono text-sm font-semibold text-blue-500">🇬🇧 ${escapeHtml(keyword.stressUK)}</span>` : ''}
                                                ${keyword.stressUS ? `<span class="font-mono text-sm font-semibold text-blue-500">🇺🇸 ${escapeHtml(keyword.stressUS)}</span>` : ''}
                                            </div>` : ''}
                                            <p class="font-mono text-[0.65rem] text-slate-400">${escapeHtml(keyword.ipa || '')}</p>
                                        </div>
                                        <div class="lesson-topic-tags flex flex-wrap gap-1">
                                            ${normalizeLessonTopics(lesson?.topics).map((topic, i) => {
                                                const [tc1, tc2] = getLessonTopicGradient(topic, i);
                                                return `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-[0.14em] text-white" style="background:linear-gradient(135deg,${tc1},${tc2})">${escapeHtml(topic)}</span>`;
                                            }).join('')}
                                        </div>
                                        <div class="rounded-[1.2rem] border border-slate-200 bg-white/80 p-4">
                                            <p class="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-slate-600">Definition</p>
                                            <p class="mt-2 font-body text-[1rem] leading-relaxed text-slate-700">${escapeHtml(definition)}</p>
                                        </div>
                                        <div class="rounded-[1.2rem] border border-slate-200 bg-white/80 p-4">
                                            <p class="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-slate-600">Example</p>
                                            <p class="mt-2 vocab-example font-body text-[1rem] italic leading-relaxed text-slate-600">${escapeHtml(example)}</p>
                                            ${keyword.example_pl ? `<p class="mt-2 font-body text-sm leading-relaxed text-slate-500">${escapeHtml(keyword.example_pl)}</p>` : ''}
                                        </div>
                                        <div class="flex flex-wrap gap-2.5">
                                            <button onclick="playLessonWord(${lessonIdx}, ${keywordIdx})" class="vocab-action vocab-action-word inline-flex items-center gap-2 px-3.5 py-2.5 rounded-2xl border" title="Play word">
                                                <span class="material-symbols-outlined text-xl">play_arrow</span>
                                                <span class="font-label text-xs font-bold uppercase tracking-[0.24em]">Play Word</span>
                                            </button>
                                            <button onclick="playLessonSentence(${lessonIdx}, ${keywordIdx})" class="vocab-action vocab-action-sentence inline-flex items-center gap-2 px-3.5 py-2.5 rounded-2xl border" title="Play sentence">
                                                <span class="material-symbols-outlined text-xl">record_voice_over</span>
                                                <span class="font-label text-xs font-bold uppercase tracking-[0.24em]">Play Example</span>
                                            </button>
                                            <button onclick="openYouGlish('${escapeJsString(keyword.word || '')}')" class="vocab-action vocab-action-youglish inline-flex items-center gap-2 px-3.5 py-2.5 rounded-2xl border" title="YouGlish">
                                                <span class="material-symbols-outlined text-xl">smart_display</span>
                                                <span class="font-label text-xs font-bold uppercase tracking-[0.24em]">Hear in Context</span>
                                            </button>
                                        </div>
                                        <div id="lyrics-lesson-${lessonIdx}-${keywordIdx}" class="vocab-lyrics hidden lyrics-flow rounded-2xl"></div>
                                    </div>
                                    <div class="space-y-4">
                                        ${hasCollocationContent ? `
                                        <div class="rounded-[1.2rem] border border-slate-200 bg-white/85 p-4">
                                            <div class="flex items-center justify-between gap-3">
                                                <div>
                                                    <p class="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Collocations & Context</p>
                                                    <p class="mt-1 text-sm text-slate-500">Usage patterns, common pairings, and context support.</p>
                                                </div>
                                                <button
                                                    type="button"
                                                    class="vocab-collocation-toggle ${isCollocationsExpanded ? 'is-open' : ''} inline-flex items-center justify-between gap-2 rounded-full border px-3 py-2 text-left"
                                                    data-lesson-collocation-toggle="${escapeHtml(keywordKey)}"
                                                    aria-expanded="${isCollocationsExpanded ? 'true' : 'false'}"
                                                >
                                                    <span class="font-label text-[10px] font-semibold uppercase tracking-[0.18em]">${isCollocationsExpanded ? 'Hide' : 'Show'}</span>
                                                    <span class="material-symbols-outlined text-[20px]">expand_more</span>
                                                </button>
                                            </div>
                                            <div id="lesson-collocations-${lessonIdx}-${keywordIdx}" class="vocab-collocations ${isCollocationsExpanded ? 'is-open' : ''} mt-4" ${isCollocationsExpanded ? '' : 'hidden'}>
                                                <div class="vocab-collocation-panel rounded-2xl">
                                                    <div class="grid gap-4">${collocationMarkup}</div>
                                                </div>
                                            </div>
                                        </div>
                                        ` : ''}
                                        ${synonymMarkup ? `
                                            <div class="rounded-[1.2rem] border border-slate-200 bg-white/85 p-4">
                                                <div class="flex items-center justify-between gap-3">
                                                    <div>
                                                        <p class="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Synonyms & Alternatives</p>
                                                        <p class="mt-1 text-sm text-slate-500">Context-sensitive alternatives with clear usage boundaries.</p>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        class="vocab-collocation-toggle ${isSynonymsExpanded ? 'is-open' : ''} inline-flex items-center justify-between gap-2 rounded-full border px-3 py-2 text-left"
                                                        data-lesson-synonym-toggle="${escapeHtml(keywordKey)}"
                                                        aria-expanded="${isSynonymsExpanded ? 'true' : 'false'}"
                                                    >
                                                        <span class="font-label text-[10px] font-semibold uppercase tracking-[0.18em]">${isSynonymsExpanded ? 'Hide Synonyms' : 'Show Synonyms'}</span>
                                                        <span class="material-symbols-outlined text-[20px]">swap_horiz</span>
                                                    </button>
                                                </div>
                                                <div id="lesson-synonyms-${lessonIdx}-${keywordIdx}" class="vocab-collocations ${isSynonymsExpanded ? 'is-open' : ''} mt-4" ${isSynonymsExpanded ? '' : 'hidden'}>
                                                    <div class="vocab-collocation-panel rounded-2xl p-1">
                                                        <div class="grid gap-4 md:grid-cols-2">${synonymMarkup}</div>
                                                    </div>
                                                </div>
                                            </div>
                                        ` : ''}
                                        ${learnerNotesMarkup ? `
                                            <div class="rounded-[1.2rem] border border-amber-200/80 bg-gradient-to-b from-amber-50/90 to-orange-50/80 p-4">
                                                <div class="flex items-center justify-between gap-3">
                                                    <div>
                                                        <p class="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-amber-700">Polish Learner Notes</p>
                                                        <p class="mt-1 text-sm text-amber-900/70">Teacher notes for typical Polish learner interference and correction patterns.</p>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        class="vocab-collocation-toggle ${isLearnerNotesExpanded ? 'is-open' : ''} inline-flex items-center justify-between gap-2 rounded-full border px-3 py-2 text-left"
                                                        data-lesson-learner-notes-toggle="${escapeHtml(keywordKey)}"
                                                        aria-expanded="${isLearnerNotesExpanded ? 'true' : 'false'}"
                                                    >
                                                        <span class="font-label text-[10px] font-semibold uppercase tracking-[0.18em]">${isLearnerNotesExpanded ? 'Hide Notes' : 'Show Notes'}</span>
                                                        <span class="material-symbols-outlined text-[20px]">school</span>
                                                    </button>
                                                </div>
                                                <div id="lesson-learner-notes-${lessonIdx}-${keywordIdx}" class="vocab-collocations ${isLearnerNotesExpanded ? 'is-open' : ''} mt-4" ${isLearnerNotesExpanded ? '' : 'hidden'}>
                                                    ${learnerNotesMarkup}
                                                </div>
                                            </div>
                                        ` : ''}
                                        <div class="rounded-[1.2rem] border border-slate-200 bg-white/85 p-4">
                                            <p class="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Keyword Notes</p>
                                            <p class="mt-2 text-sm leading-relaxed text-slate-600">Use YouGlish for real-world pronunciation, then replay the built-in example to lock in the phrasing.</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </article>
        `;
    }).join('');
}

function syncLessonExpansion(animate = true) {
    document.querySelectorAll('.lesson-card').forEach((card) => {
        const details = card.querySelector('.lesson-details');
        const toggle = card.querySelector('[data-lesson-toggle]');
        const isExpanded = card.dataset.lessonKey === expandedLessonKey;

        card.classList.toggle('is-expanded', isExpanded);
        if (toggle) {
            toggle.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
        }
        if (!details) return;

        if (!animate) {
            details.hidden = !isExpanded;
            details.style.maxHeight = isExpanded ? `${details.scrollHeight + 32}px` : '0px';
            return;
        }

        if (isExpanded) {
            details.hidden = false;
            details.style.maxHeight = '0px';
            requestAnimationFrame(() => {
                details.style.maxHeight = `${details.scrollHeight + 32}px`;
            });
        } else {
            details.style.maxHeight = `${details.scrollHeight + 32}px`;
            requestAnimationFrame(() => {
                details.style.maxHeight = '0px';
            });
            window.setTimeout(() => {
                if (card.dataset.lessonKey !== expandedLessonKey) {
                    details.hidden = true;
                }
            }, 320);
        }
    });
}

function refreshLessonDetailHeight(lessonKey) {
    const card = document.querySelector(`.lesson-card[data-lesson-key="${escapeJsString(lessonKey)}"]`);
    const details = card?.querySelector('.lesson-details');
    if (!details || details.hidden) return;
    window.setTimeout(() => {
        details.style.maxHeight = `${details.scrollHeight + 48}px`;
    }, 50);
}

function refreshExpandedKeywordHeight(row, lessonKey, delay = 0) {
    const details = row?.querySelector('.vocab-details');
    if (!details || details.hidden) return;
    window.setTimeout(() => {
        details.style.maxHeight = `${details.scrollHeight + 40}px`;
        if (lessonKey) refreshLessonDetailHeight(lessonKey);
    }, delay);
}

function syncLessonKeywordExpansion(animate = true) {
    document.querySelectorAll('#lessonsList .vocab-row[data-lesson-keyword-key]').forEach((row) => {
        const keywordKey = row.dataset.lessonKeywordKey;
        const lessonKey = row.dataset.lessonKey;
        const details = row.querySelector('.vocab-details');
        const toggle = row.querySelector('[data-lesson-keyword-toggle]');
        const isExpanded = keywordKey === expandedLessonKeywordKey;

        row.classList.toggle('is-expanded', isExpanded);
        row.classList.toggle('bg-white/95', isExpanded);
        row.classList.toggle('text-slate-900', isExpanded);
        row.classList.toggle('border-blue-200/80', isExpanded);
        row.classList.toggle('bg-white/[0.88]', !isExpanded);
        row.classList.toggle('border-slate-200/80', !isExpanded);

        if (toggle) {
            toggle.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
        }

        if (!details) return;
        if (!animate) {
            details.hidden = !isExpanded;
            details.style.maxHeight = isExpanded ? `${details.scrollHeight + 32}px` : '0px';
            if (isExpanded) {
                refreshExpandedKeywordHeight(row, lessonKey);
                precacheLessonSentenceByKey(keywordKey);
            }
            return;
        }

        if (isExpanded) {
            details.hidden = false;
            details.style.maxHeight = '0px';
            requestAnimationFrame(() => {
                details.style.maxHeight = `${details.scrollHeight + 32}px`;
                refreshExpandedKeywordHeight(row, lessonKey, 20);
                precacheLessonSentenceByKey(keywordKey);
            });
        } else {
            details.style.maxHeight = `${details.scrollHeight + 32}px`;
            requestAnimationFrame(() => {
                details.style.maxHeight = '0px';
                refreshLessonDetailHeight(lessonKey);
            });
            window.setTimeout(() => {
                if (row.dataset.lessonKeywordKey !== expandedLessonKeywordKey) {
                    details.hidden = true;
                }
            }, 300);
        }
    });
    syncLessonCollocationExpansion(animate);
    syncLessonSynonymExpansion(animate);
    syncLessonLearnerNotesExpansion(animate);
}

function syncLessonCollocationExpansion(animate = true) {
    document.querySelectorAll('#lessonsList [data-lesson-collocation-toggle]').forEach((toggle) => {
        const keywordKey = toggle.dataset.lessonCollocationToggle;
        const row = toggle.closest('.vocab-row');
        const lessonKey = row?.dataset.lessonKey;
        const panel = row?.querySelector('.vocab-collocations');
        const isOpen = keywordKey === expandedLessonCollocationKey && keywordKey === expandedLessonKeywordKey;

        toggle.classList.toggle('is-open', isOpen);
        toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        const label = toggle.querySelector('.font-label');
        if (label) {
            label.textContent = isOpen ? 'Hide Collocations' : 'Show Collocations';
        }

        if (!panel) return;
        if (!animate) {
            panel.hidden = !isOpen;
            panel.style.maxHeight = isOpen ? `${panel.scrollHeight + 96}px` : '0px';
            if (isOpen) refreshExpandedKeywordHeight(row, lessonKey, 20);
            return;
        }

        if (isOpen) {
            panel.hidden = false;
            panel.style.maxHeight = '0px';
            requestAnimationFrame(() => {
                panel.style.maxHeight = `${panel.scrollHeight + 96}px`;
                refreshExpandedKeywordHeight(row, lessonKey, 30);
            });
        } else {
            panel.style.maxHeight = `${panel.scrollHeight + 96}px`;
            requestAnimationFrame(() => {
                panel.style.maxHeight = '0px';
                refreshExpandedKeywordHeight(row, lessonKey, 20);
            });
            window.setTimeout(() => {
                if (toggle.dataset.lessonCollocationToggle !== expandedLessonCollocationKey) {
                    panel.hidden = true;
                }
            }, 280);
        }
    });
}

function syncLessonSynonymExpansion(animate = true) {
    document.querySelectorAll('#lessonsList [data-lesson-synonym-toggle]').forEach((toggle) => {
        const keywordKey = toggle.dataset.lessonSynonymToggle;
        const row = toggle.closest('.vocab-row');
        const lessonKey = row?.dataset.lessonKey;
        const panel = row?.querySelector('[id^="lesson-synonyms-"]');
        const isOpen = keywordKey === expandedLessonSynonymKey && keywordKey === expandedLessonKeywordKey;

        toggle.classList.toggle('is-open', isOpen);
        toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        const label = toggle.querySelector('.font-label');
        if (label) {
            label.textContent = isOpen ? 'Hide Synonyms' : 'Show Synonyms';
        }

        if (!panel) return;
        if (!animate) {
            panel.hidden = !isOpen;
            panel.style.maxHeight = isOpen ? `${panel.scrollHeight + 96}px` : '0px';
            if (isOpen) refreshExpandedKeywordHeight(row, lessonKey, 20);
            return;
        }

        if (isOpen) {
            panel.hidden = false;
            panel.style.maxHeight = '0px';
            requestAnimationFrame(() => {
                panel.style.maxHeight = `${panel.scrollHeight + 96}px`;
                refreshExpandedKeywordHeight(row, lessonKey, 30);
            });
        } else {
            panel.style.maxHeight = `${panel.scrollHeight + 96}px`;
            requestAnimationFrame(() => {
                panel.style.maxHeight = '0px';
                refreshExpandedKeywordHeight(row, lessonKey, 20);
            });
            window.setTimeout(() => {
                if (toggle.dataset.lessonSynonymToggle !== expandedLessonSynonymKey) {
                    panel.hidden = true;
                }
            }, 280);
        }
    });
}

function syncLessonLearnerNotesExpansion(animate = true) {
    document.querySelectorAll('#lessonsList [data-lesson-learner-notes-toggle]').forEach((toggle) => {
        const keywordKey = toggle.dataset.lessonLearnerNotesToggle;
        const row = toggle.closest('.vocab-row');
        const lessonKey = row?.dataset.lessonKey;
        const panel = row?.querySelector('[id^="lesson-learner-notes-"]');
        const isOpen = keywordKey === expandedLessonLearnerNotesKey && keywordKey === expandedLessonKeywordKey;

        toggle.classList.toggle('is-open', isOpen);
        toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        const label = toggle.querySelector('.font-label');
        if (label) {
            label.textContent = isOpen ? 'Hide Notes' : 'Show Notes';
        }

        if (!panel) return;
        if (!animate) {
            panel.hidden = !isOpen;
            panel.style.maxHeight = isOpen ? `${panel.scrollHeight + 96}px` : '0px';
            if (isOpen) refreshExpandedKeywordHeight(row, lessonKey, 20);
            return;
        }

        if (isOpen) {
            panel.hidden = false;
            panel.style.maxHeight = '0px';
            requestAnimationFrame(() => {
                panel.style.maxHeight = `${panel.scrollHeight + 96}px`;
                refreshExpandedKeywordHeight(row, lessonKey, 30);
            });
        } else {
            panel.style.maxHeight = `${panel.scrollHeight + 96}px`;
            requestAnimationFrame(() => {
                panel.style.maxHeight = '0px';
                refreshExpandedKeywordHeight(row, lessonKey, 20);
            });
            window.setTimeout(() => {
                if (toggle.dataset.lessonLearnerNotesToggle !== expandedLessonLearnerNotesKey) {
                    panel.hidden = true;
                }
            }, 280);
        }
    });
}

function setLessonTopicFilter(lessonKey, topic = '') {
    const nextTopic = topic && lessonKeywordTopicFilters[lessonKey] !== topic ? topic : '';
    if (nextTopic) {
        lessonKeywordTopicFilters[lessonKey] = nextTopic;
    } else {
        delete lessonKeywordTopicFilters[lessonKey];
    }

    if (expandedLessonKeywordKey?.startsWith(`${lessonKey}::`)) {
        const expandedEntry = [...document.querySelectorAll('#lessonsList .lesson-keyword-entry[data-lesson-keyword-key]')]
            .find((entry) => entry.dataset.lessonKeywordKey === expandedLessonKeywordKey);
        const topics = (expandedEntry?.dataset.lessonTopics || '').split('||').filter(Boolean);
        const activeTopic = lessonKeywordTopicFilters[lessonKey] || '';
        if (activeTopic && !topics.includes(activeTopic)) {
            expandedLessonKeywordKey = null;
            resetExpandedLessonKeywordPanels();
            syncLessonKeywordExpansion(true);
        }
    }

    applyLessonTopicFilter(lessonKey, true);
}

function applyLessonTopicFilter(lessonKey, animate = false) {
    const card = document.querySelector(`.lesson-card[data-lesson-key="${escapeJsString(lessonKey)}"]`);
    if (!card) return;

    const activeTopic = lessonKeywordTopicFilters[lessonKey] || '';
    const clearButton = [...card.querySelectorAll('[data-lesson-topic-clear]')]
        .find((button) => button.dataset.lessonTopicClear === lessonKey);
    const activeLabel = card.querySelector('[data-lesson-topic-active-label]');

    card.querySelectorAll('[data-lesson-topic-badge]').forEach((badge) => {
        const isActive = !!activeTopic && badge.dataset.lessonTopicBadge === activeTopic;
        badge.classList.toggle('is-active', isActive);
        badge.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });

    if (clearButton) clearButton.hidden = !activeTopic;
    if (activeLabel) activeLabel.textContent = activeTopic ? `Filtered by ${activeTopic}` : 'Showing all keywords';

    const entries = card.querySelectorAll('.lesson-keyword-entry[data-lesson-topics]');
    let visibleIndex = 0;
    entries.forEach((entry) => {
        const topics = (entry.dataset.lessonTopics || '').split('||').filter(Boolean);
        const shouldShow = !activeTopic || topics.includes(activeTopic);
        entry.classList.toggle('is-filter-hidden', !shouldShow);

        if (shouldShow && animate) {
            entry.classList.remove('is-filter-match');
            void entry.offsetWidth;
            entry.style.animationDelay = `${visibleIndex * 45}ms`;
            entry.classList.add('is-filter-match');
            visibleIndex += 1;
        } else {
            entry.classList.remove('is-filter-match');
            entry.style.animationDelay = '0ms';
        }
    });

    window.setTimeout(() => {
        entries.forEach((entry) => entry.classList.remove('is-filter-match'));
        refreshLessonDetailHeight(lessonKey);
    }, 420);
}

function renderLessonPackFilters() {
    const packSelect = document.getElementById('lessonPackFilter');
    if (!packSelect) return;

    const packOptions = getLessonPackOptions();
    const selectedInOptions = selectedLessonPack === 'all' || packOptions.some((option) => option.value === selectedLessonPack);
    if (!selectedInOptions) selectedLessonPack = 'all';

    packSelect.innerHTML = [
        '<option value="all">All lesson packs</option>',
        ...packOptions.map((option) => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)} • ${escapeHtml(option.note)}</option>`)
    ].join('');
    packSelect.value = selectedLessonPack;
    packSelect.disabled = packOptions.length === 0;
}

function renderLessonProfileCard() {
    const profile = getCurrentLessonProfile();
    const encouragementLines = buildLessonEncouragement(getLessonsForStudent(), profile);
    const initials = document.getElementById('lessonProfileInitials');
    const greeting = document.getElementById('lessonProfileGreeting');
    const name = document.getElementById('lessonProfileName');
    const level = document.getElementById('lessonProfileLevel');
    const packCount = document.getElementById('lessonProfilePackCount');
    const lineOne = document.getElementById('lessonProfileLineOne');
    const lineTwo = document.getElementById('lessonProfileLineTwo');
    const lineThree = document.getElementById('lessonProfileLineThree');
    const lessonCount = document.getElementById('lessonProfileLessonCount');
    const keywordCount = document.getElementById('lessonProfileKeywordCount');
    const card = document.getElementById('lessonStudentProfileCard');
    const stickyName = document.getElementById('stickyStudentName');
    const stickyLevel = document.getElementById('stickyStudentLevel');
    const stickySummary = document.getElementById('stickyStudentSummary');
    const latestLessonTitleCard = document.getElementById('latestLessonTitleCard');

    if (initials) initials.textContent = profile.initials;
    if (greeting) greeting.textContent = profile.greeting;
    if (name) name.textContent = profile.name;
    if (level) level.textContent = profile.level;
    if (packCount) packCount.textContent = `${formatLessonCountLabel(profile.packCount, 'lesson')} in your archive`;
    if (lineOne) lineOne.textContent = encouragementLines[0];
    if (lineTwo) lineTwo.textContent = encouragementLines[1];
    if (lineThree) lineThree.textContent = encouragementLines[2];
    if (lessonCount) lessonCount.textContent = String(profile.lessonCount);
    if (keywordCount) keywordCount.textContent = String(profile.keywordCount);
    if (stickyName) stickyName.textContent = profile.name;
    if (stickyLevel) stickyLevel.textContent = profile.level;
    if (stickySummary) stickySummary.textContent = `${profile.lessonCount} lesson packs and ${profile.keywordCount} saved keywords, with quick jumps between report cards and vocabulary.`;
    if (latestLessonTitleCard) latestLessonTitleCard.textContent = profile.latestLessonTitle;
    if (card) {
        card.setAttribute('aria-label', `${profile.name} personal dashboard summary`);
        card.dataset.latestLessonTitle = profile.latestLessonTitle;
    }
}

function renderLessonQuizProgressCard() {
    const completed = document.getElementById('lessonQuizCompleted');
    const average = document.getElementById('lessonQuizAverage');
    const best = document.getElementById('lessonQuizBest');
    const percent = document.getElementById('lessonQuizProgressPercent');
    const bar = document.getElementById('lessonQuizProgressBar');
    const note = document.getElementById('lessonQuizProgressNote');

    if (completed) completed.textContent = String(LESSON_QUIZ_PLACEHOLDER.completed);
    if (average) average.textContent = `${LESSON_QUIZ_PLACEHOLDER.averageScore}%`;
    if (best) best.textContent = `${LESSON_QUIZ_PLACEHOLDER.bestScore}%`;
    if (percent) percent.textContent = `${LESSON_QUIZ_PLACEHOLDER.readinessPercent}%`;
    if (bar) bar.style.width = `${LESSON_QUIZ_PLACEHOLDER.readinessPercent}%`;
    if (note) note.textContent = 'Quiz stats will populate here once lesson quiz tracking is enabled.';
}

function jumpToLessonSectionAndOpen(lessonKey) {
    if (!lessonKey) return;
    updateActiveTabState('page-lessons');
    const section = document.getElementById('page-lessons');
    section?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.setTimeout(() => openLessonByKey(lessonKey, { scroll: true }), 120);
}

function renderLessonsDashboard() {
    const list = document.getElementById('lessonsList');
    if (!list) return;

    renderLessonPackFilters();
    renderLessonProfileCard();
    renderRecentLessonCard();
    renderDashboardLessonNavigator();
    renderVocabularyFlashcards();
    renderLessonQuizProgressCard();

    if (lessonsFetchState === 'loading') {
        list.innerHTML = `
            <div class="lessons-shell p-8 text-center">
                <div class="inline-flex items-center gap-2 text-sky-600">
                    <span class="material-symbols-outlined animate-spin">progress_activity</span>
                    <span class="font-label text-xs font-bold uppercase tracking-[0.24em]">Fetching archive</span>
                </div>
            </div>
        `;
        return;
    }

    if (lessonsFetchState === 'error') {
        list.innerHTML = `
            <div class="rounded-3xl border border-red-200 bg-red-50/80 p-6 text-red-700">
                <p class="font-label text-xs font-bold uppercase tracking-[0.24em]">Archive Error</p>
                <p class="mt-2">${escapeHtml(lessonsErrorMessage || 'Unknown error')}</p>
            </div>
        `;
        return;
    }

    const filteredLessons = getFilteredLessons();
    const focusLabel = document.getElementById('vocabularyFocusLabel');
    if (!filteredLessons.some((lesson) => lesson.lessonKey === expandedLessonKey)) {
        expandedLessonKey = filteredLessons[0]?.lessonKey || null;
        expandedLessonKeywordKey = null;
        resetExpandedLessonKeywordPanels();
    }

    if (!filteredLessons.length) {
        if (focusLabel) focusLabel.textContent = 'No lessons match the current search or lesson filter.';
        syncLessonNavigation([]);
        list.innerHTML = `
            <div class="lessons-shell p-8 text-center">
                <p class="font-headline text-2xl text-slate-900">No lessons match this filter.</p>
                <p class="mt-2 text-slate-500">Try a broader keyword search to reopen more of the archive.</p>
            </div>
        `;
        return;
    }

    if (focusLabel) {
        focusLabel.textContent = selectedLessonPack === 'all'
            ? `${formatLessonCountLabel(filteredLessons.length, 'lesson')} visible in the browser.`
            : `Focused on ${filteredLessons[0]?.title || 'one lesson'} with keyword search still active.`;
    }

    list.innerHTML = filteredLessons.map((lesson) => {
        const isExpanded = lesson.lessonKey === expandedLessonKey;
        const keywords = lesson.keywords || [];
        const lessonIdx = lessonsData.findIndex((entry) => entry.lessonKey === lesson.lessonKey);
        const [c1, c2] = getLessonBadgeGradient(lesson.sourceIndex);
        const lessonMeta = [formatLessonStudentDisplayName(lesson.student), lesson.level || 'Level n/a'].filter(Boolean).join(' • ');
        const analysis = getAnalysisForLesson(lesson);
        const rawLessonStudentPath = window.location.pathname.split('/').filter(Boolean)[0] || '';
        const rawLessonPdfHref = lesson.pdfFile ? `/${rawLessonStudentPath}/pdfs/${encodeURIComponent(String(lesson.pdfFile))}` : '';
        return `
            <article class="lesson-card lesson-card-item rounded-[1.75rem] border ${isExpanded ? 'border-blue-200/80 bg-white/95' : 'border-slate-200/80 bg-white/[0.88]'} shadow-[0_2px_8px_rgba(0,0,0,0.05)]"
                style="animation-delay: ${lesson.sourceIndex * 55}ms"
                data-lesson-key="${escapeHtml(lesson.lessonKey)}"
                id="lesson-card-${escapeHtml(lesson.lessonKey)}">
                <div
                    class="lesson-row-header w-full px-4 py-4 text-left md:px-5 flex items-start justify-between gap-3"
                    data-lesson-toggle="${escapeHtml(lesson.lessonKey)}"
                    aria-expanded="${isExpanded ? 'true' : 'false'}"
                    role="button"
                    tabindex="0"
                >
                    <div class="min-w-0 flex-1">
                        <div class="flex flex-wrap items-center gap-2">
                            <span class="lesson-date-chip inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-[0.2em] text-white shrink-0" style="background: linear-gradient(135deg, ${c1}, ${c2})">${escapeHtml(formatLessonDate(lesson.date))}</span>
                            ${analysis?.cefrBand ? `<span class="score-pill ${String(analysis.cefrBand).toLowerCase()}">${escapeHtml(analysis.cefrBand)} ${Math.round(Number(analysis.overallScore || 0))}</span>` : ''}
                        </div>
                        <div class="mt-3 flex flex-col min-w-0 flex-1">
                            <h3 class="font-headline text-[1.35rem] leading-tight md:text-[1.75rem]">${escapeHtml(lesson.title || 'Untitled lesson')}</h3>
                            <p class="mt-2 font-mono text-[0.7rem] text-slate-500 truncate sm:text-xs">${escapeHtml(lessonMeta)}</p>
                        </div>
                    </div>
                    <div class="flex items-center gap-2 shrink-0 pt-1">
                        
                        <span class="lesson-keyword-count inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] font-label font-bold uppercase tracking-[0.18em] text-slate-600">${escapeHtml(formatLessonCountLabel(lesson.keyword_count || keywords.length || 0, 'keyword'))}</span>
                        <span class="vocab-chevron material-symbols-outlined text-slate-400 text-lg md:text-xl">expand_more</span>
                    </div>
                </div>
                <div class="lesson-details px-4 pb-4 md:px-5 md:pb-5" ${isExpanded ? '' : 'hidden'}>
                    <div class="mb-3 flex flex-nowrap items-center gap-2">
                            <button type="button" data-download-lesson-report="${escapeHtml(lesson.lessonKey)}" class="inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-1.5 font-label text-[10px] font-bold uppercase tracking-[0.14em] text-blue-700 transition hover:bg-blue-100" ${analysis ? '' : 'disabled aria-disabled="true"'}>
                                <span class="material-symbols-outlined text-[15px]">picture_as_pdf</span>
                                <span>Lesson Report</span>
                            </button>
                            ${lesson.conversation_notes ? `<button type="button" data-download-lesson-notes="${escapeHtml(lesson.lessonKey)}" class="inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 font-label text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-700 transition hover:bg-emerald-100"><span class="material-symbols-outlined text-[15px]">note_alt</span><span>Study Notes PDF</span></button>` : ''}
                            ${lesson.pdfFile ? `<a href="${escapeHtml(rawLessonPdfHref)}" target="_blank" rel="noopener noreferrer" class="inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl border border-purple-200 bg-purple-50 px-3 py-1.5 font-label text-[10px] font-bold uppercase tracking-[0.14em] text-purple-700 transition hover:bg-purple-100"><span class="material-symbols-outlined text-[15px]">description</span><span>Download Lesson Notes</span></a>` : ''}
                        </div>
                        <div class="lesson-keyword-list pt-1 space-y-4">
                        ${renderLessonAnalysisSummary(lesson)}
                        ${renderLessonKeywordToolbar(lesson)}
                        ${renderLessonKeywordRows(lesson, lessonIdx)}
                    </div>
                </div>
            </article>
        `;
    }).join('');

    syncLessonExpansion(false);
    syncLessonKeywordExpansion(false);
    syncLessonNavigation(filteredLessons);
    filteredLessons.forEach((lesson) => applyLessonTopicFilter(lesson.lessonKey, false));
    scheduleLessonWordPrecache();
    if (expandedLessonKey) preloadYouGlishForLesson(expandedLessonKey);
}

function updateActiveTabState(sectionId) {
    activeSectionId = sectionId || activeSectionId;
    document.querySelectorAll('[data-section-target]').forEach((button) => {
        button.classList.toggle('is-active', button.dataset.sectionTarget === activeSectionId);
    });
}

function initSectionTabs() {
    const sectionIds = ['page-dashboard', 'page-vocabulary', 'page-lessons', 'page-quiz'];
    updateActiveTabState(activeSectionId);
    const observer = new IntersectionObserver((entries) => {
        const visible = entries
            .filter((entry) => entry.isIntersecting)
            .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target?.id) {
            updateActiveTabState(visible.target.id);
        }
    }, { rootMargin: '-20% 0px -60% 0px', threshold: [0.2, 0.45, 0.7] });

    sectionIds.forEach((id) => {
        const node = document.getElementById(id);
        if (node) observer.observe(node);
    });
}

async function fetchLessonsData() {
    lessonsFetchState = 'loading';
    lessonsErrorMessage = '';
    renderLessonsDashboard();

    try {
        const response = await fetch('data/lessons.json');
        if (!response.ok) {
            throw new Error(`Lessons returned ${response.status}`);
        }

        const rawLessons = await response.json();
        lessonsData = (Array.isArray(rawLessons) ? rawLessons : []).map((lesson, index) => ({
            ...lesson,
            lessonKey: `${lesson.id || 'lesson'}-${index}`,
            keyword_count: lesson.keyword_count || (lesson.keywords || []).length || 0,
            searchText: buildLessonSearchText(lesson),
            sourceIndex: index
        })).sort((a, b) => {
            const dateDiff = getLessonSortTimestamp(b.date) - getLessonSortTimestamp(a.date);
            if (dateDiff !== 0) return dateDiff;
            return b.sourceIndex - a.sourceIndex;
        });

        lessonsFetchState = 'ready';
        renderLessonsDashboard();
        scheduleLessonWordPrecache();
    } catch (error) {
        console.error('Failed to fetch lessons:', error);
        lessonsFetchState = 'error';
        lessonsErrorMessage = error.message || 'Unable to load lessons.';
        renderLessonsDashboard();
    }
}

function showTtsLoading(message = 'Loading voice...') {
    const loadingEl = document.getElementById('tts-loading');
    if (!loadingEl) return;
    loadingEl.innerHTML = `
        <span class="material-symbols-outlined text-sm align-middle mr-1">autorenew</span>
        ${message}
    `;
    loadingEl.classList.remove('hidden');
}

function hideTtsLoading() {
    const loadingEl = document.getElementById('tts-loading');
    if (!loadingEl) return;
    loadingEl.classList.add('hidden');
    loadingEl.innerHTML = `
        <span class="material-symbols-outlined text-sm align-middle mr-1">autorenew</span>
        Loading voice...
    `;
}

function setTtsStatusBadge(isVisible, message = 'TTS unavailable') {
    const badge = document.getElementById('ttsStatusBadge');
    if (!badge) return;
    const label = badge.querySelector('span:last-child');
    if (label) label.textContent = message;
    badge.classList.toggle('hidden', !isVisible);
    badge.classList.toggle('inline-flex', isVisible);
}

function showTtsInlineToast(message) {
    const toast = document.getElementById('ttsInlineToast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.remove('hidden');
    clearTimeout(showTtsInlineToast.timeoutId);
    showTtsInlineToast.timeoutId = setTimeout(() => {
        toast.classList.add('hidden');
    }, 3500);
}
showTtsInlineToast.timeoutId = null;

function clearTtsErrorUI() {
    setTtsStatusBadge(false);
    const toast = document.getElementById('ttsInlineToast');
    if (toast) toast.classList.add('hidden');
    clearTimeout(showTtsInlineToast.timeoutId);
}

function getTtsCacheKey(text, voice, langCode) {
    return `${langCode}::${voice}::${String(text || '').trim().toLowerCase()}`;
}

function clearTtsAudioCache() {
    ttsPrecacheGeneration += 1;
    ttsPrecacheQueue.length = 0;
    for (const source of ttsAudioCache.values()) {
        try {
            URL.revokeObjectURL(source);
        } catch (error) {}
    }
    ttsAudioCache.clear();
    ttsPendingRequests.clear();
}

async function fetchTtsAudioSource(text, voice, langCode) {
    const key = getTtsCacheKey(text, voice, langCode);
    if (ttsAudioCache.has(key)) return ttsAudioCache.get(key);
    if (ttsPendingRequests.has(key)) return ttsPendingRequests.get(key);

    const generation = ttsPrecacheGeneration;
    const request = (async () => {
        const response = await fetch('https://tts.monexusmedia.uk/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text,
                voice,
                lang_code: langCode,
                speed: 1.0
            })
        });

        if (!response.ok) throw new Error('TTS failed');
        const blob = await response.blob();
        if (!blob.size) throw new Error('TTS returned empty audio');

        const objectUrl = URL.createObjectURL(blob);
        if (generation != ttsPrecacheGeneration) {
            URL.revokeObjectURL(objectUrl);
            throw new Error('TTS cache reset');
        }

        ttsAudioCache.set(key, objectUrl);
        return objectUrl;
    })().finally(() => {
        ttsPendingRequests.delete(key);
    });

    ttsPendingRequests.set(key, request);
    return request;
}

function enqueueTtsPrecache(text, voice, langCode, priority = 'normal') {
    if (!text || !navigator.onLine || !['a', 'b'].includes(langCode)) return;
    const key = getTtsCacheKey(text, voice, langCode);
    if (ttsAudioCache.has(key) || ttsPendingRequests.has(key) || ttsPrecacheQueue.some((item) => item.key === key)) return;

    const item = { key, text, voice, langCode, generation: ttsPrecacheGeneration };
    if (priority === 'high') {
        ttsPrecacheQueue.unshift(item);
    } else {
        ttsPrecacheQueue.push(item);
    }
    processTtsPrecacheQueue();
}

function processTtsPrecacheQueue() {
    while (ttsPrecacheActiveCount < 3 && ttsPrecacheQueue.length) {
        const next = ttsPrecacheQueue.shift();
        if (!next || next.generation != ttsPrecacheGeneration) continue;

        ttsPrecacheActiveCount += 1;
        fetchTtsAudioSource(next.text, next.voice, next.langCode)
            .catch(() => {})
            .finally(() => {
                ttsPrecacheActiveCount = Math.max(0, ttsPrecacheActiveCount - 1);
                window.setTimeout(processTtsPrecacheQueue, 100);
            });
    }
}

function getKeywordRefByKey(keywordKey) {
    for (let lessonIdx = 0; lessonIdx < lessonsData.length; lessonIdx += 1) {
        const lesson = lessonsData[lessonIdx];
        const keywordIdx = (lesson.keywords || []).findIndex((_, idx) => getLessonKeywordKey(lesson.lessonKey, idx) === keywordKey);
        if (keywordIdx >= 0) return { lessonIdx, keywordIdx, lesson, keyword: lesson.keywords[keywordIdx] };
    }
    return null;
}

function precacheLessonSentenceByKey(keywordKey) {
    const ref = getKeywordRefByKey(keywordKey);
    if (!ref?.keyword) return;
    const sentence = ref.keyword.example_en && ref.keyword.example_en.trim().length >= 20
        ? ref.keyword.example_en
        : (ref.keyword.definition_en || ref.keyword.definition_pl || '');
    if (!sentence) return;
    const { langCode, voice } = getVoiceRequestConfig();
    enqueueTtsPrecache(sentence, voice, langCode, 'high');
}

function scheduleLessonWordPrecache() {
    if (!navigator.onLine) return;
    const { langCode, voice } = getVoiceRequestConfig();
    if (!['a', 'b'].includes(langCode)) return;

    document.querySelectorAll('#lessonsList .lesson-keyword-entry:not(.is-filter-hidden)[data-lesson-keyword-key]').forEach((entry) => {
        const ref = getKeywordRefByKey(entry.dataset.lessonKeywordKey);
        if (ref?.keyword?.word) enqueueTtsPrecache(ref.keyword.word, voice, langCode, 'high');
    });

    lessonsData.forEach((lesson) => {
        (lesson.keywords || []).forEach((keyword) => {
            if (keyword?.word) enqueueTtsPrecache(keyword.word, voice, langCode, 'normal');
        });
    });
}

function canUseWebSpeechFallback(langCode) {
    return ['e', 'f', 'h', 'i', 'j', 'p', 'z'].includes(langCode);
}

function handleEnglishTtsFailure(error) {
    console.error('[TTS] English Kokoro request failed:', error);
    setTtsStatusBadge(true, 'TTS unavailable');
    showTtsInlineToast('Voice server busy, try again');
    stopPlayback();
}

function validateVoiceDropdown() {
    const configuredVoices = Object.values(KOKORO_VOICES).flat();
    const dropdownVoices = Array.from(document.querySelectorAll('#voiceDropdownList .voice-option')).map((button) => button.dataset.voice);
    const uniqueConfiguredVoices = new Set(configuredVoices);
    const uniqueDropdownVoices = new Set(dropdownVoices);
    const missingLabels = configuredVoices.filter((voice) => !VOICE_LABELS[voice]);
    const missingInDropdown = configuredVoices.filter((voice) => !uniqueDropdownVoices.has(voice));
    const extrasInDropdown = dropdownVoices.filter((voice) => !uniqueConfiguredVoices.has(voice));

    if (configuredVoices.length !== dropdownVoices.length || missingInDropdown.length || extrasInDropdown.length || missingLabels.length) {
        console.error('[VOICE DROPDOWN] Validation failed', {
            configuredCount: configuredVoices.length,
            dropdownCount: dropdownVoices.length,
            missingInDropdown,
            extrasInDropdown,
            missingLabels
        });
        return false;
    }

    return true;
}

function getVoiceRequestConfig() {
    const selectedLangCode = currentLangCode || 'b';
    const voices = KOKORO_VOICES[selectedLangCode] || [];

    if (!voices.includes(currentVoice)) {
        const langCode = findLangCodeForVoice(currentVoice);
        if (langCode) {
            currentLangCode = langCode;
        } else {
            currentVoice = voices[0] || currentVoice || 'bm_fable';
        }
    }

    return {
        langCode: currentLangCode,
        voice: currentVoice
    };
}

function findLangCodeForVoice(voiceName) {
    for (const [code, voices] of Object.entries(KOKORO_VOICES)) {
        if (voices && voices.includes(voiceName)) {
            return code;
        }
    }
    return null;
}

function updateVoiceSelectorUI() {
    const currentVoiceLabel = document.getElementById('currentVoiceLabel');
    if (currentVoiceLabel) {
        currentVoiceLabel.textContent = VOICE_LABELS[currentVoice] || currentVoice;
    }

    document.querySelectorAll('.voice-option').forEach((button) => {
        const isActive = button.dataset.voice === currentVoice;
        button.classList.toggle('bg-blue-50', isActive);
        button.classList.toggle('text-blue-700', isActive);
        button.classList.toggle('font-bold', isActive);
        button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
}

function buildVoiceDropdown() {
    ensureVoiceDropdownPortal();
    const container = document.getElementById('voiceDropdownList');
    if (!container) return;
    let html = '';
    for (const [code, voices] of Object.entries(KOKORO_VOICES)) {
        const langName = LANG_NAMES[code] || code.toUpperCase();
        html += `<div class="space-y-1"><p class="font-label text-[10px] font-bold uppercase tracking-widest text-slate-400 px-2">${langName}</p>`;
        const sorted = [...voices].sort((a, b) => {
            const af = a.charAt(1) === 'f' ? 0 : 1;
            const bf = b.charAt(1) === 'f' ? 0 : 1;
            return af - bf || a.localeCompare(b);
        });
        for (const voice of sorted) {
            const label = VOICE_LABELS[voice] || voice;
            const isActive = voice === currentVoice ? ' bg-blue-50 text-blue-700 font-bold' : '';
            html += `<button class="voice-option w-full text-left px-3 py-2 rounded-xl text-sm font-label text-slate-600 hover:bg-blue-50 hover:text-blue-700 transition-colors${isActive}" type="button" data-lang="${code}" data-voice="${voice}" data-label="${label}">${label}</button>`;
        }
        html += '</div>';
    }
    container.innerHTML = html;
    container.querySelectorAll('.voice-option').forEach((button) => {
        button.addEventListener('click', () => {
            currentVoice = button.dataset.voice;
            currentLangCode = button.dataset.lang;
            document.getElementById('currentVoiceLabel').textContent = button.dataset.label;
            clearTtsAudioCache();
            updateVoiceSelectorUI();
            closeVoiceDropdown();
            renderLessonsDashboard();
            scheduleLessonWordPrecache();
        });
    });
}

function ensureVoiceDropdownPortal() {
    let portal = document.getElementById('voiceDropdownPortal');
    if (portal) return portal;

    portal = document.createElement('div');
    portal.id = 'voiceDropdownPortal';
    portal.className = 'voice-picker-portal';
    portal.hidden = true;
    portal.innerHTML = `
        <div id="voiceDropdown" class="voice-picker-sheet">
            <div class="p-3 space-y-4 max-h-[60vh] sm:max-h-96 overflow-y-auto overscroll-contain" id="voiceDropdownList"></div>
        </div>
    `;
    portal.addEventListener('click', (event) => {
        if (event.target === portal) closeVoiceDropdown();
    });
    portal.querySelector('#voiceDropdown')?.addEventListener('click', (event) => {
        event.stopPropagation();
    });
    document.body.appendChild(portal);
    return portal;
}

function positionVoiceDropdownPortal() {
    const portal = ensureVoiceDropdownPortal();
    const voiceDropdown = document.getElementById('voiceDropdown');
    const voiceSelectorBtn = document.getElementById('voiceSelectorBtn');
    if (!portal || !voiceDropdown || !voiceSelectorBtn) return;

    if (window.innerWidth < 640) {
        portal.style.alignItems = 'flex-end';
        portal.style.justifyContent = 'stretch';
        portal.style.background = 'rgba(15,23,42,0.48)';
        voiceDropdown.style.position = '';
        voiceDropdown.style.top = '';
        voiceDropdown.style.left = '';
        voiceDropdown.style.right = '';
        voiceDropdown.style.width = '';
        return;
    }

    const rect = voiceSelectorBtn.getBoundingClientRect();
    const viewportPadding = 16;
    const preferredWidth = Math.min(288, window.innerWidth - (viewportPadding * 2));
    const left = Math.min(window.innerWidth - preferredWidth - viewportPadding, Math.max(viewportPadding, rect.right - preferredWidth));
    portal.style.alignItems = 'flex-start';
    portal.style.justifyContent = 'flex-start';
    portal.style.background = 'transparent';
    voiceDropdown.style.position = 'fixed';
    voiceDropdown.style.top = `${Math.min(window.innerHeight - 24, rect.bottom + 8)}px`;
    voiceDropdown.style.left = `${left}px`;
    voiceDropdown.style.right = 'auto';
    voiceDropdown.style.width = `${preferredWidth}px`;
}

function closeVoiceDropdown() {
    const portal = document.getElementById('voiceDropdownPortal');
    const voiceSelectorBtn = document.getElementById('voiceSelectorBtn');
    if (portal) portal.hidden = true;
    if (voiceSelectorBtn) voiceSelectorBtn.setAttribute('aria-expanded', 'false');
}

function toggleVoiceDropdown() {
    const portal = ensureVoiceDropdownPortal();
    const voiceSelectorBtn = document.getElementById('voiceSelectorBtn');
    if (!portal || !voiceSelectorBtn) return;
    buildVoiceDropdown();
    const isOpen = !portal.hidden;
    if (!isOpen) positionVoiceDropdownPortal();
    portal.hidden = isOpen;
    voiceSelectorBtn.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
}

function buildLyricsMarkup(words) {
    return `
        <div class="lyrics-track">
            ${words.map((word, idx) => `<span class="lyrics-word" data-word="${idx}">${escapeHtml(word)}</span>`).join('')}
        </div>
        <div class="lyrics-subtitle font-mono text-sm" data-lyrics-subtitle></div>
    `;
}

function centerLyricsWord(lyricsEl, activeWordEl) {
    const track = lyricsEl.querySelector('.lyrics-track');
    if (!track || !activeWordEl) return;
    const containerWidth = lyricsEl.clientWidth;
    const activeCenter = activeWordEl.offsetLeft + (activeWordEl.offsetWidth / 2);
    track.style.transform = `translateX(${(containerWidth / 2) - activeCenter}px)`;
}

function updateLyricsState(lyricsEl, wordElements, wordIndex, subtitleText) {
    if (!lyricsEl || !wordElements[wordIndex]) return;
    wordElements.forEach((el, i) => {
        el.classList.toggle('is-active', i === wordIndex);
        el.classList.toggle('is-near', Math.abs(i - wordIndex) === 1);
    });
    centerLyricsWord(lyricsEl, wordElements[wordIndex]);
    const subtitle = lyricsEl.querySelector('[data-lyrics-subtitle]');
    if (subtitle) subtitle.textContent = subtitleText || '';
}

async function speakLessonText(text, lessonIdx, keywordIdx, type) {
    const { lesson, keyword } = getLessonKeywordRef(lessonIdx, keywordIdx);
    if (!lesson || !keyword || !text) return;
    if (isPlaying) {
        stopPlayback();
        return;
    }
    isPlaying = true;

    clearTtsErrorUI();

    const { langCode, voice } = getVoiceRequestConfig();
    const lyricsEl = document.getElementById(`lyrics-lesson-${lessonIdx}-${keywordIdx}`);
    let wordElements = [];
    let words = [];
    const subtitleText = keyword.ipa || '';

    if (type === 'sentence' && lyricsEl) {
        words = text.split(/\s+/);
        lyricsEl.innerHTML = buildLyricsMarkup(words);
        lyricsEl.classList.remove('hidden');
        wordElements = lyricsEl.querySelectorAll('[data-word]');
        updateLyricsState(lyricsEl, wordElements, 0, subtitleText);
        refreshLessonDetailHeight(lesson.lessonKey);
    }

    const startLyricsSync = async () => {
        if (type !== 'sentence' || !wordElements.length || !currentAudio) return;
        const duration = await new Promise((resolve) => {
            if (Number.isFinite(currentAudio.duration) && currentAudio.duration > 0) {
                resolve(currentAudio.duration * 1000);
                return;
            }
            currentAudio.onloadedmetadata = () => resolve(currentAudio.duration * 1000);
        });
        const baseWordDuration = duration / words.length;
        const speedMultiplier = 0.65;
        const wordDuration = baseWordDuration * speedMultiplier;
        const startOffset = -baseWordDuration;
        let wordIndex = 0;

        const startDelay = Math.max(0, startOffset);
        setTimeout(() => {
            currentLyricsInterval = setInterval(() => {
                if (wordIndex < wordElements.length) {
                    updateLyricsState(lyricsEl, wordElements, wordIndex, subtitleText);
                    wordIndex++;
                } else {
                    clearInterval(currentLyricsInterval);
                    currentLyricsInterval = null;
                }
            }, wordDuration);
        }, startDelay);
    };

    const prepareAudioPlayback = async (audio) => {
        currentAudio = audio;
        currentAudio.onended = () => stopPlayback();
        currentAudio.onerror = (e) => {
            console.error('[TTS] Lesson audio error:', e);
            stopPlayback();
        };
        await startLyricsSync();
        await currentAudio.play();
        hideTtsLoading();
    };

    if (langCode === 'a' || langCode === 'b') {
        try {
            const cacheKey = getTtsCacheKey(text, voice, langCode);
            if (!ttsAudioCache.has(cacheKey)) {
                showTtsLoading('Loading voice...');
            }
            const audioSource = await fetchTtsAudioSource(text, voice, langCode);
            await prepareAudioPlayback(new Audio(audioSource));
            clearTtsErrorUI();
            return;
        } catch (error) {
            handleEnglishTtsFailure(error);
            return;
        }
    }

    if (canUseWebSpeechFallback(langCode) && 'speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(text);
        const webSpeechLangs = {
            'a': 'en-US',
            'b': 'en-GB',
            'e': 'es-ES',
            'f': 'fr-FR',
            'h': 'hi-IN',
            'i': 'it-IT',
            'j': 'ja-JP',
            'p': 'pt-BR',
            'z': 'zh-CN'
        };

        utterance.lang = webSpeechLangs[langCode] || 'en-GB';
        utterance.onend = () => stopPlayback();
        utterance.onerror = () => stopPlayback();
        hideTtsLoading();
        window.speechSynthesis.speak(utterance);
        return;
    }

    stopPlayback();
}

function playLessonWord(lessonIdx, keywordIdx) {
    const { keyword } = getLessonKeywordRef(lessonIdx, keywordIdx);
    if (!keyword?.word) return;
    speakLessonText(keyword.word, lessonIdx, keywordIdx, 'word');
}

function playLessonSentence(lessonIdx, keywordIdx) {
    const { keyword } = getLessonKeywordRef(lessonIdx, keywordIdx);
    if (!keyword) return;
    const sentence = keyword.example_en && keyword.example_en.trim().length >= 20
        ? keyword.example_en
        : (keyword.definition_en || keyword.definition_pl || '');
    if (!sentence) return;
    speakLessonText(sentence, lessonIdx, keywordIdx, 'sentence');
}

function stopPlayback() {
    if (currentAudio) {
        currentAudio.pause();
        currentAudio = null;
    }
    if (currentLyricsInterval) {
        clearInterval(currentLyricsInterval);
        currentLyricsInterval = null;
    }
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    isPlaying = false;
    hideTtsLoading();
    document.querySelectorAll('[data-word]').forEach((el) => {
        el.classList.remove('is-active', 'is-near');
    });
    document.querySelectorAll('[data-lyrics-subtitle]').forEach((el) => {
        el.textContent = '';
    });
}

function normalizeYouGlishKeyword(keyword) {
    return String(keyword || '').toLowerCase().replace(/_/g, ' ').trim();
}

function renderYouGlishLoadingState() {
    const container = document.getElementById('youglishPlayer');
    if (!container) return;
    container.innerHTML = `
        <div class="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
            <div class="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            <div class="space-y-2">
                <p class="font-body text-sm text-slate-300">Finding pronunciation context...</p>
                <div class="space-y-2">
                    <div class="h-2 w-40 rounded-full bg-white/10"></div>
                    <div class="h-2 w-28 rounded-full bg-white/10"></div>
                    <div class="h-2 w-32 rounded-full bg-white/10"></div>
                </div>
            </div>
        </div>
    `;
}

function renderYouGlishMessageState(icon, message, tone = 'text-slate-400') {
    const container = document.getElementById('youglishPlayer');
    if (!container) return;
    container.innerHTML = `
        <div class="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
            <span class="material-symbols-outlined text-5xl ${tone}">${icon}</span>
            <p class="font-body text-sm ${tone}">${escapeHtml(message)}</p>
            <button
                type="button"
                onclick="retryYouGlish()"
                class="inline-flex items-center gap-2 rounded-full border border-blue-300 bg-blue-50 px-4 py-2 font-label text-[11px] font-bold uppercase tracking-[0.2em] text-blue-700"
            >
                <span class="material-symbols-outlined text-sm">refresh</span>
                Retry
            </button>
        </div>
    `;
}

function renderYouGlishEmptyState() {
    renderYouGlishMessageState('videocam_off', 'No pronunciation context available for this word');
}

function renderYouGlishErrorState() {
    renderYouGlishMessageState('error', 'Unable to load pronunciation context right now', 'text-red-300');
}

function buildYouGlishVideoOccurrences(results) {
    const videoMap = new Map();
    for (const result of results) {
        if (!videoMap.has(result.videoId)) {
            videoMap.set(result.videoId, {
                videoId: result.videoId,
                title: '',
                channel: '',
                thumbnail: `https://img.youtube.com/vi/${result.videoId}/mqdefault.jpg`,
                occurrences: []
            });
        }
        const video = videoMap.get(result.videoId);
        video.occurrences.push({
            start: parseInt(result.start, 10) || 0,
            end: parseFloat(result.end) || ((parseInt(result.start, 10) || 0) + 3),
            duration: 10,
            text: result.display || ''
        });
    }
    return Array.from(videoMap.values());
}

async function fetchYouGlishPayload(keyword, options = {}) {
    const { forceRefresh = false } = options;
    const normalizedKeyword = normalizeYouGlishKeyword(keyword);
    if (!normalizedKeyword) return { keyword: normalizedKeyword, results: [], videoOccurrences: [] };

    if (!forceRefresh && youglishCache.has(normalizedKeyword)) {
        return youglishCache.get(normalizedKeyword);
    }
    if (!forceRefresh && youglishPendingRequests.has(normalizedKeyword)) {
        return youglishPendingRequests.get(normalizedKeyword);
    }

    const request = (async () => {
        const url = `/api/youglish/keyword?q=${encodeURIComponent(normalizedKeyword)}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`YouGlish returned ${response.status}`);
        const data = await response.json();
        const results = Array.isArray(data.results) ? data.results : [];
        const payload = {
            keyword: normalizedKeyword,
            results,
            videoOccurrences: buildYouGlishVideoOccurrences(results)
        };
        youglishCache.set(normalizedKeyword, payload);
        return payload;
    })().finally(() => {
        youglishPendingRequests.delete(normalizedKeyword);
    });

    youglishPendingRequests.set(normalizedKeyword, request);
    return request;
}

function preloadYouGlishForLesson(lessonKey) {
    const lesson = lessonsData.find((entry) => entry.lessonKey === lessonKey);
    if (!lesson?.keywords?.length) return;
    lesson.keywords.forEach((keyword) => {
        if (!keyword?.word) return;
        fetchYouGlishPayload(keyword.word).catch(() => {});
    });
}

async function openYouGlish(keyword) {
    const modal = document.getElementById('youglishModal');
    const container = document.getElementById('youglishPlayer');
    const keywordEl = document.getElementById('youglishKeyword');
    const counterEl = document.getElementById('videoCounter');

    if (!modal || !container) return;

    currentKeyword = keyword.toLowerCase().replace(/_/g, ' ');
    lastYouGlishKeyword = keyword;
    modal.classList.remove('hidden');

    if (keywordEl) keywordEl.textContent = `"${keyword}"`;
    if (counterEl) counterEl.textContent = 'Loading...';

    renderYouGlishLoadingState();

    try {
        const payload = await fetchYouGlishPayload(keyword);
        if (!payload.results.length) {
            renderYouGlishEmptyState();
            if (counterEl) counterEl.textContent = '0 examples';
            return;
        }
        videoOccurrences = payload.videoOccurrences.map((video) => ({
            ...video,
            occurrences: video.occurrences.map((occurrence) => ({ ...occurrence }))
        }));
        currentVideoIndex = 0;
        currentOccurrenceIndex = 0;

        const totalVideos = videoOccurrences.length;
        const totalOccurrences = videoOccurrences.reduce((sum, v) => sum + v.occurrences.length, 0);
        if (counterEl) counterEl.textContent = `${totalOccurrences} clips · ${totalVideos} videos`;

        renderThumbnails();
        playCurrentOccurrence();
    } catch (e) {
        console.error('[YouGlish] Fetch failed:', e);
        renderYouGlishErrorState();
    }
}

async function retryYouGlish() {
    if (!lastYouGlishKeyword) return;
    youglishCache.delete(normalizeYouGlishKeyword(lastYouGlishKeyword));
    await openYouGlish(lastYouGlishKeyword);
}

function playCurrentOccurrence() {
    const container = document.getElementById('youglishPlayer');
    const titleEl = document.getElementById('currentVideoTitle');
    const channelEl = document.getElementById('currentVideoChannel');
    const counterEl = document.getElementById('videoCounter');
    const subtitleEl = document.getElementById('subtitleText');
    const prevZone = document.getElementById('youglishPrevZone');
    const nextZone = document.getElementById('youglishNextZone');

    const video = videoOccurrences[currentVideoIndex];
    if (!video || !container) return;

    const occ = video.occurrences[currentOccurrenceIndex] || video.occurrences[0];

    if (titleEl) titleEl.textContent = video.title || occ.text || `Video ${currentVideoIndex + 1}`;
    if (channelEl) channelEl.textContent = video.channel || '';
    if (counterEl) counterEl.textContent = `${currentVideoIndex + 1} / ${videoOccurrences.length}`;

    const isAtStart = currentVideoIndex === 0 && currentOccurrenceIndex === 0;
    const isAtEnd = currentVideoIndex === videoOccurrences.length - 1 && currentOccurrenceIndex === video.occurrences.length - 1;
    if (prevZone) {
        prevZone.style.opacity = isAtStart ? '0.2' : '1';
        prevZone.style.pointerEvents = isAtStart ? 'none' : 'auto';
    }
    if (nextZone) {
        nextZone.style.opacity = isAtEnd ? '0.2' : '1';
        nextZone.style.pointerEvents = isAtEnd ? 'none' : 'auto';
    }

    if (subtitleEl) {
        if (occ.text && occ.text !== 'Loading transcript...') {
            const words = occ.text.split(/\s+/);
            const chunkSize = Math.max(2, Math.ceil(words.length / 6));
            const chunks = [];
            for (let i = 0; i < words.length; i += chunkSize) {
                chunks.push(words.slice(i, i + chunkSize).join(' '));
            }

            currentCaptionChunks = chunks;
            const occStart = parseFloat(occ.start) || 0;
            const occEnd = parseFloat(occ.end) || (occStart + 3);
            const keywordDuration = occEnd - occStart;
            currentCaptionStartTime = Math.max(0, occStart - 2);
            currentCaptionDuration = 2 + keywordDuration + 2;

            const keywordRegex = new RegExp(`(${currentKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
            subtitleEl.innerHTML = chunks.map((chunk) => {
                const highlighted = chunk.replace(keywordRegex, '<strong class="text-yellow-300">$1</strong>');
                return `<span class="caption-chunk">${highlighted} </span>`;
            }).join('');
        } else {
            subtitleEl.textContent = '';
            currentCaptionChunks = [];
        }
    }

    const startTime = Math.max(0, (occ.start || 0) - 2);
    const isMobile = /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;
    const playerId = 'ytPlayer_' + Date.now();
    container.innerHTML = `<div id="${playerId}" class="w-full h-full"></div>`;

    if (!window.YT || !window.YT.Player) {
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(tag);
        window.onYouTubeIframeAPIReady = () => {
            createYTPlayer(playerId, video.videoId, startTime, isMobile);
        };
    } else {
        createYTPlayer(playerId, video.videoId, startTime, isMobile);
    }
}

function createYTPlayer(targetId, videoId, startTime, isMobile) {
    if (captionSyncInterval) {
        clearInterval(captionSyncInterval);
        captionSyncInterval = null;
    }

    if (currentYTPlayer && currentYTPlayer.destroy) {
        try {
            currentYTPlayer.destroy();
        } catch (e) {}
    }
    const target = document.getElementById(targetId);
    if (!target) return;

    currentYTPlayer = new YT.Player(targetId, {
        videoId,
        playerVars: {
            start: Math.floor(startTime),
            autoplay: isMobile ? 0 : 1,
            rel: 0,
            modestbranding: 1,
            fs: 0,
            iv_load_policy: 3,
            controls: 1,
            disablekb: 1,
            playsinline: 1
        },
        events: {
            onReady: () => {
                if (!isMobile) startCaptionSync();
                fetchWhisperTimestamps(videoId, startTime);
            },
            onStateChange: (event) => {
                if (event.data === YT.PlayerState.PLAYING) {
                    startCaptionSync();
                } else if (event.data === YT.PlayerState.PAUSED || event.data === YT.PlayerState.ENDED) {
                    if (captionSyncInterval) {
                        clearInterval(captionSyncInterval);
                        captionSyncInterval = null;
                    }
                }
            }
        }
    });
}

function fetchWhisperTimestamps(videoId, startTime) {
    whisperWords = null;
    whisperFetched = false;

    fetch(`/beta/api/whisper/transcribe?v=${videoId}&keyword=${encodeURIComponent(currentKeyword || '')}&start=${startTime || ''}`)
        .then((r) => r.json())
        .then((data) => {
            if (data.keyword_found && data.words && data.words.length > 0) {
                whisperWords = data.words;
                whisperAbsoluteStart = data.absolute_start || 0;
                whisperFetched = true;
                renderWhisperCaption(data);
                currentCaptionStartTime = data.absolute_start || 0;
                currentCaptionDuration = data.words[data.words.length - 1].end;
            }
        })
        .catch((e) => console.log(`[Whisper] Fetch failed: ${e.message}`));
}

function renderWhisperCaption(data) {
    const subtitleEl = document.getElementById('subtitleText');
    if (!subtitleEl) return;

    subtitleEl.innerHTML = data.words.map((w) => {
        const cls = w.is_keyword ? 'caption-word caption-keyword' : 'caption-word';
        return `<span class="${cls}" data-start="${w.start}" data-end="${w.end}">${escapeHtml(w.word)} </span>`;
    }).join('');

    subtitleEl.querySelectorAll('.caption-keyword').forEach((el) => {
        el.style.color = '#fde047';
        el.style.fontWeight = '700';
    });
}

function startCaptionSync() {
    if (captionSyncInterval) clearInterval(captionSyncInterval);
    captionSyncInterval = setInterval(updateCaptionHighlight, 200);
}

function updateCaptionHighlight() {
    if (!currentYTPlayer || !currentYTPlayer.getCurrentTime) return;
    const currentTime = currentYTPlayer.getCurrentTime();

    if (whisperWords && whisperWords.length > 0) {
        const subtitleEl = document.getElementById('subtitleText');
        if (!subtitleEl) return;

        const wordSpans = subtitleEl.querySelectorAll('.caption-word');
        if (wordSpans.length === 0) return;

        wordSpans.forEach((span) => {
            const wordStart = parseFloat(span.dataset.start) + whisperAbsoluteStart + WHISPER_SYNC_OFFSET;
            const wordEnd = parseFloat(span.dataset.end) + whisperAbsoluteStart + WHISPER_SYNC_OFFSET;

            if (currentTime >= wordEnd) {
                span.style.opacity = '0.35';
                span.style.color = 'rgba(255,255,255,0.6)';
                span.style.background = 'transparent';
            } else if (currentTime >= wordStart) {
                span.style.opacity = '1';
                span.style.color = '#fff';
                span.style.background = 'rgba(59, 130, 246, 0.8)';
                span.style.borderRadius = '2px';
                span.style.padding = '0 2px';
            } else {
                span.style.opacity = '0.7';
                span.style.color = 'rgba(255,255,255,0.9)';
                span.style.background = 'transparent';
            }
        });
        return;
    }

    if (currentCaptionChunks.length === 0) return;
    const elapsed = currentTime - currentCaptionStartTime;
    const totalDuration = currentCaptionDuration;
    if (totalDuration <= 0) return;

    const progress = Math.max(0, Math.min(1, elapsed / totalDuration));
    const currentChunkIndex = Math.min(
        currentCaptionChunks.length - 1,
        Math.floor(progress * currentCaptionChunks.length)
    );

    const subtitleEl = document.getElementById('subtitleText');
    if (!subtitleEl) return;

    const spans = subtitleEl.querySelectorAll('.caption-chunk');
    spans.forEach((span, i) => {
        if (i < currentChunkIndex) {
            span.style.opacity = '0.4';
            span.style.color = 'rgba(255,255,255,0.7)';
            span.style.transition = 'opacity 0.4s, color 0.4s';
        } else if (i === currentChunkIndex) {
            span.style.opacity = '1';
            span.style.color = '#fff';
            span.style.background = 'rgba(59, 130, 246, 0.7)';
            span.style.borderRadius = '3px';
            span.style.padding = '1px 3px';
            span.style.transition = 'opacity 0.15s, color 0.15s, background 0.15s';
        } else {
            span.style.opacity = '0.65';
            span.style.color = 'rgba(255,255,255,0.9)';
            span.style.background = 'transparent';
            span.style.padding = '1px 3px';
            span.style.transition = 'opacity 0.15s, color 0.15s';
        }
    });
}

function renderThumbnails() {
    const container = document.getElementById('videoThumbnails');
    if (!container) return;

    container.innerHTML = videoOccurrences.slice(0, 20).map((v, i) => {
        const hasTranscript = v.occurrences[0]?.start > 0;
        return `
            <button
                onclick="selectYouGlishVideo(${i})"
                class="flex-shrink-0 w-20 h-12 rounded-lg overflow-hidden border-2 transition-all relative ${i === currentVideoIndex ? 'border-blue-500 ring-2 ring-blue-500/30' : 'border-slate-200 hover:border-slate-400'}"
            >
                <img src="${v.thumbnail}" alt="" class="w-full h-full object-cover">
                ${v.occurrences.length > 1 ? `<span class="absolute bottom-0 right-0 bg-blue-500 text-white text-[10px] px-1 rounded-tl font-bold">${v.occurrences.length}</span>` : ''}
                ${!hasTranscript ? `<span class="absolute top-0 right-0 bg-slate-500 text-white text-[8px] px-1 rounded-bl">?</span>` : ''}
            </button>
        `;
    }).join('');

    const activeBtn = container.children[currentVideoIndex];
    if (activeBtn) activeBtn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
}

function prevYouGlishVideo() {
    if (currentVideoIndex > 0) {
        currentVideoIndex--;
        currentOccurrenceIndex = 0;
    }
    renderThumbnails();
    playCurrentOccurrence();
}

function nextYouGlishVideo() {
    if (currentVideoIndex < videoOccurrences.length - 1) {
        currentVideoIndex++;
        currentOccurrenceIndex = 0;
    }
    renderThumbnails();
    playCurrentOccurrence();
}

function selectYouGlishVideo(index) {
    currentVideoIndex = index;
    currentOccurrenceIndex = 0;
    renderThumbnails();
    playCurrentOccurrence();
}

function toggleAutoplay() {
    const btn = document.getElementById('autoplayBtn');
    if (!btn) return;
    btn.classList.toggle('bg-blue-500');
    btn.classList.toggle('text-white');
    btn.classList.toggle('bg-blue-50');
    btn.classList.toggle('text-blue-600');
}

function closeYouGlish() {
    if (captionSyncInterval) {
        clearInterval(captionSyncInterval);
        captionSyncInterval = null;
    }
    currentCaptionChunks = [];
    whisperWords = null;
    whisperFetched = false;
    const modal = document.getElementById('youglishModal');
    const container = document.getElementById('youglishPlayer');
    if (currentYTPlayer && currentYTPlayer.destroy) {
        try {
            currentYTPlayer.destroy();
        } catch (e) {}
        currentYTPlayer = null;
    }
    if (modal) modal.classList.add('hidden');
    if (container) container.innerHTML = '';
    videoOccurrences = [];
}

document.addEventListener('DOMContentLoaded', () => {
    buildVoiceDropdown();
    validateVoiceDropdown();
    updateVoiceSelectorUI();
    fetchLessonsData();
    initSectionTabs();

    document.querySelectorAll('[data-section-target]').forEach((button) => {
        button.addEventListener('click', () => {
            const target = document.getElementById(button.dataset.sectionTarget);
            if (!target) return;
            updateActiveTabState(button.dataset.sectionTarget);
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    });

    const lessonJumpBtn = document.getElementById('lessonJumpBtn');
    const lessonJumpDropdown = document.getElementById('lessonJumpDropdown');
    if (lessonJumpBtn) {
        lessonJumpBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            toggleLessonJumpDropdown();
        });
    }

    document.addEventListener('click', (event) => {
        if (lessonJumpDropdown?.contains(event.target) || lessonJumpBtn?.contains(event.target)) return;
        closeLessonJumpDropdown();
    });

    const voiceSelector = document.getElementById('voiceSelector');
    const voiceSelectorBtn = document.getElementById('voiceSelectorBtn');
    if (voiceSelectorBtn) {
        voiceSelectorBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            toggleVoiceDropdown();
        });
    }

    document.addEventListener('click', (event) => {
        const voiceDropdownPortal = document.getElementById('voiceDropdownPortal');
        if (voiceSelector && !voiceSelector.contains(event.target) && !voiceDropdownPortal?.contains(event.target)) {
            closeVoiceDropdown();
        }
    });
    window.addEventListener('resize', () => {
        const voiceDropdownPortal = document.getElementById('voiceDropdownPortal');
        if (voiceDropdownPortal && !voiceDropdownPortal.hidden) positionVoiceDropdownPortal();
    });
    window.addEventListener('scroll', () => {
        const voiceDropdownPortal = document.getElementById('voiceDropdownPortal');
        if (voiceDropdownPortal && !voiceDropdownPortal.hidden) positionVoiceDropdownPortal();
    }, { passive: true });

    const lessonKeywordSearch = document.getElementById('lessonKeywordSearch');
    if (lessonKeywordSearch) {
        lessonKeywordSearch.addEventListener('input', (event) => {
            lessonKeywordSearchTerm = event.target.value || '';
            flashcardBrowsePage = 0;
            flashcardCurrentIndex = 0;
            flashcardDeckSignature = '';
            renderLessonsDashboard();
        });
    }

    const lessonPackFilter = document.getElementById('lessonPackFilter');
    if (lessonPackFilter) {
        lessonPackFilter.addEventListener('change', (event) => {
            selectedLessonPack = event.target.value || 'all';
            flashcardBrowsePage = 0;
            flashcardCurrentIndex = 0;
            flashcardDeckSignature = '';
            renderLessonsDashboard();
        });
    }

    document.getElementById('recentLessonToggle')?.addEventListener('click', () => {
        recentLessonExpanded = !recentLessonExpanded;
        if (!recentLessonExpanded) {
            recentLessonTopicSearchVisible = false;
            recentLessonTopicSearchTerm = '';
        }
        renderRecentLessonCard();
    });

    document.getElementById('recentLessonFullDetails')?.addEventListener('click', (event) => {
        const topicSearchToggle = event.target.closest('[data-recent-topic-search-toggle]');
        if (topicSearchToggle) {
            recentLessonTopicSearchVisible = !recentLessonTopicSearchVisible;
            if (!recentLessonTopicSearchVisible) recentLessonTopicSearchTerm = '';
            renderRecentLessonCard();
            return;
        }

        const topicSelect = event.target.closest('[data-recent-topic-select]');
        if (topicSelect) {
            recentLessonTopicSearchVisible = false;
            recentLessonTopicSearchTerm = '';
            applyFlashcardTopicFilter(topicSelect.dataset.recentTopicSelect || '');
            return;
        }

        const showFullDetails = event.target.closest('#recentLessonShowFullDetails');
        if (showFullDetails) {
            jumpToLessonSectionAndOpen(getMostRecentStudentLesson()?.lessonKey || '');
        }
    });

    document.getElementById('recentLessonFullDetails')?.addEventListener('input', (event) => {
        if (event.target.id !== 'recentLessonTopicSearchInput') return;
        recentLessonTopicSearchTerm = event.target.value || '';
        renderRecentLessonCard();
    });

    document.getElementById('dashboardLessonNavigator')?.addEventListener('click', (event) => {
        const moreButton = event.target.closest('#dashboardLessonNavigatorMore');
        if (moreButton) {
            dashboardLessonNavigatorExpanded = !dashboardLessonNavigatorExpanded;
            renderDashboardLessonNavigator();
            return;
        }
        const jump = event.target.closest('[data-dashboard-lesson-jump]');
        if (!jump) return;
        handleLessonJumpSelection(jump.dataset.dashboardLessonJump);
    });

    document.getElementById('dashboardLessonNavigator')?.addEventListener('input', (event) => {
        if (event.target.id !== 'lessonNavSearch' && event.target.id !== 'lessonNavSearch') return;
        lessonNavSearchTerm = event.target.value || '';
        dashboardLessonNavigatorExpanded = !!lessonNavSearchTerm.trim();
        renderDashboardLessonNavigator();
    });

    document.getElementById('lessonJumpList')?.addEventListener('click', (event) => {
        const jump = event.target.closest('[data-dashboard-lesson-jump]');
        if (!jump) return;
        handleLessonJumpSelection(jump.dataset.dashboardLessonJump);
    });

    document.getElementById('flashcardBrowseModeBtn')?.addEventListener('click', () => setFlashcardMode('browse'));
    document.getElementById('flashcardStudyModeBtn')?.addEventListener('click', () => setFlashcardMode('study'));
    document.getElementById('flashcardPrevBtn')?.addEventListener('click', () => stepFlashcard(-1));
    document.getElementById('flashcardNextBtn')?.addEventListener('click', () => stepFlashcard(1));
    document.getElementById('flashcardFlipButton')?.addEventListener('click', () => toggleFlashcardFlip());
    document.getElementById('flashcardBrowsePrevPage')?.addEventListener('click', () => {
        flashcardBrowseIndex = Math.max(0, flashcardBrowseIndex - 1);
        renderVocabularyFlashcards();
    });
    document.getElementById('flashcardBrowseNextPage')?.addEventListener('click', () => {
        flashcardBrowseIndex += 1;
        renderVocabularyFlashcards();
    });
    document.getElementById('flashcardBrowseList')?.addEventListener('click', (event) => {
        const play = event.target.closest('[data-flashcard-play-index]');
        if (play) {
            event.stopPropagation();
            const deck = getFlashcardDeck();
            const targetEntry = deck[Number(play.dataset.flashcardPlayIndex || 0)];
            if (!targetEntry?.keyword?.word) return;
            fetch('/api/conversa/tts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: targetEntry.keyword.word, voice: (typeof currentVoice === 'string' && currentVoice) ? currentVoice : 'af_nova' })
            }).then(r => r.json()).then(d => {
                if (d.audio) {
                    const a = new Audio('/api/conversa' + d.audio);
                    a.play().catch(() => {});
                }
            }).catch(() => {});
            return;
        }
        const jump = event.target.closest('[data-flashcard-jump-index]');
        if (!jump) return;
        setFlashcardIndex(Number(jump.dataset.flashcardJumpIndex || 0));
    });
    document.getElementById('flashcardBrowseGrid')?.addEventListener('click', (event) => {
        const jump = event.target.closest('[data-flashcard-jump-index]');
        if (!jump) return;
        setFlashcardIndex(Number(jump.dataset.flashcardJumpIndex || 0));
    });
    document.getElementById('flashcardBrowseViewSelect')?.addEventListener('change', (event) => {
        flashcardBrowseCompact = event.target.value !== 'grid';
        renderVocabularyFlashcards();
    });
    document.getElementById('flashcardTopicFilters')?.addEventListener('click', (event) => {
        const button = event.target.closest('[data-flashcard-topic]');
        if (!button) return;
        setFlashcardTopicFilter(button.dataset.flashcardTopic || '');
    });

    const lessonsList = document.getElementById('lessonsList');
    if (lessonsList) {
        lessonsList.addEventListener('click', (event) => {
            const downloadLessonButton = event.target.closest('[data-download-lesson-report]');
            if (downloadLessonButton) {
                event.preventDefault();
                event.stopPropagation();
                const lesson = lessonsData.find((entry) => entry.lessonKey === downloadLessonButton.dataset.downloadLessonReport);
                const analysis = lesson ? getAnalysisForLesson(lesson) : null;
                window.EMReportPdf?.generateLessonPDF(lesson, analysis);
                return;
            }
            const downloadNotesBtn = event.target.closest('[data-download-lesson-notes]');
            if (downloadNotesBtn) {
                event.preventDefault();
                event.stopPropagation();
                const lesson = lessonsData.find((entry) => entry.lessonKey === downloadNotesBtn.dataset.downloadLessonNotes);
                window.EMReportPdf?.generateLessonNotesPDF(lesson);
                return;
            }
            const topicBadge = event.target.closest('[data-lesson-topic-click]');
            if (topicBadge) {
                event.stopPropagation();
                setLessonTopicFilter(topicBadge.dataset.lessonTopicClick, topicBadge.dataset.topicValue || '');
                return;
            }
            const clearTopic = event.target.closest('[data-lesson-topic-clear]');
            if (clearTopic) {
                event.stopPropagation();
                setLessonTopicFilter(clearTopic.dataset.lessonTopicClear, '');
                return;
            }
            const collocationToggle = event.target.closest('[data-lesson-collocation-toggle]');
            if (collocationToggle) {
                event.stopPropagation();
                const keywordKey = collocationToggle.dataset.lessonCollocationToggle;
                expandedLessonCollocationKey = expandedLessonCollocationKey === keywordKey ? null : keywordKey;
                if (expandedLessonCollocationKey && expandedLessonKeywordKey !== keywordKey) {
                    expandedLessonKeywordKey = keywordKey;
                }
                syncLessonKeywordExpansion(true);
                return;
            }
            const synonymToggle = event.target.closest('[data-lesson-synonym-toggle]');
            if (synonymToggle) {
                event.stopPropagation();
                const keywordKey = synonymToggle.dataset.lessonSynonymToggle;
                expandedLessonSynonymKey = expandedLessonSynonymKey === keywordKey ? null : keywordKey;
                if (expandedLessonSynonymKey && expandedLessonKeywordKey !== keywordKey) {
                    expandedLessonKeywordKey = keywordKey;
                }
                syncLessonKeywordExpansion(true);
                return;
            }
            const learnerNotesToggle = event.target.closest('[data-lesson-learner-notes-toggle]');
            if (learnerNotesToggle) {
                event.stopPropagation();
                const keywordKey = learnerNotesToggle.dataset.lessonLearnerNotesToggle;
                expandedLessonLearnerNotesKey = expandedLessonLearnerNotesKey === keywordKey ? null : keywordKey;
                if (expandedLessonLearnerNotesKey && expandedLessonKeywordKey !== keywordKey) {
                    expandedLessonKeywordKey = keywordKey;
                }
                syncLessonKeywordExpansion(true);
                return;
            }
            const keywordToggle = event.target.closest('[data-lesson-keyword-toggle]');
            if (keywordToggle) {
                const keywordKey = keywordToggle.dataset.lessonKeywordToggle;
                if (expandedLessonKeywordKey === keywordKey) {
                    resetExpandedLessonKeywordPanels();
                } else {
                    resetExpandedLessonKeywordPanels();
                }
                expandedLessonKeywordKey = expandedLessonKeywordKey === keywordKey ? null : keywordKey;
                syncLessonKeywordExpansion(true);
                return;
            }
            const toggle = event.target.closest('[data-lesson-toggle]');
            if (!toggle) return;
            const lessonKey = toggle.dataset.lessonToggle;
            if (expandedLessonKey !== lessonKey) {
                expandedLessonKeywordKey = null;
                resetExpandedLessonKeywordPanels();
            }
            expandedLessonKey = expandedLessonKey === lessonKey ? null : lessonKey;
            if (!expandedLessonKey) {
                expandedLessonKeywordKey = null;
                resetExpandedLessonKeywordPanels();
            } else {
                preloadYouGlishForLesson(expandedLessonKey);
            }
            syncLessonExpansion(true);
            syncLessonKeywordExpansion(false);
        });

        lessonsList.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            const downloadLessonButton = event.target.closest('[data-download-lesson-report]');
            if (downloadLessonButton) {
                event.preventDefault();
                const lesson = lessonsData.find((entry) => entry.lessonKey === downloadLessonButton.dataset.downloadLessonReport);
                const analysis = lesson ? getAnalysisForLesson(lesson) : null;
                window.EMReportPdf?.generateLessonPDF(lesson, analysis);
                return;
            }
            const downloadNotesBtn2 = event.target.closest('[data-download-lesson-notes]');
            if (downloadNotesBtn2) {
                event.preventDefault();
                event.stopPropagation();
                const lesson = lessonsData.find((entry) => entry.lessonKey === downloadNotesBtn2.dataset.downloadLessonNotes);
                window.EMReportPdf?.generateLessonNotesPDF(lesson);
                return;
            }
            const keywordToggle = event.target.closest('[data-lesson-keyword-toggle]');
            if (keywordToggle) {
                event.preventDefault();
                const keywordKey = keywordToggle.dataset.lessonKeywordToggle;
                if (expandedLessonKeywordKey === keywordKey) {
                    resetExpandedLessonKeywordPanels();
                } else {
                    resetExpandedLessonKeywordPanels();
                }
                expandedLessonKeywordKey = expandedLessonKeywordKey === keywordKey ? null : keywordKey;
                syncLessonKeywordExpansion(true);
                return;
            }
            const toggle = event.target.closest('[data-lesson-toggle]');
            if (!toggle) return;
            event.preventDefault();
            const lessonKey = toggle.dataset.lessonToggle;
            if (expandedLessonKey !== lessonKey) {
                expandedLessonKeywordKey = null;
                resetExpandedLessonKeywordPanels();
            }
            expandedLessonKey = expandedLessonKey === lessonKey ? null : lessonKey;
            if (!expandedLessonKey) {
                expandedLessonKeywordKey = null;
                resetExpandedLessonKeywordPanels();
            } else {
                preloadYouGlishForLesson(expandedLessonKey);
            }
            syncLessonExpansion(true);
            syncLessonKeywordExpansion(false);
        });
    }

    document.getElementById('lessonNavSidebar')?.addEventListener('click', (event) => {
        const jump = event.target.closest('[data-lesson-nav-jump]');
        if (!jump) return;
        openLessonByKey(jump.dataset.lessonNavJump, { scroll: true });
    });

    document.getElementById('lessonMobileStrip')?.addEventListener('click', (event) => {
        const jump = event.target.closest('[data-lesson-nav-jump]');
        if (!jump) return;
        openLessonByKey(jump.dataset.lessonNavJump, { scroll: true });
    });

    document.getElementById('cumulativeAnalysisSection')?.addEventListener('click', (event) => {
        const button = event.target.closest('[data-download-progress-report]');
        if (!button) return;
        window.EMReportPdf?.generateProgressPDF(getAllAnalyses(), getLessonsForStudent(), {
            name: window.EMReportPdf?.getDisplayName?.(),
            level: window.EMReportPdf?.getStudentLevelLabel?.(getLessonsForStudent(), getAllAnalyses())
        });
    });

    document.getElementById('lessonsList')?.addEventListener('click', (event) => {
        const jump = event.target.closest('[data-jump-keyword]');
        if (!jump) return;
        const lessonCard = event.target.closest('[data-lesson-key]');
        const lesson = lessonsData.find((entry) => entry.lessonKey === lessonCard?.dataset.lessonKey);
        if (!lesson) return;
        jumpToKeywordInLesson(lesson.lessonKey, jump.dataset.jumpKeyword);
    });

    const modal = document.getElementById('youglishModal');
    if (modal) {
        modal.addEventListener('click', (event) => {
            if (event.target === modal) closeYouGlish();
        });
    }

    const prevZone = document.getElementById('youglishPrevZone');
    const nextZone = document.getElementById('youglishNextZone');
    if (prevZone) prevZone.addEventListener('click', () => prevYouGlishVideo());
    if (nextZone) nextZone.addEventListener('click', () => nextYouGlishVideo());

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            closeYouGlish();
            return;
        }
        const target = event.target;
        const isTypingField = target instanceof HTMLElement && (
            target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.tagName === 'SELECT' ||
            target.isContentEditable
        );
        if (isTypingField) return;

        if (event.key === 'ArrowLeft') {
            event.preventDefault();
            stepFlashcard(-1);
            return;
        }
        if (event.key === 'ArrowRight') {
            event.preventDefault();
            stepFlashcard(1);
            return;
        }
        if (event.key === ' ') {
            event.preventDefault();
            toggleFlashcardFlip();
        }
    });
});

/* Compact header on scroll */
(function(){
    var header = document.getElementById('appStickyHeader');
    if (!header) return;
    var ticking = false;
    function syncHeaderState() {
        var scrollY = window.pageYOffset || document.documentElement.scrollTop;
        header.classList.toggle('compact', scrollY > 72);
        ticking = false;
    }
    syncHeaderState();
    window.addEventListener('scroll', function(){
        if (ticking) return;
        ticking = true;
        window.requestAnimationFrame(syncHeaderState);
    }, { passive: true });
})();