(function () {
    'use strict';

    function createEmotionSystem(api) {
        const FA_REACTIONS = [
            { id: 'heart', icon: 'fa-solid fa-heart', label: 'Love', color: '#ff4d6d' },
            { id: 'haha', icon: 'fa-solid fa-face-laugh-squint', label: 'Haha', color: '#fbbf24' },
            { id: 'wow', icon: 'fa-solid fa-face-surprise', label: 'Wow', color: '#fb923c' },
            { id: 'sad', icon: 'fa-solid fa-face-sad-tear', label: 'Sad', color: '#60a5fa' },
            { id: 'fire', icon: 'fa-solid fa-fire', label: 'Fire', color: '#f97316' },
            { id: 'like', icon: 'fa-solid fa-thumbs-up', label: 'Like', color: 'var(--et-theme-color)' },
            { id: 'star', icon: 'fa-solid fa-star', label: 'Star', color: '#facc15' },
            { id: 'bolt', icon: 'fa-solid fa-bolt', label: 'Zap', color: '#a78bfa' },
        ];

        const PLUTCHIK_EMOTIONS = [
            { id: 'love', label: 'Love', icon: 'fa-solid fa-heart', color: '#fb7bb8', opposite: 'disgust', intensity: ['Fondness', 'Love', 'Adoration'] },
            { id: 'joy', label: 'Joy', icon: 'fa-solid fa-sun', color: '#facc15', opposite: 'sadness', intensity: ['Serenity', 'Joy', 'Ecstasy'] },
            { id: 'trust', label: 'Trust', icon: 'fa-solid fa-handshake', color: '#4ade80', opposite: 'disgust', intensity: ['Acceptance', 'Trust', 'Admiration'] },
            { id: 'fear', label: 'Fear', icon: 'fa-solid fa-ghost', color: '#a78bfa', opposite: 'anger', intensity: ['Apprehension', 'Fear', 'Terror'] },
            { id: 'surprise', label: 'Surprise', icon: 'fa-solid fa-bolt', color: '#38bdf8', opposite: 'anticipation', intensity: ['Distraction', 'Surprise', 'Amazement'] },
            { id: 'sadness', label: 'Sadness', icon: 'fa-solid fa-cloud-rain', color: '#60a5fa', opposite: 'joy', intensity: ['Pensiveness', 'Sadness', 'Grief'] },
            { id: 'disgust', label: 'Disgust', icon: 'fa-solid fa-face-grimace', color: '#a3e635', opposite: 'trust', intensity: ['Boredom', 'Disgust', 'Loathing'] },
            { id: 'anger', label: 'Anger', icon: 'fa-solid fa-fire-flame-curved', color: '#f87171', opposite: 'fear', intensity: ['Annoyance', 'Anger', 'Rage'] },
            { id: 'anticipation', label: 'Anticipation', icon: 'fa-solid fa-forward', color: '#fb923c', opposite: 'surprise', intensity: ['Interest', 'Anticipation', 'Vigilance'] },
        ];

        const REACTION_EMOTION_MAP = {
            heart: { love: +2.5, joy: +1.2, trust: +1.0, sadness: -0.8, disgust: -0.6 },
            haha: { joy: +2.1, surprise: +0.9, sadness: -1.0 },
            wow: { surprise: +2.0, anticipation: +1.0 },
            sad: { sadness: +2.1, joy: -1.1, trust: -0.7 },
            fire: { anticipation: +1.8, anger: +0.8, joy: +0.6 },
            like: { trust: +2.0, joy: +0.9, disgust: -0.8 },
            star: { love: +0.8, joy: +1.6, trust: +1.2, anticipation: +0.7 },
            bolt: { surprise: +1.9, anticipation: +1.2, fear: +0.5 },
        };

        // Baseline resting values — calibrated to a neutral "first meeting" level.
        // MBTI deltas and archetype biases are applied on top of these, so the
        // final anchor for a bubbly-ESFJ will be ~35-45 trust, not 73.
        // Trust/love/joy must be earned through conversation, not given for free.
        const EMOTION_BASELINE = Object.freeze({ love: 10, joy: 25, trust: 20, fear: 12, surprise: 15, sadness: 12, disgust: 8, anger: 8, anticipation: 25 });
        const MBTI_TRAIT_BASELINE_DELTA = Object.freeze({
            E: { joy: +8, trust: +5, anticipation: +6, sadness: -3, fear: -2, love: +4 },
            I: { joy: -4, trust: +2, anticipation: -3, sadness: +3, fear: +2, surprise: -1 },
            N: { anticipation: +6, surprise: +4, fear: +1, trust: -1 },
            S: { trust: +3, anticipation: -2, surprise: -2 },
            T: { trust: -2, disgust: +2, anger: +2, sadness: -1, love: -4 },
            F: { trust: +5, joy: +3, sadness: +2, anger: -1, disgust: -1, love: +8 },
            J: { anticipation: +2, trust: +2, surprise: -2 },
            P: { surprise: +4, anticipation: +2, trust: -1 }
        });
        const EMOTION_DECAY_PROFILE = Object.freeze({
            love: { lambda: 0.035, asymmetry: 0.9 },
            joy: { lambda: 0.095, asymmetry: 2.0 },
            trust: { lambda: 0.06, asymmetry: 1.4 },
            fear: { lambda: 0.14, asymmetry: 2.1 },
            surprise: { lambda: 0.08, asymmetry: 2.0 },
            sadness: { lambda: 0.043, asymmetry: 1.1 },
            disgust: { lambda: 0.08, asymmetry: 1.5 },
            anger: { lambda: 0.12, asymmetry: 2.0 },
            anticipation: { lambda: 0.07, asymmetry: 1.7 }
        });
        const EMOTION_PROGRESS_MINUTES = 30;
        const EMOTION_MESSAGE_INTERVAL_SECONDS = 15;
        const EMOTION_MESSAGES_TO_FULL = Math.max(1, Math.round((EMOTION_PROGRESS_MINUTES * 60) / EMOTION_MESSAGE_INTERVAL_SECONDS));
        const EMOTION_BASE_STEP = 100 / EMOTION_MESSAGES_TO_FULL;
        const EMOTION_REACTION_STEP = EMOTION_BASE_STEP * 1.2;

        // ── Keyword loading from emotions.json ──────────────────────────────────
        // Love's three sub-sections (affection, longing, lust) are flattened
        // into one deduplicated array. Falls back to a minimal inline set if
        // the JSON cannot be fetched (e.g. local file:// loading during dev).
        function loadEmotionKeywords() {
            const fallback = {
                love: ['love', 'adore', 'affection', 'longing', 'lust', 'desire', 'passion', 'tender', 'cherish', 'beloved'],
                joy: ['happy', 'joy', 'wonderful', 'amazing', 'excited', 'laugh', 'smile', 'celebrate'],
                trust: ['trust', 'honest', 'reliable', 'safe', 'secure', 'promise', 'loyal', 'support'],
                fear: ['scared', 'afraid', 'fear', 'terrified', 'panic', 'dread', 'anxious', 'horror'],
                surprise: ['wow', 'surprised', 'unexpected', 'shocking', 'unbelievable', 'omg'],
                sadness: ['sad', 'unhappy', 'cry', 'tears', 'lonely', 'hurt', 'grief', 'depressed'],
                disgust: ['disgusting', 'repulsive', 'revolting', 'hate', 'horrible', 'awful'],
                anger: ['angry', 'furious', 'rage', 'annoyed', 'frustrated', 'outraged'],
                anticipation: ['excited', 'looking forward', 'curious', 'eager', 'hope', 'anticipate'],
            };

            try {
                const url = `${api.baseUrl}/lib/emotions.json`;
                const xhr = new XMLHttpRequest();
                xhr.open('GET', url, false); // synchronous — same as loadEchoTextModule
                xhr.send();
                if (xhr.status < 200 || xhr.status >= 300) {
                    console.warn('[EchoText] emotions.json not found, using fallback keywords.');
                    return fallback;
                }
                const raw = JSON.parse(xhr.responseText);
                const result = {};
                for (const [emotionId, value] of Object.entries(raw)) {
                    if (Array.isArray(value)) {
                        // Standard emotion: flat array of keywords
                        result[emotionId] = value.map(k => k.toLowerCase());
                    } else if (typeof value === 'object' && value !== null) {
                        // Love (sub-sections): flatten affection + longing + lust
                        const combined = [];
                        for (const sub of Object.values(value)) {
                            if (Array.isArray(sub)) combined.push(...sub);
                        }
                        // Deduplicate while preserving order
                        result[emotionId] = [...new Set(combined.map(k => k.toLowerCase()))];
                    }
                }
                return result;
            } catch (e) {
                console.warn('[EchoText] Failed to load emotions.json:', e);
                return fallback;
            }
        }

        const TEXT_EMOTION_KEYWORDS = loadEmotionKeywords();


        function settings() { return api.getSettings(); }
        function createZeroImpactMap() { return Object.fromEntries(PLUTCHIK_EMOTIONS.map(e => [e.id, 0])); }
        function clampBaseline(v) { return Math.max(5, Math.min(95, v)); }
        function clampEmotion(v) { return Math.max(0, Math.min(100, v)); }

        function countKeywordHits(text, keywords) {
            let hits = 0;
            for (const kw of keywords) if (text.includes(kw)) hits++;
            return hits;
        }

        function inferMBTIFromCharacter(char) {
            const corpus = `${char?.description || ''} ${char?.personality || ''} ${char?.scenario || ''}`.toLowerCase();
            if (!corpus.trim()) return 'ISFP';

            const dimensions = {
                E: countKeywordHits(corpus, ['outgoing', 'social', 'talkative', 'energetic', 'charismatic', 'party', 'extrovert']),
                I: countKeywordHits(corpus, ['quiet', 'reserved', 'introvert', 'shy', 'private', 'withdrawn', 'loner']),
                N: countKeywordHits(corpus, ['imaginative', 'creative', 'visionary', 'intuitive', 'dreamer', 'abstract', 'symbolic']),
                S: countKeywordHits(corpus, ['practical', 'grounded', 'realistic', 'observant', 'detail', 'literal', 'sensory']),
                T: countKeywordHits(corpus, ['logical', 'rational', 'analytical', 'objective', 'strategic', 'calculating']),
                F: countKeywordHits(corpus, ['empathetic', 'emotional', 'compassionate', 'kind', 'warm', 'sensitive']),
                J: countKeywordHits(corpus, ['organized', 'structured', 'disciplined', 'decisive', 'planner', 'orderly']),
                P: countKeywordHits(corpus, ['spontaneous', 'adaptable', 'flexible', 'improvised', 'chaotic', 'free-spirited'])
            };

            const pick = (a, b, fallback) => (dimensions[a] === dimensions[b] ? fallback : (dimensions[a] > dimensions[b] ? a : b));
            return `${pick('I', 'E', 'I')}${pick('N', 'S', 'S')}${pick('T', 'F', 'F')}${pick('J', 'P', 'P')}`;
        }

        function applyMBTIBaselineDeltas(base, mbtiType) {
            if (!mbtiType) return base;
            for (const letter of mbtiType.split('')) {
                const deltas = MBTI_TRAIT_BASELINE_DELTA[letter];
                if (!deltas) continue;
                for (const [emotionId, delta] of Object.entries(deltas)) {
                    base[emotionId] = clampBaseline((base[emotionId] ?? EMOTION_BASELINE[emotionId]) + delta);
                }
            }
            return base;
        }

        function applyPersonaArchetypeBias(base, corpus) {
            const text = (corpus || '').toLowerCase();
            if (!text) return base;

            const hasGrumpy = /\b(grumpy|cynical|irritable|tsundere|snarky|bitter|jaded|mean)\b/.test(text);
            const hasBubbly = /\b(bubbly|cheerful|optimistic|playful|sunny|sweet|upbeat|enthusiastic)\b/.test(text);
            const hasAnxious = /\b(anxious|paranoid|timid|nervous|insecure|jittery)\b/.test(text);
            const hasMelancholic = /\b(melancholic|tragic|depressed|sorrowful|gloomy|heartbroken)\b/.test(text);
            const hasStoic = /\b(stoic|cold|detached|emotionless|composed|austere)\b/.test(text);
            const hasRomantic = /\b(romantic|loving|affectionate|devoted|passionate|tender|sentimental|lovestruck|lovesick)\b/.test(text);

            if (hasGrumpy) {
                base.anger = clampBaseline(base.anger + 16);
                base.joy = clampBaseline(base.joy - 12);
                base.trust = clampBaseline(base.trust - 8);
                base.disgust = clampBaseline(base.disgust + 6);
                base.love = clampBaseline(base.love - 10);
            }
            if (hasBubbly) {
                base.joy = clampBaseline(base.joy + 16);
                base.trust = clampBaseline(base.trust + 8);
                base.anticipation = clampBaseline(base.anticipation + 7);
                base.sadness = clampBaseline(base.sadness - 6);
                base.anger = clampBaseline(base.anger - 5);
                base.love = clampBaseline(base.love + 10);
            }
            if (hasAnxious) {
                base.fear = clampBaseline(base.fear + 14);
                base.trust = clampBaseline(base.trust - 7);
                base.surprise = clampBaseline(base.surprise + 5);
            }
            if (hasMelancholic) {
                base.sadness = clampBaseline(base.sadness + 16);
                base.joy = clampBaseline(base.joy - 10);
                base.anticipation = clampBaseline(base.anticipation - 6);
                base.love = clampBaseline(base.love + 6);  // melancholic characters often carry longing
            }
            if (hasStoic) {
                base.surprise = clampBaseline(base.surprise - 6);
                base.joy = clampBaseline(base.joy - 5);
                base.disgust = clampBaseline(base.disgust + 4);
                base.love = clampBaseline(base.love - 6);
            }
            if (hasRomantic) {
                base.love = clampBaseline(base.love + 20);
                base.trust = clampBaseline(base.trust + 5);
                base.joy = clampBaseline(base.joy + 5);
                base.disgust = clampBaseline(base.disgust - 5);
            }

            return base;
        }

        function buildPersonalityAnchorsForCharacter(char) {
            const mbtiType = inferMBTIFromCharacter(char);
            const corpus = `${char?.description || ''} ${char?.personality || ''} ${char?.scenario || ''}`;
            let anchors = { ...EMOTION_BASELINE };
            anchors = applyMBTIBaselineDeltas(anchors, mbtiType);
            anchors = applyPersonaArchetypeBias(anchors, corpus);
            for (const emotionId of Object.keys(EMOTION_BASELINE)) anchors[emotionId] = clampBaseline(anchors[emotionId]);
            return { mbtiType, anchors };
        }

        function buildAnchoredEmotionState() {
            const char = api.getCurrentCharacter();
            const { mbtiType, anchors } = buildPersonalityAnchorsForCharacter(char);
            return {
                joy: anchors.joy,
                trust: anchors.trust,
                fear: anchors.fear,
                surprise: anchors.surprise,
                sadness: anchors.sadness,
                disgust: anchors.disgust,
                anger: anchors.anger,
                anticipation: anchors.anticipation,
                personalityAnchor: { ...anchors },
                baselineAnchors: { ...anchors },
                affinityShift: Object.fromEntries(Object.keys(EMOTION_BASELINE).map(id => [id, 0])),
                mbtiType,
                lastUpdated: Date.now(),
                lastImpactSource: 'none',
                lastImpact: createZeroImpactMap()
            };
        }

        function getDefaultEmotionState() {
            return buildAnchoredEmotionState();
        }

        function getEmotionState() {
            const key = api.getCharacterKey();
            if (!key) return getDefaultEmotionState();
            const s = settings();
            if (!s.emotionState) s.emotionState = {};
            if (!s.emotionState[key]) s.emotionState[key] = buildAnchoredEmotionState();
            const state = s.emotionState[key];

            if (!state.personalityAnchor || typeof state.personalityAnchor !== 'object' || Array.isArray(state.personalityAnchor)) {
                const seeded = buildAnchoredEmotionState();
                state.personalityAnchor = { ...seeded.personalityAnchor };
                state.baselineAnchors = { ...seeded.baselineAnchors };
                state.affinityShift = { ...seeded.affinityShift };
                state.mbtiType = seeded.mbtiType;
            }
            if (!state.baselineAnchors || typeof state.baselineAnchors !== 'object' || Array.isArray(state.baselineAnchors)) {
                state.baselineAnchors = { ...state.personalityAnchor };
            }
            if (!state.affinityShift || typeof state.affinityShift !== 'object' || Array.isArray(state.affinityShift)) {
                state.affinityShift = Object.fromEntries(Object.keys(EMOTION_BASELINE).map(id => [id, 0]));
            }
            if (typeof state.mbtiType !== 'string') state.mbtiType = inferMBTIFromCharacter(api.getCurrentCharacter());

            for (const emotion of PLUTCHIK_EMOTIONS) {
                if (typeof state[emotion.id] !== 'number' || Number.isNaN(state[emotion.id])) state[emotion.id] = state.baselineAnchors[emotion.id] ?? EMOTION_BASELINE[emotion.id];
                if (typeof state.personalityAnchor[emotion.id] !== 'number' || Number.isNaN(state.personalityAnchor[emotion.id])) state.personalityAnchor[emotion.id] = EMOTION_BASELINE[emotion.id];
                if (typeof state.baselineAnchors[emotion.id] !== 'number' || Number.isNaN(state.baselineAnchors[emotion.id])) state.baselineAnchors[emotion.id] = state.personalityAnchor[emotion.id];
                if (typeof state.affinityShift[emotion.id] !== 'number' || Number.isNaN(state.affinityShift[emotion.id])) state.affinityShift[emotion.id] = Number((state.baselineAnchors[emotion.id] - state.personalityAnchor[emotion.id]).toFixed(2));
            }
            if (!state.lastImpact || typeof state.lastImpact !== 'object' || Array.isArray(state.lastImpact)) state.lastImpact = createZeroImpactMap();
            for (const emotion of PLUTCHIK_EMOTIONS) {
                if (typeof state.lastImpact[emotion.id] !== 'number' || Number.isNaN(state.lastImpact[emotion.id])) state.lastImpact[emotion.id] = 0;
            }
            if (typeof state.lastImpactSource !== 'string') state.lastImpactSource = 'none';
            if (typeof state.lastUpdated !== 'number' || Number.isNaN(state.lastUpdated)) state.lastUpdated = Date.now();
            return state;
        }

        function saveEmotionState(state) {
            const key = api.getCharacterKey();
            if (!key) return;
            const s = settings();
            if (!s.emotionState) s.emotionState = {};
            state.lastUpdated = Date.now();
            s.emotionState[key] = state;
            api.saveSettings();
        }

        function clearEmotionState() {
            const key = api.getCharacterKey();
            if (!key) return;
            const s = settings();
            if (!s.emotionState) s.emotionState = {};
            s.emotionState[key] = buildAnchoredEmotionState();
            api.saveSettings();
        }

        function applyEmotionDecay(state) {
            const now = Date.now();
            const elapsedMs = Math.max(0, now - (state.lastUpdated || now));
            const elapsedMinutes = elapsedMs / 60000;
            if (elapsedMinutes <= 0) return state;

            for (const id of Object.keys(EMOTION_BASELINE)) {
                const baseline = state.baselineAnchors?.[id] ?? EMOTION_BASELINE[id];
                const diff = baseline - state[id];
                const distanceNorm = Math.min(1, Math.abs(diff) / 100);
                const profile = EMOTION_DECAY_PROFILE[id] || { lambda: 0.08, asymmetry: 1.5 };
                const effectiveLambda = profile.lambda * (1 + profile.asymmetry * Math.pow(distanceNorm, 1.35));
                const decayFactor = 1 - Math.exp(-effectiveLambda * elapsedMinutes);
                state[id] = clampEmotion(state[id] + diff * decayFactor);
            }
            return state;
        }

        function updateAffinityShift(state, source) {
            if (source !== 'user_message' && source !== 'reaction') return state;
            const learningRate = source === 'reaction' ? 0.03 : 0.018;

            for (const id of Object.keys(EMOTION_BASELINE)) {
                const anchor = state.personalityAnchor?.[id] ?? EMOTION_BASELINE[id];
                const baseline = state.baselineAnchors?.[id] ?? anchor;
                const drift = state[id] - baseline;
                const shiftDelta = Math.max(-0.85, Math.min(0.85, drift * learningRate));

                const minBaseline = clampBaseline(anchor - 25);
                const maxBaseline = clampBaseline(anchor + 35);
                const updatedBaseline = Math.max(minBaseline, Math.min(maxBaseline, baseline + shiftDelta));

                state.baselineAnchors[id] = updatedBaseline;
                state.affinityShift[id] = Number((updatedBaseline - anchor).toFixed(2));
            }

            return state;
        }

        function getEmotionSensitivityMultiplier(emotionId) {
            const char = api.getCurrentCharacter();
            const history = api.getChatHistory().slice(-10);
            const corpus = [char?.personality, char?.description, char?.scenario, ...history.map(m => m.mes)]
                .filter(Boolean)
                .join(' ')
                .toLowerCase();

            if (!corpus) return 1;
            const keywords = TEXT_EMOTION_KEYWORDS[emotionId] || [];
            let hits = 0;
            for (const kw of keywords) if (corpus.includes(kw.toLowerCase())) hits++;
            return 1 + Math.min(1.5, hits * 0.12);
        }

        function getTextImpactMultiplier(text) {
            if (!text) return 1;
            const allCapsWords = (text.match(/\b[A-Z]{4,}\b/g) || []).length;
            const strongPunctuation = (text.match(/(!{2,}|\?{2,}|\?!|!\?)/g) || []).length;
            const intenseWords = (text.toLowerCase().match(/\b(always|never|absolutely|completely|totally|despise|adore|furious|terrified|heartbroken|ecstatic)\b/g) || []).length;
            const score = Math.min(1.75, (allCapsWords * 0.2) + (strongPunctuation * 0.18) + (intenseWords * 0.3));
            return 1 + score;
        }

        function buildEmotionImpact(beforeState, afterState) {
            const impact = {};
            for (const emotion of PLUTCHIK_EMOTIONS) impact[emotion.id] = Number((afterState[emotion.id] - beforeState[emotion.id]).toFixed(2));
            return impact;
        }

        function setLastImpact(state, beforeState, source) {
            state.lastImpact = buildEmotionImpact(beforeState, state);
            state.lastImpactSource = source;
        }

        function enforceOpposites(state) {
            const pairs = [['love', 'disgust'], ['joy', 'sadness'], ['trust', 'disgust'], ['fear', 'anger'], ['surprise', 'anticipation']];
            for (const [a, b] of pairs) {
                const total = (state[a] ?? 0) + (state[b] ?? 0);
                if (total > 80) {
                    const excess = total - 80;
                    if ((state[a] ?? 0) >= (state[b] ?? 0)) state[b] = clampEmotion((state[b] ?? 0) - excess * 0.5);
                    else state[a] = clampEmotion((state[a] ?? 0) - excess * 0.5);
                }
            }
            return state;
        }

        function analyzeTextEmotion(state, text, isUser) {
            if (!text) return state;
            const lower = text.toLowerCase();
            const WEIGHT = isUser ? 1 : 0.9;
            const impactMultiplier = getTextImpactMultiplier(text);

            for (const [emotionId, keywords] of Object.entries(TEXT_EMOTION_KEYWORDS)) {
                let hits = 0;
                let negHits = 0;
                for (const kw of keywords) {
                    if (!lower.includes(kw)) continue;
                    // Check for negation immediately before the keyword (within ~15 chars)
                    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const negPattern = new RegExp(`\\b(not|never|no|un|don't|cant|can't|won't|wont|isn't|isnt|wasn't|wasnt)\\b.{0,15}${escaped}`, 'i');
                    if (negPattern.test(lower)) negHits++;
                    else hits++;
                }
                const netHits = hits - negHits;
                if (netHits !== 0) {
                    const sensitivity = getEmotionSensitivityMultiplier(emotionId);
                    const baselineDelta = Math.min(6, Math.abs(netHits)) * EMOTION_BASE_STEP * 3.5;
                    const delta = baselineDelta * WEIGHT * sensitivity * impactMultiplier * Math.sign(netHits);
                    state[emotionId] = clampEmotion(state[emotionId] + delta);
                    const opp = PLUTCHIK_EMOTIONS.find(e => e.id === emotionId)?.opposite;
                    if (opp) state[opp] = clampEmotion(state[opp] - delta * 0.26);
                }
            }
            return state;
        }

        // Analyzes text and returns the raw emotion deltas WITHOUT applying them to the state.
        // Returns a map of { emotionId: deltaValue }
        function apiAnalyzeTextEmotionRaw(text, isUser) {
            if (!text || typeof text !== 'string') return null;
            
            const lower = text.toLowerCase();
            const WEIGHT = isUser ? 1 : 0.9;
            const impactMultiplier = getTextImpactMultiplier(text);
            const deltas = {};

            for (const [emotionId, keywords] of Object.entries(TEXT_EMOTION_KEYWORDS)) {
                let hits = 0;
                let negHits = 0;
                for (const kw of keywords) {
                    if (!lower.includes(kw)) continue;
                    // Check for negation immediately before the keyword (within ~15 chars)
                    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const negPattern = new RegExp(`\\b(not|never|no|un|don't|cant|can't|won't|wont|isn't|isnt|wasn't|wasnt)\\b.{0,15}${escaped}`, 'i');
                    if (negPattern.test(lower)) negHits++;
                    else hits++;
                }
                const netHits = hits - negHits;
                if (netHits !== 0) {
                    const sensitivity = getEmotionSensitivityMultiplier(emotionId);
                    const baselineDelta = Math.min(6, Math.abs(netHits)) * EMOTION_BASE_STEP * 3.5;
                    const delta = baselineDelta * WEIGHT * sensitivity * impactMultiplier * Math.sign(netHits);
                    
                    deltas[emotionId] = delta;
                    
                    const opp = PLUTCHIK_EMOTIONS.find(e => e.id === emotionId)?.opposite;
                    if (opp) {
                        deltas[opp] = (deltas[opp] || 0) - delta * 0.26;
                    }
                }
            }
            return Object.keys(deltas).length > 0 ? deltas : null;
        }

        // Programmatically apply a specific set of raw emotion deltas (e.g. from ST context)
        // Expected format: map of { emotionId: numericDelta }
        function applyEmotionDelta(deltasMap, source, reason) {
            if (settings().emotionSystemEnabled === false || !deltasMap) return;
            
            let state = getEmotionState();
            const before = { ...state };
            
            let modified = false;
            for (const [emotionId, delta] of Object.entries(deltasMap)) {
                if (typeof state[emotionId] === 'number') {
                    state[emotionId] = clampEmotion(state[emotionId] + delta);
                    modified = true;
                }
            }
            
            if (modified) {
                state = enforceOpposites(state);
                // We don't update affinity shift for external algorithmic bleeds to avoid feedback loops
                setLastImpact(state, before, source || 'external_event');
                saveEmotionState(state);
                updateEmotionIndicator();
                showEmotionDeltaBurst(state.lastImpact);
            }
        }

        function getImpactDisplay(delta) {
            if (delta > 0.05) return { className: 'et-emo-delta-up', icon: 'fa-arrow-right', label: `+${Math.abs(delta).toFixed(1)}` };
            if (delta < -0.05) return { className: 'et-emo-delta-down', icon: 'fa-arrow-left', label: `-${Math.abs(delta).toFixed(1)}` };
            return { className: 'et-emo-delta-neutral', icon: 'fa-minus', label: '0.0' };
        }

        function getDominantEmotion(state) {
            let best = null;
            let bestVal = -1;
            for (const e of PLUTCHIK_EMOTIONS) if (state[e.id] > bestVal) { bestVal = state[e.id]; best = e; }
            return best;
        }

        function getIntensityLabel(emotionDef, value) {
            if (value < 33) return emotionDef.intensity[0];
            if (value < 66) return emotionDef.intensity[1];
            return emotionDef.intensity[2];
        }

        // ── Behavioral translation helpers ───────────────────────────────────────

        // Maps an MBTI type string to a 1-2 sentence behavioral note the LLM can act on.
        function buildMBTITemperamentNote(mbti) {
            if (!mbti || mbti.length < 4) return '';
            const [ei, ns, tf, jp] = mbti.toUpperCase().split('');

            const energy   = ei === 'E'
                ? 'openly expressive and energised by engagement — tends toward visible, outward reactions'
                : 'more contained in expression — communicates through subtle cues and takes a beat before reacting';
            const perceive = ns === 'N'
                ? 'drawn to meaning and subtext rather than literal facts'
                : 'grounded and specific, prefers concrete sensory detail over abstraction';
            const decide   = tf === 'F'
                ? 'warmth-forward and emotionally intuitive — responds to feeling first, reads undercurrents naturally'
                : 'measured and precise — shows care through logic and helpfulness rather than emotional display';
            const structure = jp === 'J'
                ? 'purposeful and consistent in expression'
                : 'spontaneous and adaptive, shifts easily with the mood of the conversation';

            return `${energy}; ${perceive}; ${decide}; ${structure}.`;
        }

        // Translates the dominant emotion + active emotion list into specific, actionable tone guidance.
        function buildBehavioralGuidance(state, activeEmotions) {
            if (!activeEmotions.length) return 'Replies should feel neutral and measured.';

            const dominant = activeEmotions[0];
            const domVal   = state[dominant.id];

            // Three-tier guidance per emotion: low (<33), mid (33-66), high (>66)
            const GUIDANCE = {
                love: [
                    'Softly caring — affectionate in small, understated ways rather than overt declarations.',
                    'Openly affectionate. Warmth bleeds into phrasing naturally; small gestures of care feel instinctive.',
                    'Deeply devoted. Every reply carries a current of adoration — tender, attentive, easily moved.'
                ],
                joy: [
                    'Calm, easy contentment. Tone is unhurried and pleasant without being effusive.',
                    'Bright and upbeat — more expressive and enthusiastic than usual; smiling comes through in the words.',
                    'Overflowing. Happiness is hard to contain — effusive, exclamatory, rides every positive thread fully.'
                ],
                trust: [
                    'Politely open and at ease. Measured warmth — genuine but not gushing; comfortable without being animated.',
                    'Warm and reliable. Genuine engagement, more willing to share than usual, no guardedness.',
                    'Deep openness. Puts this person first, leans in emotionally, speaks with real candour and affection.'
                ],
                fear: [
                    'A mild undercurrent of apprehension — replies are a little more careful, slightly less forthcoming.',
                    'Noticeably unsettled. Hedging language, shorter replies, quicker to flinch from difficult topics.',
                    'Deeply frightened. Hard to stay focused — replies feel fragmented, over-cautious, searching for safety.'
                ],
                surprise: [
                    'Mildly caught off guard — a little more reactive than usual, noticing the unexpected.',
                    'Genuinely surprised. Energy spikes briefly; responses have a disrupted, heightened quality.',
                    'Stunned. Hard to find words — replies come out choppy, exclamatory, or trail off mid-thought.'
                ],
                sadness: [
                    'Quietly pensive. Replies carry a slightly softer, more reflective quality — not heavy, just thoughtful.',
                    'Visibly subdued. Less energy, shorter phrasing, a gentle melancholy colours word choices.',
                    'Heavy and grieving. Replies slow down, become more raw and unguarded; the weight is hard to mask.'
                ],
                disgust: [
                    'Mild distaste — replies are a little more clipped, slightly less generous in tone.',
                    'Clearly put off. Less warmth, more dry or pointed phrasing, reluctance to engage deeply.',
                    'Strong aversion — replies become terse, blunt, or openly critical.'
                ],
                anger: [
                    'Mildly irritated — a slight edge to replies, still controlled but less patient than usual.',
                    'Noticeably frustrated. Shorter, sharper phrasing; pushback comes more readily.',
                    'Openly angry. Replies have real heat — blunt, forceful, quick to escalate if pushed.'
                ],
                anticipation: [
                    'Quietly curious — slightly more engaged than baseline, watching for what comes next.',
                    'Eager and forward-leaning. Enthusiastic about where the conversation is going.',
                    'Intensely focused on what is being anticipated — every reply leans hard toward it, energised and locked in.'
                ]
            };

            const tier = domVal < 33 ? 0 : domVal < 66 ? 1 : 2;
            const mainText = GUIDANCE[dominant.id]?.[tier] ?? 'Replies should feel measured and natural.';

            // Secondary emotion modifier — only if the second emotion is within 25 pts of dominant
            // and meaningfully adds contrast or texture.
            let modifier = '';
            if (activeEmotions.length > 1) {
                const secondary = activeEmotions[1];
                const secVal = state[secondary.id];
                if (domVal - secVal < 25) {
                    const secTier = secVal < 33 ? 0 : secVal < 66 ? 1 : 2;
                    const SEC_PHRASE = {
                        joy:          ['with a hint of lightness underneath',        'with a warm thread of happiness running through', 'colored by real elation'],
                        trust:        ['with some underlying comfort',               'with genuine openness and warmth',                'with deep affection'],
                        love:         ['with quiet affection',                       'with real tenderness',                            'with adoration'],
                        sadness:      ['but with a wistful undertone',               'but shadowed by a quiet melancholy',              'carrying real grief beneath the surface'],
                        fear:         ['with a slight guardedness',                  'with an anxious undercurrent',                    'with real underlying fear'],
                        anticipation: ['with mild curiosity about what is next',     'and a forward-leaning eagerness',                 'and intense focus on what is coming'],
                        anger:        ['with a slight irritable edge',               'with some frustration showing through',           'with real anger underneath'],
                        surprise:     ['with mild alertness',                        'with genuine surprise',                           'with shock'],
                        disgust:      ['with mild distaste',                         'with clear reluctance',                           'with strong aversion'],
                    };
                    const phrase = SEC_PHRASE[secondary.id]?.[secTier];
                    if (phrase) modifier = ` — ${phrase}`;
                }
            }

            return `Tone: ${mainText}${modifier}`;
        }

        // ── Main context builder ────────────────────────────────────────────────

        function buildEmotionContext() {
            if (settings().emotionSystemEnabled === false) return '';
            const state = getEmotionState();
            const dominant = getDominantEmotion(state);
            if (!dominant) return '';

            const mbti = state.mbtiType || 'ISFP';

            // Include top emotions with a LOW threshold (12%) so the block is never empty.
            // Always show at least the dominant; show up to 4 total.
            const activeEmotions = PLUTCHIK_EMOTIONS
                .filter(e => state[e.id] >= 12)
                .sort((a, b) => state[b.id] - state[a.id])
                .slice(0, 4);

            // Ensure dominant is always in the list even if it somehow fell below threshold
            if (!activeEmotions.find(e => e.id === dominant.id)) activeEmotions.unshift(dominant);

            // Emotion state summary — "Label (intensity, value%)" per active emotion
            const stateSummary = activeEmotions
                .map(e => `${e.label} (${getIntensityLabel(e, state[e.id])}, ${Math.round(state[e.id])}%)`)
                .join(' · ');

            // Behavioral guidance derived from dominant + secondary
            const guidance = buildBehavioralGuidance(state, activeEmotions);

            // MBTI temperament note
            const temperamentNote = buildMBTITemperamentNote(mbti);

            // Affinity / bond note based on long-term baseline drift
            const trustDrift = (state.affinityShift && state.affinityShift.trust) || 0;
            const joyDrift   = (state.affinityShift && state.affinityShift.joy)   || 0;
            const affinityScore = trustDrift + joyDrift * 0.6;
            let bondNote = '';
            if (affinityScore >= 14) {
                bondNote = '\nBond: Deep trust has built up over time — forgiveness comes easily, warmth is natural, teasing and inside references feel safe.';
            } else if (affinityScore >= 7) {
                bondNote = '\nBond: A warm connection has formed — more open and relaxed with this person than with a stranger.';
            } else if (affinityScore <= -10) {
                bondNote = '\nBond: Repeated tension has worn down baseline trust — emotional spikes take longer to resolve; small frustrations carry extra weight.';
            } else if (affinityScore <= -5) {
                bondNote = '\nBond: Some underlying wariness — more guarded than usual.';
            }

            const emotionLines = [
                `Temperament (${mbti}): ${temperamentNote}`,
                `Feeling right now: ${stateSummary}.`,
                guidance,
                bondNote.trim() || null,
                'Express this through tone, phrasing, and energy — do not name or announce emotions directly unless asked.'
            ].filter(Boolean).join('\n');
            return `\n\n<emotional_state>\n${emotionLines}\n</emotional_state>`;
        }

        let _lastDominantId = null;

        function updateEmotionIndicator() {
            if (!api.isPanelOpen()) return;
            const state = getEmotionState();
            const dominant = getDominantEmotion(state);
            if (!dominant) return;

            // Track whether the dominant emotion changed since last update
            const dominantChanged = _lastDominantId !== null && dominant.id !== _lastDominantId;
            _lastDominantId = dominant.id;

            const indicator = jQuery('#et-emotion-indicator');
            if (indicator.length) {
                indicator.css('color', dominant.color);
                indicator.attr('title', `Feeling: ${dominant.label} (${Math.round(state[dominant.id])}%)`);
                const iconEl = indicator.find('i');
                if (iconEl.length) {
                    iconEl.removeAttr('class').addClass(dominant.icon);
                }
            }

            // Notify index.js to refresh the status row and optionally play the
            // dominant-change animation. Always fires so the chip text stays current.
            if (typeof api.onEmotionStateUpdated === 'function') {
                api.onEmotionStateUpdated({ dominant, dominantChanged });
            }
        }

        let _burstTimer = null;

        // Shows a brief floating chip strip below the panel header indicating which
        // emotions changed and in which direction. Tethered mode only.
        function showEmotionDeltaBurst(impactMap) {
            if (!api.isPanelOpen()) return;
            if (!api.isTetheredMode()) return;
            if (!impactMap || typeof impactMap !== 'object') return;
            if (settings().emotionSystemEnabled === false) return;

            // Pick top 3 emotions by absolute delta, filtering noise (threshold > 0.5)
            const entries = Object.entries(impactMap)
                .filter(([, d]) => Math.abs(d) > 0.5)
                .sort(([, a], [, b]) => Math.abs(b) - Math.abs(a))
                .slice(0, 3);

            if (!entries.length) return;

            // Clear any existing burst
            if (_burstTimer) { clearTimeout(_burstTimer); _burstTimer = null; }
            jQuery('#et-emo-burst').remove();

            const headerH = jQuery('#et-panel-drag-handle').outerHeight() || 70;

            const chipsHtml = entries.map(([id, delta], i) => {
                const def = PLUTCHIK_EMOTIONS.find(e => e.id === id);
                if (!def) return '';
                const isUp = delta > 0;
                const arrowClass = isUp ? 'et-emo-burst-up' : 'et-emo-burst-down';
                const arrowIcon = isUp ? 'fa-arrow-up' : 'fa-arrow-down';
                const sign = isUp ? '+' : '';
                return `<span class="et-emo-burst-chip" style="--burst-color:${def.color};animation-delay:${i * 60}ms" title="${def.label}: ${sign}${delta.toFixed(1)}"><i class="${def.icon}" style="color:${def.color}"></i><i class="fa-solid ${arrowIcon} et-emo-burst-arrow ${arrowClass}"></i></span>`;
            }).join('');

            jQuery('#et-panel').append(`<div id="et-emo-burst" class="et-emo-burst" style="top:${headerH + 6}px">${chipsHtml}</div>`);

            _burstTimer = setTimeout(() => {
                const el = jQuery('#et-emo-burst');
                if (el.length) {
                    el.addClass('et-emo-burst-hiding');
                    setTimeout(() => el.remove(), 480);
                }
                _burstTimer = null;
            }, 3200);
        }

        function buildEmotionPopupHtml() {
            const state = getEmotionState();
            const dominant = getDominantEmotion(state);

            const rows = PLUTCHIK_EMOTIONS.map(e => {
                const val = Math.round(state[e.id]);
                const label = getIntensityLabel(e, val);
                const pct = val;
                const isDominant = dominant && dominant.id === e.id;
                const impactRaw = Number(state.lastImpact?.[e.id] || 0);
                const impact = getImpactDisplay(impactRaw);
                return `
            <div class="et-emo-row${isDominant ? ' et-emo-dominant' : ''}">
                <div class="et-emo-icon" style="color:${e.color}">
                    <i class="${e.icon}"></i>
                </div>
                <div class="et-emo-info">
                    <div class="et-emo-header">
                        <span class="et-emo-label">${e.label}</span>
                        <span class="et-emo-intensity">${label}</span>
                        <span class="et-emo-delta ${impact.className}" title="Previous impact (${state.lastImpactSource || 'none'})">
                            <i class="fa-solid ${impact.icon}"></i>${impact.label}
                        </span>
                        <span class="et-emo-pct">${val}%</span>
                    </div>
                    <div class="et-emo-bar-track">
                        <div class="et-emo-bar-fill" style="width:${pct}%; background:${e.color};"></div>
                    </div>
                </div>
            </div>`;
            }).join('');

            const dominantLabel = dominant ? getIntensityLabel(dominant, state[dominant.id]) : 'Neutral';
            const dominantName = dominant ? dominant.label : 'Neutral';

            // Avoid duplicate words like "Love Love" - show icon + emotion name, with a compact intensity pill
            const dominantDisplay = dominant
                ? `<i class="${dominant.icon}" style="color:${dominant.color}"></i> <span>${dominantName}</span>`
                : '<span>Neutral</span>';

            return `
        <div id="et-emotion-popup" class="et-emotion-popup">
            <div class="et-emotion-popup-header">
                <i class="fa-solid fa-heart-pulse" style="color:var(--et-theme-color)"></i>
                <span>Emotional State</span>
                <button class="et-emotion-popup-close" id="et-emotion-popup-close"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <div class="et-emotion-popup-dominant">
                <div class="et-emo-dom-main">                  
                    <span class="et-emo-dom-value" style="color:${dominant ? dominant.color : 'var(--et-theme-color)'}">
                        ${dominantDisplay}
                    </span>
                </div>
                ${dominant ? `<span class="et-emo-dom-pill" style="--et-emo-pill-color:${dominant.color}">${dominantLabel} · ${Math.round(state[dominant.id])}%</span>` : ''}
            </div>
            <div class="et-emotion-popup-rows">${rows}</div>
        </div>`;
        }

        function toggleEmotionPopup(targetEl) {
            const existing = jQuery('#et-emotion-popup');
            if (existing.length) {
                existing.addClass('et-emotion-popup-closing');
                setTimeout(() => existing.remove(), 200);
                jQuery(document).off('click.et-emo-popup');
                return;
            }

            if (settings().emotionSystemEnabled === false) return;

            // Ensure the header emotion indicator is synced with current state before opening popup.
            updateEmotionIndicator();

            jQuery('#et-panel').append(buildEmotionPopupHtml());
            const popup = jQuery('#et-emotion-popup');

            const panelEl = document.getElementById('et-panel');
            if (panelEl) {
                const panelRect = panelEl.getBoundingClientRect();
                const popupHeight = popup.outerHeight() || 380;
                const popupWidth = popup.outerWidth() || 280;
                // Reserve space for panel header (~68px) and message input bar (~60px)
                const headerH = 68;
                const footerH = 60;
                const usableHeight = panelRect.height - headerH - footerH;
                const centeredTop = headerH + Math.round((usableHeight - popupHeight) / 2);
                const top = Math.max(headerH + 4, centeredTop);
                const left = Math.max(8, Math.round((panelRect.width - popupWidth) / 2));
                popup.css({ top: `${top}px`, left: `${left}px` });
            }

            requestAnimationFrame(() => popup.addClass('et-emotion-popup-open'));

            jQuery('#et-emotion-popup-close').on('click', (e) => {
                e.stopPropagation();
                popup.addClass('et-emotion-popup-closing');
                setTimeout(() => popup.remove(), 200);
                jQuery(document).off('click.et-emo-popup');
            });

            setTimeout(() => {
                jQuery(document).on('click.et-emo-popup', function (e) {
                    if (!jQuery(e.target).closest('#et-emotion-popup, #et-char-name').length) {
                        popup.addClass('et-emotion-popup-closing');
                        setTimeout(() => popup.remove(), 200);
                        jQuery(document).off('click.et-emo-popup');
                    }
                });
            }, 50);
        }

        function processMessageEmotion(text, isUser) {
            if (settings().emotionSystemEnabled === false) return;
            let state = getEmotionState();
            const before = { ...state };
            state = applyEmotionDecay(state);
            state = analyzeTextEmotion(state, text, isUser);
            state = enforceOpposites(state);
            const source = isUser ? 'user_message' : 'char_message';
            state = updateAffinityShift(state, source);
            setLastImpact(state, before, source);
            saveEmotionState(state);
            updateEmotionIndicator();
            showEmotionDeltaBurst(state.lastImpact);
        }

        function applyReactionToEmotions(reactionId, direction = 1) {
            if (settings().emotionSystemEnabled === false) return;
            const influences = REACTION_EMOTION_MAP[reactionId];
            if (!influences) return;

            let state = getEmotionState();
            const before = { ...state };
            for (const [emotionId, delta] of Object.entries(influences)) {
                state[emotionId] = clampEmotion(state[emotionId] + (delta * EMOTION_REACTION_STEP * direction));
            }
            state = enforceOpposites(state);
            state = updateAffinityShift(state, 'reaction');
            setLastImpact(state, before, 'reaction');
            saveEmotionState(state);
            updateEmotionIndicator();
            showEmotionDeltaBurst(state.lastImpact);
        }

        // ── Character emoji reaction selection ───────────────────────────────────
        // Determines which FA_REACTION emoji (if any) the character would authentically
        // use to react to the user's message, based on the emotional delta that message
        // caused. Works by "inverting" the REACTION_EMOTION_MAP: each reaction candidate
        // is scored against the current emotion deltas and the winner is returned.
        //
        // Returns: { reactionId, probability, magnitude } or null if no good fit.
        //
        // probability: 0–1 value for the caller to roll against (already personality-weighted)
        // magnitude:   raw emotional impact score (sum of abs deltas, useful for jitter tuning)
        function selectCharacterReaction(userMessageText) {
            if (settings().emotionSystemEnabled === false) return null;
            if (!userMessageText || typeof userMessageText !== 'string') return null;

            // ── 1. Compute emotion deltas the message would cause (dry run, no mutation) ──
            const rawDeltas = apiAnalyzeTextEmotionRaw(userMessageText, true);
            if (!rawDeltas) return null;

            // Magnitude = overall emotional impact of the message
            const magnitude = Object.values(rawDeltas).reduce((sum, v) => sum + Math.abs(v), 0);

            // Require a minimum emotional footprint — fully neutral messages don't get reactions.
            // Threshold of 2.0 filters out single-keyword "fine" / "ok" messages.
            if (magnitude < 2.0) return null;

            // ── 2. Score every reaction against the delta map ────────────────────────────
            // For each reaction, sum: delta[emotionId] * reactionInfluence[emotionId]
            // A high score means the reaction's dominant emotions match what was felt.
            let bestId = null;
            let bestScore = 0;

            for (const reaction of FA_REACTIONS) {
                const influences = REACTION_EMOTION_MAP[reaction.id];
                if (!influences) continue;
                let score = 0;
                for (const [emotionId, weight] of Object.entries(influences)) {
                    const delta = rawDeltas[emotionId] || 0;
                    score += delta * weight;
                }
                if (score > bestScore) {
                    bestScore = score;
                    bestId = reaction.id;
                }
            }

            // Minimum score threshold — ensures the winning reaction has meaningful alignment.
            // 0.8 maps to roughly one strong keyword hit (e.g. "love you" scoring heart ~2.1).
            if (bestScore < 0.8 || !bestId) return null;

            // ── 3. Compute personality-weighted probability ─────────────────────────────
            const state = getEmotionState();
            let probability = 0.28; // base: react to ~28% of eligible messages

            // High-impact messages get a bonus — character is more moved
            if (magnitude > 8) probability += 0.12;
            else if (magnitude > 4) probability += 0.06;

            // Strong positive score bonus — character clearly feels something
            if (bestScore > 4) probability += 0.08;

            // Warm personality: joy/love/anticipation dominant → more expressive
            const dominantWarm = (
                (state.joy  || 0) > 45 ||
                (state.love || 0) > 45 ||
                (state.anticipation || 0) > 50
            );
            if (dominantWarm) probability += 0.08;

            // Cool/withdrawn personality: T-type MBTI or stoic → less reactive
            const mbti = (state.mbtiType || '').toUpperCase();
            const isThinker = mbti.includes('T') && !mbti.includes('F');
            const isStoic   = (state.anger || 0) > 50 || (state.disgust || 0) > 45;
            if (isThinker) probability -= 0.07;
            if (isStoic)   probability -= 0.08;

            // Sadness-heavy state: character may react with sad but restraint overall
            if ((state.sadness || 0) > 55) probability -= 0.05;

            // Hard floor / ceiling
            probability = Math.min(0.65, Math.max(0.05, probability));

            return { reactionId: bestId, probability, magnitude };
        }

        function getEmotionReplyTimingModel() {
            const s = settings();
            const state = s.emotionSystemEnabled ? getEmotionState() : null;
            if (!state) return { deliveredDelayMs: 500, readDelayMs: 1200, ghostDelayMs: 0, typingLeadMs: 300, replyDelayMs: 600 };

            const anger = Number(state.anger || 0);
            const sadness = Number(state.sadness || 0);
            const fear = Number(state.fear || 0);
            const trust = Number(state.trust || 0);
            const joy = Number(state.joy || 0);
            const anticipation = Number(state.anticipation || 0);

            const warmFactor = (joy * 0.55 + trust * 0.45 + anticipation * 0.3) / 100;
            const coldFactor = (anger * 0.6 + sadness * 0.35 + fear * 0.25) / 100;
            const volatility = Math.max(0, coldFactor - warmFactor * 0.65);

            return {
                deliveredDelayMs: Math.round(250 + Math.random() * 900),
                readDelayMs: Math.round((700 + Math.random() * 1800) * (1 + volatility * 1.6)),
                ghostDelayMs: volatility > 0.42 ? Math.round((20000 + Math.random() * 70000) * Math.min(1.9, 1 + volatility)) : 0,
                typingLeadMs: Math.round(300 + Math.random() * 900),
                replyDelayMs: Math.round((300 + Math.random() * 2200) * Math.max(0.25, 1 + volatility * 1.8 - warmFactor * 0.95))
            };
        }

        return {
            FA_REACTIONS,
            getEmotionState,
            clearEmotionState,
            buildEmotionContext,
            processMessageEmotion,
            applyReactionToEmotions,
            selectCharacterReaction,
            updateEmotionIndicator,
            showEmotionDeltaBurst,
            toggleEmotionPopup,
            getEmotionReplyTimingModel,
            apiAnalyzeTextEmotionRaw,
            applyEmotionDelta
        };
    }

    window.EchoTextEmotionSystem = { createEmotionSystem };
})();
