import JSZip from "jszip";
import sanitizeHtml from "sanitize-html";
import type { Article, ArticleImage } from "./types.js";

const xml = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);
const safeName = (s: string) => s.replace(/[\\/:*?"<>|\x00-\x1f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100) || "Articles";

function clean(content: string, imagePaths: Map<string, string>) {
  return sanitizeHtml(content, {
    allowedTags: ["p", "div", "span", "br", "hr", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "pre", "code", "ul", "ol", "li", "strong", "b", "em", "i", "u", "s", "a", "table", "thead", "tbody", "tr", "th", "td", "sup", "sub", "figure", "figcaption", "img"],
    allowedAttributes: {
      a: ["href", "title"],
      img: ["src", "alt", "title", "width", "height", "data-kindle-image-id"],
      th: ["colspan", "rowspan", "scope"],
      td: ["colspan", "rowspan"]
    },
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", {}, true),
      img: (_tagName, attribs) => {
        const path = imagePaths.get(attribs["data-kindle-image-id"] || "");
        return {
          tagName: "img",
          attribs: path ? {
            src: path,
            ...(attribs.alt ? { alt: attribs.alt } : {}),
            ...(attribs.title ? { title: attribs.title } : {})
          } : {}
        };
      }
    },
    exclusiveFilter: frame => frame.tag === "img" && !frame.attribs.src
  });
}

export function plainTextToHtml(text: string) {
  const normalized = text.replace(/\r\n?/g, "\n").trim();
  return normalized
    .split(/\n{2,}/)
    .map(paragraph => `<p>${xml(paragraph).replace(/\n/g, "<br/>")}</p>`)
    .join("");
}

const imageTypes: Record<ArticleImage["mediaType"], { extension: string; mediaType: string }> = {
  "image/jpeg": { extension: "jpg", mediaType: "image/jpeg" },
  "image/png": { extension: "png", mediaType: "image/png" },
  "image/gif": { extension: "gif", mediaType: "image/gif" }
};

function isValidImage(buffer: Buffer, type: ArticleImage["mediaType"]) {
  if (type === "image/jpeg") return buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (type === "image/png") return buffer.length > 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  return buffer.length > 6 && ["GIF87a", "GIF89a"].includes(buffer.subarray(0, 6).toString("ascii"));
}

export async function createEpub(articles: Article[], requestedTitle?: string) {
  const title = safeName(requestedTitle || (articles.length === 1 ? articles[0].title : `Статьи — ${new Date().toLocaleDateString("ru-RU")}`));
  const id = crypto.randomUUID();
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file("META-INF/container.xml", `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`);

  const manifest: string[] = [];
  const spine: string[] = [];
  const nav: string[] = [];
  let imageCount = 0;
  articles.forEach((article, index) => {
    const n = index + 1;
    const idref = `article-${n}`;
    const file = `${idref}.xhtml`;
    manifest.push(`<item id="${idref}" href="${file}" media-type="application/xhtml+xml"/>`);
    spine.push(`<itemref idref="${idref}"/>`);
    nav.push(`<li><a href="${file}">${xml(article.title)}</a></li>`);
    const meta = [article.byline, article.siteName].filter(Boolean).map(x => xml(String(x))).join(" · ");
    const imagePaths = new Map<string, string>();
    const images = article.images || [];
    for (const image of images) {
      const type = imageTypes[image.mediaType];
      const buffer = Buffer.from(image.data, "base64");
      if (!isValidImage(buffer, image.mediaType)) continue;
      const imageId = `image-${n}-${image.id}`;
      const imagePath = `images/${imageId}.${type.extension}`;
      imagePaths.set(image.id, imagePath);
      manifest.push(`<item id="${imageId}" href="${imagePath}" media-type="${type.mediaType}"/>`);
      zip.file(`OEBPS/${imagePath}`, buffer);
      imageCount++;
    }
    const source = article.kind === "text" ? "" : `<p class="source"><a href="${xml(article.url)}">Источник</a></p>`;
    const body = article.kind === "text"
      ? article.content ? clean(article.content, imagePaths) : plainTextToHtml(article.text || "")
      : clean(article.content, imagePaths);
    zip.file(`OEBPS/${file}`, `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml" lang="${xml(article.lang || "en")}"><head><title>${xml(article.title)}</title><link rel="stylesheet" href="style.css" type="text/css"/></head><body><article><h1>${xml(article.title)}</h1>${meta ? `<p class="meta">${meta}</p>` : ""}${source}${body}</article></body></html>`);
  });
  manifest.push('<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>', '<item id="css" href="style.css" media-type="text/css"/>');
  zip.file("OEBPS/nav.xhtml", `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>${xml(title)}</title></head><body><nav epub:type="toc"><h1>${xml(title)}</h1><ol>${nav.join("")}</ol></nav></body></html>`);
  zip.file("OEBPS/style.css", "body{font-family:serif;line-height:1.5;margin:5%}h1{line-height:1.15}.meta,.source{color:#555;font-size:.85em}pre{white-space:pre-wrap}table,img{max-width:100%;height:auto}figure{margin:1em 0;text-align:center}figcaption{font-size:.85em;color:#555}a{color:inherit}");
  zip.file("OEBPS/content.opf", `<?xml version="1.0" encoding="utf-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="book-id">urn:uuid:${id}</dc:identifier><dc:title>${xml(title)}</dc:title><dc:language>${xml(articles[0]?.lang || "en")}</dc:language><dc:creator>TabTome</dc:creator><meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d{3}Z$/, "Z")}</meta></metadata><manifest>${manifest.join("")}</manifest><spine>${spine.join("")}</spine></package>`);
  return { title, filename: `${title}.epub`, imageCount, buffer: await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }) };
}
