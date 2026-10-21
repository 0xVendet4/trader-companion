# AI Providers Spec

## Provider selection

`App.js` derives `selectedProvider` from `current_provider` in localStorage and the active model. The selection flows down as props to `OpenAI.js` → `AnalyzerService.queueRequest({ provider })`.

`providerUtils.js:deriveProviderFromModel(model)` maps model IDs to providers. `appAnalysisSelection.js:resolveAppAnalysisSelection()` computes the full selection object including `usesCodexOAuth`.

## Providers

### OpenAI (API key)
- Auth: `openai_api_key` localStorage or `openai_api_key` appConfig default
- Uses **Responses API** (`/v1/responses`) with streaming — NOT Chat Completions
- Caller: `src/utils/openAIResponses.js:callOpenAIResponsesStream()`
- Default model: from `openai_default_model` appConfig
- Available models (from appConfig): `gpt-4.1`, `gpt-4o`, `gpt-4o-mini`

### Codex (OAuth — no API key)
- Auth: Microsoft OAuth via `electron/codexAuth.js`, token managed by main process
- Renderer detects via `window.electronAPI?.codexApi` presence
- `openai_auth_method` localStorage = `'codex_oauth'` when active
- Uses same `callOpenAIResponsesStream()` path; `AnalyzerService` resolves the token async
- Default model: `codex_default_model` appConfig (e.g. `gpt-5.3-codex`)
- Available models: `gpt-5.4`, `gpt-5.4-mini`, `gpt-5.3-codex`

### Gemini
- Auth: `gemini_api_key` localStorage
- Caller: `src/utils/Gemini.js:geminiGenerate()` / `geminiAnalyzeImages()`
- Package: `@google/genai` 1.16.0
- Default model: `gemini_default_model` appConfig (e.g. `gemini-2.5-flash`)
- Available: `gemini-2.5-flash-lite`, `gemini-2.5-flash`, `gemini-3-flash-preview`

### OpenRouter
- Auth: `openrouter_api_key` localStorage
- Caller: `src/utils/customApiResponses.js` (OpenAI-compatible endpoint)
- Default model: `openrouter_default_model` appConfig
- Available: kimi-k2, claude-3.5-sonnet, gpt-4o, gpt-4o-mini, gemini-pro, llama-3.1-70b, mistral-7b

### Custom API
- Endpoint: `custom_api_base_url` localStorage (any OpenAI-compatible server)
- Auth: `custom_api_key` localStorage (optional — defaults to `'ollama'`)
- Headers: `custom_api_headers` localStorage (JSON array of `{key, value}`)
- Model: `custom_api_model` localStorage
- Caller: `src/utils/customApiResponses.js:callCustomAPIResponsesStream()`

### Local LLM
- No API key — llama.cpp server started by Electron main process
- Renderer talks via `window.electronAPI.localLlm.*` IPC
- Caller: `src/utils/localLLM/LocalLLMProvider.js`
- Model selected via `local_llm_analyzer_model` localStorage
- GPU: CUDA bundle on Windows (`electron/local-llm/windowsCuda.js`)
- Performance presets: safe/balanced/fast (ctxSize, gpuLayers, batchSize, temp, maxTokens) from `local_llm_performance_mappings` appConfig

## AnalyzerService dispatch

```js
switch (this.currentRequest.provider) {
  case 'openai':   → callOpenAIResponsesStream()
  case 'gemini':   → geminiGenerate() / geminiAnalyzeImages()
  case 'openrouter': → callCustomAPIResponsesStream() (OpenRouter base URL)
  case 'custom':   → callCustomAPIResponsesStream() (user base URL)
  case 'local':    → localLLMStream()
}
```

Results stream via `AnalyzerEventBus.emit(requestId, { type: 'stream', fullResponse, isComplete })`.

## Feature presets

Each provider call uses a feature preset (temperature, maxOutputTokens, thinkingBudget) from `appConfig:feature_presets`:

| Preset | Used for |
|---|---|
| `analysis` | Main ASK requests |
| `tldr` | Session summary / TLDR generation |
| `mcp` | MCP tool requests |
| `followUp` | Follow-up questions |
| `realtimeSummary` | Live transcription insights (Notch) |
| `realtimeSummaryMeta` | Metadata extraction for Notch |
| `realtimeSummaryEval` | Notch insight evaluation |
| `translation` | Translation requests |

## Translation provider

A separate model for translation (`translation_model` / `translation_model_source` localStorage). When set, all translation calls use this model regardless of the main analysis provider. Falls back to `translation_model_openai` / `translation_model_gemini` from appConfig.

## Conversation compaction

When conversation history exceeds `compact_auto_token_threshold` tokens (estimated as chars/4):
1. Compaction triggers after `compact_auto_idle_ms` idle delay
2. Min `compact_auto_min_new_messages` new messages since last cutoff required
3. LLM summarizes old messages using `compact_system_prompt` / `compact_update_system_prompt`
4. Compacted summary replaces old messages in subsequent requests

Kill switch: `auto_compact_enabled` localStorage or `compact_auto_enabled` appConfig.
