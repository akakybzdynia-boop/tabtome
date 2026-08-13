const REQUIRED_PROTOCOL_VERSION = 1;
const MAX_PASTED_TEXT_CHARS = 1_000_000;
const MAX_PASTED_HTML_CHARS = 5_000_000;
const MAX_PASTED_IMAGES = 30;
const MAX_SOURCE_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_TOTAL_SOURCE_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_DRAFT_BYTES = 8 * 1024 * 1024;
const DRAFT_KEY = "textDraft";
const CONTEXT_REQUEST_KEY = "contextRequest";

const ALLOWED_TAGS = new Set([
  "p", "div", "span", "br", "hr", "h1", "h2", "h3", "h4", "h5", "h6",
  "blockquote", "pre", "code", "ul", "ol", "li", "strong", "b", "em", "i", "u", "s",
  "a", "table", "thead", "tbody", "tr", "th", "td", "sup", "sub", "figure", "figcaption", "img"
]);
const DROP_TAGS = new Set(["script", "style", "iframe", "object", "embed", "form", "input", "button", "textarea", "select", "option", "svg", "math"]);

type SendMode = "tabs" | "text";
type ImageSource = { id: string; url: string; alt: string };
type RawPastedImage = { id: string; mediaType: string; data: string; bytes: number };
type TabResult = { tabId: number; title: string; status: "pending" | "success" | "error"; message?: string };
type JobState = {
  status: "preparing" | "sending" | "success" | "error" | "interrupted";
  message: string;
  jobId: string;
  retryJobId?: string;
  source?: SendMode;
  tabIds?: number[];
  tabResults?: TabResult[];
  withoutImages?: boolean;
  title?: string;
};
type HealthReply = {
  ok?: boolean;
  configOk?: boolean;
  protocolVersion?: number;
  hostVersion?: string;
  capabilities?: string[];
  error?: string;
  code?: string;
};
type NativeSettingsReply = { ok?: boolean; settings?: { kindleEmail?: string }; error?: string };
type TextDraft = {
  content: string;
  title: string;
  rawImages: RawPastedImage[];
  remoteImages: ImageSource[];
  updatedAt: number;
  imagesOmitted?: boolean;
};
type ContextRequest = { tabId: number; title?: string; selectionText?: string; createdAt: number };
type SessionStorage = {
  get(keys?: string | string[] | Record<string, unknown> | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
};

const tabsEl = document.querySelector<HTMLDivElement>("#tabs")!;
const tabsPanel = document.querySelector<HTMLElement>("#tabs-panel")!;
const textPanel = document.querySelector<HTMLElement>("#text-panel")!;
const editor = document.querySelector<HTMLDivElement>("#pasted-content")!;
const textCount = document.querySelector<HTMLSpanElement>("#text-count")!;
const pastedImageCount = document.querySelector<HTMLSpanElement>("#pasted-image-count")!;
const tabsModeButton = document.querySelector<HTMLButtonElement>("#mode-tabs")!;
const textModeButton = document.querySelector<HTMLButtonElement>("#mode-text")!;
const serviceEl = document.querySelector<HTMLParagraphElement>("#server")!;
const resultEl = document.querySelector<HTMLParagraphElement>("#result")!;
const form = document.querySelector<HTMLFormElement>("#form")!;
const send = document.querySelector<HTMLButtonElement>("#send")!;
const titleInput = document.querySelector<HTMLInputElement>("#title")!;
const withoutImages = document.querySelector<HTMLInputElement>("#without-images")!;
const tabSearch = document.querySelector<HTMLInputElement>("#tab-search")!;
const selectedCount = document.querySelector<HTMLSpanElement>("#selected-count")!;
const sendSummary = document.querySelector<HTMLParagraphElement>("#send-summary")!;
const jobDetails = document.querySelector<HTMLDetailsElement>("#job-details")!;
const jobSummary = document.querySelector<HTMLElement>("#job-summary")!;
const jobTabs = document.querySelector<HTMLUListElement>("#job-tabs")!;
const nativeSessionStorage = (browser.storage as unknown as { session: SessionStorage }).session;

const rawImages = new Map<string, RawPastedImage>();
const remoteImages = new Map<string, ImageSource>();
let lastJob: JobState | undefined;
let currentMode: SendMode = "tabs";
let serviceReady = false;
let richTextSupported = false;
let kindleRecipient = "";
let draftTimer: number | undefined;

function show(el: HTMLElement, message: string, type: "ok" | "error" | "warning" | "" = "") {
  el.textContent = message;
  el.className = type ? `${el === serviceEl ? "status" : "result"} ${type}` : el === serviceEl ? "status" : "result";
}

function eligible(tab: browser.tabs.Tab) {
  return tab.id && tab.url && /^https?:\/\//.test(tab.url);
}

function jobMode(job?: JobState): SendMode {
  return job?.source === "text" ? "text" : "tabs";
}

function editorText() {
  return editor.innerText.replace(/\r\n?/g, "\n").trim();
}

function currentImageIds() {
  return new Set([...editor.querySelectorAll<HTMLImageElement>("img[data-kindle-image-id]")]
    .map(image => image.dataset.kindleImageId || "")
    .filter(Boolean));
}

function pruneImageState() {
  const activeIds = currentImageIds();
  for (const id of rawImages.keys()) if (!activeIds.has(id)) rawImages.delete(id);
  for (const id of remoteImages.keys()) if (!activeIds.has(id)) remoteImages.delete(id);
}

function updateSendButton() {
  const busy = lastJob?.status === "preparing" || lastJob?.status === "sending";
  const sameMode = jobMode(lastJob) === currentMode;
  const textLength = editorText().length;
  const invalidText = currentMode === "text" && ((!textLength && (withoutImages.checked || currentImageIds().size === 0)) || textLength > MAX_PASTED_TEXT_CHARS);
  send.disabled = !serviceReady || busy || (currentMode === "text" && (!richTextSupported || invalidText));
  if (busy) send.textContent = "Отправка выполняется в фоне…";
  else if (sameMode && lastJob?.status === "interrupted") send.textContent = "Повторить после проверки Kindle";
  else if (sameMode && lastJob?.status === "error" && lastJob.retryJobId) send.textContent = "Повторить отправку";
  else send.textContent = currentMode === "text" ? "Отправить текст" : "Отправить выбранное";
}

function selectedTabInputs() {
  return [...document.querySelectorAll<HTMLInputElement>('input[name="tab"]:checked')];
}

function tabWord(count: number) {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) return "вкладок";
  if (mod10 === 1) return "вкладка";
  if (mod10 >= 2 && mod10 <= 4) return "вкладки";
  return "вкладок";
}

