(function () {
    'use strict';

    /**
     * EchoText Save/Load Chat Modal
     * Provides save, load, rename, and delete for Tethered, Untethered, Group, and Combined chat sessions.
     * Exposes: window.EchoTextSaveLoadModal.createSaveLoadModal(api)
     *
     * API object must provide:
     *   getSettings, saveSettings, getCharacterKey, getCharacterName,
     *   isTetheredMode, getChatHistory, saveChatHistory, renderMessages,
     *   getEmotionState, isPanelOpen,
     *   isGroupSession()          — true when in a group chat
     *   isCombineMode()           — true when in combined-response mode
     *   getCurrentGroupId()       — the current group's ID string, or null
     *   captureGroupSnapshot()    — snapshot of all members' emotional state
     *   restoreGroupSnapshot(snap)— restore snapshot
     *   onUntetheredRestored()    — called after loading an untethered save; refreshes panel status row
     */
    function createSaveLoadModal(api) {

        function settings() { return api.getSettings(); }
        function genId() { return 'sl_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7); }

        function formatDate(ts) {
            if (!ts) return '';
            const d = new Date(ts);
            return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) + ' ' +
                d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
        }

        // ── Plutchik emotion definitions (mirrors emotion-system.js constants) ──────
        // Kept in-module so saveload-modal stays decoupled from the emotion system API.
        const EMOTIONS = [
            { id: 'love',         label: 'Love',         icon: 'fa-solid fa-heart',            color: '#fb7bb8', intensity: ['Fondness',     'Love',         'Adoration']  },
            { id: 'joy',          label: 'Joy',          icon: 'fa-solid fa-sun',               color: '#facc15', intensity: ['Serenity',     'Joy',          'Ecstasy']    },
            { id: 'trust',        label: 'Trust',        icon: 'fa-solid fa-handshake',         color: '#4ade80', intensity: ['Acceptance',   'Trust',        'Admiration'] },
            { id: 'fear',         label: 'Fear',         icon: 'fa-solid fa-ghost',             color: '#a78bfa', intensity: ['Apprehension', 'Fear',         'Terror']     },
            { id: 'surprise',     label: 'Surprise',     icon: 'fa-solid fa-bolt',              color: '#38bdf8', intensity: ['Distraction',  'Surprise',     'Amazement']  },
            { id: 'sadness',      label: 'Sadness',      icon: 'fa-solid fa-cloud-rain',        color: '#60a5fa', intensity: ['Pensiveness',  'Sadness',      'Grief']      },
            { id: 'disgust',      label: 'Disgust',      icon: 'fa-solid fa-face-grimace',      color: '#a3e635', intensity: ['Boredom',      'Disgust',      'Loathing']   },
            { id: 'anger',        label: 'Anger',        icon: 'fa-solid fa-fire-flame-curved', color: '#f87171', intensity: ['Annoyance',    'Anger',        'Rage']       },
            { id: 'anticipation', label: 'Anticipation', icon: 'fa-solid fa-forward',           color: '#fb923c', intensity: ['Interest',     'Anticipation', 'Vigilance']  },
        ];

        function getIntensityLabel(e, value) {
            if (value < 33) return e.intensity[0];
            if (value < 66) return e.intensity[1];
            return e.intensity[2];
        }

        // ── Untethered option lookup (mirrors untethered-chat.js constants) ─────────
        // Used for human-readable labels / icons / colors in the preview panel.
        const UC_META = {
            mood: {
                romantic:   { label: 'Romantic',      icon: 'fa-solid fa-heart',               color: '#fb7185' },
                flirty:     { label: 'Flirty',         icon: 'fa-solid fa-wand-magic-sparkles', color: '#f472b6' },
                erotic:     { label: 'Erotic',         icon: 'fa-solid fa-fire',                color: '#ff6b6b' },
                explicit:   { label: 'Explicit',       icon: 'fa-solid fa-droplet',             color: '#ff4d8d' },
                playful:    { label: 'Playful',        icon: 'fa-solid fa-dice',                color: '#a78bfa' },
                angry:      { label: 'Angry',          icon: 'fa-solid fa-fire-flame-curved',   color: '#f87171' },
                shy:        { label: 'Shy',            icon: 'fa-solid fa-face-flushed',        color: '#f9a8d4' },
                confident:  { label: 'Confident',      icon: 'fa-solid fa-crown',               color: '#fbbf24' },
                sad:        { label: 'Sad',            icon: 'fa-solid fa-cloud-rain',          color: '#60a5fa' },
                happy:      { label: 'Happy',          icon: 'fa-solid fa-sun',                 color: '#facc15' },
                anxious:    { label: 'Anxious',        icon: 'fa-solid fa-brain',               color: '#c084fc' },
                bored:      { label: 'Bored',          icon: 'fa-solid fa-face-meh',            color: '#94a3b8' },
                excited:    { label: 'Excited',        icon: 'fa-solid fa-bolt-lightning',      color: '#fb923c' },
                jealous:    { label: 'Jealous',        icon: 'fa-solid fa-eye',                 color: '#4ade80' },
                cold:       { label: 'Cold',           icon: 'fa-solid fa-snowflake',           color: '#93c5fd' },
                mysterious: { label: 'Mysterious',     icon: 'fa-solid fa-mask',                color: '#818cf8' },
            },
            personality: {
                tsundere:      { label: 'Tsundere',       icon: 'fa-solid fa-face-angry',          color: '#f87171' },
                yandere:       { label: 'Yandere',        icon: 'fa-solid fa-heart-crack',         color: '#fb7185' },
                kuudere:       { label: 'Kuudere',        icon: 'fa-solid fa-snowflake',           color: '#93c5fd' },
                dandere:       { label: 'Dandere',        icon: 'fa-solid fa-feather',             color: '#86efac' },
                deredere:      { label: 'Deredere',       icon: 'fa-solid fa-face-laugh-beam',     color: '#facc15' },
                himdere:       { label: 'Himdere',        icon: 'fa-solid fa-gem',                 color: '#c084fc' },
                tsundere_soft: { label: 'Tsundere (Soft)',icon: 'fa-solid fa-face-smile-wink',     color: '#fda4af' },
                kuudere_dark:  { label: 'Kuudere (Dark)', icon: 'fa-solid fa-moon',               color: '#818cf8' },
                introvert:     { label: 'Introvert',      icon: 'fa-solid fa-person-rays',         color: '#818cf8' },
                extrovert:     { label: 'Extrovert',      icon: 'fa-solid fa-users',              color: '#fb923c' },
                witty:         { label: 'Witty',          icon: 'fa-solid fa-comment-dots',        color: '#facc15' },
                sarcastic:     { label: 'Sarcastic',      icon: 'fa-solid fa-face-rolling-eyes',   color: '#94a3b8' },
                sweet:         { label: 'Sweet',          icon: 'fa-solid fa-candy-cane',          color: '#f9a8d4' },
                sassy:         { label: 'Sassy',          icon: 'fa-solid fa-hand-back-fist',      color: '#c084fc' },
                brooding:      { label: 'Brooding',       icon: 'fa-solid fa-cloud',              color: '#64748b' },
                cheerleader:   { label: 'Hype',           icon: 'fa-solid fa-star',               color: '#fbbf24' },
                loner:         { label: 'Loner',          icon: 'fa-solid fa-person',             color: '#475569' },
                mentor:        { label: 'Mentor',         icon: 'fa-solid fa-graduation-cap',      color: '#34d399' },
                rebel:         { label: 'Rebel',          icon: 'fa-solid fa-bolt',               color: '#f87171' },
                professional:  { label: 'Corporate',      icon: 'fa-solid fa-briefcase',           color: '#60a5fa' },
                clown:         { label: 'Clown',          icon: 'fa-solid fa-face-grin-squint',    color: '#fb923c' },
                intellectual:  { label: 'Intellectual',   icon: 'fa-solid fa-book-open',           color: '#818cf8' },
                passionate:    { label: 'Passionate',     icon: 'fa-solid fa-circle-radiation',    color: '#f87171' },
                may_december:  { label: 'May\u2013December', icon: 'fa-solid fa-infinity',         color: '#a78bfa' },
            },
            commStyle: {
                formal:     { label: 'Formal',      icon: 'fa-solid fa-file-pen',           color: '#60a5fa' },
                casual:     { label: 'Casual',      icon: 'fa-solid fa-comment',            color: '#4ade80' },
                vintage:    { label: 'Vintage',     icon: 'fa-solid fa-feather-pointed',    color: '#fbbf24' },
                tech_savvy: { label: 'Tech-Savvy',  icon: 'fa-solid fa-microchip',          color: '#38bdf8' },
                poetic:     { label: 'Poetic',      icon: 'fa-solid fa-pen-nib',            color: '#c084fc' },
                direct:     { label: 'Direct',      icon: 'fa-solid fa-arrow-right',        color: '#f87171' },
                passive:    { label: 'Passive',     icon: 'fa-solid fa-ellipsis',           color: '#94a3b8' },
                aggressive: { label: 'Aggressive',  icon: 'fa-solid fa-bullhorn',           color: '#fb923c' },
                banter:     { label: 'Banter',      icon: 'fa-solid fa-comments',           color: '#fb923c' },
                theatrical: { label: 'Theatrical',  icon: 'fa-solid fa-masks-theater',      color: '#f472b6' },
                cryptic:    { label: 'Cryptic',     icon: 'fa-solid fa-eye-slash',          color: '#818cf8' },
                nurturing:  { label: 'Nurturing',   icon: 'fa-solid fa-hand-holding-heart', color: '#34d399' },
            }
        };

        function getUCMeta(group, id) {
            // Optional API hook — falls back to embedded table if not provided.
            if (api.getUntetheredOptionMeta) {
                const result = api.getUntetheredOptionMeta(group, id);
                if (result) return result;
            }
            return (UC_META[group] && UC_META[group][id]) || { label: id, icon: 'fa-solid fa-circle', color: 'var(--et-theme-color)' };
        }

        // ============================================================
        // STATE HELPERS
        // ============================================================

        /**
         * Returns (and initialises if needed) the full savedChats store.
         * Four namespaces: tethered | untethered | group | group_combine
         */
        function getStore() {
            const s = settings();
            if (!s.savedChats) s.savedChats = {};
            if (!s.savedChats.tethered) s.savedChats.tethered = {};
            if (!s.savedChats.untethered) s.savedChats.untethered = {};
            if (!s.savedChats.group) s.savedChats.group = {};
            if (!s.savedChats.group_combine) s.savedChats.group_combine = {};
            return s.savedChats;
        }

        /**
         * Returns the storage namespace for the current context.
         *   group_combine — active group + combine mode
         *   group         — active group, individual-per-character view
         *   tethered      — solo tethered chat
         *   untethered    — solo untethered chat
         */
        function getModeKey() {
            const inGroup = api.isGroupSession && api.isGroupSession();
            if (inGroup) {
                return (api.isCombineMode && api.isCombineMode()) ? 'group_combine' : 'group';
            }
            return api.isTetheredMode() ? 'tethered' : 'untethered';
        }

        /**
         * Returns the sorted list of saves relevant to the current context.
         * Group saves are filtered by groupId; solo saves by charKey.
         */
        function getSavesForCurrentMode() {
            const store = getStore();
            const modeKey = getModeKey();

            if (modeKey === 'group' || modeKey === 'group_combine') {
                const groupId = api.getCurrentGroupId ? api.getCurrentGroupId() : null;
                if (!groupId) return [];
                return Object.values(store[modeKey])
                    .filter(s => String(s.groupId) === String(groupId))
                    .sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
            }

            const charKey = api.getCharacterKey();
            if (!charKey) return [];
            return Object.values(store[modeKey])
                .filter(s => s.charKey === charKey)
                .sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
        }

        /**
         * Builds a save entry for the current session state.
         */
        function buildSaveEntry(name) {
            const mode = getModeKey();
            const isGroupMode = (mode === 'group' || mode === 'group_combine');
            const charKey = api.getCharacterKey();
            const charName = api.getCharacterName();
            const history = api.getChatHistory();
            const groupId = isGroupMode && api.getCurrentGroupId ? api.getCurrentGroupId() : null;

            // Auto-generate save name
            const datePart = formatDate(Date.now());
            let defaultName;
            if (mode === 'group_combine') {
                defaultName = `Combined \u2014 ${datePart}`;
            } else if (mode === 'group') {
                defaultName = `${charName} (Group) \u2014 ${datePart}`;
            } else {
                defaultName = `${charName} \u2014 ${datePart}`;
            }

            const entry = {
                id: genId(),
                name: name || defaultName,
                mode,
                savedAt: Date.now(),
                history: JSON.parse(JSON.stringify(history))
            };

            if (isGroupMode) {
                entry.groupId = groupId;
                if (mode === 'group') {
                    entry.charKey = charKey;
                    entry.charName = charName;
                }
            } else {
                entry.charKey = charKey;
                entry.charName = charName;
            }

            // ── State snapshots (solo modes only) ──────────────────────────────────
            if (!isGroupMode) {
                if (mode === 'tethered') {
                    const emotionState = api.getEmotionState ? api.getEmotionState() : null;
                    entry.emotionSnapshot = emotionState ? JSON.parse(JSON.stringify(emotionState)) : null;
                } else {
                    // Read from the per-character untetheredInfluence slot (current format).
                    // NOTE: The old flat settings.untetheredMood/Personality/CommStyle keys are
                    // no longer used — untethered-chat.js now stores per-character state in
                    // settings.untetheredInfluence[charKey].
                    const s = settings();
                    const slot = (s.untetheredInfluence && charKey && s.untetheredInfluence[charKey]) || {};
                    entry.untetheredSnapshot = {
                        mood:                 slot.mood                ?? null,
                        moodInfluence:        slot.moodInfluence       ?? 50,
                        personality:          slot.personality         ?? null,
                        personalityInfluence: slot.personalityInfluence ?? 50,
                        commStyle:            slot.commStyle           ?? null,
                    };
                }
            }

            // Group emotion snapshot for all members
            if (api.isGroupSession && api.isGroupSession() && api.captureGroupSnapshot) {
                entry.groupSnapshot = api.captureGroupSnapshot();
            }

            return entry;
        }

        // ============================================================
        // CRUD
        // ============================================================

        function saveCurrentChat(name) {
            const modeKey = getModeKey();
            const isGroupMode = (modeKey === 'group' || modeKey === 'group_combine');

            if (!isGroupMode && !api.getCharacterKey()) return null;
            if (isGroupMode && !(api.getCurrentGroupId && api.getCurrentGroupId())) return null;

            const entry = buildSaveEntry(name);
            const store = getStore();
            store[modeKey][entry.id] = entry;
            api.saveSettings();
            return entry;
        }

        function loadSave(saveId) {
            const store = getStore();
            const modeKey = getModeKey();
            const entry = store[modeKey][saveId];
            if (!entry) return;

            api.saveChatHistory(entry.history || []);

            const s = settings();

            if (entry.mode === 'tethered' && entry.emotionSnapshot && entry.charKey) {
                if (!s.emotionState) s.emotionState = {};
                s.emotionState[entry.charKey] = JSON.parse(JSON.stringify(entry.emotionSnapshot));
                api.saveSettings();

            } else if (entry.mode === 'untethered' && entry.untetheredSnapshot) {
                // Restore to the per-character untetheredInfluence slot (current format).
                const charKey = entry.charKey || api.getCharacterKey();
                if (charKey) {
                    if (!s.untetheredInfluence || typeof s.untetheredInfluence !== 'object') {
                        s.untetheredInfluence = {};
                    }
                    const snap = entry.untetheredSnapshot;
                    s.untetheredInfluence[charKey] = {
                        mood:                 snap.mood                ?? null,
                        moodInfluence:        snap.moodInfluence       ?? 50,
                        personality:          snap.personality         ?? null,
                        personalityInfluence: snap.personalityInfluence ?? 50,
                        commStyle:            snap.commStyle           ?? null,
                    };
                    api.saveSettings();
                    // Refresh the panel status row so influence chips update immediately.
                    if (api.onUntetheredRestored) api.onUntetheredRestored();
                }
            }

            // Restore group snapshot for all members if present
            if (entry.groupSnapshot && api.restoreGroupSnapshot) {
                api.restoreGroupSnapshot(entry.groupSnapshot);
                api.saveSettings();
            }

            api.renderMessages(entry.history || []);
            closeSaveLoadModal();
        }

        function renameSave(saveId, newName) {
            const store = getStore();
            const modeKey = getModeKey();
            if (store[modeKey][saveId]) {
                store[modeKey][saveId].name = newName;
                api.saveSettings();
            }
        }

        function deleteSave(saveId) {
            const store = getStore();
            const modeKey = getModeKey();
            delete store[modeKey][saveId];
            api.saveSettings();
        }

        function exportSave(saveId) {
            const store = getStore();
            const modeKey = getModeKey();
            const save = store[modeKey][saveId];
            if (!save) return;

            const name = save.name || 'Chat';
            let markdown = `# ${name}\n\n`;
            
            // Resolve live persona name (same logic as buildPreviewHtml).
            const _ctx = (typeof SillyTavern !== 'undefined' && SillyTavern.getContext) ? SillyTavern.getContext() : {};
            const subUser = _ctx.name1
                || (typeof window.substituteParams === 'function' ? window.substituteParams('{{user}}') : null)
                || window.name1
                || 'User';
            const subChar = typeof window.substituteParams === 'function' ? window.substituteParams('{{char}}') : (window.name2 || 'Char');

            (save.history || []).forEach(m => {
                // For user messages: use the live persona name so {{user}} macros resolve correctly.
                // m.name is stale (baked at save time) and may be the literal "User" default.
                const sender = m.is_user
                    ? (subUser || m.name || 'User')
                    : (m.name || m.charName || save.charName || save.name || subChar);
                markdown += `**${sender}:**\n${m.mes || ''}\n\n`;
            });

            const blob = new Blob([markdown], { type: 'text/markdown' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.md`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }

        // ============================================================
        // HTML HELPERS
        // ============================================================

        function escapeHtml(str) {
            if (!str) return '';
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        function miniMarkdown(str) {
            if (!str) return '';
            let s = escapeHtml(str);
            s = s.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
            s = s.replace(/\*(.*?)\*/g, '<em>$1</em>');
            s = s.replace(/__(.*?)__/g, '<u>$1</u>');
            s = s.replace(/_(.*?)_/g, '<em>$1</em>');
            s = s.replace(/~~(.*?)~~/g, '<del>$1</del>');
            s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
            return s;
        }

        /**
         * Resolves the dominant Plutchik emotion from a snapshot object.
         * Returns { emotion, value } or null.
         */
        function getDominantEmotion(snapshot) {
            if (!snapshot) return null;
            let best = null, bestVal = -1;
            for (const e of EMOTIONS) {
                const v = typeof snapshot[e.id] === 'number' ? snapshot[e.id] : 0;
                if (v > bestVal) { bestVal = v; best = e; }
            }
            return best ? { emotion: best, value: bestVal } : null;
        }

        /**
         * Builds a small DOM-inline chip showing the dominant emotion icon.
         * Used in the left-pane save list items.
         */
        function buildDominantEmoChip(snapshot) {
            const dom = getDominantEmotion(snapshot);
            if (!dom) return '';
            const { emotion, value } = dom;
            return `<span class="et-sl-item-chip et-sl-item-chip-emo" style="color:${emotion.color};border-color:${emotion.color}33;background:${emotion.color}14" title="${emotion.label} \u2014 ${Math.round(value)}%"><i class="${emotion.icon}"></i></span>`;
        }

        // ============================================================
        // HTML BUILDERS — LEFT PANE (SAVE LIST)
        // ============================================================

        function buildSaveListHtml(saves, selectedId) {
            if (!saves || saves.length === 0) {
                return `<div class="et-sl-empty"><i class="fa-solid fa-box-open"></i><p>No saved chats yet.<br>Save the current chat to get started.</p></div>`;
            }
            return saves.map(s => {
                const msgCount = (s.history || []).length;
                const msgChip = `<span class="et-sl-item-chip" title="${msgCount} messages"><i class="fa-solid fa-message"></i> ${msgCount}</span>`;

                let modeChip = '';
                if (s.mode === 'tethered' && s.emotionSnapshot) {
                    modeChip = buildDominantEmoChip(s.emotionSnapshot);
                } else if (s.mode === 'untethered' && s.untetheredSnapshot && s.untetheredSnapshot.mood) {
                    const meta = getUCMeta('mood', s.untetheredSnapshot.mood);
                    modeChip = `<span class="et-sl-item-chip et-sl-item-chip-emo" style="color:${meta.color};border-color:${meta.color}33;background:${meta.color}14" title="Mood: ${meta.label}"><i class="${meta.icon}"></i></span>`;
                } else if ((s.mode === 'group' || s.mode === 'group_combine') && s.groupSnapshot) {
                    const count = Object.keys(s.groupSnapshot).length;
                    modeChip = `<span class="et-sl-item-chip" title="${count} group members"><i class="fa-solid fa-users"></i> ${count}</span>`;
                }

                return `
            <div class="et-sl-item${s.id === selectedId ? ' et-sl-item-selected' : ''}" data-save-id="${s.id}">
                <div class="et-sl-item-main">
                    <div class="et-sl-item-name" data-save-id="${s.id}" title="Click to rename">${escapeHtml(s.name)}</div>
                    <div class="et-sl-item-meta-row">
                        <div class="et-sl-item-time">${formatDate(s.savedAt)}</div>
                        <div class="et-sl-item-chips">${msgChip}${modeChip}</div>
                    </div>
                </div>
                <div class="et-sl-item-actions">
                    <button class="et-sl-del-btn" data-save-id="${s.id}" title="Delete this save"><i class="fa-solid fa-trash-can"></i></button>
                </div>
            </div>`;
            }).join('');
        }

        // ============================================================
        // HTML BUILDERS — RIGHT PANE (PREVIEW)
        // ============================================================


        function buildPreviewContent(save) {
// ── Messages ───────────────────────────────────────────────────────────
            const msgs = (save.history || []).slice(-5);
            // Resolve the live persona name from context (most reliable source).
            // SillyTavern stores the active persona display name in context.name1,
            // which respects the {{user}} macro. We fall back through substituteParams
            // and window.name1 for compatibility.
            const _ctx = (typeof SillyTavern !== 'undefined' && SillyTavern.getContext) ? SillyTavern.getContext() : {};
            const subUser = _ctx.name1
                || (typeof window.substituteParams === 'function' ? window.substituteParams('{{user}}') : null)
                || window.name1
                || 'User';
            const subChar = typeof window.substituteParams === 'function' ? window.substituteParams('{{char}}') : (window.name2 || 'Char');

            const msgHtml = msgs.length === 0
                ? '<p class="et-sl-prev-nomsg">No messages</p>'
                : msgs.map(m => `
                <div class="et-sl-prev-msg${m.is_user ? ' et-sl-prev-user' : ' et-sl-prev-char'}">
                    <span class="et-sl-prev-sender">${escapeHtml(m.is_user ? (subUser || m.name || 'User') : (m.name || m.charName || save.charName || save.name || subChar))}</span>
                    <span class="et-sl-prev-text">${miniMarkdown(m.mes)}</span>
                </div>`).join('');

            // ── Metadata block ────────────────────────────────────────────────────
            let metaHtml = '';

            if (save.mode === 'tethered' && save.emotionSnapshot) {
                // Show all 9 Plutchik emotions sorted descending.
                const emo = save.emotionSnapshot;
                const sorted = EMOTIONS
                    .filter(e => typeof emo[e.id] === 'number')
                    .sort((a, b) => (emo[b.id] || 0) - (emo[a.id] || 0));
                const dominantId = sorted.length > 0 ? sorted[0].id : null;

                const emoRows = sorted.map(e => {
                    const val = Math.round(emo[e.id] || 0);
                    const intensityLabel = getIntensityLabel(e, val);
                    return `
                    <div class="et-sl-emo-row${e.id === dominantId ? ' et-sl-emo-dominant' : ''}">
                        <i class="${e.icon}" style="color:${e.color}"></i>
                        <span class="et-sl-emo-label">${e.label}</span>
                        <div class="et-sl-emo-track"><div class="et-sl-emo-fill" style="width:${val}%;background:${e.color}"></div></div>
                        <span class="et-sl-emo-intensity-label">${intensityLabel}</span>
                        <span class="et-sl-emo-pct">${val}%</span>
                    </div>`;
                }).join('');

                metaHtml = `
                <div class="et-sl-meta">
                    <div class="et-sl-meta-title"><i class="fa-solid fa-heart-pulse"></i> Emotional State at Save</div>
                    <div class="et-sl-emo-bars">${emoRows}</div>
                </div>`;

            } else if (save.mode === 'untethered' && save.untetheredSnapshot) {
                const us = save.untetheredSnapshot;
                const tags = [];

                if (us.mood) {
                    const meta = getUCMeta('mood', us.mood);
                    const inf = us.moodInfluence != null ? us.moodInfluence : 50;
                    tags.push(`
                    <div class="et-sl-uc-tag">
                        <div class="et-sl-uc-tag-header">
                            <i class="${meta.icon}" style="color:${meta.color}"></i>
                            <span class="et-sl-uc-tag-label">Mood</span>
                            <span class="et-sl-uc-tag-value" style="color:${meta.color}">${escapeHtml(meta.label)}</span>
                        </div>
                        <div class="et-sl-uc-inf-track"><div class="et-sl-uc-inf-fill" style="width:${inf}%;background:${meta.color}"></div><span class="et-sl-uc-inf-pct">${inf}%</span></div>
                    </div>`);
                }

                if (us.personality) {
                    const meta = getUCMeta('personality', us.personality);
                    const inf = us.personalityInfluence != null ? us.personalityInfluence : 50;
                    tags.push(`
                    <div class="et-sl-uc-tag">
                        <div class="et-sl-uc-tag-header">
                            <i class="${meta.icon}" style="color:${meta.color}"></i>
                            <span class="et-sl-uc-tag-label">Personality</span>
                            <span class="et-sl-uc-tag-value" style="color:${meta.color}">${escapeHtml(meta.label)}</span>
                        </div>
                        <div class="et-sl-uc-inf-track"><div class="et-sl-uc-inf-fill" style="width:${inf}%;background:${meta.color}"></div><span class="et-sl-uc-inf-pct">${inf}%</span></div>
                    </div>`);
                }

                if (us.commStyle) {
                    const meta = getUCMeta('commStyle', us.commStyle);
                    tags.push(`
                    <div class="et-sl-uc-tag">
                        <div class="et-sl-uc-tag-header">
                            <i class="${meta.icon}" style="color:${meta.color}"></i>
                            <span class="et-sl-uc-tag-label">Voice</span>
                            <span class="et-sl-uc-tag-value" style="color:${meta.color}">${escapeHtml(meta.label)}</span>
                        </div>
                    </div>`);
                }

                metaHtml = `
                <div class="et-sl-meta">
                    <div class="et-sl-meta-title"><i class="fa-solid fa-link-slash"></i> Chat Influence at Save</div>
                    ${tags.length > 0
                        ? `<div class="et-sl-uc-tags">${tags.join('')}</div>`
                        : '<span class="et-sl-tag-none">No influence set</span>'}
                </div>`;

            } else if ((save.mode === 'group' || save.mode === 'group_combine') && save.groupSnapshot) {
                const memberCount = Object.keys(save.groupSnapshot).length;

                const memberChips = Object.entries(save.groupSnapshot).map(([, data]) => {
                    const name = data.charName || 'Unknown';
                    const initial = name.charAt(0).toUpperCase();
                    let emoHtml = '';
                    const dom = getDominantEmotion(data.emotionSnapshot);
                    if (dom) {
                        const label = getIntensityLabel(dom.emotion, dom.value);
                        emoHtml = `<span class="et-sl-member-emo-chip" style="color:${dom.emotion.color}" title="${dom.emotion.label} \u2014 ${label}"><i class="${dom.emotion.icon}"></i> ${label}</span>`;
                    }
                    return `
                    <div class="et-sl-member-chip">
                        <div class="et-sl-member-avatar">${initial}</div>
                        <span class="et-sl-member-name">${escapeHtml(name)}</span>
                        ${emoHtml}
                    </div>`;
                }).join('');

                metaHtml = `
                <div class="et-sl-meta">
                    <div class="et-sl-meta-title">
                        <i class="fa-solid ${save.mode === 'group_combine' ? 'fa-layer-group' : 'fa-users'}"></i>
                        ${save.mode === 'group_combine' ? 'Combined Group Session' : 'Group Session'} &mdash; ${memberCount} member${memberCount !== 1 ? 's' : ''}
                    </div>
                    <div class="et-sl-member-chips">${memberChips}</div>
                </div>`;
            }
            return `
                <div class="et-sl-prev-msgs">${msgHtml}</div>
                ${metaHtml}
            `;
        }


        function buildMobileCarouselHtml(saves) {
            if (!saves || saves.length === 0) {
                return `<div class="et-sl-empty" style="width:100%"><i class="fa-solid fa-box-open"></i><p>No saved chats yet.<br>Save the current chat to get started.</p></div>`;
            }
            return saves.map(save => `
                <div class="et-sl-mobile-card" data-save-id="${save.id}">
                    <div class="et-sl-mobile-card-header">
                        <div class="et-sl-mobile-card-title-row">
                            <div class="et-sl-item-name et-sl-mobile-card-name" data-save-id="${save.id}" title="Click to rename">${escapeHtml(save.name)}</div>
                            <button class="et-sl-del-btn" data-save-id="${save.id}"><i class="fa-solid fa-trash-can"></i></button>
                        </div>
                        <div class="et-sl-preview-msgcount" style="margin-top: 4px;">${formatDate(save.savedAt)} &bull; ${(save.history || []).length} msg${(save.history || []).length !== 1 ? 's' : ''}</div>
                    </div>
                    <div class="et-sl-mobile-card-body">
                        ${buildPreviewContent(save)}
                    </div>
                    <div class="et-sl-mobile-card-footer">
                        <button class="et-sl-preview-load-btn" data-save-id="${save.id}">
                            <i class="fa-solid fa-upload"></i> Load Chat
                        </button>
                        <button class="et-sl-preview-export-btn" data-save-id="${save.id}">
                            <i class="fa-solid fa-download"></i> Export
                        </button>
                    </div>
                </div>
            `).join('');
        }

        function buildPreviewHtml(save) {
            if (!save) {
                return `<div class="et-sl-preview-empty"><i class="fa-solid fa-arrow-left"></i><p>Select a save to preview</p></div>`;
            }

            
            return `
            <div class="et-sl-preview">
                <div class="et-sl-preview-header">
                    <span class="et-sl-preview-name">${escapeHtml(save.name)}</span>
                    <span class="et-sl-preview-msgcount">${(save.history || []).length} msg${(save.history || []).length !== 1 ? 's' : ''}</span>
                </div>
                ${buildPreviewContent(save)}
                <div class="et-sl-preview-load-wrap">
                    <button class="et-sl-preview-load-btn" data-save-id="${save.id}">
                        <i class="fa-solid fa-upload"></i> Load This Chat
                    </button>
                    <button class="et-sl-preview-export-btn" data-save-id="${save.id}">
                        <i class="fa-solid fa-download"></i> Export Chat
                    </button>
                </div>
            </div>`;
        }

        function buildModalHtml() {
            const inGroup = api.isGroupSession && api.isGroupSession();
            const inCombine = inGroup && api.isCombineMode && api.isCombineMode();
            let modeIcon, modeLabel, modeCssKey;

            if (inCombine) {
                modeIcon = 'fa-layer-group'; modeLabel = 'Group Combined'; modeCssKey = 'group_combine';
            } else if (inGroup) {
                modeIcon = 'fa-users'; modeLabel = 'Group Chat'; modeCssKey = 'group';
            } else if (api.isTetheredMode()) {
                modeIcon = 'fa-link'; modeLabel = 'Tethered'; modeCssKey = 'tethered';
            } else {
                modeIcon = 'fa-link-slash'; modeLabel = 'Untethered'; modeCssKey = 'untethered';
            }

            const charName = inCombine ? 'Group' : (api.getCharacterName() || 'Chat');
            const datePart = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
            const defaultSaveName = inCombine ? `Combined \u2014 ${datePart}` : `${charName} \u2014 ${datePart}`;
            const saves = getSavesForCurrentMode();

            return `
            <div id="et-sl-overlay" class="et-sl-overlay">
                <div class="et-sl-modal" id="et-sl-modal">
                    <div class="et-sl-header">
                        <div class="et-sl-header-title">
                            <i class="fa-solid fa-floppy-disk" style="color:var(--et-theme-color)"></i>
                            Chat Archives
                            <span class="et-sl-mode-badge et-sl-mode-${modeCssKey}">
                                <i class="fa-solid ${modeIcon}"></i> ${modeLabel}
                            </span>
                        </div>
                        <button class="et-sl-close-btn" id="et-sl-close-btn" title="Close"><i class="fa-solid fa-xmark"></i></button>
                    </div>

                    <div class="et-sl-save-bar">
                        <input class="et-sl-name-input" id="et-sl-name-input" type="text" placeholder="Save name\u2026" value="${escapeHtml(defaultSaveName)}" maxlength="80" />
                        <button class="et-sl-save-cta" id="et-sl-save-cta" title="Save current chat">
                            <i class="fa-solid fa-floppy-disk"></i> Save Current Chat
                        </button>
                    </div>

                    <div class="et-sl-body">
                        <div class="et-sl-list" id="et-sl-list">
                            ${buildSaveListHtml(saves, null)}
                        </div>
                        <div class="et-sl-right" id="et-sl-right">
                            ${buildPreviewHtml(null)}
                        </div>
                        <div class="et-sl-mobile-carousel" id="et-sl-mobile-carousel">
                            ${buildMobileCarouselHtml(saves)}
                        </div>
                    </div>
                </div>
            </div>`;
        }

        // ============================================================
        // OPEN / CLOSE
        // ============================================================

        function openSaveLoadModal() {
            jQuery('#et-sl-overlay').remove();
            jQuery('body').append(buildModalHtml());
            requestAnimationFrame(() => jQuery('#et-sl-overlay').addClass('et-sl-overlay-open'));
            bindModalEvents();
        }

        function closeSaveLoadModal() {
            const overlay = jQuery('#et-sl-overlay');
            overlay.removeClass('et-sl-overlay-open').addClass('et-sl-overlay-closing');
            setTimeout(() => overlay.remove(), 220);
        }

        // ============================================================
        // EVENTS
        // ============================================================

        function refreshList(selectedId) {
            const saves = getSavesForCurrentMode();
            jQuery('#et-sl-list').html(buildSaveListHtml(saves, selectedId));
            jQuery('#et-sl-mobile-carousel').html(buildMobileCarouselHtml(saves));
            rebindListEvents(selectedId);
        }

        function showPreviewFor(saveId) {
            const store = getStore();
            const modeKey = getModeKey();
            const save = store[modeKey][saveId] || null;
            jQuery('#et-sl-right').html(buildPreviewHtml(save));
            if (save) {
                jQuery('#et-sl-right').off('click', '.et-sl-preview-load-btn').on('click', '.et-sl-preview-load-btn', function () {
                    loadSave(jQuery(this).data('save-id'));
                });
                jQuery('#et-sl-right').off('click', '.et-sl-preview-export-btn').on('click', '.et-sl-preview-export-btn', function () {
                    exportSave(jQuery(this).data('save-id'));
                });
                jQuery('#et-sl-right').off('click', '.et-sl-prev-msg').on('click', '.et-sl-prev-msg', function () {
                    jQuery(this).toggleClass('et-sl-expanded');
                });
                
                // Detect overflows and add indicator class
                setTimeout(() => {
                    jQuery('#et-sl-right').find('.et-sl-prev-text').each(function() {
                        if (this.scrollHeight > this.clientHeight) {
                            jQuery(this).closest('.et-sl-prev-msg').addClass('et-sl-is-overflowing');
                        }
                    });
                }, 15);
            }
        }

        function rebindListEvents(selectedId) {
            // Prevent duplicate bindings on refresh
            jQuery('#et-sl-list, #et-sl-mobile-carousel').off('click');

            // Delete button (two-click confirm)
            jQuery('#et-sl-list, #et-sl-mobile-carousel').on('click', '.et-sl-del-btn', function (e) {
                e.stopPropagation();
                const id = jQuery(this).data('save-id');
                if (!id) return;
                const btn = jQuery(this);
                if (btn.hasClass('et-sl-del-confirm')) {
                    deleteSave(id);
                    if (selectedId === id) jQuery('#et-sl-right').html(buildPreviewHtml(null));
                    refreshList(selectedId === id ? null : selectedId);
                    return;
                }
                
                // Clear any other active confirms
                jQuery('.et-sl-del-confirm').removeClass('et-sl-del-confirm').html('<i class="fa-solid fa-trash-can"></i>');
                
                // Morph to confirm state
                btn.addClass('et-sl-del-confirm');
                btn.html(`<span>Delete?</span><div class="et-sl-del-progress"></div>`);
                
                const reset = () => {
                    if (btn.hasClass('et-sl-del-confirm')) {
                        btn.removeClass('et-sl-del-confirm').html('<i class="fa-solid fa-trash-can"></i>');
                    }
                };
                
                const timer = setTimeout(reset, 3000);
                
                // Clicking anywhere else clears the confirm
                jQuery(document).one('click.et-sl-del', function(ev) {
                    if (!jQuery(ev.target).closest(btn).length) {
                        clearTimeout(timer);
                        reset();
                    }
                });
            });

            // Click item to select and preview
            jQuery('#et-sl-list').on('click', '.et-sl-item', function (e) {
                if (jQuery(e.target).is('button, button *')) return;
                const id = jQuery(this).data('save-id');
                if (!id) return;
                jQuery('.et-sl-item').removeClass('et-sl-item-selected');
                jQuery(this).addClass('et-sl-item-selected');
                showPreviewFor(id);
            });

            // Inline rename: click name
            jQuery('#et-sl-list, #et-sl-mobile-carousel').on('click', '.et-sl-item-name', function (e) {
                e.stopPropagation();
                const id = jQuery(this).data('save-id');
                if (!id) return;
                const nameEl = jQuery(this);
                const currentName = nameEl.text();
                const parent = nameEl.parent();
                const extraClass = nameEl.hasClass('et-sl-mobile-card-name') ? ' et-sl-mobile-card-name' : '';
                nameEl.replaceWith(`<input class="et-sl-rename-input" value="${escapeHtml(currentName)}" maxlength="80" />`);
                const input = parent.find('.et-sl-rename-input');
                input.focus().select();
                const commit = () => {
                    const newName = input.val().trim() || currentName;
                    renameSave(id, newName);
                    input.replaceWith(`<div class="et-sl-item-name${extraClass}" data-save-id="${id}" title="Click to rename">${escapeHtml(newName)}</div>`);
                };
                input.on('blur', commit);
                input.on('keydown', (ev) => {
                    if (ev.key === 'Enter') { ev.preventDefault(); commit(); }
                    if (ev.key === 'Escape') { input.replaceWith(`<div class="et-sl-item-name${extraClass}" data-save-id="${id}" title="Click to rename">${escapeHtml(currentName)}</div>`); }
                });
            });

            // Carousel specific actions
            jQuery('#et-sl-mobile-carousel').on('click', '.et-sl-preview-load-btn', function () {
                loadSave(jQuery(this).data('save-id'));
            });
            jQuery('#et-sl-mobile-carousel').on('click', '.et-sl-preview-export-btn', function () {
                exportSave(jQuery(this).data('save-id'));
            });
            jQuery('#et-sl-mobile-carousel').on('click', '.et-sl-prev-msg', function () {
                jQuery(this).toggleClass('et-sl-expanded');
            });
            setTimeout(() => {
                jQuery('#et-sl-mobile-carousel').find('.et-sl-prev-text').each(function() {
                    if (this.scrollHeight > this.clientHeight) {
                        jQuery(this).closest('.et-sl-prev-msg').addClass('et-sl-is-overflowing');
                    }
                });
            }, 15);
        }

        function bindModalEvents() {
            jQuery('#et-sl-close-btn').on('click', closeSaveLoadModal);

            jQuery('#et-sl-overlay').on('click', function (e) {
                if (e.target === this) closeSaveLoadModal();
            });

            const onKey = (e) => {
                if (e.key === 'Escape') {
                    document.removeEventListener('keydown', onKey);
                    closeSaveLoadModal();
                }
            };
            document.addEventListener('keydown', onKey);

            jQuery('#et-sl-save-cta').on('click', function () {
                const name = jQuery('#et-sl-name-input').val().trim();
                const saved = saveCurrentChat(name);
                if (!saved) return;
                jQuery(this).html('<i class="fa-solid fa-check"></i> Saved!').addClass('et-sl-saved-flash');
                setTimeout(() => jQuery('#et-sl-save-cta').html('<i class="fa-solid fa-floppy-disk"></i> Save Current Chat').removeClass('et-sl-saved-flash'), 1800);
                refreshList(saved.id);
                showPreviewFor(saved.id);
            });

            rebindListEvents(null);
        }

        // ============================================================
        // PUBLIC API
        // ============================================================

        return { openSaveLoadModal };
    }

    window.EchoTextSaveLoadModal = { createSaveLoadModal };
})();
