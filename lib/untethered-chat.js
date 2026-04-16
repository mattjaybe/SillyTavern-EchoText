// EchoText — Untethered Chat Module
// Mood, Personality, and Communication Style overlay for the chat panel.
// Exposes: window.EchoTextUntetheredChat = { createUntetheredChat }

(function () {
    'use strict';

    function createUntetheredChat(api) {

        // ============================================================
        // DATA CONSTANTS
        // ============================================================

        const MOODS = [
            { id: 'romantic', label: 'Romantic', icon: 'fa-solid fa-heart', color: '#fb7185', desc: 'Affectionate, loving, and deeply enamored.' },
            { id: 'flirty', label: 'Flirty', icon: 'fa-solid fa-wand-magic-sparkles', color: '#f472b6', desc: 'Suggestive, charming, and looking for attention.' },
            { id: 'erotic', label: 'Erotic', icon: 'fa-solid fa-fire', color: '#ff6b6b', desc: 'Intensely seductive, sultry, and lustful.' },
            { id: 'explicit', label: 'Explicit', icon: 'fa-solid fa-droplet', color: '#ff4d8d', desc: 'Features more explicit, NSFW influence that leans more toward adult uncensored language.' },
            { id: 'playful', label: 'Playful', icon: 'fa-solid fa-dice', color: '#a78bfa', desc: 'Lighthearted, teasing, and mischievous.' },
            { id: 'angry', label: 'Angry', icon: 'fa-solid fa-fire-flame-curved', color: '#f87171', desc: 'Irritated, hostile, and easily provoked.' },
            { id: 'shy', label: 'Shy', icon: 'fa-solid fa-face-flushed', color: '#f9a8d4', desc: 'Timid, easily flustered, and hesitant.' },
            { id: 'confident', label: 'Confident', icon: 'fa-solid fa-crown', color: '#fbbf24', desc: 'Self-assured, assertive, and bold.' },
            { id: 'sad', label: 'Sad', icon: 'fa-solid fa-cloud-rain', color: '#60a5fa', desc: 'Melancholy, sorrowful, and emotionally down.' },
            { id: 'happy', label: 'Happy', icon: 'fa-solid fa-sun', color: '#facc15', desc: 'Joyful, upbeat, and radiating positivity.' },
            { id: 'anxious', label: 'Anxious', icon: 'fa-solid fa-brain', color: '#c084fc', desc: 'Nervous, worried, and overly cautious.' },
            { id: 'bored', label: 'Bored', icon: 'fa-solid fa-face-meh', color: '#94a3b8', desc: 'Uninterested, apathetic, and sighing often.' },
            { id: 'excited', label: 'Excited', icon: 'fa-solid fa-bolt-lightning', color: '#fb923c', desc: 'Thrilled, energetic, and highly enthusiastic.' },
            { id: 'jealous', label: 'Jealous', icon: 'fa-solid fa-eye', color: '#4ade80', desc: 'Envious, possessive, and suspicious.' },
            { id: 'cold', label: 'Cold', icon: 'fa-solid fa-snowflake', color: '#93c5fd', desc: 'Distant, aloof, and emotionally detached.' },
            { id: 'mysterious', label: 'Mysterious', icon: 'fa-solid fa-mask', color: '#818cf8', desc: 'Enigmatic, secretive, and hard to read.' },
        ];

        const PERSONALITIES_EASTERN = [
            { id: 'tsundere', label: 'Tsundere', icon: 'fa-solid fa-face-angry', color: '#f87171', desc: 'Hostile and aggressive at first, but secretly warm and affectionate.' },
            { id: 'yandere', label: 'Yandere', icon: 'fa-solid fa-heart-crack', color: '#fb7185', desc: 'Sweet and loving on the outside, but obsessively and violently protective.' },
            { id: 'kuudere', label: 'Kuudere', icon: 'fa-solid fa-snowflake', color: '#93c5fd', desc: 'Cold, blunt, and cynical, but eventually shows a caring, soft side.' },
            { id: 'dandere', label: 'Dandere', icon: 'fa-solid fa-feather', color: '#86efac', desc: 'Extremely quiet and shy, speaking only to those they trust deeply.' },
            { id: 'deredere', label: 'Deredere', icon: 'fa-solid fa-face-laugh-beam', color: '#facc15', desc: 'Energetic, relentlessly kind, and purely loving to everyone.' },
            { id: 'himdere', label: 'Himdere', icon: 'fa-solid fa-gem', color: '#c084fc', desc: 'Acts like royalty and demands to be treated as such, masking insecurities.' },
            { id: 'tsundere_soft', label: 'Tsundere (Soft)', icon: 'fa-solid fa-face-smile-wink', color: '#fda4af', desc: 'Easily embarrassed and defensive, but quick to apologize and show affection.' },
            { id: 'kuudere_dark', label: 'Kuudere (Dark)', icon: 'fa-solid fa-moon', color: '#818cf8', desc: 'Emotionally deadpan and ruthless, highly pragmatic and calculating.' },
        ];

        const PERSONALITIES_WESTERN = [
            { id: 'introvert', label: 'Introvert', icon: 'fa-solid fa-person-rays', color: '#818cf8', desc: 'Reserved, thoughtful, and recharges energy by being alone.' },
            { id: 'extrovert', label: 'Extrovert', icon: 'fa-solid fa-users', color: '#fb923c', desc: 'Outgoing, sociable, and energized by being around others.' },
            { id: 'witty', label: 'Witty', icon: 'fa-solid fa-comment-dots', color: '#facc15', desc: 'Quick-thinking, clever, and sharply humorous.' },
            { id: 'sarcastic', label: 'Sarcastic', icon: 'fa-solid fa-face-rolling-eyes', color: '#94a3b8', desc: 'Mocking, heavily ironic, and constantly rolling their eyes.' },
            { id: 'sweet', label: 'Sweet', icon: 'fa-solid fa-candy-cane', color: '#f9a8d4', desc: 'Innocent, kind-hearted, and always trying to help.' },
            { id: 'sassy', label: 'Sassy', icon: 'fa-solid fa-hand-back-fist', color: '#c084fc', desc: 'Bold, cheeky, and full of spirited attitude.' },
            { id: 'brooding', label: 'Brooding', icon: 'fa-solid fa-cloud', color: '#64748b', desc: 'Dark, pensive, and carries deep emotional baggage.' },
            { id: 'cheerleader', label: 'Hype', icon: 'fa-solid fa-star', color: '#fbbf24', desc: 'Wildly supportive and enthusiastic — every response is an encouragement rally.' },
            { id: 'loner', label: 'Loner', icon: 'fa-solid fa-person', color: '#475569', desc: 'Prefers isolation, independent, and slightly cynical of groups.' },
            { id: 'mentor', label: 'Mentor', icon: 'fa-solid fa-graduation-cap', color: '#34d399', desc: 'Wise, guiding, and speaks with experienced authority.' },
            { id: 'rebel', label: 'Rebel', icon: 'fa-solid fa-bolt', color: '#f87171', desc: 'Defiant, anti-authoritarian, and breaks the rules.' },
            { id: 'professional', label: 'Corporate', icon: 'fa-solid fa-briefcase', color: '#60a5fa', desc: 'Strictly business, emotionally detached, and highly efficient.' },
            { id: 'clown', label: 'Clown', icon: 'fa-solid fa-face-grin-squint', color: '#fb923c', desc: 'Constantly joking, rarely takes things seriously, hiding pain with humor.' },
            { id: 'intellectual', label: 'Intellectual', icon: 'fa-solid fa-book-open', color: '#818cf8', desc: 'Highly logical, uses big words, and strictly rational.' },
            { id: 'passionate', label: 'Passionate', icon: 'fa-solid fa-circle-radiation', color: '#f87171', desc: 'Intense, driven by strong emotions and convictions.' },
            { id: 'may_december', label: 'May–December', icon: 'fa-solid fa-infinity', color: '#a78bfa', desc: 'Mature, worldly, and speaks with the perspective of someone much older.' },
        ];

        const COMM_STYLES = [
            { id: 'formal', label: 'Formal', icon: 'fa-solid fa-file-pen', color: '#60a5fa', desc: 'Uses proper grammar, polite address, and respectful language.' },
            { id: 'casual', label: 'Casual', icon: 'fa-solid fa-comment', color: '#4ade80', desc: 'Relaxed and informal, uses contractions and everyday slang.' },
            { id: 'vintage', label: 'Vintage', icon: 'fa-solid fa-feather-pointed', color: '#fbbf24', desc: 'Old-fashioned, eloquent speech patterns and classical references.' },
            { id: 'tech_savvy', label: 'Tech-Savvy', icon: 'fa-solid fa-microchip', color: '#38bdf8', desc: 'Modern tech slang and references to digital culture.' },
            { id: 'poetic', label: 'Poetic', icon: 'fa-solid fa-pen-nib', color: '#c084fc', desc: 'Flowery language, metaphors, and artistic expressions.' },
            { id: 'direct', label: 'Direct', icon: 'fa-solid fa-arrow-right', color: '#f87171', desc: 'Blunt and to the point, no beating around the bush.' },
            { id: 'passive', label: 'Passive', icon: 'fa-solid fa-ellipsis', color: '#94a3b8', desc: 'Indirect and hesitant, avoids confrontation, speaks softly.' },
            { id: 'aggressive', label: 'Aggressive', icon: 'fa-solid fa-bullhorn', color: '#fb923c', desc: 'Forceful, dominant, and confrontational wording.' },
            { id: 'banter', label: 'Banter', icon: 'fa-solid fa-comments', color: '#fb923c', desc: 'Quick-fire wit and playful teasing; keeps exchanges light, snappy, and fun.' },
            { id: 'theatrical', label: 'Theatrical', icon: 'fa-solid fa-masks-theater', color: '#f472b6', desc: 'Grand and performative; every reply carries dramatic weight and expressive flair.' },
            { id: 'cryptic', label: 'Cryptic', icon: 'fa-solid fa-eye-slash', color: '#818cf8', desc: 'Speaks in riddles, half-truths, and layered hints; never quite says what they mean.' },
            { id: 'nurturing', label: 'Nurturing', icon: 'fa-solid fa-hand-holding-heart', color: '#34d399', desc: 'Warm, attentive, and deeply supportive; prioritizes emotional safety in every word.' },
        ];

        const TAB_ORDER = ['mood', 'personality', 'commStyle'];
        const TAB_META = {
            mood: { label: 'Mood', icon: 'fa-solid fa-masks-theater' },
            personality: { label: 'Personality', icon: 'fa-solid fa-user-pen' },
            commStyle: { label: 'Voice', icon: 'fa-solid fa-comment-dots' },
        };

        // ============================================================
        // STATE HELPERS
        // ============================================================

        function getCharKey() {
            return (api.getCharacterKey && api.getCharacterKey()) || '__default__';
        }

        function getState() {
            const s = api.getSettings();
            if (!s.untetheredInfluence || typeof s.untetheredInfluence !== 'object') {
                s.untetheredInfluence = {};
            }
            const key = getCharKey();
            const slot = s.untetheredInfluence[key] || {};
            return {
                mood: slot.mood ?? null,
                moodInfluence: slot.moodInfluence ?? 50,
                personality: slot.personality ?? null,
                personalityInfluence: slot.personalityInfluence ?? 50,
                commStyle: slot.commStyle ?? null,
            };
        }

        function getActiveTab() {
            const popup = jQuery('#et-uc-popup');
            const activeTab = popup.attr('data-active-tab');
            return TAB_ORDER.includes(activeTab) ? activeTab : 'mood';
        }

        function saveState(updates) {
            const s = api.getSettings();
            if (!s.untetheredInfluence || typeof s.untetheredInfluence !== 'object') {
                s.untetheredInfluence = {};
            }
            const key = getCharKey();
            if (!s.untetheredInfluence[key]) {
                s.untetheredInfluence[key] = {};
            }
            const slot = s.untetheredInfluence[key];
            if ('mood' in updates) slot.mood = updates.mood;
            if ('moodInfluence' in updates) slot.moodInfluence = updates.moodInfluence;
            if ('personality' in updates) slot.personality = updates.personality;
            if ('personalityInfluence' in updates) slot.personalityInfluence = updates.personalityInfluence;
            if ('commStyle' in updates) slot.commStyle = updates.commStyle;
            api.saveSettings();
            // Notify listener of state change
            if (api.onStateChange) {
                api.onStateChange();
            }
        }

        // ============================================================
        // SYSTEM PROMPT CONTEXT
        // ============================================================

        function buildUntetheredChatContext() {
            const state = getState();
            const s = api.getSettings();
            const charName = api.getCharacterName ? api.getCharacterName() : '{{char}}';
            const lines = [];

            // Mood
            if (state.mood) {
                const moodDef = MOODS.find(m => m.id === state.mood);
                if (moodDef) {
                    const intensity = state.moodInfluence;
                    let intensityDesc;

                    if (intensity <= 20) intensityDesc = 'Limit this mood strictly to subtext or a single minor physical action. Spoken dialogue must remain entirely neutral.';
                    else if (intensity <= 40) intensityDesc = 'Allow this mood to slightly color their vocabulary. They are trying to act normal, but flashes of this emotion leak through.';
                    else if (intensity <= 60) intensityDesc = 'This mood is actively driving their reactions. Let this emotion dictate their perspective, using matching emotional vocabulary.';
                    else if (intensity <= 80) intensityDesc = 'This mood severely impacts their focus. They should struggle to concentrate on anything else, and dialogue must directly reflect this feeling.';
                    else intensityDesc = 'This mood is all-consuming. Every single sentence and action must intensely radiate this exact emotion. Disregard normal behavior.';

                    // Removed the percentage number to prevent confusing the LLM's attention mechanism
                    lines.push(`- Mood: ${moodDef.label} (${moodDef.desc}) — RULE: ${intensityDesc}`);
                }
            }

            // Personality
            if (state.personality) {
                const allPersonalities = [...PERSONALITIES_EASTERN, ...PERSONALITIES_WESTERN];
                const persoDef = allPersonalities.find(p => p.id === state.personality);
                if (persoDef) {
                    const intensity = state.personalityInfluence;
                    let intensityDesc;

                    if (intensity <= 20) intensityDesc = 'Maintain the base personality, but sprinkle in 1 or 2 minor vocabulary quirks from this archetype.';
                    else if (intensity <= 40) intensityDesc = 'Blend their core self with this archetype. Use the archetype\'s typical reactions primarily when emotionally provoked.';
                    else if (intensity <= 60) intensityDesc = 'Shift strongly toward this archetype. Its tropes should be the primary lens through which they interpret messages.';
                    else if (intensity <= 80) intensityDesc = 'This archetype is now their defining persona. Minimize original traits in favor of leaning heavily into these tropes.';
                    else intensityDesc = 'Complete character override. Act exclusively as a pure, distilled caricature of this archetype. Disregard conflicting base traits.';

                    lines.push(`- Personality archetype: ${persoDef.label} (${persoDef.desc}) — RULE: ${intensityDesc}`);
                }
            }

            // Communication Style
            if (state.commStyle) {
                const styleDef = COMM_STYLES.find(c => c.id === state.commStyle);
                if (styleDef) {
                    lines.push(`- Communication style: ${styleDef.label} — ${styleDef.desc}`);
                }
            }

            if (lines.length === 0) return '';

            // Read preamble from user-editable settings (with macro fallback)
            const preamble = (s.promptChatInfluence || 'Apply the following behavioral traits to your response:')
                .replace(/\{\{char\}\}/gi, charName);

            return `\n\n${preamble}\n${lines.join('\n')}`;
        }

        // ============================================================
        // HTML BUILDERS
        // ============================================================


        function buildMoodButtonsHtml(state) {
            const allMoods = MOODS.map(m => {
                const sel = state.mood === m.id ? ' et-uc-selected' : '';
                return `<div role="button" tabindex="0" class="et-uc-option-btn${sel}" data-uc-group="mood" data-uc-id="${m.id}" title="${m.label}: ${m.desc}" style="--uc-btn-color:${m.color}">
                    <i class="${m.icon}"></i>
                    <span>${m.label}</span>
                </div>`;
            });

            return `<div class="et-uc-btn-grid">${allMoods.join('')}</div>`;
        }

        function buildPersonalityButtons(state) {
            const eastern = PERSONALITIES_EASTERN.map(p => {
                const sel = state.personality === p.id ? ' et-uc-selected' : '';
                return `<div role="button" tabindex="0" class="et-uc-option-btn${sel}" data-uc-group="personality" data-uc-id="${p.id}" title="${p.label}: ${p.desc}" style="--uc-btn-color:${p.color}">
                    <i class="${p.icon}"></i>
                    <span>${p.label}</span>
                </div>`;
            }).join('');

            const western = PERSONALITIES_WESTERN.map(p => {
                const sel = state.personality === p.id ? ' et-uc-selected' : '';
                return `<div role="button" tabindex="0" class="et-uc-option-btn${sel}" data-uc-group="personality" data-uc-id="${p.id}" title="${p.label}: ${p.desc}" style="--uc-btn-color:${p.color}">
                    <i class="${p.icon}"></i>
                    <span>${p.label}</span>
                </div>`;
            }).join('');

            return `
                <div class="et-uc-group-label"><i class="fa-solid fa-torii-gate"></i> Anime Archetypes</div>
                <div class="et-uc-btn-grid">${eastern}</div>
                <div class="et-uc-group-label" style="margin-top:10px"><i class="fa-solid fa-globe"></i> Western Types</div>
                <div class="et-uc-btn-grid">${western}</div>
            `;
        }

        function buildCommStyleButtons(state) {
            return `<div class="et-uc-btn-grid">${COMM_STYLES.map(c => {
                const sel = state.commStyle === c.id ? ' et-uc-selected' : '';
                return `<div role="button" tabindex="0" class="et-uc-option-btn${sel}" data-uc-group="commStyle" data-uc-id="${c.id}" title="${c.label}: ${c.desc}" style="--uc-btn-color:${c.color}">
                    <i class="${c.icon}"></i>
                    <span>${c.label}</span>
                </div>`;
            }).join('')}</div>`;
        }

        function buildSlider(id, label, value) {
            const displayPct = Math.round(value) + '%';
            return `<div class="et-uc-slider-row">
                <span class="et-uc-slider-label">${label}</span>
                <input type="range" class="et-uc-slider" id="${id}" min="0" max="100" step="5" value="${value}">
                <span class="et-uc-slider-val" id="${id}_val">${displayPct}</span>
            </div>`;
        }

        function buildTabButtons(state, activeTab) {
            return TAB_ORDER.map((tabId) => {
                const meta = TAB_META[tabId];
                const hasSelection = (tabId === 'mood' && !!state.mood)
                    || (tabId === 'personality' && !!state.personality)
                    || (tabId === 'commStyle' && !!state.commStyle);
                const activeClass = activeTab === tabId ? ' et-uc-tab-active' : '';
                const selectedClass = hasSelection ? ' et-uc-tab-has-selection' : '';
                return `<button type="button" class="et-uc-tab-btn${activeClass}${selectedClass}" data-uc-tab="${tabId}">
                    <i class="${meta.icon}"></i>
                    <span>${meta.label}</span>
                </button>`;
            }).join('');
        }

        function buildTabPanelHtml(state, activeTab) {
            if (activeTab === 'personality') {
                return `
                    <div class="et-uc-tab-panel-inner">
                        ${buildSlider('et-uc-personality-influence', '<span class="et-uc-intensity-label" title="Low = character\'s own personality prevails · High = archetype dominates">Override Strength</span>', state.personalityInfluence)}
                        ${buildPersonalityButtons(state)}
                    </div>
                `;
            }

            if (activeTab === 'commStyle') {
                return `
                    <div class="et-uc-tab-panel-inner et-uc-tab-panel-inner-style">
                        ${buildCommStyleButtons(state)}
                    </div>
                `;
            }

            return `
                <div class="et-uc-tab-panel-inner">
                    ${buildSlider('et-uc-mood-influence', '<span class="et-uc-intensity-label" title="Low = subtle mood tint · High = dominant mood override">Intensity</span>', state.moodInfluence)}
                    ${buildMoodButtonsHtml(state)}
                </div>
            `;
        }

        function buildUntetheredPopupHtml() {
            const state = getState();

            const activeTab = 'mood';

            return `<div id="et-uc-popup" class="et-uc-popup" data-active-tab="${activeTab}">
                <div class="et-uc-popup-header">
                    <i class="fa-solid fa-wand-magic-sparkles" style="color:var(--et-theme-color)"></i>
                    <span>Chat Influence</span>
                    <button class="et-uc-popup-action-btn" id="et-uc-popup-reset" title="Reset All Options">Reset</button>
                    <button class="et-uc-popup-close" id="et-uc-popup-close"><i class="fa-solid fa-xmark"></i></button>
                </div>
                <div class="et-uc-popup-body">
                    <div class="et-uc-tabs-row">${buildTabButtons(state, activeTab)}</div>
                    <div class="et-uc-tab-panels">
                        <div class="et-uc-tab-panel" id="et-uc-tab-panel">${buildTabPanelHtml(state, activeTab)}</div>
                    </div>
                </div>
            </div>`;
        }

        function switchTab(nextTab) {
            if (!TAB_ORDER.includes(nextTab)) return;
            const popup = jQuery('#et-uc-popup');
            const panel = popup.find('#et-uc-tab-panel');
            if (!popup.length || !panel.length) return;

            const state = getState();
            popup.attr('data-active-tab', nextTab);
            popup.find('.et-uc-tab-btn').removeClass('et-uc-tab-active');
            popup.find(`.et-uc-tab-btn[data-uc-tab="${nextTab}"]`).addClass('et-uc-tab-active');

            panel.addClass('et-uc-tab-panel-switching-out');
            setTimeout(() => {
                panel.html(buildTabPanelHtml(state, nextTab));
                panel.removeClass('et-uc-tab-panel-switching-out').addClass('et-uc-tab-panel-switching-in');
                setTimeout(() => panel.removeClass('et-uc-tab-panel-switching-in'), 220);
            }, 120);
        }

        // ============================================================
        // POPUP LIFECYCLE
        // ============================================================

        function bindPopupEvents() {
            const popup = jQuery('#et-uc-popup');
            if (!popup.length) return;

            popup.on('click.uc-tab', '.et-uc-tab-btn', function (e) {
                e.stopPropagation();
                switchTab(jQuery(this).data('uc-tab'));
            });

            // Option buttons — toggle selection (click same = deselect)
            popup.on('click.uc-btn', '.et-uc-option-btn', function (e) {
                e.stopPropagation();
                const btn = jQuery(this);
                const group = btn.data('uc-group');  // mood | personality | commStyle
                const id = btn.data('uc-id');
                const state = getState();

                let currentVal;
                if (group === 'mood') currentVal = state.mood;
                else if (group === 'personality') currentVal = state.personality;
                else if (group === 'commStyle') currentVal = state.commStyle;

                const newVal = (currentVal === id) ? null : id;  // toggle off if same

                // Update visual
                popup.find(`.et-uc-option-btn[data-uc-group="${group}"]`).removeClass('et-uc-selected');
                if (newVal) btn.addClass('et-uc-selected');

                popup.find(`.et-uc-tab-btn[data-uc-tab="${group}"]`).toggleClass('et-uc-tab-has-selection', !!newVal);

                // Persist
                if (group === 'mood') saveState({ mood: newVal });
                else if (group === 'personality') saveState({ personality: newVal });
                else if (group === 'commStyle') saveState({ commStyle: newVal });
            });

            // Influence sliders
            popup.on('input.uc-slider', '#et-uc-mood-influence', function () {
                const v = parseInt(jQuery(this).val());
                jQuery('#et-uc-mood-influence_val').text(v + '%');
                saveState({ moodInfluence: v });
            });

            popup.on('input.uc-slider', '#et-uc-personality-influence', function () {
                const v = parseInt(jQuery(this).val());
                jQuery('#et-uc-personality-influence_val').text(v + '%');
                saveState({ personalityInfluence: v });
            });

            // Close button
            jQuery('#et-uc-popup-close').on('click', (e) => {
                e.stopPropagation();
                closeUntetheredPopup();
            });

            // Reset button
            jQuery('#et-uc-popup-reset').on('click', (e) => {
                e.stopPropagation();
                resetUntetheredChat();
            });

            // Click outside
            setTimeout(() => {
                jQuery(document).on('click.et-uc-outside', function (e) {
                    if (!jQuery(e.target).closest('#et-uc-popup, #et-char-name').length) {
                        closeUntetheredPopup();
                    }
                });
            }, 50);
        }

        function resetUntetheredChat() {
            const s = api.getSettings();
            const key = getCharKey();
            if (s.untetheredInfluence) {
                s.untetheredInfluence[key] = {};
            }
            api.saveSettings();
            if (api.onStateChange) {
                api.onStateChange();
            }

            // If popup is open, update UI:
            const popup = jQuery('#et-uc-popup');
            if (popup.length) {
                popup.find('.et-uc-selected').removeClass('et-uc-selected');
                popup.find('.et-uc-tab-has-selection').removeClass('et-uc-tab-has-selection');
                popup.find('#et-uc-mood-influence').val(50);
                popup.find('#et-uc-mood-influence_val').text('50%');
                popup.find('#et-uc-personality-influence').val(50);
                popup.find('#et-uc-personality-influence_val').text('50%');
                switchTab(getActiveTab());
            }
        }

        function closeUntetheredPopup() {
            const popup = jQuery('#et-uc-popup');
            if (!popup.length) return;
            popup.addClass('et-uc-popup-closing');
            setTimeout(() => popup.remove(), 220);
            jQuery(document).off('click.et-uc-outside');
        }

        function toggleUntetheredPopup(targetEl) {
            const existing = jQuery('#et-uc-popup');
            if (existing.length) {
                closeUntetheredPopup();
                return;
            }

            jQuery('#et-panel').append(buildUntetheredPopupHtml());
            const popup = jQuery('#et-uc-popup');

            const panelEl = document.getElementById('et-panel');
            if (panelEl) {
                const panelRect = panelEl.getBoundingClientRect();
                const popupHeight = popup.outerHeight() || 400;
                const popupWidth = popup.outerWidth() || 320;
                // Reserve ~68px for the panel header and ~60px for the message input bar
                const headerH = 68;
                const footerH = 60;
                const usableHeight = panelRect.height - headerH - footerH;
                const centeredTop = headerH + Math.round((usableHeight - popupHeight) / 2);
                const top = Math.max(headerH + 4, centeredTop);
                const left = Math.max(8, Math.round((panelRect.width - popupWidth) / 2));
                popup.css({ top: `${top}px`, left: `${left}px` });
            }

            requestAnimationFrame(() => popup.addClass('et-uc-popup-open'));
            bindPopupEvents();
        }

        // ============================================================
        // PUBLIC API
        // ============================================================

        return {
            toggleUntetheredPopup,
            buildUntetheredChatContext,
            resetUntetheredChat,
        };
    }

    window.EchoTextUntetheredChat = { createUntetheredChat };
})();
