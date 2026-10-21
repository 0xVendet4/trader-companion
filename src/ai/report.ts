import { UPDATE_REPO } from "../core/update";

/** The longest link a report opens: GitHub and every browser take it whole. */
const MAX_URL = 6000;

/**
 * A report of one of Candy's answers (the Microsoft Store asks apps with live
 * AI answers for a way to tell the developer about one that was out of line):
 * a new issue on GitHub, filled in with the answer, that the trader reads and
 * sends, or not. The question that led to it stays out.
 */
export function reportUrl(answer: string): string {
  const text = answer.trim();
  for (let n = 1500; ; n = Math.floor(n * 0.7)) {
    const cut = text.length > n ? `${text.slice(0, n)}…` : text;
    const quoted = cut
      .split("\n")
      .map((line) => `> ${line}`)
      .join("\n");
    const body = `Candy's chat gave this answer:\n\n${quoted}\n\nWhat is wrong with it:\n\n`;
    const url = `https://github.com/${UPDATE_REPO}/issues/new?${new URLSearchParams({ title: "Report: a chat answer", body })}`;
    if (url.length <= MAX_URL || n < 80) return url;
  }
}