function updateSummary() {
  const imageMode = withoutImages.checked ? "без изображений" : "с изображениями";
  const recipient = kindleRecipient ? ` · ${kindleRecipient}` : "";
  if (currentMode === "tabs") {
    const count = selectedTabInputs().length;
    selectedCount.textContent = `Выбрано: ${count}`;
    sendSummary.textContent = `${count} ${tabWord(count)} · ${imageMode}${recipient}`;
  } else {
    sendSummary.textContent = `${editorText().length.toLocaleString("ru-RU")} символов · ${imageMode}${recipient}`;
  }
}

function updateEditorMeta() {
  pruneImageState();
  textCount.textContent = editorText().length.toLocaleString("ru-RU");
  pastedImageCount.textContent = currentImageIds().size.toLocaleString("ru-RU");
  updateSendButton();
  updateSummary();
}

function setMode(mode: SendMode) {
  currentMode = mode;
  const tabsActive = mode === "tabs";
  tabsPanel.hidden = !tabsActive;
  textPanel.hidden = tabsActive;
  tabsModeButton.classList.toggle("active", tabsActive);
  textModeButton.classList.toggle("active", !tabsActive);
  tabsModeButton.setAttribute("aria-selected", String(tabsActive));
  textModeButton.setAttribute("aria-selected", String(!tabsActive));
  tabsModeButton.tabIndex = tabsActive ? 0 : -1;
  textModeButton.tabIndex = tabsActive ? -1 : 0;
  if (!tabsActive && serviceReady && !richTextSupported) {
    show(resultEl, "Для форматированного текста обновите локальный компонент до версии 0.8.0 или новее.", "warning");
  }
  updateSendButton();
  updateSummary();
  updateAutomaticTitle();
}

