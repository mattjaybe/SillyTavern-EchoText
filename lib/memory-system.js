(function () {
    'use strict';

    /**
     * EchoText Memory System
     * Extracts emotionally significant "inside joke" callbacks from chat history
     * and occasionally injects them into the system prompt for natural recall.
     * Exposes: window.EchoTextMemorySystem.createMemorySystem(api)
     */
    function createMemorySystem(api) {

        const MAX_JOKES_PER_CHAR = 6;
        const INJECTION_PROBABILITY = 0.14; // ~1 in 7 generations
        const MIN_TURNS_BEFORE_REUSE = 8;
        const SIGNIFICANT_SPIKE_THRESHOLD = 11; // minimum delta to trigger extraction

        function settings() { return api.getSettings(); }

        // ============================================================
        // STATE
        // ============================================================

        function getJokes(charKey) {
            const s = settings();
            if (!s.insideJokes) s.insideJokes = {};
            if (!s.insideJokes[charKey]) s.insideJokes[charKey] = [];
            return s.insideJokes[charKey];
        }

        function saveJokes(charKey, jokes) {
            const s = settings();
            if (!s.insideJokes) s.insideJokes = {};
            s.insideJokes[charKey] = jokes;
            api.saveSettings();
        }

        function clearInsideJokes(charKey) {
            if (!charKey) return;
            const s = settings();
            if (s.insideJokes) delete s.insideJokes[charKey];
            api.saveSettings();
        }

        // ============================================================
        // EXTRACTION
        // ============================================================

        /**
         * Called after a character message with a high emotional impact.
         * Tries to extract a short, memorable phrase from the message text.
         * @param {Array} history - current chat history
         * @param {Object} emotionState - current emotion state (with lastImpact)
         */
        function extractMemorableCallback(history, emotionState) {
            if (!history || history.length < 3) return;
            if (!emotionState || !emotionState.lastImpact) return;

            const charKey = api.getCharacterKey();
            if (!charKey) return;

            // Check if the last impact had a significant positive emotional spike
            const impact = emotionState.lastImpact;
            const positiveSpike = (impact.joy || 0) + (impact.trust || 0) * 0.8 + (impact.anticipation || 0) * 0.5;
            if (positiveSpike < SIGNIFICANT_SPIKE_THRESHOLD) return;

            // Get the message that caused the spike (last char message)
            const lastCharMsg = [...history].reverse().find(m => !m.is_user);
            if (!lastCharMsg || !lastCharMsg.mes) return;

            // Extract a memorable phrase: first complete sentence or first 60 chars
            const text = lastCharMsg.mes.trim();
            const sentenceMatch = text.match(/^[^.!?]*[.!?]/);
            let phrase = sentenceMatch ? sentenceMatch[0].trim() : text.substring(0, 60).trim();

            // Skip if too short or too generic
            if (phrase.length < 12) return;
            if (/^(okay|alright|sure|yes|no|hmm|oh|well|right|got it)/i.test(phrase)) return;

            // Deduplicate: don't add same or very similar phrase
            const existing = getJokes(charKey);
            const isDuplicate = existing.some(j => {
                const sim = longestCommonSubstring(j.phrase.toLowerCase(), phrase.toLowerCase());
                return sim / phrase.length > 0.6;
            });
            if (isDuplicate) return;

            // Add new joke, trimming to max
            const newJoke = {
                phrase,
                savedAt: Date.now(),
                lastUsedTurn: -999,
                usageCount: 0
            };

            const updated = [newJoke, ...existing].slice(0, MAX_JOKES_PER_CHAR);
            saveJokes(charKey, updated);
        }

        function longestCommonSubstring(a, b) {
            // Simple approximation for dedup
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

        // ============================================================
        // INJECTION
        // ============================================================

        let _currentTurn = 0;

        function incrementTurn() {
            _currentTurn++;
        }

        /**
         * Returns a system prompt injection string if an inside joke should be used.
         * Probabilistic — only fires ~14% of the time, and only for unused jokes.
         */
        function buildInsideJokesContext() {
            if (Math.random() > INJECTION_PROBABILITY) return '';

            const charKey = api.getCharacterKey();
            if (!charKey) return '';

            const jokes = getJokes(charKey);
            if (!jokes || jokes.length === 0) return '';

            // Filter to jokes not used recently
            const eligible = jokes.filter(j => (_currentTurn - (j.lastUsedTurn || -999)) >= MIN_TURNS_BEFORE_REUSE);
            if (eligible.length === 0) return '';

            // Pick the one with lowest usageCount (prefer fresh ones)
            const joke = eligible.sort((a, b) => (a.usageCount || 0) - (b.usageCount || 0))[0];

            // Mark as used
            joke.lastUsedTurn = _currentTurn;
            joke.usageCount = (joke.usageCount || 0) + 1;
            const updated = jokes.map(j => j.phrase === joke.phrase ? joke : j);
            saveJokes(charKey, updated);

            return `\n\n[Memory Callback: If it fits the conversation organically, you may briefly and naturally reference this earlier moment: "${joke.phrase}". Only use it if it genuinely flows — never force it.]`;
        }

        // ============================================================
        // PUBLIC API
        // ============================================================

        return {
            extractMemorableCallback,
            buildInsideJokesContext,
            clearInsideJokes,
            incrementTurn
        };
    }

    window.EchoTextMemorySystem = { createMemorySystem };
})();
