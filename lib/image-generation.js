(function () {
    'use strict';

    // ── Affirmative reply patterns ──────────────────────────────────────────────
    const AFFIRMATIVE_PATTERNS = [
        /^(yes|yeah|yep|yup|sure|definitely|absolutely|ok|okay|please do|go ahead|show me|i'?d love to|do it|send it|of course|alright|sounds good|yes please)\b/i,
        /\b(show me|please do|go ahead|send it|i want to see|let me see|yes please|send that|i'd love that|go on then|do it|please send)\b/i
    ];

    // ── Character offer patterns: BOTH a verb AND a media noun must appear ────
    const OFFER_VERB_PATTERNS = [
        /\b(want to see|wanna see|should i send|should i show|can i send|let me send|i can send|i could send|care to see|i'?ll send|want me to send|let me show|i'?ll show|here'?s a|here is a|i'?ve got a|i have a)\b/i
    ];
    const OFFER_MEDIA_PATTERNS = [
        /\b(photo|picture|selfie|image|drawing|sketch|portrait|pic|snapshot|snap|shot)\b/i
    ];

    // ── Direct user request patterns ──────────────────────────────────────────
    // Ordered from most specific → least specific to minimise false positives.
    // Every pattern requires BOTH a request verb AND an image/visual noun (or strong
    // visual context) so generic phrases like "show me how" never fire.
    const DIRECT_REQUEST_PATTERNS = [
        // ── Send / show / share + explicit media noun ─────────────────────────
        // "send me a selfie of you wearing a dress" / "show me a photo of you sleeping"
        /\b(send me|show me|can you send|could you send|let me see|i'?d love to see|share)\b.{0,80}\b(selfie|photo|picture|image|drawing|portrait|art|comic|sketch|pic|snapshot|hentai|cg|render|illustration|artwork)\b/i,
        // "send a selfie", "send me a pic"
        /\bsend (a |me a |some )?(selfie|photo|pic|picture|snap|image|hentai|cg|render|comic|illustration|artwork|drawing|sketch)\b/i,
        // "can you show me a photo / can I see a pic"
        /\b(can|could)\s+(you|i)\s+(show|see|get|have)\b.{0,30}\b(selfie|photo|pic|picture|snap|image|drawing|sketch|hentai|cg|render|comic|illustration|artwork)\b/i,

        // ── Take / snap ───────────────────────────────────────────────────────
        // "take a selfie", "snap a photo for me"
        /\btake (a |me a )?(selfie|photo|pic|picture|snap)\b/i,
        /\bsnap (a |me a )?(photo|pic|picture|selfie|shot)\b/i,

        // ── Draw / sketch / paint / illustrate ───────────────────────────────
        // "draw me a picture of a cat with a hat" / "paint me a portrait"
        /\b(draw|sketch|paint|illustrate)\s+(me\s+)?(a\s+|some\s+)?(picture|photo|image|drawing|sketch|portrait|comic|artwork|illustration|hentai|cg|render)\b/i,
        // "draw/sketch me" (simple imperative) — negative lookahead prevents "draw me in(to)"
        /\b(draw|sketch|paint|illustrate)\s+me(?!\s+in(to)?\b)/i,
        // "draw yourself", "sketch yourself for me"
        /\b(draw|sketch|paint|illustrate)\s+(yourself|us|something)\b/i,

        // ── Make / create / generate ──────────────────────────────────────────
        // "make me a photo/drawing of you at the beach"
        /\b(make|create|generate)\s+(me\s+)?(a\s+|some\s+)?(photo|pic|picture|image|drawing|sketch|portrait|artwork|illustration|selfie|hentai|cg|render|comic)\b/i,

        // ── Show me you / your appearance ────────────────────────────────────
        // "show me you wearing that dress" / "show me your outfit"
        /\bshow me\b.{0,50}\b(you|your)\b.{0,40}\b(wearing|dressed|outfit|in a|looking|with your)\b/i,
        // "show me what you look like" / "show me how you look"
        /\bshow me (what |how )you (look|appear)\b/i,
        /\bwhat do you look like\b/i,

        // ── I want to see / I'd love to see ──────────────────────────────────
        // "I want to see a photo of you" / "I want to see what you're wearing"
        /\bi want (a |some |to see a |to see some )?(photo|pic|picture|selfie|image|hentai|cg|render|illustration|artwork|drawing|sketch|comic) of you\b/i,
        /\bi'?d (love|like) to see\b.{0,50}\b(you|your|a photo|a pic|a picture|a selfie|a drawing|some hentai|a cg|a render|an illustration|an artwork|a comic|a sketch)\b/i,
        /\bi want to see (you|what you)\b/i,

        // ── Got any / any photos ─────────────────────────────────────────────
        /\bgot any (photos?|pics?|pictures?|selfies?|hentai|cgs?|renders?|illustrations?|artworks?|comics?|sketches?|drawings?)\b/i,
        /\bany (photos?|pics?|pictures?|selfies?|hentai|cgs?|renders?|illustrations?|artworks?|comics?|sketches?|drawings?) of you\b/i,

        // ── Snap / shot of you ────────────────────────────────────────────────
        /\b(snap|shot|pic|photo|picture|hentai|cg|render|illustration|artwork|comic|drawing|sketch)\s+of\s+(you|yourself)\b/i,

        // ── Capture / photograph ──────────────────────────────────────────────
        /\b(capture|photograph)\s+(yourself|a photo|a pic|a moment)\b/i,
    ];

    // ── Visual keyword scoring for extracting appearance sentences ────────────
    const VISUAL_KEYWORDS = [
        'hair', 'eyes', 'eye', 'skin', 'tall', 'short', 'slim', 'build',
        'wearing', 'wears', 'outfit', 'clothes', 'face', 'appearance',
        'looks', 'features', 'figure', 'body', 'complexion', 'style',
        'blonde', 'brunette', 'redhead', 'curly', 'straight', 'wavy',
        'blue', 'green', 'brown', 'hazel', 'grey', 'dark', 'light',
        'petite', 'athletic', 'slender', 'muscular', 'freckles', 'tattoo',
        'height', 'weight', 'lips', 'cheeks', 'jaw', 'nose', 'forehead',
        'shoulder', 'chest', 'hips', 'legs', 'arms', 'hands', 'fingers'
    ];

    function createImageGeneration(api) {
        const {
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
        } = api;

        const requestQueue = [];
        let activeRequest = null;

        function settings() {
            return getSettings();
        }

        function normalizeText(text) {
            return String(text || '').trim().toLowerCase();
        }

        // ── Extract appearance-related sentences from a character card ────────
        //
        // Handles three input styles found in ST character cards:
        //   1. W++ / square-bracket tag format: [Name's body= "pink hair", "amber eyes"]
        //      → extracted as flat comma-separated SD tags prepended to the result.
        //   2. Plain prose appearance descriptions.
        //   3. Example dialogue / roleplay blocks ({{char}}:, *action*, <START>, etc.)
        //      → stripped and excluded entirely from the SD prompt.
        function extractVisualDescription(char) {
            if (!char) return '';

            const rawText = [char.description, char.personality]
                .filter(Boolean)
                .join('\n');
            if (!rawText) return '';

            // ── Step 1: Extract W++ / structured tag values FIRST ─────────────
            // Matches: [Label= "tag1", "tag2", ...] or [Label: "tag1", "tag2"]
            const wppTags = [];
            const wppTagRegex = /\[[^\]=:]+[=:]\s*((?:"[^"]*"\s*,?\s*)+)\]/g;
            let wppMatch;
            while ((wppMatch = wppTagRegex.exec(rawText)) !== null) {
                const quotedValues = wppMatch[1].match(/"([^"]*)"/g) || [];
                quotedValues.forEach(v => {
                    const tag = v.replace(/"/g, '').trim();
                    if (tag) wppTags.push(tag);
                });
            }

            // ── Step 2: Sanitize before sentence scoring ──────────────────────
            let sanitized = rawText;

            // Remove W++ bracket blocks (already extracted above)
            sanitized = sanitized.replace(/\[[^\]]*[=:][^\]]*\]/g, ' ');

            // Remove SillyTavern example dialogue markers
            sanitized = sanitized.replace(/<START>|<END>/gi, ' ');

            // Remove {{macro}} placeholders: {{char}}, {{user}}, {{char_name}}, etc.
            sanitized = sanitized.replace(/\{\{[^}]+\}\}/g, ' ');

            // Remove dialogue attribution prefixes at line start: "CharName: "
            sanitized = sanitized.replace(/^[A-Za-z][A-Za-z0-9 _'-]{0,30}:\s*/gm, ' ');

            // Remove roleplay action text in asterisks: *Seraphina smiles warmly*
            sanitized = sanitized.replace(/\*[^*]+\*/g, ' ');

            // Remove remaining bare square-bracket stage directions / OOC notes
            sanitized = sanitized.replace(/\[[^\]]{0,120}\]/g, ' ');

            // Collapse whitespace artifacts
            sanitized = sanitized.replace(/\s{2,}/g, ' ').trim();

            // ── Step 3: Score remaining sentences for visual relevance ─────────
            const sentences = sanitized
                .split(/[.!?\n]+/)
                .map(s => s.trim())
                .filter(s => s.length > 8);

            const scored = sentences.map(s => {
                const lower = s.toLowerCase();
                const hits = VISUAL_KEYWORDS.filter(kw => lower.includes(kw)).length;
                return { s, hits };
            });

            const visualSentences = scored
                .filter(x => x.hits > 0)
                .sort((a, b) => b.hits - a.hits)
                .slice(0, 3)
                .map(x => x.s);

            const prosePart = visualSentences.length > 0
                ? visualSentences.join('. ')
                : sentences.slice(0, 2).join('. ');

            // ── Step 4: Combine W++ tags + prose ─────────────────────────────
            if (wppTags.length > 0) {
                const tagStr = wppTags.join(', ');
                return prosePart && prosePart.length > 8
                    ? `${tagStr}, ${prosePart}`
                    : tagStr;
            }

            return prosePart;
        }

        // ── LLM-assisted directive extraction ────────────────────────────────
        //
        // Detects whether the user's image request requires conversational context
        // to resolve — i.e. it contains a vague pronoun or appearance reference that
        // points back at something the character said rather than providing explicit
        // creative direction.
        //
        // When true, buildImagePrompt will make a lightweight LLM pre-call to
        // resolve the reference before building the SD prompt.
        // When false, the request has sufficient explicit direction and the legacy
        // regex path is used directly with zero added latency.
        function needsContextResolution(userMessage) {
            if (!userMessage) return false;
            const msg = String(userMessage).toLowerCase();

            // Explicit creative direction — the user said exactly what they want.
            // No need to look back into the chat for additional context.
            const EXPLICIT_DIRECTION_PATTERNS = [
                /\b(wearing|dressed in|in a|in an)\b.{4,}/i,    // "wearing a red dress"
                /\bat (the|a)\b.{3,}/i,                          // "at the beach"
                /\b(with|holding|sitting|standing|lying|posing|smiling|looking)\b.{4,}/i,
            ];
            // Only skip LLM if the remaining text (after trigger stripping) looks explicit.
            const rawDirective = extractUserVisualDirectives(userMessage, null);
            if (rawDirective && rawDirective.length > 12 &&
                EXPLICIT_DIRECTION_PATTERNS.some(p => p.test(rawDirective))) {
                return false;
            }

            // Demonstrative / pronoun references — point back at something in chat
            if (/\b(that|this|it|those|these)\b/i.test(msg) &&
                /\b(show|send|photo|pic|picture|selfie|image|drawing|sketch)\b/i.test(msg)) {
                return true;
            }

            // Appearance/outfit references — character must have described it recently
            if (/\bwhat (you'?re|you are|you'?ve|you have) (wearing|got on|dressed in)\b/i.test(msg)) return true;
            if (/\bwhat you look like\b/i.test(msg)) return true;
            if (/\byour (current |today'?s? )?(outfit|attire|look|clothes|clothing|style|ensemble)\b/i.test(msg)) return true;
            if (/\bhow you (look|are dressed)\b/i.test(msg)) return true;

            // Empty directive after stripping — no explicit direction given at all
            if (!rawDirective || rawDirective.length < 4) return true;

            return false;
        }

        // ── LLM pre-call to resolve image directives from conversational context ──
        //
        // Called only when needsContextResolution() returns true.
        // Asks the configured LLM to extract a structured JSON payload from the
        // user's message + recent chat history, returning:
        //   { directives, scene, isCreative }
        //
        // Returns null on any failure — callers must fall back to the legacy path.
        async function extractImageDirectivesViaLLM(userMessage, chatHistory, charName, signal) {
            if (!requestEchoTextCompletion) return null;

            try {
                const recentMessages = (Array.isArray(chatHistory) ? chatHistory : [])
                    .slice(-6)
                    .map(msg => `${msg.is_user ? 'User' : charName}: ${String(msg.mes || '').trim()}`)
                    .join('\n');

                const systemPrompt =
`You extract Stable Diffusion image prompt components from a user's image request and its conversational context.
Output ONLY a raw JSON object — no markdown, no explanation, no code fences.

Fields:
- "directives": Concrete visual description of what to show. If the user references something from the conversation ("that", "what you're wearing", "the thing you described"), resolve it to the actual concrete description from the chat. Keep it concise — comma-separated tags or a short phrase. Empty string if none.
- "scene": Shot type or setting only (e.g. "selfie", "full body shot", "at a café", "mirror selfie"). Empty string if none stated or implied.
- "mode": One of three values:
  - "character" — the user wants a photo/image featuring ${charName} (selfies, appearance shots, outfit photos, anything where ${charName} is the subject).
  - "object" — the user wants a photo/image of something that is NOT ${charName} (a rug, a scene, an object, a place described in conversation).
  - "creative" — the user wants a drawn/painted/illustrated work of art (cartoons, paintings, sketches, illustrations — any creative art medium).

Examples:
{"directives":"royal blue regalia, gold embroidery, flowing cape","scene":"selfie","mode":"character"}
{"directives":"rug with gradient of lavender and pale green, like a field of flowers after rain","scene":"photo","mode":"object"}
{"directives":"cartoon cat with a hat","scene":"","mode":"creative"}
{"directives":"","scene":"selfie","mode":"character"}
{"directives":"city skyline at night, neon reflections on wet pavement","scene":"wide shot","mode":"object"}`;

                const userContent =
`Recent conversation:
${recentMessages}

User's image request: "${userMessage}"

Output JSON only.`;

                const apiMessages = [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userContent }
                ];

                // rawPrompt / systemPrompt strings are needed for the 'default' ST source,
                // which uses generateRaw rather than the messages array.
                const rawPrompt = `${userContent}\n\nRespond with JSON only.`;

                const raw = await requestEchoTextCompletion({
                    apiMessages,
                    rawPrompt,
                    systemPrompt,
                    prefillPrefix: '',
                    signal
                });

                if (!raw || typeof raw !== 'string') return null;

                // Extract the first JSON object from the response (handles models that
                // wrap with commentary despite the instruction).
                const jsonMatch = raw.match(/\{[\s\S]*?\}/);
                if (!jsonMatch) {
                    warn('[EchoText] LLM image extraction: no JSON found in response:', raw.slice(0, 120));
                    return null;
                }

                const parsed = JSON.parse(jsonMatch[0]);

                // Validate required fields exist
                if (typeof parsed.directives !== 'string' || typeof parsed.mode !== 'string') {
                    warn('[EchoText] LLM image extraction: unexpected JSON shape:', parsed);
                    return null;
                }

                log('[EchoText] LLM image extraction result:', parsed);
                return parsed;

            } catch (err) {
                if (err?.name === 'AbortError') throw err; // let abort propagate
                warn('[EchoText] LLM image extraction failed, falling back to legacy path:', err?.message || err);
                return null;
            }
        }

        // ── Legacy regex-based directive extraction (fallback path) ───────────
        // Used when needsContextResolution() returns false (explicit direction given,
        // no LLM call needed) or when extractImageDirectivesViaLLM() returns null
        // (LLM call failed or model returned unusable output).
        //
        // Extract the user's specific visual/style directives ───────────────
        // Strips the image-request trigger words AND leading character name greetings,
        // then returns whatever genuine creative direction the user specified:
        // outfits, aesthetics, poses, settings, etc.
        //
        // Returns '' if the message was purely a trigger phrase with no extra direction.
        //
        // @param {string} userMessage - raw user message
        // @param {string} [charName]  - character name for greeting stripping
        function extractUserVisualDirectives(userMessage, charName) {
            if (!userMessage) return '';

            let text = userMessage.trim();

            // Strip leading politeness/modal verbs
            text = text.replace(/^(can you|could you|please|will you|would you)\s+/i, '');

            // Strip leading character name greetings: "Hey Ava, " / "Hi Ava!" / "Ava, "
            // This must happen BEFORE trigger-phrase stripping so the regexes match at position 0.
            if (charName) {
                const escapedName = charName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                // "Hey/Hi/Hello [Name][,!. ]..."
                text = text.replace(new RegExp(`^(?:hey|hi|hello)\\s+${escapedName}\\s*[,!.\\s]+`, 'i'), '').trim();
                // "[Name][, ]..." (bare name at start)
                text = text.replace(new RegExp(`^${escapedName}\\s*[,!]\\s*`, 'i'), '').trim();
            }
            // Generic greeting strip for any name: "Hey [word]," — catches cases where charName wasn't passed
            text = text.replace(/^(?:hey|hi|hello)\s+\w+\s*[,!\s]+/i, '').trim();

            // Strip the image-request trigger phrase from the start
            text = text
                // "send me/show me/share a selfie/photo..." — with optional detail after
                .replace(/^(send me|show me|send|show|share)\s+(me\s+)?(an?\s+)?((?:[\w-]+\s+){0,3})(selfie|photo|picture|pic|image|drawing|sketch|portrait|snap|snapshot|comic|artwork|illustration|hentai|cg|render)\s*(photo|pic|of me|for me|of\s*)?\s*[,.]?\s*/i, '$4')
                // "take a / snap a selfie/photo"
                .replace(/^(take|snap)\s+(me\s+)?(an?\s+)?((?:[\w-]+\s+){0,3})(selfie|photo|picture|pic|snap|shot)\s*(of\s*)?\s*[,.]?\s*/i, '$4')
                // "draw/sketch/paint me a picture of..." — strip everything up to "of"
                .replace(/^(draw|sketch|paint|illustrate)\s+(me\s+)?(an?\s+)?((?:[\w-]+\s+){0,3})(picture|photo|image|drawing|sketch|portrait|comic|artwork|illustration|hentai|cg|render)\s*(of\s*)?/i, '$4')
                // "draw/sketch me" simple form
                .replace(/^(draw|sketch|paint|illustrate)\s+(me|us|yourself)\s*[,.]?\s*/i, '')
                // "make/create/generate me a photo of..."
                .replace(/^(make|create|generate)\s+(me\s+)?(an?\s+)?((?:[\w-]+\s+){0,3})(photo|pic|picture|image|drawing|sketch|portrait|artwork|illustration|selfie|comic|hentai|cg|render)\s*(of\s*)?/i, '$4')
                // "got any / any photos/selfies of you"
                .replace(/^(got any|any)\s+(photos?|pics?|pictures?|selfies?)\s*(of you)?\s*[?]?\s*/i, '')
                // "I'd love to see / I want to see (you / a photo)"
                .replace(/^i'?d (love|like) to see\s+(you\s+|a photo\s+|a pic\s+|a picture\s+|a selfie\s+)?/i, '')
                .replace(/^i want to see\s+(you\s+|what you\s+)?/i, '')
                // "capture/photograph yourself"
                .replace(/^(capture|photograph)\s+(yourself|a photo|a pic)\s*(of\s*)?/i, '')
                .trim();

            // Strip any leading punctuation BEFORE connector stripping
            text = text.replace(/^[?!,.\s]+/, '').trim();

            // Strip leading connectors — also re-applied after the ? fallback below
            const stripConnectors = t => t
                .replace(/^(the one where|where you|of you|with you|you'?re|you are|that shows?|showing|of yourself|yourself)\s+/i, '')
                // Strip "you [verb]ing" subject phrases: "of you sleeping", "you wearing..."
                .replace(/^you\s+(sleeping|wearing|sitting|standing|lying|lying down|laying|dancing|reading|laughing|smiling|working|playing|eating|drinking|relaxing|posing|looking)\b\s*/i, '$1 ')
                .trim();

            text = stripConnectors(text);

            // If stripping left nothing meaningful, try text after the first question mark
            if (text.length < 8) {
                const qIdx = userMessage.indexOf('?');
                if (qIdx !== -1 && qIdx < userMessage.length - 10) {
                    text = stripConnectors(userMessage.slice(qIdx + 1).trim());
                } else {
                    return '';
                }
            }

            // Strip any remaining leading punctuation and trailing punctuation
            text = text.replace(/^[?!,.\s]+/, '').trim();
            text = text.replace(/[?!.]+$/, '').trim();

            // Bail if all that remains is just a bare media noun (no creative content)
            if (/^(photos?|pics?|pictures?|selfies?|images?|snapshots?)$/i.test(text)) return '';

            // Bail if too short or basically unchanged from the original.
            // FIX: Normalize BOTH sides (strip trailing punctuation) before comparing,
            // so "send me a selfie!" doesn't slip through just because the "!" was stripped from text.
            const normalizedUser = userMessage.trim().replace(/[?!.,\s]+$/, '').toLowerCase();
            if (text.length < 8 || text.toLowerCase() === normalizedUser) {
                return '';
            }

            // Bail if all that remains is a bare contextual reference to the character's current
            // appearance — these must be resolved from chat history by resolveContextualDirectives,
            // not passed through as literal SD tags (e.g. "what you're wearing" in the prompt).
            if (/^what (you'?re|you are|you'?ve|you have) (wearing|got on|on|dressed in)\b/i.test(text)) return '';
            if (/^what you look like\b/i.test(text)) return '';
            if (/^(your|the) (current |today'?s? )?(outfit|attire|look|clothes|clothing|style|ensemble)\s*[?!.]?\s*$/i.test(text)) return '';

            return text;
        }

        // ── Infer a scene / shot type from the user's message ─────────────────
        function inferSceneHint(userMessage) {
            const msg = normalizeText(userMessage || '');

            // Shot framing
            if (/\b(selfie|front[-\s]?facing|front cam)\b/.test(msg)) return 'selfie';
            if (/\b(full[\s-]?body|whole body|head to toe)\b/.test(msg)) return 'full body shot';
            if (/\b(close.?up|close shot|portrait shot)\b/.test(msg)) return 'close-up portrait';

            // Outdoor locations
            if (/\b(beach|pool|water|ocean|sea|lake|swimming)\b/.test(msg)) return 'at the beach';
            if (/\b(park|garden|nature|forest|woods|trail|hiking)\b/.test(msg)) return 'outdoors in nature';
            if (/\b(outside|outdoors|street|city|urban|rooftop|balcony)\b/.test(msg)) return 'outdoors';
            if (/\b(sunset|sunrise|golden hour|dusk|dawn)\b/.test(msg)) return 'golden hour outdoors';
            if (/\b(snow|winter|cold|snowy)\b/.test(msg)) return 'snowy outdoors';

            // Indoor locations
            if (/\b(mirror|bathroom|getting ready)\b/.test(msg)) return 'bathroom mirror selfie';
            if (/\b(bedroom|bed|sleeping|waking up|cozy|tucked in)\b/.test(msg)) return 'in the bedroom';
            if (/\b(couch|sofa|living room|relaxing|lounging)\b/.test(msg)) return 'relaxing at home';
            if (/\b(kitchen|cooking|baking|making food)\b/.test(msg)) return 'in the kitchen';
            if (/\b(home|house|apartment|room)\b/.test(msg)) return 'indoor candid';

            // Activities & venues
            if (/\b(gym|workout|exercise|yoga|running|jogging|lifting)\b/.test(msg)) return 'at the gym';
            if (/\b(coffee|café|cafe|latte|espresso)\b/.test(msg)) return 'at a café';
            if (/\b(restaurant|eating|dining|brunch|lunch|dinner)\b/.test(msg)) return 'at a restaurant';
            if (/\b(bar|club|party|night out|dancing|nightlife)\b/.test(msg)) return 'at a party';
            if (/\b(office|work|desk|computer|meeting)\b/.test(msg)) return 'at work';
            if (/\b(shop|shopping|mall|store|trying on)\b/.test(msg)) return 'out shopping';
            if (/\b(concert|festival|music|show|performance)\b/.test(msg)) return 'at a concert';

            // Activities / poses
            if (/\b(sleeping|asleep|napping|resting)\b/.test(msg)) return 'sleeping, peaceful';
            if (/\b(dancing|dance|swaying)\b/.test(msg)) return 'dancing';
            if (/\b(reading|with a book|studying)\b/.test(msg)) return 'reading';
            if (/\b(smiling|laughing|happy|grinning)\b/.test(msg)) return 'smiling';

            // Generic
            if (/\b(photo|pic|picture)\b/.test(msg)) return 'photo';
            return '';
        }

        // ── Classify the image request: is the CHARACTER the subject, or a creative one? ──
        //
        // 'character' — The user wants an image OF or FEATURING the character.
        //   → Use character appearance description + character-grounded prompt.
        //   Examples: "send me a selfie", "draw yourself wearing red", "show me how you look"
        //
        // 'creative'  — The user is asking the character to CREATE an image of something else.
        //   → Skip character appearance entirely; use the user's directive as the whole subject.
        //   Examples: "draw me a cartoon of a cat", "paint me a sunset", "sketch a dragon"
        //
        // Default fallback is always 'character' (safe — preserves existing behaviour).
        function classifyImageRequest(userMessage, userDirectives) {
            const msg = normalizeText(userMessage);
            const dir = normalizeText(userDirectives || '');

            // ── Hard character signals ──────────────────────────────────────────
            const CHARACTER_MSG_PATTERNS = [
                /\b(selfie|photo of you|pic of you|picture of you)\b/i,
                /\b(send|show|share)\s+(me\s+)?(a\s+)?(selfie|photo|pic|picture|snap)\b/i,
                /\btake\s+(me\s+)?(a\s+)?(selfie|photo|pic)\b/i,
                /\bshow me (what |how )you (look|appear)\b/i,
                /\bwhat do you look like\b/i,
                /\b(draw|sketch|paint|illustrate)\s+yourself\b/i,
            ];
            if (CHARACTER_MSG_PATTERNS.some(p => p.test(msg))) return 'character';

            // ── Directive starts with appearance / location modifiers ───────────
            // "draw me wearing a red dress" → dir = "wearing a red dress" → character
            if (dir) {
                if (/^(wearing|dressed|in a |in an |at the |at a |on the |on a |with your|with her|with his|sitting|standing|lying|holding|posing|smiling|looking|relaxing|working|dancing|reading)/.test(dir)) {
                    return 'character';
                }
                // Directive explicitly references the character as subject
                if (/\bof (you|yourself)\b/i.test(dir)) return 'character';
            }

            // ── Creative subject signals ────────────────────────────────────────
            // These only fire when the subject is NOT "you" or "yourself"
            const hasCharacterSubject = /\bof (you|yourself)\b/i.test(msg);
            if (!hasCharacterSubject) {
                const CREATIVE_PATTERNS = [
                    // "draw/create a [art medium] of [non-character]"
                    // Covers: cartoon, watercolor, oil painting, sketch, illustration, pixel art, etc.
                    /\b(draw|sketch|paint|illustrate|create|generate|make|show|send|share)\s+(me\s+)?(an?\s+)?(?:[\w-]+\s+){0,3}(cartoon|comic|illustration|artwork|painting|sketch|drawing|watercolou?r|oil\s*paint|pixel\s*art|chibi|anime|portrait|picture|photo|image|pic|hentai|cg|render)\s+of\s+(?!you\b|yourself\b)/i,
                    // "draw/sketch/paint/illustrate [me] a [concrete non-media noun]"
                    // Negative lookahead prevents "draw a picture", "draw a selfie", etc.
                    // Optional "me" between verb and article: "sketch me a dragon", "draw a cat"
                    /\b(draw|sketch|paint|illustrate)\s+(me\s+)?(a|an)\s+(?!(picture|photo|image|selfie|drawing|sketch|portrait|me|yourself)\b)/i,
                    // "create/generate an image of [non-character]"
                    /\b(generate|create|make)\s+(me\s+)?(an?\s+)?(?:[\w-]+\s+){0,3}(image|picture|illustration|artwork)\s+of\s+(?!you\b|yourself\b|me\b)/i,
                    // "paint/draw me a [art style] of" — style word then "of" something
                    /\b(paint|draw|sketch|illustrate)\s+me\s+(an?\s+)?(?:[\w-]+\s+){0,3}(watercolou?r|oil\s*paint|cartoon|comic|sketch|illustration)\b/i,
                ];
                if (CREATIVE_PATTERNS.some(p => p.test(msg))) return 'creative';
            }

            return 'character';
        }

        // ── Extract the creative subject when extractUserVisualDirectives returns '' ──
        // Used as a fallback when mode=creative but no directives were isolated —
        // e.g. "Sketch a dragon for me" doesn't match any trigger-strip pattern so
        // userDirectives ends up empty. We recover the subject here instead.
        function extractCreativeSubject(userMessage) {
            let text = String(userMessage || '').trim();
            // Strip leading creative-verb + optional "me" + optional article
            text = text.replace(/^(draw|sketch|paint|illustrate|create|generate|make)\s+(me\s+)?(a\s+|an\s+)?/i, '');
            // Strip trailing social filler: "for me", "please", etc.
            text = text.replace(/\s+(for\s+(me|us)|please)[\s?!.]*$/i, '');
            text = text.replace(/[?!.,]+$/, '').trim();
            return text || '';
        }

        // ── Return SD quality / style tags appropriate for the detected style ──
        //
        // Checked against the raw user message so style words ("cartoon", "watercolor")
        // are never accidentally stripped before classification.
        function detectStyleTags(userMessage) {
            const msg = normalizeText(userMessage || '');

            if (/\b(nsfw|hentai|ecchi|lewd)\b/.test(msg))
                return 'nsfw, hentai, explicit, highly detailed anime art, high quality';
            if (/\bcartoon\b/.test(msg))
                return 'cartoon style, vibrant colors, bold outlines, flat shading, animated, high quality';
            if (/\b(anime|manga)\b/.test(msg))
                return 'anime style, manga, cel shading, vibrant, highly detailed, high quality';
            if (/\bchibi\b/.test(msg))
                return 'chibi style, cute, rounded, colorful, high quality';
            if (/\bwatercolou?r\b/.test(msg))
                return 'watercolor painting, soft edges, flowing colors, artistic, high quality';
            if (/\boil[\s-]?paint/.test(msg))
                return 'oil painting, rich colors, textured brushwork, classical art, masterpiece';
            if (/\bpixel[\s-]?art\b/.test(msg))
                return 'pixel art, 8-bit, retro style, crisp pixels';
            if (/\bcomic[\s-]?(book)?\b/.test(msg))
                return 'comic book style, bold ink lines, vivid colors, dynamic composition, high quality';
            if (/\billustrat/.test(msg))
                return 'digital illustration, detailed, vibrant, artistic, high quality';
            if (/\bpainting?\b/.test(msg))
                return 'digital painting, detailed, artistic, high quality';
            // "sketch" only if NOT referring to the act of drawing the character ("sketch me", "sketch yourself")
            if (/\bsketch\b/.test(msg) && !/\bsketch\s+(me|yourself)\b/i.test(msg))
                return 'pencil sketch, detailed linework, graphite, artistic';
            if (/\b(realistic|photorealistic)\b/.test(msg))
                return 'photorealistic, highly detailed, masterpiece, best quality';

            // Default — used for plain selfie / photo requests
            return 'natural skin texture';
        }

        // ── Trigger detection ─────────────────────────────────────────────────
        function detectImageRequest(userMessage, chatHistory) {
            const userText = normalizeText(userMessage);
            if (!userText) return { triggered: false, type: 'none' };

            const lookback = settings().imageGenerationOfferLookback || 3;
            const recentCharMessages = (Array.isArray(chatHistory) ? chatHistory : [])
                .filter(msg => msg && !msg.is_user)
                .slice(-lookback);

            // Affirmative response to a recent character image offer
            const isAffirmative = AFFIRMATIVE_PATTERNS.some(p => p.test(userText));
            const hasRecentOffer = recentCharMessages.some(msg => {
                const mes = normalizeText(msg.mes);
                return OFFER_VERB_PATTERNS.some(p => p.test(mes)) &&
                       OFFER_MEDIA_PATTERNS.some(p => p.test(mes));
            });

            if (isAffirmative && hasRecentOffer) {
                return { triggered: true, type: 'offer_response', confidence: 0.95 };
            }

            // Direct user request
            if (DIRECT_REQUEST_PATTERNS.some(p => p.test(userText))) {
                return { triggered: true, type: 'direct_request', confidence: 0.9 };
            }

            return { triggered: false, type: 'none', confidence: 0 };
        }

        // ── Resolve contextual / pronoun references in user directives ─────────
        //
        // When the user says "show me a photo of you wearing that" or "send me a
        // pic in that dress", the directive resolves to a vague pronoun ("that" /
        // "this" / "it") rather than a concrete outfit description.
        //
        // This function detects those cases and walks back through the recent
        // chat history to find the clothing / appearance passage that the pronoun
        // is most likely referring to — typically the character's most recent
        // self-description of what they're wearing.
        //
        // Returns a refined directive string (or the original if no pronoun is found).
        function resolveContextualDirectives(userDirectives, userMessage, chatHistory, charName) {
            // ── 1. Detect whether the user's message contains a bare pronoun reference ──
            // Patterns that indicate the user is pointing at something previously described
            const PRONOUN_REF_PATTERNS = [
                /\bwearing that\b/i,
                /\bin that\b/i,
                /\bwith that\b/i,
                /\bthat (dress|outfit|look|style|thing|fit|piece|top|skirt|coat|jacket|shirt|suit|gown|robe)\b/i,
                /\bthis (dress|outfit|look|style|thing|fit|piece|top|skirt|coat|jacket|shirt|suit|gown|robe)\b/i,
                /\bwearing it\b/i,
                /\bin it\b/i,
                // Phrases that reference the character's current/described appearance
                /\bwhat (you'?re|you are) wearing\b/i,
                /\bwhat (you'?ve|you have) (got on|on)\b/i,
                /\bwhat you look like\b/i,
                /\byour (outfit|attire|look|clothes|clothing|style|ensemble) (today|right now|at the moment|currently)\b/i,
            ];

            const isPronounRef = PRONOUN_REF_PATTERNS.some(p => p.test(userMessage));
            // Also treat empty/vague directives: if the directive itself is a bare pronoun
            const isVagueDirective = !userDirectives || /^(that|this|it|those|these|them)$/i.test(userDirectives.trim());

            if (!isPronounRef && !isVagueDirective) {
                // No pronoun reference — return as-is
                return userDirectives;
            }

            // ── 2. Collect recent character messages ──────────────────────────────
            const recentCharMessages = (Array.isArray(chatHistory) ? chatHistory : [])
                .filter(msg => msg && !msg.is_user)
                .slice(-6);

            const OUTFIT_KEYWORDS = [
                'wearing', 'dressed', 'adorned', 'clothed', 'clad', 'donning', 'sporting',
                'dress', 'outfit', 'coat', 'jacket', 'skirt', 'top', 'shirt',
                'pants', 'jeans', 'gown', 'robe', 'suit', 'blouse', 'sweater', 'cardigan',
                'heels', 'shoes', 'boots', 'sandals', 'stockings', 'tights',
                'holographic', 'silk', 'lace', 'velvet', 'sheer', 'satin',
                'yellow', 'red', 'blue', 'green', 'black', 'white', 'pink', 'gold',
                '1950s', 'housewife', 'cinched', 'waist', 'hem', 'skirt hem',
                'slicker', 'raincoat', 'sundress',
                // Royal / formal / fantasy attire
                'royal', 'regal', 'noble', 'imperial', 'formal', 'elegant', 'attire', 'garment',
                'cloak', 'cape', 'crown', 'tiara', 'veil', 'corset', 'bodice', 'kimono',
                'regalia', 'costume', 'uniform', 'ensemble', 'mantle', 'tunic', 'chemise',
                'embroidered', 'embroidery', 'jeweled', 'jewelled', 'bejeweled', 'bejewelled',
                'sequin', 'beaded', 'trimmed', 'tailored', 'fitted'
            ];

            // ── Strategy depends on WHY we're here ───────────────────────────────
            //
            // isPronounRef ("wearing that", "in that dress"):
            //   The user points at something described earlier — rank by keyword
            //   density to surface the most descriptive outfit message.
            //
            // isVagueDirective (empty directive — "Send me a photo"):
            //   No direction given. The correct source is the MOST RECENT character
            //   message — the immediate context the character would naturally draw from.
            //   Scoring by keyword hits is wrong here: an older message with richer
            //   outfit vocabulary must NOT beat the latest one simply because it
            //   contains more clothing words.
            let bestMatch;

            if (!isPronounRef && isVagueDirective) {
                // Vague directive: walk from newest to oldest, take the first message
                // that contains any outfit-relevant word, falling back to the absolute
                // latest message if none match the keyword list.
                const latestWithOutfit = [...recentCharMessages]
                    .reverse()
                    .find(msg => {
                        const lower = String(msg.mes || '').toLowerCase();
                        return OUTFIT_KEYWORDS.some(kw => lower.includes(kw));
                    });
                const candidate = latestWithOutfit || recentCharMessages[recentCharMessages.length - 1];
                bestMatch = candidate ? { text: String(candidate.mes || '') } : null;
            } else {
                // Pronoun reference: rank by keyword density; prefer recency on ties.
                const scored = recentCharMessages.map((msg, index) => {
                    const text = String(msg.mes || '');
                    const lower = text.toLowerCase();
                    const hits = OUTFIT_KEYWORDS.filter(kw => lower.includes(kw)).length;
                    return { text, hits, index };
                });
                bestMatch = scored
                    .filter(x => x.hits > 0)
                    .sort((a, b) => b.hits - a.hits || b.index - a.index)[0] || null;
            }

            if (!bestMatch) {
                return userDirectives;
            }

            // ── 3. Extract the most visually-relevant sentence(s) from the match ──
            const sentences = bestMatch.text
                .split(/[.!?\n]+/)
                .map(s => s.trim())
                .filter(s => s.length > 8);

            // Clothing-focused keywords — used for pronoun refs like "wearing that" / "in that dress"
            const APPEARANCE_SENTENCE_KEYWORDS = [
                'wearing', 'dressed', 'adorned', 'clothed', 'clad', 'donning', 'sporting',
                'dress', 'outfit', 'coat', 'jacket', 'skirt', 'top', 'shirt',
                'pants', 'gown', 'robe', 'suit', 'blouse', 'sweater', 'cinched', 'hem',
                'holographic', 'silk', 'lace', 'velvet', 'sheer', 'satin',
                'slicker', 'raincoat', 'sundress', 'housewife',
                // Royal / formal / fantasy attire
                'royal', 'regal', 'noble', 'imperial', 'formal', 'elegant', 'attire', 'garment',
                'cloak', 'cape', 'crown', 'tiara', 'veil', 'corset', 'bodice', 'kimono',
                'regalia', 'costume', 'uniform', 'ensemble', 'mantle', 'tunic', 'chemise',
                'embroidered', 'embroidery', 'jeweled', 'jewelled', 'bejeweled',
                'sequin', 'beaded', 'trimmed', 'tailored', 'fitted'
            ];

            // Broader visual keywords — used for vague directives like "show me a photo of that"
            // where "that" may refer to a scene, object, or atmosphere rather than clothing.
            const BROAD_VISUAL_KEYWORDS = [
                ...APPEARANCE_SENTENCE_KEYWORDS,
                // colors
                'color', 'colour', 'hue', 'tint', 'shade', 'tone', 'gradient', 'pattern',
                'lavender', 'crimson', 'amber', 'teal', 'emerald', 'sapphire', 'violet', 'indigo',
                'turquoise', 'magenta', 'scarlet', 'maroon', 'ivory', 'beige', 'rust',
                'red', 'blue', 'green', 'yellow', 'pink', 'purple', 'orange', 'gold', 'silver',
                'white', 'black', 'brown', 'grey', 'gray', 'pale',
                // light / atmosphere
                'glow', 'shimmer', 'sparkle', 'gleam', 'radiant', 'bright', 'vivid', 'vibrant',
                'light', 'shadow', 'dark', 'glowing', 'luminous', 'shining', 'reflection',
                // texture / material (non-clothing)
                'smooth', 'rough', 'soft', 'fluffy', 'spotted', 'striped', 'textured',
                // nature / scene
                'flower', 'flowers', 'field', 'rain', 'sky', 'cloud', 'sunset', 'sunrise',
                'bloom', 'forest', 'ocean', 'mountain', 'snow', 'water', 'wind', 'garden',
                // objects / setting
                'room', 'floor', 'wall', 'window', 'door', 'table', 'chair', 'bed',
                // general visual descriptors
                'beautiful', 'stunning', 'gorgeous', 'elegant', 'delicate', 'looks', 'appears'
            ];

            // Vague directive mode ("Show me a photo of that") needs the broader keyword set
            // because the user is pointing at a scene/object, not necessarily clothing.
            const keywordsToUse = (!isPronounRef && isVagueDirective)
                ? BROAD_VISUAL_KEYWORDS
                : APPEARANCE_SENTENCE_KEYWORDS;

            const visualSentences = sentences
                .map(s => {
                    const lower = s.toLowerCase();
                    const hits = keywordsToUse.filter(kw => lower.includes(kw)).length;
                    return { s, hits };
                })
                .filter(x => x.hits > 0)
                .sort((a, b) => b.hits - a.hits)
                .slice(0, 2)
                .map(x => x.s);

            if (visualSentences.length === 0) {
                // For vague directives ("that", "this"), the user explicitly said "show me that" —
                // the whole prior message IS the context. Fall back to the 2 longest sentences
                // rather than discarding the reference entirely.
                if (!isPronounRef && isVagueDirective) {
                    const fallbackSentences = [...sentences]
                        .sort((a, b) => b.length - a.length)
                        .slice(0, 2);
                    if (fallbackSentences.length > 0) {
                        const resolved = fallbackSentences.join('. ');
                        log('[EchoText] Vague directive resolved — using full context from recent chat:', resolved);
                        return resolved;
                    }
                }
                return userDirectives;
            }

            // ── 4. Format the resolved directive ──────────────────────────────────
            const resolvedDescription = visualSentences.join('. ');

            log('[EchoText] Pronoun reference resolved — using context from recent chat:', resolvedDescription);

            // For vague directives referencing a scene/object, don't force a "wearing" prefix —
            // the content isn't necessarily clothing.
            if (!isPronounRef && isVagueDirective) {
                return resolvedDescription;
            }

            // Pronoun refs ("wearing that", "in that dress") keep the clothing prefix convention.
            // Don't force a "wearing" prefix if the sentence already starts with a subject (full sentence)
            // or another clothing verb — "I'm adorned in royal robes" doesn't need "wearing" prepended.
            const startsWithSubject = /^(i'?m\b|i'?ve\b|i \b|she'?s\b|she \b|he'?s\b|he \b|they'?re\b|they \b)/i.test(resolvedDescription);
            const hasClothingVerb = /^(wearing|dressed|adorned|clothed|clad|sporting|donning)\b/i.test(resolvedDescription);
            return (startsWithSubject || hasClothingVerb)
                ? resolvedDescription
                : `wearing ${resolvedDescription}`;
        }

        // ── Legacy prompt builder (regex-based, used as fallback) ────────────
        function buildImagePromptLegacy(userMessage, chatHistory) {
            const char = getCurrentCharacter();
            const s = settings();
            const charName = getCharacterName();
            const userName = getUserName();

            const characterHasDescription = !!(char?.description || char?.personality);

            // ── Description override: use gallery override if set for this character ──
            const charKey = typeof getCharacterKey === 'function' ? getCharacterKey() : null;
            const descriptionOverrides = (s.galleryDescriptionOverrides && typeof s.galleryDescriptionOverrides === 'object') ? s.galleryDescriptionOverrides : {};
            const overrideDesc = charKey && typeof descriptionOverrides[charKey] === 'string' ? descriptionOverrides[charKey].trim() : '';

            const visualDesc = overrideDesc || extractVisualDescription(char);
            const sceneHint = inferSceneHint(userMessage);

            // Pass charName so greeting stripping ("Hey Ava, ...") works correctly
            const rawDirectives = extractUserVisualDirectives(userMessage, charName);

            // Resolve any pronoun/demonstrative references ("wearing that", "in that dress")
            // against the recent chat history so vague pointers become concrete descriptions.
            const userDirectives = resolveContextualDirectives(rawDirectives, userMessage, chatHistory, charName);

            // Determine whether the character is the image subject or the creative agent
            const mode = classifyImageRequest(userMessage, userDirectives);

            // Pick style/quality tags that match what the user actually asked for
            const styleTags = detectStyleTags(userMessage);

            const recentLines = (Array.isArray(chatHistory) ? chatHistory : [])
                .slice(-(s.imageGenerationRecentContextMessages || 4))
                .map(msg => `${msg.is_user ? userName : charName}: ${msg.mes}`);
            const recentContext = recentLines.join('\n');

            let sdPrompt, contextPrompt;

            if (mode === 'creative') {
                // ── Creative subject request ─────────────────────────────────────
                // The character is the artist, not the subject. The user wants an image
                // of something specific (a cartoon cat, a painted dragon, etc.) — the
                // character's appearance must NOT anchor the prompt or it will override
                // the intended subject.
                //
                // userDirectives may be empty if extractUserVisualDirectives couldn't
                // isolate the subject (e.g. "Sketch a dragon for me" — no trigger to
                // strip). Fall back to extractCreativeSubject which parses the raw message.
                const subject = userDirectives || extractCreativeSubject(userMessage) || sceneHint || 'an artistic scene';
                sdPrompt = [subject, styleTags].join(', ');

                const contextBlocks = [
                    `Generate an image as requested by the user:\n${subject}`,
                    `Style: ${styleTags}`,
                ];
                if (recentContext) {
                    contextBlocks.push(`Recent conversation context:\n${recentContext}`);
                }
                contextBlocks.push(`Render faithfully and clearly. Do not insert the character's face or appearance unless the subject specifically calls for it.`);
                contextPrompt = contextBlocks.join('\n\n');

            } else {
                // ── Character appearance / selfie request ────────────────────────
                // The character IS the subject. Anchor the prompt with their appearance
                // and layer the user's directives on top.
                const sdParts = [`photo of ${charName}`];
                // User's directives come first — they take precedence over the base
                // character description and anchor what the image should actually show.
                if (userDirectives) sdParts.push(userDirectives);
                if (visualDesc) sdParts.push(visualDesc);
                // Scene hint: use user-specified scene, or fall back to selfie/candid
                const sdScene = sceneHint || (userDirectives ? '' : 'selfie, candid');
                if (sdScene) sdParts.push(sdScene);
                sdParts.push(styleTags);
                sdPrompt = sdParts.join(', ');

                const contextBlocks = [];
                if (userDirectives) {
                    contextBlocks.push(
                        `Generate a photo of ${charName} as specifically requested by the user:\n${userDirectives}`
                    );
                } else {
                    contextBlocks.push(
                        `Generate a photo of ${charName} — something they might personally send someone.`
                    );
                }
                if (visualDesc) {
                    contextBlocks.push(
                        `Base character appearance (adapt to the requested look — do not override the user's directive):\n${visualDesc}`
                    );
                } else {
                    contextBlocks.push(`Character: ${charName} — infer a visually coherent appearance.`);
                }
                if (sceneHint) {
                    contextBlocks.push(`Shot type / setting: ${sceneHint}`);
                }
                if (recentContext) {
                    contextBlocks.push(`Recent conversation context:\n${recentContext}`);
                }
                if (userDirectives) {
                    contextBlocks.push(`Render with style: ${styleTags}. Fulfil the requested look precisely.`);
                } else {
                    contextBlocks.push(`Render as a candid, personal photo like a real image sent in a text message.`);
                }
                contextPrompt = contextBlocks.join('\n\n');
            }

            // ── Compact prompt (kept for logging / legacy compatibility) ──────
            const prompt = sdPrompt;

            return {
                sdPrompt,
                prompt,
                contextPrompt,
                characterHasDescription,
                userDirectives,
                mode
            };
        }

        // ── Build the image generation payload ───────────────────────────────
        //
        // LLM-first path: when the user's request needs conversational context to
        // resolve (e.g. "show me that", "show me what you're wearing"), a lightweight
        // pre-call to the configured LLM extracts structured directives from the
        // last 6 messages.  Falls back to the legacy regex path on any failure or
        // when context resolution is not needed (explicit direction in the message).
        async function buildImagePrompt(userMessage, chatHistory, signal) {
            const char = getCurrentCharacter();
            const s = settings();
            const charName = getCharacterName();

            const characterHasDescription = !!(char?.description || char?.personality);

            const charKey = typeof getCharacterKey === 'function' ? getCharacterKey() : null;
            const descriptionOverrides = (s.galleryDescriptionOverrides && typeof s.galleryDescriptionOverrides === 'object') ? s.galleryDescriptionOverrides : {};
            const overrideDesc = charKey && typeof descriptionOverrides[charKey] === 'string' ? descriptionOverrides[charKey].trim() : '';
            const visualDesc = overrideDesc || extractVisualDescription(char);
            const styleTags = detectStyleTags(userMessage);

            // ── Try LLM extraction when context resolution is needed ──────────
            if (needsContextResolution(userMessage)) {
                const extracted = await extractImageDirectivesViaLLM(userMessage, chatHistory, charName, signal);

                if (extracted) {
                    const userDirectives = extracted.directives || '';
                    const sceneHint = (extracted.scene && extracted.scene.trim()) || inferSceneHint(userMessage);

                    let sdPrompt, contextPrompt;
                    const mode = extracted.mode || 'character';

                    if (mode === 'creative') {
                        const subject = userDirectives || extractCreativeSubject(userMessage) || sceneHint || 'an artistic scene';
                        sdPrompt = [subject, styleTags].join(', ');
                        contextPrompt = [
                            `Generate an image as requested by the user:\n${subject}`,
                            `Style: ${styleTags}`,
                            `Render faithfully and clearly. Do not insert the character's face or appearance unless the subject specifically calls for it.`
                        ].join('\n\n');
                    } else if (mode === 'object') {
                        const subject = userDirectives || sceneHint || 'the described subject';
                        const sdParts = [subject];
                        if (styleTags) sdParts.push(styleTags);
                        sdPrompt = sdParts.join(', ');
                        const contextBlocks = [`Generate a photo of: ${subject}`];
                        if (sceneHint && sceneHint !== subject) contextBlocks.push(`Shot type / setting: ${sceneHint}`);
                        contextBlocks.push(`Style: ${styleTags}. Render clearly and faithfully. Do not include ${charName} unless they are explicitly part of the subject.`);
                        contextPrompt = contextBlocks.join('\n\n');
                    } else {
                        const sdParts = [`photo of ${charName}`];
                        if (userDirectives) sdParts.push(userDirectives);
                        if (visualDesc) sdParts.push(visualDesc);
                        const sdScene = sceneHint || (userDirectives ? '' : 'selfie, candid');
                        if (sdScene) sdParts.push(sdScene);
                        sdParts.push(styleTags);
                        sdPrompt = sdParts.join(', ');

                        const contextBlocks = [];
                        if (userDirectives) {
                            contextBlocks.push(`Generate a photo of ${charName} as specifically requested by the user:\n${userDirectives}`);
                        } else {
                            contextBlocks.push(`Generate a photo of ${charName} — something they might personally send someone.`);
                        }
                        if (visualDesc) {
                            contextBlocks.push(`Base character appearance (do not override the user's directive):\n${visualDesc}`);
                        }
                        if (sceneHint) contextBlocks.push(`Shot type / setting: ${sceneHint}`);
                        contextBlocks.push(userDirectives
                            ? `Render with style: ${styleTags}. Fulfil the requested look precisely.`
                            : `Render as a candid, personal photo like a real image sent in a text message.`);
                        contextPrompt = contextBlocks.join('\n\n');
                    }

                    log('[EchoText] Image prompt built via LLM | Mode:', mode, '| Directives:', userDirectives || '(none)', '| SD:', sdPrompt);
                    return { sdPrompt, prompt: sdPrompt, contextPrompt, characterHasDescription, userDirectives, mode };
                }

                // LLM returned null — fall through to legacy path below
                log('[EchoText] LLM extraction returned null — using legacy regex path');
            }

            // ── Legacy fallback (regex-based) ─────────────────────────────────
            return buildImagePromptLegacy(userMessage, chatHistory);
        }

        // ── Request queue with rate-limiting ─────────────────────────────────
        async function enqueueImageGeneration(payload) {
            return new Promise((resolve, reject) => {
                if (payload.signal) {
                    if (payload.signal.aborted) {
                        return reject(new DOMException('Aborted', 'AbortError'));
                    }
                    payload.signal.addEventListener('abort', () => {
                        reject(new DOMException('Aborted', 'AbortError'));
                    }, { once: true });
                }
                requestQueue.push({ payload, resolve, reject });
                pumpQueue();
            });
        }

        async function pumpQueue() {
            if (activeRequest || requestQueue.length === 0) return;

            const next = requestQueue.shift();
            
            if (next.payload.signal && next.payload.signal.aborted) {
                // Aborted before execution could start
                pumpQueue();
                return;
            }

            activeRequest = next;

            const s = settings();
            const now = Date.now();
            const rateLimit = Math.max(1, s.imageGenerationMaxRequestsPerMinute || 3);
            const minIntervalMs = Math.max(1000, Math.floor(60000 / rateLimit));
            const elapsed = now - (s.imageGenerationLastRequestAt || 0);

            if (elapsed < minIntervalMs) {
                await new Promise(resolve => setTimeout(resolve, minIntervalMs - elapsed));
            }

            let result;
            try {
                if (s.imageGenerationEnabled !== true) {
                    result = {
                        ok: false,
                        error: 'Image generation is disabled. Enable it in EchoText → Generation Engine → Image Generation.',
                        code: 'disabled'
                    };
                } else {
                    result = await requestSillyTavernImageGeneration(next.payload);
                    s.imageGenerationLastRequestAt = Date.now();
                    saveSettings();
                }
            } catch (err) {
                warn('Image generation request failed:', err);
                result = {
                    ok: false,
                    error: err?.message || 'Image generation failed.',
                    code: 'request_failed'
                };
            }

            if (next.payload.signal && next.payload.signal.aborted) {
                // Outer promise already rejected by the abort listener. Let it vanish.
            } else {
                next.resolve(result);
            }
            activeRequest = null;
            pumpQueue();
        }

        // ── Main entry point ──────────────────────────────────────────────────
        async function maybeGenerateImageReply(userMessage, chatHistory, signal) {
            const detection = detectImageRequest(userMessage, chatHistory);
            if (!detection.triggered) {
                return { triggered: false };
            }

            const promptPayload = await buildImagePrompt(userMessage, chatHistory, signal);
            const requestPayload = {
                ...promptPayload,
                triggerType: detection.type,
                userMessage,
                signal
            };

            log(
                '[EchoText] Image triggered:', detection.type,
                '| Directives:', promptPayload.userDirectives || '(none)',
                '| SD Prompt:', promptPayload.sdPrompt
            );

            const result = await enqueueImageGeneration(requestPayload);
            return {
                triggered: true,
                detection,
                promptPayload,
                result
            };
        }

        return {
            detectImageRequest,
            buildImagePrompt,
            maybeGenerateImageReply
        };
    }

    window.EchoTextImageGeneration = {
        createImageGeneration
    };
})();
