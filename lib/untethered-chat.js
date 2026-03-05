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
            { id: 'playful', label: 'Playful', icon: 'fa-solid fa-dice', color: '#a78bfa', desc: 'Lighthearted, teasing, and mischievous.' },
            { id: 'angry', label: 'Angry', icon: 'fa-solid fa-fire-flame-curved', color: '#f87171', desc: 'Irritated, hostile, and easily provoked.' },
            { id: 'shy', label: 'Shy', icon: 'fa-solid fa-face-flushed', color: '#f9a8d4', desc: 'Timid, easily flustered, and hesitant.' },
            { id: 'confident', label: 'Confident', icon: 'fa-solid fa-crown', color: '#fbbf24', desc: 'Self-assured, assertive, and bold.' },
            { id: 'romantic', label: 'Romantic', icon: 'fa-solid fa-heart', color: '#fb7185', desc: 'Affectionate, loving, and deeply enamored.' },
            { id: 'erotic', label: 'Erotic', icon: 'fa-solid fa-fire', color: '#ff6b6b', desc: 'Intensely seductive, sultry, and lustful.' },
            { id: 'sad', label: 'Sad', icon: 'fa-solid fa-cloud-rain', color: '#60a5fa', desc: 'Melancholy, sorrowful, and emotionally down.' },
            { id: 'happy', label: 'Happy', icon: 'fa-solid fa-sun', color: '#facc15', desc: 'Joyful, upbeat, and radiating positivity.' },
            { id: 'anxious', label: 'Anxious', icon: 'fa-solid fa-brain', color: '#c084fc', desc: 'Nervous, worried, and overly cautious.' },
            { id: 'bored', label: 'Bored', icon: 'fa-solid fa-face-meh', color: '#94a3b8', desc: 'Uninterested, apathetic, and sighing often.' },
            { id: 'excited', label: 'Excited', icon: 'fa-solid fa-bolt-lightning', color: '#fb923c', desc: 'Thrilled, energetic, and highly enthusiastic.' },
            { id: 'jealous', label: 'Jealous', icon: 'fa-solid fa-eye', color: '#4ade80', desc: 'Envious, possessive, and suspicious.' },
            { id: 'flirty', label: 'Flirty', icon: 'fa-solid fa-wand-magic-sparkles', color: '#f472b6', desc: 'Suggestive, charming, and looking for attention.' },
            { id: 'cold', label: 'Cold', icon: 'fa-solid fa-snowflake', color: '#93c5fd', desc: 'Distant, aloof, and emotionally detached.' },
            { id: 'protective', label: 'Protective', icon: 'fa-solid fa-shield-heart', color: '#34d399', desc: 'Fiercely guarding and caring for your safety.' },
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
            { id: 'cheerleader', label: 'Cheerleader', icon: 'fa-solid fa-star', color: '#fbbf24', desc: 'Highly supportive, blindly optimistic, and encouraging.' },
            { id: 'loner', label: 'Loner', icon: 'fa-solid fa-person', color: '#475569', desc: 'Prefers isolation, independent, and slightly cynical of groups.' },
            { id: 'mentor', label: 'Mentor', icon: 'fa-solid fa-graduation-cap', color: '#34d399', desc: 'Wise, guiding, and speaks with experienced authority.' },
            { id: 'rebel', label: 'Rebel', icon: 'fa-solid fa-bolt', color: '#f87171', desc: 'Defiant, anti-authoritarian, and breaks the rules.' },
            { id: 'professional', label: 'Professional', icon: 'fa-solid fa-briefcase', color: '#60a5fa', desc: 'Strictly business, emotionally detached, and highly efficient.' },
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
        ];

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
                    if (intensity <= 25) intensityDesc = 'a subtle undercurrent, barely noticeable';
                    else if (intensity <= 50) intensityDesc = 'present but balanced with their normal self';
                    else if (intensity <= 75) intensityDesc = 'noticeable and clearly influencing their behaviour';
                    else intensityDesc = 'dominant and front-and-center in everything they say';
                    lines.push(`- Mood: ${moodDef.label} (${moodDef.desc}) — intensity ${intensity}%: ${intensityDesc}.`);
                }
            }

            // Personality
            if (state.personality) {
                const allPersonalities = [...PERSONALITIES_EASTERN, ...PERSONALITIES_WESTERN];
                const persoDef = allPersonalities.find(p => p.id === state.personality);
                if (persoDef) {
                    const intensity = state.personalityInfluence;
                    let intensityDesc;
                    if (intensity <= 25) intensityDesc = 'a light flavouring on top of their base character';
                    else if (intensity <= 50) intensityDesc = 'noticeable but still blended with their core self';
                    else if (intensity <= 75) intensityDesc = 'strongly shaping how they speak and act';
                    else intensityDesc = 'fully dominant — let this archetype define every reply';
                    lines.push(`- Personality archetype: ${persoDef.label} (${persoDef.desc}) — intensity ${intensity}%: ${intensityDesc}.`);
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
            const preamble = (s.promptChatInfluence || 'CHARACTER BEHAVIOR OVERLAY \u2014 apply these traits throughout your response:')
                .replace(/\{\{char\}\}/gi, charName);

            return `\n\n${preamble}\n${lines.join('\n')}`;
        }

        // ============================================================
        // HTML BUILDERS
        // ============================================================

        function buildMoodButtons(state) {
            return MOODS.map(m => {
                const sel = state.mood === m.id ? ' et-uc-selected' : '';
                return `<div role="button" tabindex="0" class="et-uc-option-btn${sel}" data-uc-group="mood" data-uc-id="${m.id}" title="${m.label}: ${m.desc}" style="--uc-btn-color:${m.color}">
                    <i class="${m.icon}"></i>
                    <span>${m.label}</span>
                </div>`;
            }).join('');
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

        function buildSummaryHtml(group, id) {
            if (!id) return '';
            let item;
            if (group === 'mood') item = MOODS.find(m => m.id === id);
            else if (group === 'personality') item = [...PERSONALITIES_EASTERN, ...PERSONALITIES_WESTERN].find(p => p.id === id);
            else if (group === 'commStyle') item = COMM_STYLES.find(c => c.id === id);

            if (!item) return '';

            return `
                <div class="et-uc-summary-icon" style="color:${item.color}"><i class="${item.icon}"></i></div>
                <div class="et-uc-summary-text">
                    <div class="et-uc-summary-title">${item.label}</div>
                    <div class="et-uc-summary-desc">${item.desc}</div>
                </div>
            `;
        }

        function buildUntetheredPopupHtml() {
            const state = getState();

            const moodActive = state.mood ? ' et-uc-has-selection' : '';
            const personalityActive = state.personality ? ' et-uc-has-selection' : '';
            const styleActive = state.commStyle ? ' et-uc-has-selection' : '';

            return `<div id="et-uc-popup" class="et-uc-popup">
                <div class="et-uc-popup-header">
                    <i class="fa-solid fa-wand-magic-sparkles" style="color:var(--et-theme-color)"></i>
                    <span>Chat Influence</span>
                    <button class="et-uc-popup-action-btn" id="et-uc-popup-reset" title="Reset All Options">Reset</button>
                    <button class="et-uc-popup-close" id="et-uc-popup-close"><i class="fa-solid fa-xmark"></i></button>
                </div>
                <div class="et-uc-popup-body">

                    <!-- Mood Accordion -->
                    <div class="et-uc-accordion-section" id="et-uc-section-mood">
                        <div class="et-uc-accordion-header">
                            <span><i class="fa-solid fa-masks-theater"></i> Mood<span class="et-uc-active-dot${moodActive}" id="et-uc-mood-dot"></span></span>
                            <i class="fa-solid fa-chevron-down et-uc-chevron"></i>
                        </div>
                        <div class="et-uc-summary-box" id="et-uc-summary-mood">${buildSummaryHtml('mood', state.mood)}</div>
                        <div class="et-uc-accordion-content">
                            <div class="et-uc-btn-grid">${buildMoodButtons(state)}</div>
                            ${buildSlider('et-uc-mood-influence', 'Intensity', state.moodInfluence)}
                            <div class="et-uc-slider-hint">Low = subtle mood tint &nbsp;·&nbsp; High = dominant mood override</div>
                        </div>
                    </div>

                    <!-- Personality Accordion -->
                    <div class="et-uc-accordion-section" id="et-uc-section-personality">
                        <div class="et-uc-accordion-header">
                            <span><i class="fa-solid fa-user-pen"></i> Personality<span class="et-uc-active-dot${personalityActive}" id="et-uc-personality-dot"></span></span>
                            <i class="fa-solid fa-chevron-down et-uc-chevron"></i>
                        </div>
                        <div class="et-uc-summary-box" id="et-uc-summary-personality">${buildSummaryHtml('personality', state.personality)}</div>
                        <div class="et-uc-accordion-content">
                            ${buildPersonalityButtons(state)}
                            ${buildSlider('et-uc-personality-influence', 'Override Strength', state.personalityInfluence)}
                            <div class="et-uc-slider-hint">Low = character's own personality prevails &nbsp;·&nbsp; High = archetype dominates</div>
                        </div>
                    </div>

                    <!-- Communication Style Accordion -->
                    <div class="et-uc-accordion-section" id="et-uc-section-style">
                        <div class="et-uc-accordion-header">
                            <span><i class="fa-solid fa-comment-dots"></i> Communication Style<span class="et-uc-active-dot${styleActive}" id="et-uc-style-dot"></span></span>
                            <i class="fa-solid fa-chevron-down et-uc-chevron"></i>
                        </div>
                        <div class="et-uc-summary-box" id="et-uc-summary-commStyle">${buildSummaryHtml('commStyle', state.commStyle)}</div>
                        <div class="et-uc-accordion-content">
                            ${buildCommStyleButtons(state)}
                        </div>
                    </div>

                </div>
            </div>`;
        }

        // ============================================================
        // POPUP LIFECYCLE
        // ============================================================

        function bindPopupEvents() {
            const popup = jQuery('#et-uc-popup');
            if (!popup.length) return;

            // Accordion toggle
            popup.on('click.uc-accordion', '.et-uc-accordion-header', function () {
                const section = jQuery(this).closest('.et-uc-accordion-section');
                const isOpen = section.hasClass('et-uc-open');

                // Close all
                popup.find('.et-uc-accordion-section').each(function () {
                    const s = jQuery(this);
                    if (s.hasClass('et-uc-open')) {
                        s.addClass('et-uc-closing').removeClass('et-uc-open');
                        setTimeout(() => s.removeClass('et-uc-closing'), 320);
                    }
                });

                if (!isOpen) {
                    section.addClass('et-uc-open');
                }
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

                // Update active dot
                const dotMap = { mood: '#et-uc-mood-dot', personality: '#et-uc-personality-dot', commStyle: '#et-uc-style-dot' };
                if (dotMap[group]) {
                    popup.find(dotMap[group]).toggleClass('et-uc-has-selection', !!newVal);
                }

                // Update dynamic summary box
                const summaryBox = popup.find(`#et-uc-summary-${group === 'commStyle' ? 'commStyle' : group}`);
                if (newVal) {
                    summaryBox.html(buildSummaryHtml(group, newVal)).css('display', '');
                } else {
                    summaryBox.empty();
                }

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

            // If popup is open, update UI:
            const popup = jQuery('#et-uc-popup');
            if (popup.length) {
                popup.find('.et-uc-selected').removeClass('et-uc-selected');
                popup.find('.et-uc-has-selection').removeClass('et-uc-has-selection');
                popup.find('.et-uc-summary-box').empty().css('display', '');
                popup.find('#et-uc-mood-influence').val(50);
                popup.find('#et-uc-mood-influence_val').text('50%');
                popup.find('#et-uc-personality-influence').val(50);
                popup.find('#et-uc-personality-influence_val').text('50%');
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

            // Position based on available space
            const btnEl = targetEl || document.getElementById('et-char-name');
            const panelEl = document.getElementById('et-panel');
            if (btnEl && panelEl) {
                const btnRect = btnEl.getBoundingClientRect();
                const panelRect = panelEl.getBoundingClientRect();

                // Calculate position to prevent overflow at the bottom
                const popupHeight = popup.outerHeight() || 400;
                const spaceBelow = panelRect.bottom - btnRect.bottom;
                const spaceAbove = btnRect.top - panelRect.top;

                let top;
                if (spaceBelow < popupHeight && spaceAbove > spaceBelow) {
                    // Open above the trigger element
                    top = btnRect.top - panelRect.top - popupHeight - 6;
                } else {
                    // Open below the trigger element
                    top = btnRect.bottom - panelRect.top + 6;
                }

                const left = btnRect.left - panelRect.left;
                popup.css({ top: `${top}px`, left: `${Math.max(8, left)}px` });
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
