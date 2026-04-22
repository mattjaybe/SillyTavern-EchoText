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
            openThemeEditor
        } = api;

        function settings() {
            return getSettings();
        }

        function THEME_PRESETS() {
            return getThemePresets();
        }

        // ============================================================
        // MEMORY SYSTEM HTML HELPERS
        // ============================================================

        const MEM_CATEGORIES = {
            inside_joke:    { label: 'Inside Joke',       icon: 'fa-face-laugh-squint' },
            person:         { label: 'Important Person',  icon: 'fa-user-tag'          },
            hobby:          { label: 'Hobby / Interest',  icon: 'fa-gamepad'            },
            favorite_thing: { label: 'Favorite Thing',    icon: 'fa-star'               },
            shared_moment:  { label: 'Shared Moment',     icon: 'fa-heart'              },
            custom:         { label: 'Custom',             icon: 'fa-tag'                }
        };

        function escHtml(str) {
            return String(str || '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;');
        }

        function buildMemoryCardHtml(mem) {
            const cat      = MEM_CATEGORIES[mem.category] || MEM_CATEGORIES.custom;
            const pinClass = mem.pinned ? ' et-mem-card-pinned' : '';
            const autoBadge= mem.autoExtracted
                ? `<span class="et-mem-badge-auto" title="Auto-extracted from chat">Auto</span>` : '';
            const pinTitle = mem.pinned ? 'Unpin — always injected' : 'Pin — always inject this memory';
            const pinIcon  = mem.pinned ? 'fa-thumbtack' : 'fa-thumbtack';
            const pinActive= mem.pinned ? ' et-mem-btn-pin-active' : '';

            return `<div class="et-mem-card${pinClass}" data-mem-id="${escHtml(mem.id)}" data-mem-category="${escHtml(mem.category)}">
                <div class="et-mem-card-header">
                    <div class="et-mem-card-meta">
                        <span class="et-mem-cat-chip">
                            <i class="fa-solid ${cat.icon}"></i> ${cat.label}
                        </span>
                        ${autoBadge}
                    </div>
                    <div class="et-mem-card-actions">
                        <button class="et-mem-btn${pinActive}" data-mem-action="pin" title="${pinTitle}">
                            <i class="fa-solid fa-thumbtack"></i>
                        </button>
                        <button class="et-mem-btn" data-mem-action="edit" title="Edit memory">
                            <i class="fa-solid fa-pen"></i>
                        </button>
                        <button class="et-mem-btn et-mem-btn-delete" data-mem-action="delete" title="Delete memory">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </div>
                </div>
                <div class="et-mem-card-label">${escHtml(mem.label)}</div>
                <div class="et-mem-card-content">${escHtml(mem.content)}</div>
                <div class="et-mem-card-edit" style="display:none;">
                    <div class="et-mem-form-row" style="margin-top:8px;">
                        <select class="et-select et-mem-edit-category" title="Category">
                            ${Object.entries(MEM_CATEGORIES).map(([k, v]) =>
                                `<option value="${k}"${mem.category === k ? ' selected' : ''}>${v.label}</option>`
                            ).join('')}
                        </select>
                        <input type="text" class="et-input-text et-mem-edit-label" value="${escHtml(mem.label)}" placeholder="Label">
                    </div>
                    <textarea class="et-mem-form-content et-mem-edit-content" rows="3">${escHtml(mem.content)}</textarea>
                    <div class="et-mem-form-actions">
                        <label class="et-mem-form-pin-row">
                            <input type="checkbox" class="checkbox et-mem-edit-pin"${mem.pinned ? ' checked' : ''}>
                            <span><i class="fa-solid fa-thumbtack"></i> Pin</span>
                        </label>
                        <div style="display:flex;gap:8px;">
                            <button class="et-mem-form-save et-mem-edit-save" type="button">Save</button>
                            <button class="et-mem-form-cancel et-mem-edit-cancel" type="button">Cancel</button>
                        </div>
                    </div>
                </div>
            </div>`;
        }

        function renderMemoryListInto(containerSel, emptyHintSel, labelSel) {
            const s = settings();
            const scope = s.memoryScope || 'per-character';

            let memories = [];
            if (scope === 'global') {
                memories = Array.isArray(s.globalMemories) ? s.globalMemories : [];
            } else {
                // In per-character mode, try to get the current character's memories
                const charKeyFn = window._etGetCharacterKey;
                const charKey = (typeof charKeyFn === 'function') ? charKeyFn() : null;
                if (charKey && s.characterMemories && Array.isArray(s.characterMemories[charKey])) {
                    memories = s.characterMemories[charKey];
                } else {
                    // No character selected — show global as fallback header
                    memories = [];
                }
            }

            const container = jQuery(containerSel);
            const emptyHint = jQuery(emptyHintSel);
            if (!container.length) return;

            if (memories.length === 0) {
                container.html('');
                emptyHint.show();
            } else {
                emptyHint.hide();
                container.html(memories.map(buildMemoryCardHtml).join(''));
            }

            // Update label
            if (labelSel) {
                const charKeyFn = window._etGetCharacterKey;
                const charKey   = (typeof charKeyFn === 'function') ? charKeyFn() : null;
                const charName  = window._etGetCharacterName ? window._etGetCharacterName() : null;
                let label = 'Global Memories';
                if (scope === 'per-character') {
                    label = charKey
                        ? `Memories — ${charName || charKey}`
                        : 'Memories (no character selected)';
                }
                jQuery(labelSel).text(label);
            }
        }

        function updateMemoryScopePills(scopePillsSel, scope) {
            jQuery(scopePillsSel).find('.et-mem-scope-btn').removeClass('et-mem-scope-btn-active');
            jQuery(`${scopePillsSel} .et-mem-scope-btn[data-scope="${scope}"]`).addClass('et-mem-scope-btn-active');
        }

        function updateHlPickerActive(pickerSel, style) {
            jQuery(pickerSel).find('.et-mem-hl-btn').removeClass('et-mem-hl-btn-active');
            jQuery(`${pickerSel} .et-mem-hl-btn[data-hl="${style}"]`).addClass('et-mem-hl-btn-active');
        }

        /**
         * Builds and returns the memory list section HTML (for injection into
         * the panel accordion via applySettingsToUI → #et_memory_list_panel).
         * This function is called from index.js after settingsModal is created.
         */
        function buildMemorySectionHtml() {
            const s = settings();
            const scope   = s.memoryScope || 'per-character';
            const enabled = s.memoryEnabled !== false;
            const autoHL  = s.memoryAutoExtract !== false;
            const hlStyle = s.memoryHighlightStyle || 'underline';

            const hlStyleBtns = [
                { k: 'underline', label: 'Dotted Underline' },
                { k: 'glow',      label: 'Soft Glow'        },
                { k: 'shimmer',   label: 'Shimmer'          },
                { k: 'border',    label: 'Accent Bar'       }
            ].map(o => `<button class="et-mem-hl-btn${hlStyle === o.k ? ' et-mem-hl-btn-active' : ''}" data-hl="${o.k}" type="button"><span class="et-mem-hl-preview et-mem-hl-${o.k}">Aa</span><span>${o.label}</span></button>`).join('');

            return `
<div class="et-mem-panel-controls">
    <label class="et-toggle-row" style="margin-bottom:8px;">
        <input type="checkbox" id="et_memory_enabled_panel" class="checkbox"${enabled ? ' checked' : ''}>
        <span class="et-label-text"><i class="fa-solid fa-brain"></i> Enable Memory System</span>
    </label>
    <label class="et-toggle-row" style="margin-bottom:6px;">
        <input type="checkbox" id="et_memory_auto_extract_panel" class="checkbox"${autoHL ? ' checked' : ''}>
        <span class="et-label-text"><i class="fa-solid fa-highlighter"></i> Auto-Highlight Memories</span>
    </label>
    <div class="et-hint" style="margin-bottom:8px;font-size:0.82em;">Scan your messages for memorable content and highlight it. Click a highlight to save it.</div>
    <div class="et-mem-hl-picker-wrap" id="et_memory_hl_picker_panel_wrap"${autoHL ? '' : ' style="display:none;"'}>
        <div class="et-label-text-sub"><i class="fa-solid fa-palette"></i> Highlight Style</div>
        <div class="et-mem-hl-style-btns" id="et_memory_hl_picker_panel">${hlStyleBtns}</div>
    </div>
    <div class="et-mem-scope-pills" id="et_memory_scope_pills_panel" style="margin:12px 0 8px;">
        <button class="et-mem-scope-btn${scope === 'per-character' ? ' et-mem-scope-btn-active' : ''}" data-scope="per-character" type="button"><i class="fa-solid fa-user"></i> Per Character</button>
        <button class="et-mem-scope-btn${scope === 'global' ? ' et-mem-scope-btn-active' : ''}" data-scope="global" type="button"><i class="fa-solid fa-globe"></i> Global</button>
    </div>
    <div class="et-hint" id="et_memory_scope_hint_panel" style="margin-bottom:12px;">${scope === 'global' ? 'One shared memory pool for all characters.' : 'Each character keeps their own separate memory pool.'}</div>
    <div class="et-mem-list-header">
        <span class="et-mem-list-title" id="et_memory_list_label_panel">Memories</span>
        <button class="et-mem-add-btn" id="et_memory_add_btn_panel" type="button"><i class="fa-solid fa-plus"></i> Add</button>
    </div>
    <div class="et-mem-add-form" id="et_memory_add_form_panel" style="display:none;">
        <select class="et-select et-mem-form-category" id="et_memory_form_category_panel" style="margin-bottom:6px;width:100%;">
            <option value="inside_joke">Inside Joke</option>
            <option value="person">Important Person</option>
            <option value="hobby">Hobby / Interest</option>
            <option value="favorite_thing">Favorite Thing</option>
            <option value="shared_moment">Shared Moment</option>
            <option value="custom">Custom</option>
        </select>
        <input type="text" class="et-input-text et-mem-form-label" id="et_memory_form_label_panel" placeholder="Label" style="margin-bottom:6px;">
        <textarea class="et-mem-form-content" id="et_memory_form_content_panel" rows="3" placeholder="Describe the memory…"></textarea>
        <div class="et-mem-form-actions">
            <label class="et-mem-form-pin-row">
                <input type="checkbox" id="et_memory_form_pin_panel" class="checkbox">
                <span><i class="fa-solid fa-thumbtack"></i> Always inject</span>
            </label>
            <div style="display:flex;gap:6px;">
                <button class="et-mem-form-save" id="et_memory_form_save_panel" type="button">Save</button>
                <button class="et-mem-form-cancel" id="et_memory_form_cancel_panel" type="button">Cancel</button>
            </div>
        </div>
    </div>
    <div class="et-mem-list" id="et_memory_list_panel"></div>
    <div class="et-mem-empty" id="et_memory_empty_panel" style="display:none;"><i class="fa-solid fa-box-open"></i><br>No memories yet.</div>
    <button class="et-mem-clear-btn" id="et_memory_clear_panel" type="button" style="margin-top:10px;"><i class="fa-solid fa-trash-can"></i> Clear All</button>
</div>`;
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
                    <div class="et-pm-card-meta">
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

        function buildPromptGroup(icon, label, hint, cards, collapsed) {
            const collapseClass = collapsed ? ' et-pm-group-collapsed' : '';
            return `<div class="et-pm-group${collapseClass}">
                <div class="et-pm-group-header">
                    <div class="et-pm-group-title">
                        <i class="fa-solid ${icon}"></i>
                        <span class="et-pm-group-name">${label}</span>
                        <span class="et-pm-group-badge">${cards.length}</span>
                    </div>
                    <div class="et-pm-group-right">
                        <span class="et-pm-group-hint">${hint}</span>
                        <i class="fa-solid fa-chevron-down et-pm-group-chevron"></i>
                    </div>
                </div>
                <div class="et-pm-group-body">
                    <div class="et-pm-group-inner">
                        ${cards.join('')}
                    </div>
                </div>
            </div>`;
        }

        function buildPromptManagerSectionHtml() {
            const d = window.EchoTextConfig && window.EchoTextConfig.defaultSettings || {};

            const coreCards = [
                buildPromptCard('promptSystemBase',
                    '<i class="fa-solid fa-id-badge"></i> System Base',
                    'The opening identity line sent in every generation. Always included.',
                    d.promptSystemBase || ''),
                buildPromptCard('promptAntiRefusalFrame',
                    '<i class="fa-solid fa-shield-halved"></i> Anti-Refusal Frame',
                    'Injected when Anti-Refusal is ON. Sets the roleplay fiction context. Also used in Group Chat Combined Mode.',
                    d.promptAntiRefusalFrame || '')
            ];

            const soloCards = [
                buildPromptCard('promptTetheredReminder',
                    '<i class="fa-solid fa-link"></i> Tethered Reminder <span class="et-pm-tag">Anti-Refusal ON</span>',
                    'Persona-lock reminder appended when in Tethered mode with Anti-Refusal enabled.',
                    d.promptTetheredReminder || ''),
                buildPromptCard('promptUntetheredReminder',
                    '<i class="fa-solid fa-link-slash"></i> Untethered Reminder <span class="et-pm-tag">Anti-Refusal ON</span>',
                    'Persona-lock reminder appended when in Untethered mode with Anti-Refusal enabled.',
                    d.promptUntetheredReminder || ''),
                buildPromptCard('promptTetheredNoFrame',
                    '<i class="fa-solid fa-comment"></i> Tethered Closing <span class="et-pm-tag">Anti-Refusal OFF</span>',
                    'Closing instruction when in Tethered mode with Anti-Refusal disabled.',
                    d.promptTetheredNoFrame || ''),
                buildPromptCard('promptUntetheredNoFrame',
                    '<i class="fa-solid fa-comment-slash"></i> Untethered Closing <span class="et-pm-tag">Anti-Refusal OFF</span>',
                    'Closing instruction when in Untethered mode with Anti-Refusal disabled.',
                    d.promptUntetheredNoFrame || ''),
                buildPromptCard('promptChatInfluence',
                    '<i class="fa-solid fa-wand-magic-sparkles"></i> Chat Influence Header',
                    'Header line injected before Mood / Personality / Comm Style overlay in Untethered mode.',
                    d.promptChatInfluence || '')
            ];

            const groupCards = [
                buildPromptCard('promptGroupSceneFrame',
                    '<i class="fa-solid fa-users"></i> Group Scene Frame',
                    'System-level instruction that opens every Combined Mode request. Supports <code>{{user}}</code> and <code>{{group_members}}</code>.',
                    d.promptGroupSceneFrame || ''),
                buildPromptCard('promptGroupCharacterCue',
                    '<i class="fa-solid fa-person-rays"></i> Group Character Cue',
                    'Appended to the final user turn for each character\'s call in Combined Mode. Supports <code>{{char}}</code>.',
                    d.promptGroupCharacterCue || '')
            ];

            const verbosityCards = [
                buildPromptCard('promptVerbosityShort',
                    '<i class="fa-solid fa-compress-alt"></i> Short <span class="et-pm-tag et-pm-tag-blue">1–2 sentences</span>',
                    'Injected when the message verbosity is set to Short.',
                    d.promptVerbosityShort || ''),
                buildPromptCard('promptVerbosityMedium',
                    '<i class="fa-solid fa-align-center"></i> Medium <span class="et-pm-tag et-pm-tag-green">2–4 sentences</span>',
                    'Injected when no specific verbosity is set (the default).',
                    d.promptVerbosityMedium || ''),
                buildPromptCard('promptVerbosityLong',
                    '<i class="fa-solid fa-expand-alt"></i> Long <span class="et-pm-tag et-pm-tag-purple">4–8 sentences</span>',
                    'Injected when the message verbosity is set to Long.',
                    d.promptVerbosityLong || '')
            ];

            return [
                buildPromptGroup('fa-brain', 'Core Behavior', 'Always Injected', coreCards, false),
                buildPromptGroup('fa-user', 'Solo Chat', 'Tethered &amp; Untethered', soloCards, true),
                buildPromptGroup('fa-users', 'Group Chat', 'Combined Mode / Group', groupCards, true),
                buildPromptGroup('fa-ruler', 'Verbosity', 'Reply Length', verbosityCards, true)
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
                            <i class="fa-solid fa-clock"></i> Proactive Messages
                        </div>
                        <div class="et-nav-item" data-section="memory">
                            <i class="fa-solid fa-brain"></i> Memory
                        </div>
                        <div class="et-nav-item" data-section="image-generation">
                            <i class="fa-solid fa-image"></i> Image Generation
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
                                <label class="et-toggle-row" for="et_emotion_system">
                                    <input type="checkbox" id="et_emotion_system" class="checkbox">
                                    <span class="et-label-text"><i class="fa-solid fa-heart-pulse"></i> Dynamic Emotion System</span>
                                </label>
                                <div class="et-hint">Track the character's emotional state using Plutchik's Wheel of Emotions. Emotions shift based on conversation and reactions, influencing how the character responds. Click the character's name in the panel to view their current emotional state.</div>
                            </div>

                            <div class="et-field">
                                <label class="et-toggle-row" for="et_swiped_messages">
                                    <input type="checkbox" id="et_swiped_messages" class="checkbox">
                                    <span class="et-label-text"><i class="fa-solid fa-clone"></i> Swiped Messages</span>
                                </label>
                                <div class="et-hint">Save previous AI responses when regenerating. Use arrows (or swipe on mobile) to browse between versions. The right arrow on the latest response triggers a new regeneration.</div>
                            </div>

                            <div class="et-field">
                                <label class="et-toggle-row" for="et_auto_open">
                                    <input type="checkbox" id="et_auto_open" class="checkbox">
                                    <span class="et-label-text"><i class="fa-solid fa-door-open"></i> Auto-Open on Reload</span>
                                </label>
                                <div class="et-hint">Automatically open the EchoText panel when SillyTavern loads.</div>
                            </div>

                            <div class="et-field">
                                <label class="et-toggle-row" for="et_auto_load_last_char">
                                    <input type="checkbox" id="et_auto_load_last_char" class="checkbox">
                                    <span class="et-label-text"><i class="fa-solid fa-rotate-left"></i> Auto-Load Last Character</span>
                                </label>
                                <div class="et-hint">When SillyTavern reloads, automatically select the last character you were chatting with.</div>
                            </div>

                            <div class="et-field">
                                <label class="et-toggle-row" for="et_auto_scroll">
                                    <input type="checkbox" id="et_auto_scroll" class="checkbox">
                                    <span class="et-label-text"><i class="fa-solid fa-arrow-down"></i> Auto-scroll to Latest Message</span>
                                </label>
                                <div class="et-hint">Automatically scroll down when new messages appear in the chat.</div>
                            </div>

                            <div class="et-field">
                                <label class="et-field-label"><i class="fa-solid fa-ruler"></i> Verbosity Default</label>
                                <div class="et-select-wrapper">
                                    <select id="et_verbosity_default" class="et-select">
                                        <option value="short">Short</option>
                                        <option value="medium">Medium</option>
                                        <option value="long">Long</option>
                                    </select>
                                    <i class="fa-solid fa-chevron-down et-select-arrow"></i>
                                </div>
                                <div class="et-hint">Default verbosity level for all new chats. Can be changed per-message using the options menu.</div>
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
                                <label class="et-toggle-row" for="et_ctx_st_messages">
                                    <input type="checkbox" id="et_ctx_st_messages" class="checkbox">
                                    <span class="et-label-text"><i class="fa-solid fa-comments"></i> EchoText Messages</span>
                                </label>
                                <div class="et-hint et-hint-indent">Include recent EchoText conversation messages as additional context for generation.</div>
                            </div>

                            <div class="et-field">
                                <label class="et-toggle-row" for="et_ctx_st_context">
                                    <input type="checkbox" id="et_ctx_st_context" class="checkbox">
                                    <span class="et-label-text"><i class="fa-solid fa-brain"></i> SillyTavern Context</span>
                                </label>
                                <div class="et-hint et-hint-indent">In Tethered mode, silently reads the character's recent SillyTavern chat to detect their emotional state. That emotion bleeds into EchoText &mdash; if they're distressed in roleplay, they'll carry that mood here. The ST messages are not included in the EchoText conversation.</div>
                            </div>

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
                                <label class="et-toggle-row" for="et_ctx_authors_note">
                                    <input type="checkbox" id="et_ctx_authors_note" class="checkbox">
                                    <span class="et-label-text"><i class="fa-solid fa-pen-nib"></i> Author's Note</span>
                                </label>
                                <div class="et-hint et-hint-indent">Include the character's Author's Note — special per-character instructions set in SillyTavern.</div>
                            </div>

                            <div class="et-field">
                                <label class="et-toggle-row" for="et_ctx_world_info">
                                    <input type="checkbox" id="et_ctx_world_info" class="checkbox">
                                    <span class="et-label-text"><i class="fa-solid fa-globe"></i> World Info / Lorebook</span>
                                </label>
                                <div class="et-hint et-hint-indent">Include active World Info / Lorebook entries. <b>Note:</b> Only entries with an Insertion Order of 250 or higher are used.</div>
                            </div>



                        </div>

                        <!-- APPEARANCE -->
                        <div class="et-settings-section" id="et-section-appearance">
                            <h3><i class="fa-solid fa-palette"></i> Appearance</h3>

                            <div class="et-field">
                                <label class="et-field-label"><i class="fa-solid fa-swatchbook"></i> Theme</label>
                                ${buildThemeDropdownHtml(settings().theme)}
                                <button class="et-te-open-btn" id="et-te-open-btn-modal" title="Create and manage custom colour themes">
                                    <i class="fa-solid fa-wand-magic-sparkles"></i> Edit Custom Themes
                                </button>
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
                                <div class="et-hint">Controls the background blur intensity behind the panel for the frosted glass effect.</div>
                            </div>

                            <div class="et-field">
                                <label class="et-field-label" for="et_glass_opacity">
                                    <i class="fa-solid fa-eye"></i> Panel Opacity
                                </label>
                                <div class="et-slider-row">
                                    <input type="range" id="et_glass_opacity" class="slider et-slider" min="20" max="100" step="5" value="85">
                                    <span id="et_glass_opacity_val" class="et-slider-val">85%</span>
                                </div>
                                <div class="et-hint">Adjusts how transparent the panel background appears.</div>
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
                                <label class="et-field-label" for="et_fab_opacity">
                                    <i class="fa-solid fa-eye"></i> Button Opacity
                                </label>
                                <div class="et-slider-row">
                                    <input type="range" id="et_fab_opacity" class="slider et-slider" min="10" max="100" step="10" value="100">
                                    <span id="et_fab_opacity_val" class="et-slider-val">100%</span>
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
                            <h3><i class="fa-solid fa-clock"></i> Proactive Messages</h3>
                            <div class="et-hint" style="margin-bottom:16px;">Allow the character to send unprompted messages based on triggers like time of day, conversation gaps, and emotional context.</div>

                            <div class="et-field">
                                <label class="et-field-label"><i class="fa-solid fa-gauge-high"></i> Message Activity</label>
                                <div class="et-activity-mode-grid" id="et_activity_mode_grid" style="display:grid; grid-template-columns:repeat(3,1fr); gap:6px; margin-top:6px;">
                                    <button class="et-activity-btn" data-mode="quiet" type="button" title="~1–2 messages per day. Minimal API use, great for token budgets.">
                                        <i class="fa-solid fa-moon"></i>
                                        <span class="et-activity-label">Quiet</span>
                                        <span class="et-activity-sub">~1–2 / day</span>
                                    </button>
                                    <button class="et-activity-btn" data-mode="relaxed" type="button" title="~3 messages per day. Gentle, unobtrusive presence.">
                                        <i class="fa-solid fa-leaf"></i>
                                        <span class="et-activity-label">Relaxed</span>
                                        <span class="et-activity-sub">~3 / day</span>
                                    </button>
                                    <button class="et-activity-btn" data-mode="natural" type="button" title="Default. Dynamic, emotion-influenced frequency — roughly 4–6 per day when active.">
                                        <i class="fa-solid fa-wave-square"></i>
                                        <span class="et-activity-label">Natural</span>
                                        <span class="et-activity-sub">Default</span>
                                    </button>
                                    <button class="et-activity-btn" data-mode="lively" type="button" title="More active. The character reaches out more readily when emotions are elevated.">
                                        <i class="fa-solid fa-bolt"></i>
                                        <span class="et-activity-label">Lively</span>
                                        <span class="et-activity-sub">~6–8 / day</span>
                                    </button>
                                    <button class="et-activity-btn" data-mode="expressive" type="button" title="Most frequent. Minimal floor — the trigger system drives everything. Best with a powerful model.">
                                        <i class="fa-solid fa-fire"></i>
                                        <span class="et-activity-label">Expressive</span>
                                        <span class="et-activity-sub">Unrestricted</span>
                                    </button>
                                    <button class="et-activity-btn" data-mode="custom" type="button" title="Set your own minimum gap between messages.">
                                        <i class="fa-solid fa-sliders"></i>
                                        <span class="et-activity-label">Custom</span>
                                        <span class="et-activity-sub">Manual</span>
                                    </button>
                                </div>
                                <div class="et-activity-custom-row" id="et_activity_custom_row" style="display:none; margin-top:10px;">
                                    <div class="et-slider-row">
                                        <input type="range" id="et_proactive_rate_limit" class="slider et-slider" min="15" max="720" step="15" value="180">
                                        <span id="et_proactive_rate_limit_val" class="et-slider-val">180 min</span>
                                    </div>
                                </div>
                                <div class="et-hint" id="et_activity_mode_hint" style="margin-top:8px;">Natural frequency with emotion-driven variation.</div>
                            </div>

                            <div class="et-field">
                                <label class="et-toggle-row" for="et_proactive_emotion_urgency">
                                    <input type="checkbox" id="et_proactive_emotion_urgency" class="checkbox">
                                    <span class="et-label-text"><i class="fa-solid fa-heart-pulse"></i> Emotion-Driven Urgency</span>
                                </label>
                                <div class="et-hint">Strong anticipation or sadness can shorten the wait between messages. Anger and disgust extend it (or trigger a ghost window).</div>
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

                        <!-- MEMORY SYSTEM -->
                        <div class="et-settings-section" id="et-section-memory">
                            <h3><i class="fa-solid fa-brain"></i> Memory System</h3>
                            <div class="et-hint" style="margin-bottom:18px;">
                                Characters can recall shared memories — inside jokes, people you've mentioned, hobbies, favorites, and more. Memories are probabilistically woven into replies so they feel natural, never forced. Pinned memories are always included.
                            </div>

                            <div class="et-field">
                                <label class="et-toggle-row" for="et_memory_enabled">
                                    <input type="checkbox" id="et_memory_enabled" class="checkbox">
                                    <span class="et-label-text"><i class="fa-solid fa-brain"></i> Enable Memory System</span>
                                </label>
                                <div class="et-hint">Inject relevant shared memories into the system prompt during generation.</div>
                            </div>

                            <div class="et-field">
                                <label class="et-toggle-row" for="et_memory_auto_extract">
                                    <input type="checkbox" id="et_memory_auto_extract" class="checkbox">
                                    <span class="et-label-text"><i class="fa-solid fa-highlighter"></i> Auto-Highlight Memories</span>
                                </label>
                                <div class="et-hint">Scan your messages for memorable content — hobbies, people, favorites, shared moments — and highlight the text in your bubbles. Click any highlighted phrase to save it as a memory.</div>
                                <div class="et-mem-hl-picker-wrap" id="et_memory_hl_picker_modal_wrap">
                                    <label class="et-field-label"><i class="fa-solid fa-palette"></i> Highlight Style</label>
                                    <div class="et-mem-hl-style-btns" id="et_memory_hl_picker_modal">
                                        <button class="et-mem-hl-btn" data-hl="underline" type="button"><span class="et-mem-hl-preview et-mem-hl-underline">Aa</span><span>Dotted Underline</span></button>
                                        <button class="et-mem-hl-btn" data-hl="glow" type="button"><span class="et-mem-hl-preview et-mem-hl-glow">Aa</span><span>Soft Glow</span></button>
                                        <button class="et-mem-hl-btn" data-hl="shimmer" type="button"><span class="et-mem-hl-preview et-mem-hl-shimmer">Aa</span><span>Shimmer</span></button>
                                        <button class="et-mem-hl-btn" data-hl="border" type="button"><span class="et-mem-hl-preview et-mem-hl-border">Aa</span><span>Accent Bar</span></button>
                                    </div>
                                </div>
                            </div>

                            <div class="et-field">
                                <label class="et-field-label"><i class="fa-solid fa-folder-open"></i> Memory Scope</label>
                                <div class="et-mem-scope-pills" id="et_memory_scope_pills">
                                    <button class="et-mem-scope-btn" data-scope="per-character" type="button">
                                        <i class="fa-solid fa-user"></i> Per Character
                                    </button>
                                    <button class="et-mem-scope-btn" data-scope="global" type="button">
                                        <i class="fa-solid fa-globe"></i> Global
                                    </button>
                                </div>
                                <div class="et-hint" id="et_memory_scope_hint">
                                    Per Character: each character has their own separate memory pool.<br>
                                    Global: one shared pool used across all characters.
                                </div>
                            </div>

                            <div class="et-field" style="margin-top:20px;">
                                <div class="et-mem-list-header">
                                    <span class="et-mem-list-title" id="et_memory_list_label">Memories</span>
                                    <div style="display:flex;gap:8px;align-items:center;">
                                        <button class="et-mem-clear-btn" id="et_memory_clear" type="button" title="Clear all memories for this scope">
                                            <i class="fa-solid fa-trash-can"></i> Clear All
                                        </button>
                                        <button class="et-mem-add-btn" id="et_memory_add_btn" type="button">
                                            <i class="fa-solid fa-plus"></i> Add Memory
                                        </button>
                                    </div>
                                </div>

                                <!-- Inline add form -->
                                <div class="et-mem-add-form" id="et_memory_add_form" style="display:none;">
                                    <div class="et-mem-form-row">
                                        <div class="et-select-wrapper" style="flex:0 0 180px;">
                                            <select class="et-select et-mem-form-category" id="et_memory_form_category">
                                                <option value="inside_joke">Inside Joke</option>
                                                <option value="person">Important Person</option>
                                                <option value="hobby">Hobby / Interest</option>
                                                <option value="favorite_thing">Favorite Thing</option>
                                                <option value="shared_moment">Shared Moment</option>
                                                <option value="custom">Custom</option>
                                            </select>
                                            <i class="fa-solid fa-chevron-down et-select-arrow"></i>
                                        </div>
                                        <input type="text" class="et-input-text et-mem-form-label" id="et_memory_form_label" placeholder="Label (e.g. &ldquo;Our song&rdquo;, &ldquo;Her sister&rdquo;)">
                                    </div>
                                    <textarea class="et-mem-form-content" id="et_memory_form_content" rows="3" placeholder="Describe the memory in plain language…"></textarea>
                                    <div class="et-mem-form-actions">
                                        <label class="et-mem-form-pin-row">
                                            <input type="checkbox" id="et_memory_form_pin" class="checkbox">
                                            <span><i class="fa-solid fa-thumbtack"></i> Pin — always inject this memory</span>
                                        </label>
                                        <div style="display:flex;gap:8px;">
                                            <button class="et-mem-form-save" id="et_memory_form_save" type="button">Save Memory</button>
                                            <button class="et-mem-form-cancel" id="et_memory_form_cancel" type="button">Cancel</button>
                                        </div>
                                    </div>
                                </div>

                                <!-- Memory card list -->
                                <div class="et-mem-list" id="et_memory_list"></div>
                                <div class="et-mem-empty" id="et_memory_empty" style="display:none;">
                                    <i class="fa-solid fa-box-open"></i>
                                    <div>No memories saved yet.</div>
                                    <div style="margin-top:4px;font-size:0.88em;opacity:0.7;">Add one manually, or enable Auto-Highlight — highlighted text in your messages becomes one click away from being saved.</div>
                                </div>
                            </div>
                        </div>

                        <!-- IMAGE GENERATION -->
                        <div class="et-settings-section" id="et-section-image-generation">
                            <h3><i class="fa-solid fa-image"></i> Image Generation</h3>
                            <div class="et-hint" style="margin-bottom:16px;">Use SillyTavern's Image Generation plugin so characters can respond to natural image requests with generated pictures inside EchoText.</div>

                            <div class="et-field">
                                <label class="et-toggle-row" for="et_image_generation_enabled">
                                    <input type="checkbox" id="et_image_generation_enabled" class="checkbox">
                                    <span class="et-label-text"><i class="fa-solid fa-wand-magic-sparkles"></i> Enable Image Generation</span>
                                </label>
                                <div class="et-hint">Lets characters respond to natural image requests with generated pictures. Requires SillyTavern's Image Generation extension.</div>
                            </div>

                            <div id="et_image_generation_plugin_notice" class="et-imagegen-setup-notice" style="display:none;">
                                <div class="et-imagegen-setup-title"><i class="fa-solid fa-circle-exclamation"></i> One-time plugin setup required</div>
                                <ol class="et-imagegen-setup-steps">
                                    <li>Enable the <strong>Image Generation</strong> extension in SillyTavern</li>
                                    <li>Configure it with a working image source <span class="et-imagegen-setup-note">(ComfyUI, Gemini, etc.)</span></li>
                                    </ol>
                            </div>

                            <div class="et-field">
                                <label class="et-toggle-row" for="et_image_generation_include_text_reply">
                                    <input type="checkbox" id="et_image_generation_include_text_reply" class="checkbox">
                                    <span class="et-label-text"><i class="fa-solid fa-comment"></i> Include Text Alongside Image</span>
                                </label>
                                <div class="et-hint">If enabled, the character sends a short in-character text with the generated image.</div>
                            </div>

                            <!-- IMAGE TRIGGER REFERENCE ACCORDION -->
                            <details class="et-trigger-details et-imagetrig-details" id="et_image_trigger_reference_panel">
                                <summary>
                                    <i class="fa-solid fa-circle-info"></i>
                                    <span>What triggers image generation?</span>
                                    <i class="fa-solid fa-chevron-down et-trigger-summary-chevron"></i>
                                </summary>
                                <div class="et-imagetrig-body">

                                    <p class="et-imagetrig-intro">
                                        EchoText listens for natural-language phrases in your messages.
                                        Any message that matches one of the patterns below (or an
                                        affirmative reply after the character offered a photo) will
                                        trigger image generation. When your request contains a contextual
                                        reference &mdash; like <em>&ldquo;that&rdquo;</em> or
                                        <em>&ldquo;what you&rsquo;re wearing&rdquo;</em> &mdash; EchoText
                                        automatically looks back through the recent conversation to
                                        resolve what you meant before building the image prompt.
                                    </p>

                                    <div class="et-imagetrig-group">
                                        <div class="et-imagetrig-group-label">
                                            <i class="fa-solid fa-camera"></i> Selfie &amp; Photo Requests
                                        </div>
                                        <div class="et-imagetrig-pills">
                                            <span class="et-imagetrig-pill et-imagetrig-pill-copyable" data-copy="Send me a selfie" title="Click to copy">Send me a selfie</span>
                                            <span class="et-imagetrig-pill et-imagetrig-pill-copyable" data-copy="Send me a photo" title="Click to copy">Send me a photo / pic</span>
                                            <span class="et-imagetrig-pill et-imagetrig-pill-copyable" data-copy="Show me a photo of you" title="Click to copy">Show me a photo of you</span>
                                            <span class="et-imagetrig-pill et-imagetrig-pill-copyable" data-copy="Can you send me a pic?" title="Click to copy">Can you send me a pic?</span>
                                            <span class="et-imagetrig-pill et-imagetrig-pill-copyable" data-copy="Could you send a picture?" title="Click to copy">Could you send a picture?</span>
                                            <span class="et-imagetrig-pill et-imagetrig-pill-copyable" data-copy="Take a selfie for me" title="Click to copy">Take a selfie for me</span>
                                            <span class="et-imagetrig-pill et-imagetrig-pill-copyable" data-copy="Snap a photo" title="Click to copy">Snap a photo</span>
                                            <span class="et-imagetrig-pill et-imagetrig-pill-copyable" data-copy="Got any photos?" title="Click to copy">Got any photos?</span>
                                            <span class="et-imagetrig-pill et-imagetrig-pill-copyable" data-copy="Any pics of you?" title="Click to copy">Any pics of you?</span>
                                            <span class="et-imagetrig-pill et-imagetrig-pill-copyable" data-copy="Photo of you" title="Click to copy">Photo / pic / shot of you</span>
                                        </div>
                                    </div>

                                    <div class="et-imagetrig-group">
                                        <div class="et-imagetrig-group-label">
                                            <i class="fa-solid fa-eye"></i> Appearance &amp; Look
                                        </div>
                                        <div class="et-imagetrig-pills">
                                            <span class="et-imagetrig-pill et-imagetrig-pill-copyable" data-copy="What do you look like?" title="Click to copy">What do you look like?</span>
                                            <span class="et-imagetrig-pill et-imagetrig-pill-copyable" data-copy="Show me what you look like" title="Click to copy">Show me what you look like</span>
                                            <span class="et-imagetrig-pill et-imagetrig-pill-copyable" data-copy="Show me how you look" title="Click to copy">Show me how you look</span>
                                            <span class="et-imagetrig-pill et-imagetrig-pill-copyable" data-copy="Show me you wearing " title="Click to copy">Show me you wearing&hellip;</span>
                                            <span class="et-imagetrig-pill et-imagetrig-pill-copyable" data-copy="Show me your outfit" title="Click to copy">Show me your outfit</span>
                                            <span class="et-imagetrig-pill et-imagetrig-pill-copyable" data-copy="I want to see you" title="Click to copy">I want to see you</span>
                                            <span class="et-imagetrig-pill et-imagetrig-pill-copyable" data-copy="I want to see what you're wearing" title="Click to copy">I want to see what you&rsquo;re wearing</span>
                                            <span class="et-imagetrig-pill et-imagetrig-pill-copyable" data-copy="I want a photo of you" title="Click to copy">I want a photo of you</span>
                                            <span class="et-imagetrig-pill et-imagetrig-pill-copyable" data-copy="I'd love to see you" title="Click to copy">I&rsquo;d love to see you</span>
                                            <span class="et-imagetrig-pill et-imagetrig-pill-copyable" data-copy="I'd love to see a pic" title="Click to copy">I&rsquo;d love to see a pic</span>
                                        </div>
                                    </div>

                                    <div class="et-imagetrig-group">
                                        <div class="et-imagetrig-group-label">
                                            <i class="fa-solid fa-arrows-spin"></i> Context References <span class="et-imagetrig-group-note">(AI resolves from conversation)</span>
                                        </div>
                                        <div class="et-imagetrig-pills">
                                            <span class="et-imagetrig-pill et-imagetrig-pill-copyable" data-copy="Show me a photo of that" title="Click to copy">Show me a photo of that</span>
                                            <span class="et-imagetrig-pill et-imagetrig-pill-copyable" data-copy="Send me a pic of that" title="Click to copy">Send me a pic of that</span>
                                            <span class="et-imagetrig-pill et-imagetrig-pill-copyable" data-copy="Show me what you're wearing" title="Click to copy">Show me what you&rsquo;re wearing</span>
                                            <span class="et-imagetrig-pill et-imagetrig-pill-copyable" data-copy="Show me your outfit today" title="Click to copy">Show me your outfit today</span>
                                            <span class="et-imagetrig-pill et-imagetrig-pill-copyable" data-copy="Show me that look" title="Click to copy">Show me that look</span>
                                            <span class="et-imagetrig-pill et-imagetrig-pill-copyable" data-copy="Send me a photo of how you look right now" title="Click to copy">Send me a photo of how you look right now</span>
                                        </div>
                                    </div>

                                    <div class="et-imagetrig-group">
                                        <div class="et-imagetrig-group-label">
                                            <i class="fa-solid fa-pen-nib"></i> Drawing &amp; Art
                                        </div>
                                        <div class="et-imagetrig-pills">
                                            <span class="et-imagetrig-pill et-imagetrig-pill-copyable" data-copy="Draw me a picture of " title="Click to copy">Draw me a picture of&hellip;</span>
                                            <span class="et-imagetrig-pill et-imagetrig-pill-copyable" data-copy="Draw me" title="Click to copy">Draw me</span>
                                            <span class="et-imagetrig-pill et-imagetrig-pill-copyable" data-copy="Sketch me a portrait" title="Click to copy">Sketch me a portrait</span>
                                            <span class="et-imagetrig-pill et-imagetrig-pill-copyable" data-copy="Paint a picture of " title="Click to copy">Paint a picture of&hellip;</span>
                                            <span class="et-imagetrig-pill et-imagetrig-pill-copyable" data-copy="Illustrate yourself" title="Click to copy">Illustrate yourself</span>
                                            <span class="et-imagetrig-pill et-imagetrig-pill-copyable" data-copy="Draw a comic of " title="Click to copy">Draw a comic of&hellip;</span>
                                        </div>
                                    </div>

                                    <div class="et-imagetrig-group">
                                        <div class="et-imagetrig-group-label">
                                            <i class="fa-solid fa-wand-magic-sparkles"></i> Make / Create / Generate
                                        </div>
                                        <div class="et-imagetrig-pills">
                                            <span class="et-imagetrig-pill et-imagetrig-pill-copyable" data-copy="Make me a photo of " title="Click to copy">Make me a photo of&hellip;</span>
                                            <span class="et-imagetrig-pill et-imagetrig-pill-copyable" data-copy="Create a drawing of " title="Click to copy">Create a drawing of&hellip;</span>
                                            <span class="et-imagetrig-pill et-imagetrig-pill-copyable" data-copy="Generate a selfie" title="Click to copy">Generate a selfie</span>
                                            <span class="et-imagetrig-pill et-imagetrig-pill-copyable" data-copy="Make me a portrait" title="Click to copy">Make me a portrait</span>
                                        </div>
                                    </div>

                                    <div class="et-imagetrig-group">
                                        <div class="et-imagetrig-group-label">
                                            <i class="fa-solid fa-paintbrush"></i> Artwork, Anime &amp; CGs
                                        </div>
                                        <div class="et-imagetrig-pills">
                                            <span class="et-imagetrig-pill et-imagetrig-pill-copyable" data-copy="Send me a cg" title="Click to copy">Send me a CG</span>
                                            <span class="et-imagetrig-pill et-imagetrig-pill-copyable" data-copy="Show me a render" title="Click to copy">Show me a render</span>
                                            <span class="et-imagetrig-pill et-imagetrig-pill-copyable" data-copy="Show me some hentai" title="Click to copy">Show me some hentai</span>
                                            <span class="et-imagetrig-pill et-imagetrig-pill-copyable" data-copy="Got any artwork?" title="Click to copy">Got any artwork?</span>
                                            <span class="et-imagetrig-pill et-imagetrig-pill-copyable" data-copy="Generate an illustration" title="Click to copy">Generate an illustration</span>
                                        </div>
                                    </div>

                                    <div class="et-imagetrig-group">
                                        <div class="et-imagetrig-group-label">
                                            <i class="fa-solid fa-reply"></i> Affirmative Reply <span class="et-imagetrig-group-note">(after character offers a photo)</span>
                                        </div>
                                        <div class="et-imagetrig-pills">
                                            <span class="et-imagetrig-pill">Yes / Yeah / Yep / Sure</span>
                                            <span class="et-imagetrig-pill">Definitely / Absolutely</span>
                                            <span class="et-imagetrig-pill">Please do / Go ahead</span>
                                            <span class="et-imagetrig-pill">Of course / Alright</span>
                                            <span class="et-imagetrig-pill">I&rsquo;d love to / Send it</span>
                                            <span class="et-imagetrig-pill">Show me / Let me see</span>
                                        </div>
                                    </div>

                                    <p class="et-imagetrig-tip">
                                        <i class="fa-solid fa-lightbulb"></i>
                                        <strong>Tip:</strong> You can be explicit &mdash;
                                        <em>&ldquo;Send me a selfie in a red dress at the beach&rdquo;</em> &mdash;
                                        or just reference the conversation &mdash;
                                        <em>&ldquo;Show me a photo of that&rdquo;</em> or
                                        <em>&ldquo;Show me what you&rsquo;re wearing&rdquo;</em>.
                                        EchoText uses the AI to resolve contextual references automatically.
                                    </p>

                                    <p class="et-imagetrig-tip" style="margin-top: 10px;">
                                        <i class="fa-solid fa-brain"></i>
                                        <strong>Context Resolution:</strong> When your message contains a vague
                                        reference (&ldquo;that&rdquo;, &ldquo;what you&rsquo;re wearing&rdquo;,
                                        &ldquo;your outfit&rdquo;), EchoText makes a quick AI call to look back
                                        through the last few messages and extract the concrete visual description
                                        before sending it to Stable Diffusion. Simple explicit requests skip this
                                        step entirely for instant generation.
                                    </p>

                                    <p class="et-imagetrig-tip" style="margin-top: 10px;">
                                        <i class="fa-solid fa-fire"></i>
                                        <strong>Style Modifiers:</strong> Words like <em>hentai, nsfw, ecchi, lewd,</em> or <em>manga</em> will automatically force explicit or anime style tags into the underlying Stable Diffusion prompt.
                                    </p>

                                </div>
                            </details>
                        </div>

                        <!-- PROMPT MANAGER -->
                        <div class="et-settings-section" id="et-section-prompts">
                            <h3><i class="fa-solid fa-scroll"></i> Prompt Manager</h3>
                            <div class="et-hint" style="margin-bottom:18px;">Edit the prompts sent to the AI. Changes auto-save as you type. Use <code>{{char}}</code> and <code>{{user}}</code> as placeholders. Click <b>Reset</b> to restore the factory default.</div>

                            <div class="et-field" >
                                <label class="et-toggle-row" for="et_anti_refusal">
                                    <input type="checkbox" id="et_anti_refusal" class="checkbox">
                                    <span class="et-label-text"><i class="fa-solid fa-shield-halved"></i> Anti-Refusal Framing</span>
                                </label>
                                <div class="et-hint">Prepend a roleplay fiction frame and persona-lock reminder to the system prompt, and insert an in-character pre-fill for chat-completion backends (Profile / Ollama / OpenAI) to prevent out-of-character refusals.</div>
                            </div>

                            ${buildPromptManagerSectionHtml()}
                        </div>

                    </div>
                </div>
            </div>
        </div>`;
        }

        
            function updateAntiRefusalPromptsVisibility() {
                const isOn = !!settings().antiRefusal;
                // If it's unchecked, hide the Anti-Refusal ON prompts, and show the OFF prompts.
                jQuery('.et-pm-card[data-pm-id="promptAntiRefusalFrame"]').toggle(isOn);
                jQuery('.et-pm-card[data-pm-id="promptTetheredReminder"]').toggle(isOn);
                jQuery('.et-pm-card[data-pm-id="promptUntetheredReminder"]').toggle(isOn);
                jQuery('.et-pm-card[data-pm-id="promptTetheredNoFrame"]').toggle(!isOn);
                jQuery('.et-pm-card[data-pm-id="promptUntetheredNoFrame"]').toggle(!isOn);
            }
function openSettingsModal() {
            jQuery('#et-settings-modal').remove();
            jQuery('body').append(buildSettingsModalHtml());

            applySettingsToUI();
            populateConnectionProfiles();
            if (settings().source === 'ollama') fetchOllamaModels();
            updateProviderVisibility();
            updateProviderVisibilityPanel();

            // Update font preview
            updateFontPreview(settings().fontFamily);
            updateThemePreviewFull(settings().theme);
            refreshProactiveInsights();

            requestAnimationFrame(() => {
                jQuery('#et-settings-modal').addClass('et-settings-visible');
            });

            // Initialize custom dropdowns
            initCustomDropdowns();
            updateAntiRefusalPromptsVisibility();

            bindSettingsModalEvents();

            // iOS: patch any sliders that were just injected into the modal
            patchIOSSliders(document.getElementById('et-settings-modal'));
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

            // Custom theme editor button (settings modal)
            jQuery('#et-te-open-btn-modal').on('click', function () {
                if (typeof openThemeEditor === 'function') openThemeEditor();
            });

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

            jQuery('#et_verbosity_default').on('change', function () {
                settings().verbosityDefault = jQuery(this).val();
                saveSettings();
                // Sync with panel
                jQuery('#et_verbosity_default_panel').val(settings().verbosityDefault);
            });

            jQuery('#et_auto_open').on('change', function () {
                settings().autoOpenOnReload = jQuery(this).is(':checked');
                saveSettings();
                // Sync with panel
                jQuery('#et_auto_open_panel').prop('checked', settings().autoOpenOnReload);
            });

            jQuery('#et_auto_load_last_char').on('change', function () {
                settings().autoLoadLastCharacter = jQuery(this).is(':checked');
                saveSettings();
                // Sync with panel
                jQuery('#et_auto_load_last_char_panel').prop('checked', settings().autoLoadLastCharacter);
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
                if (typeof updatePanelStatusRow === 'function') {
                    updatePanelStatusRow();
                }
            });

            jQuery('#et_swiped_messages').on('change', function () {
                settings().swipedMessages = jQuery(this).is(':checked');
                saveSettings();
                jQuery('#et_swiped_messages_panel').prop('checked', settings().swipedMessages === true);
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
                if (typeof updateAntiRefusalPromptsVisibility === "function") updateAntiRefusalPromptsVisibility();
            });

            jQuery('#et_image_generation_enabled').on('change', function () {
                settings().imageGenerationEnabled = jQuery(this).is(':checked');
                saveSettings();
                jQuery('#et_image_generation_enabled_panel').prop('checked', settings().imageGenerationEnabled);
                jQuery('#et_image_generation_plugin_notice').toggle(settings().imageGenerationEnabled === true);
                jQuery('#et_image_generation_plugin_notice_panel').toggle(settings().imageGenerationEnabled === true);
                if (typeof updateImageGenerationVisibility === 'function') updateImageGenerationVisibility();
            });

            jQuery('#et_image_generation_include_text_reply').on('change', function () {
                settings().imageGenerationIncludeTextReply = jQuery(this).is(':checked');
                saveSettings();
                jQuery('#et_image_generation_include_text_reply_panel').prop('checked', settings().imageGenerationIncludeTextReply);
            });

            // Trigger pill click-to-copy (modal)
            jQuery('#et-section-image-generation').on('click', '.et-imagetrig-pill-copyable', function () {
                const pill = jQuery(this);
                const text = pill.data('copy');
                if (!text) return;
                navigator.clipboard.writeText(text).then(() => {
                    pill.addClass('et-imagetrig-pill-copied');
                    setTimeout(() => pill.removeClass('et-imagetrig-pill-copied'), 1400);
                }).catch(() => {});
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

            jQuery('#et_ctx_authors_note').on('change', function () {
                settings().ctxAuthorsNote = jQuery(this).is(':checked');
                saveSettings();
                // Sync with panel
                jQuery('#et_ctx_authors_note_panel').prop('checked', settings().ctxAuthorsNote);
            });

            jQuery('#et_ctx_world_info').on('change', function () {
                settings().ctxWorldInfo = jQuery(this).is(':checked');
                saveSettings();
                // Sync with panel
                jQuery('#et_ctx_world_info_panel').prop('checked', settings().ctxWorldInfo);
            });

            jQuery('#et_ctx_st_messages').on('change', function () {
                settings().ctxSTMessages = jQuery(this).is(':checked');
                saveSettings();
                // Sync with panel
                jQuery('#et_ctx_st_messages_panel').prop('checked', settings().ctxSTMessages);
            });

            jQuery('#et_ctx_st_context').on('change', function () {
                settings().ctxSTContext = jQuery(this).is(':checked');
                saveSettings();
                // Sync with panel
                jQuery('#et_ctx_st_context_panel').prop('checked', settings().ctxSTContext);
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

            jQuery('#et_fab_opacity').on('input', function () {
                settings().fabOpacity = parseInt(jQuery(this).val());
                jQuery('#et_fab_opacity_val').text(settings().fabOpacity + '%');
                applyAppearanceSettings();
                positionFab();
                saveSettings();
                // Sync with panel
                jQuery('#et_fab_opacity_panel').val(settings().fabOpacity);
                jQuery('#et_fab_opacity_val_panel').text(settings().fabOpacity + '%');
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

            // Activity mode selector (modal)
            jQuery('#et_activity_mode_grid').on('click', '.et-activity-btn', function () {
                const mode = jQuery(this).data('mode');
                applyActivityMode(mode, '#et_activity_mode_grid', '#et_activity_custom_row',
                    '#et_proactive_rate_limit', '#et_proactive_rate_limit_val', '#et_activity_mode_hint');
                // Mirror to panel
                applyActivityMode(mode, '#et_activity_mode_grid_panel', '#et_activity_custom_row_panel',
                    '#et_proactive_rate_limit_panel', '#et_proactive_rate_limit_val_panel', '#et_activity_mode_hint_panel');
            });

            jQuery('#et_proactive_rate_limit').on('input', function () {
                const minutes = parseInt(jQuery(this).val(), 10) || 180;
                jQuery('#et_proactive_rate_limit_val').text(minutes + ' min');
                settings().proactiveRateLimitMinutes = minutes;
                saveSettings();
                // Mirror
                jQuery('#et_proactive_rate_limit_panel').val(minutes);
                jQuery('#et_proactive_rate_limit_val_panel').text(minutes + ' min');
                refreshProactiveInsights();
            });

            jQuery('#et_proactive_emotion_urgency').on('change', function () {
                settings().proactiveEmotionUrgency = jQuery(this).prop('checked');
                saveSettings();
                jQuery('#et_proactive_emotion_urgency_panel').prop('checked', settings().proactiveEmotionUrgency);
            });

            jQuery('#et_proactive_refresh').on('click', function () {
                refreshProactiveInsights();
            });

            jQuery('#et_proactive_toggle').on('click', function () {
                // Toggle both proactiveMessagingEnabled and dynamicSystemsEnabled
                const newState = settings().proactiveMessagingEnabled === false ? true : false;
                settings().proactiveMessagingEnabled = newState;
                settings().dynamicSystemsEnabled = newState;
                saveSettings();
                updateProactiveToggleButtons();
                startProactiveScheduler();
                refreshProactiveInsights();
            });

            jQuery('#et_trigger_message').on('click', function () {
                triggerTestProactiveMessage();
            });

            // ---- Memory System (modal-specific) ----

            // Apply initial scope state for modal
            (function initMemoryModalUI() {
                const s = settings();
                const scope = s.memoryScope || 'per-character';
                const hlStyle = s.memoryHighlightStyle || 'underline';
                const autoHL  = s.memoryAutoExtract !== false;
                jQuery('#et_memory_enabled').prop('checked', s.memoryEnabled !== false);
                jQuery('#et_memory_auto_extract').prop('checked', autoHL);
                updateMemoryScopePills('#et_memory_scope_pills', scope);
                renderMemoryListInto('#et_memory_list', '#et_memory_empty', '#et_memory_list_label');
                // Init highlight style picker
                jQuery('#et_memory_hl_picker_modal_wrap').toggle(autoHL);
                updateHlPickerActive('#et_memory_hl_picker_modal', hlStyle);
            })();

            jQuery('#et_memory_enabled').on('change', function () {
                settings().memoryEnabled = jQuery(this).is(':checked');
                saveSettings();
                jQuery('#et_memory_enabled_panel').prop('checked', settings().memoryEnabled);
            });

            jQuery('#et_memory_auto_extract').on('change', function () {
                const checked = jQuery(this).is(':checked');
                settings().memoryAutoExtract = checked;
                saveSettings();
                jQuery('#et_memory_auto_extract_panel').prop('checked', checked);
                jQuery('#et_memory_hl_picker_modal_wrap').toggle(checked);
                jQuery('#et_memory_hl_picker_panel_wrap').toggle(checked);
            });

            jQuery('#et_memory_scope_pills').on('click', '.et-mem-scope-btn', function () {
                const scope = jQuery(this).data('scope');
                settings().memoryScope = scope;
                saveSettings();
                updateMemoryScopePills('#et_memory_scope_pills', scope);
                updateMemoryScopePills('#et_memory_scope_pills_panel', scope);
                const hint = scope === 'global'
                    ? 'One shared memory pool used across all characters.'
                    : 'Each character keeps their own separate memory pool.';
                jQuery('#et_memory_scope_hint').html(hint);
                jQuery('#et_memory_scope_hint_panel').text(
                    scope === 'global' ? 'One shared memory pool for all characters.' : 'Each character keeps their own separate memory pool.'
                );
                renderMemoryListInto('#et_memory_list', '#et_memory_empty', '#et_memory_list_label');
                renderMemoryListInto('#et_memory_list_panel', '#et_memory_empty_panel', '#et_memory_list_label_panel');
            });

            jQuery('#et_memory_add_btn').on('click', function () {
                jQuery('#et_memory_add_form').slideToggle(180);
                jQuery('#et_memory_form_content').focus();
            });

            jQuery('#et_memory_form_cancel').on('click', function () {
                jQuery('#et_memory_add_form').slideUp(180);
                jQuery('#et_memory_form_label').val('');
                jQuery('#et_memory_form_content').val('');
                jQuery('#et_memory_form_pin').prop('checked', false);
            });

            jQuery('#et_memory_form_save').on('click', function () {
                const category = jQuery('#et_memory_form_category').val();
                const label    = jQuery('#et_memory_form_label').val().trim();
                const content  = jQuery('#et_memory_form_content').val().trim();
                const pinned   = jQuery('#et_memory_form_pin').is(':checked');
                if (!content) {
                    jQuery('#et_memory_form_content').focus();
                    return;
                }
                const s = settings();
                const scope = s.memoryScope || 'per-character';
                const newMem = {
                    id:            Date.now().toString(36) + Math.random().toString(36).substring(2, 7),
                    category,
                    label:         label || (MEM_CATEGORIES[category] ? MEM_CATEGORIES[category].label : 'Memory'),
                    content,
                    createdAt:     Date.now(),
                    lastUsedTurn:  -999,
                    usageCount:    0,
                    pinned,
                    autoExtracted: false
                };
                if (scope === 'global') {
                    if (!Array.isArray(s.globalMemories)) s.globalMemories = [];
                    s.globalMemories.unshift(newMem);
                } else {
                    const charKeyFn = window._etGetCharacterKey;
                    const charKey   = typeof charKeyFn === 'function' ? charKeyFn() : null;
                    if (charKey) {
                        if (!s.characterMemories) s.characterMemories = {};
                        if (!Array.isArray(s.characterMemories[charKey])) s.characterMemories[charKey] = [];
                        s.characterMemories[charKey].unshift(newMem);
                    } else {
                        // No character — fall back to global
                        if (!Array.isArray(s.globalMemories)) s.globalMemories = [];
                        s.globalMemories.unshift(newMem);
                    }
                }
                saveSettings();
                jQuery('#et_memory_add_form').slideUp(180);
                jQuery('#et_memory_form_label').val('');
                jQuery('#et_memory_form_content').val('');
                jQuery('#et_memory_form_pin').prop('checked', false);
                renderMemoryListInto('#et_memory_list', '#et_memory_empty', '#et_memory_list_label');
                renderMemoryListInto('#et_memory_list_panel', '#et_memory_empty_panel', '#et_memory_list_label_panel');
            });

            jQuery('#et_memory_clear').on('click', function () {
                const btn = jQuery(this);
                if (!btn.hasClass('et-mem-confirm-pending')) {
                    btn.addClass('et-mem-confirm-pending');
                    btn.data('orig-html', btn.html());
                    btn.html('<i class="fa-solid fa-triangle-exclamation"></i> Click again to confirm');
                    clearTimeout(btn.data('confirm-timer'));
                    btn.data('confirm-timer', setTimeout(() => {
                        btn.removeClass('et-mem-confirm-pending');
                        btn.html(btn.data('orig-html'));
                    }, 3000));
                    return;
                }
                clearTimeout(btn.data('confirm-timer'));
                btn.removeClass('et-mem-confirm-pending');
                btn.html(btn.data('orig-html'));
                const s = settings();
                const scope = s.memoryScope || 'per-character';
                if (scope === 'global') {
                    s.globalMemories = [];
                } else {
                    const charKeyFn = window._etGetCharacterKey;
                    const charKey   = typeof charKeyFn === 'function' ? charKeyFn() : null;
                    if (charKey && s.characterMemories) delete s.characterMemories[charKey];
                }
                saveSettings();
                renderMemoryListInto('#et_memory_list', '#et_memory_empty', '#et_memory_list_label');
                renderMemoryListInto('#et_memory_list_panel', '#et_memory_empty_panel', '#et_memory_list_label_panel');
            });

        }

        // ============================================================
        // MEMORY SYSTEM EVENTS (Global Delegation)
        // ============================================================
        // Mounted once so they work in both the modal and the settings.html panel drawer.

        // Scope pills — panel drawer
        jQuery(document).on('click.et-mem-scope', '#et_memory_scope_pills_panel .et-mem-scope-btn', function () {
            const scope = jQuery(this).data('scope');
            settings().memoryScope = scope;
            saveSettings();
            updateMemoryScopePills('#et_memory_scope_pills_panel', scope);
            updateMemoryScopePills('#et_memory_scope_pills', scope);
            jQuery('#et_memory_scope_hint_panel').text(
                scope === 'global' ? 'One shared memory pool for all characters.' : 'Each character keeps their own separate memory pool.'
            );
            jQuery('#et_memory_scope_hint').html(
                scope === 'global'
                    ? 'One shared memory pool used across all characters.'
                    : 'Each character keeps their own separate memory pool.'
            );
            renderMemoryListInto('#et_memory_list_panel', '#et_memory_empty_panel', '#et_memory_list_label_panel');
            renderMemoryListInto('#et_memory_list', '#et_memory_empty', '#et_memory_list_label');
        });

        // Enable toggle — panel
        jQuery(document).on('change.et-mem', '#et_memory_enabled_panel', function () {
            settings().memoryEnabled = jQuery(this).is(':checked');
            saveSettings();
            jQuery('#et_memory_enabled').prop('checked', settings().memoryEnabled);
        });

        // Auto-highlight toggle — panel
        jQuery(document).on('change.et-mem', '#et_memory_auto_extract_panel', function () {
            const checked = jQuery(this).is(':checked');
            settings().memoryAutoExtract = checked;
            saveSettings();
            jQuery('#et_memory_auto_extract').prop('checked', checked);
            jQuery('#et_memory_hl_picker_panel_wrap').toggle(checked);
            jQuery('#et_memory_hl_picker_modal_wrap').toggle(checked);
        });

        // Highlight style picker — global delegation (works in both modal and panel)
        jQuery(document).on('click.et-mem', '.et-mem-hl-btn', function () {
            const style = jQuery(this).data('hl');
            if (!style) return;
            settings().memoryHighlightStyle = style;
            saveSettings();
            // Sync both pickers
            updateHlPickerActive('#et_memory_hl_picker_modal', style);
            updateHlPickerActive('#et_memory_hl_picker_panel', style);
            // Live-update marks already rendered in the chat
            if (typeof window._etUpdateMemoryHlStyle === 'function') window._etUpdateMemoryHlStyle(style);
        });

        // Add button — panel
        jQuery(document).on('click.et-mem', '#et_memory_add_btn_panel', function () {
            jQuery('#et_memory_add_form_panel').slideToggle(180);
        });

        // Cancel add — panel
        jQuery(document).on('click.et-mem', '#et_memory_form_cancel_panel', function () {
            jQuery('#et_memory_add_form_panel').slideUp(180);
            jQuery('#et_memory_form_label_panel, #et_memory_form_content_panel').val('');
            jQuery('#et_memory_form_pin_panel').prop('checked', false);
        });

        // Save new memory — panel
        jQuery(document).on('click.et-mem', '#et_memory_form_save_panel', function () {
            const category = jQuery('#et_memory_form_category_panel').val();
            const label    = jQuery('#et_memory_form_label_panel').val().trim();
            const content  = jQuery('#et_memory_form_content_panel').val().trim();
            const pinned   = jQuery('#et_memory_form_pin_panel').is(':checked');
            if (!content) { jQuery('#et_memory_form_content_panel').focus(); return; }

            const s     = settings();
            const scope = s.memoryScope || 'per-character';
            const newMem = {
                id:            Date.now().toString(36) + Math.random().toString(36).substring(2, 7),
                category,
                label:         label || (MEM_CATEGORIES[category] ? MEM_CATEGORIES[category].label : 'Memory'),
                content,
                createdAt:     Date.now(),
                lastUsedTurn:  -999,
                usageCount:    0,
                pinned,
                autoExtracted: false
            };

            if (scope === 'global') {
                if (!Array.isArray(s.globalMemories)) s.globalMemories = [];
                s.globalMemories.unshift(newMem);
            } else {
                const charKeyFn = window._etGetCharacterKey;
                const charKey   = typeof charKeyFn === 'function' ? charKeyFn() : null;
                if (charKey) {
                    if (!s.characterMemories) s.characterMemories = {};
                    if (!Array.isArray(s.characterMemories[charKey])) s.characterMemories[charKey] = [];
                    s.characterMemories[charKey].unshift(newMem);
                } else {
                    if (!Array.isArray(s.globalMemories)) s.globalMemories = [];
                    s.globalMemories.unshift(newMem);
                }
            }
            saveSettings();
            jQuery('#et_memory_add_form_panel').slideUp(180);
            jQuery('#et_memory_form_label_panel, #et_memory_form_content_panel').val('');
            jQuery('#et_memory_form_pin_panel').prop('checked', false);
            renderMemoryListInto('#et_memory_list_panel', '#et_memory_empty_panel', '#et_memory_list_label_panel');
            renderMemoryListInto('#et_memory_list', '#et_memory_empty', '#et_memory_list_label');
        });

        // Clear all — panel
        jQuery(document).on('click.et-mem', '#et_memory_clear_panel', function () {
            const btn = jQuery(this);
            if (!btn.hasClass('et-mem-confirm-pending')) {
                btn.addClass('et-mem-confirm-pending');
                btn.data('orig-html', btn.html());
                btn.html('<i class="fa-solid fa-triangle-exclamation"></i> Click again to confirm');
                clearTimeout(btn.data('confirm-timer'));
                btn.data('confirm-timer', setTimeout(() => {
                    btn.removeClass('et-mem-confirm-pending');
                    btn.html(btn.data('orig-html'));
                }, 3000));
                return;
            }
            clearTimeout(btn.data('confirm-timer'));
            btn.removeClass('et-mem-confirm-pending');
            btn.html(btn.data('orig-html'));
            const s     = settings();
            const scope = s.memoryScope || 'per-character';
            if (scope === 'global') {
                s.globalMemories = [];
            } else {
                const charKeyFn = window._etGetCharacterKey;
                const charKey   = typeof charKeyFn === 'function' ? charKeyFn() : null;
                if (charKey && s.characterMemories) delete s.characterMemories[charKey];
            }
            saveSettings();
            renderMemoryListInto('#et_memory_list_panel', '#et_memory_empty_panel', '#et_memory_list_label_panel');
            renderMemoryListInto('#et_memory_list', '#et_memory_empty', '#et_memory_list_label');
        });

        // Memory card action buttons (pin, edit, delete) — works in both modal & panel
        jQuery(document).on('click.et-mem', '.et-mem-btn[data-mem-action]', function (e) {
            e.stopPropagation();
            const btn    = jQuery(this);
            const action = btn.data('mem-action');
            const card   = btn.closest('.et-mem-card');
            const memId  = card.data('mem-id');
            if (!memId) return;

            if (action === 'delete') {
                if (!btn.hasClass('et-mem-confirm-pending')) {
                    btn.addClass('et-mem-confirm-pending');
                    btn.data('orig-html', btn.html());
                    btn.html('<i class="fa-solid fa-triangle-exclamation"></i> Sure?');
                    clearTimeout(btn.data('confirm-timer'));
                    btn.data('confirm-timer', setTimeout(() => {
                        btn.removeClass('et-mem-confirm-pending');
                        btn.html(btn.data('orig-html'));
                    }, 3000));
                    return;
                }
                clearTimeout(btn.data('confirm-timer'));
                btn.removeClass('et-mem-confirm-pending');
                btn.html(btn.data('orig-html'));
                const s = settings();
                const removeFrom = (list) => {
                    if (!Array.isArray(list)) return false;
                    const idx = list.findIndex(m => m.id === memId);
                    if (idx !== -1) { list.splice(idx, 1); return true; }
                    return false;
                };
                let found = removeFrom(s.globalMemories);
                if (!found && s.characterMemories) {
                    for (const k of Object.keys(s.characterMemories)) {
                        if (removeFrom(s.characterMemories[k])) { found = true; break; }
                    }
                }
                if (found) saveSettings();
                renderMemoryListInto('#et_memory_list', '#et_memory_empty', '#et_memory_list_label');
                renderMemoryListInto('#et_memory_list_panel', '#et_memory_empty_panel', '#et_memory_list_label_panel');
                return;
            }

            if (action === 'pin') {
                const s = settings();
                const togglePin = (list) => {
                    if (!Array.isArray(list)) return false;
                    const idx = list.findIndex(m => m.id === memId);
                    if (idx === -1) return false;
                    list[idx].pinned = !list[idx].pinned;
                    return true;
                };
                let found = togglePin(s.globalMemories);
                if (!found && s.characterMemories) {
                    for (const k of Object.keys(s.characterMemories)) {
                        if (togglePin(s.characterMemories[k])) { found = true; break; }
                    }
                }
                if (found) saveSettings();
                renderMemoryListInto('#et_memory_list', '#et_memory_empty', '#et_memory_list_label');
                renderMemoryListInto('#et_memory_list_panel', '#et_memory_empty_panel', '#et_memory_list_label_panel');
                return;
            }

            if (action === 'edit') {
                const editPanel = card.find('.et-mem-card-edit');
                const isOpen    = editPanel.is(':visible');
                editPanel.slideToggle(160);
                card.find('.et-mem-card-content, .et-mem-card-label').toggle(isOpen);
                return;
            }
        });

        // Save inline edit
        jQuery(document).on('click.et-mem', '.et-mem-edit-save', function () {
            const card   = jQuery(this).closest('.et-mem-card');
            const memId  = card.data('mem-id');
            if (!memId) return;
            const category = card.find('.et-mem-edit-category').val();
            const label    = card.find('.et-mem-edit-label').val().trim();
            const content  = card.find('.et-mem-edit-content').val().trim();
            const pinned   = card.find('.et-mem-edit-pin').is(':checked');

            const s = settings();
            const applyEdit = (list) => {
                if (!Array.isArray(list)) return false;
                const idx = list.findIndex(m => m.id === memId);
                if (idx === -1) return false;
                list[idx].category = category;
                list[idx].label    = label || list[idx].label;
                list[idx].content  = content;
                list[idx].pinned   = pinned;
                return true;
            };
            let found = applyEdit(s.globalMemories);
            if (!found && s.characterMemories) {
                for (const k of Object.keys(s.characterMemories)) {
                    if (applyEdit(s.characterMemories[k])) { found = true; break; }
                }
            }
            if (found) saveSettings();
            renderMemoryListInto('#et_memory_list', '#et_memory_empty', '#et_memory_list_label');
            renderMemoryListInto('#et_memory_list_panel', '#et_memory_empty_panel', '#et_memory_list_label_panel');
        });

        // Cancel inline edit
        jQuery(document).on('click.et-mem', '.et-mem-edit-cancel', function () {
            const card      = jQuery(this).closest('.et-mem-card');
            const editPanel = card.find('.et-mem-card-edit');
            editPanel.slideUp(160);
            card.find('.et-mem-card-content, .et-mem-card-label').show();
        });

        // ============================================================
        // PROMPT MANAGER EVENTS (Global Delegation)
        // ============================================================
        // Mounted once globally so they work for both the modal and the settings.html drawer

        // Prompt Manager — group collapse / expand
        jQuery(document).on('click.et-pm', '.et-pm-group-header', function () {
            const group = jQuery(this).closest('.et-pm-group');
            group.toggleClass('et-pm-group-collapsed');
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

        return {
            buildSettingsModalHtml,
            openSettingsModal,
            closeSettingsModal,
            updateFontPreview,
            updateThemePreviewFull,
            bindSettingsModalEvents,
            buildPromptManagerSectionHtml,
            buildMemorySectionHtml,
            renderMemoryListInto
        };
    }

    // ─────────────────────────────────────────────────────────────
    // iOS Slider Patch
    //
    // On iOS/Safari, <input type="range"> inside a scrollable
    // container has its touchmove events captured by the scroll
    // system before the browser's own range handler can act.
    // The result: tapping or dragging the slider does nothing.
    //
    // Fix: attach our own touchstart + touchmove listeners with
    // passive:false so we can call preventDefault (preventing the
    // scroll from stealing the gesture), then manually compute and
    // set the value from the raw touch coordinates.
    //
    // Called once on DOMContentLoaded (covers panel sliders in
    // settings.html) and again each time the settings modal opens
    // (covers modal-only sliders injected dynamically).
    // ─────────────────────────────────────────────────────────────
    function patchIOSSliders(root) {
        var scope = (root instanceof Element || root instanceof Document) ? root : document;
        scope.querySelectorAll('input[type="range"].et-slider').forEach(function (slider) {
            // Guard: don't attach twice
            if (slider._etIosPatch) return;
            slider._etIosPatch = true;

            function valueFromTouch(touch) {
                var rect  = slider.getBoundingClientRect();
                var min   = parseFloat(slider.min)  || 0;
                var max   = parseFloat(slider.max)  || 100;
                var step  = parseFloat(slider.step) || 1;
                var ratio = (touch.clientX - rect.left) / rect.width;
                ratio = Math.max(0, Math.min(1, ratio));
                var val = min + ratio * (max - min);
                // Snap to the nearest step
                val = Math.round(val / step) * step;
                // Fix floating-point drift (e.g. 0.1 + 0.2 ≠ 0.3)
                var decimals = (step.toString().split('.')[1] || '').length;
                val = parseFloat(val.toFixed(decimals));
                return Math.max(min, Math.min(max, val));
            }

            // touchstart: claim the gesture immediately so iOS doesn't
            // treat it as a potential scroll. Also update on tap.
            slider.addEventListener('touchstart', function (e) {
                e.preventDefault();   // stop scroll-intent detection
                e.stopPropagation();
                slider.value = valueFromTouch(e.touches[0]);
                slider.dispatchEvent(new Event('input',  { bubbles: true }));
            }, { passive: false });

            // touchmove: keep updating while the finger drags
            slider.addEventListener('touchmove', function (e) {
                e.preventDefault();   // prevent scroll from taking over
                e.stopPropagation();
                slider.value = valueFromTouch(e.touches[0]);
                slider.dispatchEvent(new Event('input',  { bubbles: true }));
            }, { passive: false });

            // touchend: fire a final change event (mirrors mouse behaviour)
            slider.addEventListener('touchend', function (e) {
                e.stopPropagation();
                slider.dispatchEvent(new Event('change', { bubbles: true }));
            }, { passive: true });
        });
    }

    // patchIOSSliders is also called by index.js at the end of
    // bindPanelSettingsEvents() — the correct moment when the panel
    // HTML is in the DOM and all jQuery input.panel handlers are bound.
    window.EchoTextSettingsModal = { createSettingsModal, patchIOSSliders };
})();

jQuery(document).on('change', '#et_anti_refusal_panel, #et_anti_refusal', function() {
    if (typeof updateAntiRefusalPromptsVisibility === 'function') updateAntiRefusalPromptsVisibility();
});
