// EchoText Extension - A floating text messaging panel for SillyTavern
// Uses SillyTavern.getContext() global pattern (no ES6 imports from ST internals)

(function () {
    'use strict';

    const MODULE_NAME = 'EchoText';
    const EXTENSION_NAME = 'EchoText';

    // Get BASE_URL from script tag
    const scripts = document.querySelectorAll('script[src*="index.js"]');
    let BASE_URL = '';
    for (const script of scripts) {
        if (script.src.includes('EchoText')) {
            BASE_URL = script.src.split('/').slice(0, -1).join('/');
            break;
        }
    }
    if (!BASE_URL) {
        BASE_URL = '/scripts/extensions/third-party/SillyTavern-EchoText';
    }

    function loadEchoTextModule(relativePath, globalKey) {
        if (window[globalKey]) return;
        const xhr = new XMLHttpRequest();
        xhr.open('GET', `${BASE_URL}/${relativePath}`, false);
        xhr.send();
        if (xhr.status < 200 || xhr.status >= 300) {
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

    // ============================================================
    // THEME PRESETS
    // ============================================================

    const THEME_PRESETS = window.EchoTextConfig.THEME_PRESETS;

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
    let FA_REACTIONS = [];

    // ============================================================
    // LOGGING
    // ============================================================

    function log(...args) { console.log(`[${EXTENSION_NAME}]`, ...args); }
    function warn(...args) { /* console.warn(`[${EXTENSION_NAME}]`, ...args); */ }
    function error(...args) { console.error(`[${EXTENSION_NAME}]`, ...args); }

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
        jQuery('#et_source').val(settings.source);
        jQuery('#et_profile_select').val(settings.preset);
        jQuery('#et_ollama_url').val(settings.ollama_url);
        jQuery('#et_openai_preset').val(settings.openai_preset);
        jQuery('#et_openai_url').val(settings.openai_url);
        jQuery('#et_openai_key').val(settings.openai_key);
        jQuery('#et_openai_model').val(settings.openai_model);
        jQuery('#et_anti_refusal').prop('checked', settings.antiRefusal !== false);
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
        jQuery('#et_dynamic_emotion_panel').prop('checked', settings.dynamicEmotionPanel === true);
        jQuery('#et_show_avatar').prop('checked', settings.showAvatar !== false);
        jQuery('#et_emotion_system').prop('checked', settings.emotionSystemEnabled !== false);
        jQuery('#et_fab_size').val(settings.fabSize);
        jQuery('#et_fab_size_val').text(settings.fabSize + 'px');
        jQuery('#et_auto_scroll').prop('checked', settings.autoScroll);
        // Context settings
        jQuery('#et_ctx_description').prop('checked', settings.ctxDescription !== false);
        jQuery('#et_ctx_personality').prop('checked', settings.ctxPersonality !== false);
        jQuery('#et_ctx_scenario').prop('checked', settings.ctxScenario !== false);
        jQuery('#et_ctx_persona').prop('checked', settings.ctxPersona === true);
        jQuery('#et_ctx_world_info').prop('checked', settings.ctxWorldInfo === true);
        jQuery('#et_ctx_st_messages').prop('checked', settings.ctxSTMessages === true);
        jQuery('#et_ctx_st_token_preset').val(settings.ctxSTTokenPreset || 'medium');
        jQuery('#et_ctx_st_token_custom').val(settings.ctxSTTokenBudget || 1200);
        jQuery('#et_ctx_st_token_container').toggle(settings.ctxSTMessages === true);
        jQuery('#et_ctx_st_token_custom_container').toggle((settings.ctxSTTokenPreset || 'medium') === 'custom');
        jQuery('#et_proactive_rate_limit').val(settings.proactiveRateLimitMinutes || 180);
        updateProactiveToggleButtons();

        jQuery('.et-icon-option').removeClass('selected');
        jQuery(`.et-icon-option[data-icon="${settings.fabIcon}"]`).addClass('selected');

        updateProviderVisibility();
        updateThemePreview();
        // Update custom dropdowns
        updateCustomDropdown('et_theme_custom', settings.theme);
        updateCustomDropdown('et_font_family_custom', settings.fontFamily);

        // Also sync to panel accordion settings
        applySettingsToPanel();
    }

    // Apply settings to the panel accordion UI
    function applySettingsToPanel() {
        // General
        jQuery('#et_enabled_panel').prop('checked', settings.enabled);
        jQuery('#et_auto_open_panel').prop('checked', settings.autoOpenOnReload);
        jQuery('#et_auto_scroll_panel').prop('checked', settings.autoScroll);
        jQuery('#et_show_avatar_panel').prop('checked', settings.showAvatar !== false);
        jQuery('#et_emotion_system_panel').prop('checked', settings.emotionSystemEnabled !== false);

        // Generation Engine
        jQuery('#et_source_panel').val(settings.source);
        jQuery('#et_profile_select_panel').val(settings.preset);
        jQuery('#et_ollama_url_panel').val(settings.ollama_url);
        jQuery('#et_openai_preset_panel').val(settings.openai_preset);
        jQuery('#et_openai_url_panel').val(settings.openai_url);
        jQuery('#et_openai_key_panel').val(settings.openai_key);
        jQuery('#et_openai_model_panel').val(settings.openai_model);
        jQuery('#et_anti_refusal_panel').prop('checked', settings.antiRefusal !== false);
        updateProviderVisibilityPanel();

        // Populate connection profiles for panel
        populateConnectionProfilesPanel();

        // Context
        jQuery('#et_ctx_description_panel').prop('checked', settings.ctxDescription !== false);
        jQuery('#et_ctx_personality_panel').prop('checked', settings.ctxPersonality !== false);
        jQuery('#et_ctx_scenario_panel').prop('checked', settings.ctxScenario !== false);
        jQuery('#et_ctx_persona_panel').prop('checked', settings.ctxPersona === true);
        jQuery('#et_ctx_world_info_panel').prop('checked', settings.ctxWorldInfo === true);
        jQuery('#et_ctx_st_messages_panel').prop('checked', settings.ctxSTMessages === true);
        jQuery('#et_ctx_st_token_preset_panel').val(settings.ctxSTTokenPreset || 'medium');
        jQuery('#et_ctx_st_token_custom_panel').val(settings.ctxSTTokenBudget || 1200);
        jQuery('#et_ctx_st_token_container_panel').toggle(settings.ctxSTMessages === true);
        jQuery('#et_ctx_st_token_custom_container_panel').toggle((settings.ctxSTTokenPreset || 'medium') === 'custom');
        jQuery('#et_proactive_rate_limit_panel').val(settings.proactiveRateLimitMinutes || 180);
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
        jQuery('#et_dynamic_emotion_panel_panel').prop('checked', settings.dynamicEmotionPanel === true);

        // Populate theme dropdown
        jQuery('#et_theme_panel_container').html(buildThemeDropdownHtml(settings.theme));
        // Populate font dropdown
        jQuery('#et_font_family_panel_container').html(buildFontDropdownHtml(settings.fontFamily));
        // Initialize custom dropdowns in panel
        initCustomDropdownsPanel();

        // Action Button
        jQuery('#et_fab_size_panel').val(settings.fabSize);
        jQuery('#et_fab_size_val_panel').text(settings.fabSize + 'px');
        initCustomDropdownPanel('et_fab_icon_panel', settings.fabIcon);
    }

    function updateProactiveToggleButtons() {
        const enabled = settings.proactiveMessagingEnabled !== false;

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
        if (source === 'profile') jQuery('#et_profile_settings_panel').show();
        if (source === 'ollama') jQuery('#et_ollama_settings_panel').show();
        if (source === 'openai') jQuery('#et_openai_settings_panel').show();
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

        // Auto-scroll
        jQuery('#et_auto_scroll_panel').off('change.panel').on('change.panel', function () {
            settings.autoScroll = jQuery(this).is(':checked');
            saveSettings();
            // Sync with modal
            jQuery('#et_auto_scroll').prop('checked', settings.autoScroll);
        });

        // Show avatar
        jQuery('#et_show_avatar_panel').off('change.panel').on('change.panel', function () {
            settings.showAvatar = jQuery(this).is(':checked');
            saveSettings();
            // Sync with modal
            jQuery('#et_show_avatar').prop('checked', settings.showAvatar);
            // Update avatar visibility in open panel
            if (panelOpen) {
                jQuery('#et-char-avatar').toggleClass('et-avatar-hidden', !settings.showAvatar);
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
            // Update indicator visibility
            jQuery('#et-emotion-indicator').toggleClass('et-emotion-indicator-hidden', !settings.emotionSystemEnabled);
            jQuery('#et-char-name').toggleClass('et-char-name-clickable', settings.emotionSystemEnabled);
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

        jQuery('#et_ctx_world_info_panel').off('change.panel').on('change.panel', function () {
            settings.ctxWorldInfo = jQuery(this).is(':checked');
            saveSettings();
            // Sync with modal
            jQuery('#et_ctx_world_info').prop('checked', settings.ctxWorldInfo);
        });

        jQuery('#et_ctx_st_messages_panel').off('change.panel').on('change.panel', function () {
            settings.ctxSTMessages = jQuery(this).is(':checked');
            jQuery('#et_ctx_st_token_container_panel').toggle(settings.ctxSTMessages);
            saveSettings();
            // Sync with modal
            jQuery('#et_ctx_st_messages').prop('checked', settings.ctxSTMessages);
            jQuery('#et_ctx_st_token_container').toggle(settings.ctxSTMessages);
        });

        jQuery('#et_ctx_st_token_preset_panel').off('change.panel').on('change.panel', function () {
            const preset = jQuery(this).val();
            settings.ctxSTTokenPreset = preset;
            const budgetMap = { low: 512, medium: 1200, high: 2500 };
            if (preset !== 'custom') settings.ctxSTTokenBudget = budgetMap[preset];
            jQuery('#et_ctx_st_token_custom_container_panel').toggle(preset === 'custom');
            saveSettings();
            // Sync with modal
            jQuery('#et_ctx_st_token_preset').val(preset);
            jQuery('#et_ctx_st_token_custom_container').toggle(preset === 'custom');
        });

        jQuery('#et_ctx_st_token_custom_panel').off('change.panel input.panel').on('change.panel input.panel', function () {
            settings.ctxSTTokenBudget = Math.max(128, parseInt(jQuery(this).val(), 10) || 1200);
            jQuery(this).val(settings.ctxSTTokenBudget);
            saveSettings();
            // Sync with modal
            jQuery('#et_ctx_st_token_custom').val(settings.ctxSTTokenBudget);
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

        // Dynamic Emotion Panel
        jQuery('#et_dynamic_emotion_panel_panel').off('change.panel').on('change.panel', function () {
            settings.dynamicEmotionPanel = jQuery(this).is(':checked');
            applyAppearanceSettings();
            saveSettings();
            jQuery('#et_dynamic_emotion_panel').prop('checked', settings.dynamicEmotionPanel);
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

        jQuery('#et_proactive_rate_limit_panel').off('change.panel input.panel').on('change.panel input.panel', function () {
            const minutes = Math.max(15, Math.min(2880, parseInt(jQuery(this).val(), 10) || 180));
            settings.proactiveRateLimitMinutes = minutes;
            jQuery(this).val(minutes);
            saveSettings();
            jQuery('#et_proactive_rate_limit').val(minutes);
        });

        jQuery('#et_proactive_refresh_panel').off('click.panel').on('click.panel', function () {
            refreshProactiveInsights();
        });

        jQuery('#et_proactive_toggle_panel').off('click.panel').on('click.panel', function () {
            settings.proactiveMessagingEnabled = settings.proactiveMessagingEnabled === false ? true : false;
            saveSettings();
            updateProactiveToggleButtons();
            startProactiveScheduler();
            refreshProactiveInsights();
        });

        jQuery('#et_trigger_message_panel').off('click.panel').on('click.panel', function () {
            triggerTestProactiveMessage();
        });
    }

    function applyAppearanceSettings() {
        const theme = THEME_PRESETS[settings.theme] || THEME_PRESETS.sillytavern;

        if (theme.primary) {
            document.documentElement.style.setProperty('--et-bg', theme.primary);
            document.documentElement.style.setProperty('--et-header-bg', 'rgba(0,0,0,0.3)');
            document.documentElement.style.setProperty('--et-char-bubble-bg', 'rgba(255,255,255,0.08)');
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
        document.documentElement.style.setProperty('--et-line-spacing', (settings.lineSpacing || 1.3).toFixed(2));
        document.documentElement.style.setProperty('--et-paragraph-spacing', (settings.paragraphSpacing || 12) + 'px');

        loadGoogleFont(settings.fontFamily);

        // Dynamic Emotion Panel — toggle class; actual tint is applied by applyEmotionPanelTint()
        const panel = jQuery('#et-panel');
        if (panel.length) {
            panel.toggleClass('et-emotion-active', settings.dynamicEmotionPanel === true);
            if (!settings.dynamicEmotionPanel) {
                document.documentElement.style.removeProperty('--et-emotion-tint');
            }
        }

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
        const theme = THEME_PRESETS[settings.theme] || THEME_PRESETS.sillytavern;
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

    function getUserName() {
        return SillyTavern.getContext().name1 || 'You';
    }

    function isTetheredMode() {
        return settings.chatMode !== 'untethered';
    }

    function buildSystemPrompt() {
        const char = getCurrentCharacter();
        if (!char) return 'You are a helpful assistant. Reply concisely like in a text message. You may use Markdown formatting like **bold**, *italic*, and `code`.';

        const name = char.name || 'Character';
        const context = SillyTavern.getContext();
        const tethered = isTetheredMode();

        // Helper: get prompt from settings with macro replacement
        function getPrompt(key) {
            const val = settings[key];
            if (val !== undefined && val !== null && val !== '') return replaceMacros(val);
            // Fall back to config default
            const defaults = window.EchoTextConfig && window.EchoTextConfig.defaultSettings;
            return defaults && defaults[key] ? replaceMacros(defaults[key]) : '';
        }

        // --- Layer 1: Identity + optional fiction frame ---
        let prompt = getPrompt('promptSystemBase');

        if (settings.antiRefusal !== false) {
            prompt += '\n\n' + getPrompt('promptAntiRefusalFrame');
        }

        if (tethered && settings.ctxSTMessages === true) {
            try {
                const tokenBudget = settings.ctxSTTokenBudget || 1200;
                const stContext = getSTChatMessages(tokenBudget);
                if (stContext) {
                    prompt += `\n\nSTORY CONTINUITY (high priority):\nThe following recent messages are canonical. Keep your reply consistent with these events, relationships, and tone.\n${stContext}`;
                }
            } catch (e) { /* ignore */ }
        }

        // Description
        if ((tethered ? settings.ctxDescription !== false : true) && char.description) {
            prompt += `\n\n${name}'s description: ${replaceMacros(char.description)}`;
        }

        // Personality
        if ((tethered ? settings.ctxPersonality !== false : true) && char.personality) {
            prompt += `\n\n${name}'s personality: ${replaceMacros(char.personality)}`;
        }

        // Scenario
        if ((tethered ? settings.ctxScenario !== false : true) && char.scenario) {
            prompt += `\n\nScenario: ${replaceMacros(char.scenario)}`;
        }

        // Persona (user's persona description)
        if (tethered ? settings.ctxPersona === true : true) {
            try {
                const personaName = context.persona || '';
                const personaDescription = (context.personas && context.personas[personaName] && context.personas[personaName].description)
                    || personaName || '';
                if (personaDescription) {
                    prompt += `\n\n${getUserName()}'s persona: ${replaceMacros(personaDescription)}`;
                }
            } catch (e) { /* ignore */ }
        }

        // World Info / Lorebook entries
        if (tethered && settings.ctxWorldInfo === true) {
            try {
                const worldInfoData = getActiveWorldInfoEntries();
                if (worldInfoData) {
                    prompt += `\n\nWorld Information:\n${worldInfoData}`;
                }
            } catch (e) { /* ignore */ }
        }

        // Emotion system context
        if (tethered) {
            prompt += buildEmotionContext();
            // Inside jokes memory injection (occasional, tethered-only)
            prompt += buildInsideJokesContext();
        }

        // Untethered chat overlay context (mood, personality, comm style)
        prompt += buildUntetheredChatContext();

        // --- Layer 2: Persona-lock reminder (replaces IMPORTANT block) ---
        if (settings.antiRefusal !== false) {
            prompt += tethered
                ? `\n\n${getPrompt('promptTetheredReminder')}`
                : `\n\n${getPrompt('promptUntetheredReminder')}`;
        } else {
            prompt += tethered
                ? `\n\n${getPrompt('promptTetheredNoFrame')}`
                : `\n\n${getPrompt('promptUntetheredNoFrame')}`;
        }

        // Verbosity instruction
        const charKey = getCharacterKey();
        const verbosity = charKey && settings.verbosityByCharacter ? settings.verbosityByCharacter[charKey] : null;
        if (verbosity === 'short') {
            prompt += '\n\nVERBOSITY: Keep your reply to 1-2 short sentences maximum. Be concise and direct.';
        } else if (verbosity === 'long') {
            prompt += '\n\nVERBOSITY: You may reply with 4-8 sentences with more detail, expressiveness, and depth.';
        } else {
            // default / 'medium'
            prompt += '\n\nVERBOSITY: Keep your reply to 2-4 sentences, natural text-message length.';
        }

        return prompt;
    }

    function getActiveWorldInfoEntries() {
        try {
            const context = SillyTavern.getContext();
            // Try to get world info from the context
            const worldInfo = context.worldInfo || context.world_info;
            if (!worldInfo) return null;

            const entries = [];
            // Handle different world info formats
            if (Array.isArray(worldInfo)) {
                worldInfo.forEach(entry => {
                    if (entry.content || entry.text) {
                        entries.push(entry.content || entry.text);
                    }
                });
            } else if (typeof worldInfo === 'object') {
                Object.values(worldInfo).forEach(entry => {
                    if (entry && (entry.content || entry.text)) {
                        entries.push(entry.content || entry.text);
                    }
                });
            }

            return entries.length > 0 ? entries.join('\n\n') : null;
        } catch (e) {
            return null;
        }
    }

    function getSTChatMessages(tokenBudget) {
        try {
            const context = SillyTavern.getContext();
            const chat = context.chat;
            if (!chat || !chat.length) return null;

            const charName = getCharacterName();
            const userName = getUserName();

            // Get the character's first_mes to exclude it from context injection
            const char = getCurrentCharacter();
            const firstMes = (char && char.first_mes) ? char.first_mes.trim() : null;

            // Walk from newest to oldest, accumulating estimated tokens (chars / 4)
            // until we exhaust the budget.
            const budget = Math.max(128, tokenBudget || 1200);
            const selected = [];
            let usedTokens = 0;

            for (let i = chat.length - 1; i >= 0; i--) {
                const msg = chat[i];
                if (!msg.is_user && firstMes && (msg.mes || '').trim() === firstMes) continue;
                const tokens = Math.ceil((msg.mes || '').length / 4);
                if (usedTokens + tokens > budget && selected.length > 0) break;
                selected.unshift(msg);
                usedTokens += tokens;
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

    function expandTimeDateMacros(text) {
        if (!text) return '';
        return String(text)
            .replace(/{{\s*time\s*}}/gi, getCurrentTimeMacroString())
            .replace(/{{\s*date\s*}}/gi, getCurrentDateMacroString());
    }

    function replaceMacros(text) {
        if (!text) return text;
        const charName = getCharacterName();
        const userName = getUserName();
        return text.replace(/{{char}}/gi, charName).replace(/{{user}}/gi, userName);
    }

    // ============================================================
    // CHAT HISTORY MANAGEMENT
    // ============================================================

    function getChatHistory() {
        const key = getCharacterKey();
        if (!key) return [];
        if (!isTetheredMode()) {
            if (!settings.untetheredHistory[key]) {
                settings.untetheredHistory[key] = [];
                // Brand new untethered conversation for this character: reset influences
                if (untetheredChat) untetheredChat.resetUntetheredChat();
                saveSettings();
            }
            return settings.untetheredHistory[key];
        }
        return settings.chatHistory[key] || [];
    }

    function saveChatHistory(history) {
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
        // Helper: strip the pre-fill prefix from the start of the model's response (case-insensitive).
        function stripPrefill(text) {
            if (!prefillPrefix || !text) return text;
            const escaped = prefillPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            return text.replace(new RegExp('^' + escaped, 'i'), '').trimStart();
        }

        if (settings.source === 'profile') {
            if (!settings.preset) throw new Error('Please select a connection profile in EchoText settings.');
            const context = SillyTavern.getContext();
            const cm = context.extensionSettings?.connectionManager;
            const profile = cm?.profiles?.find(p => p.name === settings.preset);
            if (!profile) throw new Error(`Profile '${settings.preset}' not found.`);
            if (!context.ConnectionManagerRequestService) throw new Error('ConnectionManagerRequestService not available.');

            const maxTokens = context.main?.max_length || 500;
            const response = await context.ConnectionManagerRequestService.sendRequest(
                profile.id, apiMessages, maxTokens,
                { stream: false, signal, extractData: true, includePreset: true, includeInstruct: true }
            );
            return stripPrefill(extractTextFromResponse(response));
        }

        if (settings.source === 'ollama') {
            const baseUrl = (settings.ollama_url || 'http://localhost:11434').replace(/\/$/, '');
            if (!settings.ollama_model) throw new Error('No Ollama model selected.');
            const maxTokens = SillyTavern.getContext().main?.max_length || 500;

            const response = await fetch(`${baseUrl}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: settings.ollama_model, messages: apiMessages, stream: false, options: { num_ctx: 4096, num_predict: maxTokens } }),
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
            const maxTokens = SillyTavern.getContext().main?.max_length || 500;

            const response = await fetch(`${baseUrl}/chat/completions`, {
                method: 'POST', headers,
                body: JSON.stringify({ model: settings.openai_model || 'local-model', messages: apiMessages, temperature: 0.8, max_tokens: maxTokens, stream: false }),
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

    function buildApiMessagesFromHistory(history, extraSystemMessages = []) {
        const systemPrompt = buildSystemPrompt();
        const apiMessages = [{ role: 'system', content: systemPrompt }];

        if (isTetheredMode() && settings.ctxSTMessages === true) {
            const stPriorityMessages = getSTChatMessages(Math.max(12, settings.ctxSTMessageCount || 10));
            if (stPriorityMessages) {
                apiMessages.push({
                    role: 'system',
                    content: `Main SillyTavern chat continuity (high priority):\n${stPriorityMessages}\n\nStay consistent with this ongoing story unless the user explicitly changes direction.`
                });
            }
        }

        for (const msg of extraSystemMessages) {
            if (msg) apiMessages.push({ role: 'system', content: msg });
        }

        history.forEach(msg => {
            apiMessages.push({ role: msg.is_user ? 'user' : 'assistant', content: msg.mes });
        });

        // --- Layer 3: Pre-fill assistant turn (anti-refusal, chat-completion backends only) ---
        // Planting the assistant prefix forces the model to continue in-character rather than
        // starting fresh with a potential refusal. The prefix is stripped in requestEchoTextCompletion.
        let prefillPrefix = '';
        if (settings.antiRefusal !== false && settings.source !== 'default') {
            prefillPrefix = `${getCharacterName()}: `;
            apiMessages.push({ role: 'assistant', content: prefillPrefix });
        }

        let rawPrompt = '';
        history.forEach(msg => {
            rawPrompt += `${msg.is_user ? getUserName() : getCharacterName()}: ${msg.mes}\n`;
        });
        rawPrompt += `${getCharacterName()}:`;

        return { apiMessages, rawPrompt, systemPrompt, prefillPrefix };
    }

    /**
     * Like buildApiMessagesFromHistory but scoped to an arbitrary char object.
     * Used by the proactive scheduler for non-active group members.
     */
    function buildApiMessagesFromHistoryForChar(history, extraSystemMessages = [], char) {
        const systemPrompt = buildSystemPrompt();
        const apiMessages = [{ role: 'system', content: systemPrompt }];

        for (const msg of extraSystemMessages) {
            if (msg) apiMessages.push({ role: 'system', content: msg });
        }

        history.forEach(msg => {
            apiMessages.push({ role: msg.is_user ? 'user' : 'assistant', content: msg.mes });
        });

        const charName = (char && char.name) || getCharacterName();
        const userName = getUserName();
        let rawPrompt = '';
        history.forEach(msg => {
            rawPrompt += `${msg.is_user ? userName : charName}: ${msg.mes}\n`;
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

        const { apiMessages, rawPrompt, systemPrompt } = buildApiMessagesFromHistory(history);

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
            setTypingIndicatorVisible(true);
            await sleepWithAbort(timing.replyDelayMs, abortController.signal);
            result = await requestEchoTextCompletion({ apiMessages, rawPrompt, systemPrompt, signal: abortController.signal });

            if (result && result.trim()) {
                const trimmedResult = result.trim();
                // Process character's response for emotion analysis
                processMessageEmotion(trimmedResult, false);

                // Apply dynamic emotion panel tint if enabled
                if (settings.dynamicEmotionPanel) {
                    try {
                        const charKey = getCharacterKey();
                        const emotionState = settings.emotionState && charKey ? settings.emotionState[charKey] : null;
                        const dominantEmotion = emotionState?.dominant || emotionState?.current || 'neutral';
                        applyEmotionPanelTint(dominantEmotion);
                    } catch (e) { /* ignore */ }
                }

                const newHistory = [...workingHistory, { is_user: false, mes: trimmedResult, send_date: Date.now() }];
                saveChatHistory(newHistory);
                if (isTetheredMode()) {
                    markProactiveCharacterActivity(getCharacterKey(), false, 'reply');
                    // Extract inside jokes from emotionally significant messages
                    try {
                        if (memorySystem) {
                            const charKey = getCharacterKey();
                            const emotionState = settings.emotionState && charKey ? settings.emotionState[charKey] : null;
                            memorySystem.extractMemorableCallback(newHistory, emotionState);
                            memorySystem.incrementTurn();
                        }
                    } catch (e) { /* ignore */ }
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
                    if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
                }
            }
        } else {
            inner.find('#et-typing-indicator-msg').remove();
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

    // ============================================================
    // FLOATING ACTION BUTTON (FAB)
    // ============================================================

    function buildFabHtml() {
        return `<div id="et-fab" title="Open EchoText"><i class="fa-solid ${settings.fabIcon}"></i></div>`;
    }

    function positionFab() {
        const fab = jQuery('#et-fab');
        if (!fab.length) return;

        const size = settings.fabSize;
        const edge = settings.fabEdge;
        const pos = settings.fabPosition;
        const margin = 16;

        fab.css({ width: size + 'px', height: size + 'px' });

        if (edge === 'right') {
            const top = Math.max(margin, Math.min(window.innerHeight - size - margin, (pos / 100) * window.innerHeight));
            fab.css({ right: margin + 'px', bottom: '', left: '', top: top + 'px' });
        } else if (edge === 'left') {
            const top = Math.max(margin, Math.min(window.innerHeight - size - margin, (pos / 100) * window.innerHeight));
            fab.css({ left: margin + 'px', right: '', bottom: '', top: top + 'px' });
        } else if (edge === 'bottom') {
            const left = Math.max(margin, Math.min(window.innerWidth - size - margin, (pos / 100) * window.innerWidth));
            fab.css({ bottom: margin + 'px', top: '', left: left + 'px', right: '' });
        } else if (edge === 'top') {
            const left = Math.max(margin, Math.min(window.innerWidth - size - margin, (pos / 100) * window.innerWidth));
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
            const newLeft = Math.max(0, Math.min(window.innerWidth - size, startLeft + dx));
            const newTop = Math.max(0, Math.min(window.innerHeight - size, startTop + dy));
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
            const t = e.touches[0];
            onMove(t.clientX, t.clientY);
        }, { passive: true });

        fab.addEventListener('touchend', () => { onEnd(); });
    }

    function snapFabToEdge() {
        const fab = document.getElementById('et-fab');
        if (!fab) return;

        const rect = fab.getBoundingClientRect();
        const size = fab.offsetWidth;
        const margin = 16;
        const cx = rect.left + size / 2;
        const cy = rect.top + size / 2;
        const vw = window.innerWidth;
        const vh = window.innerHeight;

        const distLeft = cx;
        const distRight = vw - cx;
        const distTop = cy;
        const distBottom = vh - cy;
        const minDist = Math.min(distLeft, distRight, distTop, distBottom);

        let edge, pos;
        if (minDist === distRight) { edge = 'right'; pos = Math.round((cy / vh) * 100); }
        else if (minDist === distLeft) { edge = 'left'; pos = Math.round((cy / vh) * 100); }
        else if (minDist === distBottom) { edge = 'bottom'; pos = Math.round((cx / vw) * 100); }
        else { edge = 'top'; pos = Math.round((cx / vw) * 100); }

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
        const idAttr = id ? ` id="${id}"` : '';
        const sizeClass = small ? 'et-char-avatar-small' : 'et-char-avatar';
        const hiddenClass = settings.showAvatar === false ? ' et-avatar-hidden' : '';

        // Use theme color when no avatar image is attached
        let backgroundColor = 'var(--et-theme-color)';

        if (avatarUrl) {
            return `<div class="${sizeClass}${hiddenClass}${extraClass ? ' ' + extraClass : ''}"${idAttr} style="background-color: ${backgroundColor};">
                <img src="${avatarUrl}" alt="${initial}" class="et-avatar-img" onerror="this.parentElement.classList.add('et-avatar-img-error'); this.remove();">
            </div>`;
        }
        return `<div class="${sizeClass}${hiddenClass}${extraClass ? ' ' + extraClass : ''}"${idAttr} style="background-color: ${backgroundColor};">${initial}</div>`;
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

        const charName = charObj.name || 'Character';

        // Update panel header
        jQuery('#et-char-name').text(charName);
        jQuery('#et-input').attr('placeholder', `Text ${charName}...`);

        // Rebuild avatar in the header using the group module's builder
        const newAvatarHtml = groupManager.buildAvatarHtmlForChar(charObj, '', 'et-char-avatar-wrap');
        jQuery('#et-char-avatar-wrap').replaceWith(newAvatarHtml);

        // Refresh emotion indicator for the newly selected char
        const emotionEnabled = settings.emotionSystemEnabled !== false && isTetheredMode();
        const isUntethered = !isTetheredMode();
        jQuery('#et-emotion-indicator').toggleClass('et-emotion-indicator-hidden', !emotionEnabled);
        jQuery('#et-char-name').toggleClass('et-char-name-clickable', emotionEnabled || isUntethered);
        if (emotionEnabled) updateEmotionIndicator();

        // Render this character's history
        const history = getChatHistory();
        renderMessages(history);

        // Update proactive state sync
        if (isTetheredMode()) {
            syncProactiveStateWithHistory(charKey, history);
        }
    }

    function buildPanelHtml() {
        const charName = getCharacterName();
        const tethered = isTetheredMode();

        return `
        <div id="et-panel" class="et-panel">
            <div class="et-resize-handle" data-corner="nw"></div>
            <div class="et-resize-handle" data-corner="ne"></div>
            <div class="et-resize-handle" data-corner="sw"></div>
            <div class="et-resize-handle" data-corner="se"></div>

            <div class="et-panel-header" id="et-panel-drag-handle">
                <div class="et-header-left">
                    ${buildAvatarHtml(charName, '', 'et-char-avatar-wrap')}
                    <div class="et-header-info">
                        <div class="et-char-name-row">
                            <div class="et-char-name et-char-name-clickable" id="et-char-name" title="View emotional state">${charName}</div>
                            <div class="et-emotion-indicator" id="et-emotion-indicator" title="Emotional state"><i class="fa-solid fa-sun"></i></div>
                        </div>
                        <div class="et-char-status-row" id="et-char-status">
                            <span class="et-plugin-badge">EchoText</span>
                        </div>
                    </div>
                </div>
                <div class="et-header-right">
                    <button class="et-mode-toggle ${tethered ? 'et-mode-tethered' : 'et-mode-untethered'}" id="et-mode-toggle-btn"
                        title="${tethered ? 'Tethered: history saved, context connected' : 'Untethered: standalone session, no ST sync'}">
                        <i class="fa-solid ${tethered ? 'fa-link' : 'fa-link-slash'}"></i>
                    </button>
                    <div class="et-header-btn" id="et-clear-btn" title="Clear chat history">
                        <i class="fa-solid fa-trash-can"></i>
                    </div>
                    <div class="et-header-btn" id="et-saveload-btn" title="Save / Load Chat Archives">
                        <i class="fa-solid fa-floppy-disk"></i>
                    </div>
                    <div class="et-header-btn" id="et-settings-btn" title="EchoText Settings">
                        <i class="fa-solid fa-gear"></i>
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
                <textarea class="et-input" id="et-input" placeholder="Text ${charName}..." rows="1"></textarea>
                <button class="et-send-btn" id="et-send-btn" title="Send message">
                    <i class="fa-solid fa-paper-plane"></i>
                </button>
            </div>
        </div>`;
    }

    function openPanel() {
        if (panelOpen) return;

        const fab = jQuery('#et-fab');
        if (!fab.length) return;

        jQuery('#et-panel').remove();
        jQuery('body').append(buildPanelHtml());
        const panel = jQuery('#et-panel');

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

        panelOpen = true;
        fab.addClass('et-fab-hidden');
        setFabUnreadIndicator(false);
        bindPanelEvents();

        // Group bar: ensure active char is set, then render bar and bind events
        if (groupManager) {
            groupManager.ensureActiveChar();
            groupManager.renderGroupBar(groupManager.getActiveCharKey());
            groupManager.bindGroupBarEvents(switchGroupChar);
            renderGroupUnreadIndicators();
        }

        // Load and render existing history (no auto first_mes)
        const history = getChatHistory();
        if (history.length === 0 && !getCurrentCharacter()) {
            showNoCharacterMessage();
        } else {
            renderMessages(history);
        }

        setTimeout(() => jQuery('#et-input').focus(), 300);
    }

    function closePanel() {
        if (!panelOpen) return;

        // Close any open emoji overlays
        jQuery('.et-react-overlay').remove();

        // Remove document event listeners
        jQuery(document).off('click.et-react');

        const panel = jQuery('#et-panel');
        const fab = jQuery('#et-fab');

        panel.css({ transition: 'opacity 0.2s ease, transform 0.2s ease', opacity: 0, transform: 'scale(0.85)' });
        setTimeout(() => {
            panel.remove();
            panelOpen = false;
            fab.removeClass('et-fab-hidden');
        }, 220);
    }

    function showNoCharacterMessage() {
        const inner = jQuery('#et-messages-inner');
        inner.html(`
            <div class="et-no-char-msg">
                <i class="fa-solid fa-user-slash"></i>
                <p>No character selected.</p>
                <p>Load a character card in SillyTavern to start texting.</p>
            </div>
        `);
    }

    // Emotion → colour map for Dynamic Emotion Panel tint
    const EMOTION_TINT_COLORS = {
        happy: 'rgba(251, 211, 71, 0.18)',
        excited: 'rgba(251, 146, 60, 0.18)',
        playful: 'rgba(167, 139, 250, 0.18)',
        flirty: 'rgba(249, 168, 212, 0.20)',
        loving: 'rgba(251, 113, 133, 0.18)',
        content: 'rgba(74, 222, 128, 0.14)',
        calm: 'rgba(147, 197, 253, 0.14)',
        curious: 'rgba(125, 211, 252, 0.16)',
        surprised: 'rgba(250, 204, 21, 0.18)',
        nervous: 'rgba(253, 224, 71, 0.14)',
        sad: 'rgba(100, 149, 237, 0.18)',
        angry: 'rgba(239, 68, 68, 0.18)',
        frustrated: 'rgba(234, 88, 12, 0.16)',
        scared: 'rgba(139, 92, 246, 0.18)',
        disgusted: 'rgba(34, 197, 94, 0.16)',
        bored: 'rgba(148, 163, 184, 0.12)',
        melancholy: 'rgba(99, 102, 241, 0.16)',
        embarrassed: 'rgba(244, 114, 182, 0.18)',
        shy: 'rgba(192, 132, 252, 0.15)',
        neutral: 'transparent'
    };

    function applyEmotionPanelTint(emotionKey) {
        if (!settings.dynamicEmotionPanel) return;
        const tint = EMOTION_TINT_COLORS[emotionKey] || 'transparent';
        document.documentElement.style.setProperty('--et-emotion-tint', tint);
        jQuery('#et-panel').addClass('et-emotion-active');
    }



    function bindPanelEvents() {
        makePanelDraggable();
        makePanelResizable();

        jQuery('#et-close-btn').on('click', closePanel);
        jQuery('#et-settings-btn').on('click', () => settingsModal.openSettingsModal());
        jQuery('#et-saveload-btn').on('click', (e) => { e.stopPropagation(); openSaveLoadModal(); });

        // Emotion popup or Untethered popup: click char name
        jQuery('#et-char-name').on('click', function (e) {
            e.stopPropagation();
            if (isTetheredMode()) {
                const emotionEnabled = settings.emotionSystemEnabled !== false;
                if (emotionEnabled) toggleEmotionPopup();
            } else {
                toggleUntetheredPopup();
            }
        });

        jQuery('#et-emotion-indicator').on('click', function (e) {
            e.stopPropagation();
            toggleEmotionPopup();
        });

        // In-bubble avatar/name pill opens emotion popup or untethered popup
        jQuery('#et-messages').on('click.et-avatar-emotion', '.et-char-info-pill', function (e) {
            e.stopPropagation();
            if (isTetheredMode()) {
                const emotionEnabled = settings.emotionSystemEnabled !== false;
                if (emotionEnabled) toggleEmotionPopup(this);
            } else {
                toggleUntetheredPopup(this);
            }
        });

        // Initialize emotion indicator and clickability
        const emotionEnabled = settings.emotionSystemEnabled !== false && isTetheredMode();
        const untethered = !isTetheredMode();
        jQuery('#et-emotion-indicator').toggleClass('et-emotion-indicator-hidden', !emotionEnabled);
        jQuery('#et-char-name').toggleClass('et-char-name-clickable', emotionEnabled || untethered);
        jQuery('#et-char-name').attr('title', untethered ? 'Mood, Personality & Style' : 'View emotional state');

        if (emotionEnabled) updateEmotionIndicator();

        jQuery('#et-mode-toggle-btn').on('click', function (e) {
            e.stopPropagation();
            settings.chatMode = isTetheredMode() ? 'untethered' : 'tethered';
            saveSettings();
            startProactiveScheduler();

            const history = getChatHistory();
            renderMessages(history);

            const nextEmotionEnabled = settings.emotionSystemEnabled !== false && isTetheredMode();
            const nextUntethered = !isTetheredMode();
            jQuery('#et-emotion-indicator').toggleClass('et-emotion-indicator-hidden', !nextEmotionEnabled);
            jQuery('#et-char-name').toggleClass('et-char-name-clickable', nextEmotionEnabled || nextUntethered);
            jQuery('#et-char-name').attr('title', nextUntethered ? 'Mood, Personality & Style' : 'View emotional state');

            if (nextEmotionEnabled) updateEmotionIndicator();

            const btn = jQuery('#et-mode-toggle-btn');
            const tethered = isTetheredMode();
            btn.toggleClass('et-mode-tethered', tethered).toggleClass('et-mode-untethered', !tethered);
            btn.find('i').attr('class', `fa-solid ${tethered ? 'fa-link' : 'fa-link-slash'}`);
            btn.attr('title', tethered ? 'Tethered: history saved, context connected' : 'Untethered: standalone session, no ST sync');
            btn.addClass('et-mode-toggle-anim');
            setTimeout(() => btn.removeClass('et-mode-toggle-anim'), 600);
            refreshProactiveInsights();
        });

        jQuery('#et-clear-btn').on('click', async () => {
            const confirmed = await showConfirmModal('Clear all chat history with this character?');
            if (confirmed) {
                if (!isTetheredMode() && untetheredChat) {
                    untetheredChat.resetUntetheredChat();
                }
                clearChatHistory();
                renderMessages([]);
            }
        });

        jQuery('#et-send-btn').on('click', handleSend);

        jQuery('#et-input').on('keydown', function (e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
            }
        }).on('input', function () {
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight, 120) + 'px';
        });

        // Close emoji overlays when clicking outside
        jQuery(document).on('click.et-react', function (e) {
            if (!jQuery(e.target).closest('.et-react-overlay, .et-react-btn').length) {
                closeAllReactOverlays();
            }
        });

        // Avatar Lightbox
        jQuery('#et-panel').on('click', '#et-char-avatar-wrap', function (e) {
            e.stopPropagation();
            openAvatarLightbox();
        });
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
        if (!text) return;

        const char = getCurrentCharacter();
        if (!char) {
            toastr.warning('Please select a character card to start texting.');
            return;
        }

        input.val('').css('height', 'auto');

        // Process user message for emotion analysis
        processMessageEmotion(text, true);

        const history = getChatHistory();
        const newHistory = [...history, {
            is_user: true,
            mes: text,
            send_date: Date.now(),
            meta: {
                receipt: {
                    state: 'sent',
                    note: 'Sent'
                }
            }
        }];
        saveChatHistory(newHistory);
        setFabUnreadIndicator(false);
        if (isTetheredMode()) {
            markProactiveUserActivity(getCharacterKey(), Date.now());
        }
        renderMessages(newHistory);
        generateEchoText(newHistory);
    }

    function updateSendButton(generating) {
        const btn = jQuery('#et-send-btn');
        if (generating) {
            btn.addClass('et-send-stop').attr('title', 'Cancel generation');
            btn.html('<i class="fa-solid fa-stop"></i>');
            jQuery('#et-char-status').text('Typing...');
        } else {
            btn.removeClass('et-send-stop').attr('title', 'Send message');
            btn.html('<i class="fa-solid fa-paper-plane"></i>');
            jQuery('#et-char-status').text('EchoText');
        }
    }

    // ============================================================
    // PANEL DRAG & RESIZE
    // ============================================================

    function makePanelDraggable() {
        const panel = document.getElementById('et-panel');
        const handle = document.getElementById('et-panel-drag-handle');
        if (!panel || !handle) return;

        let isDragging = false;
        let startX, startY, origLeft, origTop;

        handle.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            if (e.target.closest('.et-header-btn, button, input, select, textarea')) return;
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
            if (e.target.closest('.et-header-btn, button, input, select, textarea')) return;
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
    }

    function applyReactionToEmotions(reactionId, direction = 1) {
        if (emotionSystem) emotionSystem.applyReactionToEmotions(reactionId, direction);
    }

    function updateEmotionIndicator() {
        if (emotionSystem) emotionSystem.updateEmotionIndicator();
    }

    function toggleEmotionPopup(targetEl) {
        if (emotionSystem) emotionSystem.toggleEmotionPopup(targetEl);
    }

    function formatMessageText(rawText) {
        const { DOMPurify } = SillyTavern.libs;
        const raw = rawText || '';

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

    // Track which delete button is pending 2nd click
    let deleteConfirmIndex = -1;
    let deleteConfirmTimer = null;

    function renderMessages(history) {
        const inner = jQuery('#et-messages-inner');
        if (!inner.length) return;

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
                            <button class="et-dots-btn" data-index="${index}" data-is-user="1" title="More options"><i class="fa-solid fa-ellipsis-vertical"></i></button>
                        </div>
                    </div>
                </div>`;
            } else {
                const safeCharName = DOMPurify.sanitize(charName, { ALLOWED_TAGS: [] });
                // Avatar left of char name in a pill
                const avatarHtml = settings.showAvatar !== false
                    ? buildAvatarHtml(charName, 'et-bubble-avatar et-bubble-avatar-footer', '', true)
                    : '';

                // Verbosity indicator for this character
                const charKey = getCharacterKey();
                const verbosity = charKey && settings.verbosityByCharacter ? settings.verbosityByCharacter[charKey] : null;
                const verbosityLabels = { short: '📏', medium: '📋', long: '📜' };
                const verbosityBadge = verbosity && verbosity !== 'medium'
                    ? `<span class="et-verbosity-badge" title="Verbosity: ${verbosity}">${verbosityLabels[verbosity] || ''}</span>` : '';

                bubbleHtml = `
                <div class="et-message et-message-char" data-index="${index}">
                    <div class="et-message-body">
                        <div class="et-bubble et-bubble-char">
                            <div class="et-bubble-text">${formattedText}</div>
                            <div class="et-message-footer">
                                <button class="et-char-info-pill" title="View Chat Influence">
                                    ${avatarHtml}
                                    <span class="et-footer-name">${safeCharName}</span>
                                </button>
                                <span class="et-message-time" title="${fullDateToolip}">${time}</span>
                                ${verbosityBadge}
                            </div>
                            <div class="et-bubble-actions">
                                <button class="et-react-btn" data-index="${index}" title="React"><i class="fa-regular fa-face-smile"></i></button>
                                <button class="et-dots-btn" data-index="${index}" data-is-user="0" title="More options"><i class="fa-solid fa-ellipsis-vertical"></i></button>
                            </div>
                        </div>
                        <div class="et-bubble-reactions-bar" id="et-reactions-bar-${index}">
                            <div class="et-active-reactions" id="et-reactions-${index}"></div>
                        </div>
                    </div>
                </div>`;
            }

            inner.append(bubbleHtml);

            if (!isUser) {
                renderStoredReactions(index, msg);
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

        if (settings.autoScroll) {
            const messagesEl = document.getElementById('et-messages');
            if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
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
                renderMessages(history);
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

        if (action === 'regen') {
            closeAllDotMenus();
            if (isUser) {
                // Re-send: truncate history to before this user message and regenerate
                const truncated = history.slice(0, msgIndex + 1);
                saveChatHistory(truncated);
                renderMessages(truncated);
                generateEchoText(truncated);
            } else {
                // Remove last char message and regenerate from the preceding history
                const truncated = history.slice(0, msgIndex);
                saveChatHistory(truncated);
                renderMessages(truncated);
                generateEchoText(truncated);
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
        const options = Object.entries(THEME_PRESETS).map(([key, theme]) => {
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
        if (!memorySystem || !isTetheredMode()) return '';
        return memorySystem.buildInsideJokesContext();
    }

    // ============================================================
    // SAVE/LOAD MODAL — THIN WRAPPERS
    // ============================================================

    function openSaveLoadModal() {
        if (saveLoadModal) saveLoadModal.openSaveLoadModal();
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
            expandTimeDateMacros
        });

        untetheredChat = window.EchoTextUntetheredChat.createUntetheredChat({
            getSettings: () => settings,
            saveSettings,
            getCharacterName,
            getCharacterKey
        });

        settingsModal = window.EchoTextSettingsModal.createSettingsModal({
            getSettings: () => settings,
            saveSettings,
            getThemePresets: () => THEME_PRESETS,
            applySettingsToUI,
            applyAppearanceSettings,
            populateConnectionProfiles,
            fetchOllamaModels,
            initCustomDropdowns,
            initCustomDropdownPanel,
            toggleEchoTextMaster,
            updateProviderVisibility,
            updateProviderVisibilityPanel,
            getChatHistory,
            renderMessages,
            isPanelOpen,
            refreshProactiveInsights,
            updateProactiveToggleButtons,
            startProactiveScheduler,
            triggerTestProactiveMessage,
            positionFab,
            buildThemeDropdownHtml,
            buildFontDropdownHtml,
            loadGoogleFont
        });

        console.log('EchoText Debug - settingsModal created:', settingsModal);

        memorySystem = window.EchoTextMemorySystem.createMemorySystem({
            getSettings: () => settings,
            saveSettings,
            getCharacterKey,
            isTetheredMode
        });

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
            restoreGroupSnapshot: (snap) => { if (groupManager) groupManager.restoreGroupSnapshot(snap, settings); }
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
            expandTimeDateMacros,
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
            }
        });

        FA_REACTIONS = emotionSystem.FA_REACTIONS;

        loadSettings();
        startProactiveScheduler();

        jQuery('body').append(buildFabHtml());
        positionFab();
        makeFabDraggable();
        setFabUnreadIndicator(false);

        jQuery('#et-fab').on('click', function () {
            if (fabDragging) return;
            if (panelOpen) closePanel();
            else openPanel();
        });

        jQuery(document).on('click', '#et-open-settings-btn', () => settingsModal.openSettingsModal());

        toggleEchoTextMaster();

        if (settings.enabled && settings.autoOpenOnReload) {
            openPanel();
        }

        const context = SillyTavern.getContext();
        context.eventSource.on(context.event_types.CHAT_CHANGED, () => {
            // Reset group active char when chat changes so we re-select the first member
            if (groupManager) groupManager.setActiveCharKey(null);
            if (groupManager) groupManager.ensureActiveChar();

            const key = getCharacterKey();
            if (key) syncProactiveStateWithHistory(key, getChatHistory());
            if (panelOpen) {
                const charName = getCharacterName();

                jQuery('#et-char-name').text(charName);
                jQuery('#et-char-avatar-wrap').replaceWith(buildAvatarHtml(charName, '', 'et-char-avatar-wrap'));
                jQuery('#et-input').attr('placeholder', `Text ${charName}...`);

                const history = getChatHistory();
                renderMessages(history);

                // Re-render group bar (shows for group chats, hidden for solo)
                if (groupManager) {
                    groupManager.renderGroupBar(groupManager.getActiveCharKey());
                    groupManager.bindGroupBarEvents(switchGroupChar);
                }
            }
        });

        // Also listen for GROUP_UPDATED to refresh the bar if membership changes
        if (context.event_types.GROUP_UPDATED) {
            context.eventSource.on(context.event_types.GROUP_UPDATED, () => {
                if (panelOpen && groupManager) {
                    groupManager.renderGroupBar(groupManager.getActiveCharKey());
                    groupManager.bindGroupBarEvents(switchGroupChar);
                }
            });
        }

        log('EchoText initialized successfully');
    }

    // Register extension with SillyTavern
    function registerExtension() {
        const context = SillyTavern.getContext();
        if (context && context.extensionSettings) {
            if (!context.extensionSettings.echotext) {
                context.extensionSettings.echotext = {};
            }
        }
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
            console.log('EchoText Debug - Starting initialization...');
            registerExtension();
            initEchoText();
            console.log('EchoText Debug - Initialization complete.');
        } catch (error) {
            console.error('EchoText Debug - Initialization failed:', error);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startExtension);
    } else {
        startExtension();
    }

})();
