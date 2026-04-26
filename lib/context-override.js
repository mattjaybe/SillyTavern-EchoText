// EchoText — Context Override Module
// Per-character context overrides for Description, Personality, Scenario, and Texting Style.
// When a field is populated it replaces the corresponding SillyTavern character-card field in
// the system prompt. When a field is blank the character's default ST card data is used instead.
//
// Exposes: window.EchoTextContextOverride = { createContextOverride }

(function () {
    'use strict';

    function createContextOverride(api) {

        // ============================================================
        // STATE HELPERS
        // ============================================================

        function getCharKey() {
            return (api.getCharacterKey && api.getCharacterKey()) || '__default__';
        }

        function getOverrides() {
            const s = api.getSettings();
            if (!s.contextOverrides || typeof s.contextOverrides !== 'object') {
                s.contextOverrides = {};
            }
            const key = getCharKey();
            if (!s.contextOverrides[key]) {
                s.contextOverrides[key] = {};
            }
            return s.contextOverrides[key];
        }

        function saveOverrides(updates) {
            const s = api.getSettings();
            if (!s.contextOverrides || typeof s.contextOverrides !== 'object') {
                s.contextOverrides = {};
            }
            const key = getCharKey();
            if (!s.contextOverrides[key]) {
                s.contextOverrides[key] = {};
            }
            Object.assign(s.contextOverrides[key], updates);
            api.saveSettings();
        }

        // Public accessor used by buildSystemPrompt in index.js
        function getOverridesForCurrentChar() {
            return getOverrides();
        }

        // ============================================================
        // SYSTEM PROMPT INJECTION
        // ============================================================

        // Returns a texting-style block if a style override is configured.
        // Description / personality / scenario overrides are resolved directly
        // in index.js's buildSystemPrompt via getOverridesForCurrentChar().
        function buildContextOverridePrompt() {
            const ov = getOverrides();
            if (!ov.textingStyleType || !ov.textingStyleValue || !ov.textingStyleValue.trim()) return '';

            const charName = api.getCharacterName ? api.getCharacterName() : '{{char}}';

            if (ov.textingStyleType === 'instruction') {
                return `\n\n<texting_style>\n${charName} texts in this style: ${ov.textingStyleValue.trim()}\n</texting_style>`;
            }

            if (ov.textingStyleType === 'example') {
                return `\n\n<texting_style_reference>\nThe following messages show how ${charName} texts. Use these as a stylistic reference ONLY — do NOT copy, repeat, or reproduce any of these examples verbatim in your replies:\n\n${ov.textingStyleValue.trim()}\n</texting_style_reference>`;
            }

            return '';
        }

        // ============================================================
        // HTML HELPERS
        // ============================================================

        function escHtml(str) {
            if (str == null) return '';
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        // ============================================================
        // MODAL HTML
        // ============================================================

        function buildModalHtml() {
            const ov      = getOverrides();
            const charName = api.getCharacterName ? api.getCharacterName() : 'Character';
            const styleType  = ov.textingStyleType  || 'instruction';
            const styleValue = ov.textingStyleValue || '';

            const hasDsc   = !!(ov.description   && ov.description.trim());
            const hasPers  = !!(ov.personality   && ov.personality.trim());
            const hasScen  = !!(ov.scenario      && ov.scenario.trim());
            const hasPsna  = !!(ov.persona        && ov.persona.trim());
            const hasStyle = !!(styleValue.trim());

            // World Info override state
            const wiEnabled       = ov.wiOverrideEnabled === true;
            const wiMode          = ov.wiMode || 'min_order';
            const wiMinOrder      = typeof ov.wiMinOrder === 'number' ? ov.wiMinOrder : 250;
            const wiMaxOrder      = typeof ov.wiMaxOrder === 'number' ? String(ov.wiMaxOrder) : '';
            const wiTargetedStr   = Array.isArray(ov.wiTargetedOrders) ? ov.wiTargetedOrders.join(', ') : '';
            const wiShowMin       = (wiMode === 'min_order' || wiMode === 'range' || wiMode === 'custom');
            const wiShowMax       = (wiMode === 'range' || wiMode === 'custom');
            const wiShowTargeted  = (wiMode === 'targeted' || wiMode === 'custom');
            const hasWI           = wiEnabled;

            function wiModeBtn(modeId, icon, name, sub) {
                const active = wiMode === modeId ? ' et-ctx-wi-mode-btn-active' : '';
                return `<button type="button" class="et-co-wi-mode-btn${active}" data-mode="${modeId}">`
                    + `<i class="et-ctx-wi-mode-icon ${icon}"></i>`
                    + `<span class="et-ctx-wi-mode-name">${name}</span>`
                    + `<span class="et-ctx-wi-mode-sub">${sub}</span>`
                    + `</button>`;
            }

            // Example placeholder lines mimic a plausible example of the feature
            const examplePlaceholder = [
                'hey so like... u free tmrw?',
                'ugh my phone died again lol',
                'omg wait that\'s actually so funny',
                'ok but seriously tho 👀'
            ].join('\n');

            return `<div class="et-ctx-overlay" id="et-ctx-overlay" role="dialog" aria-modal="true" aria-label="Character Context Override">
    <div class="et-ctx-modal" id="et-ctx-modal">

        <!-- HEADER -->
        <div class="et-ctx-header">
            <div class="et-ctx-header-title">
                <i class="fa-solid fa-book-open-reader" style="color:var(--et-theme-color)"></i>
                <span>Character Context</span>
                <span class="et-ctx-char-badge">${escHtml(charName)}</span>
            </div>
            <button class="et-ctx-close-btn" id="et-ctx-close-btn" title="Close" aria-label="Close">
                <i class="fa-solid fa-xmark"></i>
            </button>
        </div>

        <!-- SUB-HEADER NOTE -->
        <div class="et-ctx-subheader">
            Override any field to replace the SillyTavern card data for this character. Leave a field blank to use the default.
        </div>

        <!-- SCROLLABLE BODY -->
        <div class="et-ctx-body" id="et-ctx-body">
            <!-- YOUR PERSONA -->
            <div class="et-ctx-section">
                <label class="et-ctx-section-label" for="et-ctx-persona">
                    <i class="fa-solid fa-user-shield"></i>
                    Your Persona
                    <span class="et-ctx-override-badge${hasPsna ? '' : ' et-ctx-badge-hidden'}" id="et-ctx-psna-badge">Override</span>
                </label>
                <div class="et-ctx-field-hint">Replaces the Persona set in Settings &rsaquo; Context for this character only.</div>
                <textarea class="et-ctx-textarea" id="et-ctx-persona" rows="3"
                    placeholder="Describe how you want to present yourself to ${escHtml(charName)}\u2026">${escHtml(ov.persona || '')}</textarea>
            </div>
            <!-- DESCRIPTION -->
            <div class="et-ctx-section">
                <label class="et-ctx-section-label" for="et-ctx-description">
                    <i class="fa-solid fa-id-card"></i>
                    Description
                    <span class="et-ctx-override-badge${hasDsc ? '' : ' et-ctx-badge-hidden'}" id="et-ctx-dsc-badge">Override</span>
                </label>
                <textarea class="et-ctx-textarea" id="et-ctx-description" rows="4"
                    placeholder="Override ${escHtml(charName)}'s description…">${escHtml(ov.description || '')}</textarea>
            </div>

            <!-- PERSONALITY -->
            <div class="et-ctx-section">
                <label class="et-ctx-section-label" for="et-ctx-personality">
                    <i class="fa-solid fa-user-pen"></i>
                    Personality
                    <span class="et-ctx-override-badge${hasPers ? '' : ' et-ctx-badge-hidden'}" id="et-ctx-per-badge">Override</span>
                </label>
                <textarea class="et-ctx-textarea" id="et-ctx-personality" rows="3"
                    placeholder="Override ${escHtml(charName)}'s personality…">${escHtml(ov.personality || '')}</textarea>
            </div>

            <!-- SCENARIO -->
            <div class="et-ctx-section">
                <label class="et-ctx-section-label" for="et-ctx-scenario">
                    <i class="fa-solid fa-map"></i>
                    Scenario
                    <span class="et-ctx-override-badge${hasScen ? '' : ' et-ctx-badge-hidden'}" id="et-ctx-scn-badge">Override</span>
                </label>
                <textarea class="et-ctx-textarea" id="et-ctx-scenario" rows="3"
                    placeholder="Override the scenario…">${escHtml(ov.scenario || '')}</textarea>
            </div>

            <!-- WORLD INFO FILTER -->
            <div class="et-ctx-section">
                <div class="et-ctx-section-label">
                    <i class="fa-solid fa-globe"></i>
                    World Info Filter
                    <span class="et-ctx-override-badge${hasWI ? '' : ' et-ctx-badge-hidden'}" id="et-ctx-wi-badge">Override</span>
                </div>
                <div class="et-ctx-field-hint">Configure which World Info / Lorebook entries to include in context for this character.</div>
                <label class="et-ctx-wi-check-row" for="et-ctx-wi-enabled">
                    <input type="checkbox" id="et-ctx-wi-enabled" class="et-ctx-radio-input" ${wiEnabled ? 'checked' : ''}>
                    <span class="et-ctx-wi-check-box"></span>
                    <span class="et-ctx-wi-check-label">Enable World Info override for this character</span>
                </label>
                <div class="et-ctx-wi-sub" id="et-ctx-wi-sub-ov" style="${wiEnabled ? '' : 'display:none'}">
                    <div class="et-ctx-wi-mode-grid">
                        ${wiModeBtn('min_order', 'fa-solid fa-chevron-up', 'Min Order', 'Filter by minimum')}
                        ${wiModeBtn('range', 'fa-solid fa-left-right', 'Order Range', 'Min to Max')}
                        ${wiModeBtn('targeted', 'fa-solid fa-crosshairs', 'Targeted', 'Exact orders')}
                        ${wiModeBtn('custom', 'fa-solid fa-sliders', 'Custom', 'Range + targeted')}
                    </div>
                    <div class="et-ctx-wi-inputs">
                        <div class="et-ctx-wi-field" id="et-ctx-wi-row-min-ov" style="${wiShowMin ? '' : 'display:none'}">
                            <i class="et-ctx-wi-field-icon fa-solid fa-chevron-up"></i>
                            <span class="et-ctx-wi-field-label">Min Order</span>
                            <input type="number" id="et-ctx-wi-min-ov" class="et-ctx-wi-field-input" value="${wiMinOrder}" min="0" step="1" placeholder="250">
                        </div>
                        <div class="et-ctx-wi-field" id="et-ctx-wi-row-max-ov" style="${wiShowMax ? '' : 'display:none'}">
                            <i class="et-ctx-wi-field-icon fa-solid fa-chevron-down"></i>
                            <span class="et-ctx-wi-field-label">Max Order</span>
                            <input type="number" id="et-ctx-wi-max-ov" class="et-ctx-wi-field-input" value="${wiMaxOrder}" min="0" step="1" placeholder="No limit">
                        </div>
                        <div class="et-ctx-wi-field" id="et-ctx-wi-row-targeted-ov" style="${wiShowTargeted ? '' : 'display:none'}">
                            <i class="et-ctx-wi-field-icon fa-solid fa-crosshairs"></i>
                            <span class="et-ctx-wi-field-label">Target Orders</span>
                            <input type="text" id="et-ctx-wi-targeted-ov" class="et-ctx-wi-field-input" value="${escHtml(wiTargetedStr)}" placeholder="e.g. 100, 200, 300">
                        </div>
                    </div>
                </div>
            </div>

            <!-- TEXTING STYLE -->
            <div class="et-ctx-section et-ctx-section-style">
                <div class="et-ctx-section-label">
                    <i class="fa-solid fa-comment-dots"></i>
                    Texting Style
                    <span class="et-ctx-override-badge${hasStyle ? '' : ' et-ctx-badge-hidden'}" id="et-ctx-sty-badge">Override</span>
                </div>

                <!-- Radio: style type -->
                <div class="et-ctx-style-type-row">
                    <label class="et-ctx-radio-label">
                        <input type="radio" class="et-ctx-radio-input" name="et-ctx-style-type" value="instruction"
                            ${styleType === 'instruction' ? 'checked' : ''}>
                        <span class="et-ctx-radio-dot"></span>
                        <span class="et-ctx-radio-content">
                            <strong>Simple Instruction</strong>
                            <span class="et-ctx-radio-hint">A one-line style directive — e.g. "AOL instant messenger style from the late 90s"</span>
                        </span>
                    </label>
                    <label class="et-ctx-radio-label">
                        <input type="radio" class="et-ctx-radio-input" name="et-ctx-style-type" value="example"
                            ${styleType === 'example' ? 'checked' : ''}>
                        <span class="et-ctx-radio-dot"></span>
                        <span class="et-ctx-radio-content">
                            <strong>Example Messages</strong>
                            <span class="et-ctx-radio-hint">Sample messages used as a stylistic reference — not reproduced verbatim</span>
                        </span>
                    </label>
                </div>

                <!-- Input: simple instruction -->
                <div class="et-ctx-style-input-wrap" id="et-ctx-instr-wrap"
                    style="${styleType === 'instruction' ? '' : 'display:none'}">
                    <input type="text" class="et-ctx-text-input" id="et-ctx-style-instruction"
                        placeholder="e.g. AOL instant messenger style from the late 90s, lots of abbreviations…"
                        value="${escHtml(styleType === 'instruction' ? styleValue : '')}">
                </div>

                <!-- Input: example messages -->
                <div class="et-ctx-style-input-wrap" id="et-ctx-example-wrap"
                    style="${styleType === 'example' ? '' : 'display:none'}">
                    <div class="et-ctx-example-notice">
                        <i class="fa-solid fa-circle-info"></i>
                        <span>These messages are a <strong>style reference only</strong>. ${escHtml(charName)} will mirror the tone and patterns without copying this text.</span>
                    </div>
                    <textarea class="et-ctx-textarea" id="et-ctx-style-example" rows="5"
                        placeholder="${escHtml(examplePlaceholder)}">${escHtml(styleType === 'example' ? styleValue : '')}</textarea>
                </div>
            </div>

        </div><!-- /body -->

        <!-- FOOTER -->
        <div class="et-ctx-footer">
            <button class="et-ctx-btn et-ctx-btn-ghost" id="et-ctx-reset-btn">
                <i class="fa-solid fa-rotate-left"></i>
                Reset All
            </button>
            <button class="et-ctx-btn et-ctx-btn-primary" id="et-ctx-save-btn">
                <i class="fa-solid fa-check"></i>
                Save
            </button>
        </div>

    </div>
</div>`;
        }

        // ============================================================
        // ============================================================
        // WI OVERRIDE HELPERS
        // ============================================================

        function updateWIOverrideModeVisibility() {
            const activeBtn = jQuery('#et-ctx-overlay .et-co-wi-mode-btn.et-ctx-wi-mode-btn-active');
            const mode = activeBtn.length ? activeBtn.data('mode') : 'min_order';
            jQuery('#et-ctx-wi-row-min-ov').toggle(mode === 'min_order' || mode === 'range' || mode === 'custom');
            jQuery('#et-ctx-wi-row-max-ov').toggle(mode === 'range' || mode === 'custom');
            jQuery('#et-ctx-wi-row-targeted-ov').toggle(mode === 'targeted' || mode === 'custom');
        }

        // ============================================================
        // MODAL LIFECYCLE
        // ============================================================

        function bindModalEvents() {
            const overlay = jQuery('#et-ctx-overlay');
            if (!overlay.length) return;

            // Close: button, backdrop click, Escape key
            jQuery('#et-ctx-close-btn').on('click', closeModal);
            overlay.on('click', function (e) {
                if (jQuery(e.target).is('#et-ctx-overlay')) closeModal();
            });
            jQuery(document).on('keydown.et-ctx-esc', function (e) {
                if (e.key === 'Escape') closeModal();
            });

            // WI override: toggle enable/disable
            overlay.on('change', '#et-ctx-wi-enabled', function () {
                const enabled = jQuery(this).is(':checked');
                jQuery('#et-ctx-wi-sub-ov').toggle(enabled);
                updateBadge('et-ctx-wi-badge', enabled);
                if (enabled) updateWIOverrideModeVisibility();
            });

            // WI override: mode button selection
            overlay.on('click', '.et-co-wi-mode-btn', function (e) {
                e.stopPropagation();
                overlay.find('.et-co-wi-mode-btn').removeClass('et-ctx-wi-mode-btn-active');
                jQuery(this).addClass('et-ctx-wi-mode-btn-active');
                updateWIOverrideModeVisibility();
            });

            // Style-type radio → toggle inputs
            overlay.on('change', 'input[name="et-ctx-style-type"]', function () {
                const val = jQuery(this).val();
                jQuery('#et-ctx-instr-wrap').toggle(val === 'instruction');
                jQuery('#et-ctx-example-wrap').toggle(val === 'example');
            });

            // Live override badges
            function updateBadge(badgeId, hasValue) {
                const el = jQuery('#' + badgeId);
                if (hasValue) el.removeClass('et-ctx-badge-hidden');
                else          el.addClass('et-ctx-badge-hidden');
            }
            overlay.on('input', '#et-ctx-persona', function () {
                updateBadge('et-ctx-psna-badge', !!jQuery(this).val().trim());
            });
            overlay.on('input', '#et-ctx-description', function () {
                updateBadge('et-ctx-dsc-badge', !!jQuery(this).val().trim());
            });
            overlay.on('input', '#et-ctx-personality', function () {
                updateBadge('et-ctx-per-badge', !!jQuery(this).val().trim());
            });
            overlay.on('input', '#et-ctx-scenario', function () {
                updateBadge('et-ctx-scn-badge', !!jQuery(this).val().trim());
            });
            overlay.on('input', '#et-ctx-style-instruction, #et-ctx-style-example', function () {
                const hasVal = !!jQuery('#et-ctx-style-instruction').val().trim()
                    || !!jQuery('#et-ctx-style-example').val().trim();
                updateBadge('et-ctx-sty-badge', hasVal);
            });

            // Save — persist all fields then close
            jQuery('#et-ctx-save-btn').on('click', function () {
                const styleType = jQuery('input[name="et-ctx-style-type"]:checked').val() || 'instruction';
                const styleValue = styleType === 'instruction'
                    ? jQuery('#et-ctx-style-instruction').val().trim()
                    : jQuery('#et-ctx-style-example').val().trim();

                const wiEnabled  = jQuery('#et-ctx-wi-enabled').is(':checked');
                const wiActiveBtn = overlay.find('.et-co-wi-mode-btn.et-ctx-wi-mode-btn-active');
                const wiMode      = (wiActiveBtn.length ? wiActiveBtn.data('mode') : null) || 'min_order';
                const wiMinRaw    = parseInt(jQuery('#et-ctx-wi-min-ov').val(), 10);
                const wiMaxStr    = jQuery('#et-ctx-wi-max-ov').val().trim();
                const wiMaxParsed = wiMaxStr === '' ? null : parseInt(wiMaxStr, 10);
                const wiTgtStr    = jQuery('#et-ctx-wi-targeted-ov').val().trim();
                const wiTargeted  = !wiTgtStr ? [] : wiTgtStr.split(',').map(function (v) { return parseInt(v.trim(), 10); }).filter(function (n) { return !isNaN(n); });

                saveOverrides({
                    persona:             jQuery('#et-ctx-persona').val(),
                    description:         jQuery('#et-ctx-description').val(),
                    personality:         jQuery('#et-ctx-personality').val(),
                    scenario:            jQuery('#et-ctx-scenario').val(),
                    textingStyleType:    styleType,
                    textingStyleValue:   styleValue,
                    wiOverrideEnabled:   wiEnabled,
                    wiMode:              wiMode,
                    wiMinOrder:          isNaN(wiMinRaw) ? 250 : wiMinRaw,
                    wiMaxOrder:          (wiMaxStr === '' || isNaN(wiMaxParsed)) ? null : wiMaxParsed,
                    wiTargetedOrders:    wiTargeted,
                });
                closeModal();
                if (api.onSave) api.onSave();
            });

            // Reset — clear all overrides for this character
            jQuery('#et-ctx-reset-btn').on('click', function () {
                const s   = api.getSettings();
                const key = getCharKey();
                if (s.contextOverrides) s.contextOverrides[key] = {};
                api.saveSettings();
                closeModal();
                if (api.onSave) api.onSave();
            });
        }

        function openModal() {
            jQuery('#et-ctx-overlay').remove();
            jQuery('body').append(buildModalHtml());
            requestAnimationFrame(() => {
                jQuery('#et-ctx-overlay').addClass('et-ctx-overlay-open');
            });
            bindModalEvents();
        }

        function closeModal() {
            const overlay = jQuery('#et-ctx-overlay');
            overlay.removeClass('et-ctx-overlay-open');
            jQuery(document).off('keydown.et-ctx-esc');
            setTimeout(() => overlay.remove(), 220);
        }

        // ============================================================
        // PUBLIC API
        // ============================================================

        return {
            openModal,
            buildContextOverridePrompt,
            getOverridesForCurrentChar,
        };
    }

    window.EchoTextContextOverride = { createContextOverride };
})();
