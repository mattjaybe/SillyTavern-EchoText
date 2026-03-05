(function () {
    'use strict';

    /**
     * EchoText Save/Load Chat Modal
     * Provides save, load, rename, and delete for both Tethered and Untethered chat sessions.
     * Exposes: window.EchoTextSaveLoadModal.createSaveLoadModal(api)
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

        // ============================================================
        // STATE HELPERS
        // ============================================================

        function getStore() {
            const s = settings();
            if (!s.savedChats) s.savedChats = { tethered: {}, untethered: {} };
            if (!s.savedChats.tethered) s.savedChats.tethered = {};
            if (!s.savedChats.untethered) s.savedChats.untethered = {};
            return s.savedChats;
        }

        function getModeKey() {
            return api.isTetheredMode() ? 'tethered' : 'untethered';
        }

        function getSavesForCurrentMode() {
            const store = getStore();
            const modeKey = getModeKey();
            const charKey = api.getCharacterKey();
            if (!charKey) return [];
            return Object.values(store[modeKey])
                .filter(s => s.charKey === charKey)
                .sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
        }

        function buildSaveEntry(name) {
            const charKey = api.getCharacterKey();
            const charName = api.getCharacterName();
            const mode = getModeKey();
            const history = api.getChatHistory();
            const entry = {
                id: genId(),
                name: name || `${charName} — ${formatDate(Date.now())}`,
                charKey,
                charName,
                mode,
                savedAt: Date.now(),
                history: JSON.parse(JSON.stringify(history))
            };
            if (mode === 'tethered') {
                const emotionState = api.getEmotionState ? api.getEmotionState() : null;
                entry.emotionSnapshot = emotionState ? JSON.parse(JSON.stringify(emotionState)) : null;
            } else {
                const s = settings();
                entry.untetheredSnapshot = {
                    mood: s.untetheredMood || null,
                    personality: s.untetheredPersonality || null,
                    commStyle: s.untetheredCommStyle || null
                };
            }
            // Capture group state for all members if in a group session
            if (api.isGroupSession && api.isGroupSession() && api.captureGroupSnapshot) {
                entry.groupSnapshot = api.captureGroupSnapshot();
            }
            return entry;
        }

        // ============================================================
        // CRUD
        // ============================================================

        function saveCurrentChat(name) {
            const charKey = api.getCharacterKey();
            if (!charKey) return null;
            const entry = buildSaveEntry(name);
            const store = getStore();
            store[getModeKey()][entry.id] = entry;
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
            if (entry.mode === 'tethered' && entry.emotionSnapshot) {
                if (!s.emotionState) s.emotionState = {};
                s.emotionState[entry.charKey] = JSON.parse(JSON.stringify(entry.emotionSnapshot));
                api.saveSettings();
            } else if (entry.mode === 'untethered' && entry.untetheredSnapshot) {
                s.untetheredMood = entry.untetheredSnapshot.mood;
                s.untetheredPersonality = entry.untetheredSnapshot.personality;
                s.untetheredCommStyle = entry.untetheredSnapshot.commStyle;
                api.saveSettings();
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

        // ============================================================
        // HTML BUILDERS
        // ============================================================

        function buildSaveListHtml(saves, selectedId) {
            if (!saves || saves.length === 0) {
                return `<div class="et-sl-empty"><i class="fa-solid fa-box-open"></i><p>No saved chats yet.<br>Save the current chat to get started.</p></div>`;
            }
            return saves.map(s => `
            <div class="et-sl-item${s.id === selectedId ? ' et-sl-item-selected' : ''}" data-save-id="${s.id}">
                <div class="et-sl-item-main">
                    <div class="et-sl-item-name" data-save-id="${s.id}" title="Click to rename">${escapeHtml(s.name)}</div>
                    <div class="et-sl-item-time">${formatDate(s.savedAt)}</div>
                </div>
                <div class="et-sl-item-actions">
                    <button class="et-sl-load-btn" data-save-id="${s.id}" title="Load this chat"><i class="fa-solid fa-upload"></i></button>
                    <button class="et-sl-del-btn" data-save-id="${s.id}" title="Delete this save"><i class="fa-solid fa-trash-can"></i></button>
                </div>
            </div>`).join('');
        }

        function buildPreviewHtml(save) {
            if (!save) {
                return `<div class="et-sl-preview-empty"><i class="fa-solid fa-arrow-left"></i><p>Select a save to preview</p></div>`;
            }

            const msgs = (save.history || []).slice(-5);
            const msgHtml = msgs.length === 0
                ? '<p class="et-sl-prev-nomsg">No messages</p>'
                : msgs.map(m => `
                <div class="et-sl-prev-msg${m.is_user ? ' et-sl-prev-user' : ' et-sl-prev-char'}">
                    <span class="et-sl-prev-sender">${m.is_user ? 'You' : escapeHtml(save.charName || 'Char')}</span>
                    <span class="et-sl-prev-text">${escapeHtml((m.mes || '').substring(0, 120))}${(m.mes || '').length > 120 ? '…' : ''}</span>
                </div>`).join('');

            let metaHtml = '';
            if (save.mode === 'tethered' && save.emotionSnapshot) {
                const emo = save.emotionSnapshot;
                const emotions = [
                    { id: 'joy', label: 'Joy', color: '#facc15', icon: 'fa-sun' },
                    { id: 'trust', label: 'Trust', color: '#4ade80', icon: 'fa-handshake' },
                    { id: 'fear', label: 'Fear', color: '#a78bfa', icon: 'fa-ghost' },
                    { id: 'sadness', label: 'Sadness', color: '#60a5fa', icon: 'fa-cloud-rain' },
                    { id: 'anger', label: 'Anger', color: '#f87171', icon: 'fa-fire-flame-curved' },
                    { id: 'anticipation', label: 'Anticipation', color: '#fb923c', icon: 'fa-forward' }
                ];
                const top3 = emotions
                    .filter(e => typeof emo[e.id] === 'number')
                    .sort((a, b) => (emo[b.id] || 0) - (emo[a.id] || 0))
                    .slice(0, 3);
                metaHtml = `
                <div class="et-sl-meta">
                    <div class="et-sl-meta-title"><i class="fa-solid fa-heart-pulse"></i> Emotional State at Save</div>
                    <div class="et-sl-emo-bars">
                        ${top3.map(e => `
                        <div class="et-sl-emo-row">
                            <i class="fa-solid ${e.icon}" style="color:${e.color}"></i>
                            <span class="et-sl-emo-label">${e.label}</span>
                            <div class="et-sl-emo-track"><div class="et-sl-emo-fill" style="width:${Math.round(emo[e.id] || 0)}%;background:${e.color}"></div></div>
                            <span class="et-sl-emo-pct">${Math.round(emo[e.id] || 0)}%</span>
                        </div>`).join('')}
                    </div>
                    ${emo.mbtiType ? `<div class="et-sl-meta-badge"><i class="fa-solid fa-brain"></i> ${emo.mbtiType}</div>` : ''}
                </div>`;
            } else if (save.mode === 'untethered' && save.untetheredSnapshot) {
                const us = save.untetheredSnapshot;
                metaHtml = `
                <div class="et-sl-meta">
                    <div class="et-sl-meta-title"><i class="fa-solid fa-link-slash"></i> Chat Influence at Save</div>
                    <div class="et-sl-tags">
                        ${us.mood ? `<span class="et-sl-tag et-sl-tag-mood"><i class="fa-solid fa-face-smile"></i> ${escapeHtml(us.mood)}</span>` : ''}
                        ${us.personality ? `<span class="et-sl-tag et-sl-tag-persona"><i class="fa-solid fa-masks-theater"></i> ${escapeHtml(us.personality)}</span>` : ''}
                        ${us.commStyle ? `<span class="et-sl-tag et-sl-tag-style"><i class="fa-solid fa-comment-dots"></i> ${escapeHtml(us.commStyle)}</span>` : ''}
                        ${!us.mood && !us.personality && !us.commStyle ? '<span class="et-sl-tag-none">No influence set</span>' : ''}
                    </div>
                </div>`;
            }

            return `
            <div class="et-sl-preview">
                <div class="et-sl-preview-header">
                    <span class="et-sl-preview-name">${escapeHtml(save.name)}</span>
                    <span class="et-sl-preview-msgcount">${(save.history || []).length} msg${(save.history || []).length !== 1 ? 's' : ''}</span>
                    ${save.groupSnapshot ? `<span class="et-sl-group-badge" title="Group session snapshot"><i class="fa-solid fa-users"></i> ${Object.keys(save.groupSnapshot).length} members</span>` : ''}
                </div>
                <div class="et-sl-prev-msgs">${msgHtml}</div>
                ${metaHtml}
            </div>`;
        }

        function buildModalHtml() {
            const mode = api.isTetheredMode() ? 'tethered' : 'untethered';
            const modeLabel = mode === 'tethered' ? 'Tethered' : 'Untethered';
            const modeIcon = mode === 'tethered' ? 'fa-link' : 'fa-link-slash';
            const charName = api.getCharacterName() || 'Chat';
            const defaultSaveName = `${charName} — ${new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
            const saves = getSavesForCurrentMode();

            return `
            <div id="et-sl-overlay" class="et-sl-overlay">
                <div class="et-sl-modal" id="et-sl-modal">
                    <div class="et-sl-header">
                        <div class="et-sl-header-title">
                            <i class="fa-solid fa-floppy-disk" style="color:var(--et-theme-color)"></i>
                            Chat Archives
                            <span class="et-sl-mode-badge et-sl-mode-${mode}">
                                <i class="fa-solid ${modeIcon}"></i> ${modeLabel}
                            </span>
                        </div>
                        <button class="et-sl-close-btn" id="et-sl-close-btn" title="Close"><i class="fa-solid fa-xmark"></i></button>
                    </div>

                    <div class="et-sl-save-bar">
                        <input class="et-sl-name-input" id="et-sl-name-input" type="text" placeholder="Save name…" value="${escapeHtml(defaultSaveName)}" maxlength="80" />
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
                    </div>
                </div>
            </div>`;
        }

        function escapeHtml(str) {
            if (!str) return '';
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
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
            rebindListEvents(selectedId);
        }

        function rebindListEvents(selectedId) {
            // Load button (2-click confirm)
            jQuery('#et-sl-list').on('click', '.et-sl-load-btn', function (e) {
                e.stopPropagation();
                const id = jQuery(this).data('save-id');
                if (!id) return;
                jQuery('.et-sl-item').removeClass('et-sl-item-selected');
                jQuery(`.et-sl-item[data-save-id="${id}"]`).addClass('et-sl-item-selected');
                const btn = jQuery(this);
                if (btn.hasClass('et-sl-load-confirm-state')) {
                    loadSave(id);
                    return;
                }
                btn.addClass('et-sl-load-confirm-state').text('Confirm?');
                setTimeout(() => btn.removeClass('et-sl-load-confirm-state').html('<i class="fa-solid fa-upload"></i>'), 2200);
            });

            // Delete button (two-click)
            jQuery('#et-sl-list').on('click', '.et-sl-del-btn', function (e) {
                e.stopPropagation();
                const id = jQuery(this).data('save-id');
                if (!id) return;
                const btn = jQuery(this);
                if (btn.hasClass('et-sl-del-confirm')) {
                    deleteSave(id);
                    // If selected was deleted, clear preview
                    if (selectedId === id) jQuery('#et-sl-right').html(buildPreviewHtml(null));
                    refreshList(selectedId === id ? null : selectedId);
                    return;
                }
                btn.addClass('et-sl-del-confirm');
                setTimeout(() => btn.removeClass('et-sl-del-confirm'), 2200);
            });

            // Click item to preview
            jQuery('#et-sl-list').on('click', '.et-sl-item', function (e) {
                if (jQuery(e.target).is('button, button *')) return;
                const id = jQuery(this).data('save-id');
                if (!id) return;
                jQuery('.et-sl-item').removeClass('et-sl-item-selected');
                jQuery(this).addClass('et-sl-item-selected');
                const store = getStore();
                const save = store[getModeKey()][id];
                jQuery('#et-sl-right').html(buildPreviewHtml(save || null));
            });

            // Inline rename: click name
            jQuery('#et-sl-list').on('click', '.et-sl-item-name', function (e) {
                e.stopPropagation();
                const id = jQuery(this).data('save-id');
                if (!id) return;
                const nameEl = jQuery(this);
                const currentName = nameEl.text();
                const inputHtml = `<input class="et-sl-rename-input" value="${escapeHtml(currentName)}" maxlength="80" />`;
                nameEl.replaceWith(inputHtml);
                const input = jQuery(`.et-sl-item[data-save-id="${id}"] .et-sl-rename-input`);
                input.focus().select();

                const commit = () => {
                    const newName = input.val().trim() || currentName;
                    renameSave(id, newName);
                    input.replaceWith(`<div class="et-sl-item-name" data-save-id="${id}" title="Click to rename">${escapeHtml(newName)}</div>`);
                };
                input.on('blur', commit);
                input.on('keydown', (ev) => {
                    if (ev.key === 'Enter') { ev.preventDefault(); commit(); }
                    if (ev.key === 'Escape') { input.replaceWith(`<div class="et-sl-item-name" data-save-id="${id}" title="Click to rename">${escapeHtml(currentName)}</div>`); }
                });
            });
        }

        function bindModalEvents() {
            // Close button
            jQuery('#et-sl-close-btn').on('click', closeSaveLoadModal);

            // Overlay background click
            jQuery('#et-sl-overlay').on('click', function (e) {
                if (e.target === this) closeSaveLoadModal();
            });

            // Escape key
            const onKey = (e) => {
                if (e.key === 'Escape') {
                    document.removeEventListener('keydown', onKey);
                    closeSaveLoadModal();
                }
            };
            document.addEventListener('keydown', onKey);

            // Save CTA
            jQuery('#et-sl-save-cta').on('click', function () {
                const name = jQuery('#et-sl-name-input').val().trim();
                const saved = saveCurrentChat(name);
                if (!saved) return;
                jQuery(this).html('<i class="fa-solid fa-check"></i> Saved!').addClass('et-sl-saved-flash');
                setTimeout(() => jQuery('#et-sl-save-cta').html('<i class="fa-solid fa-floppy-disk"></i> Save Current Chat').removeClass('et-sl-saved-flash'), 1800);
                refreshList(saved.id);
                const store = getStore();
                jQuery('#et-sl-right').html(buildPreviewHtml(store[getModeKey()][saved.id]));
            });

            // Initial list events
            rebindListEvents(null);
        }

        // ============================================================
        // PUBLIC API
        // ============================================================

        return { openSaveLoadModal };
    }

    window.EchoTextSaveLoadModal = { createSaveLoadModal };
})();
