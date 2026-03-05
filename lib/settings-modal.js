(function () {
    'use strict';

    function createSettingsModal(api) {
        const {
            getSettings,
            saveSettings,
            getThemePresets,
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
        } = api;

        function settings() {
            return getSettings();
        }

        function THEME_PRESETS() {
            return getThemePresets();
        }

        // ============================================================
        // PROMPT MANAGER HTML
        // ============================================================

        function buildPromptCard(id, label, hint, defaultVal) {
            const s = settings();
            const val = (s[id] !== undefined && s[id] !== null && s[id] !== '') ? s[id] : defaultVal;
            const escaped = String(val).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
            return `<div class="et-pm-card" data-pm-id="${id}">
                <div class="et-pm-card-header">
                    <div>
                        <div class="et-pm-label">${label}</div>
                        <div class="et-pm-desc">${hint}</div>
                    </div>
                    <div class="et-pm-toolbar">
                        <button class="et-pm-btn" data-pm-action="copy" title="Copy to clipboard"><i class="fa-solid fa-copy"></i></button>
                        <button class="et-pm-btn" data-pm-action="paste" title="Paste from clipboard"><i class="fa-solid fa-paste"></i></button>
                        <button class="et-pm-btn et-pm-btn-reset" data-pm-action="reset" title="Reset to default"><i class="fa-solid fa-rotate-left"></i></button>
                    </div>
                </div>
                <textarea class="et-pm-textarea" id="et_pm_${id}" spellcheck="false">${escaped}</textarea>
            </div>`;
        }

        function buildPromptManagerSectionHtml() {
            const defaults = window.EchoTextConfig && window.EchoTextConfig.defaultSettings || {};
            return [
                buildPromptCard('promptSystemBase',
                    '<i class="fa-solid fa-user"></i> System Base',
                    'The opening identity line sent in every generation. Always included.',
                    defaults.promptSystemBase || ''),
                buildPromptCard('promptAntiRefusalFrame',
                    '<i class="fa-solid fa-shield-halved"></i> Anti-Refusal Frame',
                    'Prepended when Anti-Refusal is ON. Sets the roleplay fiction context at the very top of the system prompt.',
                    defaults.promptAntiRefusalFrame || ''),
                buildPromptCard('promptTetheredReminder',
                    '<i class="fa-solid fa-link"></i> Tethered Reminder (Anti-Refusal ON)',
                    'Persona-lock reminder injected when in Tethered mode with Anti-Refusal enabled.',
                    defaults.promptTetheredReminder || ''),
                buildPromptCard('promptUntetheredReminder',
                    '<i class="fa-solid fa-unlink"></i> Untethered Reminder (Anti-Refusal ON)',
                    'Persona-lock reminder injected when in Untethered mode with Anti-Refusal enabled.',
                    defaults.promptUntetheredReminder || ''),
                buildPromptCard('promptTetheredNoFrame',
                    '<i class="fa-solid fa-comment"></i> Tethered Closing (Anti-Refusal OFF)',
                    'Closing instruction when in Tethered mode with Anti-Refusal disabled.',
                    defaults.promptTetheredNoFrame || ''),
                buildPromptCard('promptUntetheredNoFrame',
                    '<i class="fa-solid fa-comment-slash"></i> Untethered Closing (Anti-Refusal OFF)',
                    'Closing instruction when in Untethered mode with Anti-Refusal disabled.',
                    defaults.promptUntetheredNoFrame || ''),
                buildPromptCard('promptChatInfluence',
                    '<i class="fa-solid fa-wand-magic-sparkles"></i> Chat Influence Header',
                    'Header line injected before the Mood / Personality / Comm Style overlay in Untethered mode.',
                    defaults.promptChatInfluence || '')
            ].join('');
        }

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
                        <div class="et-nav-item" data-section="proactive-insights">
                            <i class="fa-solid fa-clock"></i> Proactive Insights
                        </div>
                        <div class="et-nav-item" data-section="prompts">
                            <i class="fa-solid fa-scroll"></i> Prompt Manager
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
                                <label class="et-toggle-row" for="et_auto_open">
                                    <input type="checkbox" id="et_auto_open" class="checkbox">
                                    <span class="et-label-text"><i class="fa-solid fa-door-open"></i> Auto-Open on Reload</span>
                                </label>
                                <div class="et-hint">Automatically open the EchoText panel when SillyTavern loads.</div>
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

                            <div class="et-field">
                                <label class="et-toggle-row" for="et_emotion_system">
                                    <input type="checkbox" id="et_emotion_system" class="checkbox">
                                    <span class="et-label-text"><i class="fa-solid fa-heart-pulse"></i> Dynamic Emotion System</span>
                                </label>
                                <div class="et-hint">Track the character's emotional state using Plutchik's Wheel of Emotions. Emotions shift based on conversation and reactions, influencing how the character responds. Click the character's name in the panel to view their current emotional state.</div>
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

                            <div class="et-field" style="margin-top:20px;">
                                <label class="et-toggle-row" for="et_anti_refusal">
                                    <input type="checkbox" id="et_anti_refusal" class="checkbox">
                                    <span class="et-label-text"><i class="fa-solid fa-shield-halved"></i> Anti-Refusal Framing</span>
                                </label>
                                <div class="et-hint">Prepend a roleplay fiction frame and persona-lock reminder to the system prompt, and insert an in-character pre-fill for chat-completion backends (Profile / Ollama / OpenAI) to prevent out-of-character refusals.</div>
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
                                <div id="et_ctx_st_token_container" class="et-sub-field" style="display:none; margin-top:10px;">
                                    <label class="et-field-label">
                                        <i class="fa-solid fa-coins"></i> Token Budget
                                    </label>
                                    <div class="et-select-wrapper">
                                        <select id="et_ctx_st_token_preset" class="et-select">
                                            <option value="low">Low (~512 tokens)</option>
                                            <option value="medium">Medium (~1,200 tokens)</option>
                                            <option value="high">High (~2,500 tokens)</option>
                                            <option value="custom">Custom</option>
                                        </select>
                                        <i class="fa-solid fa-chevron-down et-select-arrow"></i>
                                    </div>
                                    <div id="et_ctx_st_token_custom_container" style="display:none; margin-top:8px;">
                                        <input type="number" id="et_ctx_st_token_custom"
                                            class="et-input-text" min="128" max="8192" step="128"
                                            placeholder="e.g. 2000" style="margin-bottom:0;">
                                        <div class="et-hint" style="margin-top:4px;">Approximate tokens EchoText can read from your SillyTavern chat.</div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- APPEARANCE -->
                        <div class="et-settings-section" id="et-section-appearance">
                            <h3><i class="fa-solid fa-palette"></i> Appearance</h3>

                            <div class="et-field">
                                <label class="et-field-label"><i class="fa-solid fa-swatchbook"></i> Theme</label>
                                ${buildThemeDropdownHtml(settings().theme)}
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
                                ${buildFontDropdownHtml(settings().fontFamily)}
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

                            <div class="et-field">
                                <label class="et-field-label" for="et_line_spacing">
                                    <i class="fa-solid fa-text-height"></i> Line Spacing
                                </label>
                                <div class="et-slider-row">
                                    <input type="range" id="et_line_spacing" class="slider et-slider" min="1.0" max="2.0" step="0.05" value="1.3">
                                    <span id="et_line_spacing_val" class="et-slider-val">1.30</span>
                                </div>
                                <div class="et-hint">Controls the line height of text within each message bubble.</div>
                            </div>

                            <div class="et-field">
                                <label class="et-field-label" for="et_paragraph_spacing">
                                    <i class="fa-solid fa-grip-lines"></i> Message Spacing
                                </label>
                                <div class="et-slider-row">
                                    <input type="range" id="et_paragraph_spacing" class="slider et-slider" min="2" max="24" step="2" value="12">
                                    <span id="et_paragraph_spacing_val" class="et-slider-val">12px</span>
                                </div>
                                <div class="et-hint">Controls the vertical gap between chat bubbles.</div>
                            </div>

                            <div class="et-field">
                                <label class="et-toggle-row" for="et_dynamic_emotion_panel">
                                    <input type="checkbox" id="et_dynamic_emotion_panel" class="checkbox">
                                    <span class="et-label-text"><i class="fa-solid fa-wand-sparkles"></i> Dynamic Emotion Panel</span>
                                </label>
                                <div class="et-hint">Subtle glassmorphism glow tint reflecting the character's dominant emotion. Does not override your theme color.</div>
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

                        <!-- PROACTIVE INSIGHTS -->
                        <div class="et-settings-section" id="et-section-proactive-insights">
                            <h3><i class="fa-solid fa-clock"></i> Proactive Messaging Insights</h3>

                            <div class="et-field">
                                <label class="et-field-label" for="et_proactive_rate_limit">
                                    <i class="fa-solid fa-gauge-high"></i> Proactive Rate Limit (minutes)
                                </label>
                                <input id="et_proactive_rate_limit" type="number" class="et-input-text" min="15" max="2880" step="15" value="180">
                                <div class="et-hint">Minimum time between proactive generations from the character.</div>
                            </div>

                            <div class="et-field">
                                <div class="et-proactive-controls-row">
                                    <button id="et_proactive_toggle" class="et-proactive-btn et-proactive-btn-toggle" type="button" title="Enable or disable proactive trigger checks">
                                        <i class="fa-solid fa-toggle-on"></i>
                                        <span>Proactive: Enabled</span>
                                    </button>
                                    <button id="et_proactive_refresh" class="et-proactive-btn et-proactive-btn-refresh" type="button" title="Refresh proactive insights">
                                        <i class="fa-solid fa-rotate"></i>
                                        <span>Refresh Insights</span>
                                    </button>
                                    <button id="et_trigger_message" class="et-proactive-btn et-proactive-btn-trigger" type="button" title="Send a random proactive trigger message now">
                                        <i class="fa-solid fa-bolt"></i>
                                        <span>Trigger Message</span>
                                    </button>
                                </div>
                            </div>

                            <div class="et-proactive-insights-grid">
                                <div class="et-proactive-insight-item"><span class="et-proactive-insight-label">Character</span><span class="et-proactive-insight-val" id="et_proactive_character">—</span></div>
                                <div class="et-proactive-insight-item"><span class="et-proactive-insight-label">Check cadence</span><span class="et-proactive-insight-val" id="et_proactive_tick">—</span></div>
                                <div class="et-proactive-insight-item"><span class="et-proactive-insight-label">You last messaged</span><span class="et-proactive-insight-val" id="et_proactive_last_user">—</span></div>
                                <div class="et-proactive-insight-item"><span class="et-proactive-insight-label">Character last replied</span><span class="et-proactive-insight-val" id="et_proactive_last_char">—</span></div>
                                <div class="et-proactive-insight-item"><span class="et-proactive-insight-label">Last proactive text</span><span class="et-proactive-insight-val" id="et_proactive_last_auto">—</span></div>
                                <div class="et-proactive-insight-item et-proactive-insight-wide"><span class="et-proactive-insight-label">Current status</span><span class="et-proactive-insight-val" id="et_proactive_next">—</span></div>
                                <div class="et-proactive-insight-item"><span class="et-proactive-insight-label">Last trigger</span><span class="et-proactive-insight-val" id="et_proactive_type">—</span></div>
                            </div>

                            <div class="et-field" style="margin-top:12px;">
                                <details class="et-trigger-details" id="et_trigger_details">
                                    <summary><i class="fa-solid fa-list-check"></i> Trigger Timeline Diagnostics</summary>
                                    <div class="et-trigger-list" id="et_trigger_list"></div>
                                </details>
                            </div>
                        </div>

                        <!-- PROMPT MANAGER -->
                        <div class="et-settings-section" id="et-section-prompts">
                            <h3><i class="fa-solid fa-scroll"></i> Prompt Manager</h3>
                            <div class="et-hint" style="margin-bottom:18px;">Edit the prompts sent to the AI. Changes auto-save as you type. Use <code>{{char}}</code> and <code>{{user}}</code> as placeholders. Click <b>Reset</b> to restore the factory default.</div>
                            ${buildPromptManagerSectionHtml()}
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
            if (settings().source === 'ollama') fetchOllamaModels();

            // Update font preview
            updateFontPreview(settings().fontFamily);
            updateThemePreviewFull(settings().theme);
            refreshProactiveInsights();

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
            // Remove prompt manager event listeners
            jQuery(document).off('click.et-pm').off('input.et-pm');
            setTimeout(() => modal.remove(), 250);
        }

        function updateFontPreview(fontFamily) {
            const preview = jQuery('#et_font_preview');
            if (!preview.length) return;
            loadGoogleFont(fontFamily);
            preview.css('font-family', `'${fontFamily}', sans-serif`);
        }

        function updateThemePreviewFull(themeKey) {
            const theme = THEME_PRESETS()[themeKey] || THEME_PRESETS().sillytavern;
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
                settings().enabled = jQuery(this).is(':checked');
                saveSettings();
                toggleEchoTextMaster();
                // Sync with panel toggles
                jQuery('#et_enabled_quick').prop('checked', settings().enabled);
                jQuery('#et_enabled_panel').prop('checked', settings().enabled);
            });

            jQuery('#et_auto_scroll').on('change', function () {
                settings().autoScroll = jQuery(this).is(':checked');
                saveSettings();
                // Sync with panel
                jQuery('#et_auto_scroll_panel').prop('checked', settings().autoScroll);
            });

            jQuery('#et_auto_open').on('change', function () {
                settings().autoOpenOnReload = jQuery(this).is(':checked');
                saveSettings();
                // Sync with panel
                jQuery('#et_auto_open_panel').prop('checked', settings().autoOpenOnReload);
            });

            jQuery('#et_show_avatar').on('change', function () {
                settings().showAvatar = jQuery(this).is(':checked');
                saveSettings();
                // Sync with panel
                jQuery('#et_show_avatar_panel').prop('checked', settings().showAvatar);
                // Update avatar visibility in open panel
                if (isPanelOpen()) {
                    jQuery('#et-char-avatar').toggleClass('et-avatar-hidden', !settings().showAvatar);
                    const history = getChatHistory();
                    renderMessages(history);
                }
            });

            jQuery('#et_emotion_system').on('change', function () {
                settings().emotionSystemEnabled = jQuery(this).is(':checked');
                saveSettings();
                // Sync with panel
                jQuery('#et_emotion_system_panel').prop('checked', settings().emotionSystemEnabled);
                // Update indicator visibility
                jQuery('#et-emotion-indicator').toggleClass('et-emotion-indicator-hidden', !settings().emotionSystemEnabled);
                jQuery('#et-char-name').toggleClass('et-char-name-clickable', settings().emotionSystemEnabled);
            });

            // Generation Engine
            jQuery('#et_source').on('change', function () {
                settings().source = jQuery(this).val();
                saveSettings();
                updateProviderVisibility();
                // Sync with panel
                jQuery('#et_source_panel').val(settings().source);
                updateProviderVisibilityPanel();
                if (settings().source === 'profile') populateConnectionProfiles();
                if (settings().source === 'ollama') fetchOllamaModels();
            });

            jQuery('#et_profile_select').on('change', function () {
                settings().preset = jQuery(this).val();
                saveSettings();
                // Sync with panel
                jQuery('#et_profile_select_panel').val(settings().preset);
            });

            jQuery('#et_ollama_url').on('change', function () {
                settings().ollama_url = jQuery(this).val();
                saveSettings();
                // Sync with panel
                jQuery('#et_ollama_url_panel').val(settings().ollama_url);
                fetchOllamaModels();
            });

            jQuery('#et_ollama_model_select').on('change', function () {
                settings().ollama_model = jQuery(this).val();
                saveSettings();
                // Sync with panel
                jQuery('#et_ollama_model_select_panel').val(settings().ollama_model);
            });

            jQuery('#et_openai_preset').on('change', function () {
                settings().openai_preset = jQuery(this).val();
                const presets = { lmstudio: 'http://localhost:1234/v1', kobold: 'http://localhost:5001/v1', textgen: 'http://localhost:5000/v1', vllm: 'http://localhost:8000/v1' };
                if (presets[settings().openai_preset]) {
                    settings().openai_url = presets[settings().openai_preset];
                    jQuery('#et_openai_url').val(settings().openai_url);
                }
                saveSettings();
                // Sync with panel
                jQuery('#et_openai_preset_panel').val(settings().openai_preset);
                jQuery('#et_openai_url_panel').val(settings().openai_url);
            });

            jQuery('#et_openai_url').on('change', function () {
                settings().openai_url = jQuery(this).val();
                saveSettings();
                // Sync with panel
                jQuery('#et_openai_url_panel').val(settings().openai_url);
            });

            jQuery('#et_openai_key').on('change', function () {
                settings().openai_key = jQuery(this).val();
                saveSettings();
                // Sync with panel
                jQuery('#et_openai_key_panel').val(settings().openai_key);
            });

            jQuery('#et_openai_model').on('change', function () {
                settings().openai_model = jQuery(this).val();
                saveSettings();
                // Sync with panel
                jQuery('#et_openai_model_panel').val(settings().openai_model);
            });

            jQuery('#et_anti_refusal').on('change', function () {
                settings().antiRefusal = jQuery(this).is(':checked');
                saveSettings();
                // Sync with panel
                jQuery('#et_anti_refusal_panel').prop('checked', settings().antiRefusal);
            });

            // Context settings
            jQuery('#et_ctx_description').on('change', function () {
                settings().ctxDescription = jQuery(this).is(':checked');
                saveSettings();
                // Sync with panel
                jQuery('#et_ctx_description_panel').prop('checked', settings().ctxDescription);
            });

            jQuery('#et_ctx_personality').on('change', function () {
                settings().ctxPersonality = jQuery(this).is(':checked');
                saveSettings();
                // Sync with panel
                jQuery('#et_ctx_personality_panel').prop('checked', settings().ctxPersonality);
            });

            jQuery('#et_ctx_scenario').on('change', function () {
                settings().ctxScenario = jQuery(this).is(':checked');
                saveSettings();
                // Sync with panel
                jQuery('#et_ctx_scenario_panel').prop('checked', settings().ctxScenario);
            });

            jQuery('#et_ctx_persona').on('change', function () {
                settings().ctxPersona = jQuery(this).is(':checked');
                saveSettings();
                // Sync with panel
                jQuery('#et_ctx_persona_panel').prop('checked', settings().ctxPersona);
            });

            jQuery('#et_ctx_world_info').on('change', function () {
                settings().ctxWorldInfo = jQuery(this).is(':checked');
                saveSettings();
                // Sync with panel
                jQuery('#et_ctx_world_info_panel').prop('checked', settings().ctxWorldInfo);
            });

            jQuery('#et_ctx_st_messages').on('change', function () {
                settings().ctxSTMessages = jQuery(this).is(':checked');
                jQuery('#et_ctx_st_token_container').toggle(settings().ctxSTMessages);
                saveSettings();
                // Sync with panel
                jQuery('#et_ctx_st_messages_panel').prop('checked', settings().ctxSTMessages);
                jQuery('#et_ctx_st_token_container_panel').toggle(settings().ctxSTMessages);
            });

            jQuery('#et_ctx_st_token_preset').on('change', function () {
                const preset = jQuery(this).val();
                settings().ctxSTTokenPreset = preset;
                const budgetMap = { low: 512, medium: 1200, high: 2500 };
                if (preset !== 'custom') settings().ctxSTTokenBudget = budgetMap[preset];
                jQuery('#et_ctx_st_token_custom_container').toggle(preset === 'custom');
                saveSettings();
                // Sync with panel
                jQuery('#et_ctx_st_token_preset_panel').val(preset);
                jQuery('#et_ctx_st_token_custom_container_panel').toggle(preset === 'custom');
            });

            jQuery('#et_ctx_st_token_custom').on('change input', function () {
                settings().ctxSTTokenBudget = Math.max(128, parseInt(jQuery(this).val(), 10) || 1200);
                jQuery(this).val(settings().ctxSTTokenBudget);
                saveSettings();
                // Sync with panel
                jQuery('#et_ctx_st_token_custom_panel').val(settings().ctxSTTokenBudget);
            });

            // Appearance
            jQuery('#et_font_size').on('input', function () {
                settings().fontSize = parseInt(jQuery(this).val());
                jQuery('#et_font_size_val').text(settings().fontSize + 'px');
                applyAppearanceSettings();
                saveSettings();
                // Sync with panel
                jQuery('#et_font_size_panel').val(settings().fontSize);
                jQuery('#et_font_size_val_panel').text(settings().fontSize + 'px');
            });

            jQuery('#et_glass_blur').on('input', function () {
                settings().glassBlur = parseInt(jQuery(this).val());
                jQuery('#et_glass_blur_val').text(settings().glassBlur + 'px');
                applyAppearanceSettings();
                saveSettings();
                // Sync with panel
                jQuery('#et_glass_blur_panel').val(settings().glassBlur);
                jQuery('#et_glass_blur_val_panel').text(settings().glassBlur + 'px');
            });

            jQuery('#et_glass_opacity').on('input', function () {
                settings().glassOpacity = parseInt(jQuery(this).val());
                jQuery('#et_glass_opacity_val').text(settings().glassOpacity + '%');
                applyAppearanceSettings();
                saveSettings();
                // Sync with panel
                jQuery('#et_glass_opacity_panel').val(settings().glassOpacity);
                jQuery('#et_glass_opacity_val_panel').text(settings().glassOpacity + '%');
            });

            jQuery('#et_line_spacing').on('input', function () {
                settings().lineSpacing = parseFloat(jQuery(this).val());
                jQuery('#et_line_spacing_val').text(settings().lineSpacing.toFixed(2));
                applyAppearanceSettings();
                saveSettings();
                jQuery('#et_line_spacing_panel').val(settings().lineSpacing);
                jQuery('#et_line_spacing_val_panel').text(settings().lineSpacing.toFixed(2));
            });

            jQuery('#et_paragraph_spacing').on('input', function () {
                settings().paragraphSpacing = parseInt(jQuery(this).val());
                jQuery('#et_paragraph_spacing_val').text(settings().paragraphSpacing + 'px');
                applyAppearanceSettings();
                saveSettings();
                jQuery('#et_paragraph_spacing_panel').val(settings().paragraphSpacing);
                jQuery('#et_paragraph_spacing_val_panel').text(settings().paragraphSpacing + 'px');
            });

            jQuery('#et_dynamic_emotion_panel').on('change', function () {
                settings().dynamicEmotionPanel = jQuery(this).is(':checked');
                applyAppearanceSettings();
                saveSettings();
                jQuery('#et_dynamic_emotion_panel_panel').prop('checked', settings().dynamicEmotionPanel);
            });

            // Action Button
            jQuery('#et_fab_size').on('input', function () {
                settings().fabSize = parseInt(jQuery(this).val());
                jQuery('#et_fab_size_val').text(settings().fabSize + 'px');
                applyAppearanceSettings();
                positionFab();
                saveSettings();
                // Sync with panel
                jQuery('#et_fab_size_panel').val(settings().fabSize);
                jQuery('#et_fab_size_val_panel').text(settings().fabSize + 'px');
            });

            jQuery('.et-icon-option').on('click', function () {
                jQuery('.et-icon-option').removeClass('selected');
                jQuery(this).addClass('selected');
                settings().fabIcon = jQuery(this).data('icon');
                applyAppearanceSettings();
                saveSettings();
                // Sync with panel
                jQuery('#et_fab_icon_panel').attr('data-value', settings().fabIcon);
                initCustomDropdownPanel('et_fab_icon_panel', settings().fabIcon);
            });

            jQuery('#et_proactive_rate_limit').on('change input', function () {
                const minutes = Math.max(15, Math.min(2880, parseInt(jQuery(this).val(), 10) || 180));
                settings().proactiveRateLimitMinutes = minutes;
                jQuery(this).val(minutes);
                saveSettings();
                jQuery('#et_proactive_rate_limit_panel').val(minutes);
                refreshProactiveInsights();
            });

            jQuery('#et_proactive_refresh').on('click', function () {
                refreshProactiveInsights();
            });

            jQuery('#et_proactive_toggle').on('click', function () {
                settings().proactiveMessagingEnabled = settings().proactiveMessagingEnabled === false ? true : false;
                saveSettings();
                updateProactiveToggleButtons();
                startProactiveScheduler();
                refreshProactiveInsights();
            });

            jQuery('#et_trigger_message').on('click', function () {
                triggerTestProactiveMessage();
            });

            // Prompt Manager — auto-save on input (debounced)
            const pmTimers = {};
            jQuery(document).on('input.et-pm', '.et-pm-textarea', function () {
                const card = jQuery(this).closest('.et-pm-card');
                const id = card.data('pm-id');
                if (!id) return;
                const val = jQuery(this).val();
                clearTimeout(pmTimers[id]);
                pmTimers[id] = setTimeout(() => {
                    settings()[id] = val;
                    saveSettings();
                    // Brief save flash
                    jQuery(this).addClass('et-pm-saved');
                    setTimeout(() => jQuery(this).removeClass('et-pm-saved'), 600);
                }, 400);
            });

            // Prompt Manager — Copy / Paste / Reset buttons
            jQuery(document).on('click.et-pm', '.et-pm-btn', function () {
                const btn = jQuery(this);
                const action = btn.data('pm-action');
                const card = btn.closest('.et-pm-card');
                const id = card.data('pm-id');
                const textarea = card.find('.et-pm-textarea');

                if (action === 'copy') {
                    navigator.clipboard.writeText(textarea.val()).then(() => {
                        btn.html('<i class="fa-solid fa-check"></i>');
                        setTimeout(() => btn.html('<i class="fa-solid fa-copy"></i>'), 1200);
                    }).catch(() => { });

                } else if (action === 'paste') {
                    navigator.clipboard.readText().then(text => {
                        textarea.val(text);
                        settings()[id] = text;
                        saveSettings();
                        textarea.addClass('et-pm-saved');
                        setTimeout(() => textarea.removeClass('et-pm-saved'), 600);
                    }).catch(() => { });

                } else if (action === 'reset') {
                    const defaults = window.EchoTextConfig && window.EchoTextConfig.defaultSettings || {};
                    const defaultVal = defaults[id] || '';
                    textarea.val(defaultVal);
                    settings()[id] = defaultVal;
                    saveSettings();
                    btn.html('<i class="fa-solid fa-check"></i>');
                    setTimeout(() => btn.html('<i class="fa-solid fa-rotate-left"></i>'), 1200);
                }
            });
        }

        return {
            buildSettingsModalHtml,
            openSettingsModal,
            closeSettingsModal,
            updateFontPreview,
            updateThemePreviewFull,
            bindSettingsModalEvents
        };
    }

    window.EchoTextSettingsModal = { createSettingsModal };
})();