function renderJob(job?: JobState) {
  if (!job) return;
  lastJob = job;
  show(resultEl, job.message, job.status === "success" ? "ok" : job.status === "error" ? "error" : job.status === "interrupted" ? "warning" : "");
  const tabResults = job.tabResults || [];
  jobDetails.hidden = tabResults.length === 0;
  jobTabs.replaceChildren();
  if (tabResults.length) {
    const success = tabResults.filter(item => item.status === "success").length;
    const failed = tabResults.filter(item => item.status === "error").length;
    const pending = tabResults.length - success - failed;
    jobSummary.textContent = `Вкладки: подготовлено ${success}, ошибок ${failed}${pending ? `, в работе ${pending}` : ""}`;
    for (const item of tabResults) {
      const row = document.createElement("li");
      row.className = item.status;
      row.textContent = `${item.title} — ${item.status === "success" ? "подготовлено" : item.status === "error" ? item.message || "ошибка" : "ожидает"}`;
      jobTabs.append(row);
    }
    if (failed) jobDetails.open = true;
  }
  updateSendButton();
}

function safeUrl(value: string, schemes: string[]) {
  try {
    const url = new URL(value);
    return schemes.includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function decodedBase64Bytes(data: string) {
  const padding = data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor(data.length * 3 / 4) - padding);
}

function availableImageSlot(bytes = 0) {
  const imageCount = rawImages.size + remoteImages.size;
  const sourceBytes = [...rawImages.values()].reduce((total, image) => total + image.bytes, 0);
  return imageCount < MAX_PASTED_IMAGES
    && bytes <= MAX_SOURCE_IMAGE_BYTES
    && sourceBytes + bytes <= MAX_TOTAL_SOURCE_IMAGE_BYTES;
}

function registerDataImage(src: string) {
  const match = src.match(/^data:(image\/(?:jpeg|png|gif|webp|avif));base64,([a-z0-9+/=\s]+)$/i);
  if (!match) return undefined;
  const data = match[2].replace(/\s+/g, "");
  const bytes = decodedBase64Bytes(data);
  if (!availableImageSlot(bytes)) return undefined;
  try { atob(data.slice(0, Math.min(data.length, 4096))); }
  catch { return undefined; }
  const id = `pasted-${crypto.randomUUID()}`;
  rawImages.set(id, { id, mediaType: match[1].toLowerCase(), data, bytes });
  return id;
}

function registerRemoteImage(src: string, alt: string) {
  const url = safeUrl(src, ["http:", "https:"]);
  if (!url || !availableImageSlot()) return undefined;
  const id = `pasted-${crypto.randomUUID()}`;
  remoteImages.set(id, { id, url, alt: alt.slice(0, 500) });
  return id;
}

function copyTableAttributes(source: Element, target: HTMLElement) {
  for (const name of ["colspan", "rowspan"]) {
    const value = Number(source.getAttribute(name));
    if (Number.isInteger(value) && value >= 1 && value <= 50) target.setAttribute(name, String(value));
  }
  if (target.tagName === "TH" && ["row", "col", "rowgroup", "colgroup"].includes(source.getAttribute("scope") || "")) {
    target.setAttribute("scope", source.getAttribute("scope")!);
  }
}

function sanitizeNode(node: Node, stats: { skippedImages: number }): Node | null {
  if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.textContent || "");
  if (!(node instanceof Element)) return null;
  const tag = node.tagName.toLowerCase();
  if (DROP_TAGS.has(tag)) return null;

  if (!ALLOWED_TAGS.has(tag)) {
    const fragment = document.createDocumentFragment();
    for (const child of [...node.childNodes]) {
      const clean = sanitizeNode(child, stats);
      if (clean) fragment.append(clean);
    }
    return fragment;
  }

  const clean = document.createElement(tag);
  if (tag === "a") {
    const href = safeUrl(node.getAttribute("href") || "", ["http:", "https:", "mailto:"]);
    if (href) clean.setAttribute("href", href);
    const title = node.getAttribute("title");
    if (title) clean.setAttribute("title", title.slice(0, 500));
  }
  if (tag === "td" || tag === "th") copyTableAttributes(node, clean);
  if (tag === "img") {
    const alt = (node.getAttribute("alt") || "").slice(0, 500);
    const title = (node.getAttribute("title") || "").slice(0, 500);
    const existingId = node.getAttribute("data-kindle-image-id") || "";
    const src = node.getAttribute("src") || "";
    const id = /^[a-z0-9-]{1,50}$/.test(existingId) && (rawImages.has(existingId) || remoteImages.has(existingId))
      ? existingId
      : src.startsWith("data:") ? registerDataImage(src) : registerRemoteImage(src, alt);
    if (!id) {
      stats.skippedImages++;
      return alt ? document.createTextNode(alt) : null;
    }
    clean.setAttribute("data-kindle-image-id", id);
    clean.setAttribute("alt", alt);
    if (title) clean.setAttribute("title", title);
    if (src.startsWith("data:")) clean.setAttribute("src", src);
    else {
      clean.setAttribute("data-kindle-remote", "true");
      if (!title) clean.setAttribute("title", "Изображение будет загружено только после нажатия «Отправить»");
    }
    return clean;
  }

  for (const child of [...node.childNodes]) {
    const sanitized = sanitizeNode(child, stats);
    if (sanitized) clean.append(sanitized);
  }
  return clean;
}

