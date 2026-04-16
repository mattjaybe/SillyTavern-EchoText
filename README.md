<div align="center">

# 💬 EchoText

### Text your characters. Like, actually text them.

A [SillyTavern](https://github.com/SillyTavern/SillyTavern) extension that adds a floating, iMessage-style chat panel — a private side channel for casual, intimate conversations with any character, while your roleplay continues in the background.

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](manifest.json)
[![SillyTavern](https://img.shields.io/badge/SillyTavern-Extension-orange.svg)](https://github.com/SillyTavern/SillyTavern)

</div>

---

![EchoText running alongside SillyTavern's main roleplay](https://github.com/user-attachments/assets/08f4bef1-1da0-4bdf-91bb-26012fb40e0d)

*EchoText floating alongside SillyTavern's main roleplay window — two separate conversations, one seamless interface.*

---

Most character AI interactions feel like a stage performance. Every message is a scene. EchoText adds something different: a **private texting channel** where a character feels less like an actor and more like someone you actually know.

It lives as a draggable, resizable panel floating over SillyTavern. Text a different character than the one you're roleplaying with. Use it as a quiet side-channel alongside an ongoing story. Or step away from roleplay entirely and just... talk. Characters develop real emotional states, remember meaningful moments, send you messages on their own, and can even share photos.

---

## Feature Overview

| | Feature | What it does |
|:---:|:---|:---|
| 🔗 | **Tethered Mode** | Chat with character's awareness of your SillyTavern roleplay with them |
| 🌐 | **Untethered Mode** | Standalone conversation — set chat influence for the character |
| ❤️ | **Emotional Intelligence** | Characters develop emotional states that evolve with every exchange |
| 🎭 | **Chat Influence** | Set a character's mood, personality, and voice for untethered conversations |
| 🔔 | **Proactive Messaging** | Characters reach out on their own — morning texts, check-ins, and more |
| 🖼️ | **Image Generation** | Ask for a selfie or photo and get a generated image right in chat |
| 🗂️ | **Image Gallery** | Browse all generated images for each character in a dedicated gallery |
| 💾 | **Chat Archives** | Save and restore full conversations, including emotional state at save time |
| 🧠 | **Memory System** | Highlight shared moments — characters will remember them in future chats |
| 😄 | **Emoji Reactions** | React to messages, and characters will react back to yours |
| 👥 | **Group Chat Support** | Text multiple characters at once, each independently active |
| 📱 | **Mobile Friendly** | Fully adapted for iPhone and iPad |

---

## Features

<details>
<summary><strong>🔗 Tethered Mode &amp; 🌐 Untethered Mode</strong></summary>
<br>

EchoText has two distinct ways to chat, designed for different situations.

**Tethered Mode** connects EchoText to your active SillyTavern story. The character you're texting is aware of what's been happening in the roleplay — recent events, tone, and developments carry over into the conversation. Think of it as slipping away from a scene to text them privately, but they still know what just unfolded.

**Untethered Mode** cuts that cord entirely. No active roleplay needed — it's just you and the character, as if you're genuinely texting them. This is ideal for:

- Casual, daily-life style conversations
- Quick check-ins between roleplay sessions
- Overriding the mood, personality and voice of the character

You're never locked into one mode — the panel adapts based on your setup, and switching is immediate.

Switching characters in EchoText does **not** affect what's happening in SillyTavern's main window. Your roleplay continues uninterrupted.

</details>

---

<details>
<summary><strong>❤️ Emotional Intelligence</strong></summary>
<br>

EchoText tracks a character's emotional state across all 9 emotions on **Plutchik's Wheel** — Love, Joy, Trust, Fear, Surprise, Sadness, Disgust, Anger, and Anticipation. These aren't cosmetic labels. They're living values that shift in response to what you say, how you say it, and how much time has passed.

- **Natural decay** — Emotions drift back toward a character's baseline when conversation goes quiet
- **Tone awareness** — ALL CAPS, strong punctuation, and intense language all amplify emotional impact
- **Long-term affinity** — Repeated emotional patterns slowly shift a character's baseline over time. A character you've been consistently warm with for weeks will carry that warmth even after a long gap
- **Psychological coherence** — Opposite emotions suppress each other, keeping states grounded
- **Reaction influence** — Emoji reactions you leave on a message actually nudge the character's emotional state

Click the emotion badge in the panel header below the character's name at any time to see the full breakdown — all 9 emotions with live values, current deltas, and intensity labels like "Serenity," "Ecstasy," or "Apprehension."

![Emotional state popup showing all 9 Plutchik emotions with current values](https://github.com/user-attachments/assets/03917a76-45d3-4a45-bcde-ce66b1d70423)

> **Tethered bonus:** Enable *SillyTavern Context* and the character's emotional state will also shift from what happens in your main roleplay. An emotionally charged scene in SillyTavern will organically bleed into how the character feels when you converse with them in EchoText.

</details>

---

<details>
<summary><strong>🎭 Chat Influence</strong></summary>
<br>

In Untethered Mode, you have direct control over the character's flavor through **Chat Influence** — accessible by clicking the character name or avatar in the panel header.

Three dimensions, fully adjustable:

| Dimension | Options |
|:---|:---|
| **Mood** | Romantic, Flirty, Erotic, Explicit, Playful, Angry, Shy, Confident, Sad, Happy, Anxious, Bored, Excited, Jealous, and more |
| **Personality** | 24 archetypes — Tsundere, Yandere, Kuudere, Dandere, Introvert, Extrovert, Sassy, Sarcastic, Clown, Brooding, and more |
| **Voice** | Formal, Casual, Poetic, Direct, Theatrical, Banter, Cryptic, Nurturing, and more |

Mood and Personality has an **Intensity slider** (0–100%) to dial in how strongly it colors the responses — a hint of mystery or full tsundere mode, entirely your call.

Your active selections appear as colored icon badges in the panel header for a quick at-a-glance reminder. Chat Influence settings are also saved and restored with Chat Archives, so loading an old conversation brings back exactly the flavor it had.

![Chat Influence menu with mood selection grid](https://github.com/user-attachments/assets/1564f2e6-cf10-4f20-bf83-c7aa65a05a1c)

![Chat panel in Untethered mode with influence badges visible in the header](https://github.com/user-attachments/assets/e4587bad-1d6c-402d-9260-7ed56499b3da)

</details>

---

<details>
<summary><strong>🔔 Proactive Messaging</strong></summary>
<br>

Characters don't just wait to be texted. With Proactive Messaging enabled, they'll reach out on their own — checking in after a long silence, sending a good morning, winding down with you in the evening, or attempting to repair a conversation that ended badly.

EchoText evaluates over **14 trigger types** in the background:

| Trigger | When it fires |
|:---|:---|
| **Check-In** | After an extended quiet period |
| **Pregnant Pause** | The conversation went cold mid-exchange |
| **Morning Wave** | First contact of the day |
| **Late Night** | Late-night reach-outs for characters with fitting personalities |
| **Lunch Nudge** | A midday message after a gap |
| **Evening Wind-Down** | End-of-day message |
| **Affection Reciprocation** | Following an unusually warm exchange |
| **Repair Attempt** | After conflict or a rough message |
| **Curiosity Ping** | An interest-driven follow-up |
| **Memory Nudge** | Surfacing a shared moment from your chat history |
| **Weekend Ping** | Casual weekend check-in |
| **Anxiety Reassurance** | When emotional state suggests the character needs reassurance |
| **Celebration Nudge** | When something worth celebrating was mentioned |
| **Time Window** | Configurable custom windows |

You can tune the frequency, active time windows, and which triggers fire per character. The **Proactive Insights** panel in Settings shows a live timeline of recent trigger events and predictions.

> In Group Chats, each character runs their own independent proactive schedule — so multiple characters can reach out to you between sessions, each from their own context.

### Install the optional EchoText-Proactive Server Plugin

Due to how browsers work, when you tab away from SillyTavern or minimize the browser, the proactive messaging in EchoText pauses. To bypass this limitation and allow characters to message you even when SillyTavern isn't visible, install the server plugin. To learn more and to install the server plugin, visit <a href="https://github.com/mattjaybe/SillyTavern-EchoText-Proactive/">https://github.com/mattjaybe/SillyTavern-EchoText-Proactive/</a>

</details>

---

<details>
<summary><strong>🖼️ Image Generation</strong></summary>
<br>

Ask a character for a selfie, a photo, or a drawing — and they will generate one using your connected Image Generation setup (native SillyTavern plugin.)

It works naturally in conversation, just as you'd ask a real person:

- *"Can you send me a selfie?"*
- *"Take a photo of you at the beach"*
- *"Send me a pic of what you're wearing"*
- *"Draw something for me"*

EchoText reads the character card to extract visual appearance details automatically — hair, eyes, outfit, build, complexion — and combines them with your request and any scene context to produce a character-faithful image prompt. If you say *"wearing that"* or *"in that dress,"* EchoText looks back through the conversation to find what the character recently described and uses that as the reference.

Characters can also **offer** images organically in conversation — and a natural reply like *"yes please"* or *"go ahead"* will trigger the generation automatically.

![Full-screen lightbox view of a generated image with prompt details below](https://github.com/user-attachments/assets/53902d7a-7f8e-4461-8679-f7c7f90d3554)

Generated images appear as inline bubbles in chat. Click any image to open it full-screen, with an expandable section below showing the exact prompt that was used.

> **Requires:** SillyTavern's Image Generation plugin enabled and set up with a connected generation source (ComfyUI, Gemini, OpenRouter, etc.)

**Note**: Character consistency/accuracy is difficult when characters generate selfies of themselves. Until better multimodal/omnimodal options become available, use the Description Override in Gallery to finetune the appearance of each character.

</details>

---

<details>
<summary><strong>🗂️ Image Gallery</strong></summary>
<br>

<strong>Note</strong>: Gallery option only available when Image Generation is enabled.

Every generated image is automatically saved to a **per-character gallery** you can browse at any time. Open it from the three-dot overflow menu in the panel header.

- Sort by **Newest**, **Oldest**, or **Name (A–Z)**
- Toggle between **grid** and **list** views
- Adjust thumbnail size with a live-preview slider
- Edit image titles inline
- Expand any image's full prompt, with a one-click copy button

![Character image gallery showing a grid of generated images with titles and prompts](EchoText-ReadmeImages/gallery.png)

</details>

---

<details>
<summary><strong>💾 Chat Archives</strong></summary>
<br>

Save complete conversations and restore them exactly as they were — including all messages, timestamps, and the character's full emotional state at the moment you saved (**Tethered**) or chat influence settings (**Untethered**).

When you load a save, the emotional state/chat influence is restored too. The character doesn't pick up from a blank slate — they pick up from where they *were*.

Before committing to a load, the preview panel gives you a rich snapshot:

- All messages as a live chat preview
- For Tethered saves: All 9 emotional state bars with values and intensity labels
- For Untethered saves: active mood, personality, and voice with influence percentages displayed as mini progress bars
- For Group saves: per-member emotional summaries

![Chat Archives modal with message preview and emotional state bars](https://github.com/user-attachments/assets/b9a178b3-1c22-4210-97df-bcbb477ac293)

Saves are organized by mode — Tethered, Untethered, Group, and Group Combined — so you always know the context a save came from. Conversation names are editable inline, and a quick-chip in the save list shows the dominant emotion or active mood at a glance.

</details>

---

<details>
<summary><strong>🧠 Memory System</strong></summary>
<br>

When you share something meaningful in conversation — a shared joke, a confession, a detail you want the character to carry forward — you can **highlight it** and save it as a Memory. EchoText will weave it back into future conversations organically.

Memories are organized into categories:

| Category | Examples |
|:---|:---|
| 😂 **Inside Jokes** | Running gags, funny moments, private references |
| 👤 **People** | Friends, family, or other characters that come up |
| 🎯 **Hobbies** | Interests and activities mentioned in conversation |
| ⭐ **Favorites** | Preferences and things they love |
| 💛 **Shared Moments** | Emotional exchanges and milestones |
| ✏️ **Custom** | Anything else worth saving |

Memories can be saved **globally** (available with any character) or **per character** (private to that relationship).

Injection uses organic jitter to keep things natural — pinned memories always appear, while unpinned ones rotate on a cooldown so the character isn't mechanically repeating the same reference every message.

EchoText **auto-detects** potential memory candidates in your messages and highlights them as subtle prompts for saving. However, you can add memories manually in Settings > Memory.

</details>

---

<details>
<summary><strong>😄 Emoji Reactions &amp; Read Receipts</strong></summary>
<br>

**You** can leave up to 3 emoji reactions on any message — a heart, a laugh, a fire, a bolt, and more. Reactions do more than look good: they're wired into the emotion engine and nudge the character's emotional state when you use them.

**Characters** react back. After processing your message, the character may leave a single emoji reaction on your bubble — not randomly, but based on what they authentically would feel in that moment given their current emotional state. A character who's been warm and trusting will react differently to the same message than one who's been hurt or distant.

**Read receipts** show the status of your outgoing messages — sent, delivered, read, or ghosted — with timing influenced by the character's current emotional state. A character in a withdrawn mood might leave you on read a little longer.

</details>

---

<details>
<summary><strong>👥 Character &amp; Group Selection</strong></summary>
<br>

Click the character's name in the panel header to open the **Character Picker** — a searchable list of your entire SillyTavern library.

- ⭐ **Favorites** — Star your most-visited characters for instant access at the top
- 👥 **Group Chats** — Jump directly into a multi-character group session
- 🔍 **Search** — Filter by name in real time

![Character picker dropdown with favorites, group chats, and full character list](https://github.com/user-attachments/assets/2bf261b9-ff9e-4e7f-83bb-686e7aeaaf21)

In **Group Chat** mode, a member bar appears at the bottom of the panel with quick-switch buttons for each character. Each member has their own independent emotional state, proactive schedule, and chat history. Unread indicators pulse on members who have sent a proactive message while you were focused elsewhere.

</details>

---

## Getting Started

### Installation

1. Open SillyTavern and navigate to **Extensions → Install Extension**
2. Paste the repository URL:
   ```
   https://github.com/mattjaybe/SillyTavern-EchoText
   ```
3. Click **Install** — EchoText will appear in your Extensions panel

Once installed, a small floating button will appear in your SillyTavern window. Click it to open the panel.

![The EchoText floating action button in the SillyTavern interface](https://github.com/user-attachments/assets/78a923ee-9eea-473a-ab98-96ca30043ac9)

### Optional Server Plugin:

Due to how browsers work, when you tab away from SillyTavern or minimize the browser, the proactive messaging in EchoText pauses. To bypass this limitation and allow characters to message you even when SillyTavern isn't visible, install the server plugin. To learn more and to install the server plugin, visit <a href="https://github.com/mattjaybe/SillyTavern-EchoText-Proactive/">https://github.com/mattjaybe/SillyTavern-EchoText-Proactive/</a>

### First Steps

1. Click the floating button to open the EchoText panel
2. Click the character name at the top to pick who you want to text
3. Open **Settings** (the three-dot menu → Settings) and choose a **Generation Source**
4. Start texting

---

## Generation Sources

EchoText generates responses through its own configurable pipeline — independently from SillyTavern's main connection if you prefer.

| Source | Description |
|:---|:---|
| **Default** | Uses SillyTavern's currently active connection |
| **Connection Profile** *(recommended)* | Uses a saved ST Connection Profile — ideal for a dedicated EchoText model |
| **Ollama** | Connects directly to a local Ollama instance |
| **OpenAI-compatible** | Any OpenAI-format API endpoint with your own key |

---

## Requirements

- [SillyTavern](https://github.com/SillyTavern/SillyTavern) — latest stable version recommended
- A text generation backend (anything SillyTavern supports)
- *(Optional)* SillyTavern's Image Generation plugin enabled and connected for image generation features

---

<div align="center">

Made by **mattjaybe**

*EchoText is a fan-made extension for SillyTavern and is not affiliated with or endorsed by the SillyTavern project.*

</div>
