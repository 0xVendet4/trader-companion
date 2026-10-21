# Transcription System Spec

## Engine selection

The active engine is derived at runtime in `OpenAI.js` from:
1. `transcription_model` localStorage key → `providerUtils.js:deriveTranscriptionFromModel()` (primary path)
2. Legacy fallback: `localTranscriptionEngine` prop + `appleNativeTranscriptionEnabled` → `deriveTranscriptionEngine()`

Result is one of: `'openai'` | `'gemini'` | `'apple_native'` | `'local'` | `'none'`

## The four engines

### OpenAI Realtime (WebSocket)
- Hook: `useOpenAIRealtimeClient.js`
- Client: `src/utils/RealtimeWhisper.js`
- Auth: `openai_api_key`
- Protocol: WebSocket to `wss://api.openai.com/v1/realtime` (or custom WS base URL)
- Config from appConfig: `openai_vad_silence_duration_ms`, `openai_realtime_transcription_model`
- Supports dual audio: separate input (ME) and output (THEY) WebSocket connections

### Gemini Realtime
- Hook: `useGeminiRealtimeClient.js`
- Client: `src/utils/GeminiRealtime.js` + `src/utils/geminiLiveModel.js`
- Auth: `gemini_api_key`
- Config: `gemini_vad_silence_duration_ms`, `gemini_chunk_*` (8 params), `gemini_context_clear_interval_ms`
- Supports dual audio
- Model: `gemini_live_default_model` / `gemini_live_models` appConfig

### Apple Speech (macOS only)
- Hook: `useAppleSpeechClient.js`
- Client: `src/utils/AppleSpeechRealtime.js` → IPC → `electron/apple-speech/AppleSpeechService.js`
- No API key — native macOS Speech Recognition framework
- Platform guard: `window.electronAPI?.platform === 'darwin'`
- Language availability checked via `window.electronAPI.appleSpeech.checkAvailability()`
- On-device asset download tracked via `onAssetStatus` event stream
- Fallback: if Apple Speech fails and Local Whisper is installed, auto-falls back; then falls back to cloud

### Local Whisper (Whisper.cpp)
- Hook: `useLocalWhisperClient.js`
- Client: `src/utils/LocalWhisperRealtime.js` → IPC → `electron/local-whisper/`
- Server: Whisper.cpp binary launched as child process by `LocalWhisperService.js`
- Model management: `WhisperModelManager.js` — download, verify, list
- GPU: `localWhisperGpuPreference.js` (Metal on macOS, CUDA on Windows)
- Config: `local_whisper_user_mic_*`, `local_whisper_vad_*` appConfig keys
- Language: `resolveLocalWhisperLanguage(selectedLanguage, appLanguage)` from `localWhisperLanguage.js`

## Dual audio

When `whisper_output_device_id` is set, both ME and THEY channels are captured:

```
whisperDeviceId      → ME  channel → speaker "ME"
whisperOutputDeviceId → THEY channel → speaker "THEY"
```

Transcription messages accumulate in `conversationMessageQueueRef` as `{ speaker, text, timestamp }`. On submit (Cmd+D), messages are sorted by timestamp and formatted as:
- **Dual mode**: `<conversation><speaker id="user">...</speaker><speaker id="others">...</speaker></conversation>`
- **Single mode**: concatenated text

System audio loopback (`whisperOutputDeviceId = 'system-audio'`) uses `electron-audio-loopback` via the `audio-driver` IPC handler.

## Transcription compaction

When `transcription_compact_enabled` and live transcript exceeds `transcription_compact_line_threshold` lines:

1. Idle timer fires after `transcription_compact_idle_ms` ms
2. Min `transcription_compact_min_new_lines` lines since last cutoff required
3. LLM summarizes old lines using `compact_system_prompt` variant
4. `transcriptionCompactionManager.set({ summary, cutoffIndex })` stores result
5. On next request: summary + recent tail sent as `transcriptionContext`

The compaction manager (`src/utils/transcriptionCompaction.js`) is a singleton with epoch tracking to discard stale results after session end.

## User mic capture control

`useUserMicCaptureControl.js` manages enabling/disabling the user's mic independently from the THEY channel. Toggle via `Cmd+M` or `toggleUserMicCapture()`.

## Pause/resume

`isTranscriptionPaused` state in `OpenAI.js`. The pause toggles audio capture without disconnecting the transcription session.

## Lifecycle on submit (Cmd+D)

When transcription is active and user presses Cmd+D:
1. Force-commit any buffered audio: `forceCommitAndWaitForFinalTranscription()` on active client(s)
2. Flush remaining accumulated text into `conversationMessageQueueRef`
3. Sort queue by timestamp, build final text
4. Save transcriptions to DB (`databaseService.addTranscriptionsBulk`)
5. Call `processTranscription(finalText)` → debounced → `handleSubmit()`
6. Clear accumulated buffers; session continues running

## Language selection

- Language picker in `UnifiedSessionModal` → `selectedLanguage` state
- Apple Speech: validated against `appleSupportedLocales` — unsupported languages reset to `'auto'`
- Local Whisper: resolved via `resolveLocalWhisperLanguage(selectedLanguage, appLanguage)`
- OpenAI / Gemini: passed directly to API
