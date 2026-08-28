const NATIVE_HOST = "page_to_ereader_local";
const REQUIRED_PROTOCOL_VERSION = 2;
const RECOVERY_ALARM = "page-to-ereader-job-recovery";
const SUCCESS_BADGE_ALARM = "tabtome-success-badge-clear";
const SUCCESS_BADGE_DURATION_MS = 15_000;
const CLIENT_JOB_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_NATIVE_MESSAGE_BYTES = 32 * 1024 * 1024;
const MAX_IMAGES_PER_ARTICLE = 30;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_SOURCE_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_TOTAL_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_IMAGE_WIDTH = 1280;
const MAX_IMAGE_HEIGHT = 1680;
const IMAGE_CONCURRENCY = 4;
const ARTICLE_IMAGE_BUDGET_MS = 90_000;
const MAX_PASTED_TEXT_CHARS = 1_000_000;

type ImageSource = { id: string; url: string; alt: string };
type EmbeddedImage = { id: string; mediaType: string; data: string };
type RawPastedImage = { id: string; mediaType: string; data: string };
type ExtractedArticle = { title: string; imageSources?: ImageSource[]; images?: EmbeddedImage[]; [key: string]: unknown };
type PreparedTextArticle = { kind: "text"; title: string; text?: string; content: string; lang: string; images?: EmbeddedImage[] };
type TabResult = { tabId: number; title: string; status: "pending" | "success" | "error"; message?: string };
type JobState = {
  status: "preparing" | "sending" | "success" | "error" | "interrupted";
  message: string;
  jobId: string;
  destinationId?: "kindle" | "pocketbook";
  retryJobId?: string;
  source?: "tabs" | "text";
  tabIds?: number[];
  tabResults?: TabResult[];
  withoutImages?: boolean;
  title?: string;
  startedAt: number;
  finishedAt?: number;
};
type StartTabsMessage = { type: "start-send"; jobId: string; destinationId: "kindle" | "pocketbook"; tabIds: number[]; title?: string; withoutImages?: boolean };
type StartTextMessage = {
  type: "start-text-send";
  jobId: string;
  destinationId: "kindle" | "pocketbook";
  text: string;
  content: string;
  imageSources?: ImageSource[];
  images?: RawPastedImage[];
  title?: string;
  withoutImages?: boolean;
};
type StartMessage = StartTabsMessage | StartTextMessage;
type RefreshMessage = { type: "refresh-job" };
type DiagnosticsMessage = { type: "native-health" | "native-diagnostics" | "native-load-test" };
type SettingsMessage = {
  type: "native-settings-get" | "native-settings-save";
  senderEmail?: string;
  destinations?: DeliveryDestination[];
  defaultDestinationId?: "kindle" | "pocketbook";
};
type DeliveryDestination = {
  id: "kindle" | "pocketbook";
  kind: "kindle" | "pocketbook";
  email: string;
  senderApproved: boolean;
};
type NativeSettings = {
  senderEmail: string;
  destinations: DeliveryDestination[];
  defaultDestinationId: "kindle" | "pocketbook";
  passwordConfigured: boolean;
  passwordProtected: boolean;
};
type NativeReply = {
  requestId?: string;
  type?: "progress" | "result" | "error";
  ok?: boolean;
  configOk?: boolean;
  protocolVersion?: number;
  hostVersion?: string;
  capabilities?: string[];
  status?: "pending" | "sending" | "completed" | "failed" | "interrupted" | "not_found";
  error?: string;
  message?: string;
  code?: string;
  title?: string;
  articleCount?: number;
  imageCount?: number;
  settings?: NativeSettings;
  entry?: {
    status?: NativeReply["status"];
    error?: string;
    result?: { title?: string; articleCount?: number; imageCount?: number };
  };
};
type RuntimeWithLastError = {
  runtime?: { lastError?: { message?: string } };
};

class NativeRequestError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "NativeRequestError";
  }
}

let activeRun: Promise<{ ok: boolean; error?: string; pending?: boolean }> | undefined;

async function setJob(job: JobState) {
  await browser.storage.local.set({ sendJob: job });
}

async function setBadge(text: string, color: string) {
  await browser.alarms.clear(SUCCESS_BADGE_ALARM);
  await browser.action.setBadgeBackgroundColor({ color });
  await browser.action.setBadgeText({ text });
}

