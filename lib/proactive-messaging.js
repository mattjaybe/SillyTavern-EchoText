(function () {
    'use strict';

    function createProactiveMessaging(api) {
        let proactiveSchedulerHandle = null;
        const proactiveGenerationLocks = new Set();

        function settings() { return api.getSettings(); }

        function getDateKeyLocal(d = new Date()) {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
        }

        function getNowMinutes(now = new Date()) {
            return now.getHours() * 60 + now.getMinutes();
        }

        function isNowWithinMinutesWindow(startMin, endMin, now = new Date()) {
            const nowMinutes = getNowMinutes(now);
            if (startMin <= endMin) return nowMinutes >= startMin && nowMinutes <= endMin;
            return nowMinutes >= startMin || nowMinutes <= endMin;
        }

        function getDefaultProactiveConfigForCharacter(char) {
            const corpus = `${char?.description || ''} ${char?.personality || ''} ${char?.scenario || ''}`.toLowerCase();
            const insomniaFriendly = /\b(insomnia|night owl|can't sleep|late[- ]?night|up all night|nocturnal)\b/.test(corpus);
            return {
                enabled: true,
                minInactivityBeforePingHours: 24,
                minInactivityForWindowHours: insomniaFriendly ? 3 : 4,
                allowedPingHours: insomniaFriendly ? ['02:00-03:00'] : [],
                minHoursBetweenProactiveMessages: 6,
                suppressCheckinRepeatHours: 18,
                triggerTemplates: {
                    checkin: 'You are sending a proactive check-in text because there has been a quiet gap. Keep it warm, concise, and in-character. Mention current local time/date naturally if it helps: {{time}}, {{date}}.',
                    time_window: 'You are sending a proactive text during a configured time window. Use a subtle, in-character mood for this hour (local time {{time}}, date {{date}}). Keep it short and natural.',
                    pregnant_pause: 'There was an unresolved pause in your chat. Send a brief in-character follow-up text that feels natural and specific, without sounding needy. Local time: {{time}} on {{date}}.',
                    late_night: 'It is late and quiet. Send a short late-night in-character text appropriate to your mood and relationship, sounding authentic for {{time}}.',
                    morning_wave: 'It is morning. Send a light good-morning style in-character opener that matches your current emotional tone. Time/date: {{time}}, {{date}}.',
                    lunch_nudge: 'It is around midday. Send a casual in-character lunchtime nudge, concise and natural.',
                    evening_winddown: 'It is evening. Send a calm in-character wind-down text that references the vibe of the day without repeating old lines.',
                    weekend_ping: 'It is the weekend. Send a weekend-vibe in-character text that feels spontaneous and personal.',
                    affection_reciprocation: 'The user has shown affection in chat signals. Send a short in-character affectionate reciprocation that matches your personality.',
                    repair_attempt: 'Recent tone suggests tension or emotional strain. Send a brief in-character repair/softening message without overexplaining.',
                    curiosity_ping: 'You feel curious/anticipatory. Send a short in-character curious ping (question/check-in) that invites a response.',
                    anxiety_reassurance: 'You feel uneasy and want connection. Send a concise in-character reassurance-seeking or reassurance-offering text, depending on your persona.',
                    celebration_nudge: 'Positive energy is high. Send a brief upbeat in-character celebratory nudge.',
                    memory_nudge: 'Reference a recent shared moment naturally and briefly, as an in-character memory nudge.'
                }
            };
        }

        function getMergedProactiveConfig(characterKey, char) {
            const base = getDefaultProactiveConfigForCharacter(char);
            const stored = settings().proactiveCharacterConfig?.[characterKey] || {};
            const merged = {
                ...base,
                ...stored,
                triggerTemplates: {
                    ...(base.triggerTemplates || {}),
                    ...(stored.triggerTemplates || {})
                }
            };
            if (!Array.isArray(merged.allowedPingHours)) merged.allowedPingHours = [];
            return merged;
        }

        function getProactiveConversationState(characterKey) {
            if (!characterKey) return null;
            const s = settings();
            if (!s.proactiveState || typeof s.proactiveState !== 'object') s.proactiveState = {};
            if (!s.proactiveState[characterKey]) {
                s.proactiveState[characterKey] = {
                    lastUserMessageAt: 0,
                    lastCharacterMessageAt: 0,
                    lastProactiveAt: 0,
                    lastOutboundType: 'none',
                    triggerHistory: {}
                };
            }
            const state = s.proactiveState[characterKey];
            if (!state.triggerHistory || typeof state.triggerHistory !== 'object') state.triggerHistory = {};
            return state;
        }

        function syncProactiveStateWithHistory(characterKey, history) {
            const state = getProactiveConversationState(characterKey);
            if (!state || !Array.isArray(history)) return;

            let latestUser = 0;
            let latestChar = 0;
            let latestProactive = 0;

            for (const msg of history) {
                const ts = Number(msg.send_date || 0) || 0;
                if (!ts) continue;
                if (msg.is_user) {
                    if (ts > latestUser) latestUser = ts;
                } else {
                    if (ts > latestChar) latestChar = ts;
                    if (msg.meta?.proactive === true && ts > latestProactive) latestProactive = ts;
                }
            }

            state.lastUserMessageAt = latestUser;
            state.lastCharacterMessageAt = latestChar;
            state.lastProactiveAt = latestProactive;

            // Wipe triggers if no character history exists (i.e chat was cleared)
            if (latestChar === 0) {
                state.triggerHistory = {};
            }
        }

        function markProactiveUserActivity(characterKey, timestamp = Date.now()) {
            const state = getProactiveConversationState(characterKey);
            if (!state) return;
            state.lastUserMessageAt = timestamp;
        }

        function markProactiveCharacterActivity(characterKey, proactive = false, outboundType = 'reply', timestamp = Date.now()) {
            const state = getProactiveConversationState(characterKey);
            if (!state) return;
            state.lastCharacterMessageAt = timestamp;
            state.lastOutboundType = outboundType || 'reply';
            if (proactive) {
                state.lastProactiveAt = timestamp;
                state.triggerHistory[outboundType] = timestamp;
            }
        }

        function parseHHMM(v) {
            const m = String(v || '').match(/^(\d{1,2}):(\d{2})$/);
            if (!m) return null;
            const hh = Math.max(0, Math.min(23, parseInt(m[1], 10)));
            const mm = Math.max(0, Math.min(59, parseInt(m[2], 10)));
            return hh * 60 + mm;
        }

        function isNowWithinWindow(windowDef, now = new Date()) {
            const [startRaw, endRaw] = String(windowDef || '').split('-').map(s => s.trim());
            const start = parseHHMM(startRaw);
            const end = parseHHMM(endRaw);
            if (start === null || end === null) return false;
            const nowMinutes = now.getHours() * 60 + now.getMinutes();
            if (start <= end) return nowMinutes >= start && nowMinutes <= end;
            return nowMinutes >= start || nowMinutes <= end;
        }

        function buildProactiveTriggerPrompt(triggerType, config) {
            const raw = config?.triggerTemplates?.[triggerType] || '';
            return api.expandTimeDateMacros(raw);
        }

        function evaluateProactiveTrigger({ history, state, config, now }) {
            if (!config?.enabled) return null;
            if (!Array.isArray(history) || history.length === 0) return null;

            const nowTs = now.getTime();
            const hoursSinceUser = state.lastUserMessageAt > 0 ? ((nowTs - state.lastUserMessageAt) / 3600000) : Infinity;
            const hoursSinceProactive = state.lastProactiveAt > 0 ? ((nowTs - state.lastProactiveAt) / 3600000) : Infinity;
            const globalRateLimitHours = Math.max(0.25, Number(settings().proactiveRateLimitMinutes || 180) / 60);
            const minGapHours = globalRateLimitHours;

            const emotion = settings().emotionSystemEnabled ? api.getEmotionState() : null;
            const anger = Number(emotion?.anger || 0);
            const sadness = Number(emotion?.sadness || 0);
            const fear = Number(emotion?.fear || 0);
            const joy = Number(emotion?.joy || 0);
            const trust = Number(emotion?.trust || 0);
            const anticipation = Number(emotion?.anticipation || 0);

            const lastUserMsgIndex = api.findLastUserMessageIndex(history);
            const lastUserMsg = lastUserMsgIndex >= 0 ? history[lastUserMsgIndex] : null;
            const lastCharMsg = [...history].reverse().find(m => !m?.is_user) || null;
            const lastUserText = String(lastUserMsg?.mes || '').toLowerCase();
            const unresolvedQuestion = /\?\s*$/.test(lastUserText);
            const recentAffectionReaction = history.slice(-8).some(m => !m?.is_user && m?.reactions && (m.reactions.heart?.mine || m.reactions.star?.mine || m.reactions.like?.mine));
            const hasRecentSharedMoment = history.slice(-12).some(m => /\b(remember|that time|earlier|before|yesterday|last night)\b/i.test(String(m?.mes || '')));

            const canTriggerType = (type, minHours = 10) => {
                const prev = Number(state.triggerHistory?.[type] || 0);
                if (!prev) return true;
                return ((nowTs - prev) / 3600000) >= minHours;
            };

            if (hoursSinceProactive < minGapHours) return null;

            const lastCheckinAt = Number(state.triggerHistory?.checkin || 0);
            const hoursSinceCheckin = lastCheckinAt > 0 ? ((nowTs - lastCheckinAt) / 3600000) : Infinity;
            if (hoursSinceUser >= Math.max(globalRateLimitHours, config.minInactivityBeforePingHours || 24) && hoursSinceCheckin >= (config.suppressCheckinRepeatHours || 12)) {
                return { type: 'checkin', prompt: buildProactiveTriggerPrompt('checkin', config) };
            }

            if (hoursSinceUser >= 0.35 && hoursSinceUser <= 6 && unresolvedQuestion && canTriggerType('pregnant_pause', 8)) {
                return { type: 'pregnant_pause', prompt: buildProactiveTriggerPrompt('pregnant_pause', config) };
            }
            if (hoursSinceUser >= 1.5 && isNowWithinMinutesWindow(23 * 60, 2 * 60 + 30, now) && canTriggerType('late_night', 14)) {
                return { type: 'late_night', prompt: buildProactiveTriggerPrompt('late_night', config) };
            }
            if (hoursSinceUser >= 8 && isNowWithinMinutesWindow(6 * 60, 9 * 60 + 30, now) && canTriggerType('morning_wave', 18)) {
                return { type: 'morning_wave', prompt: buildProactiveTriggerPrompt('morning_wave', config) };
            }
            if (hoursSinceUser >= 5 && isNowWithinMinutesWindow(11 * 60 + 15, 13 * 60 + 45, now) && canTriggerType('lunch_nudge', 18)) {
                return { type: 'lunch_nudge', prompt: buildProactiveTriggerPrompt('lunch_nudge', config) };
            }
            if (hoursSinceUser >= 4 && isNowWithinMinutesWindow(19 * 60, 22 * 60 + 30, now) && canTriggerType('evening_winddown', 14)) {
                return { type: 'evening_winddown', prompt: buildProactiveTriggerPrompt('evening_winddown', config) };
            }

            const day = now.getDay();
            if (hoursSinceUser >= 6 && (day === 0 || day === 6) && canTriggerType('weekend_ping', 18)) {
                return { type: 'weekend_ping', prompt: buildProactiveTriggerPrompt('weekend_ping', config) };
            }
            if (hoursSinceUser >= 1.5 && recentAffectionReaction && (trust >= 58 || joy >= 60) && canTriggerType('affection_reciprocation', 10)) {
                return { type: 'affection_reciprocation', prompt: buildProactiveTriggerPrompt('affection_reciprocation', config) };
            }
            if (hoursSinceUser >= 2 && (anger >= 62 || sadness >= 65) && canTriggerType('repair_attempt', 10)) {
                return { type: 'repair_attempt', prompt: buildProactiveTriggerPrompt('repair_attempt', config) };
            }
            if (hoursSinceUser >= 2.5 && anticipation >= 58 && canTriggerType('curiosity_ping', 10)) {
                return { type: 'curiosity_ping', prompt: buildProactiveTriggerPrompt('curiosity_ping', config) };
            }
            if (hoursSinceUser >= 2 && fear >= 58 && canTriggerType('anxiety_reassurance', 10)) {
                return { type: 'anxiety_reassurance', prompt: buildProactiveTriggerPrompt('anxiety_reassurance', config) };
            }
            if (hoursSinceUser >= 2 && joy >= 72 && trust >= 55 && canTriggerType('celebration_nudge', 10)) {
                return { type: 'celebration_nudge', prompt: buildProactiveTriggerPrompt('celebration_nudge', config) };
            }
            if (hoursSinceUser >= 3 && hasRecentSharedMoment && !!lastCharMsg && canTriggerType('memory_nudge', 12)) {
                return { type: 'memory_nudge', prompt: buildProactiveTriggerPrompt('memory_nudge', config) };
            }

            if (hoursSinceUser >= (config.minInactivityForWindowHours || 4) && Array.isArray(config.allowedPingHours) && config.allowedPingHours.length) {
                const inWindow = config.allowedPingHours.some(w => isNowWithinWindow(w, now));
                if (inWindow) {
                    const lastWindowAt = Number(state.triggerHistory?.time_window || 0);
                    const hoursSinceWindow = lastWindowAt > 0 ? ((nowTs - lastWindowAt) / 3600000) : Infinity;
                    if (hoursSinceWindow >= Math.max(12, minGapHours)) {
                        return { type: 'time_window', prompt: buildProactiveTriggerPrompt('time_window', config) };
                    }
                }
            }

            return null;
        }

        async function generateProactiveMessage(history, trigger) {
            const controller = new AbortController();
            const extraSystem = [
                'PROACTIVE OUTBOUND MODE: You are initiating this message yourself, not replying to a direct user message.',
                trigger?.prompt || 'Write a short, natural proactive text in character.'
            ];
            const { apiMessages, rawPrompt, systemPrompt } = api.buildApiMessagesFromHistory(history, extraSystem);
            const result = await api.requestEchoTextCompletion({ apiMessages, rawPrompt, systemPrompt, signal: controller.signal });
            return (result || '').trim();
        }

        async function runProactiveTickForChar(char, characterKey) {
            if (proactiveGenerationLocks.has(characterKey)) return;
            if (api.getIsGenerating()) return;

            // For group sessions, getChatHistory only works with the active char key.
            // We need to read directly from settings per character.
            const s = api.getSettings();
            const history = (s.chatHistory && s.chatHistory[characterKey]) || [];
            const state = getProactiveConversationState(characterKey);
            if (!state) return;
            syncProactiveStateWithHistory(characterKey, history);

            const config = getMergedProactiveConfig(characterKey, char);
            const trigger = evaluateProactiveTrigger({ history, state, config, now: new Date() });
            if (!trigger) return;

            proactiveGenerationLocks.add(characterKey);
            try {
                const isActiveChar = !api.isGroupSession || !api.isGroupSession() || api.getActiveGroupCharKey() === characterKey;

                if (api.isPanelOpen() && isActiveChar) api.setTypingIndicatorVisible(true);

                // Build api messages using this character's history (not the active char's)
                const { apiMessages, rawPrompt, systemPrompt } = api.buildApiMessagesFromHistoryForChar(history, [], char);
                const controller = new AbortController();
                const proactiveText = await api.requestEchoTextCompletion({ apiMessages, rawPrompt, systemPrompt, signal: controller.signal });
                if (!proactiveText) return;

                api.processMessageEmotion(proactiveText, false, characterKey);
                const outbound = {
                    is_user: false,
                    mes: proactiveText.trim(),
                    send_date: Date.now(),
                    meta: { proactive: true, proactiveType: trigger.type }
                };
                const newHistory = [...history, outbound];

                // Save directly to settings for this char key
                if (api.isTetheredMode()) {
                    if (!s.chatHistory) s.chatHistory = {};
                    s.chatHistory[characterKey] = newHistory;
                    api.saveSettings();
                }
                markProactiveCharacterActivity(characterKey, true, trigger.type, outbound.send_date);

                if (api.isPanelOpen() && isActiveChar) {
                    api.renderMessages(newHistory);
                    api.setFabUnreadIndicator(false);
                } else if (api.isPanelOpen() && api.markGroupCharUnread) {
                    // Panel open but user is on a different group member — pulse that char's button
                    api.markGroupCharUnread(characterKey);
                } else {
                    api.setFabUnreadIndicator(true);
                }
            } catch (err) {
                api.warn('Proactive scheduler tick failed:', err);
            } finally {
                api.setTypingIndicatorVisible(false);
                proactiveGenerationLocks.delete(characterKey);
                api.saveSettings();
            }
        }

        async function runProactiveSchedulerTick() {
            if (!api.isTetheredMode()) return;
            if (settings().enabled !== true || settings().proactiveMessagingEnabled !== true) return;

            // In a group session, iterate over all group members
            if (api.isGroupSession && api.isGroupSession() && api.getGroupMemberKeys) {
                const memberKeys = api.getGroupMemberKeys();
                for (const charKey of memberKeys) {
                    const char = api.getGroupMemberByKey ? api.getGroupMemberByKey(charKey) : null;
                    if (char) await runProactiveTickForChar(char, charKey);
                }
                return;
            }

            // Solo chat — existing single-character logic
            const char = api.getCurrentCharacter();
            const characterKey = api.getCharacterKey();
            if (!char || !characterKey) return;
            await runProactiveTickForChar(char, characterKey);
        }

        function stopProactiveScheduler() {
            if (proactiveSchedulerHandle) {
                clearInterval(proactiveSchedulerHandle);
                proactiveSchedulerHandle = null;
            }
        }

        function formatProactiveTimestamp(ts) {
            if (!ts || !Number.isFinite(ts)) return '—';
            const d = new Date(ts);
            return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        }

        function formatHoursDuration(hours) {
            if (!Number.isFinite(hours) || hours <= 0) return '0m';
            const totalMin = Math.max(1, Math.ceil(hours * 60));
            const h = Math.floor(totalMin / 60);
            const m = totalMin % 60;
            if (h > 0 && m > 0) return `${h}h ${m}m`;
            if (h > 0) return `${h}h`;
            return `${m}m`;
        }

        function getProactiveInsightsSnapshot() {
            const char = api.getCurrentCharacter();
            const characterKey = api.getCharacterKey();
            const now = new Date();
            const fallback = {
                character: char?.name || 'No character selected',
                tick: `Every ${Math.max(1, Number(settings().proactiveTickMinutes || 2))} min`,
                lastUser: 'No recent message',
                lastChar: 'No recent reply',
                lastAuto: 'No proactive text yet',
                next: api.isTetheredMode() ? 'No active conversation yet' : 'Switch to Tethered mode',
                type: '—',
                triggerDiagnostics: []
            };
            if (!characterKey || !char) return fallback;

            const history = api.getChatHistory();
            const state = getProactiveConversationState(characterKey);
            syncProactiveStateWithHistory(characterKey, history);
            const config = getMergedProactiveConfig(characterKey, char);

            const nowTs = now.getTime();
            const globalRateLimitHours = Math.max(0.25, Number(settings().proactiveRateLimitMinutes || 180) / 60);
            const minGapHours = globalRateLimitHours;
            const hoursSinceUser = state.lastUserMessageAt > 0 ? ((nowTs - state.lastUserMessageAt) / 3600000) : Infinity;
            const hoursSinceProactive = state.lastProactiveAt > 0 ? ((nowTs - state.lastProactiveAt) / 3600000) : Infinity;
            const remainingGap = Math.max(0, minGapHours - hoursSinceProactive);
            const userGapNeed = Math.max(0, Math.min(globalRateLimitHours, config.minInactivityBeforePingHours || 24) - hoursSinceUser);

            const prettyType = {
                checkin: 'Check-in',
                time_window: 'Time window',
                pregnant_pause: 'Pause follow-up',
                late_night: 'Late-night ping',
                morning_wave: 'Morning ping',
                lunch_nudge: 'Lunch nudge',
                evening_winddown: 'Evening wind-down',
                weekend_ping: 'Weekend ping',
                affection_reciprocation: 'Affection reciprocation',
                repair_attempt: 'Repair attempt',
                curiosity_ping: 'Curiosity ping',
                anxiety_reassurance: 'Anxiety reassurance',
                celebration_nudge: 'Celebration nudge',
                memory_nudge: 'Memory nudge',
                reply: 'Normal reply',
                none: 'None'
            };

            const triggerDefs = [
                ['checkin', 'Check-in'],
                ['time_window', 'Time window'],
                ['pregnant_pause', 'Pause follow-up'],
                ['late_night', 'Late-night ping'],
                ['morning_wave', 'Morning ping'],
                ['lunch_nudge', 'Lunch nudge'],
                ['evening_winddown', 'Evening wind-down'],
                ['weekend_ping', 'Weekend ping'],
                ['affection_reciprocation', 'Affection reciprocation'],
                ['repair_attempt', 'Repair attempt'],
                ['curiosity_ping', 'Curiosity ping'],
                ['anxiety_reassurance', 'Anxiety reassurance'],
                ['celebration_nudge', 'Celebration nudge'],
                ['memory_nudge', 'Memory nudge']
            ];

            let next = 'Ready to send when a trigger matches';
            if (settings().proactiveMessagingEnabled !== true) next = 'Proactive messaging is currently paused';
            else if (!config.enabled) next = 'This character is not configured for proactive pings';
            else if (remainingGap > 0) next = `Cooling down (${formatHoursDuration(remainingGap)} remaining)`;
            else if (userGapNeed > 0) next = `Waiting for quiet time (${formatHoursDuration(userGapNeed)} left)`;

            const sharedWait = remainingGap > 0
                ? `~${formatHoursDuration(remainingGap)}`
                : (userGapNeed > 0 ? `~${formatHoursDuration(userGapNeed)}` : 'When conditions match');

            const triggerDiagnostics = triggerDefs.map(([id, label]) => ({
                label,
                last: formatProactiveTimestamp(Number(state.triggerHistory?.[id] || 0)),
                next: sharedWait
            }));

            return {
                character: char.name || 'Character',
                tick: `Every ${Math.max(1, Number(settings().proactiveTickMinutes || 2))} min`,
                lastUser: formatProactiveTimestamp(state.lastUserMessageAt),
                lastChar: formatProactiveTimestamp(state.lastCharacterMessageAt),
                lastAuto: formatProactiveTimestamp(state.lastProactiveAt),
                next,
                type: prettyType[state.lastOutboundType] || state.lastOutboundType || 'None',
                triggerDiagnostics
            };
        }

        function refreshProactiveInsights() {
            const snapshot = getProactiveInsightsSnapshot();
            const targets = [
                ['#et_proactive_character_panel', snapshot.character],
                ['#et_proactive_tick_panel', snapshot.tick],
                ['#et_proactive_last_user_panel', snapshot.lastUser],
                ['#et_proactive_last_char_panel', snapshot.lastChar],
                ['#et_proactive_last_auto_panel', snapshot.lastAuto],
                ['#et_proactive_next_panel', snapshot.next],
                ['#et_proactive_type_panel', snapshot.type],
                ['#et_proactive_character', snapshot.character],
                ['#et_proactive_tick', snapshot.tick],
                ['#et_proactive_last_user', snapshot.lastUser],
                ['#et_proactive_last_char', snapshot.lastChar],
                ['#et_proactive_last_auto', snapshot.lastAuto],
                ['#et_proactive_next', snapshot.next],
                ['#et_proactive_type', snapshot.type]
            ];
            targets.forEach(([sel, val]) => {
                const el = jQuery(sel);
                if (el.length) el.text(val);
            });

            const renderDiagnostics = (selector) => {
                const wrap = jQuery(selector);
                if (!wrap.length) return;
                const html = (snapshot.triggerDiagnostics || []).map(t => `
                <div class="et-trigger-row">
                    <span class="et-trigger-row-name">${t.label}</span>
                    <span class="et-trigger-row-meta">Last: ${t.last}</span>
                    <span class="et-trigger-row-meta">Next: ${t.next}</span>
                </div>
            `).join('');
                wrap.html(html || '<div class="et-trigger-row"><span class="et-trigger-row-name">No trigger diagnostics available</span></div>');
            };

            renderDiagnostics('#et_trigger_list_panel');
            renderDiagnostics('#et_trigger_list');
        }

        async function triggerTestProactiveMessage() {
            const char = api.getCurrentCharacter();
            const characterKey = api.getCharacterKey();
            if (!char || !characterKey) {
                toastr.warning('Please select a character card first.');
                return;
            }
            if (proactiveGenerationLocks.has(characterKey) || api.getIsGenerating()) {
                toastr.warning('A generation is already in progress.');
                return;
            }

            const triggerTypes = [
                'checkin', 'pregnant_pause', 'late_night', 'morning_wave', 'lunch_nudge',
                'evening_winddown', 'weekend_ping', 'affection_reciprocation', 'repair_attempt',
                'curiosity_ping', 'anxiety_reassurance', 'celebration_nudge', 'memory_nudge'
            ];

            const randomType = triggerTypes[Math.floor(Math.random() * triggerTypes.length)];
            const config = getMergedProactiveConfig(characterKey, char);
            const trigger = { type: randomType, prompt: buildProactiveTriggerPrompt(randomType, config) };

            jQuery('#et_trigger_message, #et_trigger_message_panel').prop('disabled', true).addClass('et-btn-loading');

            proactiveGenerationLocks.add(characterKey);
            try {
                if (api.isPanelOpen() && api.getCharacterKey() === characterKey) api.setTypingIndicatorVisible(true);

                const history = api.getChatHistory();
                const text = await generateProactiveMessage(history, trigger);
                if (!text) return;

                api.processMessageEmotion(text, false);
                const outbound = {
                    is_user: false,
                    mes: text,
                    send_date: Date.now(),
                    meta: { proactive: true, proactiveType: trigger.type }
                };
                const newHistory = [...history, outbound];
                api.saveChatHistory(newHistory);
                markProactiveCharacterActivity(characterKey, true, trigger.type, outbound.send_date);

                if (api.isPanelOpen() && api.getCharacterKey() === characterKey) {
                    api.renderMessages(newHistory);
                    api.setFabUnreadIndicator(false);
                } else {
                    api.setFabUnreadIndicator(true);
                }

                const prettyType = trigger.type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                toastr.success('Triggered: ' + prettyType);
                refreshProactiveInsights();
            } catch (err) {
                api.warn('Trigger test failed:', err);
                toastr.error('Trigger failed: ' + err.message);
            } finally {
                api.setTypingIndicatorVisible(false);
                proactiveGenerationLocks.delete(characterKey);
                jQuery('#et_trigger_message, #et_trigger_message_panel').prop('disabled', false).removeClass('et-btn-loading');
                api.saveSettings();
            }
        }

        function startProactiveScheduler() {
            stopProactiveScheduler();
            if (!api.isTetheredMode()) return;
            if (settings().proactiveMessagingEnabled !== true) return;
            const tickMinutes = Math.max(1, Number(settings().proactiveTickMinutes || 2));
            proactiveSchedulerHandle = setInterval(() => runProactiveSchedulerTick(), tickMinutes * 60 * 1000);
            setTimeout(() => runProactiveSchedulerTick(), 5000);
        }

        return {
            getDateKeyLocal,
            getNowMinutes,
            isNowWithinMinutesWindow,
            syncProactiveStateWithHistory,
            markProactiveUserActivity,
            markProactiveCharacterActivity,
            startProactiveScheduler,
            stopProactiveScheduler,
            refreshProactiveInsights,
            triggerTestProactiveMessage,
            getProactiveInsightsSnapshot
        };
    }

    window.EchoTextProactiveMessaging = { createProactiveMessaging };
})();
