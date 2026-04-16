(function () {
    'use strict';

    function createSTContextEmotion(api) {
        let lastAnalysisCache = {
            charKey: null,
            timestamp: 0,
            chatHash: null
        };

        // ── Tuning constants ─────────────────────────────────────────────────────
        //
        // ST roleplay messages are narratively rich and long — they hit far more
        // emotion keywords per message than a short EchoText text bubble, and
        // two messages (user + char) are analyzed per exchange. Without tight
        // caps the bleed over-amplifies emotions by 10-30% per response.
        //
        // Design intent: the bleed is a *subtle nudge*, not a direct driver.
        // The EchoText in-chat processMessageEmotion() is the primary driver;
        // this only provides gentle, gradual continuity from the ST roleplay.
        //
        // Per-exchange budget: target ≤ 2 points total emotion shift per message
        // pair. Over a 20-message ST session that's ≤ 40 cumulative points — a
        // noticeable but gradual arc, not a wild swing.

        const CACHE_TTL_MS   = 8000;  // 8 s — wide enough to absorb event double-fires
        const BLEED_WEIGHT   = 0.10;  // Very gentle: raw deltas are already large
        const PER_EMOTION_CAP = 2.0;  // Max ±2 pts any single emotion per exchange
        const TOTAL_DELTA_CAP = 5.0;  // Max sum of all |deltas| per exchange

        function getSTChatMessages() {
            try {
                const context = typeof SillyTavern !== 'undefined' ? SillyTavern.getContext() : null;
                if (!context || !context.chat || !context.chat.length) return null;

                const chat = context.chat;
                const char = api.getCurrentCharacter();
                const firstMes = (char && char.first_mes) ? char.first_mes.trim() : null;

                // Walk backward to collect only the most recent exchange:
                // the newest character message and the newest user message.
                // We deliberately avoid re-reading the whole window on every fire
                // to keep the signal local to the freshest turn.
                let lastCharMsg = null;
                let lastUserMsg = null;

                for (let i = chat.length - 1; i >= 0; i--) {
                    const msg = chat[i];
                    if (!msg || !msg.mes) continue;
                    // Skip the character's intro/greeting to avoid baseline bias
                    if (!msg.is_user && firstMes && msg.mes.trim() === firstMes) continue;

                    if (!msg.is_user && !lastCharMsg) lastCharMsg = msg;
                    if (msg.is_user && !lastUserMsg) lastUserMsg = msg;

                    if (lastCharMsg && lastUserMsg) break;
                }

                if (!lastCharMsg && !lastUserMsg) return null;
                return { lastCharMsg, lastUserMsg };
            } catch (e) {
                if (api.log) api.log('Failed to fetch ST chat messages for context emotion', e);
                return null;
            }
        }

        function createChatHash(lastCharMsg, lastUserMsg) {
            const charPart = lastCharMsg ? `c:${(lastCharMsg.mes || '').substring(0, 40)}` : '';
            const userPart = lastUserMsg ? `u:${(lastUserMsg.mes || '').substring(0, 40)}` : '';
            return `${charPart}||${userPart}`;
        }

        function handleSTMessageReceived() {
            try {
                const s = api.getSettings();
                if (s.ctxSTContext !== true) return;

                // ST context emotion bleed only runs in Tethered mode
                if (typeof api.isTetheredMode === 'function' && !api.isTetheredMode()) return;

                // Emotion system must be enabled
                if (s.emotionSystemEnabled !== true) return;

                const msgs = getSTChatMessages();
                if (!msgs) return;

                const { lastCharMsg, lastUserMsg } = msgs;
                const chatHash = createChatHash(lastCharMsg, lastUserMsg);
                const now = Date.now();

                // Debounce: skip if we already processed this exact exchange
                if (lastAnalysisCache.charKey === api.getCharacterKey() &&
                    lastAnalysisCache.chatHash === chatHash &&
                    (now - lastAnalysisCache.timestamp < CACHE_TTL_MS)) {
                    return;
                }

                if (typeof api.apiAnalyzeTextEmotionRaw !== 'function') return;

                lastAnalysisCache = {
                    charKey: api.getCharacterKey(),
                    timestamp: now,
                    chatHash
                };

                // ── Accumulate weighted deltas ────────────────────────────────────
                const combinedDeltas = {};

                // User message (weight = 1.0 in raw fn × BLEED_WEIGHT here)
                if (lastUserMsg && lastUserMsg.mes) {
                    const impact = api.apiAnalyzeTextEmotionRaw(lastUserMsg.mes, true);
                    if (impact) {
                        for (const [emotion, value] of Object.entries(impact)) {
                            combinedDeltas[emotion] = (combinedDeltas[emotion] || 0) + value * BLEED_WEIGHT;
                        }
                    }
                }

                // Character message (weight = 0.9 in raw fn × BLEED_WEIGHT here)
                if (lastCharMsg && lastCharMsg.mes) {
                    const impact = api.apiAnalyzeTextEmotionRaw(lastCharMsg.mes, false);
                    if (impact) {
                        for (const [emotion, value] of Object.entries(impact)) {
                            combinedDeltas[emotion] = (combinedDeltas[emotion] || 0) + value * BLEED_WEIGHT;
                        }
                    }
                }

                if (!Object.keys(combinedDeltas).length) return;

                // ── Per-emotion cap: no single emotion moves more than PER_EMOTION_CAP ──
                for (const emotion of Object.keys(combinedDeltas)) {
                    const v = combinedDeltas[emotion];
                    combinedDeltas[emotion] = Math.sign(v) * Math.min(Math.abs(v), PER_EMOTION_CAP);
                }

                // ── Total magnitude cap: scale down if the sum of |deltas| is too large ──
                const totalMagnitude = Object.values(combinedDeltas).reduce((s, v) => s + Math.abs(v), 0);
                if (totalMagnitude > TOTAL_DELTA_CAP) {
                    const scale = TOTAL_DELTA_CAP / totalMagnitude;
                    for (const emotion of Object.keys(combinedDeltas)) {
                        combinedDeltas[emotion] *= scale;
                    }
                }

                // ── Only apply if at least one emotion has a meaningful nudge ─────
                const hasImpact = Object.values(combinedDeltas).some(v => Math.abs(v) > 0.08);
                if (!hasImpact) return;

                if (typeof api.applyEmotionDelta === 'function') {
                    api.applyEmotionDelta(combinedDeltas, 'st_context_bleed', 'SillyTavern context emotion bleed');
                }
            } catch (e) {
                if (api.warn) api.warn('Error in ST context emotion bleed', e);
            }
        }

        function bindSTEvents(context) {
            if (context && context.eventSource && context.event_types) {
                // Bind only to MESSAGE_RECEIVED. GENERATION_ENDED fires in overlapping
                // timing and the 8 s cache TTL is sufficient to absorb stray duplicates.
                // Binding both was doubling the per-exchange impact.
                const eventName = context.event_types.MESSAGE_RECEIVED;
                if (!eventName) return;
                if (typeof context.eventSource.off === 'function') {
                    context.eventSource.off(eventName, handleSTMessageReceived);
                }
                context.eventSource.on(eventName, handleSTMessageReceived);
            }
        }

        function unbindSTEvents(context) {
            if (context && context.eventSource && context.event_types) {
                const eventName = context.event_types.MESSAGE_RECEIVED;
                if (!eventName) return;
                if (typeof context.eventSource.off === 'function') {
                    context.eventSource.off(eventName, handleSTMessageReceived);
                } else if (typeof context.eventSource.removeListener === 'function') {
                    context.eventSource.removeListener(eventName, handleSTMessageReceived);
                }
            }
        }

        return {
            applySTContextEmotionBleed: handleSTMessageReceived,
            bindSTEvents,
            unbindSTEvents
        };
    }

    window.EchoTextSTContextEmotion = {
        createSTContextEmotion
    };
})();