async function setSuccessBadge() {
  await setBadge("✓", "#157347");
  await browser.alarms.create(SUCCESS_BADGE_ALARM, { when: Date.now() + SUCCESS_BADGE_DURATION_MS });
}

async function clearSuccessBadge() {
  const text = await browser.action.getBadgeText({});
  if (text === "✓") await browser.action.setBadgeText({ text: "" });
}

async function scheduleRecovery(delayMs = 15_000) {
  await browser.alarms.create(RECOVERY_ALARM, { when: Date.now() + delayMs });
}

async function clearRecovery() {
  await browser.alarms.clear(RECOVERY_ALARM);
}

function resultMessage(result?: { title?: string; articleCount?: number; imageCount?: number }) {
  return ptMessage("sent_result", [
    ptFormatNumber(result?.articleCount || 0),
    ptFormatNumber(result?.imageCount || 0),
    result?.title || "EPUB"
  ]);
}

function nativeRequest(command: Record<string, unknown>, onProgress?: (reply: NativeReply) => void, timeoutMs = 180_000) {
  const requestId = crypto.randomUUID();
  const message = { requestId, ...command };
  const bytes = new TextEncoder().encode(JSON.stringify(message)).byteLength;
  if (bytes > MAX_NATIVE_MESSAGE_BYTES) {
    return Promise.reject(new NativeRequestError("REQUEST_TOO_LARGE", ptMessage("request_too_large", [ptFormatNumber(bytes / 1024 / 1024)])));
  }

  return new Promise<NativeReply>((resolve, reject) => {
    let port: browser.runtime.Port;
    let settled = false;
    try { port = browser.runtime.connectNative(NATIVE_HOST); }
    catch (error) { reject(new NativeRequestError("NATIVE_HOST_UNAVAILABLE", error instanceof Error ? error.message : String(error))); return; }
    const timer = setTimeout(() => finish(new NativeRequestError("NATIVE_TIMEOUT", ptMessage("companion_timeout"))), timeoutMs);
    const finish = (error?: Error, value?: NativeReply) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { port.disconnect(); } catch { /* already disconnected */ }
      if (error) reject(error); else resolve(value || {});
    };
    port.onMessage.addListener(raw => {
      const reply = raw as NativeReply;
      if (reply.requestId !== requestId) return;
      if (reply.type === "progress") { onProgress?.(reply); return; }
      if (reply.type === "error") finish(new NativeRequestError(reply.code || "NATIVE_ERROR", reply.error || ptMessage("companion_error")));
      else finish(undefined, reply);
    });
    port.onDisconnect.addListener(() => {
      if (settled) return;
      const portError = (port as browser.runtime.Port & { error?: { message?: string } }).error?.message;
      // Firefox exposes Port.error, while Chrome exposes runtime.lastError only
      // during this callback. Reading both keeps one source compatible with both.
      const chromeError = (globalThis as typeof globalThis & { chrome?: RuntimeWithLastError }).chrome?.runtime?.lastError?.message;
      finish(new NativeRequestError("NATIVE_DISCONNECTED", portError || chromeError || ptMessage("companion_disconnected")));
    });
    try { port.postMessage(message); }
    catch (error) { finish(new NativeRequestError("NATIVE_WRITE_FAILED", error instanceof Error ? error.message : String(error))); }
  });
}

