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
            heart: { joy: +1.9, trust: +1.4, sadness: -0.9 },
            haha: { joy: +2.1, surprise: +0.9, sadness: -1.0 },
            wow: { surprise: +2.0, anticipation: +1.0 },
            sad: { sadness: +2.1, joy: -1.1, trust: -0.7 },
            fire: { anticipation: +1.8, anger: +0.8, joy: +0.6 },
            like: { trust: +2.0, joy: +0.9, disgust: -0.8 },
            star: { joy: +1.6, trust: +1.2, anticipation: +0.7 },
            bolt: { surprise: +1.9, anticipation: +1.2, fear: +0.5 },
        };

        const EMOTION_BASELINE = Object.freeze({ joy: 50, trust: 50, fear: 20, surprise: 20, sadness: 20, disgust: 15, anger: 15, anticipation: 40 });
        const MBTI_TRAIT_BASELINE_DELTA = Object.freeze({
            E: { joy: +8, trust: +5, anticipation: +6, sadness: -3, fear: -2 },
            I: { joy: -4, trust: +2, anticipation: -3, sadness: +3, fear: +2, surprise: -1 },
            N: { anticipation: +6, surprise: +4, fear: +1, trust: -1 },
            S: { trust: +3, anticipation: -2, surprise: -2 },
            T: { trust: -2, disgust: +2, anger: +2, sadness: -1 },
            F: { trust: +5, joy: +3, sadness: +2, anger: -1, disgust: -1 },
            J: { anticipation: +2, trust: +2, surprise: -2 },
            P: { surprise: +4, anticipation: +2, trust: -1 }
        });
        const EMOTION_DECAY_PROFILE = Object.freeze({
            joy: { lambda: 0.095, asymmetry: 2.0 },
            trust: { lambda: 0.06, asymmetry: 1.4 },
            fear: { lambda: 0.14, asymmetry: 2.1 },
            surprise: { lambda: 0.39, asymmetry: 3.2 },
            sadness: { lambda: 0.043, asymmetry: 1.1 },
            disgust: { lambda: 0.08, asymmetry: 1.5 },
            anger: { lambda: 0.20, asymmetry: 2.7 },
            anticipation: { lambda: 0.07, asymmetry: 1.7 }
        });
        const EMOTION_PROGRESS_MINUTES = 30;
        const EMOTION_MESSAGE_INTERVAL_SECONDS = 15;
        const EMOTION_MESSAGES_TO_FULL = Math.max(1, Math.round((EMOTION_PROGRESS_MINUTES * 60) / EMOTION_MESSAGE_INTERVAL_SECONDS));
        const EMOTION_BASE_STEP = 100 / EMOTION_MESSAGES_TO_FULL;
        const EMOTION_REACTION_STEP = EMOTION_BASE_STEP * 1.2;

        const TEXT_EMOTION_KEYWORDS = {
            joy: ['happy', 'happiness', 'joy', 'joyful', 'love', 'wonderful', 'amazing', 'great', 'fantastic', 'excited', 'laugh', 'smile', 'fun', 'delight', 'glad', 'pleased', 'cheerful', 'yay', 'haha', 'lol', 'awesome', 'perfect', 'beautiful', 'enjoy', 'celebrate'],
            trust: ['trust', 'believe', 'honest', 'reliable', 'safe', 'secure', 'confident', 'sure', 'certain', 'promise', 'loyal', 'faithful', 'depend', 'count on', 'together', 'support', 'help', 'care'],
            fear: ['scared', 'afraid', 'fear', 'terrified', 'nervous', 'anxious', 'worry', 'worried', 'dread', 'panic', 'horror', 'frightened', 'uneasy', 'apprehensive', 'danger', 'threat', 'unsafe'],
            surprise: ['wow', 'surprised', 'unexpected', 'shocking', 'unbelievable', 'amazing', 'sudden', 'whoa', 'omg', 'oh my', 'really', 'seriously', 'wait what', 'no way', 'incredible'],
            sadness: ['sad', 'unhappy', 'cry', 'crying', 'tears', 'miss', 'lonely', 'alone', 'hurt', 'pain', 'sorry', 'regret', 'lost', 'grief', 'heartbreak', 'depressed', 'down', 'upset', 'disappointed'],
            disgust: ['disgusting', 'gross', 'awful', 'terrible', 'horrible', 'hate', 'dislike', 'repulsive', 'nasty', 'yuck', 'ew', 'revolting', 'sick', 'wrong', 'bad', 'worst'],
            anger: ['angry', 'mad', 'furious', 'rage', 'hate', 'annoyed', 'frustrated', 'irritated', 'upset', 'outraged', 'livid', 'infuriated', 'pissed', 'fed up', 'enough'],
            anticipation: ['excited', 'looking forward', 'can\'t wait', 'soon', 'planning', 'hope', 'expect', 'wonder', 'curious', 'interested', 'eager', 'anticipate', 'ready', 'prepare'],
        };

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

            if (hasGrumpy) {
                base.anger = clampBaseline(base.anger + 16);
                base.joy = clampBaseline(base.joy - 12);
                base.trust = clampBaseline(base.trust - 8);
                base.disgust = clampBaseline(base.disgust + 6);
            }
            if (hasBubbly) {
                base.joy = clampBaseline(base.joy + 16);
                base.trust = clampBaseline(base.trust + 8);
                base.anticipation = clampBaseline(base.anticipation + 7);
                base.sadness = clampBaseline(base.sadness - 6);
                base.anger = clampBaseline(base.anger - 5);
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
            }
            if (hasStoic) {
                base.surprise = clampBaseline(base.surprise - 6);
                base.joy = clampBaseline(base.joy - 5);
                base.disgust = clampBaseline(base.disgust + 4);
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
            return 1 + Math.min(0.45, hits * 0.06);
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
            const pairs = [['joy', 'sadness'], ['trust', 'disgust'], ['fear', 'anger'], ['surprise', 'anticipation']];
            for (const [a, b] of pairs) {
                const total = state[a] + state[b];
                if (total > 120) {
                    const excess = total - 120;
                    if (state[a] >= state[b]) state[b] = clampEmotion(state[b] - excess * 0.5);
                    else state[a] = clampEmotion(state[a] - excess * 0.5);
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
                for (const kw of keywords) if (lower.includes(kw)) hits++;
                if (hits > 0) {
                    const sensitivity = getEmotionSensitivityMultiplier(emotionId);
                    const baselineDelta = Math.min(6, hits) * EMOTION_BASE_STEP * 0.9;
                    const delta = baselineDelta * WEIGHT * sensitivity * impactMultiplier;
                    state[emotionId] = clampEmotion(state[emotionId] + delta);
                    const opp = PLUTCHIK_EMOTIONS.find(e => e.id === emotionId)?.opposite;
                    if (opp) state[opp] = clampEmotion(state[opp] - delta * 0.26);
                }
            }
            return state;
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

        function buildEmotionContext() {
            if (settings().emotionSystemEnabled !== true) return '';
            const state = getEmotionState();
            const dominant = getDominantEmotion(state);
            if (!dominant) return '';

            const lines = PLUTCHIK_EMOTIONS
                .filter(e => state[e.id] >= 25)
                .sort((a, b) => state[b.id] - state[a.id])
                .slice(0, 4)
                .map(e => `${e.label}: ${getIntensityLabel(e, state[e.id])} (${Math.round(state[e.id])}%)`);

            const baselineLines = PLUTCHIK_EMOTIONS
                .filter(e => (state.baselineAnchors?.[e.id] ?? 0) >= 25)
                .sort((a, b) => (state.baselineAnchors?.[b.id] ?? 0) - (state.baselineAnchors?.[a.id] ?? 0))
                .slice(0, 3)
                .map(e => `${e.label} ${Math.round(state.baselineAnchors?.[e.id] ?? EMOTION_BASELINE[e.id])}%`);

            const dominantLabel = getIntensityLabel(dominant, state[dominant.id]);

            // Compute affinity bond level from trust+joy baseline drift
            const trustDrift = (state.affinityShift && state.affinityShift.trust) || 0;
            const joyDrift = (state.affinityShift && state.affinityShift.joy) || 0;
            const affinityScore = trustDrift + joyDrift * 0.6;
            let affinityLine = '';
            if (affinityScore >= 14) {
                affinityLine = '\nRelationship bond: Deep trust has developed. Anger and hurt resolve faster; warmth and forgiveness come naturally. Small teasing and inside references feel comfortable.';
            } else if (affinityScore >= 7) {
                affinityLine = '\nRelationship bond: A solid, warm connection has formed. You are more open and relaxed with this person than with a stranger.';
            } else if (affinityScore <= -10) {
                affinityLine = '\nRelationship bond: Repeated tension has eroded baseline trust. Emotional spikes take longer to resolve and small frustrations carry extra weight.';
            } else if (affinityScore <= -5) {
                affinityLine = '\nRelationship bond: There is some underlying wariness in this relationship. You are more guarded than usual.';
            }

            return `\n\nCURRENT EMOTIONAL STATE (Plutchik's Wheel):\nPersonality anchor profile: ${state.mbtiType || 'Unknown'}.\nYour dominant emotion right now is ${dominant.label} at the "${dominantLabel}" intensity level.\nActive emotions: ${lines.join(', ')}.\nEmotional resting baselines (entropy targets): ${baselineLines.join(', ')}.${affinityLine}\nLet this emotional state subtly but authentically color your responses — your word choice, tone, and energy should reflect how you're feeling. Do not explicitly state your emotions unless asked.`;
        }

        function updateEmotionIndicator() {
            if (!api.isPanelOpen()) return;
            const state = getEmotionState();
            const dominant = getDominantEmotion(state);
            if (!dominant) return;

            const indicator = jQuery('#et-emotion-indicator');
            if (!indicator.length) return;

            indicator.css('color', dominant.color);
            indicator.attr('title', `Feeling: ${getIntensityLabel(dominant, state[dominant.id])}`);
            indicator.find('i').attr('class', dominant.icon);
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

            return `
        <div id="et-emotion-popup" class="et-emotion-popup">
            <div class="et-emotion-popup-header">
                <i class="fa-solid fa-heart-pulse" style="color:var(--et-theme-color)"></i>
                <span>Emotional State</span>
                <button class="et-emotion-popup-close" id="et-emotion-popup-close"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <div class="et-emotion-popup-dominant">
                <span class="et-emo-dom-label">Feeling</span>
                <span class="et-emo-dom-value" style="color:${dominant ? dominant.color : 'var(--et-theme-color)'}">
                    ${dominant ? `<i class="${dominant.icon}"></i>` : ''} ${dominantLabel} ${dominantName}
                </span>
            </div>
            <div class="et-emotion-popup-rows">${rows}</div>
        </div>`;
        }

        function toggleEmotionPopup(targetEl) {
            const existing = jQuery('#et-emotion-popup');
            if (existing.length) {
                existing.addClass('et-emotion-popup-closing');
                setTimeout(() => existing.remove(), 200);
                return;
            }

            if (settings().emotionSystemEnabled !== true) return;
            jQuery('#et-panel').append(buildEmotionPopupHtml());
            const popup = jQuery('#et-emotion-popup');

            const nameEl = targetEl || document.getElementById('et-char-name');
            const panelEl = document.getElementById('et-panel');
            if (nameEl && panelEl) {
                const nameRect = nameEl.getBoundingClientRect();
                const panelRect = panelEl.getBoundingClientRect();

                // Calculate position to prevent overflow at the bottom
                const popupHeight = popup.outerHeight() || 350;
                const spaceBelow = panelRect.bottom - nameRect.bottom;
                const spaceAbove = nameRect.top - panelRect.top;

                let top;
                if (spaceBelow < popupHeight && spaceAbove > spaceBelow) {
                    // Open above the trigger element
                    top = nameRect.top - panelRect.top - popupHeight - 6;
                } else {
                    // Open below the trigger element
                    top = nameRect.bottom - panelRect.top + 6;
                }

                const left = nameRect.left - panelRect.left;
                popup.css({ top: `${top}px`, left: `${Math.max(8, left)}px` });
            }

            requestAnimationFrame(() => popup.addClass('et-emotion-popup-open'));
            jQuery('#et-emotion-popup-close').on('click', (e) => {
                e.stopPropagation();
                popup.addClass('et-emotion-popup-closing');
                setTimeout(() => popup.remove(), 200);
            });

            setTimeout(() => {
                jQuery(document).one('click.et-emo-popup', function (e) {
                    if (!jQuery(e.target).closest('#et-emotion-popup, #et-char-name').length) {
                        popup.addClass('et-emotion-popup-closing');
                        setTimeout(() => popup.remove(), 200);
                    }
                });
            }, 50);
        }

        function processMessageEmotion(text, isUser) {
            if (settings().emotionSystemEnabled !== true) return;
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
        }

        function applyReactionToEmotions(reactionId, direction = 1) {
            if (settings().emotionSystemEnabled !== true) return;
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
            updateEmotionIndicator,
            toggleEmotionPopup,
            getEmotionReplyTimingModel
        };
    }

    window.EchoTextEmotionSystem = { createEmotionSystem };
})();