function sanitizedHtmlFragment(html: string) {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const fragment = document.createDocumentFragment();
  const stats = { skippedImages: 0 };
  for (const child of [...parsed.body.childNodes]) {
    const sanitized = sanitizeNode(child, stats);
    if (sanitized) fragment.append(sanitized);
  }
  return { fragment, skippedImages: stats.skippedImages };
}

function plainTextFragment(text: string) {
  const fragment = document.createDocumentFragment();
  for (const paragraph of text.replace(/\r\n?/g, "\n").split(/\n{2,}/)) {
    if (!paragraph) continue;
    const element = document.createElement("p");
    paragraph.split("\n").forEach((line, index) => {
      if (index) element.append(document.createElement("br"));
      element.append(document.createTextNode(line));
    });
    fragment.append(element);
  }
  return fragment;
}

function selectedEditorRange() {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return undefined;
  const range = selection.getRangeAt(0);
  return editor.contains(range.commonAncestorContainer) || range.commonAncestorContainer === editor ? range.cloneRange() : undefined;
}

function insertFragment(fragment: DocumentFragment, requestedRange?: Range) {
  const range = requestedRange && (editor.contains(requestedRange.commonAncestorContainer) || requestedRange.commonAncestorContainer === editor)
    ? requestedRange
    : document.createRange();
  if (!requestedRange || !(editor.contains(range.commonAncestorContainer) || range.commonAncestorContainer === editor)) {
    range.selectNodeContents(editor);
    range.collapse(false);
  }
  const last = fragment.lastChild;
  range.deleteContents();
  range.insertNode(fragment);
  if (last) {
    range.setStartAfter(last);
    range.collapse(true);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }
  updateEditorMeta();
  updateAutomaticTitle();
  scheduleDraftSave();
}

function fileToData(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error("Не удалось прочитать изображение"));
    reader.onload = () => resolve(String(reader.result).split(",", 2)[1] || "");
    reader.readAsDataURL(file);
  });
}