async function recoverNativeJob(job: JobState) {
  await ptInitializeI18n();
  try {
    const data = await nativeRequest({ type: "job-status", jobId: job.jobId }, undefined, 15_000);
    if (data.status === "not_found") {
      await clearRecovery();
      await setJob({ ...job, status: "error", retryJobId: job.jobId, message: ptMessage("safe_retry_not_started"), finishedAt: Date.now() });
      await setBadge("!", "#b42318");
      return;
    }
    if (data.status === "completed") {
      await clearRecovery();
      await setJob({ ...job, status: "success", message: resultMessage(data.entry?.result), finishedAt: Date.now() });
      await setSuccessBadge();
    } else if (data.status === "interrupted") {
      await clearRecovery();
      await setJob({ ...job, status: "interrupted", message: data.entry?.error || ptMessage("send_unknown"), finishedAt: Date.now() });
      await setBadge("?", "#9a6700");
    } else if (data.status === "failed") {
      await clearRecovery();
      await setJob({ ...job, status: "error", retryJobId: job.jobId, message: data.entry?.error || ptMessage("safe_retry_before_smtp"), finishedAt: Date.now() });
      await setBadge("!", "#b42318");
    } else {
      await setJob({ ...job, status: "sending", message: ptMessage(data.status === "pending" ? "companion_building" : "smtp_in_progress") });
      await scheduleRecovery();
    }
  } catch {
    if (Date.now() - job.startedAt >= CLIENT_JOB_TTL_MS) {
      await clearRecovery();
      await setJob({ ...job, status: "error", retryJobId: job.jobId, message: ptMessage("result_expired"), finishedAt: Date.now() });
      await setBadge("!", "#b42318");
    } else {
      await setJob({ ...job, status: "sending", message: ptMessage("waiting_for_result") });
      await scheduleRecovery(60_000);
    }
  }
}

async function resumePendingJob() {
  await ptInitializeI18n();
  if (activeRun) {
    await scheduleRecovery();
    return;
  }
  const stored = await browser.storage.local.get("sendJob");
  const job = stored.sendJob as JobState | undefined;
  if (!job) return;
  if (job.status === "preparing") {
    await clearRecovery();
    await setJob({ ...job, status: "error", retryJobId: job.jobId, message: ptMessage("preparation_interrupted"), finishedAt: Date.now() });
    await setBadge("!", "#b42318");
    return;
  }
  if (job.status !== "sending") return;
  await recoverNativeJob(job);
}

function blobToData(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error(ptMessage("image_read_failed")));
    reader.onload = () => resolve(String(reader.result).split(",", 2)[1] || "");
    reader.readAsDataURL(blob);
  });
}

async function normalizeImage(blob: Blob, grayscale: boolean) {
  if (blob.type === "image/gif") return blob;
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, MAX_IMAGE_WIDTH / bitmap.width, MAX_IMAGE_HEIGHT / bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d", { alpha: true })!;
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  let hasTransparency = false;
  if (grayscale || blob.type !== "image/jpeg") {
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imageData.data;
    for (let index = 3; index < pixels.length; index += 4) {
      if (pixels[index] < 255) { hasTransparency = true; break; }
    }
    if (grayscale) {
      for (let index = 0; index < pixels.length; index += 4) {
        const luminance = Math.round(0.2126 * pixels[index] + 0.7152 * pixels[index + 1] + 0.0722 * pixels[index + 2]);
        pixels[index] = luminance;
        pixels[index + 1] = luminance;
        pixels[index + 2] = luminance;
      }
      context.putImageData(imageData, 0, 0);
    }
  }
  const outputType = hasTransparency ? "image/png" : "image/jpeg";
  const converted = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, outputType, 0.8));
  if (!converted) throw new Error(ptMessage("image_conversion_failed"));
  if (!grayscale && scale === 1 && ["image/jpeg", "image/png"].includes(blob.type) && converted.size >= blob.size) return blob;
  return converted;
}

async function downloadImages(article: ExtractedArticle, currentTotal: { bytes: number }, grayscale: boolean, sourcePolicy: "tab" | "paste" = "tab") {
  const existing = (article.images || []).slice(0, MAX_IMAGES_PER_ARTICLE);
  const sources = (article.imageSources || []).slice(0, Math.max(0, MAX_IMAGES_PER_ARTICLE - existing.length));
  const images: Array<EmbeddedImage | undefined> = new Array(sources.length);
  const articleController = new AbortController();
  const budgetTimer = setTimeout(() => articleController.abort(), ARTICLE_IMAGE_BUDGET_MS);
  let nextIndex = 0;
  const worker = async () => {
    while (!articleController.signal.aborted) {
      const index = nextIndex++;
      if (index >= sources.length || currentTotal.bytes >= MAX_TOTAL_IMAGE_BYTES) return;
      const source = sources[index];
      try {
        const signal = AbortSignal.any([articleController.signal, AbortSignal.timeout(15_000)]);
        if (sourcePolicy === "paste" && !isPublicImageUrl(source.url)) continue;
        const response = await fetch(source.url, {
          credentials: sourcePolicy === "paste" ? "omit" : "include",
          cache: "force-cache",
          redirect: sourcePolicy === "paste" ? "error" : "follow",
          signal
        });
        if (!response.ok) continue;
        let blob = await response.blob();
        if (!blob.type.startsWith("image/") || blob.size > MAX_SOURCE_IMAGE_BYTES) continue;
        blob = await normalizeImage(blob, grayscale);
        if (articleController.signal.aborted) return;
        if (blob.size > MAX_IMAGE_BYTES || currentTotal.bytes + blob.size > MAX_TOTAL_IMAGE_BYTES) continue;
        currentTotal.bytes += blob.size;
        images[index] = { id: source.id, mediaType: blob.type, data: await blobToData(blob) };
      } catch { /* A missing image must not prevent sending the article. */ }
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.min(IMAGE_CONCURRENCY, sources.length) }, () => worker()));
  } finally {
    clearTimeout(budgetTimer);
  }
  delete article.imageSources;
  article.images = [...existing, ...images.filter((image): image is EmbeddedImage => Boolean(image))];
  return { requested: sources.length, skipped: sources.length - images.filter(Boolean).length };
}

function isPublicImageUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return false;
    if (host.includes(":")) {
      return host !== "::" && host !== "::1" && !host.startsWith("fc") && !host.startsWith("fd")
        && !/^fe[89ab]/.test(host) && !host.startsWith("::ffff:");
    }
    const parts = host.split(".").map(Number);
    if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return true;
    const [a, b] = parts;
    return a !== 0 && a !== 10 && a !== 127 && a < 224
      && !(a === 100 && b >= 64 && b <= 127)
      && !(a === 169 && b === 254)
      && !(a === 172 && b >= 16 && b <= 31)
      && !(a === 192 && (b === 0 || b === 168))
      && !(a === 198 && (b === 18 || b === 19));
  } catch {
    return false;
  }
}

function pastedImageBlob(image: RawPastedImage) {
  if (!image.mediaType.startsWith("image/") || !/^[a-z0-9-]{1,50}$/.test(image.id)) {
    throw new Error(ptMessage("invalid_pasted_image"));
  }
  const binary = atob(image.data);
  if (binary.length > MAX_SOURCE_IMAGE_BYTES) throw new Error(ptMessage("pasted_image_too_large"));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: image.mediaType });
}

async function normalizePastedImages(rawImages: RawPastedImage[], currentTotal: { bytes: number }, grayscale: boolean) {
  const images: EmbeddedImage[] = [];
  const selected = rawImages.slice(0, MAX_IMAGES_PER_ARTICLE);
  let skipped = Math.max(0, rawImages.length - selected.length);
  for (const raw of selected) {
    if (currentTotal.bytes >= MAX_TOTAL_IMAGE_BYTES) { skipped++; continue; }
    try {
      let blob = pastedImageBlob(raw);
      blob = await normalizeImage(blob, grayscale);
      if (blob.size > MAX_IMAGE_BYTES || currentTotal.bytes + blob.size > MAX_TOTAL_IMAGE_BYTES) { skipped++; continue; }
      currentTotal.bytes += blob.size;
      images.push({ id: raw.id, mediaType: blob.type, data: await blobToData(blob) });
    } catch { skipped++; }
  }
  return { images, skipped };
}

async function extractArticle(tabId: number) {
  await browser.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
  const injected = await browser.scripting.executeScript({
    target: { tabId },
    func: () => {
      const page = globalThis as typeof globalThis & { __firefoxToKindleArticle?: unknown };
      const result = page.__firefoxToKindleArticle;
      delete page.__firefoxToKindleArticle;
      return result;
    }
  });
  const result = injected[0]?.result as (ExtractedArticle & { error?: string }) | undefined;
  if (!result || result.error === "ARTICLE_NOT_RECOGNIZED") throw new Error(ptMessage("article_not_recognized"));
  return result;
}

