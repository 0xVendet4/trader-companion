# MCP & Integrations Spec

## MCP framework

Uses `@modelcontextprotocol/sdk` 1.27.1. Tools are discovered at session start and injected into AI requests.

### Client

`src/utils/mcpClient.js` — connects to MCP servers defined on an assistant (`selectedAssistant.mcpServers`). Each server has a type (stdio / sse / streamable-http) and connection config.

### Tool lifecycle

1. `mcpConnectToolsStartup.js` — on session start, connects to all configured MCP servers
2. `mcpConnectTools.js` — manages active tool connections, promotes tool IDs to session
3. `mcpInterpreter.js` — interprets MCP tool results, handles errors and retries
4. `mcpWorkflow.js` — orchestrates multi-step MCP workflows
5. `openAiMcpSession.js` — prepares MCP session config for OpenAI Responses API requests

Tools appear in `TextInputConnectors` (ActionBar UI) and `HeaderSessionToolsMenu`.

### MCP token management

`mcpConnectToolTokens.js` — manages OAuth tokens for MCP tools that require auth.

## Google MCP integration

OAuth flow for Google Workspace tools (Docs, Sheets, Calendar, etc.):

1. User clicks "Connect Google" in `ConnectToolsPanel`
2. `useManagedGoogleConnect.js` / `googleMcpAuth.js` initiates OAuth
3. Main process handles the OAuth redirect via `electron/ipc/mcp-oauth/`
4. Token stored and refreshed by `mcpGoogleAuthRefresh.js`
5. External OAuth variant: `googleMcpExternalOAuth.js` (feature flag: `google_mcp_external_oauth_enabled`)
6. Reconnect flow: `GoogleMcpReconnectAction.js` + `googleMcpReconnect.js`

Config keys:
- `google_mcp_oauth_client_id` appConfig
- `google_mcp_oauth_token_url` appConfig

Sheets fallback: `mcpSheetsFallback.js` handles Sheets data when the MCP tool is unavailable.

## Obsidian integration

Detection (automatic):
- `electron/ipc/obsidian/index.js` probes `http://localhost:27123` and `https://localhost:27124` for the Obsidian local REST API
- `src/utils/obsidianSessionAvailability.js` — checks availability from renderer

Export flow:
- `obsidianSummaryExport.js` — POSTs session summary to Obsidian REST API as a new note
- `ObsidianEndSessionPrompt` — UI prompt shown at session end when Obsidian is available
- Path/vault configured by the user in settings

## Session MCP auto-trigger

`sessionMcpAutoTrigger.js` — automatically triggers MCP tool calls at configurable points in the session (e.g., on session start/end, on keyword detection).

`sessionMcpContext.js` — builds the MCP context injected into AI requests for session-aware tools.

## MCP UI components

| Component | Role |
|---|---|
| `ConnectToolsPanel` | Shows all available MCP tools, connection status |
| `ConnectToolSetup` | Per-tool configuration UI |
| `ConnectToolLogo` | Tool icon resolver (Obsidian, Google, etc.) |
| `ConnectToolsTabCue` | Badge/cue in the Settings tab header |
| `TextInputConnectors` | Tool selector inline in the text input |
| `HeaderSessionToolsMenu` | Active tools menu in overlay header |

## MCP settings tab

`src/components/settings/McpTab.js` — enabled by `mcp_settings_enabled` feature flag (off by default). Shows configured MCP servers and connection management.