async function imageFilesFragment(files: File[]) {
  const fragment = document.createDocumentFragment();
  let skipped = 0;
  for (const file of files) {
    if (!file.type.startsWith("image/") || !availableImageSlot(file.size)) { skipped++; continue; }
    try {
      const data = await fileToData(file);
      const id = `pasted-${crypto.randomUUID()}`;
      rawImages.set(id, { id, mediaType: file.type, data, bytes: file.size });
      const image = document.createElement("img");
      image.dataset.kindleImageId = id;
      image.alt = file.name || "Вставленное изображение";
      image.src = `data:${file.type};base64,${data}`;
      fragment.append(image);
    } catch { skipped++; }
  }
  if (skipped) show(resultEl, `Пропущено изображений: ${skipped}. Проверьте лимит 30 файлов и 15 МБ.`, "warning");
  return fragment;
}

async function insertTransfer(transfer: DataTransfer, range?: Range) {
  pruneImageState();
  const html = transfer.getData("text/html");
  if (html) {
    const { fragment, skippedImages } = sanitizedHtmlFragment(html);
    if (skippedImages) show(resultEl, `Пропущено изображений: ${skippedImages}. Допустимы HTTP(S) и изображения до 12 МБ; общий лимит — 30 изображений и 15 МБ.`, "warning");
    if (fragment.textContent?.trim() || fragment.querySelector("img,hr,table")) {
      insertFragment(fragment, range);
      return;
    }
  }

  const files = [...transfer.items]
    .filter(item => item.kind === "file" && item.type.startsWith("image/"))
    .map(item => item.getAsFile())
    .filter((file): file is File => Boolean(file));
  if (files.length) {
    insertFragment(await imageFilesFragment(files), range);
    return;
  }

  const text = transfer.getData("text/plain");
  if (editorText().length + text.length > MAX_PASTED_TEXT_CHARS) {
    show(resultEl, "Вставка превышает лимит 1 000 000 символов.", "error");
    return;
  }
  insertFragment(plainTextFragment(text), range);
}

function serializedContent() {
  const clone = editor.cloneNode(true) as HTMLDivElement;
  clone.querySelectorAll("img").forEach(image => image.removeAttribute("src"));
  return clone.innerHTML.trim();
}

function automaticTitle() {
  if (currentMode === "text") {
    const heading = editor.querySelector("h1,h2,h3,h4,h5,h6")?.textContent?.trim();
    const firstLine = editorText().split("\n").find(line => line.trim())?.trim();
    return (heading || firstLine || `Текст — ${new Date().toLocaleDateString("ru-RU")}`).slice(0, 200);
  }
  const selected = selectedTabInputs().map(input => input.closest("label")?.querySelector("span")?.textContent?.trim()).filter((value): value is string => Boolean(value));
  if (!selected.length) return "";
  return (selected.length === 1 ? selected[0] : `${selected[0]} и ещё ${selected.length - 1}`).slice(0, 200);
}

function updateAutomaticTitle() {
  const suggestion = automaticTitle();
  titleInput.placeholder = suggestion ? `Авто: ${suggestion}` : "Необязательно";
}

function fitTabList() {
  if (currentMode !== "tabs" || tabsEl.hidden) return;
  tabsEl.style.maxHeight = "420px";
  const rectangle = tabsEl.getBoundingClientRect();
  const trailingHeight = Math.max(0, document.documentElement.scrollHeight - rectangle.bottom);
  const available = window.innerHeight - rectangle.top - trailingHeight - 8;
  tabsEl.style.maxHeight = `${Math.max(180, Math.min(420, available))}px`;
}

async function persistDraft() {
  if (currentMode !== "text") return;
  pruneImageState();
  const content = serializedContent();
  const title = titleInput.value;
  if (!content && !title) {
    await nativeSessionStorage.remove(DRAFT_KEY);
    return;
  }
  let draft: TextDraft = {
    content,
    title,
    rawImages: [...rawImages.values()],
    remoteImages: [...remoteImages.values()],
    updatedAt: Date.now()
  };
  if (new TextEncoder().encode(JSON.stringify(draft)).byteLength > MAX_DRAFT_BYTES) {
    const container = document.createElement("div");
    container.innerHTML = content;
    container.querySelectorAll("img").forEach(image => image.remove());
    draft = { content: container.innerHTML, title, rawImages: [], remoteImages: [], updatedAt: Date.now(), imagesOmitted: true };
  }
  await nativeSessionStorage.set({ [DRAFT_KEY]: draft });
}