async function runJob(message: StartMessage) {
  await ptInitializeI18n();
  const startedAt = Date.now();
  const isText = message.type === "start-text-send";
  const baseJob = {
    jobId: message.jobId,
    destinationId: message.destinationId,
    source: isText ? "text" as const : "tabs" as const,
    ...(!isText ? { tabIds: message.tabIds } : {}),
    title: message.title,
    withoutImages: Boolean(message.withoutImages),
    startedAt
  };
  const tabResults: TabResult[] = isText ? [] : message.tabIds.map((tabId, index) => ({
    tabId,
    title: ptMessage("default_tab_title", [ptFormatNumber(index + 1)]),
    status: "pending"
  }));
  const heartbeat = setInterval(() => {
    void browser.storage.local.set({ sendJobHeartbeat: Date.now() });
  }, 20_000);
  const jobDetails = () => tabResults.length ? { tabResults: tabResults.map(result => ({ ...result })) } : {};
  const update = async (text: string) => setJob({ ...baseJob, ...jobDetails(), status: "preparing", message: text });
  await update(ptMessage("progress_checking_companion"));
  await setBadge("…", "#1769aa");

  try {
    const health = await nativeRequest({ type: "health" }, undefined, 15_000);
    if (!health.ok || !health.configOk) throw new Error(health.error || ptMessage("companion_not_configured"));
    if (Number(health.protocolVersion) !== REQUIRED_PROTOCOL_VERSION) throw new Error(ptMessage("protocol_mismatch"));

    const stored = await browser.storage.local.get("grayscaleImages");
    const grayscale = stored.grayscaleImages !== false;
    const imageBytes = { bytes: 0 };
    const articles: Array<ExtractedArticle | PreparedTextArticle> = [];
    if (isText) {
      if (!health.capabilities?.includes("pastedRichText")) {
        throw new Error(ptMessage("rich_text_upgrade"));
      }
      const text = message.text.replace(/\r\n?/g, "\n").trim();
      if (text.length > MAX_PASTED_TEXT_CHARS) throw new Error(ptMessage("text_too_long"));
      if (!message.content.trim() || message.content.length > 5_000_000) throw new Error(ptMessage("formatted_text_invalid"));
      await update(ptMessage(message.withoutImages ? "progress_preparing_formatting" : "progress_preparing_formatting_images"));
      const articleTitle = message.title?.trim() || ptMessage("text_default_title", [ptFormatDateTime(new Date())]);
      const pastedImages = message.withoutImages
        ? { images: [] as EmbeddedImage[], skipped: 0 }
        : await normalizePastedImages(message.images || [], imageBytes, grayscale);
      const article: PreparedTextArticle & ExtractedArticle = {
        kind: "text",
        title: articleTitle,
        ...(text ? { text } : {}),
        content: message.content,
        lang: ptUiLocale,
        imageSources: message.withoutImages ? [] : (message.imageSources || []).slice(0, MAX_IMAGES_PER_ARTICLE),
        images: pastedImages.images
      };
      const remoteImages = message.withoutImages
        ? { requested: 0, skipped: 0 }
        : await downloadImages(article, imageBytes, grayscale, "paste");
      if (message.withoutImages) {
        delete article.imageSources;
        article.images = [];
      }
      const skippedImages = pastedImages.skipped + remoteImages.skipped;
      if (skippedImages) throw new Error(ptMessage("images_prepare_failed", [ptFormatNumber(skippedImages)]));
      if (!text && !article.images?.length) throw new Error(message.withoutImages
        ? ptMessage("no_text_after_images_removed")
        : ptMessage("paste_content_to_send"));
      articles.push(article);
    } else {
      for (let index = 0; index < message.tabIds.length; index++) {
        const tabId = message.tabIds[index];
        const tabResult = tabResults[index];
        await update(ptMessage("progress_extracting_article", [ptFormatNumber(index + 1), ptFormatNumber(message.tabIds.length)]));
        try {
          const tab = await browser.tabs.get(tabId);
          tabResult.title = tab.title || tab.url || tabResult.title;
          const article = await extractArticle(tabId);
          if (message.withoutImages) {
            delete article.imageSources;
            article.images = [];
          } else {
            await update(ptMessage("progress_loading_images", [ptFormatNumber(index + 1), ptFormatNumber(message.tabIds.length)]));
            await downloadImages(article, imageBytes, grayscale);
          }
          articles.push(article);
          tabResult.status = "success";
          await update(ptMessage("progress_prepared", [ptFormatNumber(articles.length), ptFormatNumber(message.tabIds.length)]));
        } catch (error) {
          tabResult.status = "error";
          tabResult.message = error instanceof Error ? error.message : String(error);
          try {
            const tab = await browser.tabs.get(tabId);
            tabResult.title = tab.title || tab.url || tabResult.title;
          } catch { /* The tab may have been closed while the job was running. */ }
          await update(ptMessage("progress_skipped_tab", [ptFormatNumber(index + 1)]));
        }
      }
      if (!articles.length) {
        const details = tabResults.map(item => `${item.title}: ${item.message || ptMessage("unknown_error")}`).join("; ");
        throw new Error(ptMessage("no_tabs_prepared", [details]));
      }
    }

    const sendingJob: JobState = { ...baseJob, ...jobDetails(), status: "sending", message: ptMessage("progress_starting_companion") };
    await setJob(sendingJob);
    await scheduleRecovery();
    let data: NativeReply;
    let progressWrite = Promise.resolve();
    try {
      data = await nativeRequest(
        { type: "send", jobId: message.jobId, destinationId: message.destinationId, title: message.title || undefined, articles },
        progress => {
          const text = ptNativeProgress(progress.message, progress.status);
          progressWrite = progressWrite.then(() => setJob({ ...baseJob, ...jobDetails(), status: "sending", message: text }));
        }
      );
      await progressWrite;
    } catch (error) {
      await progressWrite.catch(() => undefined);
      if (error instanceof NativeRequestError && error.code === "JOB_INTERRUPTED") {
        await clearRecovery();
        await setJob({ ...baseJob, ...jobDetails(), status: "interrupted", message: error.message, finishedAt: Date.now() });
        await setBadge("?", "#9a6700");
        return { ok: false, error: error.message };
      }
      if (error instanceof NativeRequestError && ["NATIVE_DISCONNECTED", "NATIVE_TIMEOUT", "NATIVE_WRITE_FAILED", "JOB_BUSY"].includes(error.code)) {
        await recoverNativeJob(sendingJob);
        return { ok: true, pending: true };
      }
      throw error;
    }

    await clearRecovery();
    const failedTabs = tabResults.filter(item => item.status === "error").length;
    const skippedSuffix = failedTabs ? ` ${ptMessage("tabs_skipped", [ptFormatNumber(failedTabs)])}` : "";
    const result = `${resultMessage({ title: data.title, articleCount: data.articleCount, imageCount: data.imageCount })}${skippedSuffix}`;
    await setJob({ ...baseJob, ...jobDetails(), status: "success", message: result, finishedAt: Date.now() });
    await setSuccessBadge();
    return { ok: true };
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    await clearRecovery();
    await setJob({ ...baseJob, ...jobDetails(), status: "error", message: messageText, retryJobId: message.jobId, finishedAt: Date.now() });
    await setBadge("!", "#b42318");
    return { ok: false, error: messageText };
  } finally {
    clearInterval(heartbeat);
  }
}

