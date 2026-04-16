// EchoText Character Picker Module
(function () {
    'use strict';

    window.EchoTextCharacterPicker = {
        createCharacterPicker: function (api) {
            const {
                getSettings,
                saveSettings,
                escapeHtml,
                getCharacterKey,
                getGroupManager,
                applySelectedCharacterToPanel,
                setSelectedCharacterKey,
                isPanelOpen,
                renderGroupUnreadIndicators,
                getSwitchGroupCharFn,
                getOnCombineModeToggleFn,
                getTriggerManualCombineCharFn,
                getSelectedCharacterKey
            } = api;

    function getAllCharactersForPicker() {
        const context = SillyTavern.getContext();
        const chars = Array.isArray(context.characters) ? context.characters : [];
        return chars
            .map((char, index) => {
                if (!char || !char.name) return null;
                return {
                    ...char,
                    __index: index,
                    __key: char.avatar || char.name || `char-${index}`
                };
            })
            .filter(Boolean);
    }

    /**
     * Returns all groups from context.groups that have 2+ members, tagged for the picker.
     * Also resolves avatar filenames to character names for display.
     */
    function getAllGroupsForPicker() {
        try {
            const context = SillyTavern.getContext();
            const groups = Array.isArray(context.groups) ? context.groups : [];
            const chars = Array.isArray(context.characters) ? context.characters : [];
            return groups
                .filter(g => g && g.id != null && Array.isArray(g.members) && g.members.length >= 2)
                .map(g => {
                    // Resolve avatar filenames -> character names
                    const memberNames = g.members
                        .map(avatarFile => {
                            const c = chars.find(c => c.avatar === avatarFile);
                            return c ? c.name : null;
                        })
                        .filter(Boolean);
                    return {
                        __isGroup: true,
                        __key: `group:${g.id}`,
                        __groupId: g.id,
                        name: g.name || `Group ${g.id}`,
                        members: g.members,
                        memberNames,
                        avatar: g.avatar || null,
                        chat_id: g.chat_id || null
                    };
                });
        } catch (e) {
            return [];
        }
    }

    function getAvatarUrlForCharacter(char) {
        try {
            if (!char || !char.avatar || char.avatar === 'none') return null;
            const context = SillyTavern.getContext();
            return context.getThumbnailUrl('avatar', char.avatar);
        } catch {
            return null;
        }
    }

    function buildCharacterPickerItemAvatar(char) {
        const name = char?.name || 'Character';
        const rawInitial = name.charAt(0).toUpperCase();
        const initial = escapeHtml(rawInitial);
        const avatarUrl = getAvatarUrlForCharacter(char);

        // Treat missing avatars and ST's literal 'none' as "no real avatar".
        // We NO LONGER skip based on filename alone — SillyTavern assigns a unique
        // filename to every character even when no image was uploaded (e.g. "1955.png"
        // still serves the default silhouette).  Instead we always render the initial
        // badge behind the image and use canvas fingerprinting on load to detect and
        // discard the default silhouette at runtime.
        const hasAvatarUrl = avatarUrl && String(char?.avatar || '') !== 'none';

        const bg = `background:${_pickerAvatarBg(name)}`;
        const highlight = _pickerAvatarHighlight(name);
        const shadowStyle = `box-shadow:inset 0 1px 0 ${highlight},0 2px 6px rgba(0,0,0,0.4)`;

        if (hasAvatarUrl) {
            // Render initial badge as the base layer; the <img> floats above it.
            // openCharacterPicker() attaches onload/onerror handlers after DOM insertion.
            return `<div class="et-char-picker-item-avatar" style="${bg}" data-initial="${initial}" data-char-name="${escapeHtml(name)}">
                <span class="et-char-picker-initial et-char-picker-initial-behind">${initial}</span>
                <img src="${avatarUrl}" alt="${initial}" class="et-avatar-img" loading="lazy">
            </div>`;
        }

        // No avatar URL at all — render the initial badge with its full styling
        return `<div class="et-char-picker-item-avatar" style="${bg};${shadowStyle}">
            <span class="et-char-picker-initial">${initial}</span>
        </div>`;
    }

    // Derives a unique hue from the character name spread across 12 slots (30° apart),
    // anchored to the active EchoText theme accent colour for visual coherence.
    function _pickerAvatarHue(name) {
        let hash = 0;
        for (let i = 0; i < name.length; i++) {
            hash = (name.charCodeAt(i) + ((hash << 6) - hash)) | 0;
        }
        const slot = Math.abs(hash) % 12;
        let baseHue = 220; // fallback blue
        try {
            const accent = getComputedStyle(document.documentElement).getPropertyValue('--et-theme-color').trim();
            if (accent) {
                const c = document.createElement('canvas');
                c.width = c.height = 1;
                const ctx = c.getContext('2d');
                ctx.fillStyle = accent;
                ctx.fillRect(0, 0, 1, 1);
                const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
                const rn = r / 255, gn = g / 255, bn = b / 255;
                const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn), d = max - min;
                if (d > 0) {
                    if (max === rn) baseHue = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
                    else if (max === gn) baseHue = ((bn - rn) / d + 2) * 60;
                    else baseHue = ((rn - gn) / d + 4) * 60;
                }
            }
        } catch { /* keep fallback hue */ }
        return (baseHue + slot * 30) % 360;
    }

    function _pickerAvatarBg(name) {
        return `hsl(${_pickerAvatarHue(name)}, 50%, 30%)`;
    }

    function _pickerAvatarHighlight(name) {
        return `hsl(${_pickerAvatarHue(name)}, 50%, 48%)`;
    }

    function buildPickerCharItemHtml(char, activeGroupKey, selectedKey) {
        const isFav = Array.isArray(getSettings().pickerFavorites) && getSettings().pickerFavorites.includes(char.__key);
        const activeClass = (!activeGroupKey && char.__key === selectedKey) ? ' et-char-picker-item-active' : '';
        const starActiveClass = isFav ? ' et-char-picker-star-active' : '';
        const starTitle = isFav ? 'Remove from Favorites' : 'Add to Favorites';
        const starIcon = isFav ? 'fa-solid fa-star' : 'fa-regular fa-star';
        return `
            <button class="et-char-picker-item${activeClass}" data-char-index="${char.__index}" data-char-key="${escapeHtml(char.__key)}" type="button" title="Switch to ${escapeHtml(char.name)}">
                ${buildCharacterPickerItemAvatar(char)}
                <span class="et-char-picker-item-name">${escapeHtml(char.name)}</span>
                <span class="et-char-picker-star-btn${starActiveClass}" data-char-key="${escapeHtml(char.__key)}" role="button" tabindex="0" title="${starTitle}" aria-label="${starTitle}">
                    <i class="${starIcon}"></i>
                </span>
            </button>`;
    }

    function buildCharacterPickerHtml() {
        const chars = getAllCharactersForPicker();
        const groups = getAllGroupsForPicker();
        const activeGroupId = getGroupManager() ? getGroupManager().getOverrideGroupId() : null;
        const activeGroupKey = activeGroupId != null ? `group:${activeGroupId}` : null;
        const selectedKey = getCharacterKey();
        const groupsCollapsed = getSettings().pickerGroupsCollapsed === true;
        const favsCollapsed = getSettings().pickerFavoritesCollapsed === true;
        const favKeys = Array.isArray(getSettings().pickerFavorites) ? getSettings().pickerFavorites : [];

        if (!chars.length && !groups.length) {
            return `
            <div id="et-char-picker" class="et-char-picker">
                <div class="et-char-picker-empty">No characters found.</div>
            </div>`;
        }

        // Favorites section — collapsible accordion
        const favChars = chars.filter(c => favKeys.includes(c.__key));
        let favSection = '';
        if (favChars.length) {
            const favItems = favChars.map(char => buildPickerCharItemHtml(char, activeGroupKey, selectedKey)).join('');
            const favCollapsedClass = favsCollapsed ? ' et-picker-favs-collapsed' : '';
            favSection = `
                <div class="et-picker-favs-accordion${favCollapsedClass}" id="et-picker-favs-accordion">
                    <button class="et-picker-favs-header" id="et-picker-favs-toggle" type="button" title="${favsCollapsed ? 'Expand favorites' : 'Collapse favorites'}" aria-expanded="${favsCollapsed ? 'false' : 'true'}">
                        <i class="fa-solid fa-star et-picker-favs-icon"></i>
                        <span class="et-picker-favs-title">Favorites</span>
                        <span class="et-picker-favs-badge">${favChars.length}</span>
                        <i class="fa-solid fa-chevron-down et-picker-favs-chevron"></i>
                    </button>
                    <div class="et-picker-favs-body" id="et-picker-favs-body">
                        ${favItems}
                    </div>
                </div>
                <div class="et-char-picker-section-divider et-picker-favs-divider"></div>`;
        }

        // Groups section — collapsible accordion
        let groupSection = '';
        if (groups.length) {
            const groupItems = groups.map(g => {
                const isActive = g.__key === activeGroupKey;
                const activeClass = isActive ? ' et-char-picker-item-active' : '';
                const count = Array.isArray(g.members) ? g.members.length : 0;
                const nameList = Array.isArray(g.memberNames) && g.memberNames.length
                    ? g.memberNames.join(', ')
                    : `${count} member${count !== 1 ? 's' : ''}`;
                const memberLabel = `(${count}) ${nameList}`;
                return `
                <button class="et-char-picker-item et-char-picker-group-item${activeClass}" data-group-id="${escapeHtml(String(g.__groupId))}" data-char-key="${escapeHtml(g.__key)}" type="button" title="Open group: ${escapeHtml(g.name)}">
                    <div class="et-char-picker-item-avatar et-char-picker-group-avatar" style="background:var(--et-theme-color)">
                        <i class="fa-solid fa-users"></i>
                    </div>
                    <div class="et-char-picker-group-info">
                        <span class="et-char-picker-item-name">${escapeHtml(g.name)}</span>
                        <span class="et-char-picker-group-count">${escapeHtml(memberLabel)}</span>
                    </div>
                </button>`;
            }).join('');

            const collapsedClass = groupsCollapsed ? ' et-picker-groups-collapsed' : '';
            groupSection = `
                <div class="et-picker-groups-accordion${collapsedClass}" id="et-picker-groups-accordion">
                    <button class="et-picker-groups-header" id="et-picker-groups-toggle" type="button" title="${groupsCollapsed ? 'Expand group chats' : 'Collapse group chats'}" aria-expanded="${groupsCollapsed ? 'false' : 'true'}">
                        <i class="fa-solid fa-user-group et-picker-groups-icon"></i>
                        <span class="et-picker-groups-title">Group Chats</span>
                        <span class="et-picker-groups-badge">${groups.length}</span>
                        <i class="fa-solid fa-chevron-down et-picker-groups-chevron"></i>
                    </button>
                    <div class="et-picker-groups-body" id="et-picker-groups-body">
                        ${groupItems}
                    </div>
                </div>
                <div class="et-char-picker-section-divider"></div>`;
        }

        // Character section — always show star buttons
        const charSection = chars.length ? `
            <div class="et-char-picker-section-label"><i class="fa-solid fa-user"></i> Characters</div>
            ${chars.map(char => buildPickerCharItemHtml(char, activeGroupKey, selectedKey)).join('')}` : '';

        return `
            <div id="et-char-picker" class="et-char-picker">
                <div class="et-char-picker-header">
                    <i class="fa-solid fa-users" style="color:var(--et-theme-color)"></i>
                    <span>Select Character</span>
                    <button class="et-char-picker-close" id="et-char-picker-close"><i class="fa-solid fa-xmark"></i></button>
                </div>
                <div class="et-char-picker-search">
                    <i class="fa-solid fa-search"></i>
                    <input type="text" id="et-char-search" placeholder="Search..." autocomplete="off">
                </div>
                <div class="et-char-picker-list">
                    ${favSection}
                    ${groupSection}
                    ${charSection}
                </div>
            </div>`;
    }

    function closeCharacterPicker() {
        const picker = jQuery('#et-char-picker');
        if (!picker.length) return;
        picker.addClass('et-char-picker-closing');
        setTimeout(() => picker.remove(), 180);
        jQuery(document).off('click.et-char-picker');
    }

    function openCharacterPicker(centerInPanel = false) {

        closeCharacterPicker();
        jQuery('#et-panel').append(buildCharacterPickerHtml());
        const picker = jQuery('#et-char-picker');

        // Attach onload (canvas fingerprint) and onerror handlers to avatar images.
        // Image error events don't bubble, so we must attach directly.
        //
        // Background: SillyTavern assigns unique filenames to every character even
        // when no custom image was uploaded (e.g. "1955.png" still serves the
        // default grey silhouette with HTTP 200).  To detect the default silhouette
        // we draw the image to a 1×1 canvas after it loads and sample the pixel at
        // (50, 50) scaled down — the default silhouette is near-black ([1,1,1,255])
        // at its centre while real photos almost always have colour there.
        // Brightness threshold: if R+G+B ≤ 15 at that sample point → default.
        // We use an IntersectionObserver for images that are already 'complete' (cached).
        // Triggering a canvas draw layout for 500+ cached characters synchronously causes a huge delay.
        // Instead, we only trigger the fingerprinting logic when the avatar actually scrolls into view.
        const scrollRoot = picker.find('.et-char-picker-list')[0];
        const avatarObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const imgEl = entry.target;
                    observer.unobserve(imgEl);
                    if (imgEl.complete && imgEl.naturalWidth > 0) {
                        jQuery(imgEl).trigger('load');
                    }
                }
            });
        }, { root: scrollRoot, rootMargin: '200px' });

        picker.find('.et-char-picker-item-avatar').each(function () {
            const $avatarDiv = jQuery(this);
            const $img = $avatarDiv.find('img.et-avatar-img');
            if (!$img.length) return;

            const initial = String($avatarDiv.data('initial') || '?');
            const charName = String($avatarDiv.data('charName') || $avatarDiv.closest('.et-char-picker-item').find('.et-char-picker-item-name').text() || '');

            function _fallbackToInitial() {
                $img.remove();
                // Remove the hidden initial span and replace the whole content with a
                // styled badge (the wrapper background is already set via inline style).
                $avatarDiv.find('.et-char-picker-initial-behind').remove();
                $avatarDiv.append(`<span class="et-char-picker-initial">${escapeHtml(initial)}</span>`);
                $avatarDiv.css('box-shadow', `inset 0 1px 0 ${_pickerAvatarHighlight(charName || initial)},0 2px 6px rgba(0,0,0,0.4)`);
            }

            $img.on('error', _fallbackToInitial);

            $img.on('load', function () {
                try {
                    const imgEl = this;
                    // Sample at (50, 50) to fingerprint the ST default silhouette.
                    // SillyTavern assigns unique filenames to every character even with
                    // no custom upload, so we can't use the filename alone.  Instead we
                    // read a pixel from the loaded image:
                    //   • ST default silhouette (verified ST 1.16.0): background pixel
                    //     at (50,50) is a desaturated grey-purple ≈ [149, 127, 143].
                    //   • Some older builds serve a near-black centre (brightness ≤ 15).
                    //   • Real uploaded photos almost never have a desaturated purple-grey
                    //     pixel at exactly this coordinate.
                    const sampleX = Math.min(50, imgEl.naturalWidth - 1);
                    const sampleY = Math.min(50, imgEl.naturalHeight - 1);
                    const c = document.createElement('canvas');
                    c.width = imgEl.naturalWidth;
                    c.height = imgEl.naturalHeight;
                    const ctx2d = c.getContext('2d');
                    ctx2d.drawImage(imgEl, 0, 0);
                    const px = ctx2d.getImageData(sampleX, sampleY, 1, 1).data; // [r,g,b,a]
                    const brightness = px[0] + px[1] + px[2];

                    // Near-black centre (some builds)
                    const isNearBlack = brightness <= 15;
                    // Grey-purple silhouette background (ST ≥ 1.16.0, verified pixel [149, 127, 143])
                    const TOL = 12;
                    const isGreyPurple = Math.abs(px[0] - 149) <= TOL &&
                                         Math.abs(px[1] - 127) <= TOL &&
                                         Math.abs(px[2] - 143) <= TOL;

                    if (isNearBlack || isGreyPurple) {
                        _fallbackToInitial();
                    }
                    // else: real custom avatar — leave it visible
                } catch (_e) {
                    // Canvas tainted (cross-origin) or other error — keep the image
                }
            });

            // If image was already loaded from cache before handlers attached,
            // queue it up manually via IntersectionObserver.
            if ($img[0].complete) {
                avatarObserver.observe($img[0]);
            }
        });

        const panelEl = document.getElementById('et-panel');
        if (panelEl) {
            const panelRect = panelEl.getBoundingClientRect();
            const pickerWidth = picker.outerWidth() || 280;
            const pickerHeight = picker.outerHeight() || 340;
            // Reserve space for panel header (~68px) and message input bar (~60px)
            const headerH = 68;
            const footerH = 60;
            const usableHeight = panelRect.height - headerH - footerH;
            const centeredTop = headerH + Math.round((usableHeight - pickerHeight) / 2);
            const top = Math.max(headerH + 4, centeredTop);
            const left = Math.max(8, Math.round((panelRect.width - pickerWidth) / 2));
            picker.css({ top: `${top}px`, left: `${left}px` });
        }

        requestAnimationFrame(() => {
            picker.addClass('et-char-picker-open');
            if (!api.isMobileDevice || !api.isMobileDevice()) picker.find('#et-char-search').focus();
        });

        picker.find('#et-char-search').on('input', function (e) {
            e.stopPropagation();
            const query = jQuery(this).val().toLowerCase();
            picker.find('.et-char-picker-item').each(function () {
                const name = jQuery(this).find('.et-char-picker-item-name').text().toLowerCase();
                const btn = jQuery(this);
                if (name.includes(query)) {
                    btn.css('display', '');
                } else {
                    btn.css('display', 'none');
                }
            });
            // Hide section labels when no visible items follow them
            picker.find('.et-char-picker-section-label').each(function () {
                const $label = jQuery(this);
                let hasVisible = false;
                let $next = $label.next();
                while ($next.length && !$next.hasClass('et-char-picker-section-label')) {
                    if ($next.hasClass('et-char-picker-item') && $next.css('display') !== 'none') {
                        hasVisible = true;
                        break;
                    }
                    $next = $next.next();
                }
                $label.css('display', hasVisible ? '' : 'none');
            });
            // Hide groups accordion and its divider if nothing matches
            const $groupAcc = picker.find('#et-picker-groups-accordion');
            const $groupDivider = $groupAcc.next('.et-char-picker-section-divider');
            const groupsVisible = picker.find('.et-char-picker-group-item:visible').length > 0;
            $groupAcc.css('display', groupsVisible ? '' : 'none');
            $groupDivider.css('display', groupsVisible ? '' : 'none');
            // Hide favorites accordion and its divider if nothing matches
            const $favAcc = picker.find('#et-picker-favs-accordion');
            const $favDivider = picker.find('.et-picker-favs-divider');
            const favsVisible = $favAcc.find('.et-char-picker-item:visible').length > 0;
            $favAcc.css('display', favsVisible ? '' : 'none');
            $favDivider.css('display', favsVisible ? '' : 'none');
        });


        picker.find('#et-char-picker-close').on('click', (e) => {
            e.stopPropagation();
            closeCharacterPicker();
        });

        // ── Favorites accordion toggle ────────────────────────────────
        picker.on('click', '#et-picker-favs-toggle', (e) => {
            e.stopPropagation();
            const $acc = picker.find('#et-picker-favs-accordion');
            const $toggle = picker.find('#et-picker-favs-toggle');
            const nowCollapsed = $acc.hasClass('et-picker-favs-collapsed');
            $acc.toggleClass('et-picker-favs-collapsed', !nowCollapsed);
            const willBeCollapsed = !nowCollapsed;
            getSettings().pickerFavoritesCollapsed = willBeCollapsed;
            saveSettings();
            $toggle.attr('aria-expanded', willBeCollapsed ? 'false' : 'true');
            $toggle.attr('title', willBeCollapsed ? 'Expand favorites' : 'Collapse favorites');
        });

        // ── Group Chats accordion toggle ──────────────────────────────
        picker.on('click', '#et-picker-groups-toggle', (e) => {
            e.stopPropagation();
            const $acc = picker.find('#et-picker-groups-accordion');
            const $toggle = picker.find('#et-picker-groups-toggle');
            const nowCollapsed = $acc.hasClass('et-picker-groups-collapsed');
            $acc.toggleClass('et-picker-groups-collapsed', !nowCollapsed);
            const willBeCollapsed = !nowCollapsed;
            getSettings().pickerGroupsCollapsed = willBeCollapsed;
            saveSettings();
            $toggle.attr('aria-expanded', willBeCollapsed ? 'false' : 'true');
            $toggle.attr('title', willBeCollapsed ? 'Expand group chats' : 'Collapse group chats');
        });

        // ── Star / Favorite button ────────────────────────────────────
        // Tracks keys currently in 2-click confirm state
        let _starConfirmTimers = {};

        picker.on('click', '.et-char-picker-star-btn', function (e) {
            e.stopPropagation(); // don't trigger character select
            const $star = jQuery(this);
            const charKey = $star.data('char-key');
            if (!charKey) return;

            if (!Array.isArray(getSettings().pickerFavorites)) getSettings().pickerFavorites = [];
            const isFav = getSettings().pickerFavorites.includes(charKey);

            if (!isFav) {
                // ── Add to favorites ──────────────────────────────────
                getSettings().pickerFavorites.push(charKey);
                saveSettings();
                // Animate star pop then rebuild list
                $star.addClass('et-char-picker-star-pop');
                setTimeout(() => {
                    // Rebuild the list in place to show the Favorites accordion
                    _rebuildPickerList(picker);
                }, 320);
            } else {
                // ── Remove from favorites (2-click confirm) ───────────
                if ($star.hasClass('et-char-picker-star-confirming')) {
                    // Second click — confirmed, remove
                    clearTimeout(_starConfirmTimers[charKey]);
                    delete _starConfirmTimers[charKey];
                    $star.addClass('et-char-picker-star-removing');
                    setTimeout(() => {
                        getSettings().pickerFavorites = getSettings().pickerFavorites.filter(k => k !== charKey);
                        saveSettings();
                        _rebuildPickerList(picker);
                    }, 260);
                } else {
                    // First click — enter confirming state
                    $star.addClass('et-char-picker-star-confirming');
                    _starConfirmTimers[charKey] = setTimeout(() => {
                        $star.removeClass('et-char-picker-star-confirming');
                        delete _starConfirmTimers[charKey];
                    }, 2000);
                }
            }
        });

        picker.off('click.et-picker-select').on('click.et-picker-select', '.et-char-picker-item', function (e) {
            e.stopPropagation();
            const $btn = jQuery(this);

            // ── Group selected ────────────────────────────────────────────
            const groupId = $btn.data('group-id');
            if (groupId != null && groupId !== '') {
                // Clear any individual character override
                setSelectedCharacterKey(null);

                // Point group manager at the selected group
                if (getGroupManager()) {
                    getGroupManager().setOverrideGroupId(groupId);
                    getGroupManager().ensureActiveChar();
                }

                closeCharacterPicker();

                // Re-render panel header, group bar, and messages
                applySelectedCharacterToPanel();

                if (getGroupManager() && isPanelOpen()) {
                    getGroupManager().renderGroupBar(getGroupManager().getActiveCharKey());
                    getGroupManager().bindGroupBarEvents((getSwitchGroupCharFn() || function(){}), (getOnCombineModeToggleFn() || function(){}), (getTriggerManualCombineCharFn() || function(){}));
                    if (typeof renderGroupUnreadIndicators === "function") renderGroupUnreadIndicators();
                }
                return;
            }

            // ── Individual character selected ─────────────────────────────
            const index = Number($btn.data('char-index'));
            if (Number.isNaN(index)) return;

            const selectedChar = getAllCharactersForPicker().find(char => char.__index === index);
            if (!selectedChar) {
                toastr.error('Failed to select character.');
                return;
            }

            // Clear any group override when switching to a solo character
            if (getGroupManager()) getGroupManager().setOverrideGroupId(null);

            setSelectedCharacterKey(selectedChar.__key);
            applySelectedCharacterToPanel();

            // Remove the group bar (no longer in a group session)
            if (isPanelOpen()) {
                jQuery('#et-group-bar').remove();
            }

            closeCharacterPicker();
        });

        setTimeout(() => {
            jQuery(document).on('click.et-char-picker', function (e) {
                if (!jQuery(e.target).closest('#et-char-picker, #et-char-name').length) {
                    closeCharacterPicker();
                }
            });
        }, 50);
    }

    function toggleCharacterPicker() {
        if (jQuery('#et-char-picker').length) {
            closeCharacterPicker();
        } else {
            openCharacterPicker();
        }
    }

    /**
     * Rebuilds only the scrollable list inside an already-open character picker.
     * Called after favoriting/unfavoriting a character so the popup stays open
     * and the Favorites accordion appears/disappears smoothly.
     */
    function _rebuildPickerList(picker) {
        if (!picker || !picker.length) return;

        // Build fresh HTML from current getSettings() state
        const freshHtml = buildCharacterPickerHtml();
        const $fresh = jQuery(freshHtml);

        // Extract and replace only the list
        const $newList = $fresh.find('.et-char-picker-list');
        const $currentList = picker.find('.et-char-picker-list');
        if (!$newList.length || !$currentList.length) return;
        $currentList.replaceWith($newList);

        // Re-attach avatar fingerprinting for newly inserted images
        const scrollRoot = picker.find('.et-char-picker-list')[0];
        const avatarObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const imgEl = entry.target;
                    observer.unobserve(imgEl);
                    if (imgEl.complete && imgEl.naturalWidth > 0) {
                        jQuery(imgEl).trigger('load');
                    }
                }
            });
        }, { root: scrollRoot, rootMargin: '200px' });

        picker.find('.et-char-picker-item-avatar').each(function () {
            const $avatarDiv = jQuery(this);
            const $img = $avatarDiv.find('img.et-avatar-img');
            if (!$img.length) return;

            const initial = String($avatarDiv.data('initial') || '?');
            const charName = String($avatarDiv.data('charName') || $avatarDiv.closest('.et-char-picker-item').find('.et-char-picker-item-name').text() || '');

            function _fallbackToInitial() {
                $img.remove();
                $avatarDiv.find('.et-char-picker-initial-behind').remove();
                $avatarDiv.append(`<span class="et-char-picker-initial">${escapeHtml(initial)}</span>`);
                $avatarDiv.css('box-shadow', `inset 0 1px 0 ${_pickerAvatarHighlight(charName || initial)},0 2px 6px rgba(0,0,0,0.4)`);
            }

            $img.on('error', _fallbackToInitial);
            $img.on('load', function () {
                try {
                    const imgEl = this;
                    const sampleX = Math.min(50, imgEl.naturalWidth - 1);
                    const sampleY = Math.min(50, imgEl.naturalHeight - 1);
                    const c = document.createElement('canvas');
                    c.width = imgEl.naturalWidth; c.height = imgEl.naturalHeight;
                    const ctx2d = c.getContext('2d');
                    ctx2d.drawImage(imgEl, 0, 0);
                    const px = ctx2d.getImageData(sampleX, sampleY, 1, 1).data;
                    const brightness = px[0] + px[1] + px[2];
                    const isNearBlack = brightness <= 15;
                    const TOL = 12;
                    const isGreyPurple = Math.abs(px[0] - 149) <= TOL && Math.abs(px[1] - 127) <= TOL && Math.abs(px[2] - 143) <= TOL;
                    if (isNearBlack || isGreyPurple) _fallbackToInitial();
                } catch (_e) { /* keep the image */ }
            });
            if ($img[0].complete) avatarObserver.observe($img[0]);
        });
    }


    function openEmbeddedCharacterPicker() {
        // Remove any floating picker; inline picker lives in #et-messages-inner as a flow child
        closeCharacterPicker();
        jQuery('#et-char-picker-inline').remove();

        const $inner = jQuery('#et-messages-inner');
        if (!$inner.length) return;

        // If SillyTavern hasn't populated characters yet (e.g. called on panel open),
        // show a brief loading state and retry until characters are available.
        const chars = getAllCharactersForPicker();
        const groups = getAllGroupsForPicker ? getAllGroupsForPicker() : [];
        if (!chars.length && !groups.length) {
            $inner.html('<div class="et-no-char-msg"><p class="et-no-char-label">Loading characters...</p></div>');
            let attempts = 0;
            const retry = setInterval(() => {
                attempts++;
                const retryChars = getAllCharactersForPicker();
                if (retryChars.length || attempts >= 20) {
                    clearInterval(retry);
                    if (jQuery('#et-messages-inner').length) openEmbeddedCharacterPicker();
                }
            }, 250);
            return;
        }

        // Parse picker HTML, give it a unique id/class so it never conflicts with the
        // floating picker animation rules (.et-char-picker starts at opacity:0).
        const $picker = jQuery(buildCharacterPickerHtml());
        $picker.attr('id', 'et-char-picker-inline');
        $picker.addClass('et-char-picker-inline');
        $picker.find('.et-char-picker-close').remove();

        $inner.empty().append($picker);

        // ── Avatar fingerprinting ─────────────────────────────────────
        const scrollRoot = $picker.find('.et-char-picker-list')[0];
        const avatarObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const imgEl = entry.target;
                    observer.unobserve(imgEl);
                    if (imgEl.complete && imgEl.naturalWidth > 0) jQuery(imgEl).trigger('load');
                }
            });
        }, { root: scrollRoot, rootMargin: '200px' });

        $picker.find('.et-char-picker-item-avatar').each(function () {
            const $avatarDiv = jQuery(this);
            const $img = $avatarDiv.find('img.et-avatar-img');
            if (!$img.length) return;
            const initial = String($avatarDiv.data('initial') || '?');
            const charName = String($avatarDiv.data('charName') || $avatarDiv.closest('.et-char-picker-item').find('.et-char-picker-item-name').text() || '');
            function _fallbackToInitial() {
                $img.remove();
                $avatarDiv.find('.et-char-picker-initial-behind').remove();
                $avatarDiv.append(`<span class="et-char-picker-initial">${escapeHtml(initial)}</span>`);
                $avatarDiv.css('box-shadow', `inset 0 1px 0 ${_pickerAvatarHighlight(charName || initial)},0 2px 6px rgba(0,0,0,0.4)`);
            }
            $img.on('error', _fallbackToInitial);
            $img.on('load', function () {
                try {
                    const imgEl = this;
                    const sx = Math.min(50, imgEl.naturalWidth - 1), sy = Math.min(50, imgEl.naturalHeight - 1);
                    const c = document.createElement('canvas');
                    c.width = imgEl.naturalWidth; c.height = imgEl.naturalHeight;
                    const ctx = c.getContext('2d');
                    ctx.drawImage(imgEl, 0, 0);
                    const px = ctx.getImageData(sx, sy, 1, 1).data;
                    const isNearBlack = (px[0]+px[1]+px[2]) <= 15;
                    const TOL = 12;
                    const isGreyPurple = Math.abs(px[0]-149)<=TOL && Math.abs(px[1]-127)<=TOL && Math.abs(px[2]-143)<=TOL;
                    if (isNearBlack || isGreyPurple) _fallbackToInitial();
                } catch (_e) { /* keep the image */ }
            });
            if ($img[0].complete) avatarObserver.observe($img[0]);
        });

        if (!api.isMobileDevice || !api.isMobileDevice()) $picker.find('#et-char-search').focus();

        // ── Search ────────────────────────────────────────────────────
        $picker.find('#et-char-search').on('input', function (e) {
            e.stopPropagation();
            const query = jQuery(this).val().toLowerCase();

            // When the query is cleared, restore all items and section containers
            // to their default visibility and exit early. We cannot rely on the
            // :visible check below for this case because collapsed accordions hide
            // their children from jQuery's :visible even after display is cleared,
            // which incorrectly causes the Favorites and Group Chats sections to vanish.
            if (query === '') {
                $picker.find('.et-char-picker-item').css('display', '');
                $picker.find('.et-char-picker-section-label').css('display', '');
                $picker.find('#et-picker-groups-accordion').css('display', '');
                $picker.find('#et-picker-groups-accordion').next('.et-char-picker-section-divider').css('display', '');
                $picker.find('#et-picker-favs-accordion').css('display', '');
                $picker.find('.et-picker-favs-divider').css('display', '');
                return;
            }

            $picker.find('.et-char-picker-item').each(function () {
                jQuery(this).css('display', jQuery(this).find('.et-char-picker-item-name').text().toLowerCase().includes(query) ? '' : 'none');
            });
            $picker.find('.et-char-picker-section-label').each(function () {
                const $label = jQuery(this);
                let hasVisible = false;
                let $next = $label.next();
                while ($next.length && !$next.hasClass('et-char-picker-section-label')) {
                    if ($next.hasClass('et-char-picker-item') && $next.css('display') !== 'none') { hasVisible = true; break; }
                    $next = $next.next();
                }
                $label.css('display', hasVisible ? '' : 'none');
            });
            const $gAcc = $picker.find('#et-picker-groups-accordion');
            const gVis = $picker.find('.et-char-picker-group-item').filter(function () { return jQuery(this).css('display') !== 'none'; }).length > 0;
            $gAcc.css('display', gVis ? '' : 'none');
            $gAcc.next('.et-char-picker-section-divider').css('display', gVis ? '' : 'none');
            const $fAcc = $picker.find('#et-picker-favs-accordion');
            const fVis = $fAcc.find('.et-char-picker-item').filter(function () { return jQuery(this).css('display') !== 'none'; }).length > 0;
            $fAcc.css('display', fVis ? '' : 'none');
            $picker.find('.et-picker-favs-divider').css('display', fVis ? '' : 'none');
        });

        // ── Favorites accordion ───────────────────────────────────────
        $picker.on('click', '#et-picker-favs-toggle', (e) => {
            e.stopPropagation();
            const $acc = $picker.find('#et-picker-favs-accordion');
            const nowCollapsed = $acc.hasClass('et-picker-favs-collapsed');
            $acc.toggleClass('et-picker-favs-collapsed', !nowCollapsed);
            const will = !nowCollapsed;
            getSettings().pickerFavoritesCollapsed = will;
            saveSettings();
            $picker.find('#et-picker-favs-toggle').attr({ 'aria-expanded': will ? 'false' : 'true', title: will ? 'Expand favorites' : 'Collapse favorites' });
        });

        // ── Groups accordion ──────────────────────────────────────────
        $picker.on('click', '#et-picker-groups-toggle', (e) => {
            e.stopPropagation();
            const $acc = $picker.find('#et-picker-groups-accordion');
            const nowCollapsed = $acc.hasClass('et-picker-groups-collapsed');
            $acc.toggleClass('et-picker-groups-collapsed', !nowCollapsed);
            const will = !nowCollapsed;
            getSettings().pickerGroupsCollapsed = will;
            saveSettings();
            $picker.find('#et-picker-groups-toggle').attr({ 'aria-expanded': will ? 'false' : 'true', title: will ? 'Expand group chats' : 'Collapse group chats' });
        });

        // ── Star / Favorite ───────────────────────────────────────────
        let _starTimers = {};
        $picker.on('click', '.et-char-picker-star-btn', function (e) {
            e.stopPropagation();
            const $star = jQuery(this);
            const charKey = $star.data('char-key');
            if (!charKey) return;
            if (!Array.isArray(getSettings().pickerFavorites)) getSettings().pickerFavorites = [];
            const isFav = getSettings().pickerFavorites.includes(charKey);
            if (!isFav) {
                getSettings().pickerFavorites.push(charKey);
                saveSettings();
                $star.addClass('et-char-picker-star-pop');
                setTimeout(() => openEmbeddedCharacterPicker(), 320);
            } else {
                if ($star.hasClass('et-char-picker-star-confirming')) {
                    clearTimeout(_starTimers[charKey]);
                    delete _starTimers[charKey];
                    $star.addClass('et-char-picker-star-removing');
                    setTimeout(() => {
                        getSettings().pickerFavorites = getSettings().pickerFavorites.filter(k => k !== charKey);
                        saveSettings();
                        openEmbeddedCharacterPicker();
                    }, 260);
                } else {
                    $star.addClass('et-char-picker-star-confirming');
                    _starTimers[charKey] = setTimeout(() => {
                        $star.removeClass('et-char-picker-star-confirming');
                        delete _starTimers[charKey];
                    }, 2000);
                }
            }
        });

        // ── Character / group selection ───────────────────────────────
        $picker.on('click', '.et-char-picker-item', function (e) {
            e.stopPropagation();
            const $btn = jQuery(this);
            const groupId = $btn.data('group-id');
            if (groupId != null && groupId !== '') {
                setSelectedCharacterKey(null);
                if (getGroupManager()) {
                    getGroupManager().setOverrideGroupId(groupId);
                    getGroupManager().ensureActiveChar();
                }
                applySelectedCharacterToPanel();
                if (getGroupManager() && isPanelOpen()) {
                    getGroupManager().renderGroupBar(getGroupManager().getActiveCharKey());
                    getGroupManager().bindGroupBarEvents(
                        (getSwitchGroupCharFn() || function(){}),
                        (getOnCombineModeToggleFn() || function(){}),
                        (getTriggerManualCombineCharFn() || function(){})
                    );
                    if (typeof renderGroupUnreadIndicators === 'function') renderGroupUnreadIndicators();
                }
                return;
            }
            const index = Number($btn.data('char-index'));
            if (Number.isNaN(index)) return;
            const selectedChar = getAllCharactersForPicker().find(char => char.__index === index);
            if (!selectedChar) { toastr.error('Failed to select character.'); return; }
            if (getGroupManager()) getGroupManager().setOverrideGroupId(null);
            setSelectedCharacterKey(selectedChar.__key);
            applySelectedCharacterToPanel();
            if (isPanelOpen()) jQuery('#et-group-bar').remove();
        });
    }

            return {
                getAllCharactersForPicker,
                getAvatarUrlForCharacter,
                openCharacterPicker,
                openEmbeddedCharacterPicker,
                closeCharacterPicker,
                toggleCharacterPicker,
                _pickerAvatarBg
            };
        }
    };
})();
