(function () {
    'use strict';

    /**
     * EchoText Group Manager
     * Handles group chat sessions: member resolution, group bar UI, active character switching.
     * Exposes: window.EchoTextGroupManager.createGroupManager(api)
     */
    function createGroupManager(api) {

        // The actively selected group member charKey (avatar filename)
        let _activeCharKey = null;

        // Set of charKeys that have unread proactive messages
        let _unreadCharKeys = new Set();

        // ============================================================
        // GROUP SESSION DETECTION
        // ============================================================

        /**
         * Returns true when ST is currently in a group chat with 2+ members.
         */
        function isGroupSession() {
            try {
                const context = SillyTavern.getContext();
                if (!context.groupId) return false;
                const group = (context.groups || []).find(g => g.id == context.groupId);
                return !!(group && Array.isArray(group.members) && group.members.length >= 2);
            } catch (e) {
                return false;
            }
        }

        /**
         * Returns the current group object or null.
         */
        function getCurrentGroup() {
            try {
                const context = SillyTavern.getContext();
                if (!context.groupId) return null;
                return (context.groups || []).find(g => g.id == context.groupId) || null;
            } catch (e) {
                return null;
            }
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
         * Builds the full group bar HTML.
         * @param {string} activeKey - charKey of the currently selected member
         */
        function buildGroupBarHtml(activeKey) {
            const members = getGroupMembers();
            if (members.length === 0) return '';

            const memberBtns = members.map(char => {
                const charKey = char.avatar || char.name;
                const charName = char.name || '?';
                const isActive = charKey === activeKey;
                const avatarHtml = buildAvatarHtmlForChar(char, 'et-group-btn-avatar', '', true);
                return `<button class="et-group-char-btn${isActive ? ' et-group-active' : ''}" data-char-key="${escapeHtml(charKey)}" title="Chat with ${escapeHtml(charName)}">
                    ${avatarHtml}
                    <span class="et-group-char-name">${escapeHtml(charName)}</span>
                </button>`;
            }).join('');

            return `<div class="et-group-bar" id="et-group-bar">
                <div class="et-group-bar-label"><i class="fa-solid fa-users"></i> Group Chat</div>
                <div class="et-group-members" id="et-group-members">
                    ${memberBtns}
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

            const html = buildGroupBarHtml(activeKey || _activeCharKey);
            inputBar.after(html);
        }

        // ============================================================
        // EVENT BINDING
        // ============================================================

        /**
         * Binds click events on group char buttons.
         * @param {function} onSelectChar - callback(charKey, charObject) called when a button is clicked
         */
        function bindGroupBarEvents(onSelectChar) {
            // Use event delegation on #et-panel so it survives re-renders
            jQuery('#et-panel').off('click.et-group').on('click.et-group', '.et-group-char-btn', function (e) {
                e.stopPropagation();
                const charKey = jQuery(this).data('char-key');
                if (!charKey) return;
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
                snapshot[charKey] = {
                    charName: char.name,
                    emotionSnapshot: emotionState,
                    untetheredSnapshot: {
                        // Untethered state is per-character via charKey in a future extension;
                        // for now snapshot the global untethered settings as they apply to the active char
                        mood: settingsObj.untetheredMood || null,
                        personality: settingsObj.untetheredPersonality || null,
                        commStyle: settingsObj.untetheredCommStyle || null
                    }
                };
            });
            return snapshot;
        }

        /**
         * Restores state for all characters from a groupSnapshot.
         * @param {object} snapshot - the groupSnapshot from a save entry
         * @param {object} settingsObj - the full settings object (mutated in place)
         */
        function restoreGroupSnapshot(snapshot, settingsObj) {
            if (!snapshot || typeof snapshot !== 'object') return;
            if (!settingsObj.emotionState) settingsObj.emotionState = {};

            Object.entries(snapshot).forEach(([charKey, data]) => {
                if (data.emotionSnapshot) {
                    settingsObj.emotionState[charKey] = JSON.parse(JSON.stringify(data.emotionSnapshot));
                }
                // Restore untethered state for the currently active char
                if (charKey === _activeCharKey && data.untetheredSnapshot) {
                    settingsObj.untetheredMood = data.untetheredSnapshot.mood;
                    settingsObj.untetheredPersonality = data.untetheredSnapshot.personality;
                    settingsObj.untetheredCommStyle = data.untetheredSnapshot.commStyle;
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
            isGroupSession,
            getCurrentGroup,
            getGroupMembers,
            getGroupMemberKeys,
            getGroupMemberByKey,
            getActiveCharKey,
            setActiveCharKey,
            ensureActiveChar,
            getActiveGroupCharacter,
            buildAvatarHtmlForChar,
            buildGroupBarHtml,
            renderGroupBar,
            bindGroupBarEvents,
            markGroupCharUnread,
            clearGroupCharUnread,
            getUnreadCharKeys,
            captureGroupSnapshot,
            restoreGroupSnapshot
        };
    }

    window.EchoTextGroupManager = { createGroupManager };
})();