browser.runtime.onMessage.addListener((message: unknown) => {
  if (!message) return undefined;
  return ptInitializeI18n().then(() => {
  const diagnostics = message as DiagnosticsMessage;
  if (diagnostics.type === "native-health") {
    return nativeRequest({ type: "health" }, undefined, 15_000).catch(error => ({
      ok: false,
      code: error instanceof NativeRequestError ? error.code : "NATIVE_ERROR",
      error: error instanceof Error ? error.message : String(error)
    }));
  }
  if (diagnostics.type === "native-diagnostics") {
    return (async () => {
      const health = await nativeRequest({ type: "health" }, undefined, 15_000);
      if (!health.ok || !health.configOk) return health;
      if (Number(health.protocolVersion) !== REQUIRED_PROTOCOL_VERSION) {
        return { ok: false, code: "PROTOCOL_MISMATCH", error: ptMessage("protocol_mismatch") };
      }
      const smtp = await nativeRequest({ type: "smtp-check" }, undefined, 45_000);
      return { ...smtp, hostVersion: health.hostVersion, protocolVersion: health.protocolVersion };
    })().catch(error => ({
      ok: false,
      code: error instanceof NativeRequestError ? error.code : "NATIVE_ERROR",
      error: error instanceof Error ? error.message : String(error)
    }));
  }
  if (diagnostics.type === "native-load-test") {
    return (async () => {
      const payloadBytes = 20 * 1024 * 1024;
      const padding = "x".repeat(payloadBytes);
      const startedAt = performance.now();
      const health = await nativeRequest({ type: "health", loadTestPadding: padding }, undefined, 60_000);
      if (Number(health.protocolVersion) !== REQUIRED_PROTOCOL_VERSION) {
        return { ok: false, code: "PROTOCOL_MISMATCH", error: ptMessage("protocol_mismatch") };
      }
      return {
        ok: true,
        payloadBytes,
        elapsedMs: Math.round(performance.now() - startedAt),
        hostVersion: health.hostVersion,
        configOk: health.configOk
      };
    })().catch(error => ({
      ok: false,
      code: error instanceof NativeRequestError ? error.code : "NATIVE_ERROR",
      error: error instanceof Error ? error.message : String(error)
    }));
  }
  const settingsMessage = message as SettingsMessage;
  if (settingsMessage.type === "native-settings-get") {
    return nativeRequest({ type: "settings-get" }, undefined, 15_000).catch(error => ({
      ok: false,
      code: error instanceof NativeRequestError ? error.code : "NATIVE_ERROR",
      error: error instanceof Error ? error.message : String(error)
    }));
  }
  if (settingsMessage.type === "native-settings-save") {
    return nativeRequest({
      type: "settings-save",
      senderEmail: settingsMessage.senderEmail,
      destinations: settingsMessage.destinations,
      defaultDestinationId: settingsMessage.defaultDestinationId
    }, undefined, 15_000).catch(error => ({
      ok: false,
      code: error instanceof NativeRequestError ? error.code : "NATIVE_ERROR",
      error: error instanceof Error ? error.message : String(error)
    }));
  }
  if ((message as RefreshMessage).type === "refresh-job") {
    return resumePendingJob().then(async () => (await browser.storage.local.get("sendJob")).sendJob);
  }
  const startMessage = message as StartMessage;
  if (startMessage.type !== "start-send" && startMessage.type !== "start-text-send") return undefined;
  return (async () => {
    const current = (await browser.storage.local.get("sendJob")).sendJob as JobState | undefined;
    if (activeRun || current?.status === "preparing" || current?.status === "sending") {
      return { ok: false, error: ptMessage("send_already_running") };
    }
    const task = runJob(startMessage);
    activeRun = task;
    void task.then(result => {
      if (startMessage.type === "start-text-send" && result.ok) {
        const session = (browser.storage as unknown as { session: SessionStorage }).session;
        void session.remove("textDraft");
      }
    }).finally(() => { if (activeRun === task) activeRun = undefined; });
    return task;
  })();
  });
});