function scheduleDraftSave() {
  if (draftTimer !== undefined) window.clearTimeout(draftTimer);
  draftTimer = window.setTimeout(() => {
    draftTimer = undefined;
    void persistDraft().catch(error => console.error("Could not save text draft", error));
  }, 400);
}

async function restoreDraft() {
  const stored = await nativeSessionStorage.get(DRAFT_KEY);
  const draft = stored[DRAFT_KEY] as Partial<TextDraft> | undefined;
  if (!draft || typeof draft.content !== "string" || typeof draft.title !== "string") return false;

  rawImages.clear();
  remoteImages.clear();
  for (const image of Array.isArray(draft.rawImages) ? draft.rawImages : []) {
    if (!image || !/^[a-z0-9-]{1,50}$/.test(image.id) || !image.mediaType?.startsWith("image/") || typeof image.data !== "string") continue;
    const bytes = Number(image.bytes) || decodedBase64Bytes(image.data);
    if (!availableImageSlot(bytes)) continue;
    rawImages.set(image.id, { ...image, bytes });
  }
  for (const image of Array.isArray(draft.remoteImages) ? draft.remoteImages : []) {
    if (!image || !/^[a-z0-9-]{1,50}$/.test(image.id) || !safeUrl(image.url, ["http:", "https:"]) || !availableImageSlot()) continue;
    remoteImages.set(image.id, image);
  }
  const { fragment } = sanitizedHtmlFragment(draft.content);
  editor.replaceChildren(fragment);
  for (const image of editor.querySelectorAll<HTMLImageElement>("img[data-kindle-image-id]")) {
    const raw = rawImages.get(image.dataset.kindleImageId || "");
    if (raw) image.src = `data:${raw.mediaType};base64,${raw.data}`;
  }
  titleInput.value = draft.title;
  updateEditorMeta();
  if (draft.imagesOmitted) show(resultEl, "Черновик восстановлен без изображений: их объём превышал лимит временного хранилища.", "warning");
  return Boolean(editorText() || currentImageIds().size || titleInput.value);
}

async function consumeContextRequest() {
  const stored = await nativeSessionStorage.get(CONTEXT_REQUEST_KEY);
  await nativeSessionStorage.remove(CONTEXT_REQUEST_KEY);
  const request = stored[CONTEXT_REQUEST_KEY] as ContextRequest | undefined;
  if (!request || !Number.isInteger(request.tabId) || Date.now() - Number(request.createdAt) > 5 * 60 * 1000) return undefined;
  return request;
}

