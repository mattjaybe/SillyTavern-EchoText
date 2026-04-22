(function () {
    'use strict';

    // ============================================================
    // EchoText Theme Editor
    // Manages user-created custom themes. Custom themes are stored
    // in settings.customThemes (an object keyed by 'custom_<id>').
    // Each custom theme has: label, description, primary, secondary,
    // text, accent, and swatches (auto-computed).
    //
    // Exposed as: window.EchoTextThemeEditor.createThemeEditor(api)
    // ============================================================

    function createThemeEditor(api) {
        const {
            getSettings,
            saveSettings,
            applyAppearanceSettings,
            refreshThemeDropdown,
            onThemeListChanged
        } = api;

        function settings() { return getSettings(); }

        // Sensible per-field defaults so color pickers start with meaningful values.
        const FIELD_DEFAULTS = {
            primary:   '#0a0e23',
            secondary: '#141c3c',
            text:      '#c8d8f8',
            accent:    '#4d8fff'
        };

        // ──────────────────────────────────────────────
        // Data helpers
        // ──────────────────────────────────────────────

        function getCustomThemes() {
            if (!settings().customThemes) settings().customThemes = {};
            return settings().customThemes;
        }

        function generateId() {
            return 'custom_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        }

        function computeSwatches(theme) {
            return [
                theme.primary   || FIELD_DEFAULTS.primary,
                theme.secondary || FIELD_DEFAULTS.secondary,
                theme.text      || FIELD_DEFAULTS.text,
                theme.accent    || FIELD_DEFAULTS.accent
            ];
        }

        function saveCustomTheme(id, data) {
            if (!settings().customThemes) settings().customThemes = {};
            settings().customThemes[id] = Object.assign({}, data, {
                swatches: computeSwatches(data)
            });
            saveSettings();
            onThemeListChanged();
        }

        function deleteCustomTheme(id) {
            if (!settings().customThemes) return;
            delete settings().customThemes[id];
            if (settings().theme === id) {
                settings().theme = 'sillytavern';
                applyAppearanceSettings();
            }
            saveSettings();
            onThemeListChanged();
        }

        // ──────────────────────────────────────────────
        // Color helpers
        // ──────────────────────────────────────────────

        // Convert any valid CSS color to '#rrggbb' for the native color picker.
        function cssColorToHex(cssColor) {
            if (!cssColor) return null;
            const s = cssColor.trim();
            if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(s)) {
                if (s.length === 4) {
                    return '#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3];
                }
                return s.toLowerCase();
            }
            const rgbMatch = s.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
            if (rgbMatch) {
                const toHex = n => parseInt(n).toString(16).padStart(2, '0');
                return '#' + toHex(rgbMatch[1]) + toHex(rgbMatch[2]) + toHex(rgbMatch[3]);
            }
            return null;
        }

        // Validate a CSS color string by probing a temporary element.
        function isValidCssColor(value) {
            if (!value || !value.trim()) return false;
            const tmp = document.createElement('div');
            tmp.style.color = '';
            tmp.style.color = value;
            return tmp.style.color !== '';
        }

        // Convert HSL to '#rrggbb'.
        function hslToHex(h, s, l) {
            h = ((h % 360) + 360) % 360;
            s = Math.max(0, Math.min(100, s)) / 100;
            l = Math.max(0, Math.min(100, l)) / 100;
            const a = s * Math.min(l, 1 - l);
            const f = n => {
                const k = (n + h / 30) % 12;
                const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
                return Math.round(255 * color).toString(16).padStart(2, '0');
            };
            return `#${f(0)}${f(8)}${f(4)}`;
        }

        // Generate a smart random palette.
        // Background is definitively dark (70% chance) or light (30% chance).
        // Text is the opposing lightness for contrast.
        // Secondary is a subtle tonal variant of the background.
        // Accent is vivid and truly random.
        function generateRandomColors() {
            const isDark = Math.random() < 0.7;
            const baseHue = Math.floor(Math.random() * 360);

            let primary, secondary, text;

            if (isDark) {
                const bgSat   = Math.floor(Math.random() * 35) + 5;   // 5–40%
                const bgLight = Math.floor(Math.random() * 10) + 4;   // 4–14%
                primary   = hslToHex(baseHue, bgSat, bgLight);
                secondary = hslToHex(baseHue, bgSat, bgLight + 7);
                const textLight = Math.floor(Math.random() * 15) + 78; // 78–93%
                text = hslToHex(baseHue, 12, textLight);
            } else {
                const bgSat   = Math.floor(Math.random() * 15) + 5;   // 5–20%
                const bgLight = Math.floor(Math.random() * 7) + 91;   // 91–98%
                primary   = hslToHex(baseHue, bgSat, bgLight);
                secondary = hslToHex(baseHue, bgSat + 5, bgLight - 8);
                const textLight = Math.floor(Math.random() * 10) + 5; // 5–15%
                text = hslToHex(baseHue, 18, textLight);
            }

            // Accent: vivid, any hue, high saturation
            const accentHue   = Math.floor(Math.random() * 360);
            const accentSat   = Math.floor(Math.random() * 20) + 75;  // 75–95%
            const accentLight = isDark
                ? Math.floor(Math.random() * 15) + 55   // 55–70% for dark bg
                : Math.floor(Math.random() * 15) + 30;  // 30–45% for light bg
            const accent = hslToHex(accentHue, accentSat, accentLight);

            return { primary, secondary, text, accent };
        }

        // Push randomized colors into the live editor DOM + refresh preview.
        function applyRandomizedColors(colors) {
            ['primary', 'secondary', 'text', 'accent'].forEach(f => {
                const hex = colors[f];
                jQuery(`.et-te-color-text[data-field="${f}"]`).val(hex);
                jQuery(`.et-te-color-picker[data-field="${f}"]`).val(hex);
                jQuery(`.et-te-color-row[data-field="${f}"] .et-te-color-preview`).css('background', hex);
            });
            updatePreviewFromDraft();
        }

        // ──────────────────────────────────────────────
        // Modal state
        // ──────────────────────────────────────────────

        let _editingId = null;       // null = adding new, string = editing existing
        let _previewId = null;       // id shown in read-only preview pane
        let _editorDraft = null;
        let _deleteConfirmId = null;
        let _deleteConfirmTimer = null;

        // ──────────────────────────────────────────────
        // HTML builders
        // ──────────────────────────────────────────────

        function escHtml(s) {
            return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        }

        function buildSwatchesHtml(theme) {
            return computeSwatches(theme).map(c =>
                `<span class="et-te-swatch" style="background:${escHtml(c)};"></span>`
            ).join('');
        }

        function buildColorRowHtml(fieldId, label, icon, value, hint) {
            const fallback = FIELD_DEFAULTS[fieldId] || '#4d8fff';
            const hexVal   = cssColorToHex(value) || fallback;
            const previewBg = value || fallback;
            const displayVal = value || fallback;  // Always show a real value so readDraftFromDom captures it
            return `
            <div class="et-te-color-row" data-field="${escHtml(fieldId)}">
                <div class="et-te-color-label">
                    <i class="fa-solid ${escHtml(icon)}"></i> ${escHtml(label)}
                    ${hint ? `<span class="et-te-color-hint">${escHtml(hint)}</span>` : ''}
                </div>
                <div class="et-te-color-inputs">
                    <div class="et-te-color-preview" style="background:${escHtml(previewBg)};"></div>
                    <input type="color"
                           class="et-te-color-picker"
                           data-field="${escHtml(fieldId)}"
                           value="${escHtml(hexVal)}"
                           title="Open color picker">
                    <input type="text"
                           class="et-te-color-text"
                           data-field="${escHtml(fieldId)}"
                           value="${escHtml(displayVal)}"
                           placeholder="${escHtml(fallback)}"
                           spellcheck="false"
                           autocomplete="off">
                </div>
            </div>`;
        }

        function buildEditorHtml(isNew) {
            const d = _editorDraft || { label: '', primary: '', secondary: '', text: '', accent: '', description: '' };
            const title = isNew ? '<i class="fa-solid fa-plus"></i> New Theme' : '<i class="fa-solid fa-pen"></i> Edit Theme';
            return `
            <div class="et-te-editor" id="et-te-editor">
                <div class="et-te-editor-header">${title}</div>

                <div class="et-te-editor-name-row">
                    <label class="et-te-editor-label">
                        <i class="fa-solid fa-tag"></i> Theme Name
                    </label>
                    <input type="text" id="et-te-name" class="et-te-name-input"
                           value="${escHtml(d.label)}"
                           placeholder="My Custom Theme"
                           maxlength="48">
                    <button class="et-te-btn et-te-btn-randomize" id="et-te-randomize" type="button">
                        <i class="fa-solid fa-shuffle"></i> Randomize Colors
                    </button>
                </div>

                <div class="et-te-editor-colors">
                    ${buildColorRowHtml('primary',   'Panel Background', 'fa-layer-group',         d.primary,   'Main panel bg — supports rgba() for transparency')}
                    ${buildColorRowHtml('secondary', 'Secondary BG',     'fa-clone',               d.secondary, 'Bubble backgrounds and sub-panels')}
                    ${buildColorRowHtml('text',      'Text Color',       'fa-font',                d.text,      'Message text and labels')}
                    ${buildColorRowHtml('accent',    'Accent Color',     'fa-wand-magic-sparkles', d.accent,    'Buttons, icons, and highlights')}
                </div>

                <details class="et-te-advanced" id="et-te-advanced">
                    <summary class="et-te-advanced-toggle">
                        <i class="fa-solid fa-code"></i> Advanced — Description
                    </summary>
                    <div class="et-te-advanced-body">
                        <label class="et-te-editor-label">Description</label>
                        <input type="text" id="et-te-description"
                               class="et-te-name-input"
                               value="${escHtml(d.description || '')}"
                               placeholder="Short description shown in the dropdown"
                               maxlength="80">
                    </div>
                </details>

                <div class="et-te-preview-block">
                    <div class="et-te-preview-label"><i class="fa-solid fa-eye"></i> Preview</div>
                    <div class="et-te-preview-strip" id="et-te-preview-strip">
                        ${buildPreviewStripHtml(d)}
                    </div>
                </div>

                <div class="et-te-editor-actions">
                    <button class="et-te-btn et-te-btn-cancel" id="et-te-cancel">Cancel</button>
                    <button class="et-te-btn et-te-btn-save"   id="et-te-save">
                        <i class="fa-solid fa-check"></i> Save Theme
                    </button>
                </div>
            </div>`;
        }

        function buildPreviewStripHtml(theme) {
            const swatches = computeSwatches(theme);
            return `
            <div class="et-te-preview-panel" style="background:${escHtml(swatches[0])};">
                <div class="et-te-preview-bubble et-te-preview-char" style="background:${escHtml(swatches[1])};color:${escHtml(swatches[2])};">
                    Hey, how's it going? 😊
                </div>
                <div class="et-te-preview-bubble et-te-preview-user" style="background:${escHtml(swatches[3])};color:#fff;">
                    Pretty good, thanks!
                </div>
            </div>
            <div class="et-te-preview-swatches">
                ${swatches.map((c, i) => `<div class="et-te-preview-swatch-wrap">
                    <span class="et-te-swatch et-te-swatch-lg" style="background:${escHtml(c)};"></span>
                    <span class="et-te-swatch-label">${['BG', 'Sec', 'Text', 'Accent'][i]}</span>
                </div>`).join('')}
            </div>`;
        }

        // Read-only preview pane shown when a theme item is clicked (not edited).
        function buildThemePreviewPaneHtml(id) {
            const t = getCustomThemes()[id];
            if (!t) return buildRightPaneEmptyHtml();
            const isActive = settings().theme === id;
            return `
            <div class="et-te-preview-pane" id="et-te-preview-pane" data-theme-id="${escHtml(id)}">
                <div class="et-te-pp-header">
                    <span class="et-te-pp-name">${escHtml(t.label || 'Unnamed Theme')}</span>
                    ${isActive ? '<span class="et-te-pp-active-badge"><i class="fa-solid fa-circle-check"></i> Active</span>' : ''}
                </div>
                ${t.description ? `<div class="et-te-pp-desc">${escHtml(t.description)}</div>` : ''}
                <div class="et-te-preview-strip et-te-pp-strip">
                    ${buildPreviewStripHtml(t)}
                </div>
                <div class="et-te-pp-actions">
                    <button class="et-te-btn et-te-btn-cancel et-te-pp-edit-btn" data-theme-id="${escHtml(id)}" type="button">
                        <i class="fa-solid fa-pen"></i> Edit
                    </button>
                    ${isActive
                        ? `<button class="et-te-btn et-te-btn-save et-te-pp-apply-btn et-te-pp-apply-active" data-theme-id="${escHtml(id)}" type="button" disabled>
                               <i class="fa-solid fa-circle-check"></i> Currently Active
                           </button>`
                        : `<button class="et-te-btn et-te-btn-save et-te-pp-apply-btn" data-theme-id="${escHtml(id)}" type="button">
                               <i class="fa-solid fa-wand-magic-sparkles"></i> Apply Theme
                           </button>`
                    }
                </div>
            </div>`;
        }

        function buildRightPaneEmptyHtml() {
            return `
            <div class="et-te-rp-empty">
                <i class="fa-solid fa-palette"></i>
                <span>Select a theme to preview it,<br>or create a new one.</span>
            </div>`;
        }

        function buildThemeListHtml() {
            const themes = getCustomThemes();
            const keys = Object.keys(themes);
            if (keys.length === 0) {
                return `<div class="et-te-empty">
                    <i class="fa-solid fa-palette"></i>
                    <span>No custom themes yet.<br>Add one to get started!</span>
                </div>`;
            }
            return keys.map(id => {
                const t = themes[id];
                const isActive   = settings().theme === id;
                const isSelected = _previewId === id || _editingId === id;
                return `
                <div class="et-te-item${isActive ? ' et-te-item-active' : ''}${isSelected ? ' et-te-item-selected' : ''}" data-theme-id="${escHtml(id)}">
                    <div class="et-te-item-swatches">${buildSwatchesHtml(t)}</div>
                    <div class="et-te-item-info">
                        <span class="et-te-item-name">${escHtml(t.label || 'Unnamed Theme')}</span>
                        ${isActive ? '<span class="et-te-item-badge">Active</span>' : ''}
                    </div>
                    <div class="et-te-item-actions">
                        <button class="et-te-icon-btn et-te-edit-btn" data-theme-id="${escHtml(id)}" title="Edit theme">
                            <i class="fa-solid fa-pen"></i>
                        </button>
                        <button class="et-te-icon-btn et-te-del-btn${_deleteConfirmId === id ? ' et-te-del-confirm' : ''}" data-theme-id="${escHtml(id)}" title="${_deleteConfirmId === id ? 'Click again to confirm deletion' : 'Delete theme'}">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </div>`;
            }).join('');
        }

        function buildModalHtml() {
            return `
            <div id="et-theme-editor-overlay" class="et-te-overlay">
                <div class="et-te-modal" role="dialog" aria-modal="true" aria-label="Custom Theme Editor">
                    <div class="et-te-modal-header">
                        <div class="et-te-modal-title">
                            <i class="fa-solid fa-palette"></i> Custom Themes
                        </div>
                        <button class="et-te-close" id="et-te-close" title="Close" aria-label="Close">
                            <i class="fa-solid fa-xmark"></i>
                        </button>
                    </div>
                    <div class="et-te-modal-body">
                        <div class="et-te-list-section">
                            <button class="et-te-btn et-te-btn-add" id="et-te-add">
                                <i class="fa-solid fa-plus"></i> Add New Theme
                            </button>
                            <div class="et-te-list" id="et-te-list">
                                ${buildThemeListHtml()}
                            </div>
                        </div>
                        <div class="et-te-editor-section" id="et-te-editor-section">
                            <!-- Preview or editor injected here -->
                        </div>
                    </div>
                </div>
            </div>`;
        }

        // ──────────────────────────────────────────────
        // Modal lifecycle
        // ──────────────────────────────────────────────

        function openThemeEditor() {
            jQuery('#et-theme-editor-overlay').remove();
            _editingId = null;
            _previewId = null;
            _editorDraft = null;
            _deleteConfirmId = null;

            jQuery('body').append(buildModalHtml());
            requestAnimationFrame(() => {
                jQuery('#et-theme-editor-overlay').addClass('et-te-overlay-open');
            });
            bindModalEvents();

            // Auto-preview the first custom theme when opening, if any exist.
            const keys = Object.keys(getCustomThemes());
            if (keys.length > 0) {
                showPreviewPane(keys[0]);
            }
        }

        function closeThemeEditor() {
            const overlay = jQuery('#et-theme-editor-overlay');
            overlay.removeClass('et-te-overlay-open');
            setTimeout(() => overlay.remove(), 220);
            _editingId = null;
            _previewId = null;
            _editorDraft = null;
            clearDeleteTimer();
        }

        // ──────────────────────────────────────────────
        // Right-pane modes
        // ──────────────────────────────────────────────

        // Show a read-only preview of a saved custom theme.
        function showPreviewPane(id) {
            _previewId = id;
            _editingId = null;
            _editorDraft = null;
            // Highlight selected item in the list
            jQuery('.et-te-item').removeClass('et-te-item-selected');
            jQuery(`.et-te-item[data-theme-id="${id}"]`).addClass('et-te-item-selected');
            const section = jQuery('#et-te-editor-section');
            section.html(buildThemePreviewPaneHtml(id));
            section.addClass('et-te-editor-section-open');
        }

        // Open the color editor (new = id null, existing = id string).
        function openEditor(id) {
            _editingId = id;
            _previewId = null;
            if (id) {
                const t = getCustomThemes()[id] || {};
                _editorDraft = {
                    label:       t.label       || '',
                    description: t.description || '',
                    primary:     t.primary     || '',
                    secondary:   t.secondary   || '',
                    text:        t.text        || '',
                    accent:      t.accent      || ''
                };
            } else {
                _editorDraft = {
                    label: '', description: '',
                    primary:   FIELD_DEFAULTS.primary,
                    secondary: FIELD_DEFAULTS.secondary,
                    text:      FIELD_DEFAULTS.text,
                    accent:    FIELD_DEFAULTS.accent
                };
            }

            // Update list selection
            jQuery('.et-te-item').removeClass('et-te-item-selected');
            if (id) jQuery(`.et-te-item[data-theme-id="${id}"]`).addClass('et-te-item-selected');

            const section = jQuery('#et-te-editor-section');
            section.html(buildEditorHtml(id === null));
            section.addClass('et-te-editor-section-open');

            // Scroll editor into view on mobile
            section[0] && section[0].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            jQuery('#et-te-name').trigger('focus');
            bindEditorEvents();
        }

        function closeRightPane() {
            _editingId = null;
            _previewId = null;
            _editorDraft = null;
            jQuery('.et-te-item').removeClass('et-te-item-selected');
            const section = jQuery('#et-te-editor-section');
            section.removeClass('et-te-editor-section-open');
            section.html('');
        }

        // ──────────────────────────────────────────────
        // Draft helpers
        // ──────────────────────────────────────────────

        function readColorField(field) {
            const txt = jQuery(`.et-te-color-text[data-field="${field}"]`).val().trim();
            // If the text input is empty, fall back to whatever the color picker has
            return txt || jQuery(`.et-te-color-picker[data-field="${field}"]`).val() || FIELD_DEFAULTS[field];
        }

        function readDraftFromDom() {
            _editorDraft = {
                label:       jQuery('#et-te-name').val().trim(),
                description: jQuery('#et-te-description').val().trim(),
                primary:     readColorField('primary'),
                secondary:   readColorField('secondary'),
                text:        readColorField('text'),
                accent:      readColorField('accent')
            };
        }

        function updatePreviewFromDraft() {
            readDraftFromDom();
            jQuery('#et-te-preview-strip').html(buildPreviewStripHtml(_editorDraft));
        }

        // ──────────────────────────────────────────────
        // Delete confirm
        // ──────────────────────────────────────────────

        function clearDeleteTimer() {
            if (_deleteConfirmTimer) { clearTimeout(_deleteConfirmTimer); _deleteConfirmTimer = null; }
        }

        function setDeleteConfirm(id) {
            clearDeleteTimer();
            _deleteConfirmId = id;
            jQuery('.et-te-del-btn').removeClass('et-te-del-confirm').attr('title', 'Delete theme');
            jQuery(`.et-te-del-btn[data-theme-id="${id}"]`).addClass('et-te-del-confirm').attr('title', 'Click again to confirm deletion');
            _deleteConfirmTimer = setTimeout(() => {
                _deleteConfirmId = null;
                jQuery('.et-te-del-btn').removeClass('et-te-del-confirm').attr('title', 'Delete theme');
            }, 2400);
        }

        // ──────────────────────────────────────────────
        // List refresh
        // ──────────────────────────────────────────────

        function refreshList() {
            jQuery('#et-te-list').html(buildThemeListHtml());
        }

        // ──────────────────────────────────────────────
        // Validation
        // ──────────────────────────────────────────────

        function validateDraft(draft) {
            if (!draft.label) return 'Please enter a theme name.';
            if (!draft.primary && !draft.text && !draft.accent) return 'Please set at least one color.';
            const colorFields = ['primary', 'secondary', 'text', 'accent'];
            for (const f of colorFields) {
                if (draft[f] && !isValidCssColor(draft[f])) {
                    return `"${draft[f]}" is not a valid CSS color for ${f}.`;
                }
            }
            return null;
        }

        // ──────────────────────────────────────────────
        // Event binding
        // ──────────────────────────────────────────────

        function bindModalEvents() {
            // Close
            jQuery(document).on('click.et-te', '#et-te-close', closeThemeEditor);
            jQuery(document).on('click.et-te', '#et-theme-editor-overlay', function (e) {
                if (jQuery(e.target).is('#et-theme-editor-overlay')) closeThemeEditor();
            });
            jQuery(document).on('keydown.et-te', function (e) {
                if (e.key === 'Escape') closeThemeEditor();
            });

            // Add new theme
            jQuery(document).on('click.et-te', '#et-te-add', function () {
                openEditor(null);
            });

            // Click on a theme item → show preview (unless hitting action buttons)
            jQuery(document).on('click.et-te', '.et-te-item', function (e) {
                if (jQuery(e.target).closest('.et-te-item-actions').length) return;
                const id = jQuery(this).data('theme-id');
                if (id) showPreviewPane(String(id));
            });

            // Edit button
            jQuery(document).on('click.et-te', '.et-te-edit-btn', function (e) {
                e.stopPropagation();
                const id = jQuery(this).data('theme-id');
                openEditor(String(id));
            });

            // Edit from preview pane
            jQuery(document).on('click.et-te', '.et-te-pp-edit-btn', function (e) {
                e.stopPropagation();
                const id = jQuery(this).data('theme-id');
                openEditor(String(id));
            });

            // Apply theme from preview pane
            jQuery(document).on('click.et-te', '.et-te-pp-apply-btn:not([disabled])', function (e) {
                e.stopPropagation();
                const id = String(jQuery(this).data('theme-id'));
                settings().theme = id;
                saveSettings();
                applyAppearanceSettings();
                refreshList();
                refreshThemeDropdown();
                showPreviewPane(id);  // Re-render to flip button to "Currently Active"
            });

            // Delete (two-click)
            jQuery(document).on('click.et-te', '.et-te-del-btn', function (e) {
                e.stopPropagation();
                const id = jQuery(this).data('theme-id');
                if (_deleteConfirmId === id) {
                    clearDeleteTimer();
                    _deleteConfirmId = null;
                    deleteCustomTheme(id);
                    // If previewing or editing this theme, clear right pane
                    if (_previewId === id || _editingId === id) closeRightPane();
                    refreshList();
                    refreshThemeDropdown();
                } else {
                    setDeleteConfirm(id);
                }
            });
        }

        function bindEditorEvents() {
            // Off old handlers first to prevent double-binding after re-opens
            jQuery(document).off('input.et-te-ed click.et-te-ed');

            // Color picker → sync text input + preview
            jQuery(document).on('input.et-te-ed', '.et-te-color-picker', function () {
                const field = jQuery(this).data('field');
                const hex = jQuery(this).val();
                jQuery(`.et-te-color-text[data-field="${field}"]`).val(hex);
                jQuery(`.et-te-color-row[data-field="${field}"] .et-te-color-preview`).css('background', hex);
                updatePreviewFromDraft();
            });

            // Text input → sync preview + update color picker if parseable
            jQuery(document).on('input.et-te-ed', '.et-te-color-text', function () {
                const field = jQuery(this).data('field');
                const val = jQuery(this).val().trim();
                jQuery(this).closest('.et-te-color-row').find('.et-te-color-preview')
                    .css('background', isValidCssColor(val) ? val : (FIELD_DEFAULTS[field] || 'transparent'));
                const hex = cssColorToHex(val);
                if (hex) jQuery(`.et-te-color-picker[data-field="${field}"]`).val(hex);
                updatePreviewFromDraft();
            });

            // Name change → refresh preview label (no-op but cheap)
            jQuery(document).on('input.et-te-ed', '#et-te-name', updatePreviewFromDraft);

            // Randomize
            jQuery(document).on('click.et-te-ed', '#et-te-randomize', function () {
                applyRandomizedColors(generateRandomColors());
            });

            // Cancel → return to preview pane of the theme we were editing (if any),
            // otherwise close the right pane entirely.
            jQuery(document).on('click.et-te-ed', '#et-te-cancel', function () {
                const wasEditing = _editingId;
                closeRightPane();
                if (wasEditing) showPreviewPane(wasEditing);
            });

            // Save
            jQuery(document).on('click.et-te-ed', '#et-te-save', function () {
                readDraftFromDom();
                const err = validateDraft(_editorDraft);
                if (err) {
                    _showEditorError(err);
                    return;
                }
                const id = _editingId || generateId();
                saveCustomTheme(id, _editorDraft);
                refreshList();
                refreshThemeDropdown();
                showPreviewPane(id);  // Show preview of the saved theme
            });
        }

        // ──────────────────────────────────────────────
        // Inline error toast inside the editor
        // ──────────────────────────────────────────────

        function _showEditorError(msg) {
            jQuery('#et-te-editor-error').remove();
            const el = jQuery(`<div id="et-te-editor-error" class="et-te-error">${escHtml(msg)}</div>`);
            jQuery('#et-te-editor').prepend(el);
            setTimeout(() => el.fadeOut(300, () => el.remove()), 3200);
        }

        // ──────────────────────────────────────────────
        // Public API
        // ──────────────────────────────────────────────

        return {
            openThemeEditor
        };
    }

    window.EchoTextThemeEditor = { createThemeEditor };
})();
