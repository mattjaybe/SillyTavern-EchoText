<div align="center">

# 💬 EchoText

### Text your characters. Like, actually text them.

A [SillyTavern](https://github.com/SillyTavern/SillyTavern) extension that adds a floating, iMessage-style chat panel — a private side channel for casual, intimate conversations with any character, while your roleplay continues in the background.

[![Version](https://img.shields.io/badge/version-1.2.0-blue.svg)](manifest.json)
[![SillyTavern](https://img.shields.io/badge/SillyTavern-Extension-orange.svg)](https://github.com/SillyTavern/SillyTavern)

</div>

---

<div align="center">
   
   ![EchoText running alongside SillyTavern's main roleplay](https://github.com/user-attachments/assets/08f4bef1-1da0-4bdf-91bb-26012fb40e0d)

</div>

*EchoText floating alongside SillyTavern's main roleplay window — two separate conversations, one seamless interface.*

---

Most character AI interactions feel like a stage performance. Every message is a scene. EchoText adds something different: a **private texting channel** where a character feels less like an actor and more like someone you actually know.

It lives as a draggable, resizable panel floating over SillyTavern. Text a different character than the one you're roleplaying with. Use it as a quiet side-channel alongside an ongoing story. Or step away from roleplay entirely and just... talk. Characters develop real emotional states, remember meaningful moments, send you messages on their own, and can even share photos.

---

## Updates

**v1.2.0**:
* New Feature: More granular World Info / Lorebook control. Four new options: Minimum Order, Order Range, Targeted Order, and Custom. You can set it globally in Settings > Context or per-character in Untethered mode's Context overrides
* Setting: Gemma 4's unique thinking/reasoning tag added to list of Strip Reasoning Tags. Note: if you don't see gemma4 in the list under Tags to Strip, click on Reset for it to show
* Setting: Custom Pattern option for any future models with unique tags or strings for stripping out thinking/reasoning
* Bug Fix: Image Generation, selfie requests not working correctly in certain circumstances

**v1.1.5**:
* New Feature: Persona added as a Context override option, works per-character
* Setting: Strip Reasoning Tags, enabled by default, allows you to strip out all context enclosed within thinking/think/though/reasoning/reason tags. Can also add your own tags to the list to be stripped for any models that use unique tags or for future compatibility.
* Bug Fix: Swiped Messaging not enabling properly on mobile

**v1.1.0**:
* New feature: Context overrides in Untethered mode - overrides character's Description, Personality, Scenario, Texting Style). New 'Context' menu option for Untethered chat.
* New feature: Added ability to import chat
* New feature: Added two export options: JSON (importable, includes emotion states/chat influence/group characters settings) and Markdown (for sharing and archiving)
* New feature: Custom theme editor, add your own themes to EchoText
* Settings: Author's Note added as an option in Settings > Context, uses SillyTavern's Character Author's Note
* Bug Fix: Proactive Messages outputting redundant messages
* Bug Fix: React and/or Menu buttons being cut-off or hidden when using a character with a long name
* Bug Fix: Image Generation process triggering even when the setting is disabled
* Bug Fix: SillyTavern theme option now uses the proper colors
* Bug Fix: When in a group chat, the group panel remained when selecting a single character in certain circumstances
* Added missing MIT license

---

## Feature Overview

| | Feature | What it does |
|:---:|:---|:---|
| 🔗 | **Tethered Mode** | Chat with character's awareness of your SillyTavern roleplay with them |
| ⛓️‍💥 | **Untethered Mode** | Standalone conversation — set chat influence for the character |
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
<summary><strong>🔗 Tethered Mode &amp; ⛓️‍💥 Untethered Mode</strong></summary>
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
<summary><strong>⚙️ Settings Reference</strong></summary>
<br>

Everything is accessible from the EchoText Settings, opened via the three-dot overflow menu in the panel header. Settings are divided into accordion sections for a clean, uncluttered view.

---

#### General

| Setting | Description |
|:---|:---|
| **Enable EchoText** | Master on/off toggle for the floating button and panel |
| **Dynamic Emotion System** | Track the character's emotional state across all 9 Plutchik emotions |
| **Swiped Messages** | Save previous AI responses when regenerating a message. |
| **Auto-Open on Reload** | Automatically open the panel when SillyTavern loads |
| **Auto-Load Last Character** | Resume with the character you were texting in the previous session |
| **Auto-scroll to Latest** | Keep the chat scrolled to the newest message automatically |
| **Verbosity Default** | Set a default reply length: Short, Medium, or Long. Adjustable per-message from the bubble menu |
| **Show Character Avatar** | Display the character's avatar (or an initial circle) next to their messages |

---

#### Generation Engine

Choose where EchoText sends its generation requests — independently from whatever SillyTavern's main chat is using.

| Source | Notes |
|:---|:---|
| **Default (Main API)** | Uses SillyTavern's currently active connection |
| **Connection Profile** ⭐ | Recommended — pick any saved ST Connection Profile for a dedicated EchoText model |
| **Ollama** | Direct connection to a local Ollama instance |
| **OpenAI Compatible** | Any OpenAI-format endpoint — LM Studio, KoboldCPP, TextGen WebUI, vLLM, and more |

---

#### Context

Control what background information the character has access to when generating replies.

| Toggle | What it includes |
|:---|:---|
| **EchoText Messages** | Recent messages from the EchoText conversation itself |
| **SillyTavern Context** | *(Tethered mode)* Silently reads recent ST chat to detect emotional state — the character carries their roleplay mood into EchoText without those messages appearing in the conversation |
| **Character Description** | The character's description field from their card |
| **Personality** | The character's personality field |
| **Scenario** | The scenario/world context from the character card |
| **Your Persona** | Your active SillyTavern persona |
| **World Info / Lorebook** | Active World Info entries with four options to choose from |
| **Strip Reasoning Tags** | Remove AI reasoning/thinking tag blocks from messages before they enter context |

---

#### Appearance

| Setting | Description |
|:---|:---|
| **Theme** | 8 built-in visual themes with distinct color palettes |
| **Theme Editor** | Create and add your own custom themes to EchoText |
| **Font Size** | 10–24px slider |
| **Font Family** | Choose from a curated list of Google Fonts, loaded live |
| **Glassmorphism Blur** | Controls the frosted-glass background blur (0–40px) |
| **Panel Opacity** | How transparent the panel background appears (20–100%) |
| **Line Spacing** | Space between lines within a bubble (1.0–2.0) |
| **Message Spacing** | Vertical gap between bubbles (2–24px) |

---

#### Action Button

| Setting | Description |
|:---|:---|
| **Button Size** | 22–76px slider for the floating action button |
| **Button Opacity** | Set the opacity of the action button from 10% to 100% |
| **Button Icon** | Choose from 10 icons: Comment Dots, Message, Comments, Mobile, Robot, Heart, Star, Bolt, Fire, or Magic |

---

#### Proactive Messages

Set how often and under what conditions the character reaches out on their own.

| Activity Level | Frequency |
|:---|:---|
| **Quiet** | ~1–2 messages per day. Minimal API usage, great for token budgets |
| **Relaxed** | ~3 messages per day. A gentle, unobtrusive presence |
| **Natural** *(default)* | Dynamic, emotion-influenced frequency — roughly 4–6 per day when active |
| **Lively** | ~6–8 per day. More ready to reach out when emotions are elevated |
| **Expressive** | No frequency floor — the trigger system drives everything |
| **Custom** | Set your own minimum gap with a slider (15 min – 12 hours) |

**Emotion-Driven Urgency** — When enabled, strong anticipation or sadness can shorten the wait between messages. Anger and disgust extend it (or trigger a ghost window where the character delays responding).

The **Proactive Insights** panel displays a live summary: current character, check cadence, when you last messaged, when the character last replied, and the most recent trigger type. A **Trigger Timeline Diagnostics** accordion shows which trigger types are currently armed and why, useful for understanding the character's behavior.

---

#### Memory System

| Setting | Description |
|:---|:---|
| **Enable Memory System** | Inject relevant shared memories into the system prompt during generation |
| **Auto-Highlight Memories** | Scan your messages for memorable content and highlight it. Click any highlight to save it as a memory |
| **Highlight Style** | Choose how highlights appear: Dotted Underline, Soft Glow, Shimmer, or Accent Bar |
| **Memory Scope** | **Per Character** — each character keeps their own memory pool. **Global** — memories shared across all characters |

The memory list lives directly in Settings. Add memories manually with a label, category, and description. Pin a memory to ensure it's always injected, or leave it unpinned to let EchoText rotate it organically.

---

#### Image Generation

| Setting | Description |
|:---|:---|
| **Enable Image Generation** | Allow characters to respond to natural-language image requests with generated images |
| **Include Text Alongside Image** | When enabled, the character also sends a short in-character message with the photo |

An expandable **"What triggers image generation?"** reference section lists all recognized phrase patterns across five categories — selfie requests, photo/sharing requests, drawing requests, make/create requests, and affirmative replies to character-offered images — with copyable example phrases.

> Requires SillyTavern's **Image Generation** extension enabled and configured with a working image source (ComfyUI, Gemini, etc.).

<div align="center">
   
![The EchoText Settings panel that lets you set all your preferences](https://github.com/user-attachments/assets/baf47bb2-8aa9-4251-882d-9dd7cf8ff9db)

</div>

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

<div align="center">
   
   ![Emotional state popup showing all 9 Plutchik emotions with current values](https://github.com/user-attachments/assets/03917a76-45d3-4a45-bcde-ce66b1d70423)

</p>

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

In the menu, you'll find Context. Here, you can override the global Context information in Settings with tragerted, per-character context. Change the Description, Scenario, Personality, Lorebook entries, Persona, and Texting Style.

Your active selections appear as colored icon badges in the panel header for a quick at-a-glance reminder. Chat Influence settings are also saved and restored with Chat Archives, so loading an old conversation brings back exactly the flavor it had.

<div align="center">
   
![Chat Influence menu with mood selection grid](https://github.com/user-attachments/assets/1564f2e6-cf10-4f20-bf83-c7aa65a05a1c)

</div>

<div align="center">
   
![Chat panel in Untethered mode with influence badges visible in the header](https://github.com/user-attachments/assets/e4587bad-1d6c-402d-9260-7ed56499b3da)

</div>

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

<div align="center">

![Full-screen lightbox view of a generated image with prompt details below](https://github.com/user-attachments/assets/53902d7a-7f8e-4461-8679-f7c7f90d3554)

</div>

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

<div align="center">

![Character image gallery showing a grid of generated images with titles and prompts](https://github.com/user-attachments/assets/1638cf5d-1149-4322-8356-1d7173045e47)

</div>

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

<div align="center">

![Chat Archives modal with message preview and emotional state bars](https://github.com/user-attachments/assets/b9a178b3-1c22-4210-97df-bcbb477ac293)

</div>

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
| ⭐ **Favorites** | Preferences and things you love |
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

<div align="center">

![Character picker dropdown with favorites, group chats, and full character list](https://github.com/user-attachments/assets/2bf261b9-ff9e-4e7f-83bb-686e7aeaaf21)

</div>

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

<div align="center">

![The EchoText floating action button in the SillyTavern interface](https://github.com/user-attachments/assets/78a923ee-9eea-473a-ab98-96ca30043ac9)

</div>


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

## More Extensions

<table>
<tr>
<td width="33%" valign="top">

### 🗣️ [EchoChamber](https://github.com/mattjaybe/SillyTavern-EchoChamber)

**Bring your stories to life with an AI-powered audience.**

EchoChamber generates a live reaction feed that runs alongside your SillyTavern roleplay. Reactions appear as a scrolling stream below your chat in whatever flavor fits the scene — a Discord server blowing up, a Twitter thread going viral, a Breaking News ticker, or MST3K-style commentary roasting your story in real time.

- 11+ chat styles built-in, including NSFW styles
- Build and share your own custom styles
- Chat *with* the audience — @mention individual commenters and get replies
- Livstream mode turns the feed into a rolling live chatroom
- Flexible panel: Bottom, Top, Left, Right, or floating pop-out
- Uses your existing SillyTavern connection or its own dedicated backend

</td>
<td width="33%" valign="top">

### 🧭 [Pathweaver](https://github.com/mattjaybe/SillyTavern-Pathweaver)

**Never stare at a blank prompt again.**

Pathweaver adds a control bar above your SillyTavern chat input that generates up to 6 story suggestions on demand. It reads your current conversation to understand exactly where the story is, then serves up tailored options — from genre-faithful "what happens next" continuations to curveball plot twists and new character entrances.

- 8 suggestion types: Context-Aware, Plot Twist, New Character, Director, Surprise Me, Explicit, Genre, and Custom
- **Director Mode** lets you type your own scene direction and get targeted suggestions
- **Surprise Me** secretly plants a suggestion that triggers later in the story
- Cards can be Copied, Inserted into your input, or Sent directly
- Works on desktop and mobile

</td>
<td width="33%" valign="top">

### 🌈 [Larson](https://github.com/mattjaybe/SillyTavern-Larson)

**A beautifully animated status bar that makes waiting feel intentional.**

Larson replaces SillyTavern's static generation indicator with a full-width animated bar above your message input. Eight distinct animation styles, three independently configurable states (Generating, Thinking, Idle), and an extensive theming system including a custom 4-color creator.

- **8 animations:** Gradient, Breathe, Pulse, Cylon, Segment, Glitch, Liquid, Convergence
- Each state (Generating / Thinking / Idle) has its own animation, speed, and color
- 9 built-in themes + custom theme creator with live preview
- Smart thinking detection for reasoning-capable models
- Click the bar to instantly access all settings
- Lightweight, mobile-optimized

</td>
</tr>
</table>
