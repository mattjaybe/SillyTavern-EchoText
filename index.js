// EchoText Extension - A floating text messaging panel for SillyTavern
// Uses SillyTavern.getContext() global pattern (no ES6 imports from ST internals)

(function () {
    'use strict';

    const MODULE_NAME = 'EchoText';
    const EXTENSION_NAME = 'EchoText';

    // Get BASE_URL and cache-buster from script tag
    const scripts = document.querySelectorAll('script[src*="index.js"]');
    let BASE_URL = '';
    let VERSION_QUERY = '';
    for (const script of scripts) {
        if (script.src.includes('EchoText')) {
            // Use URL API for resilient parsing
            try {
                const urlObj = new URL(script.src, window.location.href);
                VERSION_QUERY = urlObj.search; // Contains "?test5" etc
                BASE_URL = urlObj.origin + urlObj.pathname.split('/').slice(0, -1).join('/');
            } catch (e) {
                // Fallback for unexpected URL formats
                BASE_URL = script.src.split('?')[0].split('/').slice(0, -1).join('/');
                const parts = script.src.split('?');
                if (parts.length > 1) VERSION_QUERY = '?' + parts[1];
            }
            break;
        }
    }
    if (!BASE_URL) {
        BASE_URL = '/scripts/extensions/third-party/SillyTavern-EchoText';
    }

    console.log(`[EchoText] Initializing from ${BASE_URL} with query ${VERSION_QUERY}`);

    function loadEchoTextModule(relativePath, globalKey) {
        if (window[globalKey]) return;
        const xhr = new XMLHttpRequest();
        // Propagate the cache-buster to all sub-modules
        const moduleUrl = `${BASE_URL}/${relativePath}${VERSION_QUERY}`;
        xhr.open('GET', moduleUrl, false);
        xhr.send();
        if (xhr.status < 200 || xhr.status >= 300) {
            console.error(`[EchoText] Failed to load module ${relativePath}: HTTP ${xhr.status}`);
            throw new Error(`Failed to load module ${relativePath}: HTTP ${xhr.status}`);
        }
        // eslint-disable-next-line no-new-func
        new Function(xhr.responseText)();
        if (!window[globalKey]) {
            throw new Error(`Module loaded but global '${globalKey}' is missing (${relativePath})`);
        }
    }

    loadEchoTextModule('lib/config.js', 'EchoTextConfig');
    loadEchoTextModule('lib/emotion-system.js', 'EchoTextEmotionSystem');
    loadEchoTextModule('lib/proactive-messaging.js', 'EchoTextProactiveMessaging');
    loadEchoTextModule('lib/settings-modal.js', 'EchoTextSettingsModal');
    loadEchoTextModule('lib/untethered-chat.js', 'EchoTextUntetheredChat');
    loadEchoTextModule('lib/memory-system.js', 'EchoTextMemorySystem');
    loadEchoTextModule('lib/saveload-modal.js', 'EchoTextSaveLoadModal');
    loadEchoTextModule('lib/group.js', 'EchoTextGroupManager');
    loadEchoTextModule('lib/image-generation.js', 'EchoTextImageGeneration');
    loadEchoTextModule('lib/gallery.js', 'EchoTextGallery');
    loadEchoTextModule('lib/character-picker.js', 'EchoTextCharacterPicker');
    loadEchoTextModule('lib/st-context-emotion.js', 'EchoTextSTContextEmotion');
    loadEchoTextModule('lib/theme-editor.js', 'EchoTextThemeEditor');
    loadEchoTextModule('lib/context-override.js', 'EchoTextContextOverride');

    // ============================================================
    // THEME PRESETS
    // ============================================================

    const THEME_PRESETS = window.EchoTextConfig.THEME_PRESETS;

    // Returns the merged set of built-in presets + user-created custom themes.
    // All theme-aware code should call this rather than referencing THEME_PRESETS
    // directly, so custom themes are always included.
    function getAllThemePresets() {
        return Object.assign({}, THEME_PRESETS, settings.customThemes || {});
    }

    // ============================================================
    // DEFAULT SETTINGS
    // ============================================================

    const defaultSettings = window.EchoTextConfig.defaultSettings;

    let settings = JSON.parse(JSON.stringify(defaultSettings));
    let isGenerating = false;
    let abortController = null;
    let panelOpen = false;
    let fabDragging = false;
    let loadedFontFamily = null;
    let showTypingIndicator = false;
    let hasUnreadCharacterMessage = false;
    let emotionSystem = null;
    let proactiveMessaging = null;
    let settingsModal = null;
    let untetheredChat = null;
    let memorySystem = null;
    let saveLoadModal = null;
    let groupManager = null;
    let imageGeneration = null;
    let gallery = null;
    let characterPicker = null;
    let stContextEmotion = null;
    let themeEditor = null;
    let contextOverride = null;
    let FA_REACTIONS = [];
    let selectedCharacterKey = null;

    // Named event handler references for cleanup
    let _onChatChanged = null;
    let _onGroupUpdated = null;

    // ============================================================
    // MOBILE / iOS DETECTION & VIEWPORT HELPERS
    // ============================================================

    function isMobileDevice() {
        return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
            || ('ontouchstart' in window && window.innerWidth < 1024);
    }

    function isIOS() {
        return /iPad|iPhone|iPod/.test(navigator.userAgent)
            || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    }

    // Use visualViewport when available — reports the region actually visible
    // to the user on iOS (excludes address bar, keyboard, etc.).
    function getViewportHeight() {
        return window.visualViewport ? window.visualViewport.height : window.innerHeight;
    }

    function getViewportWidth() {
        return window.visualViewport ? window.visualViewport.width : window.innerWidth;
    }

    // ============================================================
    // iOS PORTAL — escape SillyTavern's body { position: fixed }
    // ============================================================
    // SillyTavern's mobile-styles.css applies:
    //   body { position: fixed; overflow: hidden; }
    // which breaks position:fixed children appended directly to body.
    //
    // Fix: mount a <div id="et-portal"> as a direct sibling of <body>
    // (child of <html>) to escape SillyTavern's clipped/fixed body.
    // We use a high z-index and dynamic viewport units for total coverage.
    const ET_PORTAL_ID = 'et-portal';

    function ensurePortal() {
        let portal = document.getElementById(ET_PORTAL_ID);
        if (!portal) {
            portal = document.createElement('div');
            portal.id = ET_PORTAL_ID;
            // Max z-index, fixed fullscreen, tracking dynamic viewport (dvh/dvw)
            // We use color:initial and text-align:initial to ensureST defaults don't bleed in.
            portal.style.cssText = `position:fixed; top:0; left:0; width:100dvw; height:100dvh; z-index:${isMobileDevice() ? '2147483647' : '1500'}; pointer-events:none; display:block !important; border:none !important; margin:0 !important; padding:0 !important;`;
            
            // Try appending to html first to escape body bugs
            try {
                document.documentElement.appendChild(portal);
            } catch (e) {
                console.warn('[EchoText] Failed to append to <html>, falling back to <body>', e);
                document.body.appendChild(portal);
            }
        }
        return portal;
    }

    function portalAppend(html) {
        const portal = ensurePortal();
        // Re-enable pointer events on children (portal itself has none).
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'pointer-events:auto;';
        wrapper.innerHTML = html;
        while (wrapper.firstChild) portal.appendChild(wrapper.firstChild);
    }

    function removePortal() {
        const portal = document.getElementById(ET_PORTAL_ID);
        if (portal) portal.remove();
    }

    /**
     * On mobile the portal lives on <html> with z-index MAX, so anything left
     * in <body> (where external modal modules append their DOM) renders beneath
     * the panel.  Call this immediately after triggering any modal open; it
     * relocates the modal root element into the portal so it shares the same
     * stacking context and appears above the panel.
     *
     * Safe to call on desktop too — it's a no-op when !isMobileDevice().
     *
     * @param {string} selector  CSS selector for the modal's root element
     */
    function moveModalToPortal(selector) {
        if (!isMobileDevice()) return;
        const portal = ensurePortal();
        const tryMove = () => {
            const el = document.querySelector(selector);
            if (el && el.parentElement !== portal) {
                portal.appendChild(el);
                return true;
            }
            return !!el;
        };
        // Try synchronously first (modal may already be in DOM),
        // then retry at 50 ms, 150 ms, and 400 ms to cover modules that do
        // async DB reads or multi-step renders before appending their element.
        if (!tryMove()) {
            setTimeout(() => {
                if (!tryMove()) {
                    setTimeout(() => {
                        if (!tryMove()) setTimeout(tryMove, 250);
                    }, 100);
                }
            }, 50);
        }
    }

    // ============================================================
    // LOGGING
    // ============================================================

    function log(...args) { console.log(`[${EXTENSION_NAME}]`, ...args); }
    function warn(...args) { console.warn(`[${EXTENSION_NAME}]`, ...args); }
    function error(...args) { console.error(`[${EXTENSION_NAME}]`, ...args); }

    function getImageMimeTypeFromDataUrl(dataUrl) {
        const match = String(dataUrl || '').match(/^data:([^;]+);base64,/i);
        return match?.[1] || 'image/png';
    }

    function extractImageUrlFromPluginResult(result) {
        if (!result) return null;
        if (typeof result === 'string') return result;
        if (Array.isArray(result)) {
            for (const item of result) {
                const nested = extractImageUrlFromPluginResult(item);
                if (nested) return nested;
            }
        }
        if (typeof result === 'object') {
            if (typeof result.pipe === 'string' && result.pipe.trim()) return result.pipe.trim();
            if (typeof result.value === 'string' && result.value.trim()) return result.value.trim();
        }
        return result.url || result.image || result.path || result.src || result.data || result.base64 || null;
    }

    async function requestSillyTavernImageGeneration(payload) {
        // Use sdPrompt (SD-optimized, includes character appearance) for the /sd command.
        // contextPrompt is reserved for multimodal generators that handle verbose prose.
        const sdPrompt = payload.sdPrompt || payload.prompt || '';
        const response = await executeImageGenerationSlashCommand(buildImageGenerationSlashCommand(payload));

        let url = extractImageUrlFromPluginResult(response);
        if (typeof url === 'string') {
            const mdMatch = url.match(/\!\[[^\]]*\]\(([^)]+)\)/);
            if (mdMatch?.[1]) url = mdMatch[1];
        }
        if (!url) {
            throw new Error('The SillyTavern Image Generation plugin did not return an image URL or data payload.');
        }

        return {
            ok: true,
            url,
            mimeType: String(url).startsWith('data:') ? getImageMimeTypeFromDataUrl(url) : 'image/png',
            prompt: sdPrompt,
            provider: 'st_image_plugin'
        };
    }

    function buildImageGenerationSlashCommand(payload) {
        // Always use sdPrompt — the SD-optimized prompt that includes character appearance,
        // visual descriptors, and scene context. Never use raw userDirectives here, as
        // those may be unstripped trigger phrases with no appearance information.
        const subject = String(payload.sdPrompt || payload.prompt || 'a candid photo')
            .replace(/\r?\n+/g, ' ')
            .replace(/"/g, '\\"')
            .trim();
        return `/sd quiet=true ${subject}`;
    }

    async function executeImageGenerationSlashCommand(command) {
        const context = SillyTavern.getContext?.() || {};
        const executor = context.executeSlashCommandsWithOptions
            || context.executeSlashCommands
            || window.executeSlashCommandsWithOptions
            || window.executeSlashCommands;

        if (typeof executor !== 'function') {
            throw new Error('SillyTavern slash-command execution API was not available for image generation.');
        }

        // ST's image generation plugin shows a persistent "Generating an image..." toast.
        // EchoText already has its own camera indicator, so dismiss that toast after a
        // brief moment so it doesn't linger for the full generation duration.
        setTimeout(() => {
            const container = document.getElementById('toast-container');
            if (!container) return;
            container.querySelectorAll('.toast-info').forEach(toast => {
                const title = toast.querySelector('.toast-title');
                if (title && title.textContent.includes('Image Generation')) {
                    jQuery(toast).fadeOut(400, () => jQuery(toast).remove());
                }
            });
        }, 1500);

        const result = await executor(command, { quiet: true, source: 'echotext' });
        if (typeof result === 'string') return result.trim();
        return result;
    }

    function getIsGenerating() {
        return isGenerating;
    }

    function isPanelOpen() {
        return panelOpen;
    }

    // ============================================================
    // SETTINGS MANAGEMENT
    // ============================================================

    function getSettings() {
        const context = SillyTavern.getContext();
        if (!context.extensionSettings[MODULE_NAME]) {
            context.extensionSettings[MODULE_NAME] = JSON.parse(JSON.stringify(defaultSettings));
        }
        const s = context.extensionSettings[MODULE_NAME];
        for (const key of Object.keys(defaultSettings)) {
            if (!Object.hasOwn(s, key)) {
                const val = defaultSettings[key];
                s[key] = (val !== null && typeof val === 'object') ? JSON.parse(JSON.stringify(val)) : val;
            }
        }
        if (!s.chatHistory || typeof s.chatHistory !== 'object' || Array.isArray(s.chatHistory)) {
            s.chatHistory = {};
        }
        if (!s.untetheredHistory || typeof s.untetheredHistory !== 'object' || Array.isArray(s.untetheredHistory)) {
            s.untetheredHistory = {};
        }
        if (!s.untetheredInfluence || typeof s.untetheredInfluence !== 'object' || Array.isArray(s.untetheredInfluence)) {
            s.untetheredInfluence = {};
        }
        if (!s.emotionState || typeof s.emotionState !== 'object' || Array.isArray(s.emotionState)) {
            s.emotionState = {};
        }
        if (!s.proactiveCharacterConfig || typeof s.proactiveCharacterConfig !== 'object' || Array.isArray(s.proactiveCharacterConfig)) {
            s.proactiveCharacterConfig = {};
        }
        if (!s.proactiveState || typeof s.proactiveState !== 'object' || Array.isArray(s.proactiveState)) {
            s.proactiveState = {};
        }
        return s;
    }

    function saveSettings() {
        SillyTavern.getContext().saveSettingsDebounced();
    }

    // ============================================================
    // ACTIVITY MODE HELPER
    // ============================================================

    /**
     * Named activity mode presets.
     * Each maps to a floor in minutes and a human description.
     *  'expressive' uses 30 min so the trigger/jitter system is the real governor.
     */
    const ACTIVITY_MODE_PRESETS = {
        quiet:      { minutes: 480, hint: 'Quiet: ~1–2 messages per day. Minimal API use — ideal when watching token spend.' },
        relaxed:    { minutes: 300, hint: 'Relaxed: ~3 messages per day. A gentle presence that doesn\'t intrude.' },
        natural:    { minutes: 180, hint: 'Natural: Dynamic, emotion-influenced frequency. The default — feels organic without overwhelming.' },
        lively:     { minutes:  90, hint: 'Lively: ~6–8 messages per day. The character reaches out more readily, especially when emotionally engaged.' },
        expressive: { minutes:  30, hint: 'Expressive: Minimal floor — the trigger system drives everything. Best with a fast or local model.' },
        custom:     { minutes: null, hint: 'Custom: Use the slider to set your own minimum gap between messages.' }
    };

    /**
     * Applies an activity mode to a given set of DOM targets (works for both
     * the settings modal and the panel accordion — just pass different selectors).
     *
     * @param {string} mode        - one of the ACTIVITY_MODE_PRESETS keys
     * @param {string} gridSel     - selector for the button grid
     * @param {string} customSel   - selector for the custom slider row
     * @param {string} sliderSel   - selector for the range input
     * @param {string} valSel      - selector for the value display span
     * @param {string} hintSel     - selector for the hint text element
     */
    function applyActivityMode(mode, gridSel, customSel, sliderSel, valSel, hintSel) {
        const preset = ACTIVITY_MODE_PRESETS[mode] || ACTIVITY_MODE_PRESETS.natural;

        // Highlight the active button
        jQuery(gridSel).find('.et-activity-btn').removeClass('et-activity-btn-active');
        jQuery(gridSel).find(`.et-activity-btn[data-mode="${mode}"]`).addClass('et-activity-btn-active');

        // Show/hide custom slider
        if (mode === 'custom') {
            jQuery(customSel).show();
        } else {
            jQuery(customSel).hide();
            // Apply the preset floor
            if (preset.minutes !== null) {
                jQuery(sliderSel).val(preset.minutes);
                jQuery(valSel).text(preset.minutes + ' min');
                settings.proactiveRateLimitMinutes = preset.minutes;
            }
        }

        // Update hint
        jQuery(hintSel).text(preset.hint);

        // Persist
        settings.proactiveActivityMode = mode;
        saveSettings();
        if (typeof refreshProactiveInsights === 'function') refreshProactiveInsights();
    }

    function loadSettings() {
        settings = getSettings();
        applySettingsToUI();
        applyAppearanceSettings();
        // Initialize panel accordion after settings are loaded
        initPanelAccordion();
    }

    function applySettingsToUI() {
        // Sync modal settings
        jQuery('#et_enabled').prop('checked', settings.enabled);
        jQuery('#et_enabled_quick').prop('checked', settings.enabled);
        jQuery('#et_auto_open').prop('checked', settings.autoOpenOnReload);
        jQuery('#et_auto_load_last_char').prop('checked', settings.autoLoadLastCharacter === true);
        jQuery('#et_source').val(settings.source);
        jQuery('#et_profile_select').val(settings.preset);
        jQuery('#et_ollama_url').val(settings.ollama_url);
        jQuery('#et_openai_preset').val(settings.openai_preset);
        jQuery('#et_openai_url').val(settings.openai_url);
        jQuery('#et_openai_key').val(settings.openai_key);
        jQuery('#et_openai_model').val(settings.openai_model);
        jQuery('#et_anti_refusal').prop('checked', settings.antiRefusal === true);
        jQuery('#et_image_generation_enabled').prop('checked', settings.imageGenerationEnabled === true);
        jQuery('#et_image_generation_include_text_reply').prop('checked', settings.imageGenerationIncludeTextReply !== false);
        jQuery('#et_image_generation_plugin_notice').toggle(settings.imageGenerationEnabled === true);
        jQuery('#et_font_size').val(settings.fontSize);
        jQuery('#et_font_size_val').text(settings.fontSize + 'px');
        jQuery('#et_theme').val(settings.theme);
        jQuery('#et_glass_blur').val(settings.glassBlur);
        jQuery('#et_glass_blur_val').text(settings.glassBlur + 'px');
        jQuery('#et_glass_opacity').val(settings.glassOpacity);
        jQuery('#et_glass_opacity_val').text(settings.glassOpacity + '%');
        jQuery('#et_line_spacing').val(settings.lineSpacing || 1.3);
        jQuery('#et_line_spacing_val').text((settings.lineSpacing || 1.3).toFixed(2));
        jQuery('#et_paragraph_spacing').val(settings.paragraphSpacing || 12);
        jQuery('#et_paragraph_spacing_val').text((settings.paragraphSpacing || 12) + 'px');

        jQuery('#et_show_avatar').prop('checked', settings.showAvatar !== false);
        jQuery('#et_emotion_system').prop('checked', settings.emotionSystemEnabled !== false);
        jQuery('#et_swiped_messages').prop('checked', settings.swipedMessages === true);
        jQuery('#et_fab_size').val(settings.fabSize);
        jQuery('#et_fab_size_val').text(settings.fabSize + 'px');
        jQuery('#et_fab_opacity').val(settings.fabOpacity || 100);
        jQuery('#et_fab_opacity_val').text((settings.fabOpacity || 100) + '%');
        jQuery('#et_auto_scroll').prop('checked', settings.autoScroll);
        jQuery('#et_verbosity_default').val(settings.verbosityDefault || 'medium');
        // Context settings
        jQuery('#et_ctx_description').prop('checked', settings.ctxDescription !== false);
        jQuery('#et_ctx_personality').prop('checked', settings.ctxPersonality !== false);
        jQuery('#et_ctx_scenario').prop('checked', settings.ctxScenario !== false);
        jQuery('#et_ctx_persona').prop('checked', settings.ctxPersona === true);
        jQuery('#et_ctx_authors_note').prop('checked', settings.ctxAuthorsNote === true);
        jQuery('#et_ctx_world_info').prop('checked', settings.ctxWorldInfo === true);
        jQuery('#et_ctx_st_messages').prop('checked', settings.ctxSTMessages === true);
        jQuery('#et_ctx_st_context').prop('checked', settings.ctxSTContext === true);
        jQuery('#et_proactive_rate_limit').val(settings.proactiveRateLimitMinutes || 180);
        jQuery('#et_proactive_rate_limit_val').text((settings.proactiveRateLimitMinutes || 180) + ' min');
        // Activity mode
        const activeMode = settings.proactiveActivityMode || 'natural';
        jQuery('#et_activity_mode_grid').find('.et-activity-btn').removeClass('et-activity-btn-active');
        jQuery(`#et_activity_mode_grid .et-activity-btn[data-mode="${activeMode}"]`).addClass('et-activity-btn-active');
        jQuery('#et_activity_custom_row').toggle(activeMode === 'custom');
        const modeHint = (ACTIVITY_MODE_PRESETS[activeMode] || ACTIVITY_MODE_PRESETS.natural).hint;
        jQuery('#et_activity_mode_hint').text(modeHint);
        jQuery('#et_proactive_emotion_urgency').prop('checked', settings.proactiveEmotionUrgency !== false);
        updateProactiveToggleButtons();

        jQuery('.et-icon-option').removeClass('selected');
        jQuery(`.et-icon-option[data-icon="${settings.fabIcon}"]`).addClass('selected');

        updateProviderVisibility();
        updateThemePreview();
        // Update custom dropdowns
        updateCustomDropdown('et_theme_custom', settings.theme);
        updateCustomDropdown('et_font_family_custom', settings.fontFamily);

        // Strip reasoning tags
        jQuery('#et_strip_thinking_enabled').prop('checked', settings.stripThinkingTagsEnabled !== false);
        renderStripTagChips('et_strip_tag_chips');
        renderCustomPatternRows('et_custom_pattern_list');
        updateStripTagsSubsectionVisibility();

        // Also sync to panel accordion settings
        applySettingsToPanel();
    }

    // Apply settings to the panel accordion UI
    function applySettingsToPanel() {
        // General
        jQuery('#et_enabled_panel').prop('checked', settings.enabled);
        jQuery('#et_auto_open_panel').prop('checked', settings.autoOpenOnReload);
        jQuery('#et_auto_load_last_char_panel').prop('checked', settings.autoLoadLastCharacter === true);
        jQuery('#et_auto_scroll_panel').prop('checked', settings.autoScroll);
        jQuery('#et_show_avatar_panel').prop('checked', settings.showAvatar !== false);
        jQuery('#et_emotion_system_panel').prop('checked', settings.emotionSystemEnabled !== false);
        jQuery('#et_swiped_messages_panel').prop('checked', settings.swipedMessages === true);
        jQuery('#et_verbosity_default_panel').val(settings.verbosityDefault || 'medium');

        // Generation Engine
        jQuery('#et_source_panel').val(settings.source);
        jQuery('#et_profile_select_panel').val(settings.preset);
        jQuery('#et_ollama_url_panel').val(settings.ollama_url);
        jQuery('#et_openai_preset_panel').val(settings.openai_preset);
        jQuery('#et_openai_url_panel').val(settings.openai_url);
        jQuery('#et_openai_key_panel').val(settings.openai_key);
        jQuery('#et_openai_model_panel').val(settings.openai_model);
        jQuery('#et_anti_refusal_panel').prop('checked', settings.antiRefusal === true);
        jQuery('#et_image_generation_enabled_panel').prop('checked', settings.imageGenerationEnabled === true);
        jQuery('#et_image_generation_include_text_reply_panel').prop('checked', settings.imageGenerationIncludeTextReply !== false);
        jQuery('#et_image_generation_plugin_notice_panel').toggle(settings.imageGenerationEnabled === true);
        updateImageGenerationVisibility();
        updateProviderVisibilityPanel();

        // Populate connection profiles for panel
        populateConnectionProfilesPanel();

        // Context
        jQuery('#et_ctx_description_panel').prop('checked', settings.ctxDescription !== false);
        jQuery('#et_ctx_personality_panel').prop('checked', settings.ctxPersonality !== false);
        jQuery('#et_ctx_scenario_panel').prop('checked', settings.ctxScenario !== false);
        jQuery('#et_ctx_persona_panel').prop('checked', settings.ctxPersona === true);
        jQuery('#et_ctx_authors_note_panel').prop('checked', settings.ctxAuthorsNote === true);
        jQuery('#et_ctx_world_info_panel').prop('checked', settings.ctxWorldInfo === true);
        // World Info sub-panel — toggle visibility and apply saved mode state
        const _wiEnabled = settings.ctxWorldInfo === true;
        jQuery('#et-ctx-wi-sub_panel').toggle(_wiEnabled);
        if (_wiEnabled) {
            const _wiMode = settings.ctxWorldInfoMode || 'min_order';
            jQuery('#et-ctx-wi-sub_panel .et-ctx-wi-mode-btn').removeClass('et-ctx-wi-mode-btn-active');
            jQuery('#et-ctx-wi-sub_panel .et-ctx-wi-mode-btn[data-mode="' + _wiMode + '"]').addClass('et-ctx-wi-mode-btn-active');
            jQuery('#et_ctx_wi_min_panel').val(typeof settings.ctxWorldInfoMinOrder === 'number' ? settings.ctxWorldInfoMinOrder : 250);
            jQuery('#et_ctx_wi_max_panel').val(typeof settings.ctxWorldInfoMaxOrder === 'number' ? String(settings.ctxWorldInfoMaxOrder) : '');
            jQuery('#et_ctx_wi_targeted_panel').val(Array.isArray(settings.ctxWorldInfoTargetedOrders) ? settings.ctxWorldInfoTargetedOrders.join(', ') : '');
            toggleWIPanelRows(_wiMode);
        }
        jQuery('#et_ctx_st_messages_panel').prop('checked', settings.ctxSTMessages === true);
        jQuery('#et_ctx_st_context_panel').prop('checked', settings.ctxSTContext === true);
        jQuery('#et_proactive_rate_limit_panel').val(settings.proactiveRateLimitMinutes || 180);
        jQuery('#et_proactive_rate_limit_val_panel').text((settings.proactiveRateLimitMinutes || 180) + ' min');
        // Activity mode
        const activeModePanel = settings.proactiveActivityMode || 'natural';
        jQuery('#et_activity_mode_grid_panel').find('.et-activity-btn').removeClass('et-activity-btn-active');
        jQuery(`#et_activity_mode_grid_panel .et-activity-btn[data-mode="${activeModePanel}"]`).addClass('et-activity-btn-active');
        jQuery('#et_activity_custom_row_panel').toggle(activeModePanel === 'custom');
        const modeHintPanel = (ACTIVITY_MODE_PRESETS[activeModePanel] || ACTIVITY_MODE_PRESETS.natural).hint;
        jQuery('#et_activity_mode_hint_panel').text(modeHintPanel);
        jQuery('#et_proactive_emotion_urgency_panel').prop('checked', settings.proactiveEmotionUrgency !== false);
        updateProactiveToggleButtons();

        // Appearance
        jQuery('#et_font_size_panel').val(settings.fontSize);
        jQuery('#et_font_size_val_panel').text(settings.fontSize + 'px');
        jQuery('#et_glass_blur_panel').val(settings.glassBlur);
        jQuery('#et_glass_blur_val_panel').text(settings.glassBlur + 'px');
        jQuery('#et_glass_opacity_panel').val(settings.glassOpacity);
        jQuery('#et_glass_opacity_val_panel').text(settings.glassOpacity + '%');
        jQuery('#et_line_spacing_panel').val(settings.lineSpacing || 1.3);
        jQuery('#et_line_spacing_val_panel').text((settings.lineSpacing || 1.3).toFixed(2));
        jQuery('#et_paragraph_spacing_panel').val(settings.paragraphSpacing || 12);
        jQuery('#et_paragraph_spacing_val_panel').text((settings.paragraphSpacing || 12) + 'px');


        // Populate theme dropdown
        jQuery('#et_theme_panel_container').html(buildThemeDropdownHtml(settings.theme));
        // Populate font dropdown
        jQuery('#et_font_family_panel_container').html(buildFontDropdownHtml(settings.fontFamily));
        // Initialize custom dropdowns in panel
        initCustomDropdownsPanel();

        // Action Button
        jQuery('#et_fab_size_panel').val(settings.fabSize);
        jQuery('#et_fab_size_val_panel').text(settings.fabSize + 'px');
        jQuery('#et_fab_opacity_panel').val(settings.fabOpacity || 100);
        jQuery('#et_fab_opacity_val_panel').text((settings.fabOpacity || 100) + '%');
        initCustomDropdownPanel('et_fab_icon_panel', settings.fabIcon);

        // Populate Prompt Manager in Panel if available
        if (typeof settingsModal !== 'undefined' && settingsModal && typeof settingsModal.buildPromptManagerSectionHtml === 'function') {
            jQuery('#et_prompt_manager_panel_container').html(settingsModal.buildPromptManagerSectionHtml());
        }

        // Populate Memory System panel card list and apply scope pill state
        if (typeof settingsModal !== 'undefined' && settingsModal && typeof settingsModal.renderMemoryListInto === 'function') {
            settingsModal.renderMemoryListInto('#et_memory_list_panel', '#et_memory_empty_panel', '#et_memory_list_label_panel');
        }
        // Memory panel toggles
        jQuery('#et_memory_enabled_panel').prop('checked', settings.memoryEnabled !== false);
        jQuery('#et_memory_auto_extract_panel').prop('checked', settings.memoryAutoExtract !== false);
        // Memory scope pills
        const _memScope = settings.memoryScope || 'per-character';
        jQuery('#et_memory_scope_pills_panel .et-mem-scope-btn').removeClass('et-mem-scope-btn-active');
        jQuery(`#et_memory_scope_pills_panel .et-mem-scope-btn[data-scope="${_memScope}"]`).addClass('et-mem-scope-btn-active');
        jQuery('#et_memory_scope_hint_panel').text(
            _memScope === 'global' ? 'One shared memory pool for all characters.' : 'Each character keeps their own separate memory pool.'
        );
        // Strip reasoning tags
        jQuery('#et_strip_thinking_enabled_panel').prop('checked', settings.stripThinkingTagsEnabled !== false);
        renderStripTagChips('et_strip_tag_chips_panel');
        renderCustomPatternRows('et_custom_pattern_list_panel');
        updateStripTagsSubsectionVisibility();
    }

    function updateProactiveToggleButtons() {
        // Check both proactiveMessagingEnabled and dynamicSystemsEnabled for the toggle state
        const enabled = settings.proactiveMessagingEnabled !== false && settings.dynamicSystemsEnabled !== false;

        const syncButton = (selector) => {
            const btn = jQuery(selector);
            if (!btn.length) return;
            btn.toggleClass('et-proactive-paused', !enabled);
            btn.find('i').attr('class', `fa-solid ${enabled ? 'fa-toggle-on' : 'fa-toggle-off'}`);
            btn.find('span').text(`Proactive: ${enabled ? 'Enabled' : 'Paused'}`);
        };

        syncButton('#et_proactive_toggle_panel');
        syncButton('#et_proactive_toggle');
    }

    // Initialize a custom dropdown in the panel
    function initCustomDropdownPanel(id, currentValue) {
        const dropdown = jQuery('#' + id);
        if (!dropdown.length) return;

        dropdown.attr('data-value', currentValue);

        // Update selected option in menu
        dropdown.find('.et-dd-option').removeClass('et-dd-selected');
        dropdown.find(`.et-dd-option[data-value="${currentValue}"]`).addClass('et-dd-selected');

        // Update display
        const selectedOption = dropdown.find(`.et-dd-option[data-value="${currentValue}"]`).html();
        dropdown.find('.et-dd-display').html(selectedOption);
    }

    // Update provider visibility for panel
    function updateProviderVisibilityPanel() {
        const source = jQuery('#et_source_panel').val() || settings.source;
        jQuery('#et_profile_settings_panel').hide();
        jQuery('#et_ollama_settings_panel').hide();
        jQuery('#et_openai_settings_panel').hide();
        jQuery('#et_image_generation_plugin_notice_panel').toggle(settings.imageGenerationEnabled === true);
        if (source === 'profile') jQuery('#et_profile_settings_panel').show();
        if (source === 'ollama') jQuery('#et_ollama_settings_panel').show();
        if (source === 'openai') jQuery('#et_openai_settings_panel').show();
    }

    function updateImageGenerationVisibility() {
        const imgEnabled = settings.imageGenerationEnabled === true;
        const hasChar = !!getCurrentCharacter();
        const inGroup = groupManager && groupManager.isGroupSession();
        jQuery('#et_image_generation_plugin_notice').toggle(imgEnabled);
        jQuery('#et_image_generation_plugin_notice_panel').toggle(imgEnabled);
        jQuery('#et-overflow-gallery').toggle(imgEnabled && hasChar && !inGroup);
    }

    function updateContextOverrideBadge() {
        if (!contextOverride) return;
        const ov = contextOverride.getOverridesForCurrentChar();
        let count = 0;
        if (ov.description   && ov.description.trim())   count++;
        if (ov.personality   && ov.personality.trim())   count++;
        if (ov.scenario      && ov.scenario.trim())      count++;
        if (ov.textingStyleValue && ov.textingStyleValue.trim()) count++;
        const badge = jQuery('#et-overflow-ctx-badge');
        if (count > 0) {
            badge.text(count).show();
        } else {
            badge.hide();
        }
    }

    // Initialize custom dropdowns for panel
    function initCustomDropdownsPanel() {
        jQuery(document).off('click.et-dd-panel').on('click.et-dd-panel', '#et_theme_panel_container .et-custom-dropdown .et-dd-trigger, #et_font_family_panel_container .et-custom-dropdown .et-dd-trigger, #et_fab_icon_panel .et-dd-trigger', function (e) {
            e.stopPropagation();
            const dropdown = jQuery(this).closest('.et-custom-dropdown');
            const isOpen = dropdown.hasClass('et-dd-open');

            // Close all other dropdowns
            jQuery('.et-custom-dropdown').removeClass('et-dd-open');

            if (!isOpen) {
                dropdown.addClass('et-dd-open');
            }
        });

        jQuery(document).off('click.et-dd-option-panel').on('click.et-dd-option-panel', '#et_theme_panel_container .et-dd-option, #et_font_family_panel_container .et-dd-option', function () {
            const option = jQuery(this);
            const dropdown = option.closest('.et-custom-dropdown');
            const value = option.data('value');
            const id = dropdown.attr('id');

            dropdown.attr('data-value', value);
            dropdown.find('.et-dd-option').removeClass('et-dd-selected');
            option.addClass('et-dd-selected');

            // Update display
            dropdown.find('.et-dd-display').html(option.html());
            dropdown.removeClass('et-dd-open');

            // Trigger change based on dropdown type
            if (id === 'et_theme_custom') {
                settings.theme = value;
                saveSettings();
                applyAppearanceSettings();
                updateThemePreview();
                // Also update modal dropdown if open
                updateCustomDropdown('et_theme_custom', value);
            } else if (id === 'et_font_family_custom') {
                settings.fontFamily = value;
                saveSettings();
                applyAppearanceSettings();
                updateFontPreview(value);
                // Also update modal dropdown if open
                updateCustomDropdown('et_font_family_custom', value);
            }
        });

        // Close dropdowns when clicking outside
        jQuery(document).off('click.et-dd-outside-panel').on('click.et-dd-outside-panel', function (e) {
            if (!jQuery(e.target).closest('.et-custom-dropdown').length) {
                jQuery('.et-custom-dropdown').removeClass('et-dd-open');
            }
        });
    }

    // Initialize accordion functionality
    function initPanelAccordion() {
        jQuery(document).off('click.et-accordion').on('click.et-accordion', '.et-accordion-header', function () {
            const section = jQuery(this).closest('.et-accordion-section');
            const isOpen = section.hasClass('open');

            // Close all other sections with animation
            jQuery('.et-accordion-section').not(section).each(function () {
                const otherSection = jQuery(this);
                if (otherSection.hasClass('open')) {
                    otherSection.addClass('closing');
                    otherSection.removeClass('open');
                    setTimeout(() => otherSection.removeClass('closing'), 350);
                }
            });

            // Toggle current section
            if (isOpen) {
                section.addClass('closing');
                section.removeClass('open');
                setTimeout(() => section.removeClass('closing'), 350);
            } else {
                section.addClass('open');
            }
        });

        // Bind panel settings event handlers
        bindPanelSettingsEvents();
    }

    // Bind settings change events from panel to settings
    function bindPanelSettingsEvents() {
        // General - Enable toggle
        jQuery('#et_enabled_panel').off('change.panel').on('change.panel', function () {
            const checked = jQuery(this).is(':checked');
            settings.enabled = checked;
            saveSettings();
            toggleEchoTextMaster();
            // Sync with quick toggle and modal toggle
            jQuery('#et_enabled_quick').prop('checked', checked);
            jQuery('#et_enabled').prop('checked', checked);
        });

        // Quick toggle also needs to sync with panel toggle
        jQuery('#et_enabled_quick').off('change.panel').on('change.panel', function () {
            const checked = jQuery(this).is(':checked');
            settings.enabled = checked;
            saveSettings();
            toggleEchoTextMaster();
            // Sync with panel toggle and modal toggle
            jQuery('#et_enabled_panel').prop('checked', checked);
            jQuery('#et_enabled').prop('checked', checked);
        });

        // Auto-Open on Reload
        jQuery('#et_auto_open_panel').off('change.panel').on('change.panel', function () {
            settings.autoOpenOnReload = jQuery(this).is(':checked');
            saveSettings();
            // Sync with modal
            jQuery('#et_auto_open').prop('checked', settings.autoOpenOnReload);
        });

        // Auto-Load Last Character
        jQuery('#et_auto_load_last_char_panel').off('change.panel').on('change.panel', function () {
            settings.autoLoadLastCharacter = jQuery(this).is(':checked');
            saveSettings();
            // Sync with modal
            jQuery('#et_auto_load_last_char').prop('checked', settings.autoLoadLastCharacter);
        });

        // Auto-scroll
        jQuery('#et_auto_scroll_panel').off('change.panel').on('change.panel', function () {
            settings.autoScroll = jQuery(this).is(':checked');
            saveSettings();
            // Sync with modal
            jQuery('#et_auto_scroll').prop('checked', settings.autoScroll);
        });

        // Verbosity Default
        jQuery('#et_verbosity_default_panel').off('change.panel').on('change.panel', function () {
            settings.verbosityDefault = jQuery(this).val();
            saveSettings();
            // Sync with modal
            jQuery('#et_verbosity_default').val(settings.verbosityDefault);
        });

        // Show avatar
        jQuery('#et_show_avatar_panel').off('change.panel').on('change.panel', function () {
            settings.showAvatar = jQuery(this).is(':checked');
            saveSettings();
            // Sync with modal
            jQuery('#et_show_avatar').prop('checked', settings.showAvatar);
            // Update messages to show/hide bubble avatars
            if (panelOpen) {
                const history = getChatHistory();
                renderMessages(history);
            }
        });

        // Emotion system toggle (panel)
        jQuery('#et_emotion_system_panel').off('change.panel').on('change.panel', function () {
            settings.emotionSystemEnabled = jQuery(this).is(':checked');
            saveSettings();
            // Sync with modal
            jQuery('#et_emotion_system').prop('checked', settings.emotionSystemEnabled);
            jQuery('#et-emotion-indicator').toggleClass('et-emotion-indicator-hidden', !settings.emotionSystemEnabled);
            updatePanelStatusRow();
        });

        // Swiped messages toggle (panel)
        jQuery('#et_swiped_messages_panel').off('change.panel').on('change.panel', function () {
            settings.swipedMessages = jQuery(this).is(':checked');
            saveSettings();
            // Sync with modal
            jQuery('#et_swiped_messages').prop('checked', settings.swipedMessages === true);
        });

        // Generation Engine - Source
        jQuery('#et_source_panel').off('change.panel').on('change.panel', function () {
            settings.source = jQuery(this).val();
            saveSettings();
            updateProviderVisibilityPanel();
            // Sync with modal
            jQuery('#et_source').val(settings.source);
            updateProviderVisibility();
            if (settings.source === 'profile') populateConnectionProfiles();
            if (settings.source === 'ollama') fetchOllamaModels();
        });

        // Profile select
        jQuery('#et_profile_select_panel').off('change.panel').on('change.panel', function () {
            settings.preset = jQuery(this).val();
            saveSettings();
            // Sync with modal
            jQuery('#et_profile_select').val(settings.preset);
        });

        // Ollama
        jQuery('#et_ollama_url_panel').off('change.panel').on('change.panel', function () {
            settings.ollama_url = jQuery(this).val();
            saveSettings();
            // Sync with modal
            jQuery('#et_ollama_url').val(settings.ollama_url);
            fetchOllamaModels();
        });

        jQuery('#et_ollama_model_select_panel').off('change.panel').on('change.panel', function () {
            settings.ollama_model = jQuery(this).val();
            saveSettings();
            // Sync with modal
            jQuery('#et_ollama_model_select').val(settings.ollama_model);
        });

        // OpenAI
        jQuery('#et_openai_preset_panel').off('change.panel').on('change.panel', function () {
            settings.openai_preset = jQuery(this).val();
            const presets = { lmstudio: 'http://localhost:1234/v1', kobold: 'http://localhost:5001/v1', textgen: 'http://localhost:5000/v1', vllm: 'http://localhost:8000/v1' };
            if (presets[settings.openai_preset]) {
                settings.openai_url = presets[settings.openai_preset];
                jQuery('#et_openai_url_panel').val(settings.openai_url);
            }
            saveSettings();
            // Sync with modal
            jQuery('#et_openai_preset').val(settings.openai_preset);
            jQuery('#et_openai_url').val(settings.openai_url);
        });

        jQuery('#et_openai_url_panel').off('change.panel').on('change.panel', function () {
            settings.openai_url = jQuery(this).val();
            saveSettings();
            // Sync with modal
            jQuery('#et_openai_url').val(settings.openai_url);
        });

        jQuery('#et_openai_key_panel').off('change.panel').on('change.panel', function () {
            settings.openai_key = jQuery(this).val();
            saveSettings();
            // Sync with modal
            jQuery('#et_openai_key').val(settings.openai_key);
        });

        jQuery('#et_openai_model_panel').off('change.panel').on('change.panel', function () {
            settings.openai_model = jQuery(this).val();
            saveSettings();
            // Sync with modal
            jQuery('#et_openai_model').val(settings.openai_model);
        });

        // Anti-Refusal Framing
        jQuery('#et_anti_refusal_panel').off('change.panel').on('change.panel', function () {
            settings.antiRefusal = jQuery(this).is(':checked');
            saveSettings();
            // Sync with modal
            jQuery('#et_anti_refusal').prop('checked', settings.antiRefusal);
        });

        // Image Generation toggle (panel)
        jQuery('#et_image_generation_enabled_panel').off('change.panel').on('change.panel', function () {
            settings.imageGenerationEnabled = jQuery(this).is(':checked');
            saveSettings();
            // Sync with modal
            jQuery('#et_image_generation_enabled').prop('checked', settings.imageGenerationEnabled);
            jQuery('#et_image_generation_plugin_notice').toggle(settings.imageGenerationEnabled === true);
            updateImageGenerationVisibility();
        });

        // Context settings
        jQuery('#et_ctx_description_panel').off('change.panel').on('change.panel', function () {
            settings.ctxDescription = jQuery(this).is(':checked');
            saveSettings();
            // Sync with modal
            jQuery('#et_ctx_description').prop('checked', settings.ctxDescription);
        });

        jQuery('#et_ctx_personality_panel').off('change.panel').on('change.panel', function () {
            settings.ctxPersonality = jQuery(this).is(':checked');
            saveSettings();
            // Sync with modal
            jQuery('#et_ctx_personality').prop('checked', settings.ctxPersonality);
        });

        jQuery('#et_ctx_scenario_panel').off('change.panel').on('change.panel', function () {
            settings.ctxScenario = jQuery(this).is(':checked');
            saveSettings();
            // Sync with modal
            jQuery('#et_ctx_scenario').prop('checked', settings.ctxScenario);
        });

        jQuery('#et_ctx_persona_panel').off('change.panel').on('change.panel', function () {
            settings.ctxPersona = jQuery(this).is(':checked');
            saveSettings();
            // Sync with modal
            jQuery('#et_ctx_persona').prop('checked', settings.ctxPersona);
        });

        jQuery('#et_ctx_authors_note_panel').off('change.panel').on('change.panel', function () {
            settings.ctxAuthorsNote = jQuery(this).is(':checked');
            saveSettings();
            // Sync with modal
            jQuery('#et_ctx_authors_note').prop('checked', settings.ctxAuthorsNote);
        });

        jQuery('#et_ctx_world_info_panel').off('change.panel').on('change.panel', function () {
            settings.ctxWorldInfo = jQuery(this).is(':checked');
            saveSettings();
            // Sync with modal
            jQuery('#et_ctx_world_info').prop('checked', settings.ctxWorldInfo);
            // Toggle sub-panel
            jQuery('#et-ctx-wi-sub_panel').toggle(settings.ctxWorldInfo);
            if (settings.ctxWorldInfo) {
                const _m = settings.ctxWorldInfoMode || 'min_order';
                jQuery('#et-ctx-wi-sub_panel .et-ctx-wi-mode-btn').removeClass('et-ctx-wi-mode-btn-active');
                jQuery('#et-ctx-wi-sub_panel .et-ctx-wi-mode-btn[data-mode="' + _m + '"]').addClass('et-ctx-wi-mode-btn-active');
                toggleWIPanelRows(_m);
            }
        });

        // World Info mode buttons (panel)
        jQuery('#et-ctx-wi-sub_panel').off('click.wi-panel').on('click.wi-panel', '.et-ctx-wi-mode-btn', function () {
            const mode = jQuery(this).data('mode');
            settings.ctxWorldInfoMode = mode;
            saveSettings();
            jQuery('#et-ctx-wi-sub_panel .et-ctx-wi-mode-btn').removeClass('et-ctx-wi-mode-btn-active');
            jQuery(this).addClass('et-ctx-wi-mode-btn-active');
            toggleWIPanelRows(mode);
        });

        // World Info input fields (panel)
        jQuery('#et_ctx_wi_min_panel').off('input.wi-panel').on('input.wi-panel', function () {
            const val = parseInt(jQuery(this).val(), 10);
            settings.ctxWorldInfoMinOrder = isNaN(val) ? 250 : val;
            saveSettings();
        });
        jQuery('#et_ctx_wi_max_panel').off('input.wi-panel').on('input.wi-panel', function () {
            const raw = jQuery(this).val().trim();
            const val = parseInt(raw, 10);
            settings.ctxWorldInfoMaxOrder = (raw === '' || isNaN(val)) ? null : val;
            saveSettings();
        });
        jQuery('#et_ctx_wi_targeted_panel').off('input.wi-panel').on('input.wi-panel', function () {
            const raw = jQuery(this).val().trim();
            settings.ctxWorldInfoTargetedOrders = !raw ? [] : raw.split(',').map(function (v) { return parseInt(v.trim(), 10); }).filter(function (n) { return !isNaN(n); });
            saveSettings();
        });

        jQuery('#et_ctx_st_messages_panel').off('change.panel').on('change.panel', function () {
            settings.ctxSTMessages = jQuery(this).is(':checked');
            saveSettings();
            // Sync with modal
            jQuery('#et_ctx_st_messages').prop('checked', settings.ctxSTMessages);
        });

        jQuery('#et_ctx_st_context_panel').off('change.panel').on('change.panel', function () {
            settings.ctxSTContext = jQuery(this).is(':checked');
            saveSettings();
            // Sync with modal
            jQuery('#et_ctx_st_context').prop('checked', settings.ctxSTContext);
        });

        // Strip Reasoning Tags toggle
        jQuery('#et_strip_thinking_enabled_panel').off('change.panel').on('change.panel', function () {
            settings.stripThinkingTagsEnabled = jQuery(this).is(':checked');
            saveSettings();
            jQuery('#et_strip_thinking_enabled').prop('checked', settings.stripThinkingTagsEnabled);
            updateStripTagsSubsectionVisibility();
        });

        // Strip tag chip remove
        jQuery('#et_strip_tag_chips_panel').off('click.panel').on('click.panel', '.et-strip-tag-remove', function () {
            const idx = parseInt(jQuery(this).data('index'), 10);
            if (!Array.isArray(settings.stripThinkingTagList)) return;
            settings.stripThinkingTagList.splice(idx, 1);
            invalidateStripTagsCache();
            saveSettings();
            renderStripTagChips('et_strip_tag_chips_panel');
            renderStripTagChips('et_strip_tag_chips');
        });

        // Strip tag add button
        jQuery('#et_strip_tag_add_panel').off('click.panel').on('click.panel', function () {
            const input = jQuery('#et_strip_tag_input_panel');
            const val = (input.val() || '').trim().replace(/^<|>$/g, '');
            if (!val) return;
            if (!Array.isArray(settings.stripThinkingTagList)) settings.stripThinkingTagList = [];
            if (!settings.stripThinkingTagList.includes(val)) {
                settings.stripThinkingTagList.push(val);
                invalidateStripTagsCache();
                saveSettings();
                renderStripTagChips('et_strip_tag_chips_panel');
                renderStripTagChips('et_strip_tag_chips');
            }
            input.val('');
        });

        // Strip tag input enter key
        jQuery('#et_strip_tag_input_panel').off('keydown.panel').on('keydown.panel', function (e) {
            if (e.key === 'Enter') jQuery('#et_strip_tag_add_panel').trigger('click');
        });

        // Strip tag reset button
        jQuery('#et_strip_tag_reset_panel').off('click.panel').on('click.panel', function () {
            settings.stripThinkingTagList = [...STRIP_TAGS_DEFAULTS];
            invalidateStripTagsCache();
            saveSettings();
            renderStripTagChips('et_strip_tag_chips_panel');
            renderStripTagChips('et_strip_tag_chips');
        });

        // Custom pattern remove
        jQuery('#et_custom_pattern_list_panel').off('click.panel').on('click.panel', '.et-custom-pattern-remove', function () {
            const idx = parseInt(jQuery(this).data('index'), 10);
            if (!Array.isArray(settings.stripCustomPatterns)) return;
            settings.stripCustomPatterns.splice(idx, 1);
            invalidateStripTagsCache();
            saveSettings();
            renderCustomPatternRows('et_custom_pattern_list_panel');
            renderCustomPatternRows('et_custom_pattern_list');
        });

        // Custom pattern add
        jQuery('#et_custom_pattern_add_panel').off('click.panel').on('click.panel', function () {
            const start = (jQuery('#et_custom_pattern_start_panel').val() || '').trim();
            const end = (jQuery('#et_custom_pattern_end_panel').val() || '').trim();
            if (!start || !end) return;
            if (!Array.isArray(settings.stripCustomPatterns)) settings.stripCustomPatterns = [];
            settings.stripCustomPatterns.push({ start, end });
            invalidateStripTagsCache();
            saveSettings();
            renderCustomPatternRows('et_custom_pattern_list_panel');
            renderCustomPatternRows('et_custom_pattern_list');
            jQuery('#et_custom_pattern_start_panel').val('');
            jQuery('#et_custom_pattern_end_panel').val('');
        });

        // Font size
        jQuery('#et_font_size_panel').off('input.panel').on('input.panel', function () {
            settings.fontSize = parseInt(jQuery(this).val());
            jQuery('#et_font_size_val_panel').text(settings.fontSize + 'px');
            applyAppearanceSettings();
            saveSettings();
            // Sync with modal
            jQuery('#et_font_size').val(settings.fontSize);
            jQuery('#et_font_size_val').text(settings.fontSize + 'px');
        });

        // Line spacing
        jQuery('#et_line_spacing_panel').off('input.panel').on('input.panel', function () {
            settings.lineSpacing = parseFloat(jQuery(this).val());
            jQuery('#et_line_spacing_val_panel').text(settings.lineSpacing.toFixed(2));
            applyAppearanceSettings();
            saveSettings();
            jQuery('#et_line_spacing').val(settings.lineSpacing);
            jQuery('#et_line_spacing_val').text(settings.lineSpacing.toFixed(2));
        });

        // Message spacing
        jQuery('#et_paragraph_spacing_panel').off('input.panel').on('input.panel', function () {
            settings.paragraphSpacing = parseInt(jQuery(this).val());
            jQuery('#et_paragraph_spacing_val_panel').text(settings.paragraphSpacing + 'px');
            applyAppearanceSettings();
            saveSettings();
            jQuery('#et_paragraph_spacing').val(settings.paragraphSpacing);
            jQuery('#et_paragraph_spacing_val').text(settings.paragraphSpacing + 'px');
        });

        // Glass blur
        jQuery('#et_glass_blur_panel').off('input.panel').on('input.panel', function () {
            settings.glassBlur = parseInt(jQuery(this).val());
            jQuery('#et_glass_blur_val_panel').text(settings.glassBlur + 'px');
            applyAppearanceSettings();
            saveSettings();
            // Sync with modal
            jQuery('#et_glass_blur').val(settings.glassBlur);
            jQuery('#et_glass_blur_val').text(settings.glassBlur + 'px');
        });

        // Glass opacity
        jQuery('#et_glass_opacity_panel').off('input.panel').on('input.panel', function () {
            settings.glassOpacity = parseInt(jQuery(this).val());
            jQuery('#et_glass_opacity_val_panel').text(settings.glassOpacity + '%');
            applyAppearanceSettings();
            saveSettings();
            // Sync with modal
            jQuery('#et_glass_opacity').val(settings.glassOpacity);
            jQuery('#et_glass_opacity_val').text(settings.glassOpacity + '%');
        });



        // FAB Size
        jQuery('#et_fab_size_panel').off('input.panel').on('input.panel', function () {
            settings.fabSize = parseInt(jQuery(this).val());
            jQuery('#et_fab_size_val_panel').text(settings.fabSize + 'px');
            applyAppearanceSettings();
            positionFab();
            saveSettings();
            // Sync with modal
            jQuery('#et_fab_size').val(settings.fabSize);
            jQuery('#et_fab_size_val').text(settings.fabSize + 'px');
        });

        // FAB Opacity
        jQuery('#et_fab_opacity_panel').off('input.panel').on('input.panel', function () {
            settings.fabOpacity = parseInt(jQuery(this).val());
            jQuery('#et_fab_opacity_val_panel').text(settings.fabOpacity + '%');
            applyAppearanceSettings();
            positionFab();
            saveSettings();
        });

        // FAB Icon
        jQuery('#et_fab_icon_panel').off('click.panel', '.et-dd-option').on('click.panel', '#et_fab_icon_panel .et-dd-option', function () {
            const option = jQuery(this);
            const dropdown = option.closest('.et-custom-dropdown');
            const value = option.data('value');

            dropdown.attr('data-value', value);
            dropdown.find('.et-dd-option').removeClass('et-dd-selected');
            option.addClass('et-dd-selected');

            // Update display
            dropdown.find('.et-dd-display').html(option.html());
            dropdown.removeClass('et-dd-open');

            settings.fabIcon = value;
            applyAppearanceSettings();
            saveSettings();
            // Sync with modal
            jQuery('.et-icon-option').removeClass('selected');
            jQuery(`.et-icon-option[data-icon="${settings.fabIcon}"]`).addClass('selected');
        });

        // Activity mode selector (panel accordion)
        jQuery('#et_activity_mode_grid_panel').off('click.panel').on('click.panel', '.et-activity-btn', function () {
            const mode = jQuery(this).data('mode');
            applyActivityMode(mode,
                '#et_activity_mode_grid_panel', '#et_activity_custom_row_panel',
                '#et_proactive_rate_limit_panel', '#et_proactive_rate_limit_val_panel', '#et_activity_mode_hint_panel');
            // Mirror to modal if open
            applyActivityMode(mode,
                '#et_activity_mode_grid', '#et_activity_custom_row',
                '#et_proactive_rate_limit', '#et_proactive_rate_limit_val', '#et_activity_mode_hint');
        });

        jQuery('#et_proactive_rate_limit_panel').off('input.panel').on('input.panel', function () {
            const minutes = parseInt(jQuery(this).val(), 10) || 180;
            jQuery('#et_proactive_rate_limit_val_panel').text(minutes + ' min');
            settings.proactiveRateLimitMinutes = minutes;
            saveSettings();
            jQuery('#et_proactive_rate_limit').val(minutes);
            jQuery('#et_proactive_rate_limit_val').text(minutes + ' min');
        });

        jQuery('#et_proactive_emotion_urgency_panel').off('change.panel').on('change.panel', function () {
            settings.proactiveEmotionUrgency = jQuery(this).prop('checked');
            saveSettings();
            jQuery('#et_proactive_emotion_urgency').prop('checked', settings.proactiveEmotionUrgency);
        });

        jQuery('#et_proactive_refresh_panel').off('click.panel').on('click.panel', function () {
            refreshProactiveInsights();
        });

        jQuery('#et_proactive_toggle_panel').off('click.panel').on('click.panel', function () {
            // Toggle both proactiveMessagingEnabled and dynamicSystemsEnabled
            const newState = settings.proactiveMessagingEnabled === false ? true : false;
            settings.proactiveMessagingEnabled = newState;
            settings.dynamicSystemsEnabled = newState;
            saveSettings();
            updateProactiveToggleButtons();
            startProactiveScheduler();
            refreshProactiveInsights();
        });

        jQuery('#et_trigger_message_panel').off('click.panel').on('click.panel', function () {
            triggerTestProactiveMessage();
        });

        // Trigger pill click-to-copy (panel accordion)
        jQuery(document).off('click.pillcopy').on('click.pillcopy', '.et-imagetrig-pill-copyable', function () {
            const pill = jQuery(this);
            const text = pill.data('copy');
            if (!text) return;
            navigator.clipboard.writeText(text).then(() => {
                pill.addClass('et-imagetrig-pill-copied');
                setTimeout(() => pill.removeClass('et-imagetrig-pill-copied'), 1400);
            }).catch(() => {});
        });

        // iOS: patch panel sliders for touch. Called here — after the panel
        // HTML is guaranteed to be in the DOM and all jQuery input.panel
        // handlers above are already bound — so the touch handler's
        // dispatched 'input' events will trigger them correctly.
        if (window.EchoTextSettingsModal && window.EchoTextSettingsModal.patchIOSSliders) {
            window.EchoTextSettingsModal.patchIOSSliders(document);
        }

        // Custom theme editor button (panel drawer)
        jQuery(document).off('click.et-panel-te').on('click.et-panel-te', '#et-te-open-btn-panel', function () {
            if (themeEditor) themeEditor.openThemeEditor();
            moveModalToPortal('#et-theme-editor-overlay');
        });
    }

    // ── Background luminance detection for adaptive glassmorphism ──────────────
    // Extracts {r, g, b} integer components from a CSS rgb/rgba/hex color string.
    // Returns null if the string cannot be parsed (e.g. named colors, gradients).
    function extractRgbComponents(colorStr) {
        if (!colorStr) return null;
        const m = String(colorStr).match(/rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)/);
        if (m) return { r: Math.round(+m[1]), g: Math.round(+m[2]), b: Math.round(+m[3]) };
        const hm = String(colorStr).match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i);
        if (hm) return { r: parseInt(hm[1], 16), g: parseInt(hm[2], 16), b: parseInt(hm[3], 16) };
        return null;
    }

    // Converts a parsed CSS rgb/rgba color string to WCAG relative luminance (0–1).
    // Returns null if the string cannot be parsed (e.g. named colors, gradients).
    function cssColorToRelativeLuminance(cssColor) {
        if (!cssColor) return null;
        const m = String(cssColor).match(/rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)/);
        if (!m) return null;
        const lin = v => {
            const c = v / 255;
            return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
        };
        return 0.2126 * lin(+m[1]) + 0.7152 * lin(+m[2]) + 0.0722 * lin(+m[3]);
    }

    // Detects whether SillyTavern's current background is perceptually light.
    // Uses three independent signals in priority order so it works across the
    // full variety of ST themes and background image configurations.
    function detectSillyTavernBgIsLight() {
        const cs = getComputedStyle(document.documentElement);

        // 1. SmartThemeBlurTintColor — ST's tint for blurred-glass surfaces;
        //    closely tracks the underlying background lightness.
        const tint = cs.getPropertyValue('--SmartThemeBlurTintColor').trim();
        if (tint) {
            const lum = cssColorToRelativeLuminance(tint);
            if (lum !== null) return lum > 0.25;
        }

        // 2. Actual background-color on SillyTavern's body element.
        const bgEl = document.getElementById('body_2') || document.body;
        const bgColor = getComputedStyle(bgEl).backgroundColor;
        if (bgColor && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent') {
            const lum = cssColorToRelativeLuminance(bgColor);
            if (lum !== null) return lum > 0.25;
        }

        // 3. SmartThemeBodyColor (text color) — inverted: dark text implies light bg.
        const textColor = cs.getPropertyValue('--SmartThemeBodyColor').trim();
        if (textColor) {
            const lum = cssColorToRelativeLuminance(textColor);
            if (lum !== null) return lum < 0.25;
        }

        return false; // safe default: treat as dark
    }

    // Adds or removes html.et-bg-light based on detected background luminance.
    // Reads SillyTavern's live CSS custom properties and maps them to EchoText
    // CSS variables. Only called when the 'sillytavern' theme preset is active.
    // Handles the values that cannot be expressed as pure CSS var() references
    // (e.g. RGB triplets, derived alpha variants).
    function applySillyTavernThemeColors() {
        const cs  = getComputedStyle(document.documentElement);
        const root = document.documentElement;

        // ── Panel glass background ──────────────────────────────────────────
        // --SmartThemeBlurTintColor is ST's "UI Background" tint.  We extract
        // its R/G/B so that --et-panel-bg-rgb can feed rgba(r,g,b,opacity).
        const blurTint = cs.getPropertyValue('--SmartThemeBlurTintColor').trim();
        const blurRgb  = extractRgbComponents(blurTint);
        if (blurRgb) {
            root.style.setProperty('--et-panel-bg-rgb', `${blurRgb.r}, ${blurRgb.g}, ${blurRgb.b}`);
        } else {
            root.style.removeProperty('--et-panel-bg-rgb');
        }

        // ── Accent / theme colour ───────────────────────────────────────────
        // --SmartThemeQuoteColor is ST's "Quote Text" highlight — typically the
        // most vivid accent in the palette, a good stand-in for ET's accent.
        const quoteColor = cs.getPropertyValue('--SmartThemeQuoteColor').trim();
        if (quoteColor) {
            root.style.setProperty('--et-theme-color', quoteColor);
        } else {
            root.style.removeProperty('--et-theme-color');
        }

        // ── Character bubble background ─────────────────────────────────────
        // --SmartThemeBotMesBlurTintColor is ST's "AI Message" tint.
        // We use a moderate alpha so it stays translucent on the glass panel.
        const botTint = cs.getPropertyValue('--SmartThemeBotMesBlurTintColor').trim();
        const botRgb  = extractRgbComponents(botTint);
        if (botRgb) {
            root.style.setProperty('--et-char-bubble-bg', `rgba(${botRgb.r}, ${botRgb.g}, ${botRgb.b}, 0.55)`);
        } else {
            root.style.removeProperty('--et-char-bubble-bg');
        }
    }

    // Only runs auto-detection for the 'sillytavern' theme preset (all other
    // presets are explicitly dark and never need the light variant).
    function applyAdaptiveGlass() {
        const theme = getAllThemePresets()[settings.theme] || THEME_PRESETS.sillytavern;
        if (theme.primary) {
            // Explicit dark theme selected — never apply light glass
            document.documentElement.classList.remove('et-bg-light');
            return;
        }
        if (detectSillyTavernBgIsLight()) {
            document.documentElement.classList.add('et-bg-light');
        } else {
            document.documentElement.classList.remove('et-bg-light');
        }
    }

    function applyAppearanceSettings() {
        const theme = getAllThemePresets()[settings.theme] || THEME_PRESETS.sillytavern;

        if (theme.primary) {
            document.documentElement.style.setProperty('--et-bg', theme.primary);
            document.documentElement.style.setProperty('--et-header-bg', 'rgba(0,0,0,0.3)');
            document.documentElement.style.setProperty('--et-char-bubble-bg', 'rgba(255,255,255,0.08)');
            // Revert panel-bg-rgb to :root default so it matches the explicit theme's dark palette.
            document.documentElement.style.removeProperty('--et-panel-bg-rgb');
        } else {
            document.documentElement.style.removeProperty('--et-bg');
            document.documentElement.style.removeProperty('--et-header-bg');
            document.documentElement.style.removeProperty('--et-char-bubble-bg');
        }
        if (theme.text) {
            document.documentElement.style.setProperty('--et-text', theme.text);
            document.documentElement.style.setProperty('--et-text-muted', hexToRgba(theme.text, 0.55));
        } else {
            document.documentElement.style.removeProperty('--et-text');
            document.documentElement.style.removeProperty('--et-text-muted');
        }
        if (theme.accent) {
            document.documentElement.style.setProperty('--et-theme-color', theme.accent);
        } else {
            document.documentElement.style.removeProperty('--et-theme-color');
        }

        document.documentElement.style.setProperty('--et-glass-blur', settings.glassBlur + 'px');
        document.documentElement.style.setProperty('--et-glass-opacity', (settings.glassOpacity / 100).toFixed(2));
        document.documentElement.style.setProperty('--et-font-size', settings.fontSize + 'px');
        document.documentElement.style.setProperty('--et-font-family', `'${settings.fontFamily}', sans-serif`);
        document.documentElement.style.setProperty('--et-fab-size', settings.fabSize + 'px');
        document.documentElement.style.setProperty('--et-fab-opacity', (settings.fabOpacity || 100) / 100);
        document.documentElement.style.setProperty('--et-line-spacing', (settings.lineSpacing || 1.3).toFixed(2));
        document.documentElement.style.setProperty('--et-paragraph-spacing', (settings.paragraphSpacing || 12) + 'px');

        loadGoogleFont(settings.fontFamily);



        // Update FAB
        const fab = jQuery('#et-fab');
        if (fab.length) {
            fab.find('i').attr('class', `fa-solid ${settings.fabIcon}`);
            fab.css({ width: settings.fabSize + 'px', height: settings.fabSize + 'px' });
        }

        // Re-render messages if panel is open (to apply avatar visibility)
        if (panelOpen) {
            const history = getChatHistory();
            renderMessages(history);
        }

        // For the SillyTavern preset, pull live colors from ST's CSS variables.
        // Must run before applyAdaptiveGlass() so the correct tint is detected.
        if (!theme.primary) {
            applySillyTavernThemeColors();
        }

        applyAdaptiveGlass();
    }

    function hexToRgba(hex, alpha) {
        // Handle CSS var() or named colors — just return with opacity
        if (!hex || hex.startsWith('var(') || hex.startsWith('rgb')) {
            return `rgba(180,180,200,${alpha})`;
        }
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        if (isNaN(r)) return `rgba(180,180,200,${alpha})`;
        return `rgba(${r},${g},${b},${alpha})`;
    }

    function loadGoogleFont(fontFamily) {
        const googleFonts = ['Inter', 'Nunito', 'Poppins', 'Lato', 'Roboto', 'Source Sans Pro', 'Merriweather', 'Playfair Display'];
        if (!googleFonts.includes(fontFamily)) return;
        if (loadedFontFamily === fontFamily) return;

        jQuery('#et-google-font').remove();
        const fontSlug = fontFamily.replace(/ /g, '+');
        const link = document.createElement('link');
        link.id = 'et-google-font';
        link.rel = 'stylesheet';
        link.href = `https://fonts.googleapis.com/css2?family=${fontSlug}:wght@400;500;600;700&display=swap`;
        document.head.appendChild(link);
        loadedFontFamily = fontFamily;
    }

    function updateThemePreview() {
        const theme = getAllThemePresets()[settings.theme] || THEME_PRESETS.sillytavern;
        const preview = jQuery('#et_theme_preview');
        if (!preview.length) return;
        const swatches = theme.swatches || [];
        preview.html(swatches.map(c => `<span class="et-theme-swatch" style="background:${c};"></span>`).join(''));
    }

    function updateProviderVisibility() {
        const source = jQuery('#et_source').val() || settings.source;
        jQuery('#et_profile_settings').hide();
        jQuery('#et_ollama_settings').hide();
        jQuery('#et_openai_settings').hide();
        updateImageGenerationVisibility();
        if (source === 'profile') jQuery('#et_profile_settings').show();
        if (source === 'ollama') jQuery('#et_ollama_settings').show();
        if (source === 'openai') jQuery('#et_openai_settings').show();
    }

    // ============================================================
    // CHARACTER CARD HELPERS
    // ============================================================

    function getCurrentCharacter() {
        // In a group session, return the active group member instead of context.characterId
        if (groupManager && groupManager.isGroupSession()) {
            const groupChar = groupManager.getActiveGroupCharacter();
            if (groupChar) return groupChar;
        }

        const pickerChars = getAllCharactersForPicker();
        if (selectedCharacterKey) {
            const selectedChar = pickerChars.find(char => char.__key === selectedCharacterKey);
            if (selectedChar) return selectedChar;
        }

        const context = SillyTavern.getContext();
        if (context.characterId === undefined || context.characterId === null) return null;
        return context.characters?.[context.characterId] || null;
    }

    function getCharacterKey() {
        const char = getCurrentCharacter();
        if (!char) return null;
        return char.avatar || char.name || 'unknown';
    }

    function getCharacterName() {
        const char = getCurrentCharacter();
        return char?.name || 'Character';
    }

    function getCharacterByKey(characterKey) {
        if (!characterKey) return null;
        return getAllCharactersForPicker().find(char => char.__key === characterKey) || null;
    }

    function applySelectedCharacterToPanel() {
        if (!panelOpen) return;

        // ── Combine mode: show all members in header ──────────────────
        if (groupManager && groupManager.isGroupSession() && groupManager.isCombineMode()) {
            const members = groupManager.getGroupMembers();
            const charNames = members.map(c => c.name).join(', ');
            jQuery('#et-panel-drag-handle').removeClass('et-panel-header-no-char');
            jQuery('#et-panel').removeClass('et-panel-no-char');
            jQuery('#et-char-name').html(`Group: ${escapeHtml(charNames)}<i class="fa-solid fa-chevron-down et-char-name-caret" aria-hidden="true"></i>`);
            jQuery('#et-input').attr('placeholder', `Message all: ${charNames}...`).prop('disabled', false);
            jQuery('#et-send-btn').prop('disabled', false);
            jQuery('#et-emotion-indicator').addClass('et-emotion-indicator-hidden');
            updatePanelStatusRow();
            updateImageGenerationVisibility();
            jQuery('#et-overflow-saveload, #et-overflow-char-divider, #et-overflow-clear').show();
            // Context override is Untethered-only — hide in combine/group modes
            jQuery('#et-overflow-context').hide();
            const history = getChatHistory();
            renderMessages(history);
            return;
        }

        // ── Normal / single-character path ───────────────────────────
        const charName = getCharacterName();
        const hasChar = !!getCurrentCharacter();
        const inGroup = groupManager && groupManager.isGroupSession();
        // Emotion indicator is always hidden in group sessions
        const emotionEnabled = settings.emotionSystemEnabled !== false && isTetheredMode() && !inGroup;

        jQuery('#et-panel-drag-handle').toggleClass('et-panel-header-no-char', !hasChar);
        jQuery('#et-panel').toggleClass('et-panel-no-char', !hasChar);
        jQuery('#et-char-name').html(`${escapeHtml(hasChar ? charName : 'Choose A Character')}<i class="fa-solid fa-chevron-down et-char-name-caret" aria-hidden="true"></i>`);
        jQuery('#et-char-avatar-wrap').replaceWith(buildAvatarHtml(charName, '', 'et-char-avatar-wrap'));
        jQuery('#et-input').attr('placeholder', hasChar ? `Text ${charName}...` : 'Text a character...').prop('disabled', !hasChar);
        jQuery('#et-send-btn').prop('disabled', !hasChar);
        jQuery('#et-emotion-indicator').toggleClass('et-emotion-indicator-hidden', !emotionEnabled);

        if (emotionEnabled) {
            updateEmotionIndicator();
        }
        updatePanelStatusRow();
        updateImageGenerationVisibility();

        // Show/hide character-dependent overflow menu items
        jQuery('#et-overflow-saveload, #et-overflow-char-divider, #et-overflow-clear').toggle(hasChar);
        // Context override is only available in Untethered mode
        const showCtx = hasChar && !isTetheredMode();
        jQuery('#et-overflow-context').toggle(showCtx);
        if (showCtx) updateContextOverrideBadge();

        const history = getChatHistory();
        renderMessages(history);
        const charKey = getCharacterKey();
        if (charKey && isTetheredMode() && !inGroup) {
            syncProactiveStateWithHistory(charKey, history);
        }
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function getAllCharactersForPicker() { return characterPicker.getAllCharactersForPicker(); }
    function getAvatarUrlForCharacter(char) { return characterPicker.getAvatarUrlForCharacter(char); }
    function openCharacterPicker(centerInPanel = false) { characterPicker.openCharacterPicker(centerInPanel); }
    function openEmbeddedCharacterPicker() { characterPicker.openEmbeddedCharacterPicker(); }
    function closeCharacterPicker() { characterPicker.closeCharacterPicker(); }
    function toggleCharacterPicker() { characterPicker.toggleCharacterPicker(); }
    function _pickerAvatarBg(name) { return characterPicker ? characterPicker._pickerAvatarBg(name) : 'var(--et-theme-color)'; }

    function buildUntetheredStatusHtml() {
        const key = getCharacterKey();
        const slot = (key && settings.untetheredInfluence && settings.untetheredInfluence[key]) || {};

        // Icon mappings for mood, personality, and commStyle (from untethered-chat.js)
        const moodIcons = {
            playful: { icon: 'fa-solid fa-dice', color: '#a78bfa', label: 'Playful' },
            angry: { icon: 'fa-solid fa-fire-flame-curved', color: '#f87171', label: 'Angry' },
            shy: { icon: 'fa-solid fa-face-flushed', color: '#f9a8d4', label: 'Shy' },
            confident: { icon: 'fa-solid fa-crown', color: '#fbbf24', label: 'Confident' },
            sad: { icon: 'fa-solid fa-cloud-rain', color: '#60a5fa', label: 'Sad' },
            happy: { icon: 'fa-solid fa-sun', color: '#facc15', label: 'Happy' },
            anxious: { icon: 'fa-solid fa-brain', color: '#c084fc', label: 'Anxious' },
            bored: { icon: 'fa-solid fa-face-meh', color: '#94a3b8', label: 'Bored' },
            excited: { icon: 'fa-solid fa-bolt-lightning', color: '#fb923c', label: 'Excited' },
            jealous: { icon: 'fa-solid fa-eye', color: '#4ade80', label: 'Jealous' },
            flirty: { icon: 'fa-solid fa-wand-magic-sparkles', color: '#f472b6', label: 'Flirty' },
            cold: { icon: 'fa-solid fa-snowflake', color: '#93c5fd', label: 'Cold' },
            mysterious: { icon: 'fa-solid fa-mask', color: '#818cf8', label: 'Mysterious' },
            romantic: { icon: 'fa-solid fa-heart', color: '#fb7185', label: 'Romantic' },
            erotic: { icon: 'fa-solid fa-fire', color: '#ff6b6b', label: 'Erotic' },
            explicit: { icon: 'fa-solid fa-droplet', color: '#ff4d8d', label: 'Explicit' }
        };

        const personalityIcons = {
            // Eastern
            tsundere: { icon: 'fa-solid fa-face-angry', color: '#f87171', label: 'Tsundere' },
            yandere: { icon: 'fa-solid fa-heart-crack', color: '#fb7185', label: 'Yandere' },
            kuudere: { icon: 'fa-solid fa-snowflake', color: '#93c5fd', label: 'Kuudere' },
            dandere: { icon: 'fa-solid fa-feather', color: '#86efac', label: 'Dandere' },
            deredere: { icon: 'fa-solid fa-face-laugh-beam', color: '#facc15', label: 'Deredere' },
            himdere: { icon: 'fa-solid fa-gem', color: '#c084fc', label: 'Himdere' },
            tsundere_soft: { icon: 'fa-solid fa-face-smile-wink', color: '#fda4af', label: 'Tsundere (Soft)' },
            kuudere_dark: { icon: 'fa-solid fa-moon', color: '#818cf8', label: 'Kuudere (Dark)' },
            // Western
            introvert: { icon: 'fa-solid fa-person-rays', color: '#818cf8', label: 'Introvert' },
            extrovert: { icon: 'fa-solid fa-users', color: '#fb923c', label: 'Extrovert' },
            witty: { icon: 'fa-solid fa-comment-dots', color: '#facc15', label: 'Witty' },
            sarcastic: { icon: 'fa-solid fa-face-rolling-eyes', color: '#94a3b8', label: 'Sarcastic' },
            sweet: { icon: 'fa-solid fa-candy-cane', color: '#f9a8d4', label: 'Sweet' },
            sassy: { icon: 'fa-solid fa-hand-back-fist', color: '#c084fc', label: 'Sassy' },
            brooding: { icon: 'fa-solid fa-cloud', color: '#64748b', label: 'Brooding' },
            cheerleader: { icon: 'fa-solid fa-star', color: '#fbbf24', label: 'Cheerleader' },
            loner: { icon: 'fa-solid fa-person', color: '#475569', label: 'Loner' },
            mentor: { icon: 'fa-solid fa-graduation-cap', color: '#34d399', label: 'Mentor' },
            rebel: { icon: 'fa-solid fa-bolt', color: '#f87171', label: 'Rebel' },
            professional: { icon: 'fa-solid fa-briefcase', color: '#60a5fa', label: 'Professional' },
            clown: { icon: 'fa-solid fa-face-grin-squint', color: '#fb923c', label: 'Clown' },
            intellectual: { icon: 'fa-solid fa-book-open', color: '#818cf8', label: 'Intellectual' },
            passionate: { icon: 'fa-solid fa-circle-radiation', color: '#f87171', label: 'Passionate' },
            may_december: { icon: 'fa-solid fa-infinity', color: '#a78bfa', label: 'May–December' }
        };

        const commStyleIcons = {
            formal:     { icon: 'fa-solid fa-file-pen',              color: '#60a5fa', label: 'Formal' },
            casual:     { icon: 'fa-solid fa-comment',               color: '#4ade80', label: 'Casual' },
            vintage:    { icon: 'fa-solid fa-feather-pointed',       color: '#fbbf24', label: 'Vintage' },
            tech_savvy: { icon: 'fa-solid fa-microchip',             color: '#38bdf8', label: 'Tech-Savvy' },
            poetic:     { icon: 'fa-solid fa-pen-nib',               color: '#c084fc', label: 'Poetic' },
            direct:     { icon: 'fa-solid fa-arrow-right',           color: '#f87171', label: 'Direct' },
            passive:    { icon: 'fa-solid fa-ellipsis',              color: '#94a3b8', label: 'Passive' },
            aggressive: { icon: 'fa-solid fa-bullhorn',              color: '#fb923c', label: 'Aggressive' },
            banter:     { icon: 'fa-solid fa-comments',              color: '#fb923c', label: 'Banter' },
            theatrical: { icon: 'fa-solid fa-masks-theater',         color: '#f472b6', label: 'Theatrical' },
            cryptic:    { icon: 'fa-solid fa-eye-slash',             color: '#818cf8', label: 'Cryptic' },
            nurturing:  { icon: 'fa-solid fa-hand-holding-heart',    color: '#34d399', label: 'Nurturing' },
        };

        const parts = [];
        const tooltips = [];

        if (slot.mood && moodIcons[slot.mood]) {
            const m = moodIcons[slot.mood];
            parts.push(`<span class="et-status-emotion-icon et-uc-status-icon" style="color:${m.color}"><i class="${m.icon}"></i></span>`);
            tooltips.push(`Mood: ${m.label}`);
        }
        if (slot.personality && personalityIcons[slot.personality]) {
            const p = personalityIcons[slot.personality];
            parts.push(`<span class="et-status-emotion-icon et-uc-status-icon" style="color:${p.color}"><i class="${p.icon}"></i></span>`);
            tooltips.push(`Personality: ${p.label}`);
        }
        if (slot.commStyle && commStyleIcons[slot.commStyle]) {
            const c = commStyleIcons[slot.commStyle];
            parts.push(`<span class="et-status-emotion-icon et-uc-status-icon" style="color:${c.color}"><i class="${c.icon}"></i></span>`);
            tooltips.push(`Voice: ${c.label}`);
        }

        if (!parts.length) {
            return '<span class="et-status-placeholder">Set Chat Influence</span>';
        }

        const tooltip = tooltips.join(' | ');
        return `<span class="et-status-main et-uc-status-main">Influence</span><span class="et-status-chip et-uc-status-chip" title="${tooltip}">${parts.join('')}</span>`;
    }

    function buildTetheredStatusHtml() {
        const emotionEnabled = settings.emotionSystemEnabled !== false;
        if (!emotionEnabled) {
            return '<span class="et-status-placeholder">Emotion system is off</span>';
        }

        const state = getEmotionState();
        if (!state || typeof state !== 'object') {
            return '<span class="et-status-placeholder">Emotion unavailable</span>';
        }

        // Match icons from PLUTCHIK_EMOTIONS in emotion-system.js
        const defs = {
            joy: { label: 'Joy', icon: 'fa-solid fa-sun', color: '#facc15', intensity: ['Serenity', 'Joy', 'Ecstasy'] },
            trust: { label: 'Trust', icon: 'fa-solid fa-handshake', color: '#4ade80', intensity: ['Acceptance', 'Trust', 'Admiration'] },
            fear: { label: 'Fear', icon: 'fa-solid fa-ghost', color: '#a78bfa', intensity: ['Apprehension', 'Fear', 'Terror'] },
            surprise: { label: 'Surprise', icon: 'fa-solid fa-bolt', color: '#38bdf8', intensity: ['Distraction', 'Surprise', 'Amazement'] },
            sadness: { label: 'Sadness', icon: 'fa-solid fa-cloud-rain', color: '#60a5fa', intensity: ['Pensiveness', 'Sadness', 'Grief'] },
            disgust: { label: 'Disgust', icon: 'fa-solid fa-face-grimace', color: '#a3e635', intensity: ['Boredom', 'Disgust', 'Loathing'] },
            anger: { label: 'Anger', icon: 'fa-solid fa-fire-flame-curved', color: '#f87171', intensity: ['Annoyance', 'Anger', 'Rage'] },
            anticipation: { label: 'Anticipation', icon: 'fa-solid fa-forward', color: '#fb923c', intensity: ['Interest', 'Anticipation', 'Vigilance'] },
            love: { label: 'Love', icon: 'fa-solid fa-heart', color: '#fb7bb8', intensity: ['Fondness', 'Love', 'Adoration'] }
        };

        let dominantId = null;
        let dominantVal = -Infinity;
        Object.keys(defs).forEach((id) => {
            const val = Number(state[id] || 0);
            if (val > dominantVal) {
                dominantVal = val;
                dominantId = id;
            }
        });

        const dominant = defs[dominantId] || defs.joy;
        // Get sub-emotion label based on intensity value (matching emotion-system.js logic)
        const intensityLabel = dominantVal < 33 ? dominant.intensity[0] : dominantVal < 66 ? dominant.intensity[1] : dominant.intensity[2];
        const intensityPercent = Math.round(Math.max(0, dominantVal));
        // Tooltip with full emotion info
        const tooltip = `Current Emotion: ${dominant.label} | ${intensityLabel} (${intensityPercent}%)`;

        return `<span class="et-status-chip et-status-chip-emotion" title="${tooltip}"><span class="et-status-emotion-icon" style="color:${dominant.color}"><i class="${dominant.icon}"></i></span><span class="et-status-main" style="color:${dominant.color}">${intensityLabel}</span></span>`;
    }

    function updatePanelStatusRow(options = {}) {
        const { typing = false } = options;
        const row = jQuery('#et-panel-status-trigger');
        const content = jQuery('#et-panel-status-content');
        if (!row.length || !content.length) return;

        // Always sync the mode-toggle button visibility with group state.
        // The panel HTML sets this correctly on first build, but dynamic transitions
        // (switching into/out of a group chat while the panel is already open) need
        // this path to hide or restore the button without a full panel rebuild.
        const inGroupNow = !!(groupManager && groupManager.isGroupSession());
        jQuery('#et-mode-toggle-btn')
            .toggleClass('et-mode-toggle-hidden', inGroupNow)
            .toggleClass('et-mode-toggle-group-off', inGroupNow);

        // Note: typing state is indicated by the send/stop button — the status row
        // continues to show emotion/mood info during generation.

        // In group session: emotion system and chat influence are disabled.
        // Show a static group indicator chip instead.
        if (groupManager && groupManager.isGroupSession()) {
            row.removeClass('et-panel-status-clickable');
            if (groupManager.isCombineMode()) {
                row.attr('title', 'Combined mode — all characters will reply in sequence');
                content.html('<span class="et-status-chip et-status-group-chip"><i class="fa-solid fa-layer-group"></i><span class="et-status-main">Combined</span></span>');
            } else {
                row.attr('title', 'Group Chat — emotion system and chat influence are paused');
                content.html('<span class="et-status-chip et-status-group-chip"><i class="fa-solid fa-users"></i><span class="et-status-main">Group Chat</span></span>');
            }
            return;
        }

        const tethered = isTetheredMode();
        row.addClass('et-panel-status-clickable');
        row.attr('title', tethered ? 'Open emotion details' : 'Open chat influence');
        content.html(tethered ? buildTetheredStatusHtml() : buildUntetheredStatusHtml());
    }

    function getUserName() {
        return SillyTavern.getContext().name1 || 'You';
    }

    function isTetheredMode() {
        return settings.chatMode !== 'untethered';
    }

    function isCombinedGroupMode() {
        return !!(groupManager && groupManager.isGroupSession() && groupManager.isCombineMode());
    }

    function getCombinedGroupMembers() {
        return groupManager ? groupManager.getGroupMembers() : [];
    }

    async function buildCharacterCardContext(char, options = {}) {
        if (!char) return '';
        const includePersona = options.includePersona !== false;
        const includeDescription = options.includeDescription !== false;
        const includePersonality = options.includePersonality !== false;
        const includeScenario = options.includeScenario === true;
        const includeWorldInfo = options.includeWorldInfo === true;
        const tethered = options.tethered !== false;
        const sections = [];

        if (includePersona) {
            try {
                const powerUser = SillyTavern.getContext().powerUserSettings || {};
                const personaDescription = powerUser.persona_description || '';
                if (personaDescription && personaDescription.trim()) {
                    sections.push(`${getUserName()}'s persona: ${expandTimeDateMacros(replaceMacros(personaDescription))}`);
                }
            } catch (e) { /* ignore */ }
        }

        const name = char.name || 'Character';
        const charDescription = char.description || char.data?.description || '';
        const charPersonality = char.personality || char.data?.personality || '';
        const charScenario = char.scenario || char.data?.scenario || '';

        if (includeDescription && (tethered ? settings.ctxDescription !== false : true) && charDescription) {
            sections.push(`${name}'s description: ${expandTimeDateMacros(replaceMacros(charDescription))}`);
        }

        if (includePersonality && (tethered ? settings.ctxPersonality !== false : true) && charPersonality) {
            sections.push(`${name}'s personality: ${expandTimeDateMacros(replaceMacros(charPersonality))}`);
        }

        if (includeScenario && (tethered ? settings.ctxScenario !== false : true) && charScenario) {
            sections.push(`Scenario: ${expandTimeDateMacros(replaceMacros(charScenario))}`);
        }

        if (includeWorldInfo) {
            try {
                const worldInfoData = await getActiveWorldInfoEntries();
                if (worldInfoData) {
                    sections.push(`World Information:\n${worldInfoData}`);
                }
            } catch (e) { /* ignore */ }
        }

        return sections.length ? `\n\n<character_reference>\n${sections.join('\n\n')}\n</character_reference>` : '';
    }

    function buildCombinedHistoryContext(history, members) {
        const safeHistory = Array.isArray(history) ? history : [];
        const safeMembers = Array.isArray(members) ? members : [];
        if (!safeHistory.length) return '';

        const memberMap = new Map(safeMembers.map(member => [member.avatar || member.name, member.name || 'Character']));
        const lines = safeHistory.map(msg => {
            const sender = msg.is_user
                ? getUserName()
                : (msg.charName || memberMap.get(msg.charKey) || getCharacterName());
            return `${sender}: ${stripThinkingTags(msg.mes || '')}`;
        }).filter(Boolean);

        return lines.length
            ? `\n\nRecent group chat history:\n${lines.join('\n')}`
            : '';
    }

    /**
     * Builds the shared group system prompt used as the first message in every
     * combined-mode API call. Intentionally brief — character cards and history
     * are injected at the message-turn level by buildCombinedGroupApiMessages.
     */
    function buildGroupSharedSystemPrompt() {
        const members = getCombinedGroupMembers();
        const memberNames = members.map(m => m.name || 'Character').join(', ');
        const userName = getUserName();
        const parts = [];

        // ── Group scene-setting (user-editable via Prompt Manager) ──────────
        const configDefaults = window.EchoTextConfig?.defaultSettings || {};
        let sceneFrame = replaceMacros(
            (settings.promptGroupSceneFrame != null && settings.promptGroupSceneFrame !== '')
                ? settings.promptGroupSceneFrame
                : (configDefaults.promptGroupSceneFrame || '')
        );
        // {{group_members}} is runtime-dynamic — substitute after replaceMacros
        sceneFrame = sceneFrame.replace(/\{\{group_members\}\}/g, memberNames);
        if (sceneFrame) parts.push(sceneFrame);

        // ── Anti-refusal framing ─────────────────────────────────────────────
        if (settings.antiRefusal === true) {
            const antiRefusal = replaceMacros(
                settings.promptAntiRefusalFrame ||
                window.EchoTextConfig?.defaultSettings?.promptAntiRefusalFrame || ''
            );
            if (antiRefusal) parts.push(antiRefusal);
        } else {
            parts.push('All participants are fictional. Stay fully in character and do not add disclaimers or refusals.');
        }

        return parts.filter(Boolean).join('\n\n');
    }

    /**
     * Builds the full API messages array for one character's turn in Combined Group Mode.
     *
     * Layout:
     *   [system]           Shared group prompt + anti-refusal framing
     *   [user / assistant] Prior history turns — assistant turns carry "[CharName]: " attribution
     *   [user]             Latest user message
     *                      + user persona description
     *                      + this character's Description & Personality card
     *                      + generation cue + verbosity instruction
     *
     * This keeps the three concerns — group framing, history context, and per-character
     * identity — in their optimal positions: framing at primacy, character card at recency,
     * history bridging the two so the model always knows who said what.
     *
     * @param {Array}  history - full combine history including the latest user message
     * @param {object} char    - the character object whose turn it is to reply
     * @returns {{ apiMessages, rawPrompt, systemPrompt }}
     */
    async function buildCombinedGroupApiMessages(history, char) {
        const charName  = char?.name || 'Character';
        const userName  = getUserName();
        const allHistory = Array.isArray(history) ? history : [];

        // ── 1. Shared system prompt (group scene + anti-refusal) ─────────────
        const systemPrompt = buildGroupSharedSystemPrompt();

        // ── 2. Split history: prior turns vs. latest user message ────────────
        const lastUserIdx = findLastUserMessageIndex(allHistory);
        const priorHistory = lastUserIdx >= 0 ? allHistory.slice(0, lastUserIdx) : allHistory;
        const latestUserMsg = lastUserIdx >= 0 ? allHistory[lastUserIdx] : null;

        // ── 3. Prior history as attributed message turns ──────────────────────
        // Assistant turns get "[CharName]: " prefixed so the model never mistakes
        // another character's line as its own prior output.
        const historyMessages = priorHistory.map(msg => {
            if (msg.is_user) {
                return { role: 'user', content: stripThinkingTags(msg.mes || '') };
            }
            const speaker = msg.charName || charName;
            return { role: 'assistant', content: `${speaker}: ${stripThinkingTags(msg.mes || '')}` };
        });

        // ── 4. Final user turn: input + persona + character card + cue ────────
        const finalUserParts = [];

        // Latest user message
        if (latestUserMsg) {
            finalUserParts.push(latestUserMsg.mes || '');
        }

        // User persona description
        try {
            const powerUser = SillyTavern.getContext().powerUserSettings || {};
            const personaDesc = (powerUser.persona_description || '').trim();
            if (personaDesc) {
                finalUserParts.push(`<user_persona>\n${userName}'s persona: ${expandTimeDateMacros(replaceMacros(personaDesc))}\n</user_persona>`);
            }
        } catch (e) { /* ignore */ }

        // Character card — wrapped in XML so models treat it as reference data, not output
        const charDescription = (char?.description || char?.data?.description || '').trim();
        const charPersonality  = (char?.personality  || char?.data?.personality  || '').trim();
        const charCardParts = [];
        if (charDescription) charCardParts.push(`${charName}'s description: ${expandTimeDateMacros(replaceMacros(charDescription))}`);
        if (charPersonality)  charCardParts.push(`${charName}'s personality: ${expandTimeDateMacros(replaceMacros(charPersonality))}`);
        if (charCardParts.length > 0) finalUserParts.push(`<character_reference>\n${charCardParts.join('\n\n')}\n</character_reference>`);

        // Generation cue (user-editable via Prompt Manager — supports {{char}} macro)
        const charCueTemplate =
            (settings.promptGroupCharacterCue != null && settings.promptGroupCharacterCue !== '')
                ? settings.promptGroupCharacterCue
                : (window.EchoTextConfig?.defaultSettings?.promptGroupCharacterCue || '');
        // replaceMacros resolves {{char}} via the currently active character key
        // (set by generateEchoTextCombined before calling this function).
        const charCue = expandTimeDateMacros(replaceMacros(charCueTemplate));
        if (charCue) finalUserParts.push(charCue);

        // Verbosity
        const charKey = char?.avatar || char?.name || '';
        const verbosity = charKey && settings.verbosityByCharacter ? settings.verbosityByCharacter[charKey] : null;
        finalUserParts.push(getVerbosityPrompt(verbosity));

        const finalUserContent = finalUserParts.filter(Boolean).join('\n\n');

        // ── Assemble ──────────────────────────────────────────────────────────
        const apiMessages = [
            { role: 'system', content: systemPrompt },
            ...historyMessages,
            { role: 'user', content: finalUserContent }
        ];

        // rawPrompt for non-chat backends (KoboldAI, text-completion proxies)
        let rawPrompt = '';
        allHistory.forEach(msg => {
            const speaker = msg.is_user ? userName : (msg.charName || charName);
            rawPrompt += `${speaker}: ${msg.mes}\n`;
        });
        rawPrompt += `${charName}:`;

        return { apiMessages, rawPrompt, systemPrompt };
    }

    /**
     * @deprecated Combined mode now uses buildCombinedGroupApiMessages.
     * Kept as a thin wrapper so any external callers (e.g. proactive scheduler)
     * that still reference buildCombinedSystemPrompt don't break.
     */
    async function buildCombinedSystemPrompt(targetChar, history = []) {
        return buildGroupSharedSystemPrompt();
    }

    /**
     * Returns the verbosity instruction string for the given verbosity level.
     * Reads from user-editable settings first, falls back to config defaults.
     * @param {string|null} verbosity - 'short' | 'long' | null/undefined (medium)
     * @returns {string}
     */
    function getVerbosityPrompt(verbosity) {
        const cfg = window.EchoTextConfig && window.EchoTextConfig.defaultSettings || {};
        if (verbosity === 'short') {
            return (settings.promptVerbosityShort != null && settings.promptVerbosityShort !== '')
                ? settings.promptVerbosityShort
                : (cfg.promptVerbosityShort || 'VERBOSITY: Keep your reply to 1-2 short sentences maximum. Be concise and direct.');
        }
        if (verbosity === 'long') {
            return (settings.promptVerbosityLong != null && settings.promptVerbosityLong !== '')
                ? settings.promptVerbosityLong
                : (cfg.promptVerbosityLong || 'VERBOSITY: You may reply with 4-8 sentences with more detail, expressiveness, and depth.');
        }
        // medium / default
        return (settings.promptVerbosityMedium != null && settings.promptVerbosityMedium !== '')
            ? settings.promptVerbosityMedium
            : (cfg.promptVerbosityMedium || 'VERBOSITY: Keep your reply to 2-4 sentences, natural text-message length.');
    }

    async function buildSystemPrompt(targetCharOverride = null) {
        if (isCombinedGroupMode()) {
            const groupId = groupManager ? groupManager.getCurrentGroupId() : null;
            const combinedHistory = groupId ? groupManager.getCombineHistory(groupId, !isTetheredMode()) : [];
            return buildCombinedSystemPrompt(targetCharOverride || getCurrentCharacter(), combinedHistory);
        }

        const char = targetCharOverride || getCurrentCharacter();
        if (!char) return 'You are a helpful assistant. Reply concisely like in a text message. You may use Markdown formatting like **bold**, *italic*, and `code`.';

        const name = char.name || 'Character';
        const context = SillyTavern.getContext();
        const tethered = isTetheredMode();

        // Helper: get prompt from settings with macro replacement.
        // expandTimeDateMacros is applied AFTER replaceMacros so that SillyTavern
        // time/date tokens ({{time}}, {{date}}, {{weekday}}) in character cards,
        // persona descriptions, or custom prompts are resolved to concrete strings
        // before the system prompt reaches the LLM. Without this, {{time}} survives
        // as a literal token and the model interprets it as a slot to fill — causing
        // it to output the clock time at the start of its generated message.
        function getPrompt(key) {
            const val = settings[key];
            if (val !== undefined && val !== null && val !== '') return expandTimeDateMacros(replaceMacros(val));
            // Fall back to config default
            const defaults = window.EchoTextConfig && window.EchoTextConfig.defaultSettings;
            return defaults && defaults[key] ? expandTimeDateMacros(replaceMacros(defaults[key])) : '';
        }

        // ── ORDERING RATIONALE ──────────────────────────────────────────────────
        // LLMs attend most strongly to content at the beginning (primacy) and end
        // (recency) of the context window.
        //
        //  1. IDENTITY   — who the character IS (primacy anchor)
        //  2. CHARACTER  — description, personality, scenario, persona, world info
        //                  (stable knowledge the model must fully absorb before
        //                   reading any dynamic content)
        //  3. MEMORY     — inside jokes, emotion state, untethered influence flags
        //                  (semi-static contextual colour)
        //  4. CONTINUITY — recent ST chat history (dynamic, recency-anchored so it
        //                  directly informs the reply without drowning the character)
        //  5. LOCK       — fiction frame + persona-lock reminder (recency anchor for
        //                  behaviour — last thing read before the model replies)
        //  6. VERBOSITY  — formatting instruction (must be last)
        // ───────────────────────────────────────────────────────────────────────

        // ── 1. IDENTITY ─────────────────────────────────────────────────────────
        let prompt = getPrompt('promptSystemBase');

        // User's persona description
        if (tethered ? settings.ctxPersona === true : true) {
            try {
                const powerUser = SillyTavern.getContext().powerUserSettings || {};
                const personaDescription = powerUser.persona_description || '';
                if (personaDescription && personaDescription.trim()) {
                    prompt += `\n\n<user_persona>\n${getUserName()}'s persona: ${expandTimeDateMacros(replaceMacros(personaDescription))}\n</user_persona>`;
                }
            } catch (e) { /* ignore */ }
        }

        // ── 2. CHARACTER KNOWLEDGE ───────────────────────────────────────────────
        // Support both V1 (top-level fields) and V2 (nested under char.data) card formats
        const charDescription = char.description || char.data?.description || '';
        const charPersonality  = char.personality  || char.data?.personality  || '';
        const charScenario     = char.scenario      || char.data?.scenario      || '';

        // Apply per-character context overrides (from the Context modal).
        // Overrides are Untethered-only — in Tethered mode the ST card fields are used as-is.
        const _ctxOv = (!tethered && contextOverride) ? contextOverride.getOverridesForCurrentChar() : {};
        const effectiveDescription = (_ctxOv.description && _ctxOv.description.trim()) ? _ctxOv.description.trim() : charDescription;
        const effectivePersonality  = (_ctxOv.personality  && _ctxOv.personality.trim())  ? _ctxOv.personality.trim()  : charPersonality;
        const effectiveScenario     = (_ctxOv.scenario      && _ctxOv.scenario.trim())      ? _ctxOv.scenario.trim()      : charScenario;

        // Character card fields — wrapped in <character_reference> XML tags so models
        // treat them as scoped reference data rather than content to reproduce.
        const charRefParts = [];
        if ((tethered ? settings.ctxDescription !== false : true) && effectiveDescription) {
            charRefParts.push(`${name}'s description: ${expandTimeDateMacros(replaceMacros(effectiveDescription))}`);
        }
        if ((tethered ? settings.ctxPersonality !== false : true) && effectivePersonality) {
            charRefParts.push(`${name}'s personality: ${expandTimeDateMacros(replaceMacros(effectivePersonality))}`);
        }
        if ((tethered ? settings.ctxScenario !== false : true) && effectiveScenario) {
            charRefParts.push(`Scenario: ${expandTimeDateMacros(replaceMacros(effectiveScenario))}`);
        }
        if (tethered && settings.ctxWorldInfo === true) {
            try {
                const worldInfoData = await getActiveWorldInfoEntries();
                if (worldInfoData) {
                    charRefParts.push(`World Information:\n${worldInfoData}`);
                }
            } catch (e) { /* ignore */ }
        } else if (!tethered && contextOverride) {
            // Per-character World Info override (set in Character Context modal)
            const _wiOv = contextOverride.getOverridesForCurrentChar();
            if (_wiOv.wiOverrideEnabled === true) {
                try {
                    const worldInfoData = await getActiveWorldInfoEntries({
                        mode:           _wiOv.wiMode || 'min_order',
                        minOrder:       typeof _wiOv.wiMinOrder === 'number' ? _wiOv.wiMinOrder : 250,
                        maxOrder:       typeof _wiOv.wiMaxOrder === 'number' ? _wiOv.wiMaxOrder : null,
                        targetedOrders: Array.isArray(_wiOv.wiTargetedOrders) ? _wiOv.wiTargetedOrders : [],
                    });
                    if (worldInfoData) {
                        charRefParts.push(`World Information:\n${worldInfoData}`);
                    }
                } catch (e) { /* ignore */ }
            }
        }
        if (charRefParts.length > 0) {
            prompt += `\n\n<character_reference>\n${charRefParts.join('\n\n')}\n</character_reference>`;
        }

        // Author's Note — special per-character instructions from SillyTavern.
        // Reads from multiple sources in priority order:
        // Author's Note — reads from extensionSettings.note.chara, which is where
        // SillyTavern's "Character Author's Note (Private)" panel stores per-character
        // notes. The array is keyed by character filename without extension (e.g. "Joi",
        // not "Joi.png"). We include the note text whenever the EchoText toggle is on,
        // regardless of ST's own useChara flag (EchoText's toggle is the user's opt-in).
        if (settings.ctxAuthorsNote === true) {
            try {
                const context = SillyTavern.getContext();
                const charaFilename = (char.avatar || char.name || '').replace(/\.[^/.]+$/, '');
                const charaNote = context.extensionSettings?.note?.chara?.find(e => e.name === charaFilename);
                const authorNote = (charaNote?.prompt || '').trim();
                if (authorNote) {
                    prompt += `\n\n<authors_note>\n${expandTimeDateMacros(replaceMacros(authorNote))}\n</authors_note>`;
                }
            } catch (e) { /* ignore */ }
        }


        // ── 3. MEMORY & MOOD ─────────────────────────────────────────────────────
        // Shared memories (inside jokes, people, hobbies, etc.) fire in both modes.
        // Emotion state is tethered-only (it depends on live ST chat context).
        prompt += buildInsideJokesContext();
        if (tethered) {
            prompt += buildEmotionContext();
        }

        // ── 4. BEHAVIOUR LOCK ────────────────────────────────────────────────────
        // Fiction frame + persona-lock reminder land last so they act as the final
        // instruction the model reads before generating — maximising adherence.
        if (settings.antiRefusal === true) {
            prompt += '\n\n' + getPrompt('promptAntiRefusalFrame');
            prompt += tethered
                ? `\n\n${getPrompt('promptTetheredReminder')}`
                : `\n\n${getPrompt('promptUntetheredReminder')}`;
        } else {
            prompt += tethered
                ? `\n\n${getPrompt('promptTetheredNoFrame')}`
                : `\n\n${getPrompt('promptUntetheredNoFrame')}`;
        }

        // ── 5. UNTETHERED CHAT OVERLAY ───────────────────────────────────────────
        // Placed AFTER the behaviour lock so mood/personality/style directives land
        // at recency — the last substantive instruction the model reads before
        // generating. Previously this lived in section 3 (before the lock) AND was
        // wrapped in <character_influence> XML tags, which caused the LLM to treat
        // the directives as passive reference data instead of active instructions,
        // silently nullifying the user's Chat Influence settings.
        if (!tethered) {
            prompt += buildUntetheredChatContext();
        }

        // ── 5b. TEXTING STYLE OVERRIDE ───────────────────────────────────────────
        // Injected after the untethered overlay so it lands at the very end of the
        // behaviour section — maximum recency before the verbosity instruction.
        // Untethered-only: tethered mode uses the ST card as-is.
        if (!tethered && contextOverride) {
            prompt += contextOverride.buildContextOverridePrompt();
        }

        // ── 6. VERBOSITY ─────────────────────────────────────────────────────────
        const charKey = getCharacterKey();
        const verbosity = charKey && settings.verbosityByCharacter ? settings.verbosityByCharacter[charKey] : null;
        prompt += '\n\n' + getVerbosityPrompt(verbosity);

        return prompt;
    }

    async function getActiveWorldInfoEntries(opts) {
        // Fetches lorebook entries for the current character via ST's /api/worldinfo/get
        // endpoint. Filter mode is driven by ctxWorldInfoMode (global setting), which can
        // be overridden per-character via an optional `opts` object.
        try {
            const char = getCurrentCharacter();
            if (!char) return null;

            // Resolve the lorebook name from the character card.
            // V2 cards: data.extensions.world  (preferred)
            // V1 cards: worldInfoName or world (fallback)
            const bookName = char?.data?.extensions?.world
                || char?.data?.world
                || char?.worldInfoName
                || char?.world
                || null;

            if (!bookName) return null;

            // Fetch the book data from Silly Tavern's world info API.
            // Response shape: { entries: { [uid]: entry } }
            const headers = SillyTavern.getContext().getRequestHeaders();
            const resp = await fetch('/api/worldinfo/get', {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({ name: bookName })
            });

            if (!resp.ok) return null;

            const bookData = await resp.json();
            const entryMap = bookData?.entries;
            if (!entryMap || typeof entryMap !== 'object') return null;

            // Filter entries based on the configured mode.
            // Per-character overrides (opts) take precedence over global settings.
            const mode           = (opts && opts.mode) || settings.ctxWorldInfoMode || 'min_order';
            const minOrder       = (opts && typeof opts.minOrder === 'number') ? opts.minOrder
                                   : (typeof settings.ctxWorldInfoMinOrder === 'number' ? settings.ctxWorldInfoMinOrder : 250);
            const maxOrder       = (opts && 'maxOrder' in opts) ? opts.maxOrder
                                   : (typeof settings.ctxWorldInfoMaxOrder === 'number' ? settings.ctxWorldInfoMaxOrder : null);
            const targetedOrders = (opts && Array.isArray(opts.targetedOrders))
                ? opts.targetedOrders.map(Number).filter(function (n) { return !isNaN(n); })
                : (Array.isArray(settings.ctxWorldInfoTargetedOrders)
                    ? settings.ctxWorldInfoTargetedOrders.map(Number).filter(function (n) { return !isNaN(n); })
                    : []);

            const texts = [];
            Object.values(entryMap).forEach(entry => {
                if (!entry) return;
                if (entry.disable || entry.disabled) return;
                const order = typeof entry.order === 'number' ? entry.order : 0;

                let include = false;
                if (mode === 'min_order') {
                    include = order >= minOrder;
                } else if (mode === 'range') {
                    include = order >= minOrder && (maxOrder === null || order <= maxOrder);
                } else if (mode === 'targeted') {
                    include = targetedOrders.includes(order);
                } else if (mode === 'custom') {
                    include = (order >= minOrder && (maxOrder === null || order <= maxOrder))
                        || (targetedOrders.length > 0 && targetedOrders.includes(order));
                } else {
                    include = order >= minOrder;
                }

                if (!include) return;
                const text = (entry.content || entry.text || '').trim();
                if (text) texts.push(text);
            });

            return texts.length > 0 ? texts.join('\n\n') : null;
        } catch (e) {
            return null;
        }
    }

    function getSTChatMessages() {
        try {
            const context = SillyTavern.getContext();
            const chat = context.chat;
            if (!chat || !chat.length) return null;

            const charName = getCharacterName();
            const userName = getUserName();

            // Get the character's first_mes to exclude it from context injection
            const char = getCurrentCharacter();
            const firstMes = (char && char.first_mes) ? char.first_mes.trim() : null;

            const selected = [];

            for (let i = chat.length - 1; i >= 0; i--) {
                const msg = chat[i];
                if (!msg.is_user && firstMes && (msg.mes || '').trim() === firstMes) continue;
                selected.unshift(msg);
            }

            if (!selected.length) return null;

            const lines = selected.map(msg => {
                const speaker = msg.is_user ? userName : (msg.name || charName);
                return `${speaker}: ${msg.mes || ''}`;
            });

            return lines.join('\n');
        } catch (e) {
            return null;
        }
    }

    function getCurrentTimeMacroString() {
        return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    function getCurrentDateMacroString() {
        return new Date().toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' });
    }

    function getCurrentWeekdayMacroString() {
        return new Date().toLocaleDateString([], { weekday: 'long' });
    }

    function expandTimeDateMacros(text) {
        if (!text) return '';
        return String(text)
            .replace(/{{\s*time\s*}}/gi, getCurrentTimeMacroString)
            .replace(/{{\s*date\s*}}/gi, getCurrentDateMacroString)
            .replace(/{{\s*weekday\s*}}/gi, getCurrentWeekdayMacroString);
    }

    function cleanGeneratedResponse(text) {
        if (!text) return '';
        return String(text).trim();
    }

    function replaceMacros(text) {
        if (!text) return text;
        const charName = getCharacterName();
        const userName = getUserName();
        return text.replace(/{{char}}/gi, charName).replace(/{{user}}/gi, userName);
    }


    // ============================================================
    // THINKING / REASONING TAG HELPER
    // ============================================================

    const STRIP_TAGS_DEFAULTS = ['thinking', 'think', 'thought', 'reasoning', 'reason', 'gemma4'];

    // Special non-XML patterns keyed by reserved name
    const SPECIAL_PATTERNS = {
        gemma4: {
            paired: /<\|channel>thought[\s\S]*?<channel\|>/gi,
            dangling: /<\|channel>thought[\s\S]*$/gi
        }
    };

    let _stripTagsRegex = null;
    let _stripTagsListHash = '';

    function getStripTagsRegex() {
        const allTags = (Array.isArray(settings.stripThinkingTagList) && settings.stripThinkingTagList.length)
            ? settings.stripThinkingTagList
            : STRIP_TAGS_DEFAULTS;
        const customPatterns = Array.isArray(settings.stripCustomPatterns) ? settings.stripCustomPatterns : [];
        const hash = allTags.join('\x00') + '\x01' + JSON.stringify(customPatterns);
        if (hash !== _stripTagsListHash || !_stripTagsRegex) {
            const xmlTags = allTags.filter(t => !SPECIAL_PATTERNS[t]);
            const specials = allTags.filter(t => !!SPECIAL_PATTERNS[t]).map(key => SPECIAL_PATTERNS[key]);
            const customs = customPatterns
                .filter(p => p && p.start && p.end)
                .map(p => {
                    const es = p.start.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const ee = p.end.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    return {
                        paired: new RegExp(es + '[\\s\\S]*?' + ee, 'gi'),
                        dangling: new RegExp(es + '[\\s\\S]*$', 'gi')
                    };
                });
            let result = { paired: null, dangling: null, specials, customs };
            if (xmlTags.length) {
                const pattern = xmlTags.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
                result.paired = new RegExp(`<(${pattern})[^>]*>[\\s\\S]*?<\\/\\1>`, 'gi');
                result.dangling = new RegExp(`<(${pattern})[^>]*>[\\s\\S]*$`, 'gi');
            }
            _stripTagsRegex = result;
            _stripTagsListHash = hash;
        }
        return _stripTagsRegex;
    }

    function invalidateStripTagsCache() {
        _stripTagsRegex = null;
        _stripTagsListHash = '';
    }

    function stripThinkingTags(text) {
        if (!text) return text;
        if (settings.stripThinkingTagsEnabled === false) return String(text);
        const re = getStripTagsRegex();
        let result = String(text);
        if (re.paired) result = result.replace(re.paired, '');
        if (re.dangling) result = result.replace(re.dangling, '');
        for (const sp of re.specials) {
            result = result.replace(sp.paired, '').replace(sp.dangling, '');
        }
        for (const cp of re.customs) {
            result = result.replace(cp.paired, '').replace(cp.dangling, '');
        }
        return result.trim();
    }

    function renderStripTagChips(containerId) {
        const container = jQuery('#' + containerId);
        if (!container.length) return;
        const tags = Array.isArray(settings.stripThinkingTagList) ? settings.stripThinkingTagList : [];
        container.html(tags.map((tag, i) => {
            const safeTag = String(tag).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            return `<span class="et-strip-tag-chip">${safeTag}<button class="et-strip-tag-remove" data-index="${i}" title="Remove" aria-label="Remove ${safeTag}"><i class="fa-solid fa-xmark"></i></button></span>`;
        }).join(''));
    }

    function renderCustomPatternRows(containerId) {
        const container = jQuery('#' + containerId);
        if (!container.length) return;
        const patterns = Array.isArray(settings.stripCustomPatterns) ? settings.stripCustomPatterns : [];
        if (!patterns.length) {
            container.html('');
            return;
        }
        container.html(patterns.map((p, i) => {
            const safeStart = String(p.start || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const safeEnd = String(p.end || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            return `<div class="et-custom-pattern-row"><span class="et-custom-pattern-label"><code>${safeStart}</code> → <code>${safeEnd}</code></span><button class="et-custom-pattern-remove" data-index="${i}" title="Remove"><i class="fa-solid fa-xmark"></i></button></div>`;
        }).join(''));
    }

    function updateStripTagsSubsectionVisibility() {
        const visible = settings.stripThinkingTagsEnabled !== false;
        jQuery('.et-strip-tags-sub').toggle(visible);
    }

    function toggleWIPanelRows(mode) {
        jQuery('#et-ctx-wi-row-min_panel').toggle(mode === 'min_order' || mode === 'range' || mode === 'custom');
        jQuery('#et-ctx-wi-row-max_panel').toggle(mode === 'range' || mode === 'custom');
        jQuery('#et-ctx-wi-row-targeted_panel').toggle(mode === 'targeted' || mode === 'custom');
    }

    // ============================================================
    // CHAT HISTORY MANAGEMENT
    // ============================================================

    function getChatHistory() {
        // ── Group session: use group-scoped, independent storage ──────────
        if (groupManager && groupManager.isGroupSession()) {
            const group = groupManager.getCurrentGroup();
            const groupId = group ? String(group.id) : null;
            if (!groupId) return [];

            const untethered = !isTetheredMode();

            // Combine mode: single shared history for the whole group
            if (groupManager.isCombineMode()) {
                return groupManager.getCombineHistory(groupId, untethered);
            }

            // Per-character history, scoped to this groupId
            const char = getCurrentCharacter();
            if (!char) return [];
            const charKey = char.avatar || char.name || 'unknown';
            const history = groupManager.getGroupChatHistory(groupId, charKey, untethered);

            // Filter out the character's first_mes
            const firstMes = char.first_mes ? char.first_mes.trim() : null;
            if (firstMes && history.length > 0) {
                return history.filter(msg => msg.is_user || (msg.mes || '').trim() !== firstMes);
            }
            return history;
        }

        // ── Solo session: original logic ──────────────────────────────────
        const key = getCharacterKey();
        if (!key) return [];

        let history;
        if (!isTetheredMode()) {
            if (!settings.untetheredHistory[key]) {
                settings.untetheredHistory[key] = [];
                if (untetheredChat) untetheredChat.resetUntetheredChat();
                saveSettings();
            }
            history = settings.untetheredHistory[key];
        } else {
            history = settings.chatHistory[key] || [];
        }

        // Filter out the character's first_mes to prevent it from appearing in EchoText
        const char = getCurrentCharacter();
        const firstMes = (char && char.first_mes) ? char.first_mes.trim() : null;
        if (firstMes && history.length > 0) {
            history = history.filter(msg =>
                msg.is_user || (msg.mes || '').trim() !== firstMes
            );
        }

        return history;
    }

    function saveChatHistory(history) {
        // ── Group session: write to group-scoped storage ──────────────────
        if (groupManager && groupManager.isGroupSession()) {
            const group = groupManager.getCurrentGroup();
            const groupId = group ? String(group.id) : null;
            if (!groupId) return;

            const untethered = !isTetheredMode();

            if (groupManager.isCombineMode()) {
                groupManager.saveCombineHistory(groupId, history, untethered);
                return;
            }

            const char = getCurrentCharacter();
            if (!char) return;
            const charKey = char.avatar || char.name || 'unknown';
            groupManager.saveGroupChatHistory(groupId, charKey, history, untethered);
            if (isTetheredMode()) {
                syncProactiveStateWithHistory(charKey, history);
            }
            return;
        }

        // ── Solo session: original logic ──────────────────────────────────
        const key = getCharacterKey();
        if (!key) return;
        if (!isTetheredMode()) {
            settings.untetheredHistory[key] = history;
            saveSettings();
            return;
        }
        settings.chatHistory[key] = history;
        syncProactiveStateWithHistory(key, history);
        saveSettings();
    }

    function clearChatHistory() {
        // ── Group session: clear group-scoped storage ─────────────────────
        if (groupManager && groupManager.isGroupSession()) {
            const group = groupManager.getCurrentGroup();
            const groupId = group ? String(group.id) : null;
            if (!groupId) return;

            const untethered = !isTetheredMode();

            if (groupManager.isCombineMode()) {
                groupManager.clearCombineHistory(groupId, untethered);
                return;
            }

            const char = getCurrentCharacter();
            if (!char) return;
            const charKey = char.avatar || char.name || 'unknown';
            groupManager.clearGroupChatHistory(groupId, charKey, untethered);
            clearEmotionState();
            if (memorySystem) memorySystem.clearInsideJokes(charKey);
            if (untetheredChat) untetheredChat.resetUntetheredChat();
            return;
        }

        // ── Solo session: original logic ──────────────────────────────────
        const key = getCharacterKey();
        if (!key) return;
        if (!isTetheredMode()) {
            settings.untetheredHistory[key] = [];
            saveSettings();
            return;
        }
        settings.chatHistory[key] = [];
        // Also reset emotion state when clearing history
        clearEmotionState();
        // Clear inside jokes memory
        if (memorySystem) memorySystem.clearInsideJokes(key);
        // Reset untethered influences globally
        if (untetheredChat) untetheredChat.resetUntetheredChat();
        saveSettings();
    }

    // ============================================================
    // TEXT EXTRACTION
    // ============================================================

    function extractTextFromResponse(response) {
        if (!response) return '';
        if (typeof response === 'string') return response;

        if (Array.isArray(response)) {
            const textParts = response
                .filter(block => block && block.type === 'text' && typeof block.text === 'string')
                .map(block => block.text);
            if (textParts.length > 0) return textParts.join('\n');
            const stringParts = response.filter(item => typeof item === 'string');
            if (stringParts.length > 0) return stringParts.join('\n');
            return JSON.stringify(response);
        }

        if (response.content !== undefined && response.content !== null) {
            if (typeof response.content === 'string') return response.content;
            if (Array.isArray(response.content)) {
                const textParts = response.content
                    .filter(block => block && block.type === 'text' && typeof block.text === 'string')
                    .map(block => block.text);
                if (textParts.length > 0) return textParts.join('\n');
            }
        }

        if (response.choices?.[0]?.message?.content) {
            const choiceContent = response.choices[0].message.content;
            if (typeof choiceContent === 'string') return choiceContent;
            if (Array.isArray(choiceContent)) {
                const textParts = choiceContent
                    .filter(block => block && block.type === 'text' && typeof block.text === 'string')
                    .map(block => block.text);
                if (textParts.length > 0) return textParts.join('\n');
            }
        }

        if (typeof response.text === 'string') return response.text;
        if (typeof response.message === 'string') return response.message;
        if (response.message?.content && typeof response.message.content === 'string') return response.message.content;

        error('Could not extract text from response:', response);
        return JSON.stringify(response);
    }

    // ============================================================
    // GENERATION ENGINE
    // ============================================================

    async function requestEchoTextCompletion({ apiMessages, rawPrompt, systemPrompt, prefillPrefix, signal }) {
        // Strip the pre-fill prefix only when the model echoed it as a chat-completion
        // artefact. Uses exact startsWith (case-insensitive) instead of regex to avoid
        // accidentally matching legitimate content that happens to begin with similar text.
        // Guard: only strip when the remainder starts with a letter — if it starts with a
        // digit, newline, or punctuation the prefix is likely genuine content (e.g. a
        // scoreboard "CharName: 1 / User: 0") rather than an echoed prefill.
        function stripPrefill(text) {
            if (!prefillPrefix || !text) return text;
            const prefix = prefillPrefix.toLowerCase();
            if (!text.toLowerCase().startsWith(prefix)) return text;
            const remainder = text.slice(prefix.length);
            if (!/^[a-z]/i.test(remainder.trimStart())) return text;
            return remainder.trimStart();
        }

        if (settings.source === 'profile') {
            if (!settings.preset) throw new Error('Please select a connection profile in EchoText settings.');
            const context = SillyTavern.getContext();
            const cm = context.extensionSettings?.connectionManager;
            const profile = cm?.profiles?.find(p => p.name === settings.preset);
            if (!profile) throw new Error(`Profile '${settings.preset}' not found.`);
            if (!context.ConnectionManagerRequestService) throw new Error('ConnectionManagerRequestService not available.');

            const response = await context.ConnectionManagerRequestService.sendRequest(
                profile.id, apiMessages, undefined,
                { stream: false, signal, extractData: true, includePreset: true, includeInstruct: true }
            );
            return stripPrefill(extractTextFromResponse(response));
        }

        if (settings.source === 'ollama') {
            const baseUrl = (settings.ollama_url || 'http://localhost:11434').replace(/\/$/, '');
            if (!settings.ollama_model) throw new Error('No Ollama model selected.');

            const response = await fetch(`${baseUrl}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: settings.ollama_model, messages: apiMessages, stream: false }),
                signal
            });
            if (!response.ok) throw new Error(`Ollama API error: ${response.status}`);
            const data = await response.json();
            return stripPrefill(data.message?.content || data.response || '');
        }

        if (settings.source === 'openai') {
            const baseUrl = (settings.openai_url || 'http://localhost:1234/v1').replace(/\/$/, '');
            const headers = { 'Content-Type': 'application/json' };
            if (settings.openai_key) headers['Authorization'] = `Bearer ${settings.openai_key}`;

            const response = await fetch(`${baseUrl}/chat/completions`, {
                method: 'POST', headers,
                body: JSON.stringify({ model: settings.openai_model || 'local-model', messages: apiMessages, temperature: 0.8, stream: false }),
                signal
            });
            if (!response.ok) throw new Error(`API error: ${response.status}`);
            const data = await response.json();
            return stripPrefill(data.choices?.[0]?.message?.content || '');
        }

        const context = SillyTavern.getContext();
        const { generateRaw } = context;
        if (!generateRaw) throw new Error('generateRaw not available in context.');

        const abortPromise = new Promise((_, reject) => {
            signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        });

        return Promise.race([
            generateRaw({ systemPrompt, prompt: rawPrompt, streaming: false }),
            abortPromise
        ]);
    }

    /**
     * Resolves the text to use for a history message when building API context.
     *
     * For assistant turns where image generation ran but no text reply was included
     * (mes is empty/whitespace), the AI would otherwise see a blank response to the
     * user's photo request — making sophisticated models (e.g. Claude Thinking, GLM-5)
     * interpret the request as "unfulfilled" and fixate on it in subsequent turns.
     *
     * This function synthesises a brief, natural acknowledgement stub for those turns
     * so the conversational loop is always closed in the model's context window.
     * The saved history is never modified — only the text sent to the API changes.
     *
     * @param {object} msg - a raw history message object
     * @returns {string} the text to inject into the API context for this turn
     */
    function resolveHistoryMessageText(msg) {
        const rawText = stripThinkingTags(msg.mes || '');
        if (!msg.is_user && !rawText.trim() && msg.imageAttachment?.status === 'ready') {
            // A silent image turn — give the model a compact, in-character stub so it
            // knows the action was completed.  The exact phrasing is deliberately terse
            // to avoid bloating the context with fabricated prose.
            return '*[shared a photo]*';
        }
        return rawText;
    }

    async function buildApiMessagesFromHistory(history, extraSystemMessages = [], targetCharOverride = null) {
        const systemPrompt = await buildSystemPrompt(targetCharOverride);
        const apiMessages = [{ role: 'system', content: systemPrompt }];

        for (const msg of extraSystemMessages) {
            if (msg) apiMessages.push({ role: 'system', content: msg });
        }

        history.forEach(msg => {
            // Strip thinking/reasoning tags from history messages before sending to context.
            // This prevents internal model reasoning blocks from inflating token budgets.
            // resolveHistoryMessageText also fills in a natural stub for silent image turns
            // so the model never sees an empty assistant response to a photo request.
            const contextText = resolveHistoryMessageText(msg);
            apiMessages.push({ role: msg.is_user ? 'user' : 'assistant', content: contextText });
        });

        // --- Layer 3: Pre-fill assistant turn (anti-refusal, chat-completion backends only) ---
        // Planting the assistant prefix forces the model to continue in-character rather than
        // starting fresh with a potential refusal. The prefix is stripped in requestEchoTextCompletion.
        let prefillPrefix = '';
        if (settings.antiRefusal === true && settings.source !== 'default') {
            prefillPrefix = `${getCharacterName()}: `;
            apiMessages.push({ role: 'assistant', content: prefillPrefix });
        }

        let rawPrompt = '';
        history.forEach(msg => {
            rawPrompt += `${msg.is_user ? getUserName() : getCharacterName()}: ${resolveHistoryMessageText(msg)}\n`;
        });
        rawPrompt += `${getCharacterName()}:`;

        return { apiMessages, rawPrompt, systemPrompt, prefillPrefix };
    }

    /**
     * Like buildApiMessagesFromHistory but scoped to an arbitrary char object.
     * Used by generateEchoTextCombined and the proactive scheduler.
     *
     * In Combined Group Mode the request is built by buildCombinedGroupApiMessages,
     * which separates group framing, attributed history, and character-card injection
     * into distinct, correctly-ordered message slots instead of one system-prompt blob.
     */
    async function buildApiMessagesFromHistoryForChar(history, extraSystemMessages = [], char) {
        // ── Combined group mode: use the dedicated structured builder ─────────
        if (isCombinedGroupMode()) {
            const result = await buildCombinedGroupApiMessages(history, char);
            // Splice any extra system messages in after the first [system] block
            if (extraSystemMessages && extraSystemMessages.length) {
                const extras = extraSystemMessages
                    .filter(Boolean)
                    .map(m => ({ role: 'system', content: m }));
                result.apiMessages.splice(1, 0, ...extras);
            }
            return result;
        }

        // ── Solo / individual group-member mode ───────────────────────────────
        const systemPrompt = await buildSystemPrompt(char);
        const apiMessages = [{ role: 'system', content: systemPrompt }];

        for (const msg of extraSystemMessages) {
            if (msg) apiMessages.push({ role: 'system', content: msg });
        }

        history.forEach(msg => {
            // Apply the same silent-image-turn resolution used in buildApiMessagesFromHistory
            // so group-member context windows also see a closed loop for image turns.
            const contextText = resolveHistoryMessageText(msg);
            apiMessages.push({ role: msg.is_user ? 'user' : 'assistant', content: contextText });
        });

        const charName = (char && char.name) || getCharacterName();
        const userName = getUserName();
        let rawPrompt = '';
        history.forEach(msg => {
            rawPrompt += `${msg.is_user ? userName : charName}: ${resolveHistoryMessageText(msg)}\n`;
        });
        rawPrompt += `${charName}:`;

        return { apiMessages, rawPrompt, systemPrompt };
    }

    async function generateEchoText(history) {
        if (isGenerating) return;

        const char = getCurrentCharacter();
        if (!char) {
            toastr.warning('Please select a character card to start texting.');
            return;
        }

        isGenerating = true;
        abortController = new AbortController();
        updateSendButton(true);

        let workingHistory = Array.isArray(history) ? [...history] : [];
        const latestUserIdx = findLastUserMessageIndex(workingHistory);
        const timing = getEmotionReplyTimingModel();
        const latestUserMessage = Array.isArray(history) && history.length ? history[history.length - 1] : null;

        // Pre-detect image requests BEFORE building API messages so the triggering
        // user message can be hidden from the AI character. This prevents the character
        // from awkwardly commenting on "send me a photo" when an image silently appears.
        let pendingImageDetection = null;
        let apiHistory = history;
        if (imageGeneration && settings.imageGenerationEnabled === true && latestUserMessage?.is_user) {
            pendingImageDetection = imageGeneration.detectImageRequest(latestUserMessage.mes, history);
            if (pendingImageDetection.triggered) {
                // Strip the image-triggering message — the AI never sees it
                apiHistory = history.slice(0, -1);
            }
        }

        const { apiMessages, rawPrompt, systemPrompt } = await buildApiMessagesFromHistory(apiHistory);

        let result = '';

        try {
            if (latestUserIdx >= 0) {
                await sleepWithAbort(timing.deliveredDelayMs, abortController.signal);
                setUserMessageReceiptState(workingHistory, latestUserIdx, 'delivered', 'Delivered to character');
                saveChatHistory(workingHistory);

                await sleepWithAbort(timing.readDelayMs, abortController.signal);
                setUserMessageReceiptState(workingHistory, latestUserIdx, 'read', 'Read by character');
                saveChatHistory(workingHistory);

                if (timing.ghostDelayMs > 0) {
                    setUserMessageReceiptState(workingHistory, latestUserIdx, 'ghosted', 'Read — paused before replying');
                    saveChatHistory(workingHistory);
                    await sleepWithAbort(timing.ghostDelayMs, abortController.signal);
                    setUserMessageReceiptState(workingHistory, latestUserIdx, 'read', 'Read by character');
                    saveChatHistory(workingHistory);
                }
            }

            await sleepWithAbort(timing.typingLeadMs, abortController.signal);
            
            const bypassTextGeneration = (imageGeneration && latestUserMessage?.is_user && pendingImageDetection?.triggered && settings.imageGenerationIncludeTextReply === false);

            if (!bypassTextGeneration) {
                setTypingIndicatorVisible(true);
                await sleepWithAbort(timing.replyDelayMs, abortController.signal);
                result = await requestEchoTextCompletion({ apiMessages, rawPrompt, systemPrompt, signal: abortController.signal });
            }

            let imageReply = null;
            if (imageGeneration && settings.imageGenerationEnabled === true && latestUserMessage?.is_user) {
                // Reuse the pre-detection result — no need to call detectImageRequest again
                if (pendingImageDetection?.triggered) {
                    // Replace typing indicator with the dedicated image-generating indicator
                    setTypingIndicatorVisible(false);
                    setImageGeneratingIndicatorVisible(true);
                }
                imageReply = await imageGeneration.maybeGenerateImageReply(latestUserMessage.mes, history, abortController.signal);
                setImageGeneratingIndicatorVisible(false);
            }

            const hasTextResponse = result && result.trim();
            if (hasTextResponse || imageReply?.triggered) {
                const trimmedResult = hasTextResponse ? cleanGeneratedResponse(result) : '';
                
                if (hasTextResponse) {
                    // Process character's response for emotion analysis
                    processMessageEmotion(trimmedResult, false);
                }



                const charReply = {
                    is_user: false,
                    mes: trimmedResult,
                    send_date: Date.now()
                };

                if (imageReply?.triggered) {
                    charReply.imageAttachment = imageReply.result?.ok
                        ? {
                            status: 'ready',
                            type: 'image',
                            url: imageReply.result.url,
                            mimeType: imageReply.result.mimeType || 'image/png',
                            prompt: imageReply.result.prompt || imageReply.promptPayload?.prompt || '',
                            triggerType: imageReply.detection?.type || 'direct_request'
                        }
                        : {
                            status: 'error',
                            type: 'image',
                            error: imageReply.result?.error || 'Sorry, I could not generate an image right now.',
                            triggerType: imageReply.detection?.type || 'direct_request'
                        };

                    if (imageReply.result?.ok && gallery) {
                        try {
                            gallery.addImage({
                                charKey: getCharacterKey(),
                                charName: getCharacterName(),
                                avatarUrl: getAvatarUrlForCharacter(getCurrentCharacter()),
                                url: imageReply.result.url,
                                mimeType: imageReply.result.mimeType || 'image/png',
                                prompt: imageReply.result.prompt || imageReply.promptPayload?.prompt || '',
                                triggerType: imageReply.detection?.type || 'direct_request',
                                createdAt: Date.now()
                            });
                        } catch (galleryErr) {
                            warn('Failed to save generated image to gallery:', galleryErr);
                        }
                    }

                    if (settings.imageGenerationIncludeTextReply === false && imageReply.result?.ok) {
                        charReply.mes = '';
                    }
                }

                const newHistory = [...workingHistory, charReply];
                saveChatHistory(newHistory);
                if (isTetheredMode()) {
                    markProactiveCharacterActivity(getCharacterKey(), false, 'reply');
                    try { if (memorySystem) memorySystem.incrementTurn(); } catch (e) { /* ignore */ }
                }
                renderMessages(newHistory);
                setFabUnreadIndicator(panelOpen ? false : true);
            }

        } catch (err) {
            if (err.name === 'AbortError' || (abortController && abortController.signal.aborted)) {
                log('Generation cancelled');
            } else {
                error('Generation failed:', err);
                toastr.error(`EchoText: ${err.message}`);
            }
        } finally {
            setTypingIndicatorVisible(false);
            setImageGeneratingIndicatorVisible(false);
            isGenerating = false;
            abortController = null;
            updateSendButton(false);
        }
    }

    /**
     * Called when combine mode is toggled on/off in the group bar.
     * Updates the panel header, placeholder, status row, and history display.
     * @param {boolean} isActive - true if combine mode was just switched ON
     */
    function onCombineModeToggle(isActive) {
        if (isActive) {
            // Show combined header listing all member names
            const members = groupManager ? groupManager.getGroupMembers() : [];
            const charNames = members.map(c => c.name).join(', ');
            jQuery('#et-panel-drag-handle').removeClass('et-panel-header-no-char');
            jQuery('#et-char-name').html(`Group: ${escapeHtml(charNames)}<i class="fa-solid fa-chevron-down et-char-name-caret" aria-hidden="true"></i>`);
            jQuery('#et-input').attr('placeholder', `Message all: ${charNames}...`);
        } else {
            // Restore to the currently active individual character
            applySelectedCharacterToPanel();
        }
        // Emotion indicator always hidden in group session
        jQuery('#et-emotion-indicator').addClass('et-emotion-indicator-hidden');
        updatePanelStatusRow();
        // Load and render the appropriate history (combine vs individual)
        const history = getChatHistory();
        renderMessages(history);
    }

    /**
     * Builds API messages for a manual character nudge in Combined Group Mode.
     *
     * Unlike buildCombinedGroupApiMessages (which splits history at the last user
     * message and drops everything after it), this function feeds the ENTIRE history
     * — including character responses that have already happened since the last user
     * message — as attributed context turns.  The stance hint becomes the generation
     * cue in the final user slot, so the model always sees what everyone has said.
     *
     * Layout:
     *   [system]           Shared group prompt + anti-refusal framing
     *   [user / assistant] Full attributed history (user msgs + all char replies)
     *   [user]             User persona + character card + stance hint + verbosity
     *
     * @param {Array}  history    - full combine history at the moment of the nudge
     * @param {object} char       - the character whose turn it is to respond
     * @param {string} stanceHint - randomly chosen nudge instruction
     * @returns {{ apiMessages, rawPrompt, systemPrompt }}
     */
    async function buildManualNudgeApiMessages(history, char, stanceHint) {
        const charName  = char?.name || 'Character';
        const userName  = getUserName();
        const allHistory = Array.isArray(history) ? history : [];

        // ── 1. Shared system prompt ───────────────────────────────────────────
        const systemPrompt = buildGroupSharedSystemPrompt();

        // ── 2. Full history as attributed turns (no splitting) ────────────────
        // Every message is included so the model can see all prior character
        // replies, even those that came after the last user message.
        const historyMessages = allHistory.map(msg => {
            if (msg.is_user) {
                return { role: 'user', content: stripThinkingTags(msg.mes || '') };
            }
            const speaker = msg.charName || charName;
            return { role: 'assistant', content: `${speaker}: ${stripThinkingTags(msg.mes || '')}` };
        });

        // ── 3. Final user turn: persona + character card + stance + verbosity ──
        // There is no new user message here — the character is responding
        // spontaneously.  The stance hint is the only driver of the new reply.
        const finalUserParts = [];

        // User persona description
        try {
            const powerUser = SillyTavern.getContext().powerUserSettings || {};
            const personaDesc = (powerUser.persona_description || '').trim();
            if (personaDesc) {
                finalUserParts.push(`${userName}'s persona: ${expandTimeDateMacros(replaceMacros(personaDesc))}`);
            }
        } catch (e) { /* ignore */ }

        // Character card — wrapped in XML so models treat it as reference data, not output
        const charDescription = (char?.description || char?.data?.description || '').trim();
        const charPersonality  = (char?.personality  || char?.data?.personality  || '').trim();
        const charCardParts = [];
        if (charDescription) charCardParts.push(`${charName}'s description: ${expandTimeDateMacros(replaceMacros(charDescription))}`);
        if (charPersonality)  charCardParts.push(`${charName}'s personality: ${expandTimeDateMacros(replaceMacros(charPersonality))}`);
        if (charCardParts.length > 0) finalUserParts.push(`<character_reference>\n${charCardParts.join('\n\n')}\n</character_reference>`);

        const charKey = char?.avatar || char?.name || '';
        const verbosity = charKey && settings.verbosityByCharacter ? settings.verbosityByCharacter[charKey] : null;

        // Stance hint — the randomly chosen nudge instruction that tells the model
        // how to engage with the live conversation (react to others, address the user,
        // etc.).  This is the primary driver that prevents the character from
        // repeating their opening reply verbatim.
        if (stanceHint) finalUserParts.push(stanceHint);

        // Generation cue — mirrors what buildCombinedGroupApiMessages injects so the
        // model knows exactly whose turn it is and that it must not echo prior replies.
        const charCueTemplate =
            (settings.promptGroupCharacterCue != null && settings.promptGroupCharacterCue !== '')
                ? settings.promptGroupCharacterCue
                : (window.EchoTextConfig?.defaultSettings?.promptGroupCharacterCue || '');
        const charCue = expandTimeDateMacros(replaceMacros(charCueTemplate));
        if (charCue) finalUserParts.push(charCue);

        finalUserParts.push(getVerbosityPrompt(verbosity));

        const finalUserContent = finalUserParts.filter(Boolean).join('\n\n');

        const apiMessages = [
            { role: 'system', content: systemPrompt },
            ...historyMessages,
            { role: 'user', content: finalUserContent }
        ];

        // rawPrompt for non-chat backends (KoboldAI, text-completion proxies)
        let rawPrompt = '';
        allHistory.forEach(msg => {
            const speaker = msg.is_user ? userName : (msg.charName || charName);
            rawPrompt += `${speaker}: ${msg.mes}\n`;
        });
        rawPrompt += `${charName}:`;

        return { apiMessages, rawPrompt, systemPrompt };
    }

    /**
     * Called when the user clicks a character button in Combined Group Mode.
     * Triggers a one-off generation request for that specific character, appended
     * to the current shared combine history.
     *
     * The character randomly chooses one of three stances (weighted equally):
     *   1. Address the chat's general context / latest user message
     *   2. React to or respond to the other group members' most recent lines
     *   3. Speak directly to the user
     *
     * This is injected as an extra system instruction into buildCombinedGroupApiMessages
     * so the character card, history, and group framing are all preserved.
     *
     * @param {string} charKey  - avatar/name key of the triggered character
     * @param {object} charObj  - character object (may be null if lookup failed)
     */
    async function triggerManualCombineChar(charKey, charObj) {
        if (isGenerating) {
            toastr.info('Please wait for the current response to finish before nudging a character.');
            return;
        }
        if (!groupManager) return;

        const group = groupManager.getCurrentGroup();
        const groupId = group ? String(group.id) : null;
        if (!groupId) return;

        const targetChar = charObj || groupManager.getGroupMemberByKey(charKey);
        if (!targetChar) {
            error('triggerManualCombineChar: could not resolve char for key', charKey);
            return;
        }

        const history = getChatHistory();
        const charName = targetChar.name || 'Character';

        // Pick a random stance to guide the character's response.
        // Each hint references the full conversation — the model has the complete
        // attributed history in context, so "what was just said" is accurate.
        const otherMembers = groupManager.getGroupMembers()
            .filter(c => (c.avatar || c.name) !== charKey)
            .map(c => c.name)
            .filter(Boolean);
        const othersLabel = otherMembers.length
            ? otherMembers.join(' and ')
            : 'the others';
        const stances = [
            `You are now choosing to speak up in the group conversation. Look at everything that's been said — by ${getUserName()} and by ${othersLabel} — and respond in a way that feels natural given the full thread. React, continue a thought, or bring something new in.`,
            `You are chiming in. Read what ${othersLabel} most recently said and respond directly to one of them — agree, push back, tease, ask a follow-up, or riff on their point. Make it feel like a real group conversation, not a reply to the original message.`,
            `You are speaking up unprompted. Address ${getUserName()} directly, drawing on something from the conversation so far — a question, a reaction, an observation, or a follow-up to something they said. Keep it conversational.`
        ];
        const stanceHint = stances[Math.floor(Math.random() * stances.length)];

        isGenerating = true;
        abortController = new AbortController();
        updateSendButton(true);

        const prevActiveKey = groupManager.getActiveCharKey();
        groupManager.setActiveCharKey(charKey);

        const timing = { typingLeadMs: 180, replyDelayMs: 320 };

        try {
            setTypingIndicatorVisible(true);
            await sleepWithAbort(timing.typingLeadMs, abortController.signal);
            await sleepWithAbort(timing.replyDelayMs, abortController.signal);

            // Use the dedicated nudge builder so the full history — including
            // character replies that already happened after the last user message —
            // is present as context.  buildApiMessagesFromHistoryForChar would
            // silently drop those post-user-message turns.
            const { apiMessages, rawPrompt, systemPrompt } =
                await buildManualNudgeApiMessages(history, targetChar, stanceHint);

            const result = await requestEchoTextCompletion({
                apiMessages, rawPrompt, systemPrompt,
                signal: abortController.signal
            });

            setTypingIndicatorVisible(false);

            if (result && result.trim()) {
                const charReply = {
                    is_user: false,
                    mes: result.trim(),
                    charName: charName,
                    charKey: charKey,
                    send_date: Date.now()
                };
                const newHistory = [...history, charReply];
                groupManager.saveCombineHistory(groupId, newHistory, !isTetheredMode());
                renderMessages(newHistory);
                setFabUnreadIndicator(panelOpen ? false : true);
            }
        } catch (err) {
            if (err.name === 'AbortError' || (abortController && abortController.signal.aborted)) {
                log('Manual combine nudge cancelled');
            } else {
                error('Manual combine nudge failed:', err);
                toastr.error(`EchoText: ${err.message}`);
            }
        } finally {
            setTypingIndicatorVisible(false);
            groupManager.setActiveCharKey(prevActiveKey);
            isGenerating = false;
            abortController = null;
            updateSendButton(false);
        }
    }

    /**
     * Combined response generation: every group member replies in sequence.
     * Each response is stored in the group's shared combine history with
     * charName + charKey fields for per-bubble attribution in renderMessages.
     * @param {Array} history - current combine history (including the new user message)
     */
    async function generateEchoTextCombined(history) {
        if (isGenerating) return;
        if (!groupManager) return;

        const members = groupManager.getGroupMembers();
        if (!members.length) return;

        const group = groupManager.getCurrentGroup();
        const groupId = group ? String(group.id) : null;
        if (!groupId) return;

        isGenerating = true;
        abortController = new AbortController();
        updateSendButton(true);

        let workingHistory = Array.isArray(history) ? [...history] : [];

        // Mark the latest user message as delivered / read
        const latestUserIdx = findLastUserMessageIndex(workingHistory);
        const timing = { deliveredDelayMs: 350, readDelayMs: 850, ghostDelayMs: 0, typingLeadMs: 250, replyDelayMs: 450 };

        try {
            if (latestUserIdx >= 0) {
                await sleepWithAbort(timing.deliveredDelayMs, abortController.signal);
                setUserMessageReceiptState(workingHistory, latestUserIdx, 'delivered', 'Delivered to group');
                groupManager.saveCombineHistory(groupId, workingHistory, !isTetheredMode());

                await sleepWithAbort(timing.readDelayMs, abortController.signal);
                setUserMessageReceiptState(workingHistory, latestUserIdx, 'read', 'Read by group');
                groupManager.saveCombineHistory(groupId, workingHistory, !isTetheredMode());
            }

            // Generate a reply from each group member in order
            for (const char of members) {
                if (abortController.signal.aborted) break;

                const charKey = char.avatar || char.name;
                let prevActiveKey = groupManager.getActiveCharKey();

                // Temporarily set active key so buildSystemPrompt uses the right verbosity
                groupManager.setActiveCharKey(charKey);

                try {
                    setTypingIndicatorVisible(true);
                    await sleepWithAbort(timing.typingLeadMs, abortController.signal);
                    await sleepWithAbort(timing.replyDelayMs, abortController.signal);

                    const { apiMessages, rawPrompt, systemPrompt } =
                        await buildApiMessagesFromHistoryForChar(workingHistory, [], char);

                    const result = await requestEchoTextCompletion({
                        apiMessages, rawPrompt, systemPrompt,
                        signal: abortController.signal
                    });

                    setTypingIndicatorVisible(false);

                    if (result && result.trim()) {
                        const charReply = {
                            is_user: false,
                            mes: cleanGeneratedResponse(result),
                            charName: char.name,
                            charKey: charKey,
                            send_date: Date.now()
                        };
                        workingHistory = [...workingHistory, charReply];
                        groupManager.saveCombineHistory(groupId, workingHistory, !isTetheredMode());
                        renderMessages(workingHistory);
                        setFabUnreadIndicator(panelOpen ? false : true);
                    }
                } finally {
                    setTypingIndicatorVisible(false);
                    groupManager.setActiveCharKey(prevActiveKey);
                }

                // Brief pause between characters so responses feel staggered
                if (!abortController.signal.aborted && char !== members[members.length - 1]) {
                    await sleepWithAbort(350, abortController.signal);
                }
            }

        } catch (err) {
            if (err.name === 'AbortError' || (abortController && abortController.signal.aborted)) {
                log('Combined generation cancelled');
            } else {
                error('Combined generation failed:', err);
                toastr.error(`EchoText: ${err.message}`);
            }
        } finally {
            setTypingIndicatorVisible(false);
            isGenerating = false;
            abortController = null;
            updateSendButton(false);
        }
    }

    /**
     * Regenerate a single character's response in Combined Group Mode.
     *
     * Unlike generateEchoTextCombined (which iterates every member), this only
     * regenerates `targetCharKey`.  It receives the history split into two parts:
     *
     *   historyBefore — everything up to (not including) the target message.
     *                   Used as the generation context so the model sees the right
     *                   conversation up to that point.
     *   historyAfter  — messages that came AFTER the target message (e.g. Iris's
     *                   response when regenerating Joi's).  These are preserved
     *                   verbatim and stitched back in after the new reply.
     *
     * Final saved history: [...historyBefore, newReply, ...historyAfter]
     *
     * @param {Array}  historyBefore  - history up to (excl.) the message being regenerated
     * @param {Array}  historyAfter   - history after the message being regenerated
     * @param {string} targetCharKey  - avatar/name key of the character to regenerate
     */
    async function generateEchoTextCombinedForChar(historyBefore, historyAfter, targetCharKey) {
        if (isGenerating) return;
        if (!groupManager) return;

        const group = groupManager.getCurrentGroup();
        const groupId = group ? String(group.id) : null;
        if (!groupId) return;

        const targetChar = groupManager.getGroupMemberByKey(targetCharKey);
        if (!targetChar) {
            error('generateEchoTextCombinedForChar: could not resolve char for key', targetCharKey);
            return;
        }

        isGenerating = true;
        abortController = new AbortController();
        updateSendButton(true);

        const prevActiveKey = groupManager.getActiveCharKey();
        // Temporarily point active key at the target so verbosity/system prompt are scoped correctly
        groupManager.setActiveCharKey(targetCharKey);

        const timing = { typingLeadMs: 250, replyDelayMs: 450 };

        try {
            setTypingIndicatorVisible(true);
            await sleepWithAbort(timing.typingLeadMs, abortController.signal);
            await sleepWithAbort(timing.replyDelayMs, abortController.signal);

            // Build the API messages using only the pre-target history as context
            const { apiMessages, rawPrompt, systemPrompt } =
                await buildApiMessagesFromHistoryForChar(historyBefore, [], targetChar);

            const result = await requestEchoTextCompletion({
                apiMessages, rawPrompt, systemPrompt,
                signal: abortController.signal
            });

            setTypingIndicatorVisible(false);

            if (result && result.trim()) {
                const charReply = {
                    is_user: false,
                    mes: cleanGeneratedResponse(result),
                    charName: targetChar.name,
                    charKey: targetCharKey,
                    send_date: Date.now()
                };
                // Stitch: preserve everything before, insert new reply, preserve everything after
                const finalHistory = [...historyBefore, charReply, ...historyAfter];
                groupManager.saveCombineHistory(groupId, finalHistory, !isTetheredMode());
                renderMessages(finalHistory);
                setFabUnreadIndicator(panelOpen ? false : true);
            }
        } catch (err) {
            if (err.name === 'AbortError' || (abortController && abortController.signal.aborted)) {
                log('Combined single-char regen cancelled');
            } else {
                error('Combined single-char regen failed:', err);
                toastr.error(`EchoText: ${err.message}`);
            }
        } finally {
            setTypingIndicatorVisible(false);
            groupManager.setActiveCharKey(prevActiveKey);
            isGenerating = false;
            abortController = null;
            updateSendButton(false);
        }
    }

    function getDateKeyLocal(d = new Date()) {
        return proactiveMessaging ? proactiveMessaging.getDateKeyLocal(d) : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    function sleepWithAbort(ms, signal) {
        return new Promise((resolve, reject) => {
            if (!ms || ms <= 0) return resolve();
            if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'));

            const timer = setTimeout(() => {
                if (signal) signal.removeEventListener('abort', onAbort);
                resolve();
            }, ms);

            const onAbort = () => {
                clearTimeout(timer);
                if (signal) signal.removeEventListener('abort', onAbort);
                reject(new DOMException('Aborted', 'AbortError'));
            };

            if (signal) signal.addEventListener('abort', onAbort);
        });
    }

    function findLastUserMessageIndex(history) {
        if (!Array.isArray(history)) return -1;
        for (let i = history.length - 1; i >= 0; i--) {
            if (history[i]?.is_user) return i;
        }
        return -1;
    }

    function setTypingIndicatorVisible(visible) {
        showTypingIndicator = !!visible;
        if (!panelOpen) return;

        const inner = jQuery('#et-messages-inner');
        if (!inner.length) return;

        if (visible) {
            if (!inner.find('#et-typing-indicator-msg').length) {
                const charName = getCharacterName();
                const avatarHtml = settings.showAvatar !== false
                    ? buildAvatarHtml(charName, 'et-bubble-avatar', '', true)
                    : '';
                const el = jQuery(`
                    <div class="et-message et-message-char et-message-typing" id="et-typing-indicator-msg">
                        <div class="et-message-body">
                            <div class="et-bubble et-bubble-char et-typing-bubble" title="Character is typing">
                                <div class="et-typing-dots"><span></span><span></span><span></span></div>
                                ${avatarHtml}
                            </div>
                        </div>
                    </div>
                `);
                inner.append(el);
                if (settings.autoScroll) {
                    const messagesEl = document.getElementById('et-messages');
                    if (messagesEl) {
                        messagesEl.scrollTop = messagesEl.scrollHeight;
                        inner.find('#et-typing-indicator-msg img').on('load', function() {
                            if (settings.autoScroll) {
                                messagesEl.scrollTop = messagesEl.scrollHeight;
                            }
                        });
                    }
                }
            }
        } else {
            inner.find('#et-typing-indicator-msg').remove();
        }
    }

    // ── Image generating indicator ────────────────────────────────────────────
    // Shown INSTEAD of the typing indicator while SD image generation is in
    // progress. Distinct appearance: camera icon + aperture-spin ring + label.
    function setImageGeneratingIndicatorVisible(visible) {
        if (!panelOpen) return;
        const inner = jQuery('#et-messages-inner');
        if (!inner.length) return;

        if (visible) {
            if (!inner.find('#et-image-gen-indicator-msg').length) {
                const charName = getCharacterName();
                const avatarHtml = settings.showAvatar !== false
                    ? buildAvatarHtml(charName, 'et-bubble-avatar', '', true)
                    : '';
                const el = jQuery(`
                    <div class="et-message et-message-char et-message-typing" id="et-image-gen-indicator-msg">
                        <div class="et-message-body">
                            <div class="et-bubble et-bubble-char et-image-gen-bubble" title="Generating image…">
                                <div class="et-image-gen-indicator">
                                    <div class="et-image-gen-ring">
                                        <svg viewBox="0 0 36 36" class="et-image-gen-svg">
                                            <circle class="et-image-gen-track" cx="18" cy="18" r="14" fill="none" stroke-width="2.5"/>
                                            <circle class="et-image-gen-arc" cx="18" cy="18" r="14" fill="none" stroke-width="2.5" stroke-dasharray="22 66" stroke-linecap="round"/>
                                        </svg>
                                        <i class="fa-solid fa-camera et-image-gen-icon"></i>
                                    </div>
                                    <span class="et-image-gen-label">Generating image…</span>
                                </div>
                                ${avatarHtml}
                            </div>
                        </div>
                    </div>
                `);
                inner.append(el);
                if (settings.autoScroll) {
                    const messagesEl = document.getElementById('et-messages');
                    if (messagesEl) {
                        messagesEl.scrollTop = messagesEl.scrollHeight;
                        inner.find('#et-image-gen-indicator-msg img').on('load', function() {
                            if (settings.autoScroll) {
                                messagesEl.scrollTop = messagesEl.scrollHeight;
                            }
                        });
                    }
                }
            }
        } else {
            inner.find('#et-image-gen-indicator-msg').remove();
        }
    }

    function setFabUnreadIndicator(hasUnread) {
        hasUnreadCharacterMessage = !!hasUnread;
        const fab = jQuery('#et-fab');
        if (!fab.length) return;
        fab.toggleClass('et-fab-unread', hasUnreadCharacterMessage);
        fab.attr('title', hasUnreadCharacterMessage ? 'Open EchoText (new message)' : 'Open EchoText');
    }

    function setUserMessageReceiptState(history, msgIndex, state, note = '') {
        if (!Array.isArray(history) || msgIndex < 0 || !history[msgIndex] || !history[msgIndex].is_user) return history;
        history[msgIndex].meta = history[msgIndex].meta || {};
        history[msgIndex].meta.receipt = {
            state,
            note,
            at: Date.now()
        };

        // Surgical DOM update — avoid full re-render just for receipt icon change
        if (panelOpen) {
            const receiptMap = {
                sent: { icon: 'fa-paper-plane', label: 'Sent' },
                delivered: { icon: 'fa-check', label: 'Delivered' },
                read: { icon: 'fa-check-double', label: 'Read' },
                ghosted: { icon: 'fa-eye-slash', label: 'Read, then paused (ghosting)' }
            };
            const def = receiptMap[state] || receiptMap.sent;
            const tip = note || def.label;
            const receiptEl = jQuery(`.et-message[data-index="${msgIndex}"] .et-read-receipt`);
            if (receiptEl.length) {
                receiptEl.attr('class', `et-read-receipt et-read-receipt-${state}`)
                    .attr('title', tip)
                    .html(`<i class="fa-solid ${def.icon}"></i>`);
            }
        }

        return history;
    }

    function getEmotionReplyTimingModel() {
        return emotionSystem
            ? emotionSystem.getEmotionReplyTimingModel()
            : { deliveredDelayMs: 500, readDelayMs: 1200, ghostDelayMs: 0, typingLeadMs: 300, replyDelayMs: 600 };
    }

    function syncProactiveStateWithHistory(characterKey, history) {
        if (proactiveMessaging) proactiveMessaging.syncProactiveStateWithHistory(characterKey, history);
    }

    function markProactiveUserActivity(characterKey, timestamp = Date.now()) {
        if (proactiveMessaging) proactiveMessaging.markProactiveUserActivity(characterKey, timestamp);
    }

    function markProactiveCharacterActivity(characterKey, proactive = false, outboundType = 'reply', timestamp = Date.now()) {
        if (proactiveMessaging) proactiveMessaging.markProactiveCharacterActivity(characterKey, proactive, outboundType, timestamp);
    }

    function refreshProactiveInsights() {
        if (proactiveMessaging) proactiveMessaging.refreshProactiveInsights();
    }

    async function triggerTestProactiveMessage() {
        if (proactiveMessaging) await proactiveMessaging.triggerTestProactiveMessage();
    }

    function startProactiveScheduler() {
        if (proactiveMessaging) proactiveMessaging.startProactiveScheduler();
    }

    function stopProactiveScheduler() {
        if (proactiveMessaging) proactiveMessaging.stopProactiveScheduler();
    }

    // ============================================================
    // CONNECTION PROFILE HELPERS
    // ============================================================

    function populateConnectionProfiles() {
        try {
            const context = SillyTavern.getContext();
            const connectionManager = context?.extensionSettings?.connectionManager;
            const select = jQuery('#et_profile_select');
            const currentValue = select.val() || settings.preset;

            select.empty();
            select.append('<option value="">-- Select Profile --</option>');

            if (connectionManager?.profiles?.length) {
                connectionManager.profiles.forEach(profile => {
                    const safeName = profile.name.replace(/"/g, '&quot;');
                    const isSelected = currentValue === profile.name ? ' selected' : '';
                    select.append(`<option value="${safeName}"${isSelected}>${safeName}</option>`);
                });
            } else {
                select.append('<option value="" disabled>No profiles found</option>');
            }
        } catch (err) {
            warn('Error loading connection profiles:', err);
        }
    }

    function populateConnectionProfilesPanel() {
        try {
            const context = SillyTavern.getContext();
            const connectionManager = context?.extensionSettings?.connectionManager;
            const select = jQuery('#et_profile_select_panel');
            const currentValue = settings.preset;

            select.empty();
            select.append('<option value="">-- Select Profile --</option>');

            if (connectionManager?.profiles?.length) {
                connectionManager.profiles.forEach(profile => {
                    const safeName = profile.name.replace(/"/g, '&quot;');
                    const isSelected = currentValue === profile.name ? ' selected' : '';
                    select.append(`<option value="${safeName}"${isSelected}>${safeName}</option>`);
                });
            } else {
                select.append('<option value="" disabled>No profiles found</option>');
            }
        } catch (err) {
            warn('Error loading connection profiles for panel:', err);
        }
    }

    async function fetchOllamaModels() {
        try {
            const baseUrl = (settings.ollama_url || 'http://localhost:11434').replace(/\/$/, '');
            const response = await fetch(`${baseUrl}/api/tags`, { method: 'GET' });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            const models = data.models || [];

            const select = jQuery('#et_ollama_model_select');
            const currentModel = settings.ollama_model || (models.length > 0 ? models[0].name : '');
            select.empty();
            models.forEach(m => {
                select.append(`<option value="${m.name}"${m.name === currentModel ? ' selected' : ''}>${m.name}</option>`);
            });
            if (currentModel) { settings.ollama_model = currentModel; saveSettings(); }
            jQuery('#et_ollama_status').text(`Loaded ${models.length} model(s).`).css('color', '#a8ffaa');
        } catch (err) {
            jQuery('#et_ollama_status').text(`Error: ${err.message}`).css('color', '#ff8888');
        }
    }

    async function fetchMultimodalModels() {
        jQuery('#et_multimodal_model_status').text('Model discovery is now managed by the SillyTavern Image Generation plugin.').css('color', '#a8ffaa');
        jQuery('#et_multimodal_model_status_panel').text('Model discovery is now managed by the SillyTavern Image Generation plugin.').css('color', '#a8ffaa');
    }

    // ============================================================
    // FLOATING ACTION BUTTON (FAB)
    // ============================================================

    function buildFabHtml() {
        const icon = settings.fabIcon || 'fa-message';
        return `<div id="et-fab" title="Open EchoText"><i class="fa-solid ${icon}"></i></div>`;
    }

    function positionFab() {
        const fab = jQuery('#et-fab');
        if (!fab.length) return;

        const size = settings.fabSize;
        fab.css({ width: size + 'px', height: size + 'px' });

        // 24 px on mobile clears the home indicator; 16 px on desktop.
        const margin = isMobileDevice() ? 24 : 16;
        const vw = getViewportWidth();
        const vh = getViewportHeight();

        // Free-floating position (not snapped to any edge).
        if (settings.fabFreeX != null && settings.fabFreeY != null) {
            const left = Math.max(margin, Math.min(vw - size - margin, (settings.fabFreeX / 100) * vw));
            const top  = Math.max(margin, Math.min(vh - size - margin, (settings.fabFreeY / 100) * vh));
            fab.css({ left: left + 'px', top: top + 'px', right: '', bottom: '' });
            return;
        }

        // On mobile the FAB is position:absolute inside the fixed portal, so
        // left/top/right/bottom are relative to the portal's top-left (= viewport 0,0).
        // We run the same edge-snap logic as desktop but with a larger margin that
        // clears the iOS home indicator and notch safe areas.
        const edge = settings.fabEdge || 'right';
        const pos  = settings.fabPosition != null ? settings.fabPosition : 80;

        if (edge === 'right') {
            const top = Math.max(margin, Math.min(vh - size - margin, (pos / 100) * vh));
            fab.css({ right: margin + 'px', bottom: '', left: '', top: top + 'px' });
        } else if (edge === 'left') {
            const top = Math.max(margin, Math.min(vh - size - margin, (pos / 100) * vh));
            fab.css({ left: margin + 'px', right: '', bottom: '', top: top + 'px' });
        } else if (edge === 'bottom') {
            const left = Math.max(margin, Math.min(vw - size - margin, (pos / 100) * vw));
            fab.css({ bottom: margin + 'px', top: '', left: left + 'px', right: '' });
        } else if (edge === 'top') {
            const left = Math.max(margin, Math.min(vw - size - margin, (pos / 100) * vw));
            fab.css({ top: margin + 'px', bottom: '', left: left + 'px', right: '' });
        }
    }

    function makeFabDraggable() {
        const fab = document.getElementById('et-fab');
        if (!fab) return;

        let isDragging = false;
        let startX, startY, startLeft, startTop;
        let hasMoved = false;

        function onStart(clientX, clientY) {
            isDragging = true;
            hasMoved = false;
            fabDragging = false;
            const rect = fab.getBoundingClientRect();
            startX = clientX;
            startY = clientY;
            startLeft = rect.left;
            startTop = rect.top;
            fab.style.transition = 'none';
        }

        function onMove(clientX, clientY) {
            if (!isDragging) return;
            const dx = clientX - startX;
            const dy = clientY - startY;
            if (Math.abs(dx) > 5 || Math.abs(dy) > 5) { hasMoved = true; fabDragging = true; }
            if (!hasMoved) return;
            const size = fab.offsetWidth;
            const newLeft = Math.max(0, Math.min(getViewportWidth() - size, startLeft + dx));
            const newTop = Math.max(0, Math.min(getViewportHeight() - size, startTop + dy));
            fab.style.left = newLeft + 'px';
            fab.style.top = newTop + 'px';
            fab.style.right = '';
            fab.style.bottom = '';
        }

        function onEnd() {
            if (!isDragging) return;
            isDragging = false;
            fab.style.transition = '';
            if (hasMoved) snapFabToEdge();
            setTimeout(() => { fabDragging = false; }, 50);
        }

        fab.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            onStart(e.clientX, e.clientY);
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
            e.preventDefault();
        });

        function onMouseMove(e) { onMove(e.clientX, e.clientY); }
        function onMouseUp() {
            onEnd();
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        }

        fab.addEventListener('touchstart', (e) => {
            const t = e.touches[0];
            onStart(t.clientX, t.clientY);
        }, { passive: true });

        fab.addEventListener('touchmove', (e) => {
            if (!isDragging) return;
            // Must be non-passive to call preventDefault(),
            // which stops the page from scrolling while the FAB is being dragged.
            e.preventDefault();
            const t = e.touches[0];
            onMove(t.clientX, t.clientY);
        }, { passive: false });

        fab.addEventListener('touchend', () => { onEnd(); });
    }

    function snapFabToEdge() {
        const fab = document.getElementById('et-fab');
        if (!fab) return;

        const rect = fab.getBoundingClientRect();
        const size = fab.offsetWidth;
        // Match the margin used in positionFab(): 24 px on mobile (clears home
        // indicator), 16 px on desktop.
        const margin = isMobileDevice() ? 24 : 16;
        const cx = rect.left + size / 2;
        const cy = rect.top + size / 2;
        // Use visual viewport so snap calculations are correct on iOS
        // (window.innerWidth/Height may include collapsed browser chrome).
        const vw = getViewportWidth();
        const vh = getViewportHeight();

        // Only snap to an edge when the FAB center is within 15% of the viewport
        // edge in that axis.  Outside that zone the button floats freely wherever
        // the user dropped it.
        const SNAP_ZONE = 0.07;
        const nearLeft   = cx < SNAP_ZONE * vw;
        const nearRight  = cx > (1 - SNAP_ZONE) * vw;
        const nearTop    = cy < SNAP_ZONE * vh;
        const nearBottom = cy > (1 - SNAP_ZONE) * vh;

        if (!nearLeft && !nearRight && !nearTop && !nearBottom) {
            // Free-float: store position as % of viewport so it survives resizes.
            settings.fabFreeX = Math.round(((rect.left) / vw) * 100 * 10) / 10;
            settings.fabFreeY = Math.round(((rect.top)  / vh) * 100 * 10) / 10;
            // Clear any previously saved edge state.
            settings.fabEdge = null;
            settings.fabPosition = null;
            saveSettings();
            // No animation — the button is already in the right place from the drag.
            return;
        }

        // Near an edge: snap to the closest one.
        // Clear any previously saved free-float position.
        settings.fabFreeX = null;
        settings.fabFreeY = null;

        const distLeft   = cx;
        const distRight  = vw - cx;
        const distTop    = cy;
        const distBottom = vh - cy;
        const minDist = Math.min(distLeft, distRight, distTop, distBottom);

        let edge, pos;
        if (minDist === distRight)       { edge = 'right';  pos = Math.round((cy / vh) * 100); }
        else if (minDist === distLeft)   { edge = 'left';   pos = Math.round((cy / vh) * 100); }
        else if (minDist === distBottom) { edge = 'bottom'; pos = Math.round((cx / vw) * 100); }
        else                             { edge = 'top';    pos = Math.round((cx / vw) * 100); }

        settings.fabEdge = edge;
        settings.fabPosition = pos;
        saveSettings();

        fab.style.transition = 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)';
        positionFab();
    }

    // ============================================================
    // FLOATING PANEL
    // ============================================================

    function getCharAvatarColor(charName) {
        let hash = 0;
        for (let i = 0; i < charName.length; i++) {
            hash = charName.charCodeAt(i) + ((hash << 5) - hash);
        }
        return `hsl(${Math.abs(hash) % 360}, 65%, 60%)`;
    }

    /**
     * Get the character's avatar image URL from SillyTavern.
     * Returns null if no image is available.
     */
    function getCharAvatarUrl() {
        try {
            const char = getCurrentCharacter();
            if (!char || !char.avatar || char.avatar === 'none') return null;
            const context = SillyTavern.getContext();
            return context.getThumbnailUrl('avatar', char.avatar);
        } catch (e) {
            return null;
        }
    }

    /**
     * Build avatar HTML: image if available, else initial circle with theme color.
     * @param {string} charName - character name
     * @param {string} extraClass - additional CSS classes
     * @param {string} id - element id (optional)
     * @param {boolean} small - use small size class
     */
    function buildAvatarHtml(charName, extraClass = '', id = '', small = false) {
        const avatarUrl = getCharAvatarUrl();
        const initial = charName.charAt(0).toUpperCase();
        const escapedInitial = escapeHtml(initial);
        const idAttr = id ? ` id="${id}"` : '';
        const sizeClass = small ? 'et-char-avatar-small' : 'et-char-avatar';
        // Only apply hidden class to bubble avatars, not header avatars
        const isBubbleAvatar = extraClass && extraClass.includes('et-bubble-avatar');
        const hiddenClass = (settings.showAvatar === false && isBubbleAvatar) ? ' et-avatar-hidden' : '';

        // Derive initial-circle background from name (same palette as character picker)
        const bgColor = _pickerAvatarBg ? _pickerAvatarBg(charName) : 'var(--et-theme-color)';

        // Special placeholder when no character is loaded (name is the fallback 'Character' and no image)
        const isNoChar = !getCurrentCharacter();
        if (isNoChar && !avatarUrl && !small) {
            return `<div class="${sizeClass} et-no-char-avatar et-echo-logo${hiddenClass}${extraClass ? ' ' + extraClass : ''}"${idAttr} title="EchoText"><svg width="62%" height="62%" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect x="5" y="4" width="2.6" height="16" rx="1.3" fill="rgba(255,255,255,0.92)"/><rect x="5" y="4" width="13.5" height="2.6" rx="1.3" fill="rgba(255,255,255,0.92)"/><rect x="5" y="10.7" width="10.5" height="2.6" rx="1.3" fill="rgba(255,255,255,0.92)"/><rect x="5" y="17.4" width="13.5" height="2.6" rx="1.3" fill="rgba(255,255,255,0.92)"/></svg></div>`;
        }

        if (avatarUrl) {
            // Render the initial circle as the base layer; the <img> floats above it.
            // After the image loads we canvas-fingerprint it — if it matches the ST default
            // silhouette (near-black or grey-purple [149,127,143] at px 50,50) we remove the
            // image and reveal the styled initial circle underneath.
            const html = `<div class="${sizeClass}${hiddenClass}${extraClass ? ' ' + extraClass : ''}"${idAttr} style="background:${bgColor};">
                <span class="et-char-avatar-initial" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:1rem;color:#fff;border-radius:50%;pointer-events:none;">${escapedInitial}</span>
                <img src="${avatarUrl}" alt="${escapedInitial}" class="et-avatar-img" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:50%;" onerror="this.remove();">
            </div>`;
            // Schedule fingerprinting after DOM insertion via a non-blocking timeout
            setTimeout(() => {
                if (id) _fingerprintAvatarImg(document.getElementById(id));
            }, 0);
            return html;
        }
        return `<div class="${sizeClass}${hiddenClass}${extraClass ? ' ' + extraClass : ''}"${idAttr} style="background:${bgColor};position:relative;">
            <span style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:1rem;color:#fff;">${escapedInitial}</span>
        </div>`;
    }

    /**
     * Canvas-fingerprint the <img> inside an avatar wrapper element.
     * If the loaded image matches the ST default silhouette, removes it to
     * reveal the styled initial circle rendered underneath.
     */
    function _fingerprintAvatarImg(wrapperEl) {
        if (!wrapperEl) return;
        const img = wrapperEl.querySelector('img.et-avatar-img');
        if (!img) return;

        function _check() {
            try {
                const naturalW = img.naturalWidth;
                const naturalH = img.naturalHeight;
                if (!naturalW || !naturalH) return; // not loaded yet
                const sampleX = Math.min(50, naturalW - 1);
                const sampleY = Math.min(50, naturalH - 1);
                const c = document.createElement('canvas');
                c.width = naturalW; c.height = naturalH;
                const ctx = c.getContext('2d');
                ctx.drawImage(img, 0, 0);
                const px = ctx.getImageData(sampleX, sampleY, 1, 1).data;
                const brightness = px[0] + px[1] + px[2];
                const isNearBlack = brightness <= 15;
                const TOL = 12;
                const isGreyPurple = Math.abs(px[0] - 149) <= TOL &&
                                     Math.abs(px[1] - 127) <= TOL &&
                                     Math.abs(px[2] - 143) <= TOL;
                if (isNearBlack || isGreyPurple) img.remove();
            } catch (_e) { /* cross-origin — keep the image */ }
        }

        if (img.complete && img.naturalWidth > 0) {
            _check();
        } else {
            img.addEventListener('load', _check, { once: true });
        }
    }

    /**
     * Refreshes the unread pulse class on group bar buttons based on groupManager state.
     */
    function renderGroupUnreadIndicators() {
        if (!groupManager) return;
        const unread = groupManager.getUnreadCharKeys();
        jQuery('.et-group-char-btn').each(function () {
            const key = jQuery(this).data('char-key');
            jQuery(this).toggleClass('et-group-unread', unread.has(key));
        });
    }

    /**
     * Switch the EchoText panel to focus on a different group member.
     * Called when the user clicks a character button in the group bar.
     */
    function switchGroupChar(charKey, charObj) {
        if (!charObj) return;
        groupManager.setActiveCharKey(charKey);

        // Clear unread for the newly selected char and refresh indicators
        if (groupManager.clearGroupCharUnread) groupManager.clearGroupCharUnread(charKey);
        renderGroupUnreadIndicators();

        // In combine mode, switching single chars doesn't affect the panel display
        if (groupManager.isCombineMode()) return;

        const charName = charObj.name || 'Character';

        // Update panel header
        jQuery('#et-panel-drag-handle').removeClass('et-panel-header-no-char');
        jQuery('#et-panel').removeClass('et-panel-no-char');
        jQuery('#et-char-name').html(`${escapeHtml(charName)}<i class="fa-solid fa-chevron-down et-char-name-caret" aria-hidden="true"></i>`);
        jQuery('#et-input').attr('placeholder', `Text ${charName}...`).prop('disabled', false);
        jQuery('#et-send-btn').prop('disabled', false);

        // Rebuild avatar in the header using the group module's builder
        const newAvatarHtml = groupManager.buildAvatarHtmlForChar(charObj, '', 'et-char-avatar-wrap');
        jQuery('#et-char-avatar-wrap').replaceWith(newAvatarHtml);

        // Refresh emotion indicator — hidden in group session
        jQuery('#et-emotion-indicator').addClass('et-emotion-indicator-hidden');
        updatePanelStatusRow();

        // Render this character's history
        const history = getChatHistory();
        renderMessages(history);

        // Update proactive state sync
        if (isTetheredMode()) {
            syncProactiveStateWithHistory(charKey, history);
        }
    }

    function buildPanelHtml() {
        const tethered = isTetheredMode();
        const inGroup = groupManager && groupManager.isGroupSession();
        // Combined Group Mode: the header must list all member names, not just the active char.
        // buildPanelHtml is called by openPanel() before applySelectedCharacterToPanel() runs,
        // so without this check the header would show only the first active member (e.g. "Amy")
        // instead of "Group: Amy, Joi, Iris" — making it appear combine mode was exited.
        const inCombine = inGroup && groupManager && groupManager.isCombineMode();

        let charName, hasChar, displayName;
        if (inCombine) {
            const members = groupManager.getGroupMembers();
            const memberNames = members.map(c => c.name).join(', ');
            charName = memberNames;
            hasChar = members.length > 0;
            displayName = `Group: ${memberNames}`;
        } else {
            charName = getCharacterName();
            hasChar = !!getCurrentCharacter();
            displayName = hasChar ? charName : 'Choose A Character';
        }
        const noCharClass = hasChar ? '' : ' et-panel-header-no-char';
        const panelNoCharClass = hasChar ? '' : ' et-panel-no-char';

        return `
        <div id="et-panel" class="et-panel${panelNoCharClass}">
            <div class="et-resize-handle" data-corner="nw"></div>
            <div class="et-resize-handle" data-corner="ne"></div>
            <div class="et-resize-handle" data-corner="sw"></div>
            <div class="et-resize-handle" data-corner="se"></div>

            <div class="et-panel-header${noCharClass}" id="et-panel-drag-handle">
                <div class="et-header-left">
                    ${buildAvatarHtml(charName, '', 'et-char-avatar-wrap')}
                    <span class="et-panel-echotext-title">EchoText</span>
                    <div class="et-header-info">
                        <div class="et-char-name-row">
                            <div class="et-char-name" id="et-char-name" title="Select character">${escapeHtml(displayName)}<i class="fa-solid fa-chevron-down et-char-name-caret" aria-hidden="true"></i></div>
                        </div>
                        <div class="et-char-status-row${inGroup ? '' : ' et-panel-status-clickable'}" id="et-panel-status-trigger" title="Open details">
                            <div id="et-panel-status-content" class="et-panel-status-content"><span class="et-status-placeholder">Loading...</span></div>
                        </div>
                    </div>
                </div>
                <div class="et-header-right">
                    <button class="et-mode-toggle ${tethered ? 'et-mode-tethered' : 'et-mode-untethered'}${inGroup ? ' et-mode-toggle-group-off et-mode-toggle-hidden' : ''}" id="et-mode-toggle-btn"
                        title="${inGroup ? 'This toggle is unavailable in group sessions.' : (tethered ? 'Tethered: Syncs mood and context with the main chat.' : 'Untethered: Standalone session with no main chat sync.')}"
                        aria-disabled="${inGroup}">
                        <i class="fa-solid ${tethered ? 'fa-link' : 'fa-link-slash'}"></i>
                    </button>
                    <div class="et-header-btn" id="et-overflow-btn" title="More options">
                        <i class="fa-solid fa-ellipsis-vertical"></i>
                    </div>
                    <div class="et-overflow-menu" id="et-overflow-menu">
                        <div class="et-overflow-menu-item" id="et-overflow-settings">
                            <i class="fa-solid fa-gear"></i>
                            <span>Settings</span>
                        </div>
                        <div class="et-overflow-menu-item" id="et-overflow-context" style="display:none">
                            <i class="fa-solid fa-book-open-reader"></i>
                            <span>Context</span>
                            <span class="et-overflow-ctx-badge" id="et-overflow-ctx-badge" style="display:none"></span>
                        </div>
                        <div class="et-overflow-menu-item" id="et-overflow-gallery" style="display:none">
                            <i class="fa-regular fa-images"></i>
                            <span>Gallery</span>
                        </div>
                        <div class="et-overflow-menu-item" id="et-overflow-saveload" style="display:none">
                            <i class="fa-solid fa-floppy-disk"></i>
                            <span>Archives</span>
                        </div>
                        <div class="et-overflow-menu-divider" id="et-overflow-char-divider" style="display:none"></div>
                        <div class="et-overflow-menu-item" id="et-overflow-clear" style="display:none">
                            <i class="fa-solid fa-trash-can"></i>
                            <span>Clear History</span>
                        </div>
                    </div>
                    <div class="et-header-btn et-close-btn" id="et-close-btn" title="Close EchoText">
                        <i class="fa-solid fa-xmark"></i>
                    </div>
                </div>
            </div>

            <div class="et-panel-content">
                <div class="et-messages" id="et-messages">
                    <div class="et-messages-inner" id="et-messages-inner"></div>
                </div>
            </div>

            <div class="et-input-bar">
                <div class="et-input-wrap">
                    <textarea class="et-input" id="et-input" placeholder="${inCombine ? `Message all: ${charName}...` : (hasChar ? `Text ${charName}...` : 'Text a character...')}" rows="1"${hasChar ? '' : ' disabled'}></textarea>
                </div>
                <button class="et-send-btn" id="et-send-btn" title="Send message"${hasChar ? '' : ' disabled'}>
                    <i class="fa-solid fa-paper-plane"></i>
                </button>
            </div>
        </div>`;
    }

    function openPanel() {
        if (panelOpen) return;

        const fab = jQuery('#et-fab');
        if (!fab.length) return;

        // Re-check background luminance on every open so that a SillyTavern
        // theme switch made while the panel was closed is picked up immediately.
        applyAdaptiveGlass();

        jQuery('#et-panel').remove();
        // Build the panel HTML into body first (jQuery needs it in the DOM
        // to resolve selectors), then immediately move it into the portal so
        // position:fixed works correctly on iOS (body is position:fixed on
        // mobile viewports in SillyTavern's mobile-styles.css).
        jQuery('body').append(buildPanelHtml());
        const panelEl = document.getElementById('et-panel');
        if (panelEl) {
            const portal = ensurePortal();
            portal.appendChild(panelEl);
        }
        const panel = jQuery('#et-panel');

        if (isMobileDevice()) {
            // Mobile: CSS (mobile-style.css) handles full-screen sizing via inset/width/height.
            // Skip saved panelLeft/panelTop/panelWidth/panelHeight — desktop values are
            // unsuitable for a phone viewport. Use fade-only animation (no scale, which
            // causes compositor jank on iOS).
            panel.css({ opacity: 0 });
            requestAnimationFrame(() => {
                panel.css({ transition: 'opacity 0.22s ease' });
                requestAnimationFrame(() => panel.css({ opacity: 1 }));
            });
        } else {
            // Desktop: restore saved size and position, use spring-scale animation.
            const panelW = settings.panelWidth || 380;
            const panelH = settings.panelHeight || 600;
            const defaultLeft = Math.max(20, window.innerWidth - panelW - 24);
            const defaultTop = Math.max(20, (window.innerHeight - panelH) / 2);

            const startLeft = settings.panelLeft != null
                ? Math.max(0, Math.min(window.innerWidth - panelW, settings.panelLeft))
                : defaultLeft;
            const startTop = settings.panelTop != null
                ? Math.max(0, Math.min(window.innerHeight - 60, settings.panelTop))
                : defaultTop;

            panel.css({ width: panelW + 'px', height: panelH + 'px', left: startLeft + 'px', top: startTop + 'px', opacity: 0, transform: 'scale(0.85)' });

            requestAnimationFrame(() => {
                panel.css({ transition: 'opacity 0.25s ease, transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)' });
                requestAnimationFrame(() => { panel.css({ opacity: 1, transform: 'scale(1)' }); });
            });
        }

        panelOpen = true;
        settings.panelWasOpen = true;
        saveSettings();
        fab.addClass('et-fab-hidden');
        setFabUnreadIndicator(false);
        bindPanelEvents();

        // Group bar: ensure active char is set, then render bar and bind events
        if (groupManager) {
            groupManager.ensureActiveChar();
            groupManager.renderGroupBar(groupManager.getActiveCharKey());
            groupManager.bindGroupBarEvents(switchGroupChar, onCombineModeToggle, triggerManualCombineChar);
            renderGroupUnreadIndicators();
        }

        // Apply character state now that panelOpen = true.
        // This shows/hides overflow menu items, avatar, status row, etc. for whichever
        // character is currently selected — including when the user re-opens the panel
        // with a pinned character (CHAT_CHANGED is suppressed in that case, so without
        // this call the overflow items would remain hidden after every panel rebuild).
        applySelectedCharacterToPanel();

        setTimeout(() => { if (!isMobileDevice()) jQuery('#et-input').focus(); }, 300);
    }

    function closePanel() {
        if (!panelOpen) return;

        // Remove visualViewport resize/scroll listeners that were attached in
        // bindPanelEvents() to keep the panel above the iOS on-screen keyboard.
        const _panelEl = document.getElementById('et-panel');
        if (_panelEl && typeof _panelEl._vvCleanup === 'function') {
            _panelEl._vvCleanup();
            _panelEl._vvCleanup = null;
        }

        closeCharacterPicker();

        // Close any open emoji overlays
        jQuery('.et-react-overlay').remove();

        // Remove document event listeners
        jQuery(document).off('click.et-react');
        jQuery(document).off('click.et-overflow');
        jQuery('#et-overflow-menu').removeClass('et-overflow-menu-open');

        const panel = jQuery('#et-panel');
        const fab = jQuery('#et-fab');

        panel.css({ transition: 'opacity 0.2s ease, transform 0.2s ease', opacity: 0, transform: 'scale(0.85)' });
        setTimeout(() => {
            panel.remove();
            panelOpen = false;
            settings.panelWasOpen = false;
            saveSettings();
            fab.removeClass('et-fab-hidden');
        }, 220);
    }

    function showNoCharacterMessage() {
        openEmbeddedCharacterPicker();
    }



    function bindPanelEvents() {
        makePanelDraggable();
        makePanelResizable();

        jQuery('#et-close-btn').on('click', closePanel);

        // ── Overflow menu (three-dot) ──────────────────────────────
        jQuery('#et-overflow-btn').on('click', function (e) {
            e.stopPropagation();
            const menu = jQuery('#et-overflow-menu');
            const isOpen = menu.hasClass('et-overflow-menu-open');
            menu.toggleClass('et-overflow-menu-open', !isOpen);
        });

        function closeOverflowMenu() {
            jQuery('#et-overflow-menu').removeClass('et-overflow-menu-open');
        }

        // Two-click inline confirmation for Clear History (no modal)
        let clearHistoryConfirmPending = false;
        let clearHistoryConfirmTimer = null;

        jQuery('#et-overflow-clear').on('click', (e) => {
            e.stopPropagation();

            if (clearHistoryConfirmPending) {
                // Second click: execute the clear
                clearTimeout(clearHistoryConfirmTimer);
                clearHistoryConfirmTimer = null;
                clearHistoryConfirmPending = false;

                // Reset button UI back to its default state
                const item = jQuery('#et-overflow-clear');
                item.find('i').attr('class', 'fa-solid fa-trash-can');
                item.find('span').text('Clear History');
                item.removeClass('et-overflow-item-confirm');

                if (!isTetheredMode() && untetheredChat) {
                    untetheredChat.resetUntetheredChat();
                }
                clearChatHistory();
                renderMessages([]);
                updatePanelStatusRow();
                closeOverflowMenu();
            } else {
                // First click: enter confirm state
                clearHistoryConfirmPending = true;
                const item = jQuery('#et-overflow-clear');
                item.find('i').attr('class', 'fa-solid fa-triangle-exclamation');
                item.find('span').text('Tap Again to Confirm');
                item.addClass('et-overflow-item-confirm');

                clearHistoryConfirmTimer = setTimeout(() => {
                    clearHistoryConfirmPending = false;
                    item.find('i').attr('class', 'fa-solid fa-trash-can');
                    item.find('span').text('Clear History');
                    item.removeClass('et-overflow-item-confirm');
                }, 3000);
            }
        });

        jQuery('#et-overflow-saveload').on('click', (e) => {
            e.stopPropagation();
            closeOverflowMenu();
            openSaveLoadModal();
        });

        jQuery('#et-overflow-settings').on('click', (e) => {
            e.stopPropagation();
            closeOverflowMenu();
            settingsModal.openSettingsModal();
            moveModalToPortal('.et-settings-modal');
        });

        jQuery('#et-overflow-gallery').on('click', (e) => {
            e.stopPropagation();
            closeOverflowMenu();
            if (gallery) gallery.openGalleryModal();
            moveModalToPortal('.et-gallery-overlay');
        });

        jQuery('#et-overflow-context').on('click', (e) => {
            e.stopPropagation();
            closeOverflowMenu();
            if (contextOverride) contextOverride.openModal();
            moveModalToPortal('#et-ctx-overlay');
        });

        jQuery(document).on('click.et-overflow', function (e) {
            if (!jQuery(e.target).closest('#et-overflow-btn, #et-overflow-menu').length) {
                closeOverflowMenu();
            }
        });
        // ─────────────────────────────────────────────────────────

        // Character picker: click char name row (includes caret)
        jQuery('#et-char-name').on('click', function (e) {
            e.stopPropagation();
            jQuery('#et-emotion-popup').remove();
            jQuery('#et-uc-popup').remove();
            jQuery(document).off('click.et-emo-popup');
            jQuery(document).off('click.et-uc-outside');
            toggleCharacterPicker();
        });

        // Character picker: click caret also opens picker
        jQuery('#et-panel').on('click', '.et-char-name-caret', function (e) {
            e.stopPropagation();
            jQuery('#et-emotion-popup').remove();
            jQuery('#et-uc-popup').remove();
            jQuery(document).off('click.et-emo-popup');
            jQuery(document).off('click.et-uc-outside');
            toggleCharacterPicker();
        });

        // No-char select button: removed (picker is now embedded inline when no char selected)

        jQuery('#et-panel').on('click', '#et-uc-popup .et-uc-option-btn, #et-uc-popup #et-uc-popup-reset, #et-uc-popup .et-uc-popup-close', () => {
            setTimeout(() => updatePanelStatusRow(), 0);
        });

        jQuery('#et-panel').on('input', '#et-uc-popup #et-uc-mood-influence, #et-uc-popup #et-uc-personality-influence', () => {
            setTimeout(() => updatePanelStatusRow(), 0);
        });

        // Status row opens emotion/chat influence menus (disabled in group sessions)
        jQuery('#et-panel').on('click', '#et-panel-status-trigger', function (e) {
            e.stopPropagation();
            // In group session the status row is informational only — no popup
            if (groupManager && groupManager.isGroupSession()) return;
            closeCharacterPicker();
            if (isTetheredMode()) {
                const emotionEnabled = settings.emotionSystemEnabled !== false;
                if (emotionEnabled) toggleEmotionPopup(this);
            } else {
                toggleUntetheredPopup(this);
            }
        });

        // Initialize status row based on mode/state
        // In group sessions, emotion indicator is always hidden
        const inGroupNow = groupManager && groupManager.isGroupSession();
        const emotionEnabled = settings.emotionSystemEnabled !== false && isTetheredMode() && !inGroupNow;
        jQuery('#et-emotion-indicator').toggleClass('et-emotion-indicator-hidden', !emotionEnabled);
        if (emotionEnabled) updateEmotionIndicator();
        updatePanelStatusRow();

        jQuery('#et-panel').on('click', '#et-mode-toggle-btn', function (e) {
            e.stopPropagation();
            // Disabled in group chat — all tethered/untethered logic is bypassed
            if (groupManager && groupManager.isGroupSession()) return;

            jQuery('#et-emotion-popup').remove();
            jQuery('#et-uc-popup').remove();
            jQuery(document).off('click.et-emo-popup');
            jQuery(document).off('click.et-uc-outside');
            settings.chatMode = isTetheredMode() ? 'untethered' : 'tethered';
            saveSettings();
            startProactiveScheduler();

            const history = getChatHistory();
            renderMessages(history);

            const nextEmotionEnabled = settings.emotionSystemEnabled !== false && isTetheredMode();
            jQuery('#et-emotion-indicator').toggleClass('et-emotion-indicator-hidden', !nextEmotionEnabled);
            if (nextEmotionEnabled) updateEmotionIndicator();
            updatePanelStatusRow();

            const btn = jQuery('#et-mode-toggle-btn');
            const tethered = isTetheredMode();
            btn.toggleClass('et-mode-tethered', tethered).toggleClass('et-mode-untethered', !tethered);
            btn.find('i').attr('class', `fa-solid ${tethered ? 'fa-link' : 'fa-link-slash'}`);
            btn.attr('title', tethered ? 'Tethered: Syncs mood and context with the main chat.' : 'Untethered: Standalone session with no main chat sync.');
            btn.addClass('et-mode-toggle-anim');
            setTimeout(() => btn.removeClass('et-mode-toggle-anim'), 450);

            // Context override is Untethered-only — sync visibility on mode switch
            const hasChar = !!getCurrentCharacter();
            const showCtx = hasChar && !tethered;
            jQuery('#et-overflow-context').toggle(showCtx);
            if (showCtx) updateContextOverrideBadge();

            refreshProactiveInsights();
        });

        jQuery('#et-send-btn').on('click', handleSend);

        jQuery('#et-input').on('keydown', function (e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
            }
        }).on('input', function () {
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight + 2, 92) + 'px';
        });

        // Close emoji overlays when clicking outside
        jQuery(document).on('click.et-react', function (e) {
            if (!jQuery(e.target).closest('.et-react-overlay, .et-react-btn').length) {
                closeAllReactOverlays();
            }
        });

        // Avatar: logo only — no picker on click. Lightbox when a character is selected.
        jQuery('#et-panel').on('click', '#et-char-avatar-wrap', function (e) {
            e.stopPropagation();
            if (getCurrentCharacter()) {
                openAvatarLightbox();
            }
        });

        // Memory highlight click → save modal (or remove modal if already saved)
        jQuery('#et-panel').on('click', '.et-mem-highlight', function (e) {
            e.stopPropagation();
            if (jQuery(this).hasClass('et-mem-highlight-saved')) {
                showMemoryRemoveModal(this);
            } else {
                showMemorySaveModal(this);
            }
        });

        // ── iOS / mobile: keep the panel height in sync with the visual viewport ──
        // When the on-screen keyboard opens, visualViewport.height shrinks. We update
        // the panel height & top so the input bar stays visible above the keyboard.
        if (window.visualViewport && isMobileDevice()) {
            const panelEl = document.getElementById('et-panel');
            if (panelEl) {
                const onVVResize = () => {
                    if (!panelOpen) return;
                    panelEl.style.height = window.visualViewport.height + 'px';
                    panelEl.style.top    = window.visualViewport.offsetTop  + 'px';
                };
                window.visualViewport.addEventListener('resize', onVVResize);
                window.visualViewport.addEventListener('scroll', onVVResize);
                // Store a cleanup callback on the element so closePanel() can
                // remove the listeners when the panel is destroyed.
                panelEl._vvCleanup = () => {
                    window.visualViewport.removeEventListener('resize', onVVResize);
                    window.visualViewport.removeEventListener('scroll', onVVResize);
                };
            }
        }
    }

    function openAvatarLightbox() {
        const avatarUrl = getCharAvatarUrl();
        if (!avatarUrl) return; // Only show lightbox if there is an image

        jQuery('#et-avatar-lightbox').remove();
        const lightbox = jQuery(`
            <div id="et-avatar-lightbox" class="et-avatar-lightbox">
                <img src="${avatarUrl}" class="et-avatar-lightbox-img" />
            </div>
        `);

        jQuery('#et-panel').append(lightbox);

        // Animate in
        requestAnimationFrame(() => lightbox.addClass('et-avatar-lightbox-open'));

        // Close on click anywhere
        lightbox.on('click', function (e) {
            e.stopPropagation();
            lightbox.removeClass('et-avatar-lightbox-open');
            setTimeout(() => lightbox.remove(), 250);
        });
    }

    function handleSend() {
        if (isGenerating) {
            if (abortController) abortController.abort();
            return;
        }

        const input = jQuery('#et-input');
        const text = input.val().trim();

        const char = getCurrentCharacter();
        if (!char) {
            toastr.warning('Please select a character card to start texting.');
            return;
        }

        // Empty send — generate a continuation/response from the last message
        if (!text) {
            const history = getChatHistory();
            if (groupManager && groupManager.isGroupSession() && groupManager.isCombineMode()) {
                generateEchoTextCombined(history);
            } else {
                generateEchoText(history);
            }
            return;
        }

        input.val('').css('height', 'auto');

        // Process user message for emotion analysis
        processMessageEmotion(text, true);

        const history = getChatHistory();
        const userMsg = {
            is_user: true,
            mes: text,
            send_date: Date.now(),
            meta: {
                receipt: {
                    state: 'sent',
                    note: 'Sent'
                }
            }
        };
        // Detect memory-worthy spans in the user's message for manual highlighting
        if (memorySystem && settings.memoryEnabled && settings.memoryAutoExtract) {
            try {
                const candidates = memorySystem.detectHighlightableText(text);
                if (candidates && candidates.length > 0) userMsg.memoryHighlights = candidates;
            } catch (e) { /* ignore detection errors */ }
        }
        const newHistory = [...history, userMsg];
        saveChatHistory(newHistory);
        setFabUnreadIndicator(false);
        if (isTetheredMode()) {
            markProactiveUserActivity(getCharacterKey(), Date.now());
        }
        renderMessages(newHistory);

        // Schedule a probabilistic character reaction — fire-and-forget, independent
        // of the generation pipeline. The timing jitter lands naturally after the
        // "read" receipt and before the typing indicator appears.
        maybeAddCharacterReaction(newHistory.length - 1, text);

        // Route to combined generation when all characters should respond together
        if (groupManager && groupManager.isGroupSession() && groupManager.isCombineMode()) {
            generateEchoTextCombined(newHistory);
        } else {
            generateEchoText(newHistory);
        }
    }

    function updateSendButton(generating) {
        const btn = jQuery('#et-send-btn');
        if (generating) {
            btn.addClass('et-send-stop').attr('title', 'Cancel generation');
            btn.html('<i class="fa-solid fa-stop"></i>');
            updatePanelStatusRow({ typing: true });
        } else {
            btn.removeClass('et-send-stop').attr('title', 'Send message');
            btn.html('<i class="fa-solid fa-paper-plane"></i>');
            updatePanelStatusRow();
        }
    }

    // ============================================================
    // PANEL DRAG & RESIZE
    // ============================================================

    function makePanelDraggable() {
        // Dragging is disabled on mobile — the panel fills the full viewport
        // and is not a floating window. CSS also removes the grab cursor.
        if (isMobileDevice()) return;

        const panel = document.getElementById('et-panel');
        const handle = document.getElementById('et-panel-drag-handle');
        if (!panel || !handle) return;

        let isDragging = false;
        let startX, startY, origLeft, origTop;

        handle.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            if (e.target.closest('.et-header-btn, button, input, select, textarea, #et-char-name, #et-panel-status-trigger')) return;
            isDragging = true;
            startX = e.clientX; startY = e.clientY;
            const rect = panel.getBoundingClientRect();
            origLeft = rect.left; origTop = rect.top;
            panel.style.transition = 'none';
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
            e.preventDefault();
        });

        handle.addEventListener('touchstart', (e) => {
            if (e.target.closest('.et-header-btn, button, input, select, textarea, #et-char-name, #et-panel-status-trigger')) return;
            const t = e.touches[0];
            isDragging = true;
            startX = t.clientX; startY = t.clientY;
            const rect = panel.getBoundingClientRect();
            origLeft = rect.left; origTop = rect.top;
            panel.style.transition = 'none';
        }, { passive: true });

        handle.addEventListener('touchmove', (e) => {
            if (!isDragging) return;
            const t = e.touches[0];
            const dx = t.clientX - startX, dy = t.clientY - startY;
            panel.style.left = Math.max(0, Math.min(window.innerWidth - panel.offsetWidth, origLeft + dx)) + 'px';
            panel.style.top = Math.max(0, Math.min(window.innerHeight - 60, origTop + dy)) + 'px';
        }, { passive: true });

        handle.addEventListener('touchend', () => {
            if (!isDragging) return;
            isDragging = false;
            panel.style.transition = '';
            settings.panelLeft = parseInt(panel.style.left) || 0;
            settings.panelTop = parseInt(panel.style.top) || 0;
            saveSettings();
        });

        function onMove(e) {
            if (!isDragging) return;
            const dx = e.clientX - startX, dy = e.clientY - startY;
            panel.style.left = Math.max(0, Math.min(window.innerWidth - panel.offsetWidth, origLeft + dx)) + 'px';
            panel.style.top = Math.max(0, Math.min(window.innerHeight - 60, origTop + dy)) + 'px';
        }

        function onUp() {
            if (!isDragging) return;
            isDragging = false;
            panel.style.transition = '';
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            settings.panelLeft = parseInt(panel.style.left) || 0;
            settings.panelTop = parseInt(panel.style.top) || 0;
            saveSettings();
        }
    }

    function makePanelResizable() {
        // Resizing is disabled on mobile — the panel is full-screen.
        // Resize handles are also hidden via mobile-style.css.
        if (isMobileDevice()) return;

        const panel = jQuery('#et-panel');
        if (!panel.length) return;

        panel.find('.et-resize-handle').each(function () {
            const handle = this;
            const corner = handle.dataset.corner;
            let active = false;
            let startX, startY, startW, startH, startLeft, startTop;

            handle.addEventListener('mousedown', (e) => {
                active = true;
                startX = e.clientX; startY = e.clientY;
                startW = panel[0].offsetWidth; startH = panel[0].offsetHeight;
                startLeft = parseInt(panel.css('left')) || 0;
                startTop = parseInt(panel.css('top')) || 0;
                e.preventDefault(); e.stopPropagation();
                document.addEventListener('mousemove', onMove);
                document.addEventListener('mouseup', onUp);
            });

            function onMove(e) {
                if (!active) return;
                const dx = e.clientX - startX, dy = e.clientY - startY;
                const MIN_W = 300, MIN_H = 400;
                let newW = startW, newH = startH, newL = startLeft, newT = startTop;

                if (corner === 'se') { newW = Math.max(MIN_W, startW + dx); newH = Math.max(MIN_H, startH + dy); }
                else if (corner === 'sw') { newW = Math.max(MIN_W, startW - dx); newH = Math.max(MIN_H, startH + dy); newL = startLeft + (startW - newW); }
                else if (corner === 'ne') { newW = Math.max(MIN_W, startW + dx); newH = Math.max(MIN_H, startH - dy); newT = startTop + (startH - newH); }
                else if (corner === 'nw') { newW = Math.max(MIN_W, startW - dx); newH = Math.max(MIN_H, startH - dy); newL = startLeft + (startW - newW); newT = startTop + (startH - newH); }

                panel.css({ width: newW + 'px', height: newH + 'px', left: newL + 'px', top: newT + 'px' });
            }

            function onUp() {
                if (!active) return;
                active = false;
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
                settings.panelWidth = parseInt(panel.css('width')) || 380;
                settings.panelHeight = parseInt(panel.css('height')) || 600;
                settings.panelLeft = parseInt(panel.css('left')) || 0;
                settings.panelTop = parseInt(panel.css('top')) || 0;
                saveSettings();
            }
        });
    }

    // ============================================================
    // MESSAGE RENDERING
    // ============================================================

    // Emotion and reaction logic moved to lib/emotion-system.js
    function getEmotionState() {
        return emotionSystem ? emotionSystem.getEmotionState() : null;
    }

    function clearEmotionState() {
        if (emotionSystem) emotionSystem.clearEmotionState();
    }

    function buildEmotionContext() {
        return emotionSystem ? emotionSystem.buildEmotionContext() : '';
    }

    function processMessageEmotion(text, isUser) {
        if (emotionSystem) emotionSystem.processMessageEmotion(text, isUser);
        if (panelOpen && isTetheredMode()) updatePanelStatusRow();
    }

    function applyReactionToEmotions(reactionId, direction = 1) {
        if (emotionSystem) emotionSystem.applyReactionToEmotions(reactionId, direction);
        if (panelOpen && isTetheredMode()) updatePanelStatusRow();
    }

    // Thin wrapper — delegates to emotion-system.js
    function selectCharacterReaction(userMessageText) {
        if (!emotionSystem) return null;
        return emotionSystem.selectCharacterReaction(userMessageText);
    }

    // ============================================================
    // AI CHARACTER REACTIONS TO USER MESSAGES
    // ============================================================

    /**
     * Schedules a probabilistic emoji reaction from the character to the user's
     * most-recently-sent message. Called fire-and-forget from handleSend() so it
     * runs entirely outside the generation pipeline.
     *
     * Timing: reaction arrives ~readDelayMs + 1200-4500ms after message send,
     * which means it lands naturally after the "read" receipt ticks but before
     * (or shortly after) the typing indicator appears — exactly when a real person
     * would tap a react emoji after reading.
     *
     * @param {number} userMsgIndex - index of the user message in chat history
     * @param {string} userText     - raw text of the user's message
     */
    function maybeAddCharacterReaction(userMsgIndex, userText) {
        if (settings.emotionSystemEnabled === false) return;
        if (!emotionSystem) return;

        // selectCharacterReaction performs the dry-run delta analysis and returns
        // { reactionId, probability, magnitude } or null if nothing fits.
        const candidate = selectCharacterReaction(userText);
        if (!candidate) return;

        // Probability roll — personality and impact weighted
        if (Math.random() >= candidate.probability) return;

        // Jitter delay: mirrors the "read" timing so the reaction feels organic.
        // The character has "read" the message (readDelayMs) and then takes an
        // additional moment (1200–4500ms) before tapping react — just like iMessage.
        const timing = getEmotionReplyTimingModel();
        const baseDelay  = timing.readDelayMs;
        const jitterMs   = Math.round(1200 + Math.random() * 3300);
        const totalDelay = baseDelay + jitterMs;

        setTimeout(() => {
            // Guard: bail if the panel was closed or the history has changed underneath us
            if (!panelOpen) return;
            if (settings.emotionSystemEnabled === false) return;
            const history = getChatHistory();
            if (!history[userMsgIndex] || !history[userMsgIndex].is_user) return;

            addCharacterReaction(userMsgIndex, candidate.reactionId);
        }, totalDelay);
    }

    /**
     * Stores the character's emoji reaction on the user message object and
     * updates the DOM in-place. The character can only hold one reaction per
     * user message (same as how real iMessage reacts work — one reaction per
     * sender per message).
     *
     * @param {number} msgIndex   - index of the user message in chat history
     * @param {string} reactionId - FA_REACTIONS id (heart, haha, wow, etc.)
     */
    function addCharacterReaction(msgIndex, reactionId) {
        const reactDef = FA_REACTIONS.find(r => r.id === reactionId);
        if (!reactDef) return;

        const history = getChatHistory();
        const msg = history[msgIndex];
        if (!msg || !msg.is_user) return;

        // Toggle off if the same reaction exists (character changed their mind)
        if (msg.charReaction === reactionId) {
            delete msg.charReaction;
        } else {
            msg.charReaction = reactionId;
        }

        saveChatHistory(history);
        renderCharacterReaction(msgIndex, msg.charReaction || null);
    }

    /**
     * Updates the character reaction pill under a user bubble in the DOM.
     * Called both during initial render (for persisted reactions) and live
     * when a new reaction is added/removed.
     *
     * @param {number}      msgIndex   - message index
     * @param {string|null} reactionId - FA_REACTIONS id, or null to clear
     */
    function renderCharacterReaction(msgIndex, reactionId) {
        const container = jQuery(`#et-char-reaction-${msgIndex}`);
        if (!container.length) return;

        container.empty();
        if (!reactionId) return;

        const reactDef = FA_REACTIONS.find(r => r.id === reactionId);
        if (!reactDef) return;

        const pill = jQuery(`
            <div class="et-char-reaction-pill et-reaction-new" style="--react-color:${reactDef.color}" title="${reactDef.label}">
                <i class="${reactDef.icon} et-char-reaction-icon"></i>
            </div>
        `);
        container.append(pill);

        // Remove the pop-in animation class after it plays so it doesn't replay on DOM mutations
        setTimeout(() => pill.removeClass('et-reaction-new'), 450);
    }

    function updateEmotionIndicator() {
        if (emotionSystem) emotionSystem.updateEmotionIndicator();
        if (panelOpen && isTetheredMode()) updatePanelStatusRow();
    }

    function toggleEmotionPopup(targetEl) {
        jQuery('#et-uc-popup').remove();
        jQuery(document).off('click.et-uc-outside');
        if (emotionSystem) emotionSystem.toggleEmotionPopup(targetEl);

        const popup = jQuery('#et-emotion-popup');
        const panel = jQuery('#et-panel');
        if (popup.length && panel.length) {
            const panelEl = panel[0];
            const popupHeight = popup.outerHeight() || 420;
            const popupWidth = popup.outerWidth() || 320;
            const top = Math.max(12, Math.round((panelEl.clientHeight - popupHeight) / 2));
            const left = Math.max(8, Math.round((panelEl.clientWidth - popupWidth) / 2));
            popup.css({ top: `${top}px`, left: `${left}px` });
        }
    }

    function convertEmoticonsToEmojis(text) {
        if (!text) return text;

        const emoticonsMap = {
            '😂': ["':-)", "':)", ':"D', ":'-)", ":')"],
            '😁': [":-))", ": ))"],
            '😃': [":-D", ":D", "8-D", "8D", "=D", "B^D", "c:", "C:"],
            '😆': ["x-D", "xD", "X-D", "XD"],
            '🙂': [":-)", ":)", ":-]", ":]", ":->", ":>", "8-)", "8)", ":-}", "}", ":^)", "=]", "=)"],
            '😢': [":'-(", ":'(", ":=("],
            '😧': ["D-':", "D:<", "D:", "D8", "D;", "D=", "DX"],
            '😠': [">:(", ">:["],
            '🤢': [":-###..", ":###.."],
            '☠️': ["8-X", "8=X", "x-3", "x=3"],
            '😈': [">:-)", ">:)", "}:-)", "}:)", "3:-)", "3:)", ">;-)", ">;)", ">;3", ">:3"],
            '😞': [":-(", ":(", ":-c", ":c", ":-<", ":<", ":-[", ":[", ":-||", ":{", ":@", ";("],
            '😺': [":-3", ":3", "=3", "x3", "X3"],
            '😛': [":-P", ":P", "X-P", "XP", "x-p", "xp", ":-p", ":p", ":-Þ", ":Þ", ":-þ", ":þ", ":-b", ":b", "d:", "=p", ">:b"],
            '😉': [";-)", ";)", "*-)", "*)", ";-]", ";]", ";^)", ";>", ":-,", ";D", ";3"],
            '😘': [":-*", ":*", ":x"],
            '😼': [":-J"],
            '😮': [":-O", ":O", ":-o", ":o", ":-0", ":0", "8-0", ">:O", "=O", "=o", "=0"],
            '🤨': ["',:-|", "',:-l"],
            '😕': [":-/", ":/", "',:^I", ">:\\", ">:/", ":\\", "=/", "=\\", ":L", "=L", ":S"],
            '😐': [":-|", ":|"],
            '😳': [":$", "://)", "://3"],
            '🤐': [":-X", ":X", ":-#", ":#", ":-&", ":&"],
            '😎': ["|;-)", "|-O", "B-)"],
            '😵': ["#-)"],
            '🥴': ["%-)", "%)"],
            '😬': [":E"],
            '😇': ["O:-)", "O:)", "0:-3", "0:3", "0:-)", "0:)", "0;^)"],
            '🤡': ["<:-|"], // Dumb, dunce-like
            '🐔': ["~:>"]
        };

        const replacements = [];
        for (const [emoji, codes] of Object.entries(emoticonsMap)) {
            for (const code of codes) replacements.push({ code, emoji });
        }
        replacements.sort((a, b) => b.code.length - a.code.length);

        const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        let result = text;
        for (const { code, emoji } of replacements) {
            const regex = new RegExp(`(?<=^|\\s)${escapeRegExp(code)}(?=\\s|$)`, 'g');
            result = result.replace(regex, emoji);
        }

        return result;
    }

    function formatMessageText(rawText) {
        const { DOMPurify } = SillyTavern.libs;
        let raw = rawText || '';

        // Convert text emoticons to visual emojis
        raw = convertEmoticonsToEmojis(raw);

        // Step 1: Apply inline markdown on raw text (before any HTML sanitization)
        // so that \n characters are still intact for paragraph splitting.
        let formatted = raw
            .replace(/\*\*\*(.*?)\*\*\*/gs, '<strong><em>$1</em></strong>')
            .replace(/\*\*(.*?)\*\*/gs, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/gs, '<em>$1</em>')
            .replace(/__(.*?)__/gs, '<u>$1</u>')
            .replace(/_(.*?)_/gs, '<em>$1</em>')
            .replace(/~~(.*?)~~/gs, '<del>$1</del>')
            .replace(/`(.+?)`/g, '<code>$1</code>');

        // Step 2: Split into paragraphs. LLMs use single \n for paragraph breaks
        // in chat contexts, so treat every \n as a paragraph separator.
        const lines = formatted.split(/\n/);
        const html = lines
            .map(line => `<p>${line}</p>`)
            .join('');

        // Step 3: Sanitize the final HTML (now allowing <p> so paragraph tags survive)
        return DOMPurify.sanitize(html, {
            ALLOWED_TAGS: ['p', 'strong', 'em', 'del', 'code', 'br', 'u'],
            ALLOWED_ATTR: []
        });
    }

    function buildImageAttachmentHtml(msg, index) {
        const attachment = msg?.imageAttachment;
        if (!attachment || attachment.type !== 'image') return '';

        if (attachment.status === 'error') {
            return `<div class="et-image-attachment et-image-attachment-error"><div class="et-image-error"><i class="fa-solid fa-triangle-exclamation"></i><span>${attachment.error || 'Sorry, I could not generate an image right now.'}</span></div></div>`;
        }

        if (attachment.status !== 'ready' || !attachment.url) {
            return `<div class="et-image-attachment et-image-attachment-loading"><div class="et-image-gen-indicator"><div class="et-image-gen-ring"><svg viewBox="0 0 36 36" class="et-image-gen-svg"><circle class="et-image-gen-track" cx="18" cy="18" r="14" fill="none" stroke-width="2.5"/><circle class="et-image-gen-arc" cx="18" cy="18" r="14" fill="none" stroke-width="2.5" stroke-dasharray="22 66" stroke-linecap="round"/></svg><i class="fa-solid fa-camera et-image-gen-icon"></i></div><span class="et-image-gen-label">Generating image…</span></div></div>`;
        }

        return `<div class="et-image-attachment et-image-attachment-ready" data-image-index="${index}"><img src="${attachment.url}" alt="Generated image" class="et-generated-image"><div class="et-image-attachment-meta"><i class="fa-solid fa-expand"></i><span>Tap to enlarge</span></div></div>`;
    }

    function openGeneratedImageLightbox(imageUrl, promptText, options) {
        if (!imageUrl) return;
        jQuery('#et-generated-image-lightbox').remove();
        const titleText = String(options?.title || '').trim();

        // Navigation context — provided when caller has multiple images to step through
        const navItems = Array.isArray(options?.navItems) && options.navItems.length > 1 ? options.navItems : null;
        let currentNavIndex = navItems
            ? Math.max(0, Math.min(Number(options?.navIndex) || 0, navItems.length - 1))
            : 0;

        // Read persisted accordion state (default: open)
        let promptOpen = true;
        try { promptOpen = localStorage.getItem('et_lightbox_prompt_open') !== 'false'; } catch (e) {}

        const safePrompt = String(promptText || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const safeTitle = titleText ? String(titleText).replace(/</g, '&lt;').replace(/>/g, '&gt;') : '';

        // Prompt panel — always rendered so navigateTo can update it in-place;
        // hidden via class when the current item has no prompt.
        const promptPanelClass = `et-lightbox-prompt-panel${safePrompt ? (promptOpen ? ' et-lightbox-prompt-open' : '') : ' et-lightbox-prompt-hidden'}`;
        const promptHtml = `
            <div class="${promptPanelClass}">
                <button class="et-lightbox-prompt-toggle" title="${promptOpen ? 'Hide prompt' : 'Show prompt'}">
                    <i class="fa-solid fa-wand-magic-sparkles"></i>
                    <span>Image Prompt</span>
                    <i class="fa-solid fa-chevron-down et-lightbox-prompt-chevron"></i>
                </button>
                <div class="et-lightbox-prompt-body">
                    <p class="et-lightbox-prompt-text">${safePrompt}</p>
                </div>
            </div>`;

        const navHtml = navItems ? `
                    <button class="et-lightbox-nav et-lightbox-nav-prev" title="Previous image" aria-label="Previous image"${currentNavIndex === 0 ? ' disabled' : ''}><i class="fa-solid fa-chevron-left"></i></button>
                    <button class="et-lightbox-nav et-lightbox-nav-next" title="Next image" aria-label="Next image"${currentNavIndex === navItems.length - 1 ? ' disabled' : ''}><i class="fa-solid fa-chevron-right"></i></button>` : '';

        const counterHtml = navItems
            ? `<span class="et-lightbox-nav-counter">${currentNavIndex + 1} / ${navItems.length}</span>`
            : '';

        const lightbox = jQuery(`
            <div id="et-generated-image-lightbox" class="et-generated-image-lightbox-overlay">
                <div class="et-lightbox-container">
                    <button class="et-lightbox-close" title="Close"><i class="fa-solid fa-xmark"></i></button>
                    ${counterHtml}
                    <div class="et-lightbox-img-wrap">
                        <img src="${imageUrl}" class="et-lightbox-img" alt="Generated image" />
                        ${navHtml}
                    </div>
                    <div class="et-lightbox-title-bar${safeTitle ? '' : ' et-lightbox-title-bar-hidden'}"><i class="fa-regular fa-image"></i><span>${safeTitle}</span></div>
                    ${promptHtml}
                </div>
            </div>
        `);

        // On mobile the panel lives inside the portal on <html>, so anything
        // appended to <body> renders behind it. Append the lightbox to the
        // portal directly so it stacks above the panel.
        (isMobileDevice() ? jQuery(ensurePortal()) : jQuery('body')).append(lightbox);
        requestAnimationFrame(() => lightbox.addClass('et-generated-image-lightbox-open'));

        // ── Navigation ────────────────────────────────────────────────────────
        function navigateTo(idx) {
            if (!navItems) return;
            const clamped = Math.max(0, Math.min(idx, navItems.length - 1));
            if (clamped === currentNavIndex) return;
            const dir = idx > currentNavIndex ? 'fwd' : 'bck';
            currentNavIndex = clamped;
            const item = navItems[currentNavIndex];

            const wrap = lightbox.find('.et-lightbox-img-wrap');
            const img = lightbox.find('.et-lightbox-img');
            wrap.attr('data-nav-dir', dir);
            img.addClass('et-lightbox-img-nav-fade');
            setTimeout(() => {
                img.attr('src', item.url)
                   .removeClass('et-lightbox-img-nav-fade')
                   .addClass('et-lightbox-img-nav-in');
                setTimeout(() => img.removeClass('et-lightbox-img-nav-in'), 300);

                lightbox.find('.et-lightbox-nav-counter').text(`${currentNavIndex + 1} / ${navItems.length}`);

                const titleBar = lightbox.find('.et-lightbox-title-bar');
                if (item.title) {
                    titleBar.removeClass('et-lightbox-title-bar-hidden').find('span').text(item.title);
                } else {
                    titleBar.addClass('et-lightbox-title-bar-hidden');
                }

                const promptPanel = lightbox.find('.et-lightbox-prompt-panel');
                if (item.prompt) {
                    promptPanel.removeClass('et-lightbox-prompt-hidden');
                    promptPanel.find('.et-lightbox-prompt-text').text(item.prompt);
                } else {
                    promptPanel.addClass('et-lightbox-prompt-hidden');
                }

                lightbox.find('.et-lightbox-nav-prev').prop('disabled', currentNavIndex === 0);
                lightbox.find('.et-lightbox-nav-next').prop('disabled', currentNavIndex === navItems.length - 1);
            }, 150);
        }

        if (navItems) {
            lightbox.find('.et-lightbox-nav-prev').on('click', function (e) {
                e.stopPropagation();
                navigateTo(currentNavIndex - 1);
            });
            lightbox.find('.et-lightbox-nav-next').on('click', function (e) {
                e.stopPropagation();
                navigateTo(currentNavIndex + 1);
            });
        }

        // Accordion toggle
        lightbox.find('.et-lightbox-prompt-toggle').on('click', function (e) {
            e.stopPropagation();
            const panel = lightbox.find('.et-lightbox-prompt-panel');
            const isOpen = panel.hasClass('et-lightbox-prompt-open');
            panel.toggleClass('et-lightbox-prompt-open', !isOpen);
            lightbox.find('.et-lightbox-prompt-toggle').attr('title', isOpen ? 'Show prompt' : 'Hide prompt');
            try { localStorage.setItem('et_lightbox_prompt_open', String(!isOpen)); } catch (e) {}
        });

        // ── Close helpers ─────────────────────────────────────────────────────
        function closeLightbox() {
            lightbox.removeClass('et-generated-image-lightbox-open');
            setTimeout(() => lightbox.remove(), 280);
            jQuery(document).off('keydown', keyHandler);
        }

        // Close on click anywhere outside the prompt, title bar, or nav buttons
        const closeHandler = (e) => {
            const $t = jQuery(e.target);
            if ($t.closest('.et-lightbox-prompt-panel').length ||
                $t.closest('.et-lightbox-title-bar').length ||
                $t.closest('.et-lightbox-nav').length) return;
            closeLightbox();
        };
        lightbox.on('click', closeHandler);

        // ── Keyboard navigation ───────────────────────────────────────────────
        const keyHandler = (e) => {
            if (e.key === 'Escape') {
                closeLightbox();
            } else if (e.key === 'ArrowLeft') {
                navigateTo(currentNavIndex - 1);
            } else if (e.key === 'ArrowRight') {
                navigateTo(currentNavIndex + 1);
            }
        };
        jQuery(document).on('keydown', keyHandler);

        // ── Touch swipe navigation (mobile) ──────────────────────────────────
        if (navItems) {
            let touchStartX = 0, touchStartY = 0;
            lightbox[0].addEventListener('touchstart', function (e) {
                touchStartX = e.touches[0].clientX;
                touchStartY = e.touches[0].clientY;
            }, { passive: true });
            lightbox[0].addEventListener('touchend', function (e) {
                const dx = e.changedTouches[0].clientX - touchStartX;
                const dy = e.changedTouches[0].clientY - touchStartY;
                if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 45) {
                    if (dx < 0) navigateTo(currentNavIndex + 1); // swipe left → next
                    else        navigateTo(currentNavIndex - 1); // swipe right → prev
                }
            }, { passive: true });
        }
    }

    // Track which delete button is pending 2nd click
    let deleteConfirmIndex = -1;
    let deleteConfirmTimer = null;

    function renderMessages(history, preserveScroll = false) {
        const inner = jQuery('#et-messages-inner');
        if (!inner.length) return;

        const messagesEl = document.getElementById('et-messages');
        const savedScrollTop = (preserveScroll && messagesEl) ? messagesEl.scrollTop : null;

        inner.empty();

        if (!history || history.length === 0) {
            const char = getCurrentCharacter();
            if (!char) { showNoCharacterMessage(); return; }
            inner.html('<div class="et-empty-chat"><i class="fa-regular fa-comment-dots"></i><p>Start a conversation!</p></div>');
            return;
        }

        const { DOMPurify } = SillyTavern.libs;
        const charName = getCharacterName();
        const tethered = isTetheredMode();
        const userName = getUserName();

        const receiptMap = {
            sent: { icon: 'fa-paper-plane', label: 'Sent' },
            delivered: { icon: 'fa-check', label: 'Delivered' },
            read: { icon: 'fa-check-double', label: 'Read' },
            ghosted: { icon: 'fa-eye-slash', label: 'Read, then paused (ghosting)' }
        };

        const buildReceiptHtml = (msg) => {
            const state = String(msg?.meta?.receipt?.state || 'sent');
            const def = receiptMap[state] || receiptMap.sent;
            const tip = DOMPurify.sanitize(msg?.meta?.receipt?.note || def.label, { ALLOWED_TAGS: [] });
            return `<span class="et-read-receipt et-read-receipt-${state}" title="${tip}"><i class="fa-solid ${def.icon}"></i></span>`;
        };

        history.forEach((msg, index) => {
            const isUser = msg.is_user;
            const formattedText = formatMessageText(msg.mes);
            const msgDate = new Date(msg.send_date || Date.now());
            const time = msgDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
            const fullDateToolip = msgDate.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

            let bubbleHtml;
            if (isUser) {
                const safeUserName = DOMPurify.sanitize(userName, { ALLOWED_TAGS: [] });
                bubbleHtml = `
                <div class="et-message et-message-user" data-index="${index}">
                    <div class="et-bubble et-bubble-user">
                        <div class="et-bubble-text">${formattedText}</div>
                        <div class="et-message-footer">
                            <span class="et-message-time" title="${fullDateToolip}">${time}</span>
                            <span class="et-user-name">${safeUserName}</span>
                            ${buildReceiptHtml(msg)}
                            <div class="et-bubble-actions">
                                <button class="et-dots-btn" data-index="${index}" data-is-user="1" title="More options"><i class="fa-solid fa-ellipsis-vertical"></i></button>
                            </div>
                        </div>
                    </div>
                    <div class="et-char-reaction-bar" id="et-char-reaction-${index}"></div>
                </div>`;
            } else {
                // ── Combine mode: each character message may carry its own name + avatar ──
                const inCombineMode = groupManager && groupManager.isGroupSession() && groupManager.isCombineMode();
                const msgSenderName = (inCombineMode && msg.charName) ? msg.charName : charName;
                const safeCharName = DOMPurify.sanitize(msgSenderName, { ALLOWED_TAGS: [] });

                // Avatar — use the specific character's avatar in combine mode
                const showAvatar = settings.showAvatar !== false;
                let avatarHtml = '';
                if (showAvatar) {
                    if (inCombineMode && msg.charKey && groupManager) {
                        const msgChar = groupManager.getGroupMemberByKey(msg.charKey);
                        if (msgChar) {
                            avatarHtml = groupManager.buildAvatarHtmlForChar(
                                msgChar, 'et-bubble-avatar et-bubble-avatar-footer', '', true);
                        } else {
                            avatarHtml = buildAvatarHtml(msgSenderName, 'et-bubble-avatar et-bubble-avatar-footer', '', true);
                        }
                    } else {
                        avatarHtml = buildAvatarHtml(msgSenderName, 'et-bubble-avatar et-bubble-avatar-footer', '', true);
                    }
                }

                // Verbosity indicator
                const charKey = getCharacterKey();
                const verbosity = charKey && settings.verbosityByCharacter ? settings.verbosityByCharacter[charKey] : null;
                const verbosityLabels = { short: '📏', medium: '📋', long: '📜' };
                const verbosityTooltips = {
                    short: 'Short: Concise and direct replies',
                    medium: 'Medium: Standard conversational pace',
                    long: 'Long: Expansive, detailed responses'
                };
                const verbosityBadge = verbosity && verbosity !== 'medium'
                    ? `<span class="et-verbosity-badge" title="${verbosityTooltips[verbosity] || 'Verbosity'}">${verbosityLabels[verbosity] || ''}</span>` : '';

                bubbleHtml = `
                <div class="et-message et-message-char" data-index="${index}">
                    <div class="et-message-body">
                        <div class="et-bubble et-bubble-char">
                            <div class="et-bubble-text">${formattedText}</div>
                            ${buildImageAttachmentHtml(msg, index)}
                            <div class="et-message-footer">
                                <div class="et-char-info-pill${showAvatar ? '' : ' et-pill-no-avatar'}">
                                    ${avatarHtml}
                                    <span class="et-footer-name" title="${safeCharName}">${safeCharName}</span>
                                </div>
                                <span class="et-message-time" title="${fullDateToolip}">${time}</span>
                                ${verbosityBadge}
                                <div class="et-bubble-actions">
                                    <button class="et-react-btn" data-index="${index}" title="React"><i class="fa-regular fa-face-smile"></i></button>
                                    <button class="et-dots-btn" data-index="${index}" data-is-user="0" title="More options"><i class="fa-solid fa-ellipsis-vertical"></i></button>
                                </div>
                            </div>
                        </div>
                        <div class="et-bubble-reactions-bar" id="et-reactions-bar-${index}">
                            <div class="et-active-reactions" id="et-reactions-${index}"></div>
                        </div>
                    </div>
                </div>`;
            }

            inner.append(bubbleHtml);

            // Apply memory highlights to user bubbles
            if (isUser && msg.memoryHighlights && msg.memoryHighlights.length > 0
                    && settings.memoryEnabled && settings.memoryAutoExtract) {
                try { applyMemoryHighlights(inner.children().last(), msg); } catch (e) { /* ignore */ }
            }

            if (!isUser) {
                renderStoredReactions(index, msg);
            }

            // Restore persisted character reactions on user bubbles
            if (isUser && msg.charReaction) {
                renderCharacterReaction(index, msg.charReaction);
            }
        });

        if (showTypingIndicator) {
            const avatarHtml = settings.showAvatar !== false
                ? buildAvatarHtml(charName, 'et-bubble-avatar et-bubble-avatar-footer', '', true)
                : '';
            inner.append(`
                <div class="et-message et-message-char et-message-typing" id="et-typing-indicator-msg">
                    <div class="et-message-body">
                        <div class="et-bubble et-bubble-char et-typing-bubble" title="Character is typing">
                            ${avatarHtml}
                            <div class="et-typing-dots"><span></span><span></span><span></span></div>
                        </div>
                    </div>
                </div>
            `);
        }

        // Bind react buttons
        inner.find('.et-react-btn').on('click', function (e) {
            e.stopPropagation();
            closeAllDotMenus();
            const btn = jQuery(this);
            const msgIndex = parseInt(btn.data('index'));
            toggleReactOverlay(btn, msgIndex);
        });

        inner.find('.et-reaction-pill').on('click', function (e) {
            e.stopPropagation();
            const msgIndex = parseInt(jQuery(this).closest('.et-message-char').data('index'));
            const reactionId = jQuery(this).data('emoji');
            addReaction(msgIndex, reactionId);
        });

        // Bind 3-dot menus
        inner.find('.et-dots-btn').on('click', function (e) {
            e.stopPropagation();
            closeAllReactOverlays();
            const btn = jQuery(this);
            const msgIndex = parseInt(btn.data('index'));
            const isUser = btn.data('is-user') === 1 || btn.data('is-user') === '1';
            toggleDotsMenu(btn, msgIndex, isUser, tethered);
        });

        inner.find('.et-image-attachment-ready').on('click', function (e) {
            e.stopPropagation();
            const idx = parseInt(jQuery(this).data('image-index'), 10);
            const msg = history[idx];
            // Build nav context from all messages with image attachments (in chat order)
            const navItems = history
                .filter(m => m?.imageAttachment?.url)
                .map(m => ({ url: m.imageAttachment.url, prompt: m.imageAttachment.prompt || '' }));
            const currentUrl = msg?.imageAttachment?.url || '';
            const navIndex = navItems.findIndex(x => x.url === currentUrl);
            openGeneratedImageLightbox(
                currentUrl,
                msg?.imageAttachment?.prompt || '',
                { navItems, navIndex: navIndex >= 0 ? navIndex : 0 }
            );
        });

        if (preserveScroll && messagesEl && savedScrollTop !== null) {
            // Restore the scroll position the user was at before the edit re-render
            messagesEl.scrollTop = savedScrollTop;
        } else if (settings.autoScroll) {
            if (messagesEl) {
                // Initial immediate scroll for text/avatars
                messagesEl.scrollTop = messagesEl.scrollHeight;

                // Re-scroll when images (specifically generated images) finish loading
                // so they don't break the auto-scroll flow by pushing text up.
                inner.find('img').on('load', function () {
                    if (settings.autoScroll) {
                        messagesEl.scrollTop = messagesEl.scrollHeight;
                    }
                });
            }
        }
    }

    // ============================================================
    // EMOJI REACTION OVERLAY (iOS-style)
    // ============================================================

    function closeAllReactOverlays() {
        jQuery('.et-react-overlay').each(function () {
            const overlay = jQuery(this);
            overlay.addClass('et-react-overlay-closing');
            setTimeout(() => overlay.remove(), 200);
        });
    }

    // ============================================================
    // 3-DOT BUBBLE MENU
    // ============================================================

    function closeAllDotMenus() {
        jQuery('.et-dots-menu').each(function () {
            const menu = jQuery(this);
            menu.addClass('et-dots-menu-closing');
            setTimeout(() => menu.remove(), 180);
        });
        // Reset any pending delete confirm
        if (deleteConfirmTimer) { clearTimeout(deleteConfirmTimer); deleteConfirmTimer = null; }
        deleteConfirmIndex = -1;
    }

    function toggleDotsMenu(btn, msgIndex, isUser, tethered) {
        const existing = jQuery(`.et-dots-menu[data-for="${msgIndex}"][data-is-user="${isUser ? 1 : 0}"]`);
        if (existing.length) { closeAllDotMenus(); return; }
        closeAllDotMenus();

        // Build menu items
        const items = [];
        if (isUser) {
            items.push({ id: 'edit', icon: 'fa-pen', label: 'Edit', cls: '' });
            items.push({ id: 'copy', icon: 'fa-copy', label: 'Copy', cls: '' });
            items.push({ id: 'regen', icon: 'fa-rotate-right', label: 'Regenerate', cls: '' });
            if (memorySystem && settings.memoryEnabled) {
                items.push({ id: 'add_memory', icon: 'fa-brain', label: 'Add Memory', cls: '' });
            }
            items.push({ id: 'delete', icon: 'fa-trash', label: 'Delete', cls: 'et-dots-item-delete' });
        } else {
            items.push({ id: 'edit', icon: 'fa-pen', label: 'Edit', cls: '' });
            items.push({ id: 'regen', icon: 'fa-rotate-right', label: 'Regenerate', cls: '' });
            items.push({ id: 'verbosity', icon: 'fa-align-left', label: 'Verbosity', cls: 'et-dots-item-submenu' });
            items.push({ id: 'delete', icon: 'fa-trash', label: 'Delete', cls: 'et-dots-item-delete' });
        }

        const itemsHtml = items.map(item => {
            const hasSubmenu = item.id === 'verbosity';
            return `<button class="et-dots-item ${item.cls}" data-action="${item.id}">
                <i class="fa-solid ${item.icon}"></i><span>${item.label}</span>${hasSubmenu ? '<i class="fa-solid fa-chevron-left et-dots-submenu-arrow"></i>' : ''}
            </button>`;
        }).join('');

        const menu = jQuery(`
            <div class="et-dots-menu" data-for="${msgIndex}" data-is-user="${isUser ? 1 : 0}">
                ${itemsHtml}
            </div>
        `);

        jQuery('#et-panel').append(menu);

        // Position relative to button
        const btnRect = btn[0].getBoundingClientRect();
        const panelRect = document.getElementById('et-panel').getBoundingClientRect();
        const menuW = 160;
        const menuH = menu.outerHeight() || 160;

        let left = btnRect.left - panelRect.left - menuW + btnRect.width + 4;
        let top = btnRect.top - panelRect.top - 8;

        left = Math.max(8, Math.min(panelRect.width - menuW - 8, left));

        if (top + menuH > panelRect.height) {
            top = btnRect.bottom - panelRect.top - menuH + 4;
            menu.css('transform-origin', 'bottom right');
        } else {
            menu.css('transform-origin', 'top right');
        }

        top = Math.max(8, top);

        menu.css({ left: left + 'px', top: top + 'px' });
        requestAnimationFrame(() => menu.addClass('et-dots-menu-open'));

        // Close on outside click (once)
        setTimeout(() => {
            jQuery(document).one('click.et-dots-outside', function (e) {
                if (!jQuery(e.target).closest('.et-dots-menu, .et-dots-btn').length) {
                    closeAllDotMenus();
                }
            });
        }, 0);

        // Bind actions
        menu.find('.et-dots-item').on('click', function (e) {
            e.stopPropagation();
            const action = jQuery(this).data('action');
            handleDotsAction(action, msgIndex, isUser, jQuery(this));
        });
    }

    function handleDotsAction(action, msgIndex, isUser, btn) {
        const history = getChatHistory();
        const msg = history[msgIndex];
        if (!msg) return;

        if (action === 'copy') {
            try { navigator.clipboard.writeText(msg.mes); } catch (e) { /* noop */ }
            closeAllDotMenus();
            return;
        }

        if (action === 'delete') {
            if (deleteConfirmIndex === msgIndex) {
                // Second click — execute delete
                clearTimeout(deleteConfirmTimer);
                deleteConfirmTimer = null;
                deleteConfirmIndex = -1;

                // Delete this message and all messages below it (truncate)
                history.splice(msgIndex, history.length - msgIndex);

                saveChatHistory(history);
                closeAllDotMenus();
                renderMessages(history);
            } else {
                // First click — highlight red and change text
                deleteConfirmIndex = msgIndex;
                btn.addClass('et-dots-item-delete-confirm');
                btn.find('span').text('Are You Sure?');

                deleteConfirmTimer = setTimeout(() => {
                    deleteConfirmIndex = -1;
                    btn.removeClass('et-dots-item-delete-confirm');
                    btn.find('span').text('Delete');
                }, 3000);
            }
            return;
        }

        if (action === 'edit') {
            closeAllDotMenus();
            const msgEl = jQuery(`.et-message[data-index="${msgIndex}"]`);
            const bubble = msgEl.find('.et-bubble');
            const textEl = msgEl.find('.et-bubble-text');

            // Already editing?
            if (textEl.attr('contenteditable') === 'true') return;

            // Make bubble-text contenteditable in-place — no layout shift
            const originalHtml = textEl.html();
            const originalMes = msg.mes;

            // Set the content to raw markdown so it's editable and preserved
            textEl.text(originalMes);

            textEl.attr('contenteditable', 'true').addClass('et-editing').focus();

            // Move cursor to end
            const range = document.createRange();
            const sel = window.getSelection();
            range.selectNodeContents(textEl[0]);
            range.collapse(false);
            sel.removeAllRanges();
            sel.addRange(range);

            // Floating save/cancel toolbar below bubble
            const toolbar = jQuery(`
                <div class="et-edit-toolbar">
                    <button class="et-edit-save"><i class="fa-solid fa-check"></i> Save</button>
                    <button class="et-edit-cancel"><i class="fa-solid fa-xmark"></i> Cancel</button>
                </div>
            `);
            bubble.after(toolbar);

            const finishEdit = () => {
                textEl.removeAttr('contenteditable').removeClass('et-editing');
                toolbar.remove();
            };

            toolbar.find('.et-edit-save').on('click', () => {
                // Extract plain text from contenteditable
                const newText = textEl[0].innerText.trim();
                if (!newText) { finishEdit(); renderMessages(history); return; }
                history[msgIndex].mes = newText;
                saveChatHistory(history);
                finishEdit();
                renderMessages(history, true);
            });

            toolbar.find('.et-edit-cancel').on('click', () => {
                finishEdit();
                textEl.html(originalHtml);
            });

            // Also save on Enter (without shift), cancel on Escape
            textEl.on('keydown.edit', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    toolbar.find('.et-edit-save').trigger('click');
                } else if (e.key === 'Escape') {
                    toolbar.find('.et-edit-cancel').trigger('click');
                }
            });
            return;
        }

        if (action === 'verbosity') {
            // Show verbosity submenu
            const charKey = getCharacterKey();
            const currentVerbosity = (charKey && settings.verbosityByCharacter && settings.verbosityByCharacter[charKey]) || 'medium';
            const dotsMenu = jQuery(`.et-dots-menu[data-for="${msgIndex}"]`);

            // Remove any existing verbosity submenu
            jQuery('.et-dots-submenu').remove();

            const options = [
                { id: 'short', label: 'Short', icon: 'fa-compress' },
                { id: 'medium', label: 'Medium', icon: 'fa-align-center' },
                { id: 'long', label: 'Long', icon: 'fa-expand' }
            ];

            const optionsHtml = options.map(o => {
                const selected = o.id === currentVerbosity ? ' et-dots-item-selected' : '';
                const check = o.id === currentVerbosity ? '<i class="fa-solid fa-check et-dots-check"></i>' : '';
                return `<button class="et-dots-item${selected}" data-verbosity="${o.id}">
                    <i class="fa-solid ${o.icon}"></i><span>${o.label}</span>${check}
                </button>`;
            }).join('');

            const submenu = jQuery(`<div class="et-dots-menu et-dots-submenu">${optionsHtml}</div>`);
            jQuery('#et-panel').append(submenu);

            // Position submenu to the left of the main menu
            const menuEl = dotsMenu[0];
            const panelRect = document.getElementById('et-panel').getBoundingClientRect();
            if (menuEl) {
                const subMenuH = submenu.outerHeight() || 120;
                const menuRect = menuEl.getBoundingClientRect();

                let subLeft = menuRect.left - panelRect.left - 164;
                let subTop = menuRect.top - panelRect.top;

                subLeft = Math.max(8, subLeft);

                if (subTop + subMenuH > panelRect.height) {
                    subTop = menuRect.bottom - panelRect.top - subMenuH;
                    submenu.css('transform-origin', 'bottom right');
                } else {
                    submenu.css('transform-origin', 'top right');
                }

                subTop = Math.max(8, subTop);

                submenu.css({ left: subLeft + 'px', top: subTop + 'px' });
            }

            requestAnimationFrame(() => submenu.addClass('et-dots-menu-open'));

            submenu.find('.et-dots-item').on('click', function (e) {
                e.stopPropagation();
                const v = jQuery(this).data('verbosity');
                if (!settings.verbosityByCharacter) settings.verbosityByCharacter = {};
                settings.verbosityByCharacter[charKey] = v;
                saveSettings();
                closeAllDotMenus();
                const label = v.charAt(0).toUpperCase() + v.slice(1);
                toastr.info(`Verbosity set to <b>${label}</b> for ${getCharacterName()}.`, '', { timeOut: 2500 });
            });
            return;
        }

        if (action === 'add_memory') {
            closeAllDotMenus();
            showManualMemorySaveModal(msg.mes);
            return;
        }

        if (action === 'regen') {
            closeAllDotMenus();

            const inCombineMode = !!(groupManager && groupManager.isGroupSession() && groupManager.isCombineMode());

            if (isUser) {
                // Re-send: truncate to just before this user message and regenerate all
                const truncated = history.slice(0, msgIndex + 1);
                saveChatHistory(truncated);
                renderMessages(truncated);
                if (inCombineMode) {
                    generateEchoTextCombined(truncated);
                } else {
                    generateEchoText(truncated);
                }
            } else {
                if (inCombineMode) {
                    // ── Combined mode: regenerate only the specific character whose
                    // bubble was clicked, leaving all other characters' responses intact.
                    //
                    // History around the target (e.g. Joi at msgIndex 2):
                    //   [0] user msg
                    //   [1] Amy's response   ← historyBefore
                    //   [2] Joi's response   ← removed (being regenerated)
                    //   [3] Iris's response  ← historyAfter
                    //
                    // We pass historyBefore as the generation context and historyAfter
                    // so the new reply can be stitched back into the correct position.
                    const historyBefore = history.slice(0, msgIndex);
                    const historyAfter  = history.slice(msgIndex + 1);

                    // Show the gap immediately (target message disappears, others stay)
                    const previewHistory = [...historyBefore, ...historyAfter];
                    saveChatHistory(previewHistory);
                    renderMessages(previewHistory);

                    const targetCharKey = history[msgIndex]?.charKey
                        || groupManager.getActiveCharKey();
                    generateEchoTextCombinedForChar(historyBefore, historyAfter, targetCharKey);
                } else {
                    // Solo mode: remove message and regenerate normally
                    const truncated = history.slice(0, msgIndex);
                    saveChatHistory(truncated);
                    renderMessages(truncated);
                    generateEchoText(truncated);
                }
            }
            return;
        }
    }

    function toggleReactOverlay(reactBtn, msgIndex) {
        // If overlay already open for this message, close it
        const existing = jQuery(`.et-react-overlay[data-for="${msgIndex}"]`);
        if (existing.length) {
            closeAllReactOverlays();
            return;
        }

        closeAllReactOverlays();

        const emojiHtml = FA_REACTIONS.map(r =>
            `<button class="et-overlay-emoji" data-emoji="${r.id}" data-index="${msgIndex}" title="${r.label}" style="--react-color:${r.color}">
                <i class="${r.icon}"></i>
                <span class="et-overlay-emoji-label">${r.label}</span>
            </button>`
        ).join('');

        const overlay = jQuery(`
            <div class="et-react-overlay" data-for="${msgIndex}">
                <div class="et-react-overlay-inner">
                    ${emojiHtml}
                </div>
            </div>
        `);

        // Position overlay above the react button
        jQuery('#et-panel').append(overlay);

        const btnRect = reactBtn[0].getBoundingClientRect();
        const panelRect = document.getElementById('et-panel').getBoundingClientRect();
        const overlayW = 340;
        const overlayH = 72;

        let left = btnRect.left - panelRect.left - overlayW + btnRect.width;
        let top = btnRect.top - panelRect.top - overlayH - 8;

        // Clamp within panel
        left = Math.max(8, Math.min(panelRect.width - overlayW - 8, left));
        if (top < 8) top = btnRect.top - panelRect.top + btnRect.height + 8;

        overlay.css({ left: left + 'px', top: top + 'px' });

        // Animate in
        requestAnimationFrame(() => {
            overlay.addClass('et-react-overlay-open');
        });

        // Bind emoji clicks
        overlay.find('.et-overlay-emoji').on('click', function (e) {
            e.stopPropagation();
            const emoji = jQuery(this).data('emoji');
            addReaction(msgIndex, emoji);
            closeAllReactOverlays();
        });
    }

    function normalizeReactionStore(reactions) {
        if (!reactions || typeof reactions !== 'object' || Array.isArray(reactions)) return {};
        const normalized = {};
        for (const [reactionId, data] of Object.entries(reactions)) {
            const count = Math.max(0, parseInt(data?.count, 10) || 0);
            if (count <= 0) continue;
            normalized[reactionId] = {
                count,
                mine: data?.mine === true
            };
        }
        return normalized;
    }

    function renderStoredReactions(msgIndex, msg) {
        const container = jQuery(`#et-reactions-${msgIndex}`);
        if (!container.length || msg?.is_user) return;

        container.empty();
        const reactions = normalizeReactionStore(msg?.reactions);
        for (const [reactionId, reactionData] of Object.entries(reactions)) {
            const reactDef = FA_REACTIONS.find(r => r.id === reactionId);
            if (!reactDef) continue;

            const pill = jQuery(`
                <button class="et-reaction-pill${reactionData.mine ? ' et-reaction-mine' : ''}" data-emoji="${reactionId}" title="${reactDef.label}" style="--react-color:${reactDef.color}">
                    <i class="${reactDef.icon} et-reaction-icon"></i>
                    <span class="et-reaction-count">${reactionData.count}</span>
                </button>
            `);
            container.append(pill);
        }

        // Bind clicks for the newly rendered pills
        container.find('.et-reaction-pill').off('click').on('click', function (e) {
            e.stopPropagation();
            const idx = parseInt(jQuery(this).closest('.et-message-char').data('index'));
            const rId = jQuery(this).data('emoji');
            addReaction(idx, rId);
        });
    }

    function addReaction(msgIndex, reactionId) {
        // Look up the reaction definition
        const reactDef = FA_REACTIONS.find(r => r.id === reactionId);
        if (!reactDef) return;

        const history = getChatHistory();
        if (!Array.isArray(history) || !history[msgIndex]) return;

        const msg = history[msgIndex];
        if (!msg || msg.is_user) return;

        msg.reactions = normalizeReactionStore(msg.reactions);
        const current = msg.reactions[reactionId] || { count: 0, mine: false };
        let direction = 0;

        if (current.mine) {
            current.mine = false;
            current.count = Math.max(0, (parseInt(current.count, 10) || 1) - 1);
            direction = -1;
        } else {
            // Check the 3-reaction limit
            const activeMineCount = Object.values(msg.reactions).filter(r => r.mine === true).length;
            if (activeMineCount >= 3) {
                toastr.info('You can only have 3 active reactions per message.');
                return;
            }
            current.mine = true;
            current.count = Math.max(0, parseInt(current.count, 10) || 0) + 1;
            direction = 1;
        }

        if (current.count <= 0) {
            delete msg.reactions[reactionId];
        } else {
            msg.reactions[reactionId] = current;
        }

        if (Object.keys(msg.reactions).length === 0) {
            delete msg.reactions;
        }

        saveChatHistory(history);

        // Update DOM in-place to prevent flicker
        renderStoredReactions(msgIndex, msg);

        // Smoothly scroll the reaction bar into view
        setTimeout(() => {
            const reactionBar = document.getElementById(`et-reactions-bar-${msgIndex}`);
            if (reactionBar) {
                reactionBar.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }, 50);

        if (direction !== 0) {
            applyReactionToEmotions(reactionId, direction);
        }
    }

    // ============================================================
    // CUSTOM DROPDOWN COMPONENT
    // ============================================================

    const FONT_OPTIONS = [
        { value: 'Inter', label: 'Inter', desc: 'Modern, Clean' },
        { value: 'Nunito', label: 'Nunito', desc: 'Friendly, Rounded' },
        { value: 'Poppins', label: 'Poppins', desc: 'Geometric, Bold' },
        { value: 'Lato', label: 'Lato', desc: 'Humanist, Readable' },
        { value: 'Roboto', label: 'Roboto', desc: 'Android, Neutral' },
        { value: 'Source Sans Pro', label: 'Source Sans Pro', desc: 'Adobe, Clean' },
        { value: 'Merriweather', label: 'Merriweather', desc: 'Serif, Elegant' },
        { value: 'Playfair Display', label: 'Playfair Display', desc: 'Serif, Dramatic' }
    ];

    /**
     * Build a custom dropdown HTML.
     * @param {string} id - unique id for the dropdown
     * @param {Array} options - [{value, html, label}]
     * @param {string} currentValue - currently selected value
     */
    function buildCustomDropdown(id, options, currentValue) {
        const selected = options.find(o => o.value === currentValue) || options[0];
        const optionsHtml = options.map(o => `
            <div class="et-dd-option${o.value === currentValue ? ' et-dd-selected' : ''}" data-value="${o.value}">
                ${o.html || `<span>${o.label}</span>`}
            </div>
        `).join('');

        return `
        <div class="et-custom-dropdown" id="${id}" data-value="${currentValue}">
            <div class="et-dd-trigger">
                <div class="et-dd-display">
                    ${selected.html || `<span>${selected.label}</span>`}
                </div>
                <i class="fa-solid fa-chevron-down et-dd-arrow"></i>
            </div>
            <div class="et-dd-menu">
                ${optionsHtml}
            </div>
        </div>`;
    }

    function buildThemeDropdownHtml(currentValue) {
        const options = Object.entries(getAllThemePresets()).map(([key, theme]) => {
            const swatchHtml = (theme.swatches || []).map(c =>
                `<span class="et-dd-swatch" style="background:${c};"></span>`
            ).join('');
            return {
                value: key,
                label: theme.label,
                html: `<div class="et-dd-theme-item">
                    <div class="et-dd-swatches">${swatchHtml}</div>
                    <div class="et-dd-theme-info">
                        <span class="et-dd-theme-label">${theme.label}</span>
                        <span class="et-dd-theme-desc">${theme.description || ''}</span>
                    </div>
                </div>`
            };
        });
        return buildCustomDropdown('et_theme_custom', options, currentValue);
    }

    function buildFontDropdownHtml(currentValue) {
        // Preload all Google Fonts for preview
        const allFonts = FONT_OPTIONS.map(f => f.value.replace(/ /g, '+')).join('|');
        const preloadLink = `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?${FONT_OPTIONS.map(f => `family=${f.value.replace(/ /g, '+')}`).join('&')}&display=swap" id="et-all-fonts-preview">`;

        const options = FONT_OPTIONS.map(f => ({
            value: f.value,
            label: f.label,
            html: `<div class="et-dd-font-item" style="font-family: '${f.value}', sans-serif;">
                <span class="et-dd-font-name">${f.label}</span>
                <span class="et-dd-font-preview">The quick brown fox</span>
            </div>`
        }));

        return preloadLink + buildCustomDropdown('et_font_family_custom', options, currentValue);
    }

    function initCustomDropdowns() {
        // Bind all custom dropdowns in the settings modal
        jQuery(document).on('click.et-dd', '.et-custom-dropdown .et-dd-trigger', function (e) {
            e.stopPropagation();
            const dd = jQuery(this).closest('.et-custom-dropdown');
            const isOpen = dd.hasClass('et-dd-open');

            // Close all other dropdowns
            jQuery('.et-custom-dropdown').not(dd).removeClass('et-dd-open');

            dd.toggleClass('et-dd-open', !isOpen);
        });

        jQuery(document).on('click.et-dd', '.et-custom-dropdown .et-dd-option', function (e) {
            e.stopPropagation();
            const option = jQuery(this);
            const dd = option.closest('.et-custom-dropdown');
            const value = option.data('value');
            const ddId = dd.attr('id');

            // Update selected state
            dd.find('.et-dd-option').removeClass('et-dd-selected');
            option.addClass('et-dd-selected');

            // Update display
            dd.find('.et-dd-display').html(option.html());
            dd.attr('data-value', value);
            dd.removeClass('et-dd-open');

            // Fire change event
            if (ddId === 'et_theme_custom') {
                settings.theme = value;
                updateThemePreview();
                applyAppearanceSettings();
                saveSettings();
            } else if (ddId === 'et_font_family_custom') {
                settings.fontFamily = value;
                applyAppearanceSettings();
                saveSettings();
            }
        });

        // Close dropdowns when clicking outside
        jQuery(document).on('click.et-dd', function (e) {
            if (!jQuery(e.target).closest('.et-custom-dropdown').length) {
                jQuery('.et-custom-dropdown').removeClass('et-dd-open');
            }
        });
    }

    function updateCustomDropdown(ddId, value) {
        const dd = jQuery(`#${ddId}`);
        if (!dd.length) return;
        const option = dd.find(`.et-dd-option[data-value="${value}"]`);
        if (option.length) {
            dd.find('.et-dd-option').removeClass('et-dd-selected');
            option.addClass('et-dd-selected');
            dd.find('.et-dd-display').html(option.html());
            dd.attr('data-value', value);
        }
    }
    // Settings Modal extracted to lib/settings-modal.js


    // ============================================================
    // CONFIRM MODAL
    // ============================================================

    function showConfirmModal(message) {
        return new Promise((resolve) => {
            jQuery('#et-confirm-modal').remove();

            const html = `
            <div id="et-confirm-modal" class="et-confirm-overlay">
                <div class="et-confirm-card">
                    <div class="et-confirm-icon"><i class="fa-solid fa-triangle-exclamation"></i></div>
                    <div class="et-confirm-message">${message}</div>
                    <div class="et-confirm-actions">
                        <button class="et-confirm-btn et-confirm-cancel" id="et-confirm-cancel">Cancel</button>
                        <button class="et-confirm-btn et-confirm-ok" id="et-confirm-ok">Clear</button>
                    </div>
                </div>
            </div>`;

            // Inject into the panel so it stays bounded by the panel's size and border-radius
            const panel = jQuery('#et-panel');
            panel.append(html);
            requestAnimationFrame(() => jQuery('#et-confirm-modal').addClass('et-confirm-visible'));

            const cleanup = (result) => {
                const overlay = jQuery('#et-confirm-modal');
                overlay.removeClass('et-confirm-visible');
                setTimeout(() => overlay.remove(), 200);
                document.removeEventListener('keydown', onKey);
                resolve(result);
            };

            jQuery('#et-confirm-ok').on('click', () => cleanup(true));
            jQuery('#et-confirm-cancel').on('click', () => cleanup(false));
            jQuery('#et-confirm-modal').on('click', function (e) { if (e.target === this) cleanup(false); });

            const onKey = (e) => {
                if (e.key === 'Escape') cleanup(false);
                if (e.key === 'Enter') cleanup(true);
            };
            document.addEventListener('keydown', onKey);
        });
    }

    // ============================================================
    // UNTETHERED CHAT — THIN WRAPPERS
    // ============================================================

    function toggleUntetheredPopup(targetEl) {
        jQuery('#et-emotion-popup').remove();
        jQuery(document).off('click.et-emo-popup');
        if (untetheredChat) untetheredChat.toggleUntetheredPopup(targetEl);
    }

    function buildUntetheredChatContext() {
        if (!untetheredChat) return '';
        return untetheredChat.buildUntetheredChatContext();
    }

    // ============================================================
    // MEMORY SYSTEM — THIN WRAPPERS
    // ============================================================

    function buildInsideJokesContext() {
        if (!memorySystem) return '';
        return memorySystem.buildInsideJokesContext();
    }

    /**
     * Walk all text nodes inside `element`, find the first occurrence of
     * `searchStr`, and wrap it with a styled <mark> tag for memory highlighting.
     */
    function _highlightTextNode(element, searchStr, category, label, style) {
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
        let node;
        while ((node = walker.nextNode())) {
            const idx = node.nodeValue.indexOf(searchStr);
            if (idx === -1) continue;
            const before = node.nodeValue.substring(0, idx);
            const after  = node.nodeValue.substring(idx + searchStr.length);
            const mark   = document.createElement('mark');
            mark.className = `et-mem-highlight et-mem-hl-${style}`;
            mark.dataset.memCategory = category;
            mark.dataset.memLabel    = label;
            mark.dataset.memContent  = searchStr;
            mark.textContent = searchStr;
            const parent = node.parentNode;
            if (before) parent.insertBefore(document.createTextNode(before), node);
            parent.insertBefore(mark, node);
            if (after)  parent.insertBefore(document.createTextNode(after),  node);
            parent.removeChild(node);
            return true; // first occurrence only
        }
        return false;
    }

    /**
     * Apply memory highlight marks to the .et-bubble-text inside `bubbleEl`
     * for the given message's highlight candidates.
     */
    function applyMemoryHighlights(bubbleEl, msg) {
        if (!bubbleEl || !msg.memoryHighlights || !msg.memoryHighlights.length) return;
        const style      = (settings.memoryHighlightStyle || 'underline');
        const bubbleText = bubbleEl.find('.et-bubble-text')[0];
        if (!bubbleText) return;
        msg.memoryHighlights.forEach(function (hl) {
            try { _highlightTextNode(bubbleText, hl.text, hl.category, hl.label, style); } catch (e) { /* ignore */ }
        });
    }

    /**
     * Update the highlight style class on existing marks live (called when the
     * user changes their preferred highlight style in settings).
     */
    function updateMemoryHighlightStyleInPanel(newStyle) {
        const allStyles = ['et-mem-hl-underline', 'et-mem-hl-glow', 'et-mem-hl-shimmer', 'et-mem-hl-border'];
        jQuery('#et-messages-inner .et-mem-highlight').each(function () {
            const el = jQuery(this);
            el.removeClass(allStyles.join(' '));
            el.addClass('et-mem-hl-' + newStyle);
        });
    }

    const _MEM_CATEGORY_LABELS = {
        inside_joke:    'Inside Joke',
        person:         'Important Person',
        hobby:          'Hobby / Interest',
        favorite_thing: 'Favorite Thing',
        shared_moment:  'Shared Moment',
        custom:         'Custom'
    };

    /**
     * Show the "Save as Memory?" glassmorphism modal when a user clicks a
     * highlighted memory span.
     */
    function showMemorySaveModal(el) {
        const $el     = jQuery(el);
        const category = $el.data('mem-category') || 'custom';
        const label    = $el.data('mem-label')    || '';
        const content  = $el.data('mem-content')  || $el.text();

        jQuery('#et-mem-save-modal').remove();
        jQuery('#et-mem-save-modal-overlay').remove();

        const { DOMPurify } = SillyTavern.libs;
        const safeContent   = DOMPurify.sanitize(content, { ALLOWED_TAGS: [] });
        const safeLabelHint = DOMPurify.sanitize(label,   { ALLOWED_TAGS: [] }); // used as placeholder only

        // Pill scope toggle — always defaults to per-character
        const charNameFn = window._etGetCharacterName;
        const charName   = typeof charNameFn === 'function' ? charNameFn() : null;
        const safeCharName = DOMPurify.sanitize(charName || 'Character', { ALLOWED_TAGS: [] });

        const scopePillHtml = `
            <div class="et-mem-scope-pill-wrap">
                <button class="et-mem-scope-seg et-mem-scope-seg-active" data-scope="per-character" type="button">
                    <i class="fa-solid fa-user"></i> ${safeCharName}
                </button>
                <button class="et-mem-scope-seg" data-scope="global" type="button">
                    <i class="fa-solid fa-globe"></i> Global
                </button>
            </div>`;

        const catOptions = Object.entries(_MEM_CATEGORY_LABELS).map(([k, v]) =>
            `<option value="${k}"${k === category ? ' selected' : ''}>${v}</option>`
        ).join('');

        const html = `
        <div id="et-mem-save-modal-overlay" class="et-mem-save-modal-overlay"></div>
        <div id="et-mem-save-modal" class="et-mem-save-modal">
            <div class="et-mem-save-header">
                <i class="fa-solid fa-brain"></i>
                <span>Save as Memory?</span>
            </div>
            <div class="et-mem-save-snippet">${safeContent}</div>
            ${scopePillHtml}
            <div class="et-mem-save-fields">
                <div class="et-select-wrapper">
                    <select class="et-select et-mem-save-category">${catOptions}</select>
                    <i class="fa-solid fa-chevron-down et-select-arrow"></i>
                </div>
                <input type="text" class="et-input-text et-mem-save-label" value="" placeholder="${safeLabelHint || 'Give it a name (optional)'}">
            </div>
            <label class="et-mem-form-pin-row" style="margin:10px 0 4px;">
                <input type="checkbox" class="checkbox et-mem-save-pin">
                <span><i class="fa-solid fa-thumbtack"></i> Pin — always inject this memory</span>
            </label>
            <div class="et-mem-save-actions">
                <button class="et-mem-save-btn et-mem-save-btn-save" id="et-mem-save-confirm" type="button">
                    <i class="fa-solid fa-check"></i> Save Memory
                </button>
                <button class="et-mem-save-btn et-mem-save-btn-dismiss" id="et-mem-save-dismiss" type="button">
                    Dismiss
                </button>
            </div>
        </div>`;

        const panel = jQuery('#et-panel');
        panel.append(html);
        requestAnimationFrame(() => jQuery('#et-mem-save-modal').addClass('et-mem-save-modal-open'));

        // Pill scope toggle
        jQuery('#et-mem-save-modal').on('click', '.et-mem-scope-seg', function () {
            jQuery('#et-mem-save-modal .et-mem-scope-seg').removeClass('et-mem-scope-seg-active');
            jQuery(this).addClass('et-mem-scope-seg-active');
        });

        function closeModal() {
            const modal   = jQuery('#et-mem-save-modal');
            const overlay = jQuery('#et-mem-save-modal-overlay');
            modal.removeClass('et-mem-save-modal-open');
            setTimeout(() => { modal.remove(); overlay.remove(); }, 220);
        }

        jQuery('#et-mem-save-confirm').on('click', function () {
            const cat         = jQuery('#et-mem-save-modal .et-mem-save-category').val();
            const lbl         = jQuery('#et-mem-save-modal .et-mem-save-label').val().trim();
            const pin         = jQuery('#et-mem-save-modal .et-mem-save-pin').is(':checked');
            const chosenScope = jQuery('#et-mem-save-modal .et-mem-scope-seg-active').data('scope') || 'per-character';
            if (memorySystem) {
                const saved = memorySystem.addMemory({ category: cat, label: lbl, content: content, pinned: pin, scope: chosenScope });
                if (saved) {
                    $el.attr('data-mem-id', saved.id).attr('data-mem-scope', chosenScope);
                }
            }
            $el.addClass('et-mem-highlight-saved');
            // Refresh open memory lists
            if (settingsModal && typeof settingsModal.renderMemoryListInto === 'function') {
                settingsModal.renderMemoryListInto('#et_memory_list',       '#et_memory_empty',       '#et_memory_list_label');
                settingsModal.renderMemoryListInto('#et_memory_list_panel', '#et_memory_empty_panel', '#et_memory_list_label_panel');
            }
            toastr.success('Memory saved!');
            closeModal();
        });

        jQuery('#et-mem-save-dismiss').on('click', closeModal);
        jQuery('#et-mem-save-modal-overlay').on('click', closeModal);

        // Escape key
        const onKey = (e) => { if (e.key === 'Escape') { document.removeEventListener('keydown', onKey); closeModal(); } };
        document.addEventListener('keydown', onKey);
    }

    /**
     * Show a small "Remove Memory?" modal when the user re-clicks a saved highlight.
     */
    function showMemoryRemoveModal(el) {
        const $el     = jQuery(el);
        const memId   = $el.attr('data-mem-id') || null;
        const content = $el.data('mem-content') || $el.text();

        jQuery('#et-mem-save-modal').remove();
        jQuery('#et-mem-save-modal-overlay').remove();

        const { DOMPurify } = SillyTavern.libs;
        const safeContent = DOMPurify.sanitize(content, { ALLOWED_TAGS: [] });

        const html = `
        <div id="et-mem-save-modal-overlay" class="et-mem-save-modal-overlay"></div>
        <div id="et-mem-save-modal" class="et-mem-save-modal">
            <div class="et-mem-save-header">
                <i class="fa-solid fa-circle-check" style="color:#4ade80;"></i>
                <span>Memory Saved</span>
            </div>
            <div class="et-mem-save-snippet">${safeContent}</div>
            <div class="et-mem-remove-hint">This phrase is already saved as a memory. Would you like to remove it?</div>
            <div class="et-mem-save-actions">
                <button class="et-mem-save-btn et-mem-save-btn-remove" id="et-mem-remove-confirm" type="button">
                    <i class="fa-solid fa-trash-can"></i> Remove Memory
                </button>
                <button class="et-mem-save-btn et-mem-save-btn-dismiss" id="et-mem-save-dismiss" type="button">
                    Keep It
                </button>
            </div>
        </div>`;

        jQuery('#et-panel').append(html);
        requestAnimationFrame(() => jQuery('#et-mem-save-modal').addClass('et-mem-save-modal-open'));

        function closeModal() {
            const modal   = jQuery('#et-mem-save-modal');
            const overlay = jQuery('#et-mem-save-modal-overlay');
            modal.removeClass('et-mem-save-modal-open');
            setTimeout(() => { modal.remove(); overlay.remove(); }, 220);
        }

        jQuery('#et-mem-remove-confirm').on('click', function () {
            if (memorySystem && memId) {
                memorySystem.deleteMemory(memId);
            }
            $el.removeClass('et-mem-highlight-saved').removeAttr('data-mem-id').removeAttr('data-mem-scope');
            if (settingsModal && typeof settingsModal.renderMemoryListInto === 'function') {
                settingsModal.renderMemoryListInto('#et_memory_list',       '#et_memory_empty',       '#et_memory_list_label');
                settingsModal.renderMemoryListInto('#et_memory_list_panel', '#et_memory_empty_panel', '#et_memory_list_label_panel');
            }
            toastr.success('Memory removed.');
            closeModal();
        });

        jQuery('#et-mem-save-dismiss').on('click', closeModal);
        jQuery('#et-mem-save-modal-overlay').on('click', closeModal);
        const onKey = (e) => { if (e.key === 'Escape') { document.removeEventListener('keydown', onKey); closeModal(); } };
        document.addEventListener('keydown', onKey);
    }

    /**
     * Opens the memory save modal triggered manually from the message dot-menu.
     * Unlike showMemorySaveModal (which operates on a highlight element), this
     * takes the raw message text and lets the user categorise and save it freely.
     * @param {string} messageText - raw user message text
     */
    function showManualMemorySaveModal(messageText) {
        if (!messageText || !messageText.trim()) return;

        jQuery('#et-mem-save-modal').remove();
        jQuery('#et-mem-save-modal-overlay').remove();

        const { DOMPurify } = SillyTavern.libs;
        const content     = messageText.trim();
        // Trim to 300 chars as a sensible default for the editable field
        const snippetText = content.length > 300 ? content.substring(0, 300) : content;

        const charNameFn   = window._etGetCharacterName;
        const charName     = typeof charNameFn === 'function' ? charNameFn() : null;
        const safeCharName = DOMPurify.sanitize(charName || 'Character', { ALLOWED_TAGS: [] });

        const scopePillHtml = `
            <div class="et-mem-scope-pill-wrap">
                <button class="et-mem-scope-seg et-mem-scope-seg-active" data-scope="per-character" type="button">
                    <i class="fa-solid fa-user"></i> ${safeCharName}
                </button>
                <button class="et-mem-scope-seg" data-scope="global" type="button">
                    <i class="fa-solid fa-globe"></i> Global
                </button>
            </div>`;

        const catOptions = Object.entries(_MEM_CATEGORY_LABELS).map(([k, v]) =>
            `<option value="${k}"${k === 'custom' ? ' selected' : ''}>${v}</option>`
        ).join('');

        const html = `
        <div id="et-mem-save-modal-overlay" class="et-mem-save-modal-overlay"></div>
        <div id="et-mem-save-modal" class="et-mem-save-modal">
            <div class="et-mem-save-header">
                <i class="fa-solid fa-brain"></i>
                <span>Add Memory</span>
            </div>
            <textarea id="et-mem-save-content-edit" class="et-mem-save-snippet et-mem-save-snippet-edit" rows="4" spellcheck="false" placeholder="Edit to keep just what matters..."></textarea>
            ${scopePillHtml}
            <div class="et-mem-save-fields">
                <div class="et-select-wrapper">
                    <select class="et-select et-mem-save-category">${catOptions}</select>
                    <i class="fa-solid fa-chevron-down et-select-arrow"></i>
                </div>
                <input type="text" class="et-input-text et-mem-save-label" value="" placeholder="Give it a name (optional)">
            </div>
            <label class="et-mem-form-pin-row" style="margin:10px 0 4px;">
                <input type="checkbox" class="checkbox et-mem-save-pin">
                <span><i class="fa-solid fa-thumbtack"></i> Pin — always inject this memory</span>
            </label>
            <div class="et-mem-save-actions">
                <button class="et-mem-save-btn et-mem-save-btn-save" id="et-mem-save-confirm" type="button">
                    <i class="fa-solid fa-check"></i> Save Memory
                </button>
                <button class="et-mem-save-btn et-mem-save-btn-dismiss" id="et-mem-save-dismiss" type="button">
                    Dismiss
                </button>
            </div>
        </div>`;

        const panel = jQuery('#et-panel');
        panel.append(html);
        // Set textarea value via JS (not innerHTML) to preserve special characters safely
        jQuery('#et-mem-save-content-edit').val(snippetText);
        requestAnimationFrame(() => jQuery('#et-mem-save-modal').addClass('et-mem-save-modal-open'));

        jQuery('#et-mem-save-modal').on('click', '.et-mem-scope-seg', function () {
            jQuery('#et-mem-save-modal .et-mem-scope-seg').removeClass('et-mem-scope-seg-active');
            jQuery(this).addClass('et-mem-scope-seg-active');
        });

        function closeModal() {
            const modal   = jQuery('#et-mem-save-modal');
            const overlay = jQuery('#et-mem-save-modal-overlay');
            modal.removeClass('et-mem-save-modal-open');
            setTimeout(() => { modal.remove(); overlay.remove(); }, 220);
        }

        jQuery('#et-mem-save-confirm').on('click', function () {
            const saveContent = jQuery('#et-mem-save-content-edit').val().trim();
            if (!saveContent) { toastr.warning('Memory content cannot be empty.'); return; }
            const cat         = jQuery('#et-mem-save-modal .et-mem-save-category').val();
            const lbl         = jQuery('#et-mem-save-modal .et-mem-save-label').val().trim();
            const pin         = jQuery('#et-mem-save-modal .et-mem-save-pin').is(':checked');
            const chosenScope = jQuery('#et-mem-save-modal .et-mem-scope-seg-active').data('scope') || 'per-character';
            if (memorySystem) {
                memorySystem.addMemory({ category: cat, label: lbl, content: saveContent, pinned: pin, scope: chosenScope });
            }
            if (settingsModal && typeof settingsModal.renderMemoryListInto === 'function') {
                settingsModal.renderMemoryListInto('#et_memory_list',       '#et_memory_empty',       '#et_memory_list_label');
                settingsModal.renderMemoryListInto('#et_memory_list_panel', '#et_memory_empty_panel', '#et_memory_list_label_panel');
            }
            toastr.success('Memory saved!');
            closeModal();
        });

        jQuery('#et-mem-save-dismiss').on('click', closeModal);
        jQuery('#et-mem-save-modal-overlay').on('click', closeModal);
        const onKey = (e) => { if (e.key === 'Escape') { document.removeEventListener('keydown', onKey); closeModal(); } };
        document.addEventListener('keydown', onKey);
    }

    // ============================================================
    // SAVE/LOAD MODAL — THIN WRAPPERS
    // ============================================================

    function openSaveLoadModal() {
        if (saveLoadModal) saveLoadModal.openSaveLoadModal();
        moveModalToPortal('#et-sl-overlay');
    }

    // ============================================================
    // MASTER TOGGLE
    // ============================================================

    function toggleEchoTextMaster() {
        const fab = jQuery('#et-fab');
        if (settings.enabled) {
            fab.removeClass('et-fab-disabled');
        } else {
            fab.addClass('et-fab-disabled');
            if (panelOpen) closePanel();
        }
    }

    // ============================================================
    // INITIALIZATION
    // ============================================================

    async function initEchoText() {
        log('Initializing EchoText...');

        try {
            const resp = await fetch(`${BASE_URL}/settings.html`);
            if (resp.ok) {
                const html = await resp.text();
                jQuery('#extensions_settings').append(html);
            }
        } catch (err) {
            error('Failed to load settings.html:', err);
        }

        emotionSystem = window.EchoTextEmotionSystem.createEmotionSystem({
            getSettings: () => settings,
            saveSettings,
            getCurrentCharacter,
            getCharacterKey,
            getChatHistory,
            isPanelOpen,
            isTetheredMode,
            findLastUserMessageIndex,
            expandTimeDateMacros,
            baseUrl: BASE_URL,
            onEmotionStateUpdated: ({ dominant, dominantChanged }) => {
                if (!panelOpen || !isTetheredMode()) return;
                updatePanelStatusRow();
                if (dominantChanged) {
                    requestAnimationFrame(() => {
                        const chip = document.querySelector('.et-status-chip-emotion');
                        if (!chip) return;
                        chip.style.setProperty('--dominant-shift-color', dominant.color);
                        chip.classList.remove('et-dominant-shift');
                        void chip.offsetWidth; // force reflow
                        chip.classList.add('et-dominant-shift');
                    });
                }
            }
        });

        untetheredChat = window.EchoTextUntetheredChat.createUntetheredChat({
            getSettings: () => settings,
            saveSettings,
            getCharacterName,
            getCharacterKey,
            onStateChange: () => {
                // Update the untethered status row when influence settings change
                if (panelOpen && !isTetheredMode()) {
                    updatePanelStatusRow();
                }
            }
        });

        settingsModal = window.EchoTextSettingsModal.createSettingsModal({
            getSettings: () => settings,
            saveSettings,
            getThemePresets: () => getAllThemePresets(),
            applySettingsToUI,
            applyAppearanceSettings,
            populateConnectionProfiles,
            fetchOllamaModels,
            fetchMultimodalModels,
            initCustomDropdowns,
            initCustomDropdownPanel,
            toggleEchoTextMaster,
            updateProviderVisibility,
            updateProviderVisibilityPanel,
            updateImageGenerationVisibility,
            getChatHistory,
            renderMessages,
            isPanelOpen,
            refreshProactiveInsights,
            updateProactiveToggleButtons,
            startProactiveScheduler,
            triggerTestProactiveMessage,
            applyActivityMode,
            positionFab,
            buildThemeDropdownHtml,
            buildFontDropdownHtml,
            loadGoogleFont,
            updatePanelStatusRow,
            openThemeEditor: () => { if (themeEditor) themeEditor.openThemeEditor(); moveModalToPortal('#et-theme-editor-overlay'); },
            renderStripTagChips,
            renderCustomPatternRows,
            invalidateStripTagsCache
        });

        themeEditor = window.EchoTextThemeEditor.createThemeEditor({
            getSettings: () => settings,
            saveSettings,
            applyAppearanceSettings,
            // Rebuilds the theme dropdown in all open UI surfaces after custom theme changes.
            refreshThemeDropdown: () => {
                const current = settings.theme;
                jQuery('#et_theme_panel_container').html(buildThemeDropdownHtml(current));
                // Use a scoped selector so we target only the settings modal's dropdown,
                // not the panel-drawer's #et_theme_custom which was just rebuilt above.
                const ddModal = jQuery('.et-settings-modal #et_theme_custom');
                if (ddModal.length) {
                    ddModal.closest('.et-field').html(
                        '<label class="et-field-label"><i class="fa-solid fa-swatchbook"></i> Theme</label>' +
                        buildThemeDropdownHtml(current) +
                        '<button class="et-te-open-btn" id="et-te-open-btn-modal" title="Create and manage custom colour themes">' +
                        '<i class="fa-solid fa-wand-magic-sparkles"></i> Edit Custom Themes</button>'
                    );
                    // Re-bind the button inside the re-rendered field
                    jQuery('.et-settings-modal #et-te-open-btn-modal').on('click', function () {
                        if (themeEditor) themeEditor.openThemeEditor();
                        moveModalToPortal('#et-theme-editor-overlay');
                    });
                }
                updateThemePreview();
            },
            onThemeListChanged: () => {
                // Re-apply in case active theme was mutated
                applyAppearanceSettings();
            }
        });

        memorySystem = window.EchoTextMemorySystem.createMemorySystem({
            getSettings: () => settings,
            saveSettings,
            getCharacterKey,
            isTetheredMode
        });

        // Expose character accessor helpers for the settings-modal memory UI
        window._etGetCharacterKey  = getCharacterKey;
        window._etGetCharacterName = getCharacterName;
        // Expose live highlight style updater for settings-modal delegation
        window._etUpdateMemoryHlStyle = updateMemoryHighlightStyleInPanel;

        saveLoadModal = window.EchoTextSaveLoadModal.createSaveLoadModal({
            getSettings: () => settings,
            saveSettings,
            getCharacterKey,
            getCharacterName,
            isTetheredMode,
            getChatHistory,
            saveChatHistory,
            renderMessages,
            getEmotionState,
            isPanelOpen,
            isGroupSession: () => groupManager ? groupManager.isGroupSession() : false,
            captureGroupSnapshot: () => groupManager ? groupManager.captureGroupSnapshot(settings) : null,
            restoreGroupSnapshot: (snap) => { if (groupManager) groupManager.restoreGroupSnapshot(snap, settings); },
            isCombineMode: () => groupManager ? groupManager.isCombineMode() : false,
            getCurrentGroupId: () => groupManager ? groupManager.getCurrentGroupId() : null,
            // Refreshes the panel status row after an untethered save is loaded,
            // so the mood/personality/style chips reflect the restored influence state.
            onUntetheredRestored: () => { if (panelOpen) updatePanelStatusRow(); }
        });

        imageGeneration = window.EchoTextImageGeneration.createImageGeneration({
            getSettings,
            getCurrentCharacter,
            getCharacterName,
            getCharacterKey,
            getUserName,
            requestSillyTavernImageGeneration,
            requestEchoTextCompletion,
            saveSettings,
            log,
            warn
        });

        characterPicker = window.EchoTextCharacterPicker.createCharacterPicker({
            getSettings: getSettings,
            saveSettings,
            escapeHtml,
            getCharacterKey,
            getGroupManager: () => groupManager,
            applySelectedCharacterToPanel,
            setSelectedCharacterKey: (key) => {
                selectedCharacterKey = key;
                if (key) {
                    settings.lastCharacterKey = key;
                    saveSettings();
                }
            },
            getSelectedCharacterKey: () => selectedCharacterKey,
            isPanelOpen: () => panelOpen,
            isMobileDevice: () => isMobileDevice(),
            renderGroupUnreadIndicators: () => { if (typeof renderGroupUnreadIndicators === 'function') renderGroupUnreadIndicators(); },
            getSwitchGroupCharFn: () => (typeof switchGroupChar === 'function' ? switchGroupChar : null),
            getOnCombineModeToggleFn: () => (typeof onCombineModeToggle === 'function' ? onCombineModeToggle : null),
            getTriggerManualCombineCharFn: () => (typeof triggerManualCombineChar === 'function' ? triggerManualCombineChar : null)
        });

        contextOverride = window.EchoTextContextOverride.createContextOverride({
            getSettings,
            saveSettings,
            getCharacterKey,
            getCharacterName,
            onSave: updateContextOverrideBadge,
        });

        gallery = window.EchoTextGallery.createGallery({
            getSettings,
            saveSettings,
            getCurrentCharacter,
            getCharacterKey,
            getCharacterName,
            getAvatarUrlForCharacter,
            openGeneratedImageLightbox
        });

        groupManager = window.EchoTextGroupManager.createGroupManager({
            getSettings: () => settings,
            saveSettings
        });

        proactiveMessaging = window.EchoTextProactiveMessaging.createProactiveMessaging({
            getSettings: () => settings,
            saveSettings,
            warn,
            isTetheredMode,
            getCurrentCharacter,
            getCharacterKey,
            getChatHistory,
            saveChatHistory,
            renderMessages,
            setTypingIndicatorVisible,
            setFabUnreadIndicator,
            processMessageEmotion,
            getEmotionState,
            findLastUserMessageIndex,
            requestEchoTextCompletion,
            buildApiMessagesFromHistory,
            buildApiMessagesFromHistoryForChar,
            // Exposes image-request detection so proactive messaging can also hide
            // image-triggering user messages from the character's context window.
            detectImageRequest: (msg, hist) => imageGeneration
                ? imageGeneration.detectImageRequest(msg, hist)
                : { triggered: false },
            expandTimeDateMacros,
            replaceMacros,
            isPanelOpen,
            getIsGenerating,
            // Group session helpers for multi-character proactive scheduling
            isGroupSession: () => groupManager ? groupManager.isGroupSession() : false,
            getActiveGroupCharKey: () => groupManager ? groupManager.getActiveCharKey() : null,
            getGroupMemberKeys: () => groupManager ? groupManager.getGroupMemberKeys() : [],
            getGroupMemberByKey: (key) => groupManager ? groupManager.getGroupMemberByKey(key) : null,
            markGroupCharUnread: (key) => {
                if (groupManager && groupManager.markGroupCharUnread) {
                    groupManager.markGroupCharUnread(key);
                    renderGroupUnreadIndicators();
                }
            },
            // Combined mode flag and group-scoped history accessors.
            // These allow the proactive scheduler to read/write the correct
            // history store regardless of session type.
            isCombineMode:        () => groupManager ? groupManager.isCombineMode()          : false,
            getCurrentGroupId:    () => groupManager ? groupManager.getCurrentGroupId()       : null,
            getGroupChatHistory:  (groupId, charKey, untethered) =>
                groupManager ? groupManager.getGroupChatHistory(groupId, charKey, untethered)  : [],
            saveGroupChatHistory: (groupId, charKey, history, untethered) => {
                if (groupManager) groupManager.saveGroupChatHistory(groupId, charKey, history, untethered);
            },
            getCombineHistory:    (groupId, untethered) =>
                groupManager ? groupManager.getCombineHistory(groupId, untethered)             : [],
            saveCombineHistory:   (groupId, history, untethered) => {
                if (groupManager) groupManager.saveCombineHistory(groupId, history, untethered);
            }
        });

        stContextEmotion = window.EchoTextSTContextEmotion.createSTContextEmotion({
            getSettings: () => settings,
            getCurrentCharacter,
            getCharacterKey,
            getChatHistory,
            isTetheredMode,
            apiAnalyzeTextEmotionRaw: (text, isUser) => emotionSystem ? emotionSystem.apiAnalyzeTextEmotionRaw(text, isUser) : null,
            applyEmotionDelta: (deltas, source, reason) => {
                if (emotionSystem) emotionSystem.applyEmotionDelta(deltas, source, reason);
            },
            getEmotionState: () => emotionSystem ? emotionSystem.getEmotionState() : null,
            log,
            warn
        });

        FA_REACTIONS = emotionSystem.FA_REACTIONS;

        loadSettings();

        // Inject mobile-specific stylesheet when running on a touch device.
        // Done AFTER loadSettings() so BASE_URL is guaranteed to be resolved.
        if (isMobileDevice() && !document.getElementById('et-mobile-styles')) {
            const mobileLink = document.createElement('link');
            mobileLink.rel  = 'stylesheet';
            mobileLink.id   = 'et-mobile-styles';
            mobileLink.href = `${BASE_URL}/mobile-style.css${VERSION_QUERY}`;
            document.head.appendChild(mobileLink);
        }

        startProactiveScheduler();

        jQuery('body').append(buildFabHtml());
        positionFab();
        makeFabDraggable();
        setFabUnreadIndicator(false);

        // Ensure the portal exists so the FAB is a sibling of <body>, not a
        // child. This escapes SillyTavern's mobile-styles.css rule:
        //   body { position: fixed; overflow: hidden; }
        // which would otherwise make position:fixed children mis-positioned.
        ensurePortal();
        const fabEl = document.getElementById('et-fab');
        if (fabEl) document.getElementById(ET_PORTAL_ID).appendChild(fabEl);

        jQuery('#et-fab').on('click', function () {
            if (fabDragging) return;
            if (panelOpen) closePanel();
            else openPanel();
        });

        jQuery(document).on('click', '#et-open-settings-btn', () => {
            settingsModal.openSettingsModal();
            moveModalToPortal('.et-settings-modal');
        });

        toggleEchoTextMaster();

        if (settings.enabled && settings.autoOpenOnReload && settings.panelWasOpen !== false) {
            openPanel();
        }

        // Setup a polling mechanism to auto-load the last character since CHAT_CHANGED may never fire
        // if SillyTavern starts without an active chat.
        if (settings.enabled && settings.autoLoadLastCharacter && settings.lastCharacterKey) {
            let loadAttempts = 0;
            const autoLoadInterval = setInterval(() => {
                loadAttempts++;
                const chars = getAllCharactersForPicker();
                if (chars && chars.length > 0) {
                    clearInterval(autoLoadInterval);
                    if (!selectedCharacterKey) {
                        const match = chars.find(c => c.__key === settings.lastCharacterKey);
                        if (match) {
                            selectedCharacterKey = settings.lastCharacterKey;
                            if (panelOpen) {
                                applySelectedCharacterToPanel();
                            }
                        }
                    }
                } else if (loadAttempts > 40) { // Give up after 10 seconds
                    clearInterval(autoLoadInterval);
                }
            }, 250);
        }

        const context = SillyTavern.getContext();
        
        if (stContextEmotion && typeof stContextEmotion.bindSTEvents === 'function') {
            stContextEmotion.bindSTEvents(context);
        }

        _onChatChanged = async () => {
            if (!settings.enabled) return;

            closeCharacterPicker();

            // If EchoText already has an independent character or group selected, don't follow ST's change.
            // This allows the user to have a different character/group open in each app simultaneously.
            if (selectedCharacterKey) return;
            if (groupManager && groupManager.getOverrideGroupId() != null) return;

            // Reset group active char when chat changes so we re-select the first member
            if (groupManager) groupManager.setActiveCharKey(null);
            if (groupManager) groupManager.ensureActiveChar();

            const key = getCharacterKey();
            if (key) syncProactiveStateWithHistory(key, getChatHistory());
            if (panelOpen) {
                applySelectedCharacterToPanel();

                // Re-render group bar (shows for group chats, hidden for solo)
                if (groupManager) {
                    groupManager.renderGroupBar(groupManager.getActiveCharKey());
                    groupManager.bindGroupBarEvents(switchGroupChar, onCombineModeToggle, triggerManualCombineChar);
                }
            }
        };
        context.eventSource.on(context.event_types.CHAT_CHANGED, _onChatChanged);

        // Also listen for GROUP_UPDATED to refresh the bar if membership changes
        if (context.event_types.GROUP_UPDATED) {
            _onGroupUpdated = () => {
                if (panelOpen && groupManager) {
                    groupManager.renderGroupBar(groupManager.getActiveCharKey());
                    groupManager.bindGroupBarEvents(switchGroupChar, onCombineModeToggle, triggerManualCombineChar);
                }
            };
            context.eventSource.on(context.event_types.GROUP_UPDATED, _onGroupUpdated);
        }

        log('EchoText initialized successfully');

        // ── Live ST theme sync ──────────────────────────────────────────────
        // SillyTavern changes theme by calling setProperty() on
        // document.documentElement.style — there is no dedicated event.
        // We observe the 'style' attribute and re-sync whenever the sillytavern
        // preset is active, debounced so burst updates (ST sets ~10 props at once)
        // only trigger a single re-apply.
        let _stThemeSyncTimeout = null;
        new MutationObserver(() => {
            const theme = getAllThemePresets()[settings.theme] || THEME_PRESETS.sillytavern;
            if (theme.primary) return; // explicit ET theme — nothing to sync
            clearTimeout(_stThemeSyncTimeout);
            _stThemeSyncTimeout = setTimeout(() => {
                applySillyTavernThemeColors();
                applyAdaptiveGlass();
            }, 200);
        }).observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
    }

    function destroyEchoText() {
        const context = SillyTavern.getContext();
        if (context && context.eventSource) {
            if (_onChatChanged) {
                context.eventSource.removeListener(context.event_types.CHAT_CHANGED, _onChatChanged);
                _onChatChanged = null;
            }
            if (_onGroupUpdated && context.event_types.GROUP_UPDATED) {
                context.eventSource.removeListener(context.event_types.GROUP_UPDATED, _onGroupUpdated);
                _onGroupUpdated = null;
            }
            if (stContextEmotion && typeof stContextEmotion.unbindSTEvents === 'function') {
                stContextEmotion.unbindSTEvents(context);
            }
        }
        if (proactiveMessaging && typeof proactiveMessaging.stopProactiveScheduler === 'function') {
            proactiveMessaging.stopProactiveScheduler();
        }
        removePortal();
    }

    // Register extension with SillyTavern
    function registerExtension() {
        const context = SillyTavern.getContext();
        if (context && context.extensionSettings) {
            if (!context.extensionSettings.echotext) {
                context.extensionSettings.echotext = {};
            }
        }
        // Clean up event listeners and portal on re-registration / hot-reload
        destroyEchoText();
    }

    // ============================================================
    // ENTRY POINT
    // ============================================================

    // Start using a resilient polling mechanism like Larson
    function startExtension() {
        if (typeof SillyTavern === 'undefined' || !SillyTavern.getContext) {
            setTimeout(startExtension, 500);
            return;
        }
        const context = SillyTavern.getContext();
        if (!context || !context.extensionSettings || !document.getElementById('extensions_settings')) {
            setTimeout(startExtension, 500);
            return;
        }

        try {
            registerExtension();
            initEchoText();
        } catch (error) {
            console.error('[EchoText] Initialization failed:', error);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startExtension);
    } else {
        startExtension();
    }

})();