browser.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === RECOVERY_ALARM) void resumePendingJob();
  else if (alarm.name === SUCCESS_BADGE_ALARM) void clearSuccessBadge();
});
browser.runtime.onStartup.addListener(() => { void resumePendingJob(); });

const CONTEXT_MENU_ID = "send-to-kindle";
type SessionStorage = {
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
};

async function installContextMenu() {
  await ptInitializeI18n();
  await browser.action.setTitle({ title: ptMessage("action_title") });
  return browser.contextMenus.remove(CONTEXT_MENU_ID).catch(() => undefined).then(() => {
    browser.contextMenus.create({
      id: CONTEXT_MENU_ID,
      title: ptMessage("action_title"),
      contexts: ["page", "selection"],
      documentUrlPatterns: ["http://*/*", "https://*/*"]
    });
  });
}

browser.runtime.onInstalled.addListener(() => { void installContextMenu(); });
browser.runtime.onStartup.addListener(() => { void installContextMenu(); });
browser.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes[PT_UI_LANGUAGE_KEY]) void installContextMenu();
});
browser.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== CONTEXT_MENU_ID || !tab?.id) return;
  const session = (browser.storage as unknown as { session: SessionStorage }).session;
  const request = {
    tabId: tab.id,
    title: tab.title || "",
    selectionText: typeof info.selectionText === "string" ? info.selectionText.slice(0, MAX_PASTED_TEXT_CHARS) : "",
    createdAt: Date.now()
  };
  void session.set({ contextRequest: request }).then(() => {
    const action = browser.action as typeof browser.action & { openPopup(): Promise<void> };
    return action.openPopup();
  }).catch(error => {
    void setBadge("!", "#b42318");
    console.error("Could not open send popup", error);
  });
});

void installContextMenu();
void resumePendingJob();
void browser.storage.local.remove("apiToken");
