# AI v1 — Chat & Análise de Site

Adicionado em outubro de 2026. Introduz capacidade de IA à Candy em duas frentes: um painel de chat conversacional e análise automática de sites de projetos cripto via drag-and-drop de URL.

---

## O que foi entregue

| Feature | Descrição |
| --- | --- |
| **Chat overlay** | Aba de chat dentro da island; o usuário conversa com a Candy (OpenAI GPT-4o-mini) |
| **Análise de site** | Soltar uma URL HTTPS na island dispara busca de HTML + RDAP + DNS MX e gera um resumo estruturado via IA |
| **Desktop balloon** | Quando o mascot flutuante está visível, o resultado da análise aparece como balão de fala ao lado do avatar |
| **Shortcut global** | `⌘⌥C` (Mac) / `Ctrl+Alt+C` (Windows/Linux) abre e fecha o painel de chat |

O provedor de IA desta versão é exclusivamente OpenAI. A chave é armazenada em `settings.json` local junto com as demais configurações — sem keychain do SO, sem telemetria.

---

## Arquitetura

### Módulos novos em `src/ai/`

Todos são TypeScript puro — sem dependência de DOM ou Tauri, totalmente testáveis.

| Arquivo | Papel |
| --- | --- |
| `types.ts` | Interface `AiProvider`, tipo `ChatMessage`, classe `AiError` (kinds: `invalid-key`, `rate-limit`, `network`, `generic`) |
| `openai.ts` | `OpenAiProvider` — métodos `sendMessage`, `summarize`, `analyze`; modelo fixo `gpt-4o-mini`; em Tauri passa pelo Rust, em browser usa proxy Vite `/api/openai` |
| `prompts.ts` | Funções puras de montagem de prompt: `buildSystemMessage`, `buildSummarizeMessages`, `buildAnalyzeMessages` |
| `extract.ts` | `extractPageContent(html)` — remove nav/footer/scripts, coleta título + h1–h6 + p + li, trunca a 8 000 chars |
| `rdap.ts` | `parseRdap(json)` — registrador, datas de criação/expiração, nameservers (até 4), código de país do vcard `adr`; `countryName(cc)` traduz para PT-BR |
| `dns.ts` | `parseDoh(json, type)` — extrai registros A / MX / TXT da resposta DoH da Cloudflare |
| `chat-channel.ts` | Pub/sub leve: `registerChatChannel` + `pushChatMessages` — desacopla `companion.ts` de `chat.ts` sem dependência circular |

### Fluxo de análise de site

```
usuário solta URL na island
  └─ island.ts detecta kind "project-url"
       └─ companion.analyzeProjectUrl(url)
            ├─ pushChatMessages([{role:"user", content:url}, {role:"assistant", content:"Analisando…", id:thinkingId}], openChat=true)
            ├─ Promise.allSettled([
            │    Bridge.fetchPage(url),       // Rust → HTML
            │    Bridge.rdapLookup(domain),   // Rust → IANA RDAP
            │    Bridge.dnsLookup(domain,"MX") // Rust → Cloudflare DoH
            │  ])
            ├─ OpenAiProvider.analyze(url, content, rdap, mx)
            │    └─ buildAnalyzeMessages() → prompt PT-BR com formato fixo
            └─ pushChatMessages([{role:"assistant", content:resultado, id:thinkingId}])
                 └─ chat.ts encontra elemento data-id=thinkingId e atualiza in-place
```

Se não houver chave OpenAI, o fallback monta um texto só com os dados RDAP/DNS.

### Formato da resposta de análise

O prompt força a IA a retornar exatamente estas cinco seções em português:

```
📌 **Resumo:** [1–2 frases sobre o projeto]
🏷️ **Categoria:** [DeFi | NFT | Layer 1/2 | Exchange | Memecoin | GameFi | Infraestrutura | Outro]
🌐 **Domínio:** [país · registrador · data de registro · validade]
🔧 **Infraestrutura:** [nameservers / provedor · e-mail: sim ou não]
⚠️ **Alertas:** [red flags, ou "Nenhum"]
```

### Chat overlay no DOM

O painel é construído por `buildChatOverlay()` e inserido como **irmão** de `#island-clip` dentro de `#island`. Isso o coloca fora do `overflow: hidden` do clip, então ele pinta sobre o fundo da island sem ser cortado.

```
#island
  ├── #island-clip  (overflow: hidden — tudo dentro é recortado na forma da island)
  ├── #chat-overlay (position: absolute; z-index: 2 — fora do clip)
  └── .mascot       (fica por cima de tudo)
```

Mensagens com `id` opcional suportam upsert: se já existe um elemento `[data-id]` na lista, o texto é substituído in-place em vez de criar nova mensagem. Isso permite o padrão "placeholder → resultado" sem flash.

---

## Arquivos modificados

| Arquivo | O que mudou |
| --- | --- |
| `src/views/chat.ts` | Reescrito: `buildChat` (spacer invisível para o sistema de abas) + `buildChatOverlay` (painel real) |
| `src/companion.ts` | `analyzeProjectUrl` usa `pushChatMessages` + `provider.analyze`; não emite mais o evento `project-analysis` |
| `src/island/island.ts` | Integra `chatOverlay`, roteia shortcut `"chat"`, constrói o overlay como sibling do clip |
| `src/desktop/main.ts` | Handler do evento `desktop-say` chama `mascot.say(text, ms)` |
| `src/core/shortcuts.ts` | `ShortcutId` inclui `"chat"` com default `CommandOrControl+Alt+C` |
| `src/mascot/desktop-logic.ts` | `DESKTOP_EVENTS.say = "desktop-say"` |
| `src/style.css` | Estilos do `#chat-overlay` e das mensagens (`.chat-msg.user`, `.chat-msg.assistant`, etc.) |
| `src/ai/rdap.ts` | `RdapInfo` ganhou `country` e `nameservers`; adicionado `countryName()` |
| `src/ai/rdap.test.ts` | Testes cobrem os novos campos e `countryName` |
| `src/i18n/*.ts` | Chave `"Open / close Chat"` adicionada nos 9 idiomas |
| `src-tauri/src/lib.rs` | Comandos `fetch_page`, `rdap_lookup`, `dns_lookup` com validação SSRF (`is_safe_project_url`) |
| `src/core/bridge.ts` | Métodos `fetchPage`, `rdapLookup`, `dnsLookup` |

---

## Segurança

- **SSRF:** o lado Rust valida que toda URL passada por `fetch_page` / `rdap_lookup` / `dns_lookup` usa `https` e não aponta para IP privado (10.x, 192.168.x, 127.x, ::1). A função `is_safe_project_url()` é a mesma usada pelos outros comandos de rede existentes.
- **Chave API:** armazenada em texto plano em `settings.json` local (mesmo arquivo das outras preferências). Nunca logada, nunca enviada para outro destino além de `api.openai.com`.
- **Conteúdo de terceiros:** o HTML baixado nunca é injetado no DOM — apenas o texto extraído por `extractPageContent` é enviado ao modelo.

---

## Testes

```bash
npm test                  # 373/373 passando
npx tsc --noEmit          # sem erros
npm run i18n              # zero strings ausentes
```

Os novos testes unitários estão em `src/ai/rdap.test.ts` (parseRdap + countryName). Os módulos `extract.ts` e `dns.ts` já tinham testes em `extract.test.ts` e `dns.test.ts`.
