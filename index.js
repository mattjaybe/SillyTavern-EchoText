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

    // ============================================================
    // THEME PRESETS
    // ============================================================

    const THEME_PRESETS = {
        sillytavern: {
            label: 'SillyTavern',
            description: 'Uses your active SillyTavern theme',
            primary: null,   // null = use ST CSS vars
            secondary: null,
            text: null,
            accent: null,
            swatches: ['var(--SmartThemeBlurTintColor,#1a1a2e)', 'var(--SmartThemeBotMesBlurTintColor,#16213e)', 'var(--SmartThemeBodyColor,#e0e0e0)', 'var(--SmartThemeQuoteColor,#4da6ff)']
        },
        midnight: {
            label: 'Midnight Blue',
            description: 'Deep navy with electric blue accents',
            primary: 'rgba(10, 14, 35, 0.92)',
            secondary: 'rgba(20, 28, 60, 0.85)',
            text: '#c8d8f8',
            accent: '#4d8fff',
            swatches: ['#0a0e23', '#141c3c', '#c8d8f8', '#4d8fff']
        },
        rose: {
            label: 'Rose Gold',
            description: 'Warm rose with gold highlights',
            primary: 'rgba(30, 15, 20, 0.92)',
            secondary: 'rgba(55, 25, 35, 0.85)',
            text: '#f5dde0',
            accent: '#e8956d',
            swatches: ['#1e0f14', '#371923', '#f5dde0', '#e8956d']
        },
        forest: {
            label: 'Forest',
            description: 'Deep green with emerald accents',
            primary: 'rgba(8, 22, 14, 0.92)',
            secondary: 'rgba(15, 38, 24, 0.85)',
            text: '#c8f0d8',
            accent: '#3dba7a',
            swatches: ['#08160e', '#0f2618', '#c8f0d8', '#3dba7a']
        },
        aurora: {
            label: 'Aurora',
            description: 'Dark with vibrant purple-teal gradient',
            primary: 'rgba(12, 8, 28, 0.92)',
            secondary: 'rgba(22, 14, 48, 0.85)',
            text: '#e8d8ff',
            accent: '#a855f7',
            swatches: ['#0c081c', '#160e30', '#e8d8ff', '#a855f7']
        },
        sunset: {
            label: 'Sunset',
            description: 'Warm amber and coral tones',
            primary: 'rgba(28, 12, 8, 0.92)',
            secondary: 'rgba(48, 20, 12, 0.85)',
            text: '#ffe8d8',
            accent: '#ff7043',
            swatches: ['#1c0c08', '#30140c', '#ffe8d8', '#ff7043']
        },
        arctic: {
            label: 'Arctic',
            description: 'Clean white-blue ice palette',
            primary: 'rgba(8, 18, 32, 0.92)',
            secondary: 'rgba(14, 28, 50, 0.85)',
            text: '#ddeeff',
            accent: '#7ec8e3',
            swatches: ['#081220', '#0e1c32', '#ddeeff', '#7ec8e3']
        },
        obsidian: {
            label: 'Obsidian',
            description: 'Pure black with silver accents',
            primary: 'rgba(6, 6, 8, 0.96)',
            secondary: 'rgba(14, 14, 18, 0.90)',
            text: '#d8d8e0',
            accent: '#a0a8c0',
            swatches: ['#060608', '#0e0e12', '#d8d8e0', '#a0a8c0']
        }
    };

    // ============================================================
    // DEFAULT SETTINGS
    // ============================================================

    const defaultSettings = Object.freeze({
        enabled: true,
        // Generation Engine
        source: 'default',
        preset: '',
        ollama_url: 'http://localhost:11434',
        ollama_model: '',
        openai_url: 'http://localhost:1234/v1',
        openai_key: '',
        openai_model: 'local-model',
        openai_preset: 'custom',
        // Appearance
        fontSize: 15,
        fontFamily: 'Inter',
        theme: 'sillytavern',
        glassBlur: 20,
        glassOpacity: 85,
        showAvatar: true,
        // Action Button
        fabSize: 56,
        fabIcon: 'fa-comment-dots',
        fabEdge: 'right',
        fabPosition: 80,
        // Panel
        panelWidth: 380,
        panelHeight: 600,
        panelLeft: null,
        panelTop: null,
        // Behavior
        autoScroll: true,
        // Context settings
        ctxDescription: true,
        ctxPersonality: true,
        ctxScenario: true,
        ctxPersona: false,
        ctxWorldInfo: false,
        ctxSTMessages: false,
        ctxSTMessageCount: 10,
        // Chat history per character (keyed by character avatar)
        chatHistory: {}
    });

    let settings = JSON.parse(JSON.stringify(defaultSettings));
    let isGenerating = false;
    let abortController = null;
    let panelOpen = false;
    let fabDragging = false;
    let loadedFontFamily = null;

    // ============================================================
    // LOGGING
    // ============================================================

    function log(...args) { /* console.log(`[${EXTENSION_NAME}]`, ...args); */ }
    function warn(...args) { /* console.warn(`[${EXTENSION_NAME}]`, ...args); */ }
    function error(...args) { console.error(`[${EXTENSION_NAME}]`, ...args); }

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
        jQuery('#et_source').val(settings.source);
        jQuery('#et_profile_select').val(settings.preset);
        jQuery('#et_ollama_url').val(settings.ollama_url);
        jQuery('#et_openai_preset').val(settings.openai_preset);
        jQuery('#et_openai_url').val(settings.openai_url);
        jQuery('#et_openai_key').val(settings.openai_key);
        jQuery('#et_openai_model').val(settings.openai_model);
        jQuery('#et_font_size').val(settings.fontSize);
        jQuery('#et_font_size_val').text(settings.fontSize + 'px');
        jQuery('#et_theme').val(settings.theme);
        jQuery('#et_glass_blur').val(settings.glassBlur);
        jQuery('#et_glass_blur_val').text(settings.glassBlur + 'px');
        jQuery('#et_glass_opacity').val(settings.glassOpacity);
        jQuery('#et_glass_opacity_val').text(settings.glassOpacity + '%');
        jQuery('#et_show_avatar').prop('checked', settings.showAvatar !== false);
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
        jQuery('#et_ctx_st_message_count').val(settings.ctxSTMessageCount || 10);
        jQuery('#et_ctx_st_message_count_container').toggle(settings.ctxSTMessages === true);

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
        jQuery('#et_auto_scroll_panel').prop('checked', settings.autoScroll);
        jQuery('#et_show_avatar_panel').prop('checked', settings.showAvatar !== false);

        // Generation Engine
        jQuery('#et_source_panel').val(settings.source);
        jQuery('#et_profile_select_panel').val(settings.preset);
        jQuery('#et_ollama_url_panel').val(settings.ollama_url);
        jQuery('#et_openai_preset_panel').val(settings.openai_preset);
        jQuery('#et_openai_url_panel').val(settings.openai_url);
        jQuery('#et_openai_key_panel').val(settings.openai_key);
        jQuery('#et_openai_model_panel').val(settings.openai_model);
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
        jQuery('#et_ctx_st_message_count_panel').val(settings.ctxSTMessageCount || 10);
        jQuery('#et_ctx_st_message_count_val_panel').text(settings.ctxSTMessageCount || 10);
        jQuery('#et_ctx_st_message_count_container_panel').toggle(settings.ctxSTMessages === true);

        // Appearance
        jQuery('#et_font_size_panel').val(settings.fontSize);
        jQuery('#et_font_size_val_panel').text(settings.fontSize + 'px');
        jQuery('#et_glass_blur_panel').val(settings.glassBlur);
        jQuery('#et_glass_blur_val_panel').text(settings.glassBlur + 'px');
        jQuery('#et_glass_opacity_panel').val(settings.glassOpacity);
        jQuery('#et_glass_opacity_val_panel').text(settings.glassOpacity + '%');

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
        jQuery(document).off('click.et-dd-panel').on('click.et-dd-panel', '#et_theme_panel_container .et-custom-dropdown .et-dd-trigger, #et_font_family_panel_container .et-custom-dropdown .et-dd-trigger, #et_fab_icon_panel .et-dd-trigger', function(e) {
            e.stopPropagation();
            const dropdown = jQuery(this).closest('.et-custom-dropdown');
            const isOpen = dropdown.hasClass('et-dd-open');

            // Close all other dropdowns
            jQuery('.et-custom-dropdown').removeClass('et-dd-open');

            if (!isOpen) {
                dropdown.addClass('et-dd-open');
            }
        });

        jQuery(document).off('click.et-dd-option-panel').on('click.et-dd-option-panel', '#et_theme_panel_container .et-dd-option, #et_font_family_panel_container .et-dd-option', function() {
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
        jQuery(document).off('click.et-dd-outside-panel').on('click.et-dd-outside-panel', function(e) {
            if (!jQuery(e.target).closest('.et-custom-dropdown').length) {
                jQuery('.et-custom-dropdown').removeClass('et-dd-open');
            }
        });
    }

    // Initialize accordion functionality
    function initPanelAccordion() {
        jQuery(document).off('click.et-accordion').on('click.et-accordion', '.et-accordion-header', function() {
            const section = jQuery(this).closest('.et-accordion-section');
            const isOpen = section.hasClass('open');

            // Close all other sections with animation
            jQuery('.et-accordion-section').not(section).each(function() {
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
        jQuery('#et_enabled_panel').off('change.panel').on('change.panel', function() {
            const checked = jQuery(this).is(':checked');
            settings.enabled = checked;
            saveSettings();
            toggleEchoTextMaster();
            // Sync with quick toggle and modal toggle
            jQuery('#et_enabled_quick').prop('checked', checked);
            jQuery('#et_enabled').prop('checked', checked);
        });

        // Quick toggle also needs to sync with panel toggle
        jQuery('#et_enabled_quick').off('change.panel').on('change.panel', function() {
            const checked = jQuery(this).is(':checked');
            settings.enabled = checked;
            saveSettings();
            toggleEchoTextMaster();
            // Sync with panel toggle and modal toggle
            jQuery('#et_enabled_panel').prop('checked', checked);
            jQuery('#et_enabled').prop('checked', checked);
        });

        // Auto-scroll
        jQuery('#et_auto_scroll_panel').off('change.panel').on('change.panel', function() {
            settings.autoScroll = jQuery(this).is(':checked');
            saveSettings();
            // Sync with modal
            jQuery('#et_auto_scroll').prop('checked', settings.autoScroll);
        });

        // Show avatar
        jQuery('#et_show_avatar_panel').off('change.panel').on('change.panel', function() {
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

        // Generation Engine - Source
        jQuery('#et_source_panel').off('change.panel').on('change.panel', function() {
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
        jQuery('#et_profile_select_panel').off('change.panel').on('change.panel', function() {
            settings.preset = jQuery(this).val();
            saveSettings();
            // Sync with modal
            jQuery('#et_profile_select').val(settings.preset);
        });

        // Ollama
        jQuery('#et_ollama_url_panel').off('change.panel').on('change.panel', function() {
            settings.ollama_url = jQuery(this).val();
            saveSettings();
            // Sync with modal
            jQuery('#et_ollama_url').val(settings.ollama_url);
            fetchOllamaModels();
        });

        jQuery('#et_ollama_model_select_panel').off('change.panel').on('change.panel', function() {
            settings.ollama_model = jQuery(this).val();
            saveSettings();
            // Sync with modal
            jQuery('#et_ollama_model_select').val(settings.ollama_model);
        });

        // OpenAI
        jQuery('#et_openai_preset_panel').off('change.panel').on('change.panel', function() {
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

        jQuery('#et_openai_url_panel').off('change.panel').on('change.panel', function() {
            settings.openai_url = jQuery(this).val();
            saveSettings();
            // Sync with modal
            jQuery('#et_openai_url').val(settings.openai_url);
        });

        jQuery('#et_openai_key_panel').off('change.panel').on('change.panel', function() {
            settings.openai_key = jQuery(this).val();
            saveSettings();
            // Sync with modal
            jQuery('#et_openai_key').val(settings.openai_key);
        });

        jQuery('#et_openai_model_panel').off('change.panel').on('change.panel', function() {
            settings.openai_model = jQuery(this).val();
            saveSettings();
            // Sync with modal
            jQuery('#et_openai_model').val(settings.openai_model);
        });

        // Context settings
        jQuery('#et_ctx_description_panel').off('change.panel').on('change.panel', function() {
            settings.ctxDescription = jQuery(this).is(':checked');
            saveSettings();
            // Sync with modal
            jQuery('#et_ctx_description').prop('checked', settings.ctxDescription);
        });

        jQuery('#et_ctx_personality_panel').off('change.panel').on('change.panel', function() {
            settings.ctxPersonality = jQuery(this).is(':checked');
            saveSettings();
            // Sync with modal
            jQuery('#et_ctx_personality').prop('checked', settings.ctxPersonality);
        });

        jQuery('#et_ctx_scenario_panel').off('change.panel').on('change.panel', function() {
            settings.ctxScenario = jQuery(this).is(':checked');
            saveSettings();
            // Sync with modal
            jQuery('#et_ctx_scenario').prop('checked', settings.ctxScenario);
        });

        jQuery('#et_ctx_persona_panel').off('change.panel').on('change.panel', function() {
            settings.ctxPersona = jQuery(this).is(':checked');
            saveSettings();
            // Sync with modal
            jQuery('#et_ctx_persona').prop('checked', settings.ctxPersona);
        });

        jQuery('#et_ctx_world_info_panel').off('change.panel').on('change.panel', function() {
            settings.ctxWorldInfo = jQuery(this).is(':checked');
            saveSettings();
            // Sync with modal
            jQuery('#et_ctx_world_info').prop('checked', settings.ctxWorldInfo);
        });

        jQuery('#et_ctx_st_messages_panel').off('change.panel').on('change.panel', function() {
            settings.ctxSTMessages = jQuery(this).is(':checked');
            jQuery('#et_ctx_st_message_count_container_panel').toggle(settings.ctxSTMessages);
            saveSettings();
            // Sync with modal
            jQuery('#et_ctx_st_messages').prop('checked', settings.ctxSTMessages);
            jQuery('#et_ctx_st_message_count_container').toggle(settings.ctxSTMessages);
        });

        jQuery('#et_ctx_st_message_count_panel').off('input.panel').on('input.panel', function() {
            settings.ctxSTMessageCount = parseInt(jQuery(this).val());
            jQuery('#et_ctx_st_message_count_val_panel').text(settings.ctxSTMessageCount);
            saveSettings();
            // Sync with modal
            jQuery('#et_ctx_st_message_count').val(settings.ctxSTMessageCount);
            jQuery('#et_ctx_st_message_count_val').text(settings.ctxSTMessageCount);
        });

        // Appearance - Font size
        jQuery('#et_font_size_panel').off('input.panel').on('input.panel', function() {
            settings.fontSize = parseInt(jQuery(this).val());
            jQuery('#et_font_size_val_panel').text(settings.fontSize + 'px');
            applyAppearanceSettings();
            saveSettings();
            // Sync with modal
            jQuery('#et_font_size').val(settings.fontSize);
            jQuery('#et_font_size_val').text(settings.fontSize + 'px');
        });

        // Glass blur
        jQuery('#et_glass_blur_panel').off('input.panel').on('input.panel', function() {
            settings.glassBlur = parseInt(jQuery(this).val());
            jQuery('#et_glass_blur_val_panel').text(settings.glassBlur + 'px');
            applyAppearanceSettings();
            saveSettings();
            // Sync with modal
            jQuery('#et_glass_blur').val(settings.glassBlur);
            jQuery('#et_glass_blur_val').text(settings.glassBlur + 'px');
        });

        // Glass opacity
        jQuery('#et_glass_opacity_panel').off('input.panel').on('input.panel', function() {
            settings.glassOpacity = parseInt(jQuery(this).val());
            jQuery('#et_glass_opacity_val_panel').text(settings.glassOpacity + '%');
            applyAppearanceSettings();
            saveSettings();
            // Sync with modal
            jQuery('#et_glass_opacity').val(settings.glassOpacity);
            jQuery('#et_glass_opacity_val').text(settings.glassOpacity + '%');
        });

        // FAB Size
        jQuery('#et_fab_size_panel').off('input.panel').on('input.panel', function() {
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
        jQuery('#et_fab_icon_panel').off('click.panel', '.et-dd-option').on('click.panel', '#et_fab_icon_panel .et-dd-option', function() {
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

    function buildSystemPrompt() {
        const char = getCurrentCharacter();
        if (!char) return 'You are a helpful assistant. Reply concisely like in a text message. You may use Markdown formatting like **bold**, *italic*, and `code`.';

        const name = char.name || 'Character';
        const context = SillyTavern.getContext();

        let prompt = `You are ${name}, texting ${getUserName()} in a casual text message conversation.`;

        // Description
        if (settings.ctxDescription !== false && char.description) {
            prompt += `\n\n${name}'s description: ${char.description}`;
        }

        // Personality
        if (settings.ctxPersonality !== false && char.personality) {
            prompt += `\n\n${name}'s personality: ${char.personality}`;
        }

        // Scenario
        if (settings.ctxScenario !== false && char.scenario) {
            prompt += `\n\nScenario: ${char.scenario}`;
        }

        // Persona (user's persona description)
        if (settings.ctxPersona === true) {
            const persona = context.persona || context.name2 || '';
            const personaDescription = context.personaDescription || '';
            if (personaDescription) {
                prompt += `\n\n${getUserName()}'s persona: ${personaDescription}`;
            }
        }

        // World Info / Lorebook entries
        if (settings.ctxWorldInfo === true) {
            try {
                const worldInfoData = getActiveWorldInfoEntries();
                if (worldInfoData) {
                    prompt += `\n\nWorld Information:\n${worldInfoData}`;
                }
            } catch (e) { /* ignore */ }
        }

        // SillyTavern chat messages
        if (settings.ctxSTMessages === true) {
            try {
                const stMessages = getSTChatMessages(settings.ctxSTMessageCount || 10);
                if (stMessages) {
                    prompt += `\n\nRecent conversation context from the main chat:\n${stMessages}`;
                }
            } catch (e) { /* ignore */ }
        }

        prompt += `\n\nIMPORTANT: Reply ONLY as ${name}. Keep responses short and natural like real text messages. Do not use quotes around your response. Do not include your name as a prefix. You may use Markdown formatting: **bold**, *italic*, ~~strikethrough~~, \`code\`.`;

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

    function getSTChatMessages(count) {
        try {
            const context = SillyTavern.getContext();
            const chat = context.chat;
            if (!chat || !chat.length) return null;

            const charName = getCharacterName();
            const userName = getUserName();

            // Get the last N messages
            const recentMessages = chat.slice(-Math.max(1, count));
            const lines = recentMessages.map(msg => {
                const speaker = msg.is_user ? userName : (msg.name || charName);
                return `${speaker}: ${msg.mes || ''}`;
            });

            return lines.join('\n');
        } catch (e) {
            return null;
        }
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
        return settings.chatHistory[key] || [];
    }

    function saveChatHistory(history) {
        const key = getCharacterKey();
        if (!key) return;
        settings.chatHistory[key] = history;
        saveSettings();
    }

    function clearChatHistory() {
        const key = getCharacterKey();
        if (!key) return;
        settings.chatHistory[key] = [];
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

        const systemPrompt = buildSystemPrompt();
        const maxTokens = SillyTavern.getContext().main?.max_length || 500;

        const apiMessages = [{ role: 'system', content: systemPrompt }];
        history.forEach(msg => {
            apiMessages.push({ role: msg.is_user ? 'user' : 'assistant', content: msg.mes });
        });

        let rawPrompt = '';
        history.forEach(msg => {
            rawPrompt += `${msg.is_user ? getUserName() : getCharacterName()}: ${msg.mes}\n`;
        });
        rawPrompt += `${getCharacterName()}:`;

        let result = '';

        try {
            if (settings.source === 'profile') {
                if (!settings.preset) throw new Error('Please select a connection profile in EchoText settings.');
                const context = SillyTavern.getContext();
                const cm = context.extensionSettings?.connectionManager;
                const profile = cm?.profiles?.find(p => p.name === settings.preset);
                if (!profile) throw new Error(`Profile '${settings.preset}' not found.`);
                if (!context.ConnectionManagerRequestService) throw new Error('ConnectionManagerRequestService not available.');

                const response = await context.ConnectionManagerRequestService.sendRequest(
                    profile.id, apiMessages, maxTokens,
                    { stream: false, signal: abortController.signal, extractData: true, includePreset: true, includeInstruct: true }
                );
                result = extractTextFromResponse(response);

            } else if (settings.source === 'ollama') {
                const baseUrl = (settings.ollama_url || 'http://localhost:11434').replace(/\/$/, '');
                if (!settings.ollama_model) throw new Error('No Ollama model selected.');

                const response = await fetch(`${baseUrl}/api/chat`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ model: settings.ollama_model, messages: apiMessages, stream: false, options: { num_ctx: 4096, num_predict: maxTokens } }),
                    signal: abortController.signal
                });
                if (!response.ok) throw new Error(`Ollama API error: ${response.status}`);
                const data = await response.json();
                result = data.message?.content || data.response || '';

            } else if (settings.source === 'openai') {
                const baseUrl = (settings.openai_url || 'http://localhost:1234/v1').replace(/\/$/, '');
                const headers = { 'Content-Type': 'application/json' };
                if (settings.openai_key) headers['Authorization'] = `Bearer ${settings.openai_key}`;

                const response = await fetch(`${baseUrl}/chat/completions`, {
                    method: 'POST', headers,
                    body: JSON.stringify({ model: settings.openai_model || 'local-model', messages: apiMessages, temperature: 0.8, max_tokens: maxTokens, stream: false }),
                    signal: abortController.signal
                });
                if (!response.ok) throw new Error(`API error: ${response.status}`);
                const data = await response.json();
                result = data.choices?.[0]?.message?.content || '';

            } else {
                const context = SillyTavern.getContext();
                const { generateRaw } = context;
                if (!generateRaw) throw new Error('generateRaw not available in context.');

                const abortPromise = new Promise((_, reject) => {
                    abortController.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
                });
                result = await Promise.race([
                    generateRaw({ systemPrompt, prompt: rawPrompt, streaming: false }),
                    abortPromise
                ]);
            }

            if (result && result.trim()) {
                const newHistory = [...history, { is_user: false, mes: result.trim(), send_date: Date.now() }];
                saveChatHistory(newHistory);
                renderMessages(newHistory);
            }

        } catch (err) {
            if (err.name === 'AbortError' || (abortController && abortController.signal.aborted)) {
                log('Generation cancelled');
            } else {
                error('Generation failed:', err);
                toastr.error(`EchoText: ${err.message}`);
            }
        } finally {
            isGenerating = false;
            abortController = null;
            updateSendButton(false);
        }
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
            if (!char || !char.avatar) return null;
            // SillyTavern serves character avatars at /characters/<avatar>
            // The avatar field is typically "CharName.png" or similar
            const avatarFile = char.avatar;
            if (!avatarFile || avatarFile === 'none') return null;
            return `/characters/${encodeURIComponent(avatarFile)}`;
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

    function buildPanelHtml() {
        const charName = getCharacterName();

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
                        <div class="et-char-name" id="et-char-name">${charName}</div>
                        <div class="et-char-status" id="et-char-status">EchoText</div>
                    </div>
                </div>
                <div class="et-header-right">
                    <div class="et-header-btn" id="et-clear-btn" title="Clear chat history">
                        <i class="fa-solid fa-trash-can"></i>
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
        bindPanelEvents();

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

    function bindPanelEvents() {
        makePanelDraggable();
        makePanelResizable();

        jQuery('#et-close-btn').on('click', closePanel);
        jQuery('#et-settings-btn').on('click', openSettingsModal);

        jQuery('#et-clear-btn').on('click', async () => {
            const confirmed = await showConfirmModal('Clear all chat history with this character?');
            if (confirmed) {
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

        const history = getChatHistory();
        const newHistory = [...history, { is_user: true, mes: text, send_date: Date.now() }];
        saveChatHistory(newHistory);
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

    // FA icon reactions: { id, icon, label, color }
    // color is a CSS color string used for the icon tint
    const FA_REACTIONS = [
        { id: 'heart',    icon: 'fa-solid fa-heart',           label: 'Love',    color: '#ff4d6d' },
        { id: 'haha',     icon: 'fa-solid fa-face-laugh-squint', label: 'Haha',  color: '#fbbf24' },
        { id: 'wow',      icon: 'fa-solid fa-face-surprise',   label: 'Wow',     color: '#fb923c' },
        { id: 'sad',      icon: 'fa-solid fa-face-sad-tear',   label: 'Sad',     color: '#60a5fa' },
        { id: 'fire',     icon: 'fa-solid fa-fire',            label: 'Fire',    color: '#f97316' },
        { id: 'like',     icon: 'fa-solid fa-thumbs-up',       label: 'Like',    color: 'var(--et-theme-color)' },
        { id: 'star',     icon: 'fa-solid fa-star',            label: 'Star',    color: '#facc15' },
        { id: 'bolt',     icon: 'fa-solid fa-bolt',            label: 'Zap',     color: '#a78bfa' },
    ];

    function formatMessageText(rawText) {
        const { DOMPurify } = SillyTavern.libs;
        // Sanitize but allow basic formatting tags
        const safeText = DOMPurify.sanitize(rawText || '', {
            ALLOWED_TAGS: ['strong', 'em', 'del', 'code', 'br', 'u'],
            ALLOWED_ATTR: []
        });
        // Apply markdown-style formatting
        return safeText
            .replace(/\*\*\*(.*?)\*\*\*/gs, '<strong><em>$1</em></strong>')
            .replace(/\*\*(.*?)\*\*/gs, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/gs, '<em>$1</em>')
            .replace(/__(.*?)__/gs, '<u>$1</u>')
            .replace(/_(.*?)_/gs, '<em>$1</em>')
            .replace(/~~(.*?)~~/gs, '<del>$1</del>')
            .replace(/`(.+?)`/g, '<code>$1</code>')
            .replace(/\n/g, '<br>');
    }

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

        history.forEach((msg, index) => {
            const isUser = msg.is_user;
            const formattedText = formatMessageText(msg.mes);
            const time = new Date(msg.send_date || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            let bubbleHtml;
            if (isUser) {
                bubbleHtml = `
                <div class="et-message et-message-user" data-index="${index}">
                    <div class="et-bubble et-bubble-user">
                        <div class="et-bubble-text">${formattedText}</div>
                        <div class="et-message-footer">
                            <span class="et-message-time">${time}</span>
                        </div>
                    </div>
                </div>`;
            } else {
                const safeCharName = DOMPurify.sanitize(charName, { ALLOWED_TAGS: [] });
                const avatarHtml = settings.showAvatar !== false
                    ? buildAvatarHtml(charName, '', '', true)
                    : '';

                bubbleHtml = `
                <div class="et-message et-message-char" data-index="${index}">
                    ${avatarHtml}
                    <div class="et-message-body">
                        <div class="et-bubble et-bubble-char">
                            <div class="et-bubble-text">${formattedText}</div>
                            <div class="et-message-footer">
                                <span class="et-footer-name">${safeCharName}</span>
                                <span class="et-message-time">${time}</span>
                                <div class="et-active-reactions" id="et-reactions-${index}"></div>
                                <button class="et-react-btn" data-index="${index}" title="React">
                                    <i class="fa-regular fa-face-smile"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>`;
            }

            inner.append(bubbleHtml);
        });

        // Bind react buttons
        inner.find('.et-react-btn').on('click', function (e) {
            e.stopPropagation();
            const btn = jQuery(this);
            const msgIndex = parseInt(btn.data('index'));
            toggleReactOverlay(btn, msgIndex);
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

    function addReaction(msgIndex, reactionId) {
        const container = jQuery(`#et-reactions-${msgIndex}`);
        if (!container.length) return;

        // Look up the reaction definition
        const reactDef = FA_REACTIONS.find(r => r.id === reactionId);
        if (!reactDef) return;

        // Check if this reaction already has a pill
        const existing = container.find(`.et-reaction-pill[data-emoji="${reactionId}"]`);
        if (existing.length) {
            const countEl = existing.find('.et-reaction-count');
            const count = parseInt(countEl.text()) || 1;
            if (existing.hasClass('et-reaction-mine')) {
                // Toggle off
                existing.removeClass('et-reaction-mine');
                if (count <= 1) {
                    existing.addClass('et-reaction-removing');
                    setTimeout(() => existing.remove(), 200);
                } else {
                    countEl.text(count - 1);
                }
            } else {
                existing.addClass('et-reaction-mine');
                countEl.text(count + 1);
            }
        } else {
            const pill = jQuery(`
                <button class="et-reaction-pill et-reaction-mine et-reaction-new" data-emoji="${reactionId}" title="${reactDef.label}" style="--react-color:${reactDef.color}">
                    <i class="${reactDef.icon} et-reaction-icon"></i>
                    <span class="et-reaction-count">1</span>
                </button>
            `);
            container.append(pill);
            // Remove new animation class after animation
            setTimeout(() => pill.removeClass('et-reaction-new'), 400);

            pill.on('click', function () {
                const p = jQuery(this);
                const countEl = p.find('.et-reaction-count');
                const count = parseInt(countEl.text()) || 1;
                if (p.hasClass('et-reaction-mine')) {
                    p.removeClass('et-reaction-mine');
                    if (count <= 1) {
                        p.addClass('et-reaction-removing');
                        setTimeout(() => p.remove(), 200);
                    } else {
                        countEl.text(count - 1);
                    }
                } else {
                    p.addClass('et-reaction-mine');
                    countEl.text(count + 1);
                }
            });
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
                updateThemePreviewFull(value);
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

    // ============================================================
    // SETTINGS MODAL
    // ============================================================

    function buildSettingsModalHtml() {
        return `
        <div id="et-settings-modal" class="et-settings-modal">
            <div class="et-settings-overlay" id="et-settings-overlay"></div>
            <div class="et-settings-dialog">
                <div class="et-settings-header">
                    <div class="et-settings-title">
                        <i class="fa-solid fa-comment-dots"></i> EchoText Settings
                    </div>
                    <div class="et-settings-close" id="et-settings-close" title="Close settings">
                        <i class="fa-solid fa-xmark"></i>
                    </div>
                </div>

                <div class="et-settings-body">
                    <nav class="et-settings-nav">
                        <div class="et-nav-item active" data-section="general">
                            <i class="fa-solid fa-toggle-on"></i> General
                        </div>
                        <div class="et-nav-item" data-section="engine">
                            <i class="fa-solid fa-microchip"></i> Generation Engine
                        </div>
                        <div class="et-nav-item" data-section="context">
                            <i class="fa-solid fa-file-lines"></i> Context
                        </div>
                        <div class="et-nav-item" data-section="appearance">
                            <i class="fa-solid fa-palette"></i> Appearance
                        </div>
                        <div class="et-nav-item" data-section="fab">
                            <i class="fa-solid fa-circle-dot"></i> Action Button
                        </div>
                    </nav>

                    <div class="et-settings-content">

                        <!-- GENERAL -->
                        <div class="et-settings-section active" id="et-section-general">
                            <h3><i class="fa-solid fa-toggle-on"></i> General</h3>

                            <div class="et-field">
                                <label class="et-toggle-row" for="et_enabled">
                                    <input type="checkbox" id="et_enabled" class="checkbox">
                                    <span class="et-label-text"><i class="fa-solid fa-power-off"></i> Enable EchoText</span>
                                </label>
                                <div class="et-hint">Show the EchoText floating action button and panel.</div>
                            </div>

                            <div class="et-field">
                                <label class="et-toggle-row" for="et_auto_scroll">
                                    <input type="checkbox" id="et_auto_scroll" class="checkbox">
                                    <span class="et-label-text"><i class="fa-solid fa-arrow-down"></i> Auto-scroll to Latest Message</span>
                                </label>
                            </div>

                            <div class="et-field">
                                <label class="et-toggle-row" for="et_show_avatar">
                                    <input type="checkbox" id="et_show_avatar" class="checkbox">
                                    <span class="et-label-text"><i class="fa-solid fa-circle-user"></i> Show Character Avatar</span>
                                </label>
                                <div class="et-hint">Display the character's avatar image (or initial circle) next to their messages.</div>
                            </div>
                        </div>

                        <!-- GENERATION ENGINE -->
                        <div class="et-settings-section" id="et-section-engine">
                            <h3><i class="fa-solid fa-microchip"></i> Generation Engine</h3>

                            <div class="et-field">
                                <label class="et-field-label"><i class="fa-solid fa-plug"></i> Source</label>
                                <div class="et-select-wrapper">
                                    <select id="et_source" class="et-select">
                                        <option value="default">Default (Main API)</option>
                                        <option value="profile">Connection Profile (Recommended)</option>
                                        <option value="ollama">Ollama (Local)</option>
                                        <option value="openai">OpenAI Compatible</option>
                                    </select>
                                    <i class="fa-solid fa-chevron-down et-select-arrow"></i>
                                </div>
                            </div>

                            <div id="et_profile_settings" class="et-sub-panel" style="display:none;">
                                <div class="et-sub-panel-title"><i class="fa-solid fa-link"></i> Connection Profile</div>
                                <div class="et-select-wrapper">
                                    <select id="et_profile_select" class="et-select"></select>
                                    <i class="fa-solid fa-chevron-down et-select-arrow"></i>
                                </div>
                                <div class="et-hint"><i class="fa-solid fa-shield-halved"></i> Uses your existing SillyTavern credentials securely.</div>
                            </div>

                            <div id="et_ollama_settings" class="et-sub-panel" style="display:none;">
                                <div class="et-sub-panel-title"><i class="fa-solid fa-terminal"></i> Ollama</div>
                                <input id="et_ollama_url" type="text" class="et-input-text" placeholder="http://localhost:11434">
                                <div class="et-select-wrapper">
                                    <select id="et_ollama_model_select" class="et-select"></select>
                                    <i class="fa-solid fa-chevron-down et-select-arrow"></i>
                                </div>
                                <div id="et_ollama_status" class="et-status-note"></div>
                            </div>

                            <div id="et_openai_settings" class="et-sub-panel" style="display:none;">
                                <div class="et-sub-panel-title"><i class="fa-solid fa-cloud"></i> OpenAI Compatible</div>
                                <div class="et-select-wrapper">
                                    <select id="et_openai_preset" class="et-select">
                                        <option value="custom">Custom</option>
                                        <option value="lmstudio">LM Studio (:1234)</option>
                                        <option value="kobold">KoboldCPP (:5001)</option>
                                        <option value="textgen">TextGenWebUI (:5000)</option>
                                        <option value="vllm">vLLM (:8000)</option>
                                    </select>
                                    <i class="fa-solid fa-chevron-down et-select-arrow"></i>
                                </div>
                                <input id="et_openai_url" type="text" class="et-input-text" placeholder="http://localhost:1234/v1">
                                <input id="et_openai_key" type="password" class="et-input-text" placeholder="API Key (Optional)">
                                <input id="et_openai_model" type="text" class="et-input-text" placeholder="Model name">
                            </div>
                        </div>

                        <!-- CONTEXT -->
                        <div class="et-settings-section" id="et-section-context">
                            <h3><i class="fa-solid fa-file-lines"></i> Context</h3>
                            <div class="et-hint" style="margin-bottom:16px;">Choose what information from SillyTavern to include in the character's context when generating responses.</div>

                            <div class="et-field">
                                <label class="et-toggle-row" for="et_ctx_description">
                                    <input type="checkbox" id="et_ctx_description" class="checkbox">
                                    <span class="et-label-text"><i class="fa-solid fa-address-card"></i> Character Description</span>
                                </label>
                                <div class="et-hint et-hint-indent">Include the character's description field in the system prompt.</div>
                            </div>

                            <div class="et-field">
                                <label class="et-toggle-row" for="et_ctx_personality">
                                    <input type="checkbox" id="et_ctx_personality" class="checkbox">
                                    <span class="et-label-text"><i class="fa-solid fa-brain"></i> Personality</span>
                                </label>
                                <div class="et-hint et-hint-indent">Include the character's personality field.</div>
                            </div>

                            <div class="et-field">
                                <label class="et-toggle-row" for="et_ctx_scenario">
                                    <input type="checkbox" id="et_ctx_scenario" class="checkbox">
                                    <span class="et-label-text"><i class="fa-solid fa-map"></i> Scenario</span>
                                </label>
                                <div class="et-hint et-hint-indent">Include the scenario/world context field.</div>
                            </div>

                            <div class="et-field">
                                <label class="et-toggle-row" for="et_ctx_persona">
                                    <input type="checkbox" id="et_ctx_persona" class="checkbox">
                                    <span class="et-label-text"><i class="fa-solid fa-face-smile"></i> Your Persona</span>
                                </label>
                                <div class="et-hint et-hint-indent">Include your active persona description.</div>
                            </div>

                            <div class="et-field">
                                <label class="et-toggle-row" for="et_ctx_world_info">
                                    <input type="checkbox" id="et_ctx_world_info" class="checkbox">
                                    <span class="et-label-text"><i class="fa-solid fa-globe"></i> World Info / Lorebook</span>
                                </label>
                                <div class="et-hint et-hint-indent">Include active World Info / Lorebook entries.</div>
                            </div>

                            <div class="et-field">
                                <label class="et-toggle-row" for="et_ctx_st_messages">
                                    <input type="checkbox" id="et_ctx_st_messages" class="checkbox">
                                    <span class="et-label-text"><i class="fa-solid fa-comments"></i> SillyTavern Chat Messages</span>
                                </label>
                                <div class="et-hint et-hint-indent">Include recent messages from the main SillyTavern chat as context.</div>
                                <div id="et_ctx_st_message_count_container" class="et-sub-field" style="display:none; margin-top:10px;">
                                    <label class="et-field-label" for="et_ctx_st_message_count">
                                        <i class="fa-solid fa-hashtag"></i> Number of Messages
                                    </label>
                                    <div class="et-slider-row">
                                        <input type="range" id="et_ctx_st_message_count" class="slider et-slider" min="1" max="50" step="1" value="10">
                                        <span id="et_ctx_st_message_count_val" class="et-slider-val">10</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- APPEARANCE -->
                        <div class="et-settings-section" id="et-section-appearance">
                            <h3><i class="fa-solid fa-palette"></i> Appearance</h3>

                            <div class="et-field">
                                <label class="et-field-label"><i class="fa-solid fa-swatchbook"></i> Theme</label>
                                ${buildThemeDropdownHtml(settings.theme)}
                            </div>

                            <div class="et-field">
                                <label class="et-field-label" for="et_font_size">
                                    <i class="fa-solid fa-font"></i> Font Size
                                </label>
                                <div class="et-slider-row">
                                    <input type="range" id="et_font_size" class="slider et-slider" min="10" max="24" step="1" value="15">
                                    <span id="et_font_size_val" class="et-slider-val">15px</span>
                                </div>
                            </div>

                            <div class="et-field">
                                <label class="et-field-label"><i class="fa-solid fa-text-height"></i> Font Family</label>
                                ${buildFontDropdownHtml(settings.fontFamily)}
                            </div>

                            <div class="et-field">
                                <label class="et-field-label" for="et_glass_blur">
                                    <i class="fa-solid fa-droplet"></i> Glassmorphism Blur
                                </label>
                                <div class="et-slider-row">
                                    <input type="range" id="et_glass_blur" class="slider et-slider" min="0" max="40" step="2" value="20">
                                    <span id="et_glass_blur_val" class="et-slider-val">20px</span>
                                </div>
                            </div>

                            <div class="et-field">
                                <label class="et-field-label" for="et_glass_opacity">
                                    <i class="fa-solid fa-eye"></i> Panel Opacity
                                </label>
                                <div class="et-slider-row">
                                    <input type="range" id="et_glass_opacity" class="slider et-slider" min="20" max="100" step="5" value="85">
                                    <span id="et_glass_opacity_val" class="et-slider-val">85%</span>
                                </div>
                            </div>
                        </div>

                        <!-- ACTION BUTTON -->
                        <div class="et-settings-section" id="et-section-fab">
                            <h3><i class="fa-solid fa-circle-dot"></i> Action Button</h3>

                            <div class="et-field">
                                <label class="et-field-label" for="et_fab_size">
                                    <i class="fa-solid fa-expand"></i> Button Size
                                </label>
                                <div class="et-slider-row">
                                    <input type="range" id="et_fab_size" class="slider et-slider" min="22" max="76" step="2" value="56">
                                    <span id="et_fab_size_val" class="et-slider-val">56px</span>
                                </div>
                            </div>

                            <div class="et-field">
                                <label class="et-field-label">
                                    <i class="fa-solid fa-icons"></i> Button Icon
                                </label>
                                <div class="et-icon-grid">
                                    <button class="et-icon-option" data-icon="fa-comment-dots" title="Comment Dots"><i class="fa-solid fa-comment-dots"></i></button>
                                    <button class="et-icon-option" data-icon="fa-message" title="Message"><i class="fa-solid fa-message"></i></button>
                                    <button class="et-icon-option" data-icon="fa-comments" title="Comments"><i class="fa-solid fa-comments"></i></button>
                                    <button class="et-icon-option" data-icon="fa-mobile-screen" title="Mobile"><i class="fa-solid fa-mobile-screen"></i></button>
                                    <button class="et-icon-option" data-icon="fa-robot" title="Robot"><i class="fa-solid fa-robot"></i></button>
                                    <button class="et-icon-option" data-icon="fa-heart" title="Heart"><i class="fa-solid fa-heart"></i></button>
                                    <button class="et-icon-option" data-icon="fa-star" title="Star"><i class="fa-solid fa-star"></i></button>
                                    <button class="et-icon-option" data-icon="fa-bolt" title="Bolt"><i class="fa-solid fa-bolt"></i></button>
                                    <button class="et-icon-option" data-icon="fa-fire" title="Fire"><i class="fa-solid fa-fire"></i></button>
                                    <button class="et-icon-option" data-icon="fa-wand-magic-sparkles" title="Magic"><i class="fa-solid fa-wand-magic-sparkles"></i></button>
                                </div>
                            </div>
                        </div>

                    </div>
                </div>
            </div>
        </div>`;
    }

    function openSettingsModal() {
        jQuery('#et-settings-modal').remove();
        jQuery('body').append(buildSettingsModalHtml());

        applySettingsToUI();
        populateConnectionProfiles();
        if (settings.source === 'ollama') fetchOllamaModels();

        // Update font preview
        updateFontPreview(settings.fontFamily);
        updateThemePreviewFull(settings.theme);

        requestAnimationFrame(() => {
            jQuery('#et-settings-modal').addClass('et-settings-visible');
        });

        // Initialize custom dropdowns
        initCustomDropdowns();

        bindSettingsModalEvents();
    }

    function closeSettingsModal() {
        const modal = jQuery('#et-settings-modal');
        modal.removeClass('et-settings-visible');
        // Remove custom dropdown event listeners
        jQuery(document).off('click.et-dd');
        setTimeout(() => modal.remove(), 250);
    }

    function updateFontPreview(fontFamily) {
        const preview = jQuery('#et_font_preview');
        if (!preview.length) return;
        loadGoogleFont(fontFamily);
        preview.css('font-family', `'${fontFamily}', sans-serif`);
    }

    function updateThemePreviewFull(themeKey) {
        const theme = THEME_PRESETS[themeKey] || THEME_PRESETS.sillytavern;
        const preview = jQuery('#et_theme_preview');
        const desc = jQuery('#et_theme_desc');
        if (preview.length) {
            preview.html((theme.swatches || []).map(c =>
                `<span class="et-theme-swatch" style="background:${c};"></span>`
            ).join(''));
        }
        if (desc.length) desc.text(theme.description || '');
    }

    function bindSettingsModalEvents() {
        jQuery('#et-settings-close, #et-settings-overlay').on('click', closeSettingsModal);

        const onKey = (e) => {
            if (e.key === 'Escape') { document.removeEventListener('keydown', onKey); closeSettingsModal(); }
        };
        document.addEventListener('keydown', onKey);

        jQuery('.et-nav-item').on('click', function () {
            const section = jQuery(this).data('section');
            jQuery('.et-nav-item').removeClass('active');
            jQuery(this).addClass('active');
            jQuery('.et-settings-section').removeClass('active');
            jQuery(`#et-section-${section}`).addClass('active');
        });

        // General - Enable toggle
        jQuery('#et_enabled').on('change', function () {
            settings.enabled = jQuery(this).is(':checked');
            saveSettings();
            toggleEchoTextMaster();
            // Sync with panel toggles
            jQuery('#et_enabled_quick').prop('checked', settings.enabled);
            jQuery('#et_enabled_panel').prop('checked', settings.enabled);
        });

        jQuery('#et_auto_scroll').on('change', function () {
            settings.autoScroll = jQuery(this).is(':checked');
            saveSettings();
            // Sync with panel
            jQuery('#et_auto_scroll_panel').prop('checked', settings.autoScroll);
        });

        jQuery('#et_show_avatar').on('change', function () {
            settings.showAvatar = jQuery(this).is(':checked');
            saveSettings();
            // Sync with panel
            jQuery('#et_show_avatar_panel').prop('checked', settings.showAvatar);
            // Update avatar visibility in open panel
            if (panelOpen) {
                jQuery('#et-char-avatar').toggleClass('et-avatar-hidden', !settings.showAvatar);
                const history = getChatHistory();
                renderMessages(history);
            }
        });

        // Generation Engine
        jQuery('#et_source').on('change', function () {
            settings.source = jQuery(this).val();
            saveSettings();
            updateProviderVisibility();
            // Sync with panel
            jQuery('#et_source_panel').val(settings.source);
            updateProviderVisibilityPanel();
            if (settings.source === 'profile') populateConnectionProfiles();
            if (settings.source === 'ollama') fetchOllamaModels();
        });

        jQuery('#et_profile_select').on('change', function () {
            settings.preset = jQuery(this).val();
            saveSettings();
            // Sync with panel
            jQuery('#et_profile_select_panel').val(settings.preset);
        });

        jQuery('#et_ollama_url').on('change', function () {
            settings.ollama_url = jQuery(this).val();
            saveSettings();
            // Sync with panel
            jQuery('#et_ollama_url_panel').val(settings.ollama_url);
            fetchOllamaModels();
        });

        jQuery('#et_ollama_model_select').on('change', function () {
            settings.ollama_model = jQuery(this).val();
            saveSettings();
            // Sync with panel
            jQuery('#et_ollama_model_select_panel').val(settings.ollama_model);
        });

        jQuery('#et_openai_preset').on('change', function () {
            settings.openai_preset = jQuery(this).val();
            const presets = { lmstudio: 'http://localhost:1234/v1', kobold: 'http://localhost:5001/v1', textgen: 'http://localhost:5000/v1', vllm: 'http://localhost:8000/v1' };
            if (presets[settings.openai_preset]) {
                settings.openai_url = presets[settings.openai_preset];
                jQuery('#et_openai_url').val(settings.openai_url);
            }
            saveSettings();
            // Sync with panel
            jQuery('#et_openai_preset_panel').val(settings.openai_preset);
            jQuery('#et_openai_url_panel').val(settings.openai_url);
        });

        jQuery('#et_openai_url').on('change', function () {
            settings.openai_url = jQuery(this).val();
            saveSettings();
            // Sync with panel
            jQuery('#et_openai_url_panel').val(settings.openai_url);
        });

        jQuery('#et_openai_key').on('change', function () {
            settings.openai_key = jQuery(this).val();
            saveSettings();
            // Sync with panel
            jQuery('#et_openai_key_panel').val(settings.openai_key);
        });

        jQuery('#et_openai_model').on('change', function () {
            settings.openai_model = jQuery(this).val();
            saveSettings();
            // Sync with panel
            jQuery('#et_openai_model_panel').val(settings.openai_model);
        });

        // Context settings
        jQuery('#et_ctx_description').on('change', function () {
            settings.ctxDescription = jQuery(this).is(':checked');
            saveSettings();
            // Sync with panel
            jQuery('#et_ctx_description_panel').prop('checked', settings.ctxDescription);
        });

        jQuery('#et_ctx_personality').on('change', function () {
            settings.ctxPersonality = jQuery(this).is(':checked');
            saveSettings();
            // Sync with panel
            jQuery('#et_ctx_personality_panel').prop('checked', settings.ctxPersonality);
        });

        jQuery('#et_ctx_scenario').on('change', function () {
            settings.ctxScenario = jQuery(this).is(':checked');
            saveSettings();
            // Sync with panel
            jQuery('#et_ctx_scenario_panel').prop('checked', settings.ctxScenario);
        });

        jQuery('#et_ctx_persona').on('change', function () {
            settings.ctxPersona = jQuery(this).is(':checked');
            saveSettings();
            // Sync with panel
            jQuery('#et_ctx_persona_panel').prop('checked', settings.ctxPersona);
        });

        jQuery('#et_ctx_world_info').on('change', function () {
            settings.ctxWorldInfo = jQuery(this).is(':checked');
            saveSettings();
            // Sync with panel
            jQuery('#et_ctx_world_info_panel').prop('checked', settings.ctxWorldInfo);
        });

        jQuery('#et_ctx_st_messages').on('change', function () {
            settings.ctxSTMessages = jQuery(this).is(':checked');
            jQuery('#et_ctx_st_message_count_container').toggle(settings.ctxSTMessages);
            saveSettings();
            // Sync with panel
            jQuery('#et_ctx_st_messages_panel').prop('checked', settings.ctxSTMessages);
            jQuery('#et_ctx_st_message_count_container_panel').toggle(settings.ctxSTMessages);
        });

        jQuery('#et_ctx_st_message_count').on('input', function () {
            settings.ctxSTMessageCount = parseInt(jQuery(this).val());
            jQuery('#et_ctx_st_message_count_val').text(settings.ctxSTMessageCount);
            saveSettings();
            // Sync with panel
            jQuery('#et_ctx_st_message_count_panel').val(settings.ctxSTMessageCount);
            jQuery('#et_ctx_st_message_count_val_panel').text(settings.ctxSTMessageCount);
        });

        // Appearance
        jQuery('#et_font_size').on('input', function () {
            settings.fontSize = parseInt(jQuery(this).val());
            jQuery('#et_font_size_val').text(settings.fontSize + 'px');
            applyAppearanceSettings();
            saveSettings();
            // Sync with panel
            jQuery('#et_font_size_panel').val(settings.fontSize);
            jQuery('#et_font_size_val_panel').text(settings.fontSize + 'px');
        });

        jQuery('#et_glass_blur').on('input', function () {
            settings.glassBlur = parseInt(jQuery(this).val());
            jQuery('#et_glass_blur_val').text(settings.glassBlur + 'px');
            applyAppearanceSettings();
            saveSettings();
            // Sync with panel
            jQuery('#et_glass_blur_panel').val(settings.glassBlur);
            jQuery('#et_glass_blur_val_panel').text(settings.glassBlur + 'px');
        });

        jQuery('#et_glass_opacity').on('input', function () {
            settings.glassOpacity = parseInt(jQuery(this).val());
            jQuery('#et_glass_opacity_val').text(settings.glassOpacity + '%');
            applyAppearanceSettings();
            saveSettings();
            // Sync with panel
            jQuery('#et_glass_opacity_panel').val(settings.glassOpacity);
            jQuery('#et_glass_opacity_val_panel').text(settings.glassOpacity + '%');
        });

        // Action Button
        jQuery('#et_fab_size').on('input', function () {
            settings.fabSize = parseInt(jQuery(this).val());
            jQuery('#et_fab_size_val').text(settings.fabSize + 'px');
            applyAppearanceSettings();
            positionFab();
            saveSettings();
            // Sync with panel
            jQuery('#et_fab_size_panel').val(settings.fabSize);
            jQuery('#et_fab_size_val_panel').text(settings.fabSize + 'px');
        });

        jQuery('.et-icon-option').on('click', function () {
            jQuery('.et-icon-option').removeClass('selected');
            jQuery(this).addClass('selected');
            settings.fabIcon = jQuery(this).data('icon');
            applyAppearanceSettings();
            saveSettings();
            // Sync with panel
            jQuery('#et_fab_icon_panel').attr('data-value', settings.fabIcon);
            initCustomDropdownPanel('et_fab_icon_panel', settings.fabIcon);
        });
    }

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

            jQuery('body').append(html);
            requestAnimationFrame(() => jQuery('#et-confirm-modal').addClass('et-confirm-visible'));

            const cleanup = (result) => {
                const overlay = jQuery('#et-confirm-modal');
                overlay.removeClass('et-confirm-visible');
                setTimeout(() => overlay.remove(), 200);
                resolve(result);
            };

            jQuery('#et-confirm-ok').on('click', () => cleanup(true));
            jQuery('#et-confirm-cancel').on('click', () => cleanup(false));
            jQuery('#et-confirm-modal').on('click', function (e) { if (e.target === this) cleanup(false); });

            const onKey = (e) => {
                if (e.key === 'Escape') { document.removeEventListener('keydown', onKey); cleanup(false); }
                if (e.key === 'Enter') { document.removeEventListener('keydown', onKey); cleanup(true); }
            };
            document.addEventListener('keydown', onKey);
        });
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

        loadSettings();

        jQuery('body').append(buildFabHtml());
        positionFab();
        makeFabDraggable();

        jQuery('#et-fab').on('click', function () {
            if (fabDragging) return;
            if (panelOpen) closePanel();
            else openPanel();
        });

        jQuery(document).on('click', '#et-open-settings-btn', openSettingsModal);

        toggleEchoTextMaster();

        const context = SillyTavern.getContext();
        context.eventSource.on(context.event_types.CHAT_CHANGED, () => {
            if (panelOpen) {
                const charName = getCharacterName();
                const char = getCurrentCharacter();
                const avatarInitial = charName.charAt(0).toUpperCase();
                const avatarColor = getCharAvatarColor(charName);

                jQuery('#et-char-name').text(charName);
                jQuery('#et-char-avatar').text(avatarInitial).css('background-color', avatarColor);
                jQuery('#et-input').attr('placeholder', `Text ${charName}...`);

                const history = getChatHistory();
                renderMessages(history);
            }
        });

        log('EchoText initialized successfully');
    }

    // ============================================================
    // ENTRY POINT
    // ============================================================

    jQuery(async () => {
        const context = SillyTavern.getContext();
        context.eventSource.on(context.event_types.APP_READY, initEchoText);
    });

})();
