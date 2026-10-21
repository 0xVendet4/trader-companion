// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { extractPageContent } from "./extract";

describe("extractPageContent", () => {
  it("extracts title and paragraphs", () => {
    const html = `<html><head><title>My Project</title></head><body><p>Hello world. This is a real sentence about the project.</p></body></html>`;
    const result = extractPageContent(html);
    expect(result).toContain("My Project");
    expect(result).toContain("Hello world");
  });

  it("removes nav and footer", () => {
    const html = `<html><body><nav>Menu stuff</nav><p>Real content about the amazing project here.</p><footer>Copyright 2024</footer></body></html>`;
    const result = extractPageContent(html);
    expect(result).not.toContain("Menu stuff");
    expect(result).not.toContain("Copyright 2024");
    expect(result).toContain("Real content");
  });

  it("removes scripts and styles", () => {
    const html = `<html><body><script>alert('xss')</script><style>.a{color:red}</style><p>Legitimate content that describes the project in detail.</p></body></html>`;
    const result = extractPageContent(html);
    expect(result).not.toContain("alert");
    expect(result).not.toContain("color:red");
    expect(result).toContain("Legitimate content");
  });

  it("deduplicates identical paragraphs", () => {
    const para = "This is a repeated paragraph that appears multiple times on the page.";
    const html = `<html><body><p>${para}</p><p>${para}</p></body></html>`;
    const result = extractPageContent(html);
    const count = result.split(para).length - 1;
    expect(count).toBe(1);
  });

  it("truncates at 8000 chars", () => {
    const long = "x".repeat(20_000);
    const html = `<html><body><p>${long}</p></body></html>`;
    const result = extractPageContent(html);
    expect(result.length).toBeLessThanOrEqual(8_010);
  });

  it("handles malformed HTML gracefully", () => {
    expect(() => extractPageContent("<not valid <<html>>")).not.toThrow();
  });

  it("handles empty HTML gracefully", () => {
    const result = extractPageContent("");
    expect(typeof result).toBe("string");
  });
});
