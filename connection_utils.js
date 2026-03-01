
// EchoText - Connection Utilities (Reference)
// Adapted from EchoChamber by mattjaybe
// NOTE: The generation logic is inlined in index.js.
// This file is kept as a reference for the connection profile pattern.

const ET_EXTENSION_NAME = "EchoText";

function etDebugLog(...args) {
    console.log(`[${ET_EXTENSION_NAME}]`, ...args);
}

function etDebugWarn(...args) {
    console.warn(`[${ET_EXTENSION_NAME}]`, ...args);
}

/**
 * Wait for the connection manager to be available
 */
async function etWaitForConnectionManager(maxAttempts = 10, delayMs = 200) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const context = SillyTavern.getContext();
        if (context?.extensionSettings?.connectionManager) {
            return true;
        }
        await new Promise(resolve => setTimeout(resolve, delayMs));
    }
    etDebugWarn(`Connection manager not available after ${maxAttempts} attempts`);
    return false;
}

/**
 * Get profile object by name
 */
export async function getProfileByName(profileName) {
    try {
        const isAvailable = await etWaitForConnectionManager();
        if (!isAvailable) return null;

        const context = SillyTavern.getContext();
        const { profiles } = context.extensionSettings.connectionManager;
        return profiles.find(p => p.name === profileName) || null;
    } catch {
        return null;
    }
}

/**
 * Generate using a connection profile WITHOUT changing global settings
 * This uses the profile's settings to make a direct API call via ConnectionManagerRequestService
 */
export async function generateWithProfile(profileName, messages, abortController = null) {
    try {
        const profile = await getProfileByName(profileName);
        if (!profile) {
            throw new Error(`Connection profile not found: ${profileName}`);
        }

        etDebugLog(`Generating with profile: ${profileName} (isolated, no global state change)`);

        const context = SillyTavern.getContext();

        // Use the static sendRequest method with profile ID
        const response = await context.ConnectionManagerRequestService.sendRequest(
            profile.id,  // profileId
            messages,    // prompt (messages array)
            context.main?.max_length || 500,         // maxTokens
            {
                stream: false,
                signal: abortController?.signal || null,
                extractData: true,
                includePreset: true,
                includeInstruct: true
            }
        );

        // Extract text from response - handle all possible API formats
        function extractText(resp) {
            if (!resp) return null;
            if (typeof resp === 'string') return resp;

            // Response itself is an array of content blocks
            if (Array.isArray(resp)) {
                const texts = resp
                    .filter(b => b && b.type === 'text' && typeof b.text === 'string')
                    .map(b => b.text);
                if (texts.length > 0) return texts.join('\n');
            }

            // response.content (string or array)
            if (resp.content !== undefined && resp.content !== null) {
                if (typeof resp.content === 'string') return resp.content;
                if (Array.isArray(resp.content)) {
                    const texts = resp.content
                        .filter(b => b && b.type === 'text' && typeof b.text === 'string')
                        .map(b => b.text);
                    if (texts.length > 0) return texts.join('\n');
                }
            }

            // OpenAI choices format
            if (resp.choices?.[0]?.message?.content) {
                const c = resp.choices[0].message.content;
                if (typeof c === 'string') return c;
                if (Array.isArray(c)) {
                    const texts = c
                        .filter(b => b && b.type === 'text' && typeof b.text === 'string')
                        .map(b => b.text);
                    if (texts.length > 0) return texts.join('\n');
                }
            }

            // Other common fields
            if (typeof resp.text === 'string') return resp.text;
            if (typeof resp.message === 'string') return resp.message;
            if (resp.message?.content && typeof resp.message.content === 'string') return resp.message.content;

            return null;
        }

        const extracted = extractText(response);
        if (extracted !== null) {
            etDebugLog('Extracted text from response, length:', extracted.length);
            return extracted;
        }

        etDebugWarn('Unexpected response format, could not extract text:', response);
        throw new Error('Invalid response format from API');

    } catch (error) {
        etDebugWarn('Error generating with profile:', error);
        throw error;
    }
}
