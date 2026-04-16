(function () {
    'use strict';

    function createGallery(api) {
        const {
            getSettings,
            saveSettings,
            getCurrentCharacter,
            getCharacterKey,
            getCharacterName,
            getAvatarUrlForCharacter,
            openGeneratedImageLightbox
        } = api;

        const SORT_OPTIONS = {
            newest: { label: 'Newest', compare: (a, b) => (b.createdAt || 0) - (a.createdAt || 0) },
            oldest: { label: 'Oldest', compare: (a, b) => (a.createdAt || 0) - (b.createdAt || 0) },
            name_asc: { label: 'Name A–Z', compare: (a, b) => String(a.title || '').localeCompare(String(b.title || ''), undefined, { sensitivity: 'base', numeric: true }) },
            name_desc: { label: 'Name Z–A', compare: (a, b) => String(b.title || '').localeCompare(String(a.title || ''), undefined, { sensitivity: 'base', numeric: true }) },
            prompt_asc: { label: 'Prompt A–Z', compare: (a, b) => String(a.prompt || '').localeCompare(String(b.prompt || ''), undefined, { sensitivity: 'base', numeric: true }) }
        };

        function settings() {
            return getSettings();
        }

        function ensureStore() {
            const s = settings();
            if (!s.characterGalleries || typeof s.characterGalleries !== 'object' || Array.isArray(s.characterGalleries)) {
                s.characterGalleries = {};
            }
            return s.characterGalleries;
        }

        function ensurePrefs() {
            const s = settings();
            if (!s.galleryPrefs || typeof s.galleryPrefs !== 'object' || Array.isArray(s.galleryPrefs)) {
                s.galleryPrefs = { sortBy: 'newest', view: 'grid', thumbSize: 240 };
            }
            if (!s.galleryPrefs.sortBy || !SORT_OPTIONS[s.galleryPrefs.sortBy]) s.galleryPrefs.sortBy = 'newest';
            if (!s.galleryPrefs.view) s.galleryPrefs.view = 'grid';
            const thumb = Number(s.galleryPrefs.thumbSize);
            s.galleryPrefs.thumbSize = Number.isFinite(thumb) ? Math.max(160, Math.min(340, Math.round(thumb))) : 240;
            return s.galleryPrefs;
        }

        function ensureDescriptionOverrides() {
            const s = settings();
            if (!s.galleryDescriptionOverrides || typeof s.galleryDescriptionOverrides !== 'object' || Array.isArray(s.galleryDescriptionOverrides)) {
                s.galleryDescriptionOverrides = {};
            }
            return s.galleryDescriptionOverrides;
        }

        function getDescriptionOverride(characterKey) {
            if (!characterKey) return '';
            const overrides = ensureDescriptionOverrides();
            return typeof overrides[characterKey] === 'string' ? overrides[characterKey] : '';
        }

        function setDescriptionOverride(characterKey, text) {
            if (!characterKey) return;
            const overrides = ensureDescriptionOverrides();
            const trimmed = String(text || '').trim();
            if (trimmed) {
                overrides[characterKey] = trimmed;
            } else {
                delete overrides[characterKey];
            }
            saveSettings();
        }

        function escapeHtml(value) {
            return String(value || '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/\"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        function formatDate(ts) {
            if (!ts) return 'Unknown date';
            const d = new Date(ts);
            return d.toLocaleString(undefined, {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: 'numeric',
                minute: '2-digit'
            });
        }

        function makeId() {
            return 'gal_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        }

        function getGalleryItems(characterKey) {
            if (!characterKey) return [];
            const store = ensureStore();
            const items = Array.isArray(store[characterKey]) ? store[characterKey] : [];
            return items.slice();
        }

        function saveGalleryItems(characterKey, items) {
            if (!characterKey) return;
            const store = ensureStore();
            store[characterKey] = Array.isArray(items) ? items : [];
            saveSettings();
        }

        function deriveDefaultTitle(prompt, index) {
            const clean = String(prompt || '').trim();
            if (!clean) return `Generated Image ${index}`;
            return clean.length > 52 ? clean.slice(0, 49).trim() + '…' : clean;
        }

        function addImage(entry) {
            const charKey = entry?.charKey || getCharacterKey();
            if (!charKey || !entry?.url) return null;
            const existing = getGalleryItems(charKey);
            const item = {
                id: makeId(),
                charKey,
                charName: entry.charName || getCharacterName() || 'Character',
                avatarUrl: entry.avatarUrl || '',
                title: entry.title || deriveDefaultTitle(entry.prompt, existing.length + 1),
                prompt: entry.prompt || '',
                url: entry.url,
                mimeType: entry.mimeType || 'image/png',
                triggerType: entry.triggerType || 'generated',
                sourceMessageId: entry.sourceMessageId || null,
                createdAt: entry.createdAt || Date.now(),
                updatedAt: Date.now()
            };
            existing.unshift(item);
            saveGalleryItems(charKey, existing);
            return item;
        }

        function renameImage(imageId, newTitle) {
            const charKey = getCharacterKey();
            if (!charKey || !imageId) return false;
            const items = getGalleryItems(charKey);
            const item = items.find(x => x.id === imageId);
            if (!item) return false;
            item.title = String(newTitle || '').trim() || item.title || 'Untitled Image';
            item.updatedAt = Date.now();
            saveGalleryItems(charKey, items);
            return true;
        }

        function deleteImage(imageId) {
            const charKey = getCharacterKey();
            if (!charKey || !imageId) return false;
            const items = getGalleryItems(charKey);
            const next = items.filter(x => x.id !== imageId);
            if (next.length === items.length) return false;
            saveGalleryItems(charKey, next);
            return true;
        }

        function getSortedItems(charKey) {
            const prefs = ensurePrefs();
            const sorter = SORT_OPTIONS[prefs.sortBy] || SORT_OPTIONS.newest;
            return getGalleryItems(charKey).sort(sorter.compare);
        }

        function buildSortOptionsHtml() {
            return Object.entries(SORT_OPTIONS).map(([key, def]) => `<option value="${key}">${escapeHtml(def.label)}</option>`).join('');
        }

        function buildCardHtml(item) {
            const isMobile = !!document.getElementById('et-mobile-styles');
            const title = escapeHtml(item.title || 'Untitled Image');
            const prompt = escapeHtml(item.prompt || 'No prompt saved');
            const encodedPrompt = encodeURIComponent(String(item.prompt || ''));
            const safeUrl = escapeHtml(item.url || '');
            const date = escapeHtml(formatDate(item.createdAt));

            // On mobile: render prompt inline (always visible), skip the collapsible accordion
            const promptHtml = isMobile
                ? `<div class="et-gallery-prompt-block">
                        <div class="et-gallery-prompt-block-header">
                            <i class="fa-solid fa-wand-magic-sparkles"></i>
                            <span>Prompt</span>
                            <button type="button" class="et-gallery-prompt-copy-btn" data-gallery-copy-prompt="${encodedPrompt}" title="Copy prompt to clipboard"><i class="fa-regular fa-copy"></i></button>
                        </div>
                        <div class="et-gallery-prompt-text">${prompt}</div>
                   </div>`
                : `<details class="et-gallery-prompt-accordion">
                        <summary>
                            <i class="fa-solid fa-wand-magic-sparkles"></i>
                            <span>Prompt Details</span>
                            <button type="button" class="et-gallery-prompt-copy-btn" data-gallery-copy-prompt="${encodedPrompt}" title="Copy prompt to clipboard"><i class="fa-regular fa-copy"></i></button>
                            <i class="fa-solid fa-chevron-down et-gallery-prompt-chevron"></i>
                        </summary>
                        <div class="et-gallery-prompt-text">${prompt}</div>
                   </details>`;

            return `
                <article class="et-gallery-card" data-gallery-id="${item.id}">
                    <button class="et-gallery-thumb-btn" data-gallery-open="${item.id}" title="Open image">
                        <img src="${safeUrl}" alt="${title}" class="et-gallery-thumb">
                    </button>
                    <div class="et-gallery-card-body">
                        <div class="et-gallery-title-row">
                            <label class="et-gallery-title-label" for="et-gallery-title-${item.id}"><i class="fa-solid fa-pen"></i> Title</label>
                            ${isMobile ? '' : '<span class="et-gallery-title-edit-hint"><i class="fa-regular fa-keyboard"></i> Press Enter to save</span>'}
                        </div>
                        <input id="et-gallery-title-${item.id}" class="et-gallery-title-input" data-gallery-rename="${item.id}" data-original-title="${title}" type="text" maxlength="80" value="${title}" aria-label="Image title" title="Click to edit image title">
                        <div class="et-gallery-rename-feedback" data-gallery-rename-feedback="${item.id}"><i class="fa-solid fa-check"></i><span>Saved</span></div>
                        ${promptHtml}
                        <div class="et-gallery-meta-row">
                            <span class="et-gallery-meta-pill"><i class="fa-regular fa-clock"></i>${date}</span>
                            <button class="et-gallery-delete-btn" data-gallery-delete="${item.id}" title="Delete image"><i class="fa-solid fa-trash"></i></button>
                        </div>
                    </div>
                </article>
            `;
        }

        function buildDescriptionOverrideHtml(charKey) {
            const override = getDescriptionOverride(charKey);
            const hasOverride = !!override;
            const safeOverride = escapeHtml(override);
            return `
                <div class="et-gallery-override-section" id="et-gallery-override-section">
                    <div class="et-gallery-override-header">
                        <button type="button" class="et-gallery-override-toggle" id="et-gallery-override-toggle" aria-expanded="${hasOverride ? 'true' : 'false'}" title="${hasOverride ? 'Description override is active — click to edit' : 'Set a custom description for image generation'}">
                            <span class="et-gallery-override-toggle-icon"><i class="fa-solid fa-id-card"></i></span>
                            <span class="et-gallery-override-toggle-label">Description Override</span>
                            ${hasOverride ? '<span class="et-gallery-override-badge"><i class="fa-solid fa-circle-check"></i> Active</span>' : '<span class="et-gallery-override-badge et-gallery-override-badge-inactive"><i class="fa-solid fa-circle"></i> Off</span>'}
                            <i class="fa-solid fa-chevron-down et-gallery-override-chevron"></i>
                        </button>
                        ${hasOverride ? '<button type="button" class="et-gallery-override-deactivate-btn" id="et-gallery-override-deactivate-btn" title="Deactivate override"><i class="fa-solid fa-xmark"></i> Deactivate</button>' : ''}
                    </div>
                    <div class="et-gallery-override-panel" id="et-gallery-override-panel" ${hasOverride ? '' : 'hidden'}>
                        <p class="et-gallery-override-hint"><i class="fa-solid fa-circle-info"></i> This description is used <em>instead</em> of the character's SillyTavern description when generating images. Leave blank to use the default.</p>
                        <textarea
                            id="et-gallery-override-textarea"
                            class="et-gallery-override-textarea"
                            placeholder="e.g. tall woman with long auburn hair, green eyes, freckles, wearing a casual denim jacket..."
                            rows="4"
                            maxlength="2000"
                        >${safeOverride}</textarea>
                        <div class="et-gallery-override-actions">
                            <button type="button" class="et-gallery-override-reset-btn" id="et-gallery-override-reset-btn" ${hasOverride ? '' : 'disabled'} title="Remove override and use character's default description">
                                <i class="fa-solid fa-rotate-left"></i> Reset
                            </button>
                            <button type="button" class="et-gallery-override-save-btn" id="et-gallery-override-save-btn">
                                <i class="fa-solid fa-floppy-disk"></i> Save Override
                            </button>
                        </div>
                        <div class="et-gallery-override-feedback" id="et-gallery-override-feedback" aria-live="polite"></div>
                    </div>
                </div>
            `;
        }

        function buildModalHtml() {
            const char = getCurrentCharacter();
            const charKey = getCharacterKey();
            const charName = getCharacterName() || 'Character';
            const avatarUrl = char ? (getAvatarUrlForCharacter(char) || '') : '';
            const prefs = ensurePrefs();
            const isList = prefs.view === 'list';
            const nextView = isList ? 'grid' : 'list';
            const items = getSortedItems(charKey);
            const cards = items.length
                ? items.map(buildCardHtml).join('')
                : `<div class="et-gallery-empty"><i class="fa-regular fa-images"></i><p>No generated images yet for ${escapeHtml(charName)}.</p><span>Ask ${escapeHtml(charName)} for a selfie, photo, drawing, or portrait to start this gallery.</span></div>`;

            return `
                <div class="et-gallery-overlay" id="et-gallery-overlay">
                    <div class="et-gallery-modal ${prefs.view === 'list' ? 'et-gallery-view-list' : 'et-gallery-view-grid'}" id="et-gallery-modal" style="--et-gallery-thumb-size:${prefs.thumbSize}px;">
                        <div class="et-gallery-header">
                            <div class="et-gallery-header-main">
                                <div class="et-gallery-avatar">${avatarUrl ? `<img src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(charName)}">` : `<span>${escapeHtml(charName.charAt(0) || '?')}</span>`}</div>
                                <div class="et-gallery-header-copy">
                                    <h2>Gallery - ${escapeHtml(charName)}</h2>
                                    <p>${items.length} ${items.length === 1 ? 'image' : 'images'} saved</p>
                                </div>
                            </div>
                            <div class="et-gallery-toolbar">
                                <label class="et-gallery-sort-wrap">
                                    <span>Sort</span>
                                    <select id="et-gallery-sort">${buildSortOptionsHtml()}</select>
                                </label>
                                <button type="button" class="et-gallery-view-pill" id="et-gallery-view-pill" title="Toggle grid / list view" data-current-view="${prefs.view || 'grid'}">
                                    <span class="et-gallery-view-pill-opt" data-view="grid" aria-hidden="true"><i class="fa-solid fa-grip"></i></span>
                                    <span class="et-gallery-view-pill-opt" data-view="list" aria-hidden="true"><i class="fa-solid fa-list"></i></span>
                                    <span class="et-gallery-view-pill-track" aria-hidden="true"></span>
                                </button>
                                <div class="et-gallery-size-wrap" id="et-gallery-size-wrap">
                                    <button type="button" class="et-gallery-size-btn" id="et-gallery-size-btn" title="Adjust thumbnail size"><i class="fa-solid fa-sliders"></i></button>
                                    <div class="et-gallery-size-panel" id="et-gallery-size-panel" aria-hidden="true">
                                        <div class="et-gallery-size-panel-title">Thumbnail Size</div>
                                        <div class="et-gallery-size-slider-vertical-wrap">
                                            <span id="et-gallery-size-val" class="et-gallery-size-val">${prefs.thumbSize}px</span>
                                            <span class="et-gallery-size-hint-top">L</span>
                                            <div class="et-gallery-size-track-wrap">
                                                <input id="et-gallery-size-range" class="et-gallery-size-range" type="range" min="160" max="340" step="10" value="${prefs.thumbSize}" style="width: 200px !important; height: 24px !important; min-width: 200px !important; max-width: 200px !important; background: transparent !important; -webkit-appearance: none !important; appearance: none !important;">
                                            </div>
                                            <span class="et-gallery-size-hint-label">S</span>
                                        </div>
                                    </div>
                                </div>
                                <button type="button" class="et-gallery-close" id="et-gallery-close" title="Close"><i class="fa-solid fa-xmark"></i></button>
                            </div>
                        </div>
                        <div class="et-gallery-body">
                            <div class="et-gallery-stats-row">
                                <span class="et-gallery-stat"><i class="fa-solid fa-image"></i>${items.length} saved</span>
                                <span class="et-gallery-stat"><i class="fa-solid fa-clock-rotate-left"></i>Latest ${items[0] ? escapeHtml(formatDate(items[0].createdAt)) : '—'}</span>
                            </div>
                            ${buildDescriptionOverrideHtml(charKey)}
                            <div class="et-gallery-grid" id="et-gallery-grid">${cards}</div>
                        </div>
                    </div>
                </div>
            `;
        }

        function closeGalleryModal() {
            const overlay = jQuery('#et-gallery-overlay');
            overlay.removeClass('et-gallery-overlay-open').addClass('et-gallery-overlay-closing');
            setTimeout(() => overlay.remove(), 220);
        }

        function refreshGalleryList() {
            const charKey = getCharacterKey();
            const items = getSortedItems(charKey);
            const charName = getCharacterName() || 'Character';
            const cards = items.length
                ? items.map(buildCardHtml).join('')
                : `<div class="et-gallery-empty"><i class="fa-regular fa-images"></i><p>No generated images yet for ${escapeHtml(charName)}.</p><span>Ask ${escapeHtml(charName)} for a selfie, photo, drawing, or portrait to start this gallery.</span></div>`;

            jQuery('#et-gallery-grid').html(cards);
            jQuery('.et-gallery-header-copy p').text(`${items.length} ${items.length === 1 ? 'image' : 'images'} saved`);
            jQuery('.et-gallery-stat').eq(0).html(`<i class="fa-solid fa-image"></i>${items.length} saved`);
            jQuery('.et-gallery-stat').eq(1).html(`<i class="fa-solid fa-clock-rotate-left"></i>Latest ${items[0] ? escapeHtml(formatDate(items[0].createdAt)) : '—'}`);

            bindListEvents();
        }

        function applyViewToggleState() {
            const prefs = ensurePrefs();
            const view = prefs.view || 'grid';
            const pill = jQuery('#et-gallery-view-pill');
            pill.attr('data-current-view', view);
            pill.find('.et-gallery-view-pill-opt').each(function () {
                jQuery(this).toggleClass('et-gallery-view-pill-active', jQuery(this).data('view') === view);
            });
        }

        function applyThumbSizePreview(size) {
            const clamped = Math.max(160, Math.min(340, Math.round(Number(size) || 240)));
            // Use style.setProperty() — jQuery's .css() does not reliably write CSS
            // custom properties (double-dash vars) in all jQuery versions.
            const modal = document.getElementById('et-gallery-modal');
            if (modal) modal.style.setProperty('--et-gallery-thumb-size', `${clamped}px`);
            jQuery('#et-gallery-size-range').val(clamped);
            jQuery('#et-gallery-size-val').text(`${clamped}px`);
            // Update the filled-portion gradient on the track (min=160, max=340, range=180)
            const pct = Math.round(((clamped - 160) / 180) * 100);
            const rangeEl = document.getElementById('et-gallery-size-range');
            if (rangeEl) rangeEl.style.setProperty('--et-slider-pct', `${pct}%`);
            return clamped;
        }

        function closeThumbSizePanel() {
            jQuery('#et-gallery-size-wrap').removeClass('et-gallery-size-open');
            jQuery('#et-gallery-size-panel').attr('aria-hidden', 'true');
        }

        function openThumbSizePanel() {
            jQuery('#et-gallery-size-wrap').addClass('et-gallery-size-open');
            jQuery('#et-gallery-size-panel').attr('aria-hidden', 'false');
        }

        function showRenameSavedState(input) {
            const id = input.data('gallery-rename');
            const feedback = jQuery(`[data-gallery-rename-feedback="${id}"]`);
            input.addClass('et-gallery-title-saved');
            feedback.addClass('et-gallery-rename-feedback-show');
            setTimeout(() => {
                input.removeClass('et-gallery-title-saved');
                feedback.removeClass('et-gallery-rename-feedback-show');
            }, 900);
        }

        function commitRename(input, force) {
            const id = input.data('gallery-rename');
            const current = String(input.val() || '').trim();
            const original = String(input.attr('data-original-title') || '').trim();

            if (!force && current === original) return;

            const didRename = renameImage(id, current);
            if (!didRename) return;

            const finalValue = String(input.val() || '').trim() || original || 'Untitled Image';
            input.val(finalValue).attr('data-original-title', finalValue);
            showRenameSavedState(input);
        }

        function bindListEvents() {
            let pendingDeleteId = null;
            let pendingDeleteTimer = null;

            function clearDeleteConfirmState() {
                pendingDeleteId = null;
                if (pendingDeleteTimer) {
                    clearTimeout(pendingDeleteTimer);
                    pendingDeleteTimer = null;
                }
                jQuery('[data-gallery-delete]').removeClass('et-gallery-delete-btn-confirm').attr('title', 'Delete image').html('<i class="fa-solid fa-trash"></i>');
            }

            jQuery('[data-gallery-open]').off('.et-gallery').on('click.et-gallery', function () {
                const charKey = getCharacterKey();
                const imageId = jQuery(this).data('gallery-open');
                const items = getSortedItems(charKey);
                const item = items.find(x => x.id === imageId);
                if (!item) return;
                const navItems = items.map(i => ({ url: i.url, prompt: i.prompt || '', title: i.title || '' }));
                const navIndex = items.findIndex(x => x.id === imageId);
                openGeneratedImageLightbox(item.url, item.prompt || '', {
                    source: 'gallery',
                    title: item.title || 'Untitled Image',
                    navItems,
                    navIndex: navIndex >= 0 ? navIndex : 0
                });
            });

            jQuery('[data-gallery-delete]').off('.et-gallery').on('click.et-gallery', function () {
                const btn = jQuery(this);
                const id = jQuery(this).data('gallery-delete');
                if (!id) return;

                if (pendingDeleteId === id) {
                    clearDeleteConfirmState();
                    deleteImage(id);
                    refreshGalleryList();
                    return;
                }

                clearDeleteConfirmState();
                pendingDeleteId = id;
                btn.addClass('et-gallery-delete-btn-confirm')
                   .attr('title', 'Click again to delete')
                   .html('<i class="fa-solid fa-trash-can"></i><span class="et-gallery-delete-confirm-label">Delete?</span>');
                pendingDeleteTimer = setTimeout(clearDeleteConfirmState, 2800);
            });

            jQuery('[data-gallery-rename]')
                .off('.et-gallery')
                .on('focus.et-gallery', function () {
                    const input = jQuery(this);
                    input.addClass('et-gallery-title-editing');
                    // Auto-select all text on focus. Timeout ensures the keyboard
                    // interaction doesn't clear the selection immediately.
                    setTimeout(() => input.select(), 50);
                })
                .on('blur.et-gallery', function () {
                    const input = jQuery(this);
                    input.removeClass('et-gallery-title-editing');
                    const current = String(input.val() || '').trim();
                    const original = String(input.attr('data-original-title') || '').trim();
                    
                    if (current === original) {
                        // Ensure input shows original if no changes were actually committed
                        input.val(original);
                    } else {
                        commitRename(input, false);
                    }
                })
                .on('keydown.et-gallery', function (e) {
                    const input = jQuery(this);
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        commitRename(input, true);
                        input.blur();
                    } else if (e.key === 'Escape') {
                        e.preventDefault();
                        input.val(input.attr('data-original-title') || '');
                        input.blur();
                    }
                });

            jQuery('[data-gallery-copy-prompt]').off('.et-gallery').on('click.et-gallery', function (e) {
                e.preventDefault();
                e.stopPropagation();
                const btn = jQuery(this);
                const promptText = decodeURIComponent(String(btn.data('gallery-copy-prompt') || ''));
                if (!promptText) return;

                // Robust copy: try modern Clipboard API first, fall back to
                // execCommand for HTTP contexts (e.g. local LAN iOS Safari).
                function doFallbackCopy(text) {
                    try {
                        const ta = document.createElement('textarea');
                        ta.value = text;
                        ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;';
                        document.body.appendChild(ta);
                        ta.focus();
                        ta.select();
                        document.execCommand('copy');
                        document.body.removeChild(ta);
                        return true;
                    } catch (_) { return false; }
                }

                function showCopySuccess() {
                    btn.addClass('et-gallery-prompt-copy-done').html('<i class="fa-solid fa-check"></i>');
                    setTimeout(() => {
                        btn.removeClass('et-gallery-prompt-copy-done').html('<i class="fa-regular fa-copy"></i>');
                    }, 1600);
                }

                if (navigator.clipboard && window.isSecureContext) {
                    navigator.clipboard.writeText(promptText).then(showCopySuccess).catch(() => {
                        doFallbackCopy(promptText) && showCopySuccess();
                    });
                } else {
                    doFallbackCopy(promptText) && showCopySuccess();
                }
            });
        }

        function bindOverrideEvents() {
            const charKey = getCharacterKey();

            // Toggle panel open/closed
            jQuery('#et-gallery-override-toggle').on('click.et-gallery', function () {
                const panel = jQuery('#et-gallery-override-panel');
                const btn = jQuery(this);
                const isHidden = panel.is('[hidden]');
                if (isHidden) {
                    panel.removeAttr('hidden');
                    btn.attr('aria-expanded', 'true');
                } else {
                    panel.attr('hidden', '');
                    btn.attr('aria-expanded', 'false');
                }
            });

            // Save override
            jQuery('#et-gallery-override-save-btn').on('click.et-gallery', function () {
                const text = String(jQuery('#et-gallery-override-textarea').val() || '').trim();
                setDescriptionOverride(charKey, text);
                updateOverrideBadge(!!text);
                jQuery('#et-gallery-override-reset-btn').prop('disabled', !text);
                showOverrideFeedback(text
                    ? '<i class="fa-solid fa-circle-check"></i> Override saved — will be used for image generation.'
                    : '<i class="fa-solid fa-circle-info"></i> Override cleared — default description will be used.',
                    text ? 'success' : 'info'
                );
            });

            // Reset override
            jQuery('#et-gallery-override-reset-btn').on('click.et-gallery', function () {
                jQuery('#et-gallery-override-textarea').val('');
                setDescriptionOverride(charKey, '');
                updateOverrideBadge(false);
                jQuery(this).prop('disabled', true);
                showOverrideFeedback('<i class="fa-solid fa-rotate-left"></i> Override removed — default description will be used.', 'info');
            });

            // Deactivate override (from collapsed header)
            jQuery(document).on('click.et-gallery', '#et-gallery-override-deactivate-btn', function () {
                jQuery('#et-gallery-override-textarea').val('');
                setDescriptionOverride(charKey, '');
                updateOverrideBadge(false);
                jQuery('#et-gallery-override-reset-btn').prop('disabled', true);
                // Collapse the panel
                jQuery('#et-gallery-override-panel').attr('hidden', '');
                jQuery('#et-gallery-override-toggle').attr('aria-expanded', 'false');
                // Hide the deactivate button itself
                jQuery('#et-gallery-override-deactivate-btn').remove();
                showOverrideFeedback('<i class="fa-solid fa-circle-xmark"></i> Override deactivated — default description will be used.', 'info');
            });

            // Enable/disable reset based on textarea content
            jQuery('#et-gallery-override-textarea').on('input.et-gallery', function () {
                const hasContent = String(jQuery(this).val() || '').trim().length > 0;
                // Only enable reset if there's a *saved* override (not just typed text)
                const savedOverride = getDescriptionOverride(charKey);
                jQuery('#et-gallery-override-reset-btn').prop('disabled', !savedOverride);
            });
        }

        function updateOverrideBadge(isActive) {
            const badge = jQuery('#et-gallery-override-toggle .et-gallery-override-badge');
            const header = jQuery('#et-gallery-override-header, .et-gallery-override-header');
            if (isActive) {
                badge.removeClass('et-gallery-override-badge-inactive')
                     .html('<i class="fa-solid fa-circle-check"></i> Active');
                // Add deactivate button if not already present
                if (!jQuery('#et-gallery-override-deactivate-btn').length) {
                    jQuery('#et-gallery-override-toggle').after(
                        '<button type="button" class="et-gallery-override-deactivate-btn" id="et-gallery-override-deactivate-btn" title="Deactivate override"><i class="fa-solid fa-xmark"></i> Deactivate</button>'
                    );
                }
            } else {
                badge.addClass('et-gallery-override-badge-inactive')
                     .html('<i class="fa-solid fa-circle"></i> Off');
                jQuery('#et-gallery-override-deactivate-btn').remove();
            }
        }

        function showOverrideFeedback(html, type) {
            const fb = jQuery('#et-gallery-override-feedback');
            fb.removeClass('et-gallery-override-feedback-success et-gallery-override-feedback-info')
              .addClass(type === 'success' ? 'et-gallery-override-feedback-success' : 'et-gallery-override-feedback-info')
              .html(html)
              .addClass('et-gallery-override-feedback-show');
            clearTimeout(fb.data('et-feedback-timer'));
            fb.data('et-feedback-timer', setTimeout(() => {
                fb.removeClass('et-gallery-override-feedback-show');
            }, 3000));
        }

        function bindModalEvents() {
            const prefs = ensurePrefs();
            jQuery('#et-gallery-sort').val(prefs.sortBy || 'newest');

            jQuery('#et-gallery-close').on('click', closeGalleryModal);
            jQuery('#et-gallery-overlay').on('click', function (e) {
                if (e.target === this) closeGalleryModal();
            });

            const onKey = (e) => {
                if (e.key === 'Escape') {
                    document.removeEventListener('keydown', onKey);
                    closeGalleryModal();
                }
            };
            document.addEventListener('keydown', onKey);

            jQuery('#et-gallery-sort').on('change', function () {
                ensurePrefs().sortBy = jQuery(this).val();
                saveSettings();
                refreshGalleryList();
            });

            // Pill view toggle — single button click toggles between grid and list.
            // On mobile the toggle is hidden via CSS and grid is always forced.
            jQuery('#et-gallery-view-pill').on('click', function () {
                // Guard: on mobile the button is hidden but may still fire via
                // assistive tech. Detect mobile by the injected stylesheet id.
                if (document.getElementById('et-mobile-styles')) return;

                const current = jQuery(this).attr('data-current-view') || 'grid';
                const view = current === 'grid' ? 'list' : 'grid';
                ensurePrefs().view = view;
                saveSettings();
                const modal = jQuery('#et-gallery-modal');
                modal.toggleClass('et-gallery-view-list', view === 'list');
                modal.toggleClass('et-gallery-view-grid', view !== 'list');
                applyViewToggleState();
            });

            // On mobile: reset any saved list preference back to grid so the
            // modal never opens in list mode (toggle is hidden, user can't fix it).
            if (document.getElementById('et-mobile-styles')) {
                const mobilePrefs = ensurePrefs();
                if (mobilePrefs.view !== 'grid') {
                    mobilePrefs.view = 'grid';
                    saveSettings();
                }
                jQuery('#et-gallery-modal')
                    .removeClass('et-gallery-view-list')
                    .addClass('et-gallery-view-grid');
                applyViewToggleState();
            }

            // Vertical size slider — auto-save on input (no Save button)
            jQuery('#et-gallery-size-btn').on('click', function (e) {
                e.stopPropagation();
                const wrap = jQuery('#et-gallery-size-wrap');
                if (wrap.hasClass('et-gallery-size-open')) {
                    closeThumbSizePanel();
                } else {
                    openThumbSizePanel();
                }
            });

            jQuery('#et-gallery-size-range')
                .on('input', function () {
                    const saved = applyThumbSizePreview(jQuery(this).val());
                    ensurePrefs().thumbSize = saved;
                })
                .on('change', function () {
                    saveSettings();
                });

            jQuery('#et-gallery-modal').on('click', function (e) {
                if (!jQuery(e.target).closest('#et-gallery-size-wrap').length) {
                    closeThumbSizePanel();
                }
            });

            applyViewToggleState();
            applyThumbSizePreview(ensurePrefs().thumbSize || 240);

            bindOverrideEvents();
            bindListEvents();
        }

        function openGalleryModal() {
            jQuery('#et-gallery-overlay').remove();
            jQuery('body').append(buildModalHtml());
            requestAnimationFrame(() => jQuery('#et-gallery-overlay').addClass('et-gallery-overlay-open'));
            bindModalEvents();

            // On mobile, force scroll to the start so the first (newest) image is shown.
            // A small timeout is required — rAF alone fires before flex layout is calculated
            // and the browser may restore a prior scroll position.
            if (document.getElementById('et-mobile-styles')) {
                setTimeout(() => {
                    const grid = document.getElementById('et-gallery-grid');
                    if (grid) {
                        grid.scrollLeft = 0;
                        grid.scrollTo({ left: 0, behavior: 'instant' });
                    }
                }, 80);
            }
        }

        return {
            addImage,
            openGalleryModal,
            renameImage,
            deleteImage,
            getGalleryItems,
            getDescriptionOverride
        };
    }

    window.EchoTextGallery = { createGallery };
})();
