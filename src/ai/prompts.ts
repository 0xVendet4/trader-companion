import type { RdapInfo } from "./rdap";
import { countryName } from "./rdap";
import type { ChatMessage } from "./types";

const MAX_CONTENT = 6_000;

export function buildSystemMessage(): ChatMessage {
  return {
    role: "system",
    content:
      "Você é Candy, uma assistente de trading especializada em cripto. Responda sempre em português do Brasil. Seja direta, objetiva e neutra — nunca dê recomendações de compra ou venda.",
  };
}

/** System message for voice replies: general assistant, very short answers. */
export function buildVoiceSystemMessage(): ChatMessage {
  return {
    role: "system",
    content:
      "Você é Candy, uma assistente inteligente e simpática. Responda em português do Brasil. Seja extremamente concisa — máximo 2 frases. Responda qualquer pergunta diretamente, sem introduções ou explicações longas.",
  };
}

export function buildSummarizeMessages(content: string): ChatMessage[] {
  const truncated = content.length > MAX_CONTENT ? content.slice(0, MAX_CONTENT) + "…" : content;
  return [
    {
      role: "system",
      content:
        "Você é Candy, uma assistente de análise de projetos cripto. Responda sempre em português do Brasil. Seja objetiva e neutra — nunca dê recomendações de compra ou venda.",
    },
    {
      role: "user",
      content: `Resuma este site de projeto cripto em 2–3 frases diretas:\n\n${truncated}`,
    },
  ];
}

/**
 * Messages for the full project analysis: website content + RDAP + DNS data.
 * The AI returns a structured response in Portuguese with a fixed format.
 */
export function buildAnalyzeMessages(
  url: string,
  content: string,
  rdap: RdapInfo | undefined,
  mx: string[],
): ChatMessage[] {
  const truncated = content.length > MAX_CONTENT ? content.slice(0, MAX_CONTENT) + "…" : content;
  const domain = new URL(url).hostname.replace(/^www\./, "");

  // Build the RDAP/DNS context block for the prompt
  const lines: string[] = [`URL: ${url}`, `Domínio: ${domain}`];

  if (rdap) {
    const country = rdap.country ? countryName(rdap.country) : null;
    const registrar = rdap.registrar ?? "desconhecido";
    if (rdap.createdAt) {
      const days = Math.floor((Date.now() - rdap.createdAt) / 86_400_000);
      const dateStr = new Date(rdap.createdAt).toLocaleDateString("pt-BR");
      lines.push(`Registro: ${days} dias atrás (${dateStr})${country ? ` · ${country}` : ""} · via ${registrar}`);
    } else {
      lines.push(`Registrador: ${registrar}${country ? ` · ${country}` : ""}`);
    }
    if (rdap.expiresAt) {
      lines.push(`Expira: ${new Date(rdap.expiresAt).toLocaleDateString("pt-BR")}`);
    }
    if (rdap.nameservers.length) {
      lines.push(`Nameservers: ${rdap.nameservers.join(", ")}`);
    }
  }

  lines.push(`E-mail (MX): ${mx.length ? mx[0] : "não configurado"}`);
  lines.push(`\nConteúdo do site:\n${truncated}`);

  return [
    {
      role: "system",
      content: `Você é Candy, assistente de análise de projetos cripto. Analise os dados abaixo e responda EXATAMENTE neste formato em português do Brasil — sem texto fora do formato:

📌 **Resumo:** [1–2 frases sobre o que o projeto faz]
🏷️ **Categoria:** [DeFi | NFT | Layer 1/2 | Exchange | Memecoin | GameFi | Infraestrutura | Outro]
🌐 **Domínio:** [país · registrador · data de registro · validade]
🔧 **Infraestrutura:** [nameservers / provedor de hospedagem · e-mail: sim ou não]
⚠️ **Alertas:** [lista de red flags, ou "Nenhum"]

Seja direto. Não dê recomendações de compra ou venda.`,
    },
    {
      role: "user",
      content: lines.join("\n"),
    },
  ];
}