async function init() {
  const contextRequest = await consumeContextRequest().catch(() => undefined);
  const stored = await browser.storage.local.get("sendJob");
  const storedJob = stored.sendJob as JobState | undefined;
  renderJob(storedJob);
  if (storedJob) setMode(jobMode(storedJob));
  if (storedJob?.status === "sending") {
    void browser.runtime.sendMessage({ type: "refresh-job" }).then(job => renderJob(job as JobState | undefined)).catch(() => undefined);
  }

  try {
    const health = await browser.runtime.sendMessage({ type: "native-health" }) as HealthReply;
    if (!health?.ok || !health.configOk) throw new Error(health?.error || "Локальный компонент не настроен.");
    if (Number(health.protocolVersion) !== REQUIRED_PROTOCOL_VERSION) {
      throw new Error("Версии расширения и локального компонента несовместимы. Обновите оба компонента.");
    }
    serviceReady = true;
    richTextSupported = Boolean(health.capabilities?.includes("pastedRichText"));
    show(serviceEl, `Локальный компонент работает (v${health.hostVersion || "0.9.0"})`, "ok");
    if (health.capabilities?.includes("emailSettings")) {
      const settings = await browser.runtime.sendMessage({ type: "native-settings-get" }) as NativeSettingsReply;
      kindleRecipient = settings.settings?.kindleEmail || "";
    }
  } catch (error) {
    serviceReady = false;
    show(serviceEl, error instanceof Error ? error.message : String(error), "error");
  }
  updateSendButton();

  const draftRestored = await restoreDraft().catch(() => false);
  if (draftRestored && !contextRequest && !storedJob) setMode("text");

  const tabs = (await browser.tabs.query({ currentWindow: true })).filter(eligible);
  const active = tabs.find(tab => tab.active)?.id;
  const restoreSelection = jobMode(storedJob) === "tabs" && (storedJob?.status === "error" || storedJob?.status === "interrupted");
  for (const tab of tabs) {
    const label = document.createElement("label");
    label.className = "tab";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.name = "tab";
    checkbox.value = String(tab.id);
    checkbox.checked = contextRequest && !contextRequest.selectionText
      ? tab.id === contextRequest.tabId
      : restoreSelection ? Boolean(tab.id && storedJob?.tabIds?.includes(tab.id)) : tab.id === active;
    const title = document.createElement("span");
    title.textContent = tab.title || tab.url || "Вкладка";
    title.title = tab.url || "";
    label.append(checkbox, title);
    tabsEl.append(label);
  }
  tabSearch.hidden = tabs.length <= 10;
  if (contextRequest?.selectionText) {
    rawImages.clear();
    remoteImages.clear();
    editor.replaceChildren(plainTextFragment(contextRequest.selectionText));
    titleInput.value = contextRequest.title?.slice(0, 200) || "";
    setMode("text");
    updateEditorMeta();
    scheduleDraftSave();
  } else if (contextRequest) {
    setMode("tabs");
  }
  if (!contextRequest && (storedJob?.status === "error" || storedJob?.status === "interrupted") && storedJob.title) {
    titleInput.value = storedJob.title;
  }
  updateSummary();
  updateAutomaticTitle();
  requestAnimationFrame(fitTabList);
}

document.querySelector("#settings")!.addEventListener("click", () => browser.runtime.openOptionsPage());
document.querySelector("#all")!.addEventListener("click", () => {
  document.querySelectorAll<HTMLInputElement>('input[name="tab"]').forEach(input => { input.checked = true; });
  updateSummary();
  updateAutomaticTitle();
});
document.querySelector("#none")!.addEventListener("click", () => {
  document.querySelectorAll<HTMLInputElement>('input[name="tab"]').forEach(input => { input.checked = false; });
  updateSummary();
  updateAutomaticTitle();
});
tabsEl.addEventListener("change", () => {
  updateSummary();
  updateAutomaticTitle();
});
tabSearch.addEventListener("input", () => {
  const query = tabSearch.value.trim().toLocaleLowerCase("ru-RU");
  for (const row of tabsEl.querySelectorAll<HTMLLabelElement>(".tab")) {
    row.hidden = Boolean(query) && !row.textContent?.toLocaleLowerCase("ru-RU").includes(query);
  }
});
tabsModeButton.addEventListener("click", () => setMode("tabs"));
textModeButton.addEventListener("click", () => setMode("text"));
function handleModeKeys(event: KeyboardEvent) {
  const buttons = [tabsModeButton, textModeButton];
  const currentIndex = buttons.indexOf(event.currentTarget as HTMLButtonElement);
  let nextIndex: number | undefined;
  if (event.key === "ArrowLeft" || event.key === "ArrowUp") nextIndex = (currentIndex + buttons.length - 1) % buttons.length;
  else if (event.key === "ArrowRight" || event.key === "ArrowDown") nextIndex = (currentIndex + 1) % buttons.length;
  else if (event.key === "Home") nextIndex = 0;
  else if (event.key === "End") nextIndex = buttons.length - 1;
  if (nextIndex === undefined) return;
  event.preventDefault();
  const next = buttons[nextIndex];
  setMode(next === tabsModeButton ? "tabs" : "text");
  next.focus({ preventScroll: true });
}
tabsModeButton.addEventListener("keydown", handleModeKeys);
textModeButton.addEventListener("keydown", handleModeKeys);
editor.addEventListener("input", () => {
  updateEditorMeta();
  updateAutomaticTitle();
  scheduleDraftSave();
});
titleInput.addEventListener("input", scheduleDraftSave);
withoutImages.addEventListener("change", () => {
  updateSendButton();
  updateSummary();
});
window.addEventListener("resize", fitTabList);
function insertWithoutPopupJump(transfer: DataTransfer, range?: Range) {
  const scrollLeft = window.scrollX;
  const scrollTop = window.scrollY;
  void insertTransfer(transfer, range)
    .catch(error => show(resultEl, error instanceof Error ? error.message : String(error), "error"))
    .finally(() => requestAnimationFrame(() => window.scrollTo({ left: scrollLeft, top: scrollTop })));
}
editor.addEventListener("paste", event => {
  event.preventDefault();
  if (event.clipboardData) insertWithoutPopupJump(event.clipboardData, selectedEditorRange());
});
editor.addEventListener("drop", event => {
  event.preventDefault();
  if (event.dataTransfer) insertWithoutPopupJump(event.dataTransfer, selectedEditorRange());
});

