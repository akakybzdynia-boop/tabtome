import { Readability } from "@mozilla/readability";

(() => {
  const documentClone = document.cloneNode(true) as Document;
  const parsed = new Readability(documentClone, { charThreshold: 100 }).parse();
  if (!parsed?.content) throw new Error("Не удалось распознать статью на странице");
  const template = document.createElement("template");
  template.innerHTML = parsed.content;
  const imageSources: Array<{ id: string; url: string; alt: string }> = [];
  let imageIndex = 0;
  for (const image of template.content.querySelectorAll("img")) {
    const srcset = image.getAttribute("data-srcset") || image.getAttribute("srcset");
    const srcsetCandidate = srcset?.split(",").at(-1)?.trim().split(/\s+/, 1)[0];
    const candidate = image.getAttribute("data-src")
      || image.getAttribute("data-original")
      || image.getAttribute("data-lazy-src")
      || srcsetCandidate
      || image.getAttribute("src");
    if (!candidate) { image.remove(); continue; }
    try {
      const url = new URL(candidate, document.baseURI);
      if (!["http:", "https:", "data:", "blob:"].includes(url.protocol)) { image.remove(); continue; }
      const id = `img-${++imageIndex}`;
      image.setAttribute("src", url.href);
      image.setAttribute("data-kindle-image-id", id);
      image.removeAttribute("srcset");
      image.removeAttribute("sizes");
      imageSources.push({ id, url: url.href, alt: image.getAttribute("alt") || "" });
    } catch { image.remove(); }
  }
  (globalThis as typeof globalThis & { __firefoxToKindleArticle?: unknown }).__firefoxToKindleArticle = {
    title: parsed.title || document.title || location.hostname,
    byline: parsed.byline,
    siteName: parsed.siteName,
    excerpt: parsed.excerpt,
    lang: parsed.lang || document.documentElement.lang || null,
    url: location.href,
    content: template.innerHTML,
    imageSources
  };
})();
