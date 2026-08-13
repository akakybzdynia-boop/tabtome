import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { createEpub, plainTextToHtml } from "./epub.js";

describe("createEpub", () => {
  it("creates a valid container and sanitizes active content", async () => {
    const result = await createEpub([{
      title: "Test",
      url: "https://example.com/a",
      content: '<p onclick="alert(1)">Hello</p><script>alert(1)</script><style>body{display:none}</style><iframe src="https://evil.example"></iframe><a href="javascript:alert(1)">bad</a><img onerror="alert(1)" data-kindle-image-id="img-1" src="https://example.com/image.png">',
      images: [{ id: "img-1", mediaType: "image/png", data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=" }]
    }]);
    const zip = await JSZip.loadAsync(result.buffer);
    expect(await zip.file("mimetype")!.async("string")).toBe("application/epub+zip");
    const page = await zip.file("OEBPS/article-1.xhtml")!.async("string");
    expect(page).toContain("Hello");
    expect(page).not.toContain("<script");
    expect(page).not.toContain("<style");
    expect(page).not.toContain("<iframe");
    expect(page).not.toContain("onclick");
    expect(page).not.toContain("onerror");
    expect(page).not.toContain("javascript:");
    expect(page).toContain('<img src="images/image-1-img-1.png"');
    expect(zip.file("OEBPS/images/image-1-img-1.png")).not.toBeNull();
    expect(result.imageCount).toBe(1);
  });

  it("generates a new dc:identifier for every book", async () => {
    const input = [{ title: "Test", url: "https://example.com/a", content: "<p>Hello</p>" }];
    const first = await JSZip.loadAsync((await createEpub(input)).buffer);
    const second = await JSZip.loadAsync((await createEpub(input)).buffer);
    const firstOpf = await first.file("OEBPS/content.opf")!.async("string");
    const secondOpf = await second.file("OEBPS/content.opf")!.async("string");
    const identifier = (opf: string) => opf.match(/<dc:identifier[^>]*>([^<]+)</)?.[1];
    expect(identifier(firstOpf)).toMatch(/^urn:uuid:/);
    expect(identifier(secondOpf)).not.toBe(identifier(firstOpf));
  });

  it("converts pasted plain text safely and omits a fake source link", async () => {
    expect(plainTextToHtml("Первый <абзац>\nстрока 2\n\nВторой & последний")).toBe(
      "<p>Первый &lt;абзац&gt;<br/>строка 2</p><p>Второй &amp; последний</p>"
    );
    const result = await createEpub([{
      kind: "text",
      title: "Вставленный текст",
      lang: "ru",
      text: "Первый <абзац>\nстрока 2\n\nВторой & последний"
    }]);
    const zip = await JSZip.loadAsync(result.buffer);
    const page = await zip.file("OEBPS/article-1.xhtml")!.async("string");
    expect(page).toContain("Первый &lt;абзац&gt;<br/>строка 2");
    expect(page).toContain("Второй &amp; последний");
    expect(page).not.toContain("class=\"source\"");
  });

  it("keeps safe rich-text formatting and embeds pasted images", async () => {
    const result = await createEpub([{
      kind: "text",
      title: "Форматированный текст",
      lang: "ru",
      content: '<h2>Раздел</h2><p><strong>Жирный</strong> и <em>курсив</em>.</p><table><tbody><tr><td colspan="2">Ячейка</td></tr></tbody></table><script>alert(1)</script><img data-kindle-image-id="pasted-1" src="data:image/png;base64,ignored" onerror="alert(1)">',
      images: [{ id: "pasted-1", mediaType: "image/png", data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=" }]
    }]);
    const zip = await JSZip.loadAsync(result.buffer);
    const page = await zip.file("OEBPS/article-1.xhtml")!.async("string");
    expect(page).toContain("<h2>Раздел</h2>");
    expect(page).toContain("<strong>Жирный</strong>");
    expect(page).toContain('colspan="2"');
    expect(page).toContain('<img src="images/image-1-pasted-1.png"');
    expect(page).not.toContain("<script");
    expect(page).not.toContain("onerror");
    expect(page).not.toContain("class=\"source\"");
    expect(result.imageCount).toBe(1);
  });

  it("removes image elements when the client intentionally sends no image resources", async () => {
    const result = await createEpub([{
      kind: "text",
      title: "Без изображений",
      lang: "ru",
      content: '<h2>Раздел</h2><p>Текст остаётся.</p><img data-kindle-image-id="missing-1" alt="Пропущено">',
      images: []
    }]);
    const zip = await JSZip.loadAsync(result.buffer);
    const page = await zip.file("OEBPS/article-1.xhtml")!.async("string");
    expect(page).toContain("Текст остаётся.");
    expect(page).not.toContain("<img");
    expect(result.imageCount).toBe(0);
  });
});
