(function () {
    'use strict';

    /**
     * EchoText Memory System v3
     *
     * Tracks inside jokes, important people, hobbies, favorite things, shared
     * moments, and custom memories. Supports global and per-character storage
     * scopes. Memories are injected probabilistically into the system prompt so
     * characters can recall them naturally. Pinned memories are always injected.
     *
     * v3 changes: Removed broken emotion-spike-gated auto-extraction.
     * Added detectHighlightableText(text) — scans USER messages for memory-worthy
     * spans and returns candidates for the user to confirm via the highlight UI.
     *
     * Exposes: window.EchoTextMemorySystem.createMemorySystem(api)
     *          window.EchoTextMemorySystem.MEMORY_CATEGORIES
     */

    const MEMORY_CATEGORIES = {
        inside_joke:    { label: 'Inside Joke',       icon: 'fa-face-laugh-squint' },
        person:         { label: 'Important Person',  icon: 'fa-user-tag'          },
        hobby:          { label: 'Hobby / Interest',  icon: 'fa-gamepad'            },
        favorite_thing: { label: 'Favorite Thing',    icon: 'fa-star'               },
        shared_moment:  { label: 'Shared Moment',     icon: 'fa-heart'              },
        custom:         { label: 'Custom',             icon: 'fa-tag'                }
    };

    const MAX_MEMORIES_PER_SCOPE  = 50;
    const INJECTION_PROBABILITY   = 0.30;
    const MIN_TURNS_BEFORE_REUSE  = 6;
    const MAX_INJECTED_MEMORIES   = 3;
    const MAX_HIGHLIGHTS_PER_MSG  = 3;  // Max candidates returned per user message

    // ── Detection patterns ────────────────────────────────────────────────────

    const PERSON_PATTERNS = [
        // "my boyfriend Jake", "my boss Sarah" — named relationship + proper name
        /\b(?:my|our)\s+(?:friend|sister|brother|mom|dad|mother|father|boyfriend|girlfriend|husband|wife|partner|boss|coworker|colleague|roommate|ex)\s+([A-Z][a-z]+)/i,
        // Relationship in context without a proper name: "my sister just told me", "my boss is"
        /\bmy\s+(?:sister|brother|mom|dad|mother|father|boyfriend|girlfriend|husband|wife|partner|boss|coworker|colleague|roommate)\s+(?:just|is|was|has|told|texted|called|keeps|said|came|works|lives|knows|thinks|wants|needs|loves|hates)\b/i,
        // Named person acting on the user: "Jake told me", "Sam texted me"
        /\b([A-Z][a-z]{2,})\s+(?:told me|texted me|called me|said|asked me|messaged me)/,
        // Interacted with someone: "hung out with Alex", "visited Sarah"
        /\b(?:talked to|met with|hung out with|saw|visited|caught up with)\s+([A-Z][a-z]{2,})\b/i,
    ];

    const HOBBY_PATTERNS = [
        // "I love/enjoy/like doing X"
        /\bi\s+(?:love|enjoy|like|adore|can't stop)\s+([^.!?,\n]{5,40})/i,
        // "my hobby/passion is X"
        /\bmy\s+(?:hobby|passion|obsession|thing|favourite|favorite)\s+(?:is|was|has been)\s+([^.!?,\n]{5,50})/i,
        // "I play/watch/listen to X every day / most nights"
        /\bi\s+(?:play|watch|listen to|read|do|practice)\s+([^.!?,\n]{4,40})\s+(?:every|all the|most)/i,
        // "I've been [doing X] lately / recently / a lot / all the time / nonstop"
        /\bi'?ve been\s+[^.!?,\n]{3,50}\s+(?:lately|recently|a lot|so much|all the time|nonstop|constantly|every day|a ton)\b/i,
        // "I started [doing X] recently / last month / this year"
        /\bi\s+(?:just\s+)?started\s+[^.!?,\n]{4,50}\s+(?:recently|lately|last\s+\w+|this\s+\w+|again)\b/i,
        // "I spend a lot of my time on/doing X"
        /\bi\s+spend\s+(?:a lot of|most of my|all my|so much)\s+time\s+(?:on\s+|playing\s+|watching\s+|doing\s+)?[^.!?,\n]{5,50}/i,
        // "I'm really into X" / "I'm obsessed with X" / "I've been into X"
        /\bi'?(?:m|ve been)\s+(?:really\s+|so\s+|super\s+|totally\s+|kinda\s+)?(?:into|obsessed with|hooked on|addicted to)\s+[^.!?,\n]{4,50}/i,
    ];

    const FAVORITE_PATTERNS = [
        // "my favorite band is X" — explicit favorite declaration
        /\bmy\s+(?:favourite|favorite)\s+(?:song|band|album|show|movie|film|book|food|color|colour|drink|game|artist|podcast|series|restaurant|place|sport)\s+is\s+[^.!?,\n]{3,50}/i,
        // "I always/absolutely love/recommend X"
        /\bi\s+(?:always|absolutely)\s+(?:love|order|pick|choose|recommend)\s+[^.!?,\n]{4,50}/i,
        // "I hate X" / "can't stand X" / "despise X" — negative preferences are equally memorable
        /\bi\s+(?:hate|can't stand|cannot stand|despise|really dislike|don't like)\s+[^.!?,\n]{4,50}/i,
        // "not a fan of X" / "never really liked X"
        /\bi'?m\s+(?:not\s+a\s+fan\s+of|never\s+really\s+liked|not\s+really\s+into)\s+[^.!?,\n]{4,50}/i,
    ];

    const SHARED_MOMENT_PATTERNS = [
        /\b(?:remember when|that time (?:we|you|I)|I'll never forget when|I still think about|can't forget when)\s+([^.!?\n]{8,80})/i,
        /\b(?:the (?:last|first) time (?:we|you|I)|back when (?:we|you|I)|last time (?:we|I))\s+([^.!?\n]{8,80})/i,
        /\b(?:we (?:used to|always|would))\s+([^.!?\n]{8,80})/i
    ];

    // Life facts — biographical details worth remembering long-term
    const LIFE_FACT_PATTERNS = [
        // "I live in Seattle" / "I moved to London" / "I grew up in Texas"
        /\bi\s+(?:live in|moved to|grew up in|was born in|am based in)\s+[^.!?,\n]{3,50}/i,
        // "I'm from Japan"
        /\bi'?m\s+from\s+[^.!?,\n]{3,50}/i,
        // "I work at Google" / "I work for Apple"
        /\bi\s+work\s+(?:at|for)\s+[^.!?,\n]{3,50}/i,
        // "I work as a nurse"
        /\bi\s+work\s+as\s+(?:a\s+|an\s+)?[^.!?,\n]{4,50}/i,
        // "I'm a software developer" / "I'm an engineer" — requires a known profession keyword
        /\bi'?m\s+(?:a|an)\s+(?:[a-z]+\s+)?(?:developer|engineer|designer|teacher|nurse|doctor|therapist|chef|writer|artist|lawyer|accountant|manager|student|professor|musician|photographer|scientist|researcher|consultant|analyst|architect|paramedic|firefighter|attorney)[^.!?,\n]{0,30}/i,
        // "I'm studying psychology" / "I'm majoring in computer science"
        /\bi'?m\s+(?:studying|majoring in|minoring in)\s+[^.!?,\n]{4,50}/i,
        // "I have a dog" / "I have a daughter" / "I have two cats"
        /\bi\s+have\s+(?:a\s+|an\s+|two\s+|three\s+|\d+\s+)?(?:[a-z]+\s+)?(?:dog|cat|pet|fish|rabbit|hamster|bird|sister|brother|kid|son|daughter|child|baby|niece|nephew)[^.!?,\n]{0,30}/i,
        // "I'm 24 years old"
        /\bi'?m\s+\d{1,2}\s+(?:years?\s+old|yo)\b/i,
    ];

    // Recent events — timely personal developments worth noting
    const RECENT_EVENT_PATTERNS = [
        // "I just got a promotion" / "I just moved" / "I just graduated"
        /\bi\s+just\s+(?:got|started|finished|quit|left|moved|broke up|got into|landed|graduated|got offered|was promoted|got fired|got hired|bought|adopted|found out|realized)\s+[^.!?\n]{4,80}/i,
        // "I recently switched jobs" / "I recently decided to move"
        /\bi\s+recently\s+(?:got|started|finished|quit|left|moved|broke up|switched|decided|found out|realized|changed)\s+[^.!?\n]{4,80}/i,
        // "I'm going to Paris next week" / "I'm heading to a concert soon"
        /\bi'?m\s+(?:going to|heading to|traveling to|visiting|flying to|driving to)\s+[^.!?\n]{4,60}\s+(?:soon|next\s+\w+|this\s+\w+|tomorrow|tonight|in\s+a\s+(?:few\s+days?|week|month))\b/i,
        // "I got a new job" / "I got a new phone"
        /\bi\s+got\s+(?:a\s+|an\s+)?new\s+[^.!?,\n]{4,50}/i,
    ];

    function createMemorySystem(api) {
        function settings() { return api.getSettings(); }
        let _currentTurn = 0;

        function generateId() {
            return Date.now().toString(36) + Math.random().toString(36).substring(2, 7);
        }

        function getScope() {
            return settings().memoryScope || 'per-character';
        }

        function getCharKey() {
            return api.getCharacterKey ? api.getCharacterKey() : null;
        }

        function getActiveMemoryList() {
            const s = settings();
            if (getScope() === 'global') {
                if (!Array.isArray(s.globalMemories)) s.globalMemories = [];
                return s.globalMemories;
            }
            const charKey = getCharKey();
            if (!charKey) return [];
            if (!s.characterMemories || typeof s.characterMemories !== 'object') s.characterMemories = {};
            if (!Array.isArray(s.characterMemories[charKey])) s.characterMemories[charKey] = [];
            return s.characterMemories[charKey];
        }

        function getAllMemoriesForInjection() {
            const s = settings();
            const global = Array.isArray(s.globalMemories) ? s.globalMemories : [];
            if (getScope() === 'global') return global;
            const charKey = getCharKey();
            const perChar = charKey && s.characterMemories && Array.isArray(s.characterMemories[charKey])
                ? s.characterMemories[charKey] : [];
            return [...perChar, ...global];
        }

        function lcs(a, b) {
            let longest = 0;
            for (let i = 0; i < a.length; i++) {
                for (let j = 0; j < b.length; j++) {
                    let len = 0;
                    while (i + len < a.length && j + len < b.length && a[i + len] === b[j + len]) len++;
                    if (len > longest) longest = len;
                }
            }
            return longest;
        }

        function isDuplicate(list, content) {
            const c = content.toLowerCase().substring(0, 80);
            return list.some(m => {
                const existing = (m.content || '').toLowerCase().substring(0, 80);
                if (!existing) return false;
                return lcs(c, existing) / Math.max(c.length, existing.length) > 0.55;
            });
        }

        // ── CRUD ──────────────────────────────────────────────────────────────

        function addMemory({ category, label, content, pinned, scope: explicitScope } = {}) {
            const s = settings();
            category = category || 'custom';
            const effectiveScope = explicitScope || getScope();
            const memory = {
                id:            generateId(),
                category,
                label:         (label || '').trim() || (MEMORY_CATEGORIES[category] ? MEMORY_CATEGORIES[category].label : 'Memory'),
                content:       (content || '').trim(),
                createdAt:     Date.now(),
                lastUsedTurn:  -999,
                usageCount:    0,
                pinned:        !!pinned,
                autoExtracted: false
            };

            if (effectiveScope === 'global') {
                if (!Array.isArray(s.globalMemories)) s.globalMemories = [];
                s.globalMemories.unshift(memory);
                if (s.globalMemories.length > MAX_MEMORIES_PER_SCOPE) s.globalMemories.splice(MAX_MEMORIES_PER_SCOPE);
            } else {
                const charKey = getCharKey();
                if (!charKey) return null;
                if (!s.characterMemories) s.characterMemories = {};
                if (!Array.isArray(s.characterMemories[charKey])) s.characterMemories[charKey] = [];
                s.characterMemories[charKey].unshift(memory);
                if (s.characterMemories[charKey].length > MAX_MEMORIES_PER_SCOPE) s.characterMemories[charKey].splice(MAX_MEMORIES_PER_SCOPE);
            }
            api.saveSettings();
            return memory;
        }

        function editMemory(id, updates) {
            const s = settings();
            let found = false;
            const applyTo = (list) => {
                if (!Array.isArray(list)) return false;
                const idx = list.findIndex(m => m.id === id);
                if (idx === -1) return false;
                for (const key of ['label', 'content', 'category', 'pinned']) {
                    if (Object.hasOwn(updates, key)) list[idx][key] = updates[key];
                }
                return true;
            };
            if (applyTo(s.globalMemories)) {
                found = true;
            } else if (s.characterMemories) {
                for (const key of Object.keys(s.characterMemories)) {
                    if (applyTo(s.characterMemories[key])) { found = true; break; }
                }
            }
            if (found) api.saveSettings();
            return found;
        }

        function deleteMemory(id) {
            const s = settings();
            let found = false;
            const removeFrom = (list) => {
                if (!Array.isArray(list)) return false;
                const idx = list.findIndex(m => m.id === id);
                if (idx !== -1) { list.splice(idx, 1); return true; }
                return false;
            };
            if (removeFrom(s.globalMemories)) {
                found = true;
            } else if (s.characterMemories) {
                for (const key of Object.keys(s.characterMemories)) {
                    if (removeFrom(s.characterMemories[key])) { found = true; break; }
                }
            }
            if (found) api.saveSettings();
            return found;
        }

        function clearMemoriesForScope(charKey) {
            const s = settings();
            if (getScope() === 'global') {
                s.globalMemories = [];
            } else {
                const key = charKey || getCharKey();
                if (key && s.characterMemories) delete s.characterMemories[key];
            }
            api.saveSettings();
        }

        function getMemories() {
            return getActiveMemoryList();
        }

        // ── HIGHLIGHT DETECTION ───────────────────────────────────────────────

        /**
         * Scan a user message for memory-worthy text spans.
         * Returns up to MAX_HIGHLIGHTS_PER_MSG candidates:
         *   [{ text, category, label }, ...]
         *
         * Each candidate is the full regex match string (what appears highlighted
         * in the bubble). Already-saved memories are filtered out so the same
         * content is never re-highlighted once saved.
         *
         * @param {string} text - raw user message text
         * @returns {Array<{text: string, category: string, label: string}>}
         */
        function detectHighlightableText(text) {
            if (!text || text.length < 8) return [];

            const existing = getActiveMemoryList();
            const candidates = [];
            const seenTexts = new Set(); // de-duplicate within the same message

            function tryPatterns(patterns, category, label) {
                if (candidates.length >= MAX_HIGHLIGHTS_PER_MSG) return;
                for (const p of patterns) {
                    if (candidates.length >= MAX_HIGHLIGHTS_PER_MSG) break;
                    const m = text.match(p);
                    if (m && m[0]) {
                        const matchText = m[0].trim().substring(0, 120);
                        if (matchText.length < 8) continue;
                        if (seenTexts.has(matchText)) continue;
                        if (isDuplicate(existing, matchText)) continue;
                        seenTexts.add(matchText);
                        candidates.push({ text: matchText, category, label });
                        break; // one per pattern-set to avoid flooding
                    }
                }
            }

            tryPatterns(LIFE_FACT_PATTERNS,      'custom',         'Life Fact');
            tryPatterns(FAVORITE_PATTERNS,       'favorite_thing', 'Favorite Thing');
            tryPatterns(HOBBY_PATTERNS,           'hobby',          'Hobby / Interest');
            tryPatterns(PERSON_PATTERNS,          'person',         'Important Person');
            tryPatterns(RECENT_EVENT_PATTERNS,    'shared_moment',  'Recent Event');
            tryPatterns(SHARED_MOMENT_PATTERNS,   'shared_moment',  'Shared Moment');

            return candidates;
        }

        // ── INJECTION ─────────────────────────────────────────────────────────

        function incrementTurn() { _currentTurn++; }

        function buildMemoryContext() {
            if (!settings().memoryEnabled) return '';
            const allMemories = getAllMemoriesForInjection();
            if (!allMemories || allMemories.length === 0) return '';

            const pinned   = allMemories.filter(m => m.pinned);
            const unpinned = allMemories.filter(m => !m.pinned);

            if (pinned.length === 0 && Math.random() > INJECTION_PROBABILITY) return '';

            const eligible = unpinned.filter(m => (_currentTurn - (m.lastUsedTurn || -999)) >= MIN_TURNS_BEFORE_REUSE);
            const slots    = Math.max(0, MAX_INJECTED_MEMORIES - pinned.length);
            const picked   = eligible.sort((a, b) => (a.usageCount || 0) - (b.usageCount || 0)).slice(0, slots);
            const toInject = [...pinned, ...picked];
            if (toInject.length === 0) return '';

            if (picked.length > 0) {
                const s = settings();
                const markUsed = (list) => {
                    if (!Array.isArray(list)) return;
                    for (const mem of picked) {
                        const idx = list.findIndex(m => m.id === mem.id);
                        if (idx !== -1) {
                            list[idx].lastUsedTurn = _currentTurn;
                            list[idx].usageCount   = (list[idx].usageCount || 0) + 1;
                        }
                    }
                };
                markUsed(s.globalMemories);
                const charKey = getCharKey();
                if (charKey && s.characterMemories) markUsed(s.characterMemories[charKey]);
                api.saveSettings();
            }

            const lines = toInject.map(m => {
                const cat = MEMORY_CATEGORIES[m.category];
                const tag = cat ? `[${cat.label}]` : '[Memory]';
                return `• ${tag} ${m.content}`;
            }).join('\n');

            return `\n\n<shared_memories>\nThe following are things you've talked about or that are meaningful to your relationship. Weave them in naturally when the moment fits — never force them:\n${lines}\n</shared_memories>`;
        }

        // Legacy aliases
        function buildInsideJokesContext() { return buildMemoryContext(); }
        function clearInsideJokes(charKey) {
            const s = settings();
            if (s.characterMemories) delete s.characterMemories[charKey];
            api.saveSettings();
        }

        return {
            buildMemoryContext,
            buildInsideJokesContext,
            detectHighlightableText,
            incrementTurn,
            addMemory,
            editMemory,
            deleteMemory,
            clearMemoriesForScope,
            getMemories,
            getScope,
            clearInsideJokes,
            MEMORY_CATEGORIES
        };
    }

    window.EchoTextMemorySystem = { createMemorySystem, MEMORY_CATEGORIES };
})();
