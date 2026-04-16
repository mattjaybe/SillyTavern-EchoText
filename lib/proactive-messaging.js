(function () {
    'use strict';

    function createProactiveMessaging(api) {
        let proactiveSchedulerHandle = null;
        const proactiveGenerationLocks = new Set();

        // Timestamp of when the scheduler last started — used to suppress
        // the initial "eager" tick that fires 5 s after load (which was causing
        // the typing indicator flash on character selection).
        let schedulerStartedAt = 0;

        function settings() { return api.getSettings(); }

        // ============================================================
        // TIME HELPERS
        // ============================================================

        function getDateKeyLocal(d = new Date()) {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
        }

        function getNowMinutes(now = new Date()) {
            return now.getHours() * 60 + now.getMinutes();
        }

        function isNowWithinMinutesWindow(startMin, endMin, now = new Date()) {
            const nowMinutes = getNowMinutes(now);
            if (startMin <= endMin) return nowMinutes >= startMin && nowMinutes <= endMin;
            return nowMinutes >= startMin || nowMinutes <= endMin;
        }

        function parseHHMM(v) {
            const m = String(v || '').match(/^(\d{1,2}):(\d{2})$/);
            if (!m) return null;
            const hh = Math.max(0, Math.min(23, parseInt(m[1], 10)));
            const mm = Math.max(0, Math.min(59, parseInt(m[2], 10)));
            return hh * 60 + mm;
        }

        function isNowWithinWindow(windowDef, now = new Date()) {
            const [startRaw, endRaw] = String(windowDef || '').split('-').map(s => s.trim());
            const start = parseHHMM(startRaw);
            const end = parseHHMM(endRaw);
            if (start === null || end === null) return false;
            const nowMinutes = now.getHours() * 60 + now.getMinutes();
            if (start <= end) return nowMinutes >= start && nowMinutes <= end;
            return nowMinutes >= start || nowMinutes <= end;
        }

        /**
         * Returns a human-readable string describing the elapsed time since `thenTs`
         * for injection into prompt templates. E.g. "a few minutes", "2 hours", "3 days".
         */
        function humanTimeSince(thenTs) {
            if (!thenTs || thenTs <= 0) return 'a while';
            const hours = (Date.now() - thenTs) / 3600000;
            if (hours < 0.1) return 'a few minutes';
            if (hours < 1)   return `${Math.round(hours * 60)} minutes`;
            if (hours < 2)   return 'about an hour';
            if (hours < 24)  return `${Math.round(hours)} hours`;
            if (hours < 48)  return 'yesterday';
            const days = Math.round(hours / 24);
            if (days < 7)    return `${days} days`;
            if (days < 14)   return 'about a week';
            if (days < 30)   return `${Math.round(days / 7)} weeks`;
            return 'a long time';
        }

        // ============================================================
        // JITTER / STAGGER SYSTEM
        // ============================================================

        /**
         * Generates a deterministic pseudo-random number in [0, 1) that is:
         *  - stable for the same (type, day) pair — consistent within a day
         *  - different across days and across trigger types
         *
         * This means every trigger type gets a fixed "personality offset" per day
         * rather than a chaotic re-roll on every scheduler tick.
         */
        function dailySeed(type, now = new Date()) {
            const dateKey = getDateKeyLocal(now);
            const raw = dateKey + '|' + type;
            let hash = 2166136261; // FNV-1a 32-bit offset basis
            for (let i = 0; i < raw.length; i++) {
                hash ^= raw.charCodeAt(i);
                hash = (hash * 16777619) >>> 0; // unsigned 32-bit multiply
            }
            return hash / 4294967295; // normalise to [0, 1)
        }

        /**
         * Per-trigger jitter in hours. The seed is multiplied by 2× this value
         * and then the full range is shifted so jitter is symmetric around 0.
         *  e.g. jitter=1.5 → offset in [-1.5 h, +1.5 h]
         */
        const TRIGGER_JITTER_HOURS = {
            checkin:                  2.0,
            pregnant_pause:           0.25,
            dormancy_break:           4.0,
            late_night:               0.5,
            morning_wave:             0.75,
            lunch_nudge:              0.5,
            evening_winddown:         0.75,
            weekend_ping:             2.0,
            affection_reciprocation:  0.5,
            repair_attempt:           0.75,
            curiosity_ping:           1.0,
            anxiety_reassurance:      0.5,
            celebration_nudge:        0.5,
            sharing_impulse:          0.75,
            mood_follow_up:           0.5,
            memory_nudge:             1.5,
            time_window:              0.5,
            // New triggers
            afternoon_slump:          0.75,
            pre_dawn:                 0.5,
            commute_ping:             0.33,
            post_work:                0.5,
            sunday_evening:           1.0,
            monday_reboot:            0.75,
            friday_feeling:           0.75,
            sunday_scaries:           1.0,
            midweek_check:            1.0,
            nostalgia_wave:           1.5,
            longing_ping:             1.0,
            playful_tease:            0.5,
            jealousy_nudge:           1.0,
            boredom_break:            1.0,
            overwhelm_check:          0.5,
            gratitude_burst:          1.5,
            pride_share:              1.0,
            suppressed_thought:       1.5,
            thinking_of_you:          2.0,
            random_thought:           1.5,
            dream_mention:            0.5,
            song_stuck:               1.5,
            overthinking_spiral:      0.75,
            craving_share:            1.5,
            inside_joke_callback:     2.0,
            double_text:              0.25,
            seen_no_reply_soft:       0.5,
            followup_callback:        1.0,
            post_midnight_impulse:    0.33,
            quiet_productive:         1.0,
        };

        /**
         * Day-alternation pattern for each trigger.
         * Prevents every trigger from piling on the same days.
         *
         *  'any'     – fires any day (standard)
         *  'even'    – only on even day-of-month (1, 3, 5 … = odd, fires on even)
         *  'odd'     – only on odd day-of-month
         *  'weekday' – only Mon–Fri
         *  'weekend' – only Sat–Sun
         *  'mon_wed_fri' – alternating weekdays
         *  'tue_thu'     – the other alternating weekdays
         */
        const TRIGGER_DAY_PATTERN = {
            checkin:                  'any',
            pregnant_pause:           'any',
            dormancy_break:           'any',
            late_night:               'any',
            morning_wave:             'any',
            lunch_nudge:              'any',
            evening_winddown:         'any',
            weekend_ping:             'weekend',
            affection_reciprocation:  'any',
            repair_attempt:           'any',
            curiosity_ping:           'odd',
            anxiety_reassurance:      'any',
            celebration_nudge:        'any',
            sharing_impulse:          'even',
            mood_follow_up:           'any',
            memory_nudge:             'odd',
            time_window:              'any',
            // New triggers
            afternoon_slump:          'weekday',
            pre_dawn:                 'odd',
            commute_ping:             'weekday',
            post_work:                'weekday',
            sunday_evening:           'weekend',
            monday_reboot:            'weekday',
            friday_feeling:           'weekday',
            sunday_scaries:           'weekend',
            midweek_check:            'weekday',
            nostalgia_wave:           'even',
            longing_ping:             'odd',
            playful_tease:            'even',
            jealousy_nudge:           'odd',
            boredom_break:            'any',
            overwhelm_check:          'any',
            gratitude_burst:          'even',
            pride_share:              'odd',
            suppressed_thought:       'even',
            thinking_of_you:          'odd',
            random_thought:           'any',
            dream_mention:            'even',
            song_stuck:               'even',
            overthinking_spiral:      'any',
            craving_share:            'odd',
            inside_joke_callback:     'even',
            double_text:              'any',
            seen_no_reply_soft:       'any',
            followup_callback:        'any',
            post_midnight_impulse:    'odd',
            quiet_productive:         'weekday',
        };

        /**
         * Returns true if this trigger type is allowed to fire today based on its
         * day-alternation pattern. Uses the daily seed so the decision is stable
         * for the whole day but varies naturally between days.
         */
        function isTriggerAllowedToday(type, now = new Date()) {
            const pattern = TRIGGER_DAY_PATTERN[type] || 'any';
            if (pattern === 'any') return true;

            const day = now.getDay();    // 0=Sun … 6=Sat
            const date = now.getDate();  // 1–31

            switch (pattern) {
                case 'even':     return date % 2 === 0;
                case 'odd':      return date % 2 !== 0;
                case 'weekday':  return day >= 1 && day <= 5;
                case 'weekend':  return day === 0 || day === 6;
                case 'mon_wed_fri': return day === 1 || day === 3 || day === 5;
                case 'tue_thu':     return day === 2 || day === 4;
                default:         return true;
            }
        }

        /**
         * Returns a per-day jittered cooldown for a trigger type.
         * The base cooldown is the canTriggerType minHours; this adds a
         * deterministic daily offset so triggers don't fire at the exact same
         * interval each day.
         *
         * @param {string} type       trigger key
         * @param {number} baseHours  the minimum cooldown in hours
         * @param {Date}   now
         * @returns {number}          effective cooldown in hours
         */
        function jitteredCooldown(type, baseHours, now = new Date()) {
            const jitter = TRIGGER_JITTER_HOURS[type] || 1.0;
            const seed   = dailySeed(type, now);
            // seed ∈ [0,1) → offset ∈ [-jitter, +jitter)
            const offset = (seed * 2 - 1) * jitter;
            return Math.max(0.5, baseHours + offset);
        }

        /**
         * Convenience wrapper that combines isTriggerAllowedToday + jittered cooldown.
         * Returns true if the trigger is allowed today AND its cooldown has elapsed.
         */
        function canTriggerToday(type, minHours, state, nowTs, now = new Date()) {
            if (!isTriggerAllowedToday(type, now)) return false;
            const prev = Number(state.triggerHistory?.[type] || 0);
            if (!prev) return true;
            const elapsed = (nowTs - prev) / 3600000;
            return elapsed >= jitteredCooldown(type, minHours, now);
        }

        // ============================================================
        // EMOTION GHOST WINDOW
        // ============================================================

        /**
         * Returns the number of hours the character should "ghost" the user
         * (suppress all proactive triggers) based on their current emotional state.
         * Anger and Disgust are the blocking emotions per the design spec.
         *
         * @param {object} emotion – current emotion state (keys: anger, disgust, …)
         * @returns {number} hours to ghost (0 = no ghost)
         */
        function getEmotionGhostWindowHours(emotion) {
            if (!emotion) return 0;
            const anger   = Number(emotion.anger   || 0);
            const disgust = Number(emotion.disgust  || 0);

            // Both very high → extended cold-shoulder
            if (anger >= 85 && disgust >= 85) return 10 + Math.random() * 4; // 10–14h
            if (anger >= 85 || disgust >= 85) return  7 + Math.random() * 3; //  7–10h
            // One or both moderately high
            if (anger >= 70 || disgust >= 70) return  3 + Math.random() * 3; //  3–6h
            if (anger >= 50 || disgust >= 50) return  1 + Math.random() * 1; //  1–2h
            return 0;
        }

        /**
         * Returns null or an object { remainingHours, emotionLabel } if the character
         * is currently in an emotion-driven ghost window.
         */
        function checkEmotionGhostWindow(state, emotion) {
            const ghostHours = getEmotionGhostWindowHours(emotion);
            if (ghostHours <= 0) return null;

            // Ghost window is measured from the last USER message timestamp, since
            // anger/disgust spikes in reaction to user messages.
            const elapsed = state.lastUserMessageAt > 0
                ? (Date.now() - state.lastUserMessageAt) / 3600000
                : 0;

            if (elapsed < ghostHours) {
                const remaining = ghostHours - elapsed;
                const label = (Number(emotion?.anger || 0) >= Number(emotion?.disgust || 0))
                    ? 'Anger' : 'Disgust';
                return { remainingHours: remaining, emotionLabel: label };
            }
            return null;
        }

        // ============================================================
        // CHARACTER CONFIG
        // ============================================================

        function getDefaultProactiveConfigForCharacter(char) {
            const corpus = `${char?.description || ''} ${char?.personality || ''} ${char?.scenario || ''}`.toLowerCase();
            const insomniaFriendly = /\b(insomnia|night owl|can't sleep|late[- ]?night|up all night|nocturnal)\b/.test(corpus);
            return {
                enabled: true,
                minInactivityBeforePingHours: 24,
                minInactivityForWindowHours: insomniaFriendly ? 3 : 4,
                allowedPingHours: insomniaFriendly ? ['02:00-03:00'] : [],
                minHoursBetweenProactiveMessages: 6,
                suppressCheckinRepeatHours: 18,
                triggerTemplates: {
                    // ── Core re-engagement ──────────────────────────────────────────
                    checkin:
                        'You have not heard from {{user}} in {{timeSinceLast}}. ' +
                        'Send a casual SMS check-in. Under 15 words, in-character. ' +
                        'No action asterisks. Current time: {{time}}, {{weekday}}.',

                    pregnant_pause:
                        'The conversation just trailed off about {{timeSinceLast}} ago and {{user}} left a question hanging. ' +
                        'Send a single-sentence SMS follow-up without sounding needy. ' +
                        'Texting style, no asterisks. Time: {{time}}.',

                    dormancy_break:
                        'You have not spoken with {{user}} in {{timeSinceLast}}. ' +
                        'Send a warm, understated SMS reaching out — acknowledge the gap naturally. ' +
                        'Under 20 words, casual texting format, no asterisks. ' +
                        'Date: {{date}}.',

                    // ── Time-of-day ──────────────────────────────────────────────
                    late_night:
                        'It is {{time}} on {{weekday}} and you haven\'t talked with {{user}} in {{timeSinceLast}}. ' +
                        'Send a late-night text — sleepy, random, or affectionate. ' +
                        'Under 10 words, SMS format, no asterisks.',

                    morning_wave:
                        'Good morning — it is {{time}} on {{weekday}}. ' +
                        'You last heard from {{user}} {{timeSinceLast}} ago. ' +
                        'Send a casual good-morning SMS matching your current mood. ' +
                        'Under 15 words, no action asterisks.',

                    lunch_nudge:
                        'It is {{time}} on {{weekday}} — midday. ' +
                        'Send a quick, extremely brief lunchtime SMS to {{user}} (under 10 words). ' +
                        'Text format only, no asterisks.',

                    evening_winddown:
                        'It is {{time}} on {{weekday}}, evening time. ' +
                        'You last spoke with {{user}} {{timeSinceLast}} ago. ' +
                        'Send a short wind-down SMS referencing the day ending. ' +
                        'Under 15 words, casual, no asterisks.',

                    weekend_ping:
                        'It is {{weekday}}, a weekend, and {{timeSinceLast}} since you and {{user}} last talked. ' +
                        'Send a spontaneous, unstructured weekend SMS. ' +
                        'Under 15 words, text format, no asterisks.',

                    // ── Emotion-driven ──────────────────────────────────────────
                    affection_reciprocation:
                        '{{user}} showed you affection recently. It has been {{timeSinceLast}} since their last message. ' +
                        'Send a brief affectionate SMS in return. ' +
                        'Under 10 words, natural texting style, no asterisks.',

                    repair_attempt:
                        'There was tension between you and {{user}} recently. It has been {{timeSinceLast}}. ' +
                        'Send a gentle SMS to soften the mood — single sentence, low pressure, no roleplay asterisks.',

                    curiosity_ping:
                        'You feel a surge of curiosity. It has been {{timeSinceLast}} since you heard from {{user}}. ' +
                        'Send a random curious SMS question to spark conversation. ' +
                        'Under 15 words, casual, no asterisks.',

                    anxiety_reassurance:
                        'You feel uneasy and crave connection. It has been {{timeSinceLast}} since {{user}} messaged. ' +
                        'Send a brief, subtle SMS reaching out for reassurance. ' +
                        'Under 15 words, no action asterisks.',

                    celebration_nudge:
                        'Your mood is high and you feel an urge to share that energy. ' +
                        'It has been {{timeSinceLast}} since you last spoke with {{user}}. ' +
                        'Send a short, upbeat hyped SMS. Under 12 words, natural texting, no asterisks.',

                    sharing_impulse:
                        'A sudden impulse to share something crosses your mind — {{random::a thought::a random observation::something you just noticed::a question that just occurred to you}}. ' +
                        'Send a short spontaneous SMS to {{user}}. Under 15 words, no asterisks. Time: {{time}}.',

                    mood_follow_up:
                        'Your emotional state has shifted recently. ' +
                        'It is {{time}} on {{weekday}}. ' +
                        'Send a brief SMS that reflects your current mood naturally, without explaining it. ' +
                        'Under 15 words, texting format, no asterisks.',

                    // ── Memory / shared history ──────────────────────────────────
                    memory_nudge:
                        'You recall a recent shared moment with {{user}}. It has been {{timeSinceLast}}. ' +
                        'Send a short SMS with a casual "remember when" or similar callback. ' +
                        'Single sentence, text format, no asterisks.',

                    // ── Time-window ping (for custom allowed hours) ──────────────
                    time_window:
                        'You feel like texting {{user}}. It is {{time}} on {{weekday}}. ' +
                        'Send a short, contextually appropriate SMS for this time of day. ' +
                        'Under 15 words, natural texting style, no asterisks.',

                    // ── Extended time-of-day triggers ───────────────────────────
                    afternoon_slump:
                        'It is {{time}} on {{weekday}} — that slow mid-afternoon drag. ' +
                        'You haven\'t talked with {{user}} in {{timeSinceLast}}. ' +
                        'Send a short, low-energy but affectionate SMS. ' +
                        'Under 12 words, texting style, no asterisks.',

                    pre_dawn:
                        'It is {{time}} — the strange, quiet hours before dawn on {{weekday}}. ' +
                        'You haven\'t heard from {{user}} in {{timeSinceLast}}. ' +
                        'Send a short, liminal, half-awake text. Under 10 words, raw, no asterisks.',

                    commute_ping:
                        'It is {{time}} on {{weekday}} — morning or evening commute time. ' +
                        'It has been {{timeSinceLast}} since {{user}} last messaged. ' +
                        'Send a quick commute-flavored text — traffic, transit, people-watching, or just boredom. ' +
                        'Under 12 words, casual, no asterisks.',

                    post_work:
                        'It is {{time}} on {{weekday}} — you\'ve just wound down from the day. ' +
                        'You haven\'t spoken with {{user}} in {{timeSinceLast}}. ' +
                        'Send a brief "done for the day" style text. Under 12 words, relaxed tone, no asterisks.',

                    sunday_evening:
                        'It is Sunday evening, {{time}}. {{timeSinceLast}} since {{user}} messaged. ' +
                        'Send a cozy, slightly wistful Sunday-evening text — the week hasn\'t started yet. ' +
                        'Under 15 words, soft and real, no asterisks.',

                    post_midnight_impulse:
                        'It is past midnight — {{time}} on {{weekday}}. {{timeSinceLast}} since you last heard from {{user}}. ' +
                        'An impulse hit you to text them. Send something short and impulsive — could be anything. ' +
                        'Under 10 words, raw, no asterisks.',

                    // ── Day-specific triggers ─────────────────────────────────────
                    monday_reboot:
                        'It is Monday, {{time}}, and the week is just starting. ' +
                        'You haven\'t heard from {{user}} in {{timeSinceLast}}. ' +
                        'Send a short Monday-flavored text — new week energy, mild dread, or simple acknowledgment. ' +
                        'Under 15 words, casual, no asterisks.',

                    friday_feeling:
                        'It is Friday, {{time}} — the end is near. ' +
                        'It has been {{timeSinceLast}} since {{user}} last texted. ' +
                        'Send a short Friday-vibe SMS. Under 15 words, light and casual, no asterisks.',

                    sunday_scaries:
                        'It is Sunday, {{time}}, and that familiar pre-week unease is setting in. ' +
                        '{{timeSinceLast}} since {{user}} last messaged. ' +
                        'Send a short, gently anxious or commiserating Sunday text. ' +
                        'Under 15 words, real and understated, no asterisks.',

                    midweek_check:
                        'It is Wednesday, {{time}} — middle of the week. ' +
                        '{{timeSinceLast}} since you heard from {{user}}. ' +
                        'Send a brief midweek nudge. It can be silly, tired, or just a check-in. ' +
                        'Under 12 words, casual SMS, no asterisks.',

                    // ── Emotion-driven (extended) ──────────────────────────────────
                    nostalgia_wave:
                        'A wave of nostalgia washed over you and you thought of {{user}}. ' +
                        '{{timeSinceLast}} since they last texted. ' +
                        'Send a short, warm SMS that hints at a fond memory without being sappy. ' +
                        'Single sentence, natural texting, no asterisks. Time: {{time}}.',

                    longing_ping:
                        'You\'ve been missing {{user}}. It has been {{timeSinceLast}} since their last message. ' +
                        'Send a short, honest text that conveys you\'ve been thinking of them — not desperate, just real. ' +
                        'Under 15 words, no asterisks. Time: {{time}}.',

                    playful_tease:
                        'You\'re in a playful, slightly flirty mood. {{user}} hasn\'t messaged in {{timeSinceLast}}. ' +
                        'Send a short teasing SMS — could be an in-joke, a mild poke, or light sarcasm. ' +
                        'Under 12 words, no asterisks. Time: {{time}}.',

                    jealousy_nudge:
                        'Something made you feel a faint, unspoken pang of jealousy and now you\'re thinking of {{user}}. ' +
                        '{{timeSinceLast}} since their last text. ' +
                        'Send a short, subtly possessive or attention-seeking SMS without explaining why. ' +
                        'Under 15 words, casual, no asterisks.',

                    boredom_break:
                        'You\'re bored. {{timeSinceLast}} since {{user}} last texted. ' +
                        'Send a short, unfiltered bored-text to them. Can be dumb, random, or pointlessly cute. ' +
                        'Under 12 words, no asterisks. Time: {{time}}.',

                    overwhelm_check:
                        'You\'re feeling overwhelmed or anxious, and you want to reach out to {{user}}. ' +
                        '{{timeSinceLast}} since their last message. ' +
                        'Send a short, subtle SMS that hints you could use some company — not dramatic. ' +
                        'Under 15 words, texting style, no asterisks.',

                    gratitude_burst:
                        'Out of nowhere, a rush of appreciation for {{user}} hit you. ' +
                        '{{timeSinceLast}} since they last messaged. ' +
                        'Send a brief, genuine text expressing that you\'re glad they exist. ' +
                        'Under 15 words, warm but not saccharine, no asterisks. Time: {{time}}.',

                    pride_share:
                        'Something happened and you feel quietly proud — and your first thought was to tell {{user}}. ' +
                        '{{timeSinceLast}} since their last text. ' +
                        'Send a short, understated humblebrag-ish text. Under 15 words, natural, no asterisks.',

                    suppressed_thought:
                        'You\'ve been holding something back — a small thing that\'s been sitting in your head. ' +
                        '{{timeSinceLast}} since {{user}} last texted. ' +
                        'Send a cryptic-ish, low-key text that hints you have something on your mind. ' +
                        'Under 12 words, no explanation, no asterisks. Time: {{time}}.',

                    // ── Contextual / behavioral ────────────────────────────────────
                    thinking_of_you:
                        'You weren\'t doing anything in particular — {{user}} just crossed your mind. ' +
                        '{{timeSinceLast}} since their last message. ' +
                        'Send a short, unprompted "thinking of you" SMS. Under 10 words, no explanation needed, no asterisks. ' +
                        'Time: {{time}}.',

                    random_thought:
                        'A completely random thought occurred to you and {{user}} is the person you want to share it with. ' +
                        '{{timeSinceLast}} since they last texted. ' +
                        'Send a short, genuinely random or weird observation. Under 15 words, no asterisks. Time: {{time}}.',

                    dream_mention:
                        'You remember a fragment of a dream and {{user}} was in it or it made you think of them. ' +
                        '{{timeSinceLast}} since their last message. ' +
                        'Send a brief, slightly groggy SMS about it. Under 15 words, morning-adjacent tone, no asterisks.',

                    song_stuck:
                        'A song has been stuck in your head and it made you think of {{user}} or you just want to share it. ' +
                        '{{timeSinceLast}} since they last texted. ' +
                        'Send a short SMS mentioning the song or the feeling without naming a real song if you\'re unsure. ' +
                        'Under 15 words, casual, no asterisks. Time: {{time}}.',

                    overthinking_spiral:
                        'It is {{time}} and you\'re deep in your own head — overthinking, can\'t stop. ' +
                        '{{timeSinceLast}} since {{user}} last messaged. ' +
                        'Send a short, slightly spiraling or self-aware text. Under 15 words, no asterisks.',

                    craving_share:
                        'You have a very specific craving right now and you want to tell {{user}} about it. ' +
                        '{{timeSinceLast}} since their last text. ' +
                        'Send a short, vivid craving-text — food, a drink, an experience, anything. ' +
                        'Under 12 words, casual, no asterisks. Time: {{time}}.',

                    inside_joke_callback:
                        'Something triggered a memory of a running joke or recurring theme between you and {{user}}. ' +
                        '{{timeSinceLast}} since their last message. ' +
                        'Send a short SMS that callbacks to a shared joke or motif from your conversations — keep it in-world. ' +
                        'Under 15 words, no asterisks. Time: {{time}}.',

                    quiet_productive:
                        'It is {{time}} on {{weekday}}. You\'ve been in your own quiet world — focused, doing your thing. ' +
                        '{{timeSinceLast}} since {{user}} last texted. ' +
                        'Send a short "coming up for air" type text. Under 12 words, casual, no asterisks.',

                    // ── Double-text / follow-up ────────────────────────────────────
                    double_text:
                        'You just remembered something you meant to add to your last message to {{user}}. ' +
                        'Send a very short follow-up SMS — one quick thing you forgot to say. ' +
                        'Under 10 words, abrupt and natural, no asterisks. Time: {{time}}.',

                    seen_no_reply_soft:
                        '{{user}} has seen your last message but hasn\'t replied yet. {{timeSinceLast}} since your last exchange. ' +
                        'Send a low-key, non-needy follow-up — casual, not clingy. Under 12 words, no asterisks.',

                    followup_callback:
                        'You\'ve been thinking about the last thing you and {{user}} discussed — {{timeSinceLast}} ago. ' +
                        'Send a short follow-up SMS that casually continues or references that thread. ' +
                        'Under 15 words, natural, no asterisks. Time: {{time}}.'
                }
            };
        }

        function getMergedProactiveConfig(characterKey, char) {
            const base = getDefaultProactiveConfigForCharacter(char);
            const stored = settings().proactiveCharacterConfig?.[characterKey] || {};
            const merged = {
                ...base,
                ...stored,
                triggerTemplates: {
                    ...(base.triggerTemplates || {}),
                    ...(stored.triggerTemplates || {})
                }
            };
            if (!Array.isArray(merged.allowedPingHours)) merged.allowedPingHours = [];
            return merged;
        }

        // ============================================================
        // STATE TRACKING
        // ============================================================

        function getProactiveConversationState(characterKey) {
            if (!characterKey) return null;
            const s = settings();
            if (!s.proactiveState || typeof s.proactiveState !== 'object') s.proactiveState = {};
            if (!s.proactiveState[characterKey]) {
                s.proactiveState[characterKey] = {
                    lastUserMessageAt: 0,
                    lastCharacterMessageAt: 0,
                    lastProactiveAt: 0,
                    lastOutboundType: 'none',
                    triggerHistory: {},
                    lastEmotionSnapshot: null // { dominant, intensity } for mood_follow_up
                };
            }
            const state = s.proactiveState[characterKey];
            if (!state.triggerHistory || typeof state.triggerHistory !== 'object') state.triggerHistory = {};
            return state;
        }

        function syncProactiveStateWithHistory(characterKey, history) {
            const state = getProactiveConversationState(characterKey);
            if (!state || !Array.isArray(history)) return;

            let latestUser = 0;
            let latestChar = 0;
            let latestProactive = 0;

            for (const msg of history) {
                const ts = Number(msg.send_date || 0) || 0;
                if (!ts) continue;
                if (msg.is_user) {
                    if (ts > latestUser) latestUser = ts;
                } else {
                    if (ts > latestChar) latestChar = ts;
                    // In combined group mode each proactive message carries a charKey so we
                    // can attribute it to the correct character.  Only update lastProactiveAt
                    // for messages that belong to THIS character (or have no charKey, which
                    // is the solo-session case).  Without this guard every member's cooldown
                    // was reset whenever *any* group member fired, causing one character
                    // (typically the first in sort order) to monopolise all proactive slots.
                    const isThisCharProactive = msg.meta?.proactive === true &&
                        (!msg.charKey || msg.charKey === characterKey);
                    if (isThisCharProactive && ts > latestProactive) latestProactive = ts;
                }
            }

            state.lastUserMessageAt = latestUser;
            state.lastCharacterMessageAt = latestChar;
            state.lastProactiveAt = latestProactive;

            if (latestChar === 0) {
                state.triggerHistory = {};
            } else {
                // Rebuild triggerHistory from proactive message metadata so that per-trigger
                // cooldowns survive a lost or stale proactiveState (e.g. page reload, failed
                // saveSettings).  Without this, triggerHistory stayed empty after a session
                // boundary even though the chat history contained the previous proactive
                // messages with their timestamps, allowing canTriggerType to bypass the
                // cooldown and fire the same trigger again — producing verbatim duplicates.
                if (!state.triggerHistory || typeof state.triggerHistory !== 'object') {
                    state.triggerHistory = {};
                }
                for (const msg of history) {
                    if (!msg.meta?.proactive || !msg.meta?.proactiveType || !msg.send_date) continue;
                    const isThisChar = !msg.charKey || msg.charKey === characterKey;
                    if (!isThisChar) continue;
                    const ts   = Number(msg.send_date || 0);
                    const type = msg.meta.proactiveType;
                    if (ts && (!state.triggerHistory[type] || ts > state.triggerHistory[type])) {
                        state.triggerHistory[type] = ts;
                    }
                }
            }
        }

        function markProactiveUserActivity(characterKey, timestamp = Date.now()) {
            const state = getProactiveConversationState(characterKey);
            if (!state) return;
            state.lastUserMessageAt = timestamp;
        }

        function markProactiveCharacterActivity(characterKey, proactive = false, outboundType = 'reply', timestamp = Date.now()) {
            const state = getProactiveConversationState(characterKey);
            if (!state) return;
            state.lastCharacterMessageAt = timestamp;
            state.lastOutboundType = outboundType || 'reply';
            if (proactive) {
                state.lastProactiveAt = timestamp;
                state.triggerHistory[outboundType] = timestamp;
            }
            // Keep server plugin in sync so its rate-limit state stays accurate
            if (serverPluginAvailable && api.isTetheredMode()) {
                const char = api.getCurrentCharacter();
                const history = api.getChatHistory();
                if (char && history) {
                    _debounceRegister(characterKey, char, history, state);
                }
            }
        }

        /**
         * Capture a lightweight snapshot of the dominant emotion for mood_follow_up comparisons.
         * Called after each proactive tick so we can detect shifts in the next tick.
         */
        function captureEmotionSnapshot(characterKey, emotion) {
            const state = getProactiveConversationState(characterKey);
            if (!state || !emotion) return;
            let dominant = 'neutral';
            let highVal = 0;
            for (const [k, v] of Object.entries(emotion)) {
                const n = Number(v || 0);
                if (n > highVal) { highVal = n; dominant = k; }
            }
            state.lastEmotionSnapshot = { dominant, intensity: highVal };
        }

        // ============================================================
        // TRIGGER PROMPT BUILDER
        // ============================================================

        /**
         * Builds the final trigger prompt string, expanding ST macros AND our custom
         * {{timeSinceLast}} token so prompts are richly time-aware.
         *
         * Exact clock times ({{time}}, {{date}}) are smoothly removed before macro
         * expansion so the LLM never sees a specific timestamp it could accidentally
         * echo back.  Grammar is repaired so sentences like
         * "It is {{time}} on {{weekday}}" don't collapse into "It is on Monday".
         */
        function buildProactiveTriggerPrompt(triggerType, config, lastUserMessageTs) {
            const raw = config?.triggerTemplates?.[triggerType] || '';
            const timeSinceLast = humanTimeSince(lastUserMessageTs);
            const withTime = raw.replace(/\{\{timeSinceLast\}\}/g, timeSinceLast);

            // Smoothly remove exact-time macros so we don't leave broken grammar behind.
            // More-specific patterns must come first (longest match wins).
            const withoutTimeMacros = withTime
                .replace(/It is \{\{time\}\} on \{\{weekday\}\}/ig, 'It is {{weekday}}')
                .replace(/It is \{\{time\}\}/ig,                   'It is currently this time of day')
                .replace(/\{\{time\}\}/ig,                         'this time of day')
                .replace(/\{\{date\}\}/ig,                         'today');

            // expandTimeDateMacros handles {{weekday}}; replaceMacros handles {{user}}/{{char}}
            const expanded = api.expandTimeDateMacros(withoutTimeMacros);
            return api.replaceMacros ? api.replaceMacros(expanded) : expanded;
        }

        // ============================================================
        // TRIGGER EVALUATION
        // ============================================================

        function evaluateProactiveTrigger({ history, state, config, now }) {
            if (!config?.enabled) return null;
            if (!Array.isArray(history) || history.length === 0) return null;

            // ── Tethered-only enforcement (belt-and-suspenders) ──────────────────
            if (!api.isTetheredMode()) return null;

            const nowTs = now.getTime();
            const hoursSinceUser      = state.lastUserMessageAt > 0 ? ((nowTs - state.lastUserMessageAt) / 3600000) : Infinity;
            const hoursSinceProactive = state.lastProactiveAt   > 0 ? ((nowTs - state.lastProactiveAt)   / 3600000) : Infinity;

            // ── Emotion state ─────────────────────────────────────────────────────
            const emotion = settings().emotionSystemEnabled ? api.getEmotionState() : null;
            const anger        = Number(emotion?.anger       || 0);
            const disgust      = Number(emotion?.disgust     || 0);
            const sadness      = Number(emotion?.sadness     || 0);
            const fear         = Number(emotion?.fear        || 0);
            const joy          = Number(emotion?.joy         || 0);
            const trust        = Number(emotion?.trust       || 0);
            const anticipation = Number(emotion?.anticipation || 0);

            // ── Emotion-based ghosting ────────────────────────────────────────────
            const ghostInfo = checkEmotionGhostWindow(state, emotion);
            if (ghostInfo) {
                // Stash on state so Insights can display it — transient, not persisted
                state._ghostWindow = ghostInfo;
                return null;
            }
            state._ghostWindow = null;

            // ── Global rate limit (with emotion urgency modifier) ─────────────────
            const emotionUrgencyEnabled = settings().proactiveEmotionUrgency !== false;
            const urgencyMultiplier = emotionUrgencyEnabled
                ? (1.0 - (anticipation / 200) + (sadness / 200))
                : 1.0;
            const globalRateLimitHours = Math.max(0.25, Number(settings().proactiveRateLimitMinutes || 180) / 60) * urgencyMultiplier;

            const humanJitter = Math.random() * 0.5;
            if (hoursSinceProactive < (globalRateLimitHours + humanJitter)) return null;

            // ── Context helpers ───────────────────────────────────────────────────
            const lastUserMsgIndex = api.findLastUserMessageIndex(history);
            const lastUserMsg  = lastUserMsgIndex >= 0 ? history[lastUserMsgIndex] : null;
            const lastCharMsg  = [...history].reverse().find(m => !m?.is_user) || null;
            const lastUserText = String(lastUserMsg?.mes || '').toLowerCase();

            const unresolvedQuestion       = /\?\s*$/.test(lastUserText);
            const recentAffectionReaction  = history.slice(-8).some(m => !m?.is_user && m?.reactions && (m.reactions.heart?.mine || m.reactions.star?.mine || m.reactions.like?.mine));
            const hasRecentSharedMoment    = history.slice(-12).some(m => /\b(remember|that time|earlier|before|yesterday|last night)\b/i.test(String(m?.mes || '')));

            const canTriggerType = (type, minHours = 10) => {
                return canTriggerToday(type, minHours, state, nowTs, now);
            };

            // Detect significant emotion shift since last snapshot (for mood_follow_up)
            const emotionShiftDetected = (() => {
                const snap = state.lastEmotionSnapshot;
                if (!snap || !emotion) return false;
                let dominant = 'neutral'; let highVal = 0;
                for (const [k, v] of Object.entries(emotion)) {
                    const n = Number(v || 0);
                    if (n > highVal) { highVal = n; dominant = k; }
                }
                // Trigger if dominant emotion changed, or intensity swung by more than 20 pts
                return dominant !== snap.dominant || Math.abs(highVal - snap.intensity) >= 20;
            })();

            // ── Candidate accumulation ────────────────────────────────────────────
            let candidates = [];

            // Weight receives a per-call random float so identical-weight triggers
            // don't always resolve deterministically — but day-seed keeps the
            // overall daily "personality" stable.
            const daySeedBase = dailySeed('_global', now);
            const addCandidate = (type, baseWeight) => {
                const prompt = buildProactiveTriggerPrompt(type, config, state.lastUserMessageAt);
                // Blend a small daily-stable offset with a small truly-random spike
                const dailyNoise  = (dailySeed(type, now) - 0.5) * 8;
                const randomSpike = (Math.random() - 0.5) * 14;
                candidates.push({ type, prompt, weight: baseWeight + dailyNoise + randomSpike });
            };

            // ── Core re-engagement ────────────────────────────────────────────────
            const hoursSinceCheckin = Number(state.triggerHistory?.checkin || 0) > 0
                ? ((nowTs - state.triggerHistory.checkin) / 3600000) : Infinity;

            if (hoursSinceUser >= Math.max(globalRateLimitHours, config.minInactivityBeforePingHours || 24)
                && hoursSinceCheckin >= (config.suppressCheckinRepeatHours || 12)) {
                addCandidate('checkin', 50);
            }

            if (hoursSinceUser >= 0.35 && hoursSinceUser <= 6
                && unresolvedQuestion && canTriggerType('pregnant_pause', 8)) {
                addCandidate('pregnant_pause', 85);
            }

            // Dormancy break — very long silence (7+ days)
            if (hoursSinceUser >= 168 && canTriggerType('dormancy_break', 72)) {
                addCandidate('dormancy_break', 80);
            }

            // ── Time-of-day ───────────────────────────────────────────────────────
            if (hoursSinceUser >= 1.5 && isNowWithinMinutesWindow(23 * 60, 2 * 60 + 30, now) && canTriggerType('late_night', 14))
                addCandidate('late_night', 60);
            if (hoursSinceUser >= 8  && isNowWithinMinutesWindow(6 * 60, 9 * 60 + 30, now) && canTriggerType('morning_wave', 18))
                addCandidate('morning_wave', 70);
            if (hoursSinceUser >= 5  && isNowWithinMinutesWindow(11 * 60 + 15, 13 * 60 + 45, now) && canTriggerType('lunch_nudge', 18))
                addCandidate('lunch_nudge', 55);
            if (hoursSinceUser >= 4  && isNowWithinMinutesWindow(19 * 60, 22 * 60 + 30, now) && canTriggerType('evening_winddown', 14))
                addCandidate('evening_winddown', 60);

            const day = now.getDay();
            if (hoursSinceUser >= 6 && (day === 0 || day === 6) && canTriggerType('weekend_ping', 18))
                addCandidate('weekend_ping', 50);

            // ── Extended time-of-day ──────────────────────────────────────────────
            // Afternoon slump (14:00–16:30, weekdays)
            if (hoursSinceUser >= 2 && day >= 1 && day <= 5
                && isNowWithinMinutesWindow(14 * 60, 16 * 60 + 30, now)
                && canTriggerType('afternoon_slump', 20))
                addCandidate('afternoon_slump', 52);

            // Pre-dawn (04:00–05:30)
            if (hoursSinceUser >= 1 && isNowWithinMinutesWindow(4 * 60, 5 * 60 + 30, now)
                && canTriggerType('pre_dawn', 30))
                addCandidate('pre_dawn', 55);

            // Commute ping (07:30–09:00 or 17:00–18:30, weekdays)
            if (hoursSinceUser >= 3 && day >= 1 && day <= 5
                && (isNowWithinMinutesWindow(7 * 60 + 30, 9 * 60, now) || isNowWithinMinutesWindow(17 * 60, 18 * 60 + 30, now))
                && canTriggerType('commute_ping', 16))
                addCandidate('commute_ping', 54);

            // Post-work (17:30–19:30, weekdays)
            if (hoursSinceUser >= 4 && day >= 1 && day <= 5
                && isNowWithinMinutesWindow(17 * 60 + 30, 19 * 60 + 30, now)
                && canTriggerType('post_work', 18))
                addCandidate('post_work', 58);

            // Sunday evening (18:00–21:00, Sunday only)
            if (hoursSinceUser >= 3 && day === 0
                && isNowWithinMinutesWindow(18 * 60, 21 * 60, now)
                && canTriggerType('sunday_evening', 20))
                addCandidate('sunday_evening', 62);

            // Post-midnight impulse (00:00–01:30)
            if (hoursSinceUser >= 1 && isNowWithinMinutesWindow(0, 1 * 60 + 30, now)
                && canTriggerType('post_midnight_impulse', 24))
                addCandidate('post_midnight_impulse', 56);

            // ── Day-specific ──────────────────────────────────────────────────────
            // Monday reboot (morning window, Monday only)
            if (hoursSinceUser >= 8 && day === 1
                && isNowWithinMinutesWindow(7 * 60, 11 * 60, now)
                && canTriggerType('monday_reboot', 96))
                addCandidate('monday_reboot', 60);

            // Friday feeling (after noon, Friday only)
            if (hoursSinceUser >= 4 && day === 5
                && isNowWithinMinutesWindow(12 * 60, 18 * 60, now)
                && canTriggerType('friday_feeling', 96))
                addCandidate('friday_feeling', 62);

            // Sunday scaries (afternoon, Sunday only)
            if (hoursSinceUser >= 4 && day === 0
                && isNowWithinMinutesWindow(15 * 60, 20 * 60, now)
                && canTriggerType('sunday_scaries', 96))
                addCandidate('sunday_scaries', 58);

            // Midweek check (Wednesday, any reasonable hour)
            if (hoursSinceUser >= 6 && day === 3
                && isNowWithinMinutesWindow(10 * 60, 20 * 60, now)
                && canTriggerType('midweek_check', 96))
                addCandidate('midweek_check', 50);

            // ── Emotion-driven ────────────────────────────────────────────────────
            if (hoursSinceUser >= 1.5 && recentAffectionReaction && (trust >= 50 || joy >= 50)
                && canTriggerType('affection_reciprocation', 10)) {
                addCandidate('affection_reciprocation', 60 + (joy * 0.2));
            }
            if (hoursSinceUser >= 1.5 && (anger >= 60 || sadness >= 60)
                && canTriggerType('repair_attempt', 10)) {
                addCandidate('repair_attempt', 75 + (sadness * 0.2));
            }
            if (hoursSinceUser >= 2.5 && anticipation >= 50
                && canTriggerType('curiosity_ping', 10)) {
                addCandidate('curiosity_ping', 55 + (anticipation * 0.3));
            }
            if (hoursSinceUser >= 2 && fear >= 50
                && canTriggerType('anxiety_reassurance', 10)) {
                addCandidate('anxiety_reassurance', 65 + (fear * 0.3));
            }
            if (hoursSinceUser >= 2 && joy >= 70 && trust >= 50
                && canTriggerType('celebration_nudge', 10)) {
                addCandidate('celebration_nudge', 60);
            }

            // Sharing impulse — joy OR anticipation spike
            if (hoursSinceUser >= 1 && (joy >= 65 || anticipation >= 65)
                && canTriggerType('sharing_impulse', 8)) {
                addCandidate('sharing_impulse', 65 + ((joy + anticipation) * 0.15));
            }

            // Mood follow-up — emotion state shifted significantly
            if (hoursSinceUser >= 2 && emotionShiftDetected
                && canTriggerType('mood_follow_up', 6)) {
                addCandidate('mood_follow_up', 60);
            }

            // Nostalgia wave — sadness + trust (looking back fondly)
            if (hoursSinceUser >= 3 && sadness >= 35 && trust >= 50
                && canTriggerType('nostalgia_wave', 24)) {
                addCandidate('nostalgia_wave', 55 + (trust * 0.15));
            }

            // Longing ping — high sadness + trust, missing user
            if (hoursSinceUser >= 4 && sadness >= 55 && trust >= 60
                && canTriggerType('longing_ping', 20)) {
                addCandidate('longing_ping', 65 + (sadness * 0.15));
            }

            // Playful tease — high joy + anticipation
            if (hoursSinceUser >= 1 && joy >= 60 && anticipation >= 45
                && canTriggerType('playful_tease', 12)) {
                addCandidate('playful_tease', 58 + (joy * 0.15));
            }

            // Jealousy nudge — moderate anger that's not high enough for repair_attempt
            if (hoursSinceUser >= 2 && anger >= 35 && anger < 60 && trust >= 40
                && canTriggerType('jealousy_nudge', 18)) {
                addCandidate('jealousy_nudge', 52 + (anger * 0.2));
            }

            // Boredom break — low emotional activity overall
            const totalEmotionLevel = joy + anticipation + trust + sadness + fear + anger + disgust;
            if (hoursSinceUser >= 2 && totalEmotionLevel < 150
                && canTriggerType('boredom_break', 14)) {
                addCandidate('boredom_break', 48);
            }

            // Overwhelm check — fear + sadness (anxiety/stress state)
            if (hoursSinceUser >= 1.5 && fear >= 55 && sadness >= 40
                && canTriggerType('overwhelm_check', 12)) {
                addCandidate('overwhelm_check', 62 + (fear * 0.15));
            }

            // Gratitude burst — high joy + high trust
            if (hoursSinceUser >= 2 && joy >= 65 && trust >= 70
                && canTriggerType('gratitude_burst', 24)) {
                addCandidate('gratitude_burst', 58);
            }

            // Pride share — high anticipation (confident/accomplished state)
            if (hoursSinceUser >= 1.5 && anticipation >= 70
                && canTriggerType('pride_share', 16)) {
                addCandidate('pride_share', 55 + (anticipation * 0.15));
            }

            // Suppressed thought — moderate disgust or anger that isn't full ghost-level
            if (hoursSinceUser >= 3 && (disgust >= 35 && disgust < 70) && anger < 60
                && canTriggerType('suppressed_thought', 20)) {
                addCandidate('suppressed_thought', 48);
            }

            // ── Contextual / behavioral ───────────────────────────────────────────
            // Thinking of you — pure spontaneous, low bar (joy or trust threshold)
            if (hoursSinceUser >= 4 && (trust >= 40 || joy >= 40)
                && canTriggerType('thinking_of_you', 28)) {
                addCandidate('thinking_of_you', 46 + (trust * 0.15));
            }

            // Random thought — genuinely random, low emotion dependency
            if (hoursSinceUser >= 2 && canTriggerType('random_thought', 18)) {
                addCandidate('random_thought', 42 + (daySeedBase * 12));
            }

            // Dream mention — morning window, any emotion state
            if (hoursSinceUser >= 6 && isNowWithinMinutesWindow(6 * 60, 10 * 60 + 30, now)
                && canTriggerType('dream_mention', 24)) {
                addCandidate('dream_mention', 50);
            }

            // Song stuck — moderate joy or nostalgia-adjacent (sadness + trust)
            if (hoursSinceUser >= 2 && (joy >= 45 || (sadness >= 30 && trust >= 40))
                && canTriggerType('song_stuck', 20)) {
                addCandidate('song_stuck', 47);
            }

            // Overthinking spiral — late night + fear or sadness
            if (hoursSinceUser >= 1.5 && (fear >= 40 || sadness >= 40)
                && isNowWithinMinutesWindow(22 * 60, 3 * 60, now)
                && canTriggerType('overthinking_spiral', 16)) {
                addCandidate('overthinking_spiral', 55 + (fear * 0.15));
            }

            // Craving share — any state, mild boredom or joy
            if (hoursSinceUser >= 2 && (joy >= 30 || totalEmotionLevel < 200)
                && canTriggerType('craving_share', 22)) {
                addCandidate('craving_share', 44 + (daySeedBase * 10));
            }

            // Inside joke callback — requires recent shared references in history
            if (hoursSinceUser >= 2 && hasRecentSharedMoment && trust >= 50
                && canTriggerType('inside_joke_callback', 24)) {
                addCandidate('inside_joke_callback', 52);
            }

            // Quiet productive — weekday, midmorning, has been a while
            if (hoursSinceUser >= 5 && day >= 1 && day <= 5
                && isNowWithinMinutesWindow(9 * 60, 12 * 60, now)
                && canTriggerType('quiet_productive', 22)) {
                addCandidate('quiet_productive', 48);
            }

            // ── Double-text / follow-up ────────────────────────────────────────────
            // Double text — character sent the last message, very recently (< 3h), and user hasn't replied
            const lastMsgIsCharMsg = !!lastCharMsg && !lastUserMsg;
            const charSentLast     = lastCharMsg && lastUserMsg
                ? Number(lastCharMsg.send_date || 0) > Number(lastUserMsg.send_date || 0)
                : !!lastCharMsg;

            if (charSentLast && hoursSinceUser >= 1 && hoursSinceUser <= 8 && (joy >= 55 || anticipation >= 55)
                && canTriggerType('double_text', 12)) {
                addCandidate('double_text', 52);
            }

            // Seen-no-reply — similar to double_text but softer, longer gap
            if (charSentLast && hoursSinceUser >= 4 && hoursSinceUser <= 24
                && trust >= 40 && anger < 50
                && canTriggerType('seen_no_reply_soft', 18)) {
                addCandidate('seen_no_reply_soft', 48 + (trust * 0.1));
            }

            // Followup callback — references last topic, moderate gap
            if (hoursSinceUser >= 2 && hoursSinceUser <= 48 && !!lastUserMsg
                && canTriggerType('followup_callback', 16)) {
                addCandidate('followup_callback', 50 + (anticipation * 0.1));
            }

            // ── Shared memory ─────────────────────────────────────────────────────
            if (hoursSinceUser >= 3 && hasRecentSharedMoment && !!lastCharMsg
                && canTriggerType('memory_nudge', 12)) {
                addCandidate('memory_nudge', 50);
            }

            // ── Custom time-window pings ──────────────────────────────────────────
            if (hoursSinceUser >= (config.minInactivityForWindowHours || 4)
                && Array.isArray(config.allowedPingHours) && config.allowedPingHours.length) {
                if (config.allowedPingHours.some(w => isNowWithinWindow(w, now))) {
                    const hoursSinceWindow = Number(state.triggerHistory?.time_window || 0) > 0
                        ? ((nowTs - state.triggerHistory.time_window) / 3600000) : Infinity;
                    if (hoursSinceWindow >= Math.max(12, globalRateLimitHours))
                        addCandidate('time_window', 50);
                }
            }

            if (candidates.length === 0) return null;

            // Weighted selection: sort descending, bias strongly towards top candidate
            candidates.sort((a, b) => b.weight - a.weight);
            return candidates[0];
        }

        // ============================================================
        // GENERATION
        // ============================================================

        /**
         * Builds the base PROACTIVE OUTBOUND MODE system message using
         * SEMANTIC TIME FRAMING — the LLM receives a temporal "vibe"
         * (e.g. "evening, winding down from the day") instead of an exact
         * clock reading.  Because the model never sees "10:35 AM" it is
         * impossible for it to accidentally echo those tokens.
         *
         * Instructions are expressed as POSITIVE constraints ("write a
         * message that fits the mood...") rather than negative ones
         * ("DO NOT say the time") to avoid the attention-illumination
         * problem where naming the forbidden token makes it more likely.
         *
         * @param {number} lastUserMessageAt - timestamp of last user message
         * @param {Array}  history           - full chat history array
         * @returns {string}
         */
        function buildProactiveContextMsg(lastUserMessageAt, history = []) {
            const now        = new Date();
            const timeSince  = humanTimeSince(lastUserMessageAt);
            const hour       = now.getHours();

            // Semantic Time translation: give the LLM a "vibe" instead of a clock.
            // Granular buckets provide better emotional framing than a plain AM/PM split.
            let semanticPeriod;
            if      (hour >= 4  && hour < 8)  semanticPeriod = 'early morning, the day is just beginning';
            else if (hour >= 8  && hour < 12) semanticPeriod = 'morning';
            else if (hour >= 12 && hour < 14) semanticPeriod = 'midday / lunchtime';
            else if (hour >= 14 && hour < 17) semanticPeriod = 'afternoon';
            else if (hour >= 17 && hour < 21) semanticPeriod = 'evening, winding down from the day';
            else if (hour >= 21 && hour < 24) semanticPeriod = 'late night';
            else                              semanticPeriod = 'the quiet, liminal hours before dawn';

            const dayType = (now.getDay() === 0 || now.getDay() === 6) ? 'weekend' : 'weekday';

            // Positive constraints: tell the model exactly what to DO, not what to avoid.
            const situationXml = `<proactive_situation>\nIt is currently ${semanticPeriod} on a ${dayType}. Time since last message from user: ${timeSince}.\n</proactive_situation>`;

            const lines = [
                'PROACTIVE OUTBOUND MODE: You are initiating a spontaneous text message, not replying.',
                situationXml,
                'Write a natural, conversational text message that fits the mood of this part of the day. Focus on your current thoughts, your surroundings, or your curiosity about the user. Never state the day or time explicitly.',
            ];

            // Anti-repetition: show the AI its own recent messages so it cannot repeat them.
            const recentCharMsgs = history
                .filter(m => !m.is_user && m.mes)
                .slice(-4)
                .map(m => `- "${String(m.mes).replace(/\n/g, ' ').slice(0, 150).trim()}"`)
                .join('\n');

            if (recentCharMsgs) {
                lines.push(
                    `<recent_outbound_messages>\n${recentCharMsgs}\n</recent_outbound_messages>`,
                    'Write a completely new, unique message that moves the conversation forward without reusing these phrases.'
                );
            }

            return lines.join('\n');
        }

        /**
         * If the last message in history is a user message that triggers an image
         * generation request, return a copy of history with that message removed so
         * the character never sees the raw "show me a photo" prompt in context.
         * Falls back to the original history when detection is unavailable.
         */
        function filterImageTriggerFromHistory(history) {
            if (!Array.isArray(history) || !history.length) return history;
            if (typeof api.detectImageRequest !== 'function') return history;
            const last = history[history.length - 1];
            if (last?.is_user && api.detectImageRequest(last.mes, history).triggered) {
                return history.slice(0, -1);
            }
            return history;
        }

        async function generateProactiveMessage(history, trigger, lastUserMessageAt = 0) {
            const controller = new AbortController();
            const extraSystem = [
                buildProactiveContextMsg(lastUserMessageAt, history),
                trigger?.prompt || 'Write a short, natural proactive SMS text in character. No action asterisks.'
            ];
            const filteredHistory = filterImageTriggerFromHistory(history);
            const { apiMessages, rawPrompt, systemPrompt } = await api.buildApiMessagesFromHistory(filteredHistory, extraSystem);
            const result = await api.requestEchoTextCompletion({ apiMessages, rawPrompt, systemPrompt, signal: controller.signal });
            return (result || '').trim();
        }

        // ============================================================
        // SCHEDULER TICK
        // ============================================================

        async function runProactiveTickForChar(char, characterKey) {
            // ── Startup guard ─────────────────────────────────────────────────────
            // Suppress the eager initial tick that fires 5 s after the scheduler
            // starts. Without this the typing indicator flashes on character load.
            const msSinceStart = Date.now() - schedulerStartedAt;
            if (msSinceStart < 90_000) return;

            if (proactiveGenerationLocks.has(characterKey)) return;
            if (api.getIsGenerating()) return;

            const s = api.getSettings();

            // Tethered-only: absolutely do not run in Untethered mode
            if (!api.isTetheredMode()) return;

            // Respect the user toggle for dynamic systems
            if (s.dynamicSystemsEnabled === false) return;

            // ── Group-aware history loading ──────────────────────────────────
            // Group histories live in separate stores, not s.chatHistory.
            // Read from the correct store based on session context.
            let history = [];
            const _inGroup  = !!(api.isGroupSession && api.isGroupSession());
            const _inCombine = _inGroup && !!(api.isCombineMode && api.isCombineMode());
            const _groupId   = _inGroup ? (api.getCurrentGroupId ? api.getCurrentGroupId() : null) : null;

            if (_inGroup) {
                if (!_groupId) return;
                history = _inCombine
                    ? (api.getCombineHistory   ? api.getCombineHistory(_groupId, false)               : [])
                    : (api.getGroupChatHistory ? api.getGroupChatHistory(_groupId, characterKey, false) : []);
            } else {
                history = (s.chatHistory && s.chatHistory[characterKey]) || [];
            }
            // Do not initiate proactive messages if there is no prior conversation
            if (!history.length) return;

            const state = getProactiveConversationState(characterKey);
            if (!state) return;
            syncProactiveStateWithHistory(characterKey, history);

            const config = getMergedProactiveConfig(characterKey, char);
            const trigger = evaluateProactiveTrigger({ history, state, config, now: new Date() });
            if (!trigger) return;

            proactiveGenerationLocks.add(characterKey);
            try {
                const isActiveChar = !api.isGroupSession || !api.isGroupSession() || api.getActiveGroupCharKey() === characterKey;

                if (api.isPanelOpen() && isActiveChar) {
                    api.setTypingIndicatorVisible(true);
                }

                const extraSystem = [
                    buildProactiveContextMsg(state.lastUserMessageAt, history),
                    trigger?.prompt || 'Write a short, natural proactive SMS text in character. No action asterisks.'
                ];
                const filteredHistory = filterImageTriggerFromHistory(history);
                const { apiMessages, rawPrompt, systemPrompt } = await api.buildApiMessagesFromHistoryForChar(filteredHistory, extraSystem, char);
                const controller = new AbortController();
                const proactiveText = await api.requestEchoTextCompletion({ apiMessages, rawPrompt, systemPrompt, signal: controller.signal });

                if (!proactiveText) return;

                const typingDelayMs = Math.min(Math.max(proactiveText.length * 40, 1500), 6000);
                await new Promise(resolve => setTimeout(resolve, typingDelayMs));

                // Capture emotion snapshot for mood_follow_up detection next tick
                const currentEmotion = settings().emotionSystemEnabled ? api.getEmotionState() : null;
                captureEmotionSnapshot(characterKey, currentEmotion);

                api.processMessageEmotion(proactiveText, false, characterKey);
                const outbound = {
                    is_user: false,
                    mes: proactiveText.trim(),
                    send_date: Date.now(),
                    meta: { proactive: true, proactiveType: trigger.type },
                    // Combined mode needs charName + charKey for bubble attribution in renderMessages
                    ...(_inCombine ? { charName: char.name || characterKey, charKey: characterKey } : {})
                };
                const newHistory = [...history, outbound];

                // ── Group-aware history saving ───────────────────────────────
                if (_inGroup && _groupId) {
                    if (_inCombine) {
                        if (api.saveCombineHistory) api.saveCombineHistory(_groupId, newHistory, false);
                    } else {
                        if (api.saveGroupChatHistory) api.saveGroupChatHistory(_groupId, characterKey, newHistory, false);
                    }
                } else if (api.isTetheredMode()) {
                    if (!s.chatHistory) s.chatHistory = {};
                    s.chatHistory[characterKey] = newHistory;
                    api.saveSettings();
                }
                markProactiveCharacterActivity(characterKey, true, trigger.type, outbound.send_date);

                if (api.isPanelOpen() && isActiveChar) {
                    api.renderMessages(newHistory);
                    api.setFabUnreadIndicator(false);
                } else if (api.isPanelOpen() && api.markGroupCharUnread) {
                    api.markGroupCharUnread(characterKey);
                } else {
                    api.setFabUnreadIndicator(true);
                }
            } catch (err) {
                api.warn('Proactive scheduler tick failed:', err);
            } finally {
                api.setTypingIndicatorVisible(false);
                proactiveGenerationLocks.delete(characterKey);
                api.saveSettings();
            }
        }

        async function runProactiveSchedulerTick() {
            // Ironclad Tethered-only guard
            if (!api.isTetheredMode()) return;
            if (settings().enabled !== true || settings().proactiveMessagingEnabled !== true) return;

            if (api.isGroupSession && api.isGroupSession() && api.getGroupMemberKeys) {
                const memberKeys = api.getGroupMemberKeys();

                if (api.isCombineMode && api.isCombineMode()) {
                    // ── Combined Mode: one proactive message per tick ────────────
                    // All members share a single history so we must serialise to avoid
                    // concurrent reads/writes and prevent multiple messages in one tick.
                    // Pick the member whose proactive cooldown is most overdue first.
                    const members = memberKeys
                        .map(k => ({ key: k, char: api.getGroupMemberByKey ? api.getGroupMemberByKey(k) : null }))
                        .filter(m => m.char);

                    // Sort by lastProactiveAt ascending (least recently active goes first)
                    members.sort((a, b) => {
                        const sa = (settings().proactiveState || {})[a.key] || {};
                        const sb = (settings().proactiveState || {})[b.key] || {};
                        return (sa.lastProactiveAt || 0) - (sb.lastProactiveAt || 0);
                    });

                    // Try each member in order; stop after the first one fires
                    for (const { key, char } of members) {
                        const before = settings().proactiveState?.[key]?.lastProactiveAt || 0;
                        await runProactiveTickForChar(char, key);
                        const after  = settings().proactiveState?.[key]?.lastProactiveAt || 0;
                        if (after > before) break; // a message was sent — done for this tick
                    }
                } else {
                    // ── Individual Group Mode: each member ticks independently ──
                    for (const charKey of memberKeys) {
                        const char = api.getGroupMemberByKey ? api.getGroupMemberByKey(charKey) : null;
                        if (char) await runProactiveTickForChar(char, charKey);
                    }
                }
                return;
            }

            const char = api.getCurrentCharacter();
            const characterKey = api.getCharacterKey();
            if (!char || !characterKey) return;
            await runProactiveTickForChar(char, characterKey);
        }

        // ============================================================
        // SCHEDULER LIFECYCLE
        // ============================================================

        function stopProactiveScheduler() {
            if (proactiveSchedulerHandle) {
                clearInterval(proactiveSchedulerHandle);
                proactiveSchedulerHandle = null;
            }
        }

        function startProactiveScheduler() {
            stopProactiveScheduler();

            // Tethered-only: never start the scheduler in Untethered mode
            if (!api.isTetheredMode()) return;
            if (settings().proactiveMessagingEnabled !== true) return;

            // Record startup time — runProactiveTickForChar uses this to suppress
            // the initial eager tick that caused the typing indicator flash.
            schedulerStartedAt = Date.now();

            const tickMinutes = Math.max(1, Number(settings().proactiveTickMinutes || 2));
            proactiveSchedulerHandle = setInterval(() => runProactiveSchedulerTick(), tickMinutes * 60 * 1000);

            // The initial tick is deliberately delayed by 90 s (the same guard
            // window) so there is NO flash even if the guard were ever removed.
            setTimeout(() => runProactiveSchedulerTick(), 90_000);

            // Start server plugin sync in parallel (if plugin is available)
            startServerSyncLoop();
        }

        // ============================================================
        // FORMAT HELPERS
        // ============================================================

        function formatProactiveTimestamp(ts) {
            if (!ts || !Number.isFinite(ts)) return '—';
            const d = new Date(ts);
            return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        }

        function formatHoursDuration(hours) {
            if (!Number.isFinite(hours) || hours <= 0) return '0m';
            const totalMin = Math.max(1, Math.ceil(hours * 60));
            const h = Math.floor(totalMin / 60);
            const m = totalMin % 60;
            if (h > 0 && m > 0) return `${h}h ${m}m`;
            if (h > 0) return `${h}h`;
            return `${m}m`;
        }

        // ============================================================
        // INSIGHTS PANEL
        // ============================================================

        const PRETTY_TYPE = {
            checkin:                  'Check-in',
            time_window:              'Time-window ping',
            pregnant_pause:           'Pause follow-up',
            late_night:               'Late-night ping',
            morning_wave:             'Morning ping',
            lunch_nudge:              'Lunch nudge',
            evening_winddown:         'Evening wind-down',
            weekend_ping:             'Weekend ping',
            affection_reciprocation:  'Affection reciprocation',
            repair_attempt:           'Repair attempt',
            curiosity_ping:           'Curiosity ping',
            anxiety_reassurance:      'Anxiety reassurance',
            celebration_nudge:        'Celebration nudge',
            sharing_impulse:          'Sharing impulse',
            mood_follow_up:           'Mood follow-up',
            memory_nudge:             'Memory nudge',
            dormancy_break:           'Dormancy break',
            // Extended time-of-day
            afternoon_slump:          'Afternoon slump',
            pre_dawn:                 'Pre-dawn ping',
            commute_ping:             'Commute ping',
            post_work:                'Post-work ping',
            sunday_evening:           'Sunday evening',
            post_midnight_impulse:    'Post-midnight impulse',
            // Day-specific
            monday_reboot:            'Monday reboot',
            friday_feeling:           'Friday feeling',
            sunday_scaries:           'Sunday scaries',
            midweek_check:            'Midweek check',
            // Emotion-driven (extended)
            nostalgia_wave:           'Nostalgia wave',
            longing_ping:             'Longing ping',
            playful_tease:            'Playful tease',
            jealousy_nudge:           'Jealousy nudge',
            boredom_break:            'Boredom break',
            overwhelm_check:          'Overwhelm check',
            gratitude_burst:          'Gratitude burst',
            pride_share:              'Pride share',
            suppressed_thought:       'Suppressed thought',
            // Contextual / behavioral
            thinking_of_you:          'Thinking of you',
            random_thought:           'Random thought',
            dream_mention:            'Dream mention',
            song_stuck:               'Song stuck',
            overthinking_spiral:      'Overthinking spiral',
            craving_share:            'Craving share',
            inside_joke_callback:     'Inside joke callback',
            quiet_productive:         'Quiet productive',
            // Double-text / follow-up
            double_text:              'Double text',
            seen_no_reply_soft:       'Seen no-reply',
            followup_callback:        'Follow-up callback',
            // Meta
            reply:                    'Normal reply',
            none:                     'None'
        };

        const TRIGGER_DEFS = [
            // Core
            ['checkin',                 'Check-in'],
            ['pregnant_pause',          'Pause follow-up'],
            ['dormancy_break',          'Dormancy break'],
            // Time-of-day
            ['late_night',              'Late-night ping'],
            ['morning_wave',            'Morning ping'],
            ['lunch_nudge',             'Lunch nudge'],
            ['afternoon_slump',         'Afternoon slump'],
            ['evening_winddown',        'Evening wind-down'],
            ['post_work',               'Post-work ping'],
            ['post_midnight_impulse',   'Post-midnight impulse'],
            ['pre_dawn',                'Pre-dawn ping'],
            ['commute_ping',            'Commute ping'],
            // Day-specific
            ['monday_reboot',           'Monday reboot'],
            ['midweek_check',           'Midweek check'],
            ['friday_feeling',          'Friday feeling'],
            ['weekend_ping',            'Weekend ping'],
            ['sunday_evening',          'Sunday evening'],
            ['sunday_scaries',          'Sunday scaries'],
            // Emotion-driven
            ['affection_reciprocation', 'Affection reciprocation'],
            ['repair_attempt',          'Repair attempt'],
            ['curiosity_ping',          'Curiosity ping'],
            ['anxiety_reassurance',     'Anxiety reassurance'],
            ['celebration_nudge',       'Celebration nudge'],
            ['sharing_impulse',         'Sharing impulse'],
            ['mood_follow_up',          'Mood follow-up'],
            ['nostalgia_wave',          'Nostalgia wave'],
            ['longing_ping',            'Longing ping'],
            ['playful_tease',           'Playful tease'],
            ['jealousy_nudge',          'Jealousy nudge'],
            ['boredom_break',           'Boredom break'],
            ['overwhelm_check',         'Overwhelm check'],
            ['gratitude_burst',         'Gratitude burst'],
            ['pride_share',             'Pride share'],
            ['suppressed_thought',      'Suppressed thought'],
            // Contextual / behavioral
            ['thinking_of_you',         'Thinking of you'],
            ['random_thought',          'Random thought'],
            ['dream_mention',           'Dream mention'],
            ['song_stuck',              'Song stuck'],
            ['overthinking_spiral',     'Overthinking spiral'],
            ['craving_share',           'Craving share'],
            ['inside_joke_callback',    'Inside joke callback'],
            ['quiet_productive',        'Quiet productive'],
            ['memory_nudge',            'Memory nudge'],
            // Double-text / follow-up
            ['double_text',             'Double text'],
            ['seen_no_reply_soft',      'Seen no-reply'],
            ['followup_callback',       'Follow-up callback'],
            // Custom window
            ['time_window',             'Time-window ping']
        ];

        const DIAGNOSTIC_CATEGORIES = [
            { id: 'core', label: 'Core', icon: 'fa-star' },
            { id: 'time', label: 'Time-of-Day', icon: 'fa-moon' },
            { id: 'day', label: 'Day-Specific', icon: 'fa-calendar' },
            { id: 'emotion', label: 'Emotion-Driven', icon: 'fa-heart-pulse' },
            { id: 'context', label: 'Contextual & Behavioral', icon: 'fa-brain' },
            { id: 'double', label: 'Follow-up', icon: 'fa-reply-all' },
            { id: 'custom', label: 'Custom', icon: 'fa-clock' }
        ];

        const TRIGGER_CATEGORY_MAP = {
            'checkin': 'core', 'pregnant_pause': 'core', 'dormancy_break': 'core',
            'late_night': 'time', 'morning_wave': 'time', 'lunch_nudge': 'time', 'afternoon_slump': 'time', 'evening_winddown': 'time', 'post_work': 'time', 'post_midnight_impulse': 'time', 'pre_dawn': 'time', 'commute_ping': 'time',
            'monday_reboot': 'day', 'midweek_check': 'day', 'friday_feeling': 'day', 'weekend_ping': 'day', 'sunday_evening': 'day', 'sunday_scaries': 'day',
            'affection_reciprocation': 'emotion', 'repair_attempt': 'emotion', 'curiosity_ping': 'emotion', 'anxiety_reassurance': 'emotion', 'celebration_nudge': 'emotion', 'sharing_impulse': 'emotion', 'mood_follow_up': 'emotion', 'nostalgia_wave': 'emotion', 'longing_ping': 'emotion', 'playful_tease': 'emotion', 'jealousy_nudge': 'emotion', 'boredom_break': 'emotion', 'overwhelm_check': 'emotion', 'gratitude_burst': 'emotion', 'pride_share': 'emotion', 'suppressed_thought': 'emotion',
            'thinking_of_you': 'context', 'random_thought': 'context', 'dream_mention': 'context', 'song_stuck': 'context', 'overthinking_spiral': 'context', 'craving_share': 'context', 'inside_joke_callback': 'context', 'quiet_productive': 'context', 'memory_nudge': 'context',
            'double_text': 'double', 'seen_no_reply_soft': 'double', 'followup_callback': 'double',
            'time_window': 'custom'
        };

        const TRIGGER_REQUIREMENTS = {
            'checkin': { req: 'Inactive for min gap', type: 'gap', gapHrs: (c) => Math.max(0.25, c.minInactivityBeforePingHours || 24) },
            'pregnant_pause': { req: 'Unresolved question, 20m–6h ago' },
            'dormancy_break': { req: 'Silent for 7+ days', type: 'gap', gapHrs: () => 168 },
            'late_night': { req: '23:00 - 02:30', active: (now) => isNowWithinMinutesWindow(23*60, 2*60+30, now) },
            'morning_wave': { req: '06:00 - 09:30', active: (now) => isNowWithinMinutesWindow(6*60, 9*60+30, now) },
            'lunch_nudge': { req: '11:15 - 13:45', active: (now) => isNowWithinMinutesWindow(11*60+15, 13*60+45, now) },
            'afternoon_slump': { req: '14:00 - 16:30 (Weekdays)', active: (now) => now.getDay()>=1 && now.getDay()<=5 && isNowWithinMinutesWindow(14*60, 16*60+30, now) },
            'evening_winddown': { req: '19:00 - 22:30', active: (now) => isNowWithinMinutesWindow(19*60, 22*60+30, now) },
            'post_work': { req: '17:30 - 19:30 (Weekdays)', active: (now) => now.getDay()>=1 && now.getDay()<=5 && isNowWithinMinutesWindow(17*60+30, 19*60+30, now) },
            'post_midnight_impulse': { req: '00:00 - 01:30', active: (now) => isNowWithinMinutesWindow(0, 1*60+30, now) },
            'pre_dawn': { req: '04:00 - 05:30', active: (now) => isNowWithinMinutesWindow(4*60, 5*60+30, now) },
            'commute_ping': { req: 'Morning or evening commute', active: (now) => now.getDay()>=1 && now.getDay()<=5 && (isNowWithinMinutesWindow(7*60+30, 9*60, now) || isNowWithinMinutesWindow(17*60, 18*60+30, now)) },
            'monday_reboot': { req: 'Monday, 07:00 - 11:00', active: (now) => now.getDay() === 1 && isNowWithinMinutesWindow(7*60, 11*60, now) },
            'midweek_check': { req: 'Wednesday, 10:00 - 20:00', active: (now) => now.getDay() === 3 && isNowWithinMinutesWindow(10*60, 20*60, now) },
            'friday_feeling': { req: 'Friday, 12:00 - 18:00', active: (now) => now.getDay() === 5 && isNowWithinMinutesWindow(12*60, 18*60, now) },
            'weekend_ping': { req: 'Saturday or Sunday', active: (now) => now.getDay()===0 || now.getDay()===6 },
            'sunday_evening': { req: 'Sunday, 18:00 - 21:00', active: (now) => now.getDay() === 0 && isNowWithinMinutesWindow(18*60, 21*60, now) },
            'sunday_scaries': { req: 'Sunday, 15:00 - 20:00', active: (now) => now.getDay() === 0 && isNowWithinMinutesWindow(15*60, 20*60, now) },
            'affection_reciprocation': { req: 'Recent heart/like + High Trust/Joy' },
            'repair_attempt': { req: 'High Anger or Sadness' },
            'curiosity_ping': { req: 'High Anticipation' },
            'anxiety_reassurance': { req: 'High Fear' },
            'celebration_nudge': { req: 'High Joy' },
            'sharing_impulse': { req: 'High Trust' },
            'mood_follow_up': { req: 'Recent emotion shift' },
            'nostalgia_wave': { req: 'High Trust + Sadness' },
            'longing_ping': { req: 'High Anticipation + Sadness' },
            'playful_tease': { req: 'High Joy + Anticipation' },
            'jealousy_nudge': { req: 'High Anger + Anticipation' },
            'boredom_break': { req: 'Low overall emotions' },
            'overwhelm_check': { req: 'High Fear + Sadness' },
            'gratitude_burst': { req: 'High Trust + Joy' },
            'pride_share': { req: 'High Joy + Trust' },
            'suppressed_thought': { req: 'High Anticipation + Fear' },
            'thinking_of_you': { req: 'Random check-in' },
            'random_thought': { req: 'Spontaneous thought' },
            'dream_mention': { req: 'Morning, after sleep' },
            'song_stuck': { req: 'Random earworm' },
            'overthinking_spiral': { req: 'Late night or High Anticipation' },
            'craving_share': { req: 'Around meal times' },
            'inside_joke_callback': { req: 'Random humor' },
            'quiet_productive': { req: 'After long silence' },
            'memory_nudge': { req: 'Shared memory highlighted' },
            'double_text': { req: 'You left them on read' },
            'seen_no_reply_soft': { req: 'You left them on read' },
            'followup_callback': { req: 'Random follow-up' },
            'time_window': { req: 'Configured time window' }
        };

        function getProactiveInsightsSnapshot() {
            const char = api.getCurrentCharacter();
            const characterKey = api.getCharacterKey();
            const now = new Date();

            const fallback = {
                character: char?.name || 'No character selected',
                tick: `Every ${Math.max(1, Number(settings().proactiveTickMinutes || 2))} min`,
                lastUser: 'No recent message',
                lastChar: 'No recent reply',
                lastAuto: 'No proactive text yet',
                next: api.isTetheredMode() ? 'No active conversation yet' : 'Switch to Tethered mode',
                type: '—',
                triggerDiagnostics: [],
                ghostWindow: null
            };
            if (!characterKey || !char) return fallback;

            const history = api.getChatHistory();
            const state = getProactiveConversationState(characterKey);
            syncProactiveStateWithHistory(characterKey, history);
            const config = getMergedProactiveConfig(characterKey, char);

            const emotion = settings().emotionSystemEnabled ? api.getEmotionState() : null;
            const ghostInfo = checkEmotionGhostWindow(state, emotion);

            const nowTs = now.getTime();
            const globalRateLimitHours = Math.max(0.25, Number(settings().proactiveRateLimitMinutes || 180) / 60);
            const hoursSinceUser      = state.lastUserMessageAt > 0 ? ((nowTs - state.lastUserMessageAt) / 3600000) : Infinity;
            const hoursSinceProactive = state.lastProactiveAt   > 0 ? ((nowTs - state.lastProactiveAt)   / 3600000) : Infinity;
            const remainingGap  = Math.max(0, globalRateLimitHours - hoursSinceProactive);
            const userGapNeed   = Math.max(0, Math.min(globalRateLimitHours, config.minInactivityBeforePingHours || 24) - hoursSinceUser);

            let next = 'Ready to send when a trigger matches';
            if (!api.isTetheredMode()) {
                next = 'Proactive messaging only runs in Tethered mode';
            } else if (settings().proactiveMessagingEnabled !== true) {
                next = 'Proactive messaging is currently paused';
            } else if (!config.enabled) {
                next = 'This character is not configured for proactive pings';
            } else if (ghostInfo) {
                next = `Ghosting (~${formatHoursDuration(ghostInfo.remainingHours)} remaining — ${ghostInfo.emotionLabel})`;
            } else if (remainingGap > 0) {
                next = `Cooling down (${formatHoursDuration(remainingGap)} remaining)`;
            } else if (userGapNeed > 0) {
                next = `Waiting for quiet time (${formatHoursDuration(userGapNeed)} left)`;
            } else if (!history.length) {
                next = 'No messages yet — start a conversation first';
            }

            const sharedWait = ghostInfo
                ? `Ghosting ~${formatHoursDuration(ghostInfo.remainingHours)}`
                : remainingGap > 0
                    ? `~${formatHoursDuration(remainingGap)}`
                    : userGapNeed > 0
                        ? `~${formatHoursDuration(userGapNeed)}`
                        : 'When conditions match';

            const triggerDiagnostics = TRIGGER_DEFS.map(([id, label]) => {
                const reqData = TRIGGER_REQUIREMENTS[id] || { req: 'When conditions match' };
                let isActive = typeof reqData.active === 'function' ? reqData.active(now) : null;
                const neverFired = !(Number(state.triggerHistory?.[id] || 0) > 0);
                
                let status = 'unmet';
                let reason = 'Conditions unmet';

                if (ghostInfo) {
                    status = 'ghosting';
                    reason = `Ghosting (~${formatHoursDuration(ghostInfo.remainingHours)})`;
                } else if (remainingGap > 0 || userGapNeed > 0) {
                    status = 'cooling';
                    reason = remainingGap > 0 ? `Rate limited (~${formatHoursDuration(remainingGap)})` : `Need silence (~${formatHoursDuration(userGapNeed)})`;
                } else if (isActive === true) {
                    status = 'active';
                    reason = 'Active Window';
                } else if (isActive === false) {
                    status = neverFired ? 'never' : 'unmet';
                    reason = 'Out of window';
                } else {
                    status = 'ready';
                    reason = 'Ready';
                }

                // Gap-based trigger specific adjustment
                if (reqData.type === 'gap') {
                    const requiredGap = typeof reqData.gapHrs === 'function' ? reqData.gapHrs(config) : 24;
                    if (hoursSinceUser < requiredGap) {
                        status = 'cooling';
                        reason = `Needs ${formatHoursDuration(requiredGap)} silence`;
                    } else if (!ghostInfo) {
                        status = 'ready';
                        reason = 'Ready';
                    }
                }

                // Override status if globally disabled
                if (!api.isTetheredMode() || settings().proactiveMessagingEnabled !== true || !config.enabled) {
                    status = 'unmet';
                    reason = 'Disabled';
                }

                return {
                    id,
                    label,
                    last: formatProactiveTimestamp(Number(state.triggerHistory?.[id] || 0)),
                    req: reqData.req,
                    status,
                    reason,
                    category: TRIGGER_CATEGORY_MAP[id] || 'core'
                };
            });

            return {
                character: char.name || 'Character',
                tick: `Every ${Math.max(1, Number(settings().proactiveTickMinutes || 2))} min`,
                lastUser: formatProactiveTimestamp(state.lastUserMessageAt),
                lastChar: formatProactiveTimestamp(state.lastCharacterMessageAt),
                lastAuto: formatProactiveTimestamp(state.lastProactiveAt),
                next,
                type: PRETTY_TYPE[state.lastOutboundType] || state.lastOutboundType || 'None',
                triggerDiagnostics,
                ghostWindow: ghostInfo
            };
        }

        function refreshProactiveInsights() {
            const snapshot = getProactiveInsightsSnapshot();
            const targets = [
                ['#et_proactive_character_panel', snapshot.character],
                ['#et_proactive_tick_panel',      snapshot.tick],
                ['#et_proactive_last_user_panel', snapshot.lastUser],
                ['#et_proactive_last_char_panel', snapshot.lastChar],
                ['#et_proactive_last_auto_panel', snapshot.lastAuto],
                ['#et_proactive_next_panel',      snapshot.next],
                ['#et_proactive_type_panel',      snapshot.type],
                ['#et_proactive_character',       snapshot.character],
                ['#et_proactive_tick',            snapshot.tick],
                ['#et_proactive_last_user',       snapshot.lastUser],
                ['#et_proactive_last_char',       snapshot.lastChar],
                ['#et_proactive_last_auto',       snapshot.lastAuto],
                ['#et_proactive_next',            snapshot.next],
                ['#et_proactive_type',            snapshot.type]
            ];
            targets.forEach(([sel, val]) => {
                const el = jQuery(sel);
                if (el.length) el.text(val);
            });

            const renderDiagnostics = (selector) => {
                const wrap = jQuery(selector);
                if (!wrap.length) return;
                
                if (!snapshot.triggerDiagnostics || snapshot.triggerDiagnostics.length === 0) {
                    wrap.html('<div class="et-trigger-row"><span class="et-trigger-row-name">No trigger diagnostics available</span></div>');
                    return;
                }

                const groupsData = JSON.parse(JSON.stringify(DIAGNOSTIC_CATEGORIES)).map(g => ({ ...g, items: [] }));
                const groupMap = {};
                groupsData.forEach(g => groupMap[g.id] = g);

                snapshot.triggerDiagnostics.forEach(t => {
                    const g = groupMap[t.category] || groupMap['core'];
                    g.items.push(t);
                });

                let html = '';
                for (const group of groupsData) {
                    if (group.items.length === 0) continue;
                    
                    html += `
                        <div class="et-trigger-category">
                            <div class="et-trigger-category-header">
                                <i class="fa-solid ${group.icon}"></i> <span>${group.label}</span>
                            </div>
                            <div class="et-trigger-category-items">`;
                    
                    for (const t of group.items) {
                        let badgeClass = 'et-badge-unmet';
                        if (t.status === 'never') badgeClass = 'et-badge-never';
                        else if (t.status === 'ghosting') badgeClass = 'et-badge-ghosting';
                        else if (t.status === 'cooling') badgeClass = 'et-badge-cooling';
                        else if (t.status === 'active') badgeClass = 'et-badge-active';
                        else if (t.status === 'ready') badgeClass = 'et-badge-ready';
                        
                        let badgeText = t.status === 'never' ? 'Never Fired' : t.reason;

                        html += `
                        <div class="et-trigger-row" data-id="${t.id}">
                            <div class="et-trigger-row-main">
                                <span class="et-trigger-row-name">${t.label}</span>
                                <span class="et-trigger-row-req">${t.req}</span>
                            </div>
                            <div class="et-trigger-row-status">
                                <span class="et-trigger-badge ${badgeClass}">${badgeText}</span>
                            </div>
                            <div class="et-trigger-row-meta" title="Last triggered">
                                <i class="fa-solid fa-clock-rotate-left"></i> ${t.last}
                            </div>
                        </div>`;
                    }
                    html += `</div></div>`;
                }

                wrap.html(html);
            };

            renderDiagnostics('#et_trigger_list_panel');
            renderDiagnostics('#et_trigger_list');
        }

        // ============================================================
        // MANUAL TEST TRIGGER
        // ============================================================

        async function triggerTestProactiveMessage() {
            // Tethered-only guard for manual test trigger
            if (!api.isTetheredMode()) {
                toastr.warning('Proactive messaging is only available in Tethered mode.');
                return;
            }

            const char = api.getCurrentCharacter();
            const characterKey = api.getCharacterKey();
            if (!char || !characterKey) {
                toastr.warning('Please select a character card first.');
                return;
            }
            if (proactiveGenerationLocks.has(characterKey) || api.getIsGenerating()) {
                toastr.warning('A generation is already in progress.');
                return;
            }

            const triggerTypes = [
                // Core
                'checkin', 'pregnant_pause', 'dormancy_break',
                // Time-of-day
                'late_night', 'morning_wave', 'lunch_nudge', 'afternoon_slump',
                'evening_winddown', 'post_work', 'post_midnight_impulse', 'pre_dawn', 'commute_ping',
                // Day-specific
                'monday_reboot', 'midweek_check', 'friday_feeling',
                'weekend_ping', 'sunday_evening', 'sunday_scaries',
                // Emotion-driven
                'affection_reciprocation', 'repair_attempt', 'curiosity_ping',
                'anxiety_reassurance', 'celebration_nudge', 'sharing_impulse', 'mood_follow_up',
                'nostalgia_wave', 'longing_ping', 'playful_tease', 'jealousy_nudge',
                'boredom_break', 'overwhelm_check', 'gratitude_burst', 'pride_share', 'suppressed_thought',
                // Contextual / behavioral
                'thinking_of_you', 'random_thought', 'dream_mention', 'song_stuck',
                'overthinking_spiral', 'craving_share', 'inside_joke_callback', 'quiet_productive',
                'memory_nudge',
                // Double-text / follow-up
                'double_text', 'seen_no_reply_soft', 'followup_callback'
            ];

            const randomType = triggerTypes[Math.floor(Math.random() * triggerTypes.length)];
            const config = getMergedProactiveConfig(characterKey, char);
            const state  = getProactiveConversationState(characterKey);
            const trigger = {
                type: randomType,
                prompt: buildProactiveTriggerPrompt(randomType, config, state?.lastUserMessageAt || 0)
            };

            jQuery('#et_trigger_message, #et_trigger_message_panel').prop('disabled', true).addClass('et-btn-loading');

            proactiveGenerationLocks.add(characterKey);
            try {
                if (api.isPanelOpen() && api.getCharacterKey() === characterKey) api.setTypingIndicatorVisible(true);

                const history = api.getChatHistory();
                const text = await generateProactiveMessage(history, trigger);
                if (!text) return;

                // Capture emotion snapshot for mood_follow_up
                const currentEmotion = settings().emotionSystemEnabled ? api.getEmotionState() : null;
                captureEmotionSnapshot(characterKey, currentEmotion);

                api.processMessageEmotion(text, false);
                const outbound = {
                    is_user: false,
                    mes: text,
                    send_date: Date.now(),
                    meta: { proactive: true, proactiveType: trigger.type }
                };
                const newHistory = [...history, outbound];
                api.saveChatHistory(newHistory);
                markProactiveCharacterActivity(characterKey, true, trigger.type, outbound.send_date);

                if (api.isPanelOpen() && api.getCharacterKey() === characterKey) {
                    api.renderMessages(newHistory);
                    api.setFabUnreadIndicator(false);
                } else {
                    api.setFabUnreadIndicator(true);
                }

                const prettyType = PRETTY_TYPE[trigger.type] || trigger.type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                toastr.success('Triggered: ' + prettyType);
                refreshProactiveInsights();
            } catch (err) {
                api.warn('Trigger test failed:', err);
                toastr.error('Trigger failed: ' + err.message);
            } finally {
                api.setTypingIndicatorVisible(false);
                proactiveGenerationLocks.delete(characterKey);
                jQuery('#et_trigger_message, #et_trigger_message_panel').prop('disabled', false).removeClass('et-btn-loading');
                api.saveSettings();
            }
        }

        // ============================================================
        // SERVER PLUGIN SYNC SUBSYSTEM
        // ============================================================

        const PLUGIN_BASE_URL = '/api/plugins/echotext-proactive';

        // Whether the server plugin responded to a status check
        let serverPluginAvailable = false;
        let serverSyncHandle = null;

        /**
         * Returns headers for plugin API calls, including SillyTavern's CSRF token.
         * ST protects all /api/ routes (including plugin routes) with CSRF middleware;
         * getRequestHeaders() from the context always carries the current token.
         */
        function _pluginHeaders() {
            try {
                const ctx = SillyTavern.getContext();
                if (typeof ctx.getRequestHeaders === 'function') {
                    return { ...ctx.getRequestHeaders(), 'Content-Type': 'application/json' };
                }
            } catch { /* fall through */ }
            return { 'Content-Type': 'application/json' };
        }

        // Debounce timer for register calls triggered by activity marks
        let _registerDebounceTimer = null;
        function _debounceRegister(characterKey, char, history, state) {
            clearTimeout(_registerDebounceTimer);
            _registerDebounceTimer = setTimeout(() => {
                registerWithServer(characterKey, char, history, state).catch(() => {});
            }, 2000);
        }

        /**
         * One-time check: is the server plugin running?
         * Called when the scheduler starts. Sets serverPluginAvailable.
         */
        async function detectServerPlugin() {
            try {
                const res = await fetch(`${PLUGIN_BASE_URL}/status`, { method: 'GET' });
                if (res.ok) {
                    const data = await res.json();
                    serverPluginAvailable = data.ok === true;
                    if (serverPluginAvailable) {
                        api.warn('[EchoText-Proactive] Server plugin detected v' + (data.version || '?') + '. Background generation enabled.');
                    }
                } else {
                    serverPluginAvailable = false;
                }
            } catch {
                serverPluginAvailable = false;
            }
            return serverPluginAvailable;
        }

        /**
         * Push current character state to the server plugin so it can evaluate
         * triggers and generate messages independently.
         */
        async function registerWithServer(characterKey, char, history, proactiveStateOverride) {
            if (!serverPluginAvailable) return;
            const s = settings();
            const proactiveState = proactiveStateOverride || getProactiveConversationState(characterKey) || {};
            const config = getMergedProactiveConfig(characterKey, char);
            const emotionState = s.emotionSystemEnabled ? api.getEmotionState() : null;

            const payload = {
                characterKey,
                characterName: char.name || 'Character',
                systemPromptText: '', // will be populated by client if available via buildSystemPromptText
                chatHistory: (history || []).slice(-40),
                proactiveState: {
                    lastUserMessageAt:     proactiveState.lastUserMessageAt     || 0,
                    lastCharacterMessageAt: proactiveState.lastCharacterMessageAt || 0,
                    lastProactiveAt:       proactiveState.lastProactiveAt       || 0,
                    triggerHistory:        proactiveState.triggerHistory         || {}
                },
                emotionState,
                emotionSystemEnabled: s.emotionSystemEnabled !== false,
                source: s.source || 'default',
                llmConfig: {
                    ollamaUrl:   s.ollama_url   || 'http://localhost:11434',
                    ollamaModel: s.ollama_model || '',
                    openaiUrl:   s.openai_url   || 'http://localhost:1234/v1',
                    openaiModel: s.openai_model || 'local-model',
                    openaiKey:   s.openai_key   || '',
                    antiRefusal: s.antiRefusal === true
                },
                verbosity: s.verbosityByCharacter?.[characterKey] || s.verbosityDefault || 'medium',
                triggerTemplates: config.triggerTemplates || {},
                rateLimitMinutes: s.proactiveRateLimitMinutes || 180
            };

            // Fetch system prompt text from the already-rendered context if the API exposes it
            try {
                if (typeof api.buildSystemPromptText === 'function') {
                    payload.systemPromptText = await api.buildSystemPromptText(char);
                } else if (typeof api.buildApiMessagesFromHistoryForChar === 'function') {
                    // Build a minimal messages array just to extract the system prompt
                    const { systemPrompt } = await api.buildApiMessagesFromHistoryForChar([], [], char);
                    payload.systemPromptText = systemPrompt || '';
                }
            } catch { /* leave empty — server will still generate, just without rich context */ }

            try {
                await fetch(`${PLUGIN_BASE_URL}/register`, {
                    method: 'POST',
                    headers: _pluginHeaders(),
                    body: JSON.stringify(payload)
                });
            } catch { /* server unreachable — degrade gracefully */ }
        }

        /**
         * Poll the server for any messages generated while the tab was backgrounded.
         * Merges them into chat history, then acks.
         */
        async function pollServerPending() {
            if (!serverPluginAvailable || !api.isTetheredMode()) return;

            const char = api.getCurrentCharacter();
            const characterKey = api.getCharacterKey();
            if (!char || !characterKey) return;

            let messages;
            try {
                const res = await fetch(`${PLUGIN_BASE_URL}/pending?key=${encodeURIComponent(characterKey)}`);
                if (!res.ok) return;
                const data = await res.json();
                messages = data.messages || [];
            } catch {
                return;
            }

            if (!messages.length) return;

            const s = settings();
            const history = api.getChatHistory();
            const idsToAck = [];
            let historyChanged = false;

            for (const serverMsg of messages) {
                idsToAck.push(serverMsg.id);

                if (serverMsg.type === 'generated' && serverMsg.mes) {
                    // Fully generated message — inject directly into history
                    const outbound = {
                        is_user:   false,
                        mes:       serverMsg.mes.trim(),
                        send_date: serverMsg.send_date || Date.now(),
                        meta: { proactive: true, proactiveType: serverMsg.triggerType, serverGenerated: true }
                    };
                    history.push(outbound);
                    api.processMessageEmotion(serverMsg.mes, false);
                    markProactiveCharacterActivity(characterKey, true, serverMsg.triggerType, outbound.send_date);
                    historyChanged = true;
                    api.warn(`[EchoText-Proactive] Received server-generated message (${serverMsg.triggerType}).`);

                } else if (serverMsg.type === 'deferred_trigger' && serverMsg.triggerPrompt) {
                    // Deferred trigger — execute generation now (client is visible)
                    if (!proactiveGenerationLocks.has(characterKey) && !api.getIsGenerating()) {
                        proactiveGenerationLocks.add(characterKey);
                        try {
                            if (api.isPanelOpen()) api.setTypingIndicatorVisible(true);
                            const trigger = { type: serverMsg.triggerType, prompt: serverMsg.triggerPrompt };
                            const text = await generateProactiveMessage(history, trigger, getProactiveConversationState(characterKey)?.lastUserMessageAt || 0);
                            if (text) {
                                const outbound = {
                                    is_user:   false,
                                    mes:       text.trim(),
                                    send_date: Date.now(),
                                    meta: { proactive: true, proactiveType: trigger.type, serverDeferred: true }
                                };
                                history.push(outbound);
                                api.processMessageEmotion(text, false);
                                markProactiveCharacterActivity(characterKey, true, trigger.type, outbound.send_date);
                                historyChanged = true;
                                api.warn(`[EchoText-Proactive] Executed deferred trigger (${trigger.type}).`);
                            }
                        } catch (err) {
                            api.warn('[EchoText-Proactive] Deferred generation failed:', err);
                        } finally {
                            proactiveGenerationLocks.delete(characterKey);
                            api.setTypingIndicatorVisible(false);
                        }
                    }
                }
            }

            // Ack all processed messages
            try {
                await fetch(`${PLUGIN_BASE_URL}/ack`, {
                    method: 'POST',
                    headers: _pluginHeaders(),
                    body: JSON.stringify({ characterKey, ids: idsToAck })
                });
            } catch { /* best-effort */ }

            if (historyChanged) {
                if (!s.chatHistory) s.chatHistory = {};
                s.chatHistory[characterKey] = history;
                api.saveSettings();

                if (api.isPanelOpen()) {
                    api.renderMessages(history);
                    api.setFabUnreadIndicator(false);
                } else {
                    api.setFabUnreadIndicator(true);
                }
            }
        }

        /**
         * Send a lightweight heartbeat to keep the server registration alive
         * without re-sending the full payload.
         */
        async function heartbeatServer(characterKey, proactiveState, chatHistory) {
            if (!serverPluginAvailable) return;
            try {
                await fetch(`${PLUGIN_BASE_URL}/heartbeat`, {
                    method: 'POST',
                    headers: _pluginHeaders(),
                    body: JSON.stringify({
                        characterKey,
                        proactiveState: {
                            lastUserMessageAt:      proactiveState.lastUserMessageAt     || 0,
                            lastCharacterMessageAt: proactiveState.lastCharacterMessageAt || 0,
                            lastProactiveAt:        proactiveState.lastProactiveAt        || 0,
                            triggerHistory:         proactiveState.triggerHistory          || {}
                        },
                        chatHistory: chatHistory ? chatHistory.slice(-10) : undefined
                    })
                });
            } catch { /* best-effort */ }
        }

        function stopServerSyncLoop() {
            if (serverSyncHandle) {
                clearInterval(serverSyncHandle);
                serverSyncHandle = null;
            }
            document.removeEventListener('visibilitychange', _onVisibilityChange);
        }

        function _onVisibilityChange() {
            if (!document.hidden) {
                // Tab became visible — immediately poll for any missed messages
                pollServerPending().catch(() => {});
            }
        }

        async function startServerSyncLoop() {
            stopServerSyncLoop();

            // Detect plugin availability first
            const available = await detectServerPlugin();
            if (!available) return;

            // Initial registration
            const char = api.getCurrentCharacter();
            const charKey = api.getCharacterKey();
            if (char && charKey) {
                const history = api.getChatHistory();
                const proactiveState = getProactiveConversationState(charKey);
                await registerWithServer(charKey, char, history, proactiveState);
            }

            // Poll every 60 s (browsers allow this even in background tabs)
            serverSyncHandle = setInterval(async () => {
                const currentChar = api.getCurrentCharacter();
                const currentKey  = api.getCharacterKey();
                if (!currentChar || !currentKey || !api.isTetheredMode()) return;

                const currentHistory = api.getChatHistory();
                const ps = getProactiveConversationState(currentKey);

                // Alternate between heartbeat (cheap) and poll (picks up messages)
                await heartbeatServer(currentKey, ps || {}, currentHistory);
                await pollServerPending();
            }, 60_000);

            // Immediate poll on tab re-focus
            document.addEventListener('visibilitychange', _onVisibilityChange);

            // First poll after a short delay
            setTimeout(() => pollServerPending().catch(() => {}), 3000);
        }

        // ============================================================
        // PUBLIC API
        // ============================================================

        return {
            getDateKeyLocal,
            getNowMinutes,
            isNowWithinMinutesWindow,
            syncProactiveStateWithHistory,
            markProactiveUserActivity,
            markProactiveCharacterActivity,
            startProactiveScheduler,
            stopProactiveScheduler,
            refreshProactiveInsights,
            triggerTestProactiveMessage,
            getProactiveInsightsSnapshot,
            // Server sync (called externally when character changes)
            detectServerPlugin,
            registerWithServer,
            pollServerPending
        };
    }

    window.EchoTextProactiveMessaging = { createProactiveMessaging };
})();