browser.storage.onChanged.addListener(changes => {
  if (changes.sendJob?.newValue) renderJob(changes.sendJob.newValue as JobState);
});

form.addEventListener("submit", event => {
  event.preventDefault();
  const tabIds = [...document.querySelectorAll<HTMLInputElement>('input[name="tab"]:checked')].map(input => Number(input.value));
  const text = editorText();
  const content = serializedContent();
  if (currentMode === "tabs" && !tabIds.length) return show(resultEl, "Выберите хотя бы одну вкладку.", "error");
  if (currentMode === "text" && !text && currentImageIds().size === 0) return show(resultEl, "Вставьте текст или изображение для отправки.", "error");
  if (currentMode === "text" && withoutImages.checked && !text) return show(resultEl, "После исключения изображений в книге не осталось текста.", "error");
  if (currentMode === "text" && text.length > MAX_PASTED_TEXT_CHARS) return show(resultEl, "Текст превышает лимит 1 000 000 символов.", "error");
  if (currentMode === "text" && (!content || content.length > MAX_PASTED_HTML_CHARS)) return show(resultEl, "Форматированный текст пуст или слишком велик.", "error");
  if (currentMode === "text" && !richTextSupported) return show(resultEl, "Локальный компонент не поддерживает форматированный текст.", "error");

  send.disabled = true;
  send.textContent = "Запускаю фоновую отправку…";
  const title = titleInput.value.trim() || automaticTitle() || undefined;
  const sameMode = jobMode(lastJob) === currentMode;
  let jobId: string;
  if (sameMode && lastJob?.status === "interrupted") {
    const confirmed = window.confirm("Сначала проверьте библиотеку Kindle и почту отправителя. Книга могла быть доставлена. Всё равно создать новую отправку с риском дубликата?");
    if (!confirmed) {
      updateSendButton();
      return;
    }
    jobId = crypto.randomUUID();
  } else {
    jobId = sameMode && lastJob?.status === "error" && lastJob.retryJobId ? lastJob.retryJobId : crypto.randomUUID();
  }

  const activeIds = currentImageIds();
  const imageSources = withoutImages.checked ? [] : [...remoteImages.values()].filter(image => activeIds.has(image.id));
  const images = withoutImages.checked ? [] : [...rawImages.values()]
    .filter(image => activeIds.has(image.id))
    .map(({ id, mediaType, data }) => ({ id, mediaType, data }));
  const message = currentMode === "text"
    ? { type: "start-text-send", jobId, text, content, imageSources, images, title, withoutImages: withoutImages.checked }
    : { type: "start-send", jobId, tabIds, title, withoutImages: withoutImages.checked };
  void browser.runtime.sendMessage(message).then(response => {
    if (response && !response.ok) show(resultEl, response.error, "error");
  }).catch(error => show(resultEl, error instanceof Error ? error.message : String(error), "error"));
});

updateEditorMeta();
void init();
