# Feature Specs

## Notch / Proactive Insights

A separate BrowserWindow (`notchBubble.js`) that shows AI-generated insights in real time while the user speaks.

### Notch modes

Configured via `notch_mode` localStorage and the Notch mode config (`notchMode.js:getNotchModeConfig()`):

| Mode | questionTrigger | screenSelection | periodic | userSilence |
|---|---|---|---|---|
| `only_questions` | ✓ | ✗ | ✗ | ✗ |
| `moderate` | ✓ | ✓ | ✗ | ✗ |
| `proactive` | ✓ | ✓ | ✓ | ✓ |
| `full_power` | ✓ | ✓ | ✓ | ✓ (shorter intervals) |

Insight generation: `useRealtimeSummary.js` → `RealtimeSummaryClient.js` → provider-specific client in `utils/realtimeSummary/providers/`. Updates every 10 seconds while transcription is active.

`notchBubbleState.js` — tracks whether the notch is visible, pinned, and its current insight content.

`suggestionSensitivity` (0–100) — controls how eagerly new suggestions appear. Stored in localStorage.

## Select-to-Prompt (Accessibility)

Reads text selected in any app and automatically sends it to the AI.

- macOS: Accessibility API
- Windows: UI Automation (UIA) via 
-  detects when a selection is present
-  generates insights from selected text
-  updates TLDR/summary from selection
- Toggle: `selectToPromptEnabled` localStorage

Screen selection presence prompt (`screen_selection_presence_prompt` appConfig) classifies whether a screenshot shows a visible selection (YES/NO).

## Screen Capture & Image Analysis

- Capture: `window.electronAPI.captureScreenshot(displayId)` → Electron screen capture
- Permission check: `checkScreenCapturePermission()` → macOS TCC prompt
- Paste: Cmd+V paste handler in `useScreenCapture.js` picks images from clipboard
- `screenshot_auto_analyze` localStorage — auto-submit on capture without Cmd+Enter
- Multiple images per request (managed by `useImageManager.js`)
- Image preprocessing: `src/utils/imagePreprocessor.js` — validates, normalizes, strips empty images

## Assistants

Custom assistants configured in `AssistantsModal.js`. Stored in localStorage (and optionally synced via settings window).

Each assistant has:
- `id`, `name`
- `systemPrompt` — custom system prompt
- `requireCertainty` — forces the AI to express confidence level
- `mcpServers` — list of MCP servers to activate for this assistant
- `knowledgeFiles` — array of `{ name, content }` text/PDF files

Knowledge files are loaded via `assistantKnowledgeFiles.js`:
- Accepts: `.txt`, `.md`, `.json`, `.js`, `.jsx`, `.ts`, `.tsx`, `.css`, `.html`, `.xml`, `.csv`, `.log`, `.py`, `.java`, `.c`, `.cpp`, `.h`, `.swift`, `.kt`, `.go`, `.rs`, `.rb`, `.php`, `.sh`, `.pdf`
- PDFs: parsed with `pdfjs-dist` — text extracted page by page

The assistant system prompt + knowledge file contents are prepended to the system prompt via `assistantHelpers.js:getDefaultSystemPrompt()` / `buildUserTextWithAutomaticSessionMcp()`.









