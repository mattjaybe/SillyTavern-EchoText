// EchoText — Story Sync module
//
// Bridges the EchoText phone with the main SillyTavern roleplay:
//   • Story clock    — reads the scene header the RP model writes at the top of each
//                      reply ("[ 🕰️ Time 8:17 AM | 🗓️ Day 1 - Monday, October 28, 2024 AD | ... ]")
//                      and uses that in-story time for phone timestamps and {{time}}/{{date}}.
//   • Scene filter   — the phone character only receives RP scenes they were present for,
//                      based on the header's "👥 Present: ..." field.
//   • Phone → RP     — phone conversations are injected back into the main RP prompt at the
//                      exact point in the chat after which they happened.
//   • No GFX         — tells the main RP model not to draw phone screens itself.
//   • Per-chat phone — phone history is stored in the RP chat's metadata, so every RP chat
//                      (and every branch) has its own phone.
//
// Exposes: window.EchoTextStorySync = { createStorySync, pure }

(function () {
    'use strict';

    // ============================================================
    // CONSTANTS
    // ============================================================

    const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july',
        'august', 'september', 'october', 'november', 'december'];
    const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

    // Words that mean "nobody else is here" in the Present field
    const EMPTY_PRESENCE = new Set(['none', 'nobody', 'no one', 'noone', 'alone', 'n/a', 'na', '-', '—', '–',
        'никого', 'нет', 'один', 'одна']);

    const GREGORIAN_ERAS = new Set(['', 'ad', 'a.d.', 'ce', 'c.e.']);

    const META_KEY = 'echotext_story';
    const INJECT_PREFIX = 'echotext_phone_';
    const NOGFX_KEY = 'echotext_nogfx';
    const MINUTES_PER_DAY = 1440;

    // ============================================================
    // PURE HELPERS (no SillyTavern access — unit-testable)
    // ============================================================

    function stripEmoji(s) {
        return String(s || '')
            .replace(/[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}️‍⃣]/gu, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    /**
     * Finds the bracketed scene header in the first part of a message.
     * Tolerates one level of nested brackets (e.g. "[🌧️] Drizzle").
     * @returns {string|null} the text inside the outer brackets
     */
    function findHeaderText(text) {
        if (!text) return null;
        const head = String(text).slice(0, 2000);
        const re = /\[((?:[^[\]]|\[[^[\]]*\]){0,800}?(?:🕰|⏰|🕒|\bTime\b)(?:[^[\]]|\[[^[\]]*\]){0,800}?)\]/i;
        const m = head.match(re);
        return m ? m[1] : null;
    }

    function parseClock(seg) {
        const m = String(seg).match(/(\d{1,2})\s*[:.]\s*(\d{2})(?:\s*([AaPp])\.?\s*[Mm]\.?)?/);
        if (!m) return null;
        let h = parseInt(m[1], 10);
        const min = parseInt(m[2], 10);
        if (min > 59) return null;
        const ampm = m[3] ? m[3].toUpperCase() : null;
        if (ampm) {
            if (h < 1 || h > 12) return null;
            h = h % 12 + (ampm === 'P' ? 12 : 0);
        } else if (h > 23) {
            return null;
        }
        return { minutes: h * 60 + min, ampm: !!ampm };
    }

    function parseDateSegment(seg) {
        const out = {};
        const clean = stripEmoji(seg);

        const dayM = clean.match(/\bDay\s*#?\s*(\d+)/i);
        if (dayM) out.dayNum = parseInt(dayM[1], 10);

        const lower = clean.toLowerCase();
        const wd = WEEKDAYS.findIndex(w => new RegExp(`\\b${w}\\b`).test(lower));
        if (wd >= 0) out.weekdayIdx = wd;

        const monthAlt = MONTHS.join('|');
        // "October 28, 2024 AD"
        let m = clean.match(new RegExp(`\\b(${monthAlt})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s*,?\\s*(\\d{1,6})(?:\\s+([A-Za-z][A-Za-z.]{0,11}))?`, 'i'));
        if (m) {
            out.month = MONTHS.indexOf(m[1].toLowerCase());
            out.dom = parseInt(m[2], 10);
            out.year = parseInt(m[3], 10);
            out.era = m[4] ? m[4].trim() : '';
        } else {
            // "28 October 2024 AD"
            m = clean.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${monthAlt})\\s*,?\\s*(\\d{1,6})(?:\\s+([A-Za-z][A-Za-z.]{0,11}))?`, 'i'));
            if (m) {
                out.month = MONTHS.indexOf(m[2].toLowerCase());
                out.dom = parseInt(m[1], 10);
                out.year = parseInt(m[3], 10);
                out.era = m[4] ? m[4].trim() : '';
            }
        }
        out.gregorian = out.month != null && out.month >= 0 && out.dom >= 1 && out.dom <= 31
            && Number.isFinite(out.year) && GREGORIAN_ERAS.has(String(out.era || '').toLowerCase());

        // Human-readable date without the "Day N -" prefix
        out.dateRaw = clean.replace(/^\s*Day\s*#?\s*\d+\s*[-–—:]?\s*/i, '').trim();
        return out;
    }

    function parsePresent(seg) {
        let s = stripEmoji(seg).replace(/^\s*(present|with|people|characters|присутствуют|рядом)\s*:?\s*/i, '');
        s = s.replace(/\([^)]*\)/g, ' ');
        const parts = s.split(/\s*(?:,|;|\/|&|\+)\s*|\s+(?:and|и)\s+/i)
            .map(p => p.trim().replace(/[.!]+$/, ''))
            .filter(Boolean);
        return parts.filter(p => !EMPTY_PRESENCE.has(p.toLowerCase()));
    }

    /**
     * Parses a scene header out of a message.
     * @returns {object|null} { raw, minutes, ampm, dayNum, weekdayIdx, month, dom, year, era,
     *                          gregorian, dateRaw, location, weather, present[]|null }
     */
    function parseHeader(text) {
        const inner = findHeaderText(text);
        if (!inner) return null;
        const segments = inner.split('|').map(s => s.trim()).filter(Boolean);
        const h = { raw: `[ ${inner.trim()} ]`, present: null };

        for (const seg of segments) {
            if (h.minutes == null && /(🕰|⏰|🕒|\bTime\b)/i.test(seg)) {
                const c = parseClock(seg);
                if (c) Object.assign(h, c);
                // A segment may also hold the date ("Time 8:17 AM, Day 1 ...")
                if (/\bDay\s*#?\s*\d+/i.test(seg) && h.dayNum == null) Object.assign(h, parseDateSegment(seg));
            } else if (h.dateRaw == null && /(🗓|📅|📆|\bDay\s*#?\s*\d+)/i.test(seg)) {
                Object.assign(h, parseDateSegment(seg));
            } else if (h.location == null && /📍/.test(seg)) {
                h.location = stripEmoji(seg);
            } else if (h.present == null && /(👥|👤|\bPresent\b|\bWith\b\s*:)/i.test(seg)) {
                h.present = parsePresent(seg);
            } else if (h.weather == null && /(°|\b\d+\s*[FC]\b)/.test(seg)) {
                h.weather = seg.trim();
            }
        }

        if (h.minutes == null) {
            const c = parseClock(inner);
            if (c) Object.assign(h, c);
        }
        if (h.minutes == null) return null;
        return h;
    }

    function epochDay(year, month, dom) {
        const d = new Date(Date.UTC(2000, 0, 1));
        d.setUTCFullYear(year, month, dom);
        return Math.floor(d.getTime() / 86400000);
    }

    /**
     * Assigns an absolute story minute (header.abs) and day index (header.dayIndex).
     * Priority: explicit "Day N" → real calendar date → inferred from the previous header
     * (a time that goes backwards by more than an hour means the next day).
     */
    function computeAbs(h, prev) {
        if (!h || h.minutes == null) return null;
        let day;
        if (Number.isFinite(h.dayNum)) {
            day = h.dayNum;
        } else if (h.gregorian) {
            day = epochDay(h.year, h.month, h.dom);
        } else if (prev && Number.isFinite(prev.dayIndex)) {
            day = prev.dayIndex + (h.minutes < prev.minutes - 60 ? 1 : 0);
        } else {
            day = 0;
        }
        h.dayIndex = day;
        h.abs = day * MINUTES_PER_DAY + h.minutes;
        return h.abs;
    }

    function formatClock(minutes, use12h) {
        const m = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
        const hh = Math.floor(m / 60);
        const mm = String(m % 60).padStart(2, '0');
        if (!use12h) return `${String(hh).padStart(2, '0')}:${mm}`;
        const h12 = hh % 12 === 0 ? 12 : hh % 12;
        return `${h12}:${mm} ${hh < 12 ? 'AM' : 'PM'}`;
    }

    /**
     * Describes an absolute story minute relative to an anchor header (for date arithmetic).
     */
    function describeAbs(abs, anchor) {
        if (!Number.isFinite(abs) || !anchor || !Number.isFinite(anchor.abs)) return null;
        const dayIndex = Math.floor(abs / MINUTES_PER_DAY);
        const deltaDays = dayIndex - Math.floor(anchor.abs / MINUTES_PER_DAY);
        const time = formatClock(abs, anchor.ampm !== false);

        const dayNum = Number.isFinite(anchor.dayNum) ? anchor.dayNum + deltaDays : null;
        const weekday = Number.isFinite(anchor.weekdayIdx)
            ? cap(WEEKDAYS[(((anchor.weekdayIdx + deltaDays) % 7) + 7) % 7])
            : null;

        let date = null;
        if (anchor.gregorian) {
            const d = new Date(Date.UTC(2000, 0, 1));
            d.setUTCFullYear(anchor.year, anchor.month, anchor.dom + deltaDays);
            date = `${cap(MONTHS[d.getUTCMonth()])} ${d.getUTCDate()}, ${d.getUTCFullYear()}${anchor.era ? ' ' + anchor.era : ''}`;
        } else if (deltaDays === 0 && anchor.dateRaw) {
            // Fantasy calendar: we can't do arithmetic, but the same day keeps its label
            date = anchor.dateRaw.replace(new RegExp(`^\\s*(${WEEKDAYS.join('|')})\\s*,?\\s*`, 'i'), '');
        }

        const dayPart = [weekday, date].filter(Boolean).join(', ');
        const dateLine = [dayNum != null ? `Day ${dayNum}` : null, dayPart || null].filter(Boolean).join(' - ');
        return {
            time,
            weekday,
            date,
            dayNum,
            dateLine,
            full: dateLine ? `${time} | ${dateLine}` : time,
        };
    }

    function normName(s) {
        return stripEmoji(s).toLowerCase().replace(/[^\p{L}\p{N}\s'-]/gu, '').replace(/\s+/g, ' ').trim();
    }

    /**
     * Is `name` (a character card name) listed in the Present list?
     * Matches full names, first names, and "Mia" ↔ "Mia Thompson" in both directions.
     */
    function isNamePresent(presentList, name) {
        if (!Array.isArray(presentList) || !name) return false;
        const n = normName(name);
        if (!n) return false;
        const first = n.split(' ')[0];
        return presentList.some(p => {
            const q = normName(p);
            if (!q) return false;
            if (q === n || q === first) return true;
            if (n.startsWith(q + ' ')) return true;      // card "Mia Thompson", header "Mia"
            if (q.startsWith(first + ' ')) return true;  // card "Mia", header "Mia Thompson"
            return false;
        });
    }

    /**
     * Walks the ST chat and attaches the active scene header to every message.
     * Hidden (is_system) messages are skipped — they're not in the RP prompt either.
     */
    function buildTimeline(chat, strip) {
        const out = [];
        let scene = null;
        let prev = null;
        (Array.isArray(chat) ? chat : []).forEach((msg, index) => {
            if (!msg || msg.is_system) return;
            const raw = String(msg.mes || '');
            const text = strip ? strip(raw) : raw;
            const header = parseHeader(text);
            if (header) {
                computeAbs(header, prev);
                prev = header;
                scene = header;
            }
            out.push({ index, msg, text, isUser: !!msg.is_user, header, scene });
        });
        return out;
    }

    function presenceOf(entry, name) {
        const present = entry && entry.scene && entry.scene.present;
        if (!Array.isArray(present)) return null; // unknown: header missing or has no Present field
        return isNamePresent(present, name);
    }

    /**
     * Picks the RP messages a character witnessed, newest first until limits are hit,
     * and returns them oldest-first with gap markers where unwitnessed events were cut.
     */
    function selectWitnessed(timeline, charName, opts = {}) {
        const maxMessages = Math.max(1, opts.maxMessages || 20);
        const maxChars = Math.max(500, opts.maxChars || 16000);
        const includeUnknown = opts.unknownPolicy !== 'exclude';

        const picked = [];
        let chars = 0;
        for (let i = timeline.length - 1; i >= 0; i--) {
            const e = timeline[i];
            const pres = presenceOf(e, charName);
            const ok = pres === true || (pres === null && includeUnknown);
            if (!ok) continue;
            const len = e.text.length;
            if (picked.length > 0 && (picked.length >= maxMessages || chars + len > maxChars)) break;
            picked.push({ ...e, pos: i });
            chars += len;
        }
        picked.reverse();

        // Gap markers: true when witnessed entries are separated by skipped ones
        const items = [];
        for (let k = 0; k < picked.length; k++) {
            const prevPos = k === 0 ? null : picked[k - 1].pos;
            if (prevPos != null && picked[k].pos - prevPos > 1) items.push({ gap: true });
            items.push(picked[k]);
        }
        const lastPos = picked.length ? picked[picked.length - 1].pos : -1;
        const missedRecent = picked.length > 0 && lastPos < timeline.length - 1;
        return { items, missedRecent, count: picked.length };
    }

    // ============================================================
    // STATEFUL MODULE (needs SillyTavern)
    // ============================================================

    function createStorySync(api) {
        const s = () => api.getSettings();
        const ctx = () => SillyTavern.getContext();
        const injectedKeys = new Set();
        let boundHandler = null;
        let boundChatChanged = null;
        let boundEvents = [];

        function strip(text) {
            return api.stripThinkingTags ? api.stripThinkingTags(text) : String(text || '');
        }

        function isEnabled() {
            const st = s();
            return st.enabled !== false && st.storySyncEnabled === true;
        }

        function hasOpenChat() {
            try {
                const c = ctx();
                return !!(c.getCurrentChatId && c.getCurrentChatId());
            } catch (e) { return false; }
        }

        /** Story Sync drives the current phone panel (solo, tethered, RP chat open). */
        function isActive() {
            if (!isEnabled() || !hasOpenChat()) return false;
            if (api.isTetheredMode && !api.isTetheredMode()) return false;
            if (api.isGroupSession && api.isGroupSession()) return false;
            return true;
        }

        // ── Per-chat phone storage (chat metadata) ───────────────────────────

        function getStore(create) {
            const meta = ctx().chatMetadata;
            if (!meta) return null;
            if (!meta[META_KEY] || typeof meta[META_KEY] !== 'object') {
                if (!create) return null;
                meta[META_KEY] = { phone: {} };
            }
            if (!meta[META_KEY].phone || typeof meta[META_KEY].phone !== 'object') meta[META_KEY].phone = {};
            return meta[META_KEY];
        }

        function getHistory(key) {
            const store = getStore(false);
            const h = store && store.phone[key];
            return Array.isArray(h) ? h : [];
        }

        function saveMeta() {
            const c = ctx();
            if (typeof c.saveMetadataDebounced === 'function') c.saveMetadataDebounced();
            else if (typeof c.saveMetadata === 'function') c.saveMetadata();
        }

        function setHistory(key, history) {
            const store = getStore(true);
            if (!store) return;
            store.phone[key] = Array.isArray(history) ? history : [];
            saveMeta();
            refreshInjections();
        }

        // ── Clock ────────────────────────────────────────────────────────────

        // Parsing every message on each render would be slow in long RPs → memoize.
        // The cache key changes when messages are added/removed or the last one changes;
        // edits/swipes/deletes elsewhere invalidate it explicitly via events.
        let timelineCache = { key: null, value: null };
        function invalidateTimeline() { timelineCache = { key: null, value: null }; }
        function getTimeline() {
            const c = ctx();
            const chat = c.chat || [];
            const last = chat.length ? String((chat[chat.length - 1] || {}).mes || '') : '';
            const key = `${c.getCurrentChatId ? c.getCurrentChatId() : ''}|${chat.length}|${last.length}|${last.slice(-64)}`;
            if (timelineCache.key !== key) timelineCache = { key, value: buildTimeline(chat, strip) };
            return timelineCache.value;
        }

        function lastRpIndex(chat) {
            for (let i = chat.length - 1; i >= 0; i--) if (chat[i] && !chat[i].is_system) return i;
            return -1;
        }

        function getClock(timeline) {
            const tl = timeline || getTimeline();
            let latest = null;
            for (let i = tl.length - 1; i >= 0; i--) {
                if (tl[i].header && Number.isFinite(tl[i].header.abs)) { latest = tl[i]; break; }
            }
            if (!latest) return null;
            const anchor = latest.header;

            // Phone messages sent after that header keep the clock moving forward
            let phoneMax = -Infinity;
            const store = getStore(false);
            if (store) {
                for (const hist of Object.values(store.phone)) {
                    if (!Array.isArray(hist)) continue;
                    for (const m of hist) {
                        const st = m && m.story;
                        if (st && Number.isFinite(st.abs) && Number.isFinite(st.rp) && st.rp >= latest.index) {
                            phoneMax = Math.max(phoneMax, st.abs);
                        }
                    }
                }
            }
            const abs = Math.max(anchor.abs, phoneMax);
            return {
                abs,
                anchor,
                anchorIndex: latest.index,
                rpIndex: lastRpIndex(ctx().chat || []),
                info: describeAbs(abs, anchor),
            };
        }

        /** Story timestamp for a new phone message (advances the clock). */
        function stamp() {
            if (!isActive()) return null;
            const clock = getClock();
            if (!clock) return null;
            const step = Math.max(0, Number(s().storySyncMinutesPerMessage ?? 1));
            return { abs: clock.abs + step, rp: clock.rpIndex };
        }

        function formatStamp(story) {
            if (!story || !Number.isFinite(story.abs)) return null;
            const clock = getClock();
            if (!clock) return null;
            const info = describeAbs(story.abs, clock.anchor);
            return info ? { time: info.time, tooltip: `Story time: ${info.full}` } : null;
        }

        /** Values for {{time}} / {{date}} / {{weekday}} while Story Sync is active. */
        function getMacroValues() {
            if (!isActive()) return null;
            const clock = getClock();
            if (!clock || !clock.info) return null;
            const i = clock.info;
            return {
                time: i.time,
                date: i.date || i.dateLine || '',
                weekday: i.weekday || '',
            };
        }

        // ── RP → phone ───────────────────────────────────────────────────────

        function buildPhoneContextBlock(char) {
            if (!isActive() || !char) return '';
            const st = s();
            const charName = char.name || 'Character';
            const userName = api.getUserName ? api.getUserName() : 'User';
            const rpCharName = (() => {
                const c = ctx();
                return (c.characters && c.characters[c.characterId] && c.characters[c.characterId].name) || c.name2 || 'Character';
            })();

            const timeline = getTimeline();
            const clock = getClock(timeline);
            const sel = selectWitnessed(timeline, charName, {
                maxMessages: Number(st.storySyncScenes) || 20,
                maxChars: Number(st.storySyncMaxChars) || 16000,
                unknownPolicy: st.storySyncUnknownPresence || 'include',
            });

            let out = '';
            if (sel.count > 0) {
                const lines = sel.items.map(it => {
                    if (it.gap) return `[— time passes; events ${charName} did not witness are omitted —]`;
                    const speaker = it.isUser ? userName : (it.msg.name || rpCharName);
                    return `${speaker}: ${it.text}`;
                });
                if (sel.missedRecent) lines.push(`[— more events happened after this that ${charName} did not witness —]`);
                out += `\n\n<story_so_far>\nThis is the in-person roleplay so far, limited to scenes ${charName} personally witnessed (oldest first). ${charName} remembers these events from their own point of view and believes what they saw and heard, even if someone lied to them. Anything not shown here ${charName} does not know, unless ${userName} tells them by text. Never reference omitted events.\n\n${lines.join('\n\n')}\n</story_so_far>`;
            }

            if (clock && clock.info) {
                const latest = timeline.length ? timeline[timeline.length - 1] : null;
                const presentNow = latest ? presenceOf(latest, charName) : null;
                const parts = [`Current story time: ${clock.info.full}.`,
                    `${charName} and ${userName} are texting each other by phone right now. Message timestamps follow story time, not real-world time.`];
                if (presentNow === true) {
                    parts.push(`${charName} was with ${userName} in person in the most recent scene${latest.scene && latest.scene.location ? ` (${latest.scene.location})` : ''}.`);
                } else if (presentNow === false) {
                    parts.push(`${charName} is not with ${userName} at the moment and does not know where ${userName} is or what they are doing unless ${userName} says so.`);
                }
                out += `\n\n<current_moment>\n${parts.join('\n')}\n</current_moment>`;
            }
            return out;
        }

        // ── Phone → RP ───────────────────────────────────────────────────────

        function getContactName(key) {
            try {
                const chars = ctx().characters || [];
                const c = chars.find(x => x && (x.avatar === key || x.name === key));
                if (c && c.name) return c.name;
            } catch (e) { /* ignore */ }
            return String(key || 'Contact').replace(/\.[^/.]+$/, '');
        }

        function phoneMessageText(m) {
            let t = strip(m.mes || '').trim();
            const hasImage = m.imageAttachment && m.imageAttachment.status === 'ready';
            if (hasImage) t = t ? `${t} *[sent a photo]*` : '*[sent a photo]*';
            return t;
        }

        function clearInjections() {
            const c = ctx();
            if (typeof c.setExtensionPrompt !== 'function') return;
            for (const key of injectedKeys) c.setExtensionPrompt(key, '', 1, 0);
            injectedKeys.clear();
        }

        function refreshInjections() {
            try {
                const c = ctx();
                if (typeof c.setExtensionPrompt !== 'function') return;
                clearInjections();
                if (!isEnabled() || !hasOpenChat()) return;
                const st = s();
                const IN_CHAT = (c.extension_prompt_types && c.extension_prompt_types.IN_CHAT) ?? 1;
                const SYSTEM = (c.extension_prompt_roles && c.extension_prompt_roles.SYSTEM) ?? 0;
                const chat = c.chat || [];
                const userName = api.getUserName ? api.getUserName() : 'User';

                if (st.storySyncNoGfx !== false) {
                    c.setExtensionPrompt(NOGFX_KEY,
                        `[OOC: Text messages and phone chats happen in a separate phone app and are added to the story as "📱 Phone" blocks. Do NOT draw phone screens, chat interfaces, HTML/GFX, or write out the contents of text messages yourself. You may narrate characters glancing at, typing on, or hearing a phone buzz. Treat 📱 Phone blocks as events that really happened at that point in the story, and keep the scene header time consistent with them.]`,
                        IN_CHAT, 1, false, SYSTEM);
                    injectedKeys.add(NOGFX_KEY);
                }

                if (st.storySyncInjectPhone === false) return;
                const store = getStore(false);
                if (!store) return;
                const last = lastRpIndex(chat);
                if (last < 0) return;

                // Collect stamped phone messages from every contact in this chat
                const all = [];
                for (const [key, hist] of Object.entries(store.phone)) {
                    if (!Array.isArray(hist)) continue;
                    const name = getContactName(key);
                    hist.forEach((m, order) => {
                        if (!m || !m.story || !Number.isFinite(m.story.rp)) return;
                        const text = phoneMessageText(m);
                        if (!text) return;
                        all.push({ key, name, m, order, text, abs: m.story.abs, rp: Math.min(m.story.rp, last) });
                    });
                }
                if (!all.length) return;
                all.sort((a, b) => (a.abs - b.abs) || (a.order - b.order));
                const limit = Math.max(1, Number(st.storySyncPhoneMessages) || 30);
                const recent = all.slice(-limit);

                // Group by the RP message each exchange happened after
                const groups = new Map();
                for (const e of recent) {
                    if (!groups.has(e.rp)) groups.set(e.rp, []);
                    groups.get(e.rp).push(e);
                }
                const clock = getClock();
                const anchors = [...groups.keys()].sort((a, b) => a - b);
                const fmt = (abs) => {
                    const info = clock ? describeAbs(abs, clock.anchor) : null;
                    return info ? info.time : null;
                };

                anchors.forEach((anchor, gi) => {
                    const entries = groups.get(anchor);
                    let depth = 0;
                    for (let i = anchor + 1; i < chat.length; i++) if (chat[i] && !chat[i].is_system) depth++;

                    const byContact = new Map();
                    for (const e of entries) {
                        if (!byContact.has(e.key)) byContact.set(e.key, []);
                        byContact.get(e.key).push(e);
                    }
                    const blocks = [];
                    for (const list of byContact.values()) {
                        const name = list[0].name;
                        const t0 = fmt(list[0].abs);
                        const t1 = fmt(list[list.length - 1].abs);
                        const range = t0 ? (t0 === t1 ? `, ${t0}` : `, ${t0}–${t1}`) : '';
                        const lines = list.map(e => `${e.m.is_user ? userName : name}: ${e.text}`);
                        blocks.push(`[📱 Phone — text messages between ${userName} and ${name}${range}]\n${lines.join('\n')}`);
                    }
                    const isLatest = gi === anchors.length - 1;
                    const lastTime = fmt(entries[entries.length - 1].abs);
                    const tail = isLatest && lastTime
                        ? `[📱 End of phone messages. The latest phone activity ended at ${lastTime}; continue the story timeline from there or later.]`
                        : '[📱 End of phone messages.]';
                    const key = INJECT_PREFIX + String(anchor).padStart(6, '0');
                    c.setExtensionPrompt(key, `${blocks.join('\n\n')}\n${tail}`, IN_CHAT, depth, false, SYSTEM);
                    injectedKeys.add(key);
                });
            } catch (e) {
                if (api.warn) api.warn('Story Sync: failed to refresh phone injections', e);
            }
        }

        // ── Events ───────────────────────────────────────────────────────────

        function bindEvents() {
            const c = ctx();
            if (!c.eventSource || !c.event_types) return;
            unbindEvents();
            boundHandler = () => { invalidateTimeline(); refreshInjections(); updateStatusUi(); };
            boundChatChanged = () => {
                invalidateTimeline();
                refreshInjections();
                updateStatusUi();
                if (api.onChatChanged) api.onChatChanged();
            };
            const T = c.event_types;
            const names = [T.MESSAGE_SENT, T.MESSAGE_RECEIVED, T.MESSAGE_DELETED, T.MESSAGE_SWIPED,
                T.MESSAGE_EDITED, T.MESSAGE_UPDATED, T.GENERATION_AFTER_COMMANDS].filter(Boolean);
            for (const n of names) { c.eventSource.on(n, boundHandler); boundEvents.push([n, boundHandler]); }
            if (T.CHAT_CHANGED) { c.eventSource.on(T.CHAT_CHANGED, boundChatChanged); boundEvents.push([T.CHAT_CHANGED, boundChatChanged]); }
        }

        function unbindEvents() {
            const c = ctx();
            if (!c.eventSource) return;
            for (const [n, fn] of boundEvents) {
                if (typeof c.eventSource.removeListener === 'function') c.eventSource.removeListener(n, fn);
                else if (typeof c.eventSource.off === 'function') c.eventSource.off(n, fn);
            }
            boundEvents = [];
        }

        // ── Settings UI (extensions drawer) ──────────────────────────────────

        function updateStatusUi() {
            const el = jQuery('#et_ss_status');
            if (!el.length) return;
            if (!hasOpenChat()) { el.text('No RP chat open.'); return; }
            const timeline = getTimeline();
            const clock = getClock(timeline);
            if (!clock) {
                el.text('No scene header found in this chat yet.');
                return;
            }
            const anchor = clock.anchor;
            const present = Array.isArray(anchor.present)
                ? (anchor.present.length ? anchor.present.join(', ') : '(nobody listed)')
                : 'no 👥 Present field';
            el.text(`Story time: ${clock.info ? clock.info.full : '?'}\nLast header present: ${present}`);
        }

        function syncSettingsUi() {
            const st = s();
            jQuery('#et_ss_enabled').prop('checked', st.storySyncEnabled === true);
            jQuery('#et_ss_scenes').val(st.storySyncScenes ?? 20);
            jQuery('#et_ss_maxchars').val(st.storySyncMaxChars ?? 16000);
            jQuery('#et_ss_unknown').val(st.storySyncUnknownPresence || 'include');
            jQuery('#et_ss_step').val(st.storySyncMinutesPerMessage ?? 1);
            jQuery('#et_ss_inject').prop('checked', st.storySyncInjectPhone !== false);
            jQuery('#et_ss_inject_count').val(st.storySyncPhoneMessages ?? 30);
            jQuery('#et_ss_nogfx').prop('checked', st.storySyncNoGfx !== false);
            updateStatusUi();
        }

        function bindSettingsUi() {
            const save = () => { api.saveSettings(); refreshInjections(); updateStatusUi(); if (api.onSettingsChanged) api.onSettingsChanged(); };
            const num = (sel, key, min, max, def) => {
                jQuery(document).off(`change.etss-${key}`).on(`change.etss-${key}`, sel, function () {
                    let v = parseInt(jQuery(this).val(), 10);
                    if (!Number.isFinite(v)) v = def;
                    v = Math.max(min, Math.min(max, v));
                    jQuery(this).val(v);
                    s()[key] = v;
                    save();
                });
            };
            const bool = (sel, key) => {
                jQuery(document).off(`change.etss-${key}`).on(`change.etss-${key}`, sel, function () {
                    s()[key] = jQuery(this).is(':checked');
                    save();
                });
            };
            bool('#et_ss_enabled', 'storySyncEnabled');
            bool('#et_ss_inject', 'storySyncInjectPhone');
            bool('#et_ss_nogfx', 'storySyncNoGfx');
            num('#et_ss_scenes', 'storySyncScenes', 1, 500, 20);
            num('#et_ss_maxchars', 'storySyncMaxChars', 500, 200000, 16000);
            num('#et_ss_step', 'storySyncMinutesPerMessage', 0, 120, 1);
            num('#et_ss_inject_count', 'storySyncPhoneMessages', 1, 500, 30);
            jQuery(document).off('change.etss-unknown').on('change.etss-unknown', '#et_ss_unknown', function () {
                s().storySyncUnknownPresence = jQuery(this).val() === 'exclude' ? 'exclude' : 'include';
                save();
            });
            jQuery(document).off('click.etss-refresh').on('click.etss-refresh', '#et_ss_refresh', () => { invalidateTimeline(); refreshInjections(); updateStatusUi(); });
            syncSettingsUi();
        }

        return {
            isEnabled,
            isActive,
            getHistory,
            setHistory,
            stamp,
            formatStamp,
            getMacroValues,
            buildPhoneContextBlock,
            refreshInjections,
            clearInjections,
            bindEvents,
            unbindEvents,
            bindSettingsUi,
            syncSettingsUi,
            getClock,
        };
    }

    window.EchoTextStorySync = {
        createStorySync,
        pure: { parseHeader, computeAbs, describeAbs, isNamePresent, buildTimeline, selectWitnessed, parsePresent, formatClock },
    };
})();
