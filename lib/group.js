(function () {
    'use strict';

    /**
     * EchoText Group Manager
     * Handles group chat sessions: member resolution, group bar UI, active character switching,
     * independent group-scoped chat history, and combined (all-at-once) response mode.
     * Exposes: window.EchoTextGroupManager.createGroupManager(api)
     */
    function createGroupManager(api) {

        // The actively selected group member charKey (avatar filename)
        let _activeCharKey = null;

        // Set of charKeys that have unread proactive messages
        let _unreadCharKeys = new Set();

        // Override group ID — when non-null, EchoText uses this group instead of
        // context.groupId. Mirrors how selectedCharacterKey decouples individual
        // character selection from ST's active character.
        let _overrideGroupId = null;

        // Combine mode — when true, all characters reply in sequence to each message,
        // and history is stored in the group-level combine history rather than per-character.
        let _combineMode = false;

        // ============================================================
        // GROUP SESSION DETECTION
        // ============================================================

        /**
         * Returns true when EchoText is in a group session.
         * Checks _overrideGroupId first (EchoText-selected group), then falls back
         * to ST's active context.groupId.
         */
        function isGroupSession() {
            try {
                const context = SillyTavern.getContext();
                const groupId = _overrideGroupId != null ? _overrideGroupId : context.groupId;
                if (!groupId) return false;
                const group = (context.groups || []).find(g => g.id == groupId);
                return !!(group && Array.isArray(group.members) && group.members.length >= 2);
            } catch (e) {
                return false;
            }
        }

        /**
         * Returns the current group object or null.
         * Respects _overrideGroupId when set.
         */
        function getCurrentGroup() {
            try {
                const context = SillyTavern.getContext();
                const groupId = _overrideGroupId != null ? _overrideGroupId : context.groupId;
                if (!groupId) return null;
                return (context.groups || []).find(g => g.id == groupId) || null;
            } catch (e) {
                return null;
            }
        }

        /**
         * Returns the current group's ID string, or null.
         */
        function getCurrentGroupId() {
            const group = getCurrentGroup();
            return group ? String(group.id) : null;
        }

        /**
         * Sets the override group ID. Pass null to clear (fall back to ST's context.groupId).
         * Also resets combine mode when switching groups.
         */
        function setOverrideGroupId(id) {
            _overrideGroupId = id != null ? id : null;
            // Reset active char key so ensureActiveChar re-selects the first member
            _activeCharKey = null;
            // Reset combine mode when group changes
            _combineMode = false;
        }

        /**
         * Returns the current override group ID (or null if not set).
         */
        function getOverrideGroupId() {
            return _overrideGroupId;
        }

        /**
         * Resolves group.members (avatar filenames) to full character objects from context.characters.
         * Returns an array of character objects, preserving group order.
         */
        function getGroupMembers() {
            try {
                const group = getCurrentGroup();
                if (!group || !group.members) return [];
                const context = SillyTavern.getContext();
                const chars = context.characters || [];
                return group.members.map(avatarFile => {
                    return chars.find(c => c.avatar === avatarFile) || null;
                }).filter(Boolean);
            } catch (e) {
                return [];
            }
        }

        // ============================================================
        // COMBINE MODE
        // ============================================================

        /**
         * Returns true when combined response mode is active.
         * In this mode, all group members reply in sequence to each user message,
         * and a single shared history is maintained for the entire group.
         */
        function isCombineMode() {
            return _combineMode;
        }

        /**
         * Programmatically sets combine mode (true/false).
         */
        function setCombineMode(val) {
            _combineMode = !!val;
        }

        // ============================================================
        // GROUP-SCOPED CHAT HISTORY (per member, per group)
        // ============================================================
        //
        // When EchoText is in a group session, each character's chat history is stored
        // in settings.groupChatHistory[groupId][charKey] (tethered) or
        // settings.groupUntetheredHistory[groupId][charKey] (untethered).
        //
        // This is entirely separate from the individual (non-group) chat history in
        // settings.chatHistory[charKey] / settings.untetheredHistory[charKey],
        // so Amy in a group and Amy in a solo chat always have independent histories.

        function _ensureGroupHistoryStore(s, groupId, untethered) {
            if (untethered) {
                if (!s.groupUntetheredHistory) s.groupUntetheredHistory = {};
                if (!s.groupUntetheredHistory[groupId]) s.groupUntetheredHistory[groupId] = {};
                return s.groupUntetheredHistory[groupId];
            }
            if (!s.groupChatHistory) s.groupChatHistory = {};
            if (!s.groupChatHistory[groupId]) s.groupChatHistory[groupId] = {};
            return s.groupChatHistory[groupId];
        }

        /**
         * Returns chat history for a specific group member within the given group.
         * Returns a fresh copy to prevent accidental mutation of stored state.
         */
        function getGroupChatHistory(groupId, charKey, untethered) {
            const s = api.getSettings();
            const store = _ensureGroupHistoryStore(s, groupId, untethered);
            return JSON.parse(JSON.stringify(store[charKey] || []));
        }

        /**
         * Persists chat history for a specific group member within the given group.
         */
        function saveGroupChatHistory(groupId, charKey, history, untethered) {
            const s = api.getSettings();
            const store = _ensureGroupHistoryStore(s, groupId, untethered);
            store[charKey] = history;
            api.saveSettings();
        }

        /**
         * Clears chat history for a specific group member within the given group.
         */
        function clearGroupChatHistory(groupId, charKey, untethered) {
            const s = api.getSettings();
            const store = _ensureGroupHistoryStore(s, groupId, untethered);
            store[charKey] = [];
            api.saveSettings();
        }

        // ============================================================
        // COMBINE MODE HISTORY (single shared history for the whole group)
        // ============================================================

        function _ensureCombineHistoryStore(s, groupId, untethered) {
            if (untethered) {
                if (!s.groupCombineUntetheredHistory) s.groupCombineUntetheredHistory = {};
                return s.groupCombineUntetheredHistory;
            }
            if (!s.groupCombineHistory) s.groupCombineHistory = {};
            return s.groupCombineHistory;
        }

        /**
         * Returns the combined-mode history for the given group.
         */
        function getCombineHistory(groupId, untethered) {
            const s = api.getSettings();
            const store = _ensureCombineHistoryStore(s, groupId, untethered);
            return JSON.parse(JSON.stringify(store[groupId] || []));
        }

        /**
         * Persists the combined-mode history for the given group.
         */
        function saveCombineHistory(groupId, history, untethered) {
            const s = api.getSettings();
            const store = _ensureCombineHistoryStore(s, groupId, untethered);
            store[groupId] = history;
            api.saveSettings();
        }

        /**
         * Clears the combined-mode history for the given group.
         */
        function clearCombineHistory(groupId, untethered) {
            const s = api.getSettings();
            const store = _ensureCombineHistoryStore(s, groupId, untethered);
            store[groupId] = [];
            api.saveSettings();
        }

        // ============================================================
        // ACTIVE CHARACTER TRACKING
        // ============================================================

        function getActiveCharKey() {
            return _activeCharKey;
        }

        /**
         * Sets the active group char key and persists to the api settings.
         * If key is null, falls back to the first group member (or clears).
         */
        function setActiveCharKey(charKey) {
            _activeCharKey = charKey;
        }

        /**
         * If we're in a group session and no active char is selected yet,
         * auto-select the first member. Call this when the panel opens.
         */
        function ensureActiveChar() {
            if (!isGroupSession()) {
                _activeCharKey = null;
                return;
            }
            if (!_activeCharKey) {
                const members = getGroupMembers();
                if (members.length > 0) {
                    _activeCharKey = members[0].avatar || members[0].name;
                }
            }
        }

        /**
         * Returns the character object for the currently active group char.
         * Returns null if not in a group session or no active char.
         */
        function getActiveGroupCharacter() {
            if (!isGroupSession() || !_activeCharKey) return null;
            const members = getGroupMembers();
            return members.find(c => (c.avatar || c.name) === _activeCharKey) || null;
        }

        // ============================================================
        // MEMBER LOOKUP HELPERS (for proactive scheduler iteration)
        // ============================================================

        /**
         * Returns the charKey (avatar || name) for every resolved group member.
         */
        function getGroupMemberKeys() {
            return getGroupMembers().map(c => c.avatar || c.name).filter(Boolean);
        }

        /**
         * Returns the character object for a given charKey, or null.
         */
        function getGroupMemberByKey(charKey) {
            if (!charKey) return null;
            return getGroupMembers().find(c => (c.avatar || c.name) === charKey) || null;
        }

        // ============================================================
        // AVATAR HTML BUILDER (per character object)
        // ============================================================

        /**
         * Builds avatar HTML for a given character object.
         * Uses getThumbnailUrl if character has an avatar image, else initial circle.
         */
        function buildAvatarHtmlForChar(char, extraClass, id, small) {
            if (!char) return '';
            const charName = char.name || '?';
            const initial = charName.charAt(0).toUpperCase();
            const idAttr = id ? ` id="${id}"` : '';
            const sizeClass = small ? 'et-char-avatar-small' : 'et-char-avatar';
            const bgColor = 'var(--et-theme-color)';

            let avatarUrl = null;
            try {
                if (char.avatar && char.avatar !== 'none') {
                    const context = SillyTavern.getContext();
                    avatarUrl = context.getThumbnailUrl('avatar', char.avatar);
                }
            } catch (e) { /* ignore */ }

            const classes = [sizeClass, extraClass].filter(Boolean).join(' ');
            if (avatarUrl) {
                return `<div class="${classes}"${idAttr} style="background-color: ${bgColor};">
                    <img src="${avatarUrl}" alt="${initial}" class="et-avatar-img" onerror="this.parentElement.classList.add('et-avatar-img-error'); this.remove();">
                </div>`;
            }
            return `<div class="${classes}"${idAttr} style="background-color: ${bgColor};">${initial}</div>`;
        }

        // ============================================================
        // GROUP BAR HTML
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

        /**
         * Builds the full group bar HTML, including the Combine button and member buttons.
         * @param {string} activeKey     - charKey of the currently selected member
         * @param {boolean} combineMode  - whether combined-response mode is currently active
         */
        function buildGroupBarHtml(activeKey, combineMode) {
            const members = getGroupMembers();
            if (members.length === 0) return '';

            const combine = (combineMode === true) || _combineMode;

            // ── Combine button — fixed-size icon toggle to the left of member pills ──
            const combineBtn = `<button
                class="et-group-combine-btn${combine ? ' et-group-combine-active' : ''}"
                id="et-group-combine-btn"
                title="${combine
                    ? 'Combined mode ON — all characters reply in sequence (click to exit)'
                    : 'Enable combined mode — all characters reply in sequence'}"
                aria-pressed="${combine}">
                <i class="fa-solid fa-layer-group"></i>
            </button>`;

            // ── Per-member pills ──
            const memberBtns = members.map(char => {
                const charKey = char.avatar || char.name;
                const charName = char.name || '?';
                const isActive = !combine && charKey === activeKey;
                const avatarHtml = buildAvatarHtmlForChar(char, 'et-group-btn-avatar', '', true);
                return `<button
                    class="et-group-char-btn${isActive ? ' et-group-active' : ''}${combine ? ' et-group-btn-combine-trigger' : ''}"
                    data-char-key="${escapeHtml(charKey)}"
                    data-combine-trigger="${combine ? 'true' : 'false'}"
                    title="${combine ? 'Nudge ' + escapeHtml(charName) + ' to respond now' : 'Chat with ' + escapeHtml(charName)}">
                    ${avatarHtml}
                    <span class="et-group-char-name">${escapeHtml(charName)}</span>
                </button>`;
            }).join('');

            return `<div class="et-group-bar et-group-bar-open${combine ? ' et-combine-mode-on' : ''}" id="et-group-bar">
                <button class="et-group-bar-label et-group-bar-toggle" id="et-group-bar-toggle" type="button" aria-expanded="true" title="Show or hide group chat controls">
                    <span><i class="fa-solid fa-users"></i> Group Chat</span>
                    <i class="fa-solid fa-chevron-down et-group-bar-toggle-arrow"></i>
                </button>
                <div class="et-group-bar-members-row" id="et-group-bar-content">
                    ${combineBtn}
                    <div class="et-group-members" id="et-group-members">
                        ${memberBtns}
                    </div>
                </div>
            </div>`;
        }

        // ============================================================
        // RENDER / REMOVE GROUP BAR
        // ============================================================

        /**
         * Renders (or removes) the group bar inside #et-panel, after .et-input-bar.
         * @param {string} activeKey - charKey of currently active member
         */
        function renderGroupBar(activeKey) {
            // Remove any existing group bar
            jQuery('#et-group-bar').remove();

            if (!isGroupSession()) return;

            // Inject after .et-input-bar
            const inputBar = jQuery('#et-panel .et-input-bar');
            if (!inputBar.length) return;

            const html = buildGroupBarHtml(activeKey || _activeCharKey, _combineMode);
            inputBar.after(html);
        }

        // ============================================================
        // EVENT BINDING
        // ============================================================

        /**
         * Binds click events on group char buttons and the combine mode button.
         *
         * @param {function} onSelectChar          - callback(charKey, charObject) when a member button is clicked in normal mode
         * @param {function} onCombineToggle        - callback(isActive) when the combine button is toggled
         * @param {function} [onCombineCharTrigger] - callback(charKey, charObject) when a member button is clicked in combine mode
         *                                           (triggers a manual single-character generation)
         */
        function bindGroupBarEvents(onSelectChar, onCombineToggle, onCombineCharTrigger) {
            jQuery('#et-panel').off('click.et-group-accordion').on('click.et-group-accordion', '#et-group-bar-toggle', function (e) {
                e.stopPropagation();
                const bar = jQuery('#et-group-bar');
                const nextOpen = !bar.hasClass('et-group-bar-open');
                bar.toggleClass('et-group-bar-open', nextOpen).toggleClass('et-group-bar-collapsed', !nextOpen);
                jQuery(this).attr('aria-expanded', nextOpen ? 'true' : 'false');
            });

            // ── Individual character buttons ──────────────────────────────
            // Use event delegation on #et-panel so it survives re-renders
            jQuery('#et-panel').off('click.et-group').on('click.et-group', '.et-group-char-btn', function (e) {
                e.stopPropagation();

                const charKey = jQuery(this).data('char-key');
                if (!charKey) return;

                // ── Combine mode: clicking a character pill triggers a manual
                // single-character generation instead of switching focus ──────
                if (_combineMode) {
                    if (typeof onCombineCharTrigger === 'function') {
                        const members = getGroupMembers();
                        const char = members.find(c => (c.avatar || c.name) === charKey) || null;
                        onCombineCharTrigger(charKey, char);
                    }
                    return;
                }

                if (charKey === _activeCharKey) return; // already selected

                _activeCharKey = charKey;

                // Clear unread indicator for this char
                _unreadCharKeys.delete(charKey);

                // Update active highlight and unread classes
                jQuery('.et-group-char-btn').removeClass('et-group-active');
                jQuery(this).addClass('et-group-active').removeClass('et-group-unread');

                // Find the character object and call back
                const members = getGroupMembers();
                const char = members.find(c => (c.avatar || c.name) === charKey) || null;
                onSelectChar(charKey, char);
            });

            // ── Combine mode toggle button ────────────────────────────────
            jQuery('#et-panel').off('click.et-group-combine').on('click.et-group-combine', '#et-group-combine-btn', function (e) {
                e.stopPropagation();
                _combineMode = !_combineMode;

                // Reflect new state on the button immediately
                jQuery(this)
                    .toggleClass('et-group-combine-active', _combineMode)
                    .attr('aria-pressed', _combineMode)
                    .attr('title', _combineMode
                        ? 'Combined mode ON — all characters reply in sequence (click to exit)'
                        : 'Enable combined mode — all characters reply in sequence');

                // Toggle the bar-level class that drives the CSS container tint
                jQuery('#et-group-bar').toggleClass('et-combine-mode-on', _combineMode);

                // Switch member pills between combine-trigger style and normal style
                jQuery('.et-group-char-btn').each(function () {
                    const btn = jQuery(this);
                    btn.toggleClass('et-group-btn-combine-trigger', _combineMode);
                    btn.attr('data-combine-trigger', _combineMode ? 'true' : 'false');
                    const charName = btn.find('.et-group-char-name').text();
                    btn.attr('title', _combineMode
                        ? 'Nudge ' + charName + ' to respond now'
                        : 'Chat with ' + charName);
                });

                if (onCombineToggle) onCombineToggle(_combineMode);
            });
        }

        // ============================================================
        // SAVE/LOAD SNAPSHOT HELPERS
        // ============================================================

        /**
         * Captures the emotional + untethered state for every group member.
         * Used by saveload-modal.js when saving in a group session.
         * @param {object} settingsObj - the full settings object
         */
        function captureGroupSnapshot(settingsObj) {
            if (!isGroupSession()) return null;
            const members = getGroupMembers();
            const snapshot = {};
            members.forEach(char => {
                const charKey = char.avatar || char.name;
                if (!charKey) return;
                const emotionState = settingsObj.emotionState && settingsObj.emotionState[charKey]
                    ? JSON.parse(JSON.stringify(settingsObj.emotionState[charKey]))
                    : null;
                const slot = (settingsObj.untetheredInfluence && settingsObj.untetheredInfluence[charKey]) || {};
                snapshot[charKey] = {
                    charName: char.name,
                    emotionSnapshot: emotionState,
                    untetheredSnapshot: {
                        mood: slot.mood ?? null,
                        moodInfluence: slot.moodInfluence ?? 50,
                        personality: slot.personality ?? null,
                        personalityInfluence: slot.personalityInfluence ?? 50,
                        commStyle: slot.commStyle ?? null
                    }
                };
            });
            return snapshot;
        }

        /**
         * Restores state for all characters from a groupSnapshot.
         * @param {object} snapshot    - the groupSnapshot from a save entry
         * @param {object} settingsObj - the full settings object (mutated in place)
         */
        function restoreGroupSnapshot(snapshot, settingsObj) {
            if (!snapshot || typeof snapshot !== 'object') return;
            if (!settingsObj.emotionState) settingsObj.emotionState = {};
            if (!settingsObj.untetheredInfluence) settingsObj.untetheredInfluence = {};

            Object.entries(snapshot).forEach(([charKey, data]) => {
                if (data.emotionSnapshot) {
                    settingsObj.emotionState[charKey] = JSON.parse(JSON.stringify(data.emotionSnapshot));
                }
                if (data.untetheredSnapshot) {
                    settingsObj.untetheredInfluence[charKey] = {
                        mood: data.untetheredSnapshot.mood ?? null,
                        moodInfluence: data.untetheredSnapshot.moodInfluence ?? 50,
                        personality: data.untetheredSnapshot.personality ?? null,
                        personalityInfluence: data.untetheredSnapshot.personalityInfluence ?? 50,
                        commStyle: data.untetheredSnapshot.commStyle ?? null
                    };
                }
            });
        }

        // ============================================================
        // UNREAD TRACKING (for group proactive notifications)
        // ============================================================

        /**
         * Marks a group member as having an unread proactive message.
         */
        function markGroupCharUnread(charKey) {
            if (!charKey || charKey === _activeCharKey) return;
            _unreadCharKeys.add(charKey);
        }

        /**
         * Clears the unread flag for a group member.
         */
        function clearGroupCharUnread(charKey) {
            _unreadCharKeys.delete(charKey);
        }

        /**
         * Returns the Set of charKeys with unread messages.
         */
        function getUnreadCharKeys() {
            return new Set(_unreadCharKeys);
        }

        // ============================================================
        // PUBLIC API
        // ============================================================

        return {
            // Session detection
            isGroupSession,
            getCurrentGroup,
            getCurrentGroupId,
            // Member access
            getGroupMembers,
            getGroupMemberKeys,
            getGroupMemberByKey,
            // Active character
            getActiveCharKey,
            setActiveCharKey,
            setOverrideGroupId,
            getOverrideGroupId,
            ensureActiveChar,
            getActiveGroupCharacter,
            // Combine mode
            isCombineMode,
            setCombineMode,
            // Group-scoped per-member history
            getGroupChatHistory,
            saveGroupChatHistory,
            clearGroupChatHistory,
            // Combined-mode shared history
            getCombineHistory,
            saveCombineHistory,
            clearCombineHistory,
            // UI
            buildAvatarHtmlForChar,
            buildGroupBarHtml,
            renderGroupBar,
            bindGroupBarEvents,
            // Snapshots
            captureGroupSnapshot,
            restoreGroupSnapshot,
            // Unread
            markGroupCharUnread,
            clearGroupCharUnread,
            getUnreadCharKeys
        };
    }

    window.EchoTextGroupManager = { createGroupManager };
})();
