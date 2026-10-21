const REMOVE_SELECTORS = [
  "nav",
  "header",
  "footer",
  "script",
  "style",
  "aside",
  "form",
  "button",
  "noscript",
  "iframe",
  "[role=navigation]",
  "[role=banner]",
  "[role=complementary]",
  "[role=contentinfo]",
  ".nav",
  ".menu",
  ".footer",
  ".header",
  ".sidebar",
  ".ad",
  ".advertisement",
  ".cookie",
].join(",");

const CONTENT_SELECTORS = ["h1", "h2", "h3", "h4", "h5", "h6", "p", "li", "td", "th", "blockquote"];

const MAX_OUTPUT = 8_000;

/**
 * Extracts readable text from an HTML string, removing chrome/boilerplate.
 * Pure function: no network calls, no side effects.
 */
export function extractPageContent(html: string): string {
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(html, "text/html");
  } catch {
    return html.slice(0, MAX_OUTPUT);
  }

  // Remove noise elements
  doc.querySelectorAll(REMOVE_SELECTORS).forEach((el) => el.remove());

  const lines: string[] = [];

  // Title
  const title = doc.querySelector("title")?.textContent?.trim();
  if (title) lines.push(`# ${title}`);

  // Meta description
  const meta = doc.querySelector('meta[name="description"]')?.getAttribute("content")?.trim();
  if (meta) lines.push(meta);

  // Main content
  const body = doc.querySelector("main") ?? doc.querySelector("article") ?? doc.body;
  if (body) {
    const seen = new Set<string>();
    body.querySelectorAll(CONTENT_SELECTORS.join(",")).forEach((el) => {
      const text = el.textContent?.replace(/\s+/g, " ").trim() ?? "";
      if (text.length < 20 || seen.has(text)) return;
      seen.add(text);
      lines.push(text);
    });
  }

  const result = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return result.length > MAX_OUTPUT ? result.slice(0, MAX_OUTPUT) + "…" : result;
}
