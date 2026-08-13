const NATIVE_HOST = "page_to_ereader_local";
const REQUIRED_PROTOCOL_VERSION = 1;
const RECOVERY_ALARM = "page-to-ereader-job-recovery";
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
type JobState = {
  status: "preparing" | "sending" | "success" | "error" | "interrupted";
  message: string;
  jobId: string;
  retryJobId?: string;
  source?: "tabs" | "text";
  tabIds?: number[];
  title?: string;
  startedAt: number;
  finishedAt?: number;
};
type StartTabsMessage = { type: "start-send"; jobId: string; tabIds: number[]; title?: string };
type StartTextMessage = {
  type: "start-text-send";
  jobId: string;
  text: string;
  content: string;
  imageSources?: ImageSource[];
  images?: RawPastedImage[];
  title?: string;
};
type StartMessage = StartTabsMessage | StartTextMessage;
type RefreshMessage = { type: "refresh-job" };
type DiagnosticsMessage = { type: "native-health" | "native-diagnostics" | "native-load-test" };
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
  entry?: {
    status?: NativeReply["status"];
    error?: string;
    result?: { title?: string; articleCount?: number; imageCount?: number };
  };
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
  await browser.action.setBadgeBackgroundColor({ color });
  await browser.action.setBadgeText({ text });
}

async function scheduleRecovery(delayMs = 15_000) {
  await browser.alarms.create(RECOVERY_ALARM, { when: Date.now() + delayMs });
}

async function clearRecovery() {
  await browser.alarms.clear(RECOVERY_ALARM);
}

function resultMessage(result?: { title?: string; articleCount?: number; imageCount?: number }) {
  return `Отправлено: ${result?.articleCount || 0} стр., изображений: ${result?.imageCount || 0}. «${result?.title || "EPUB"}»`;
}

function nativeRequest(command: Record<string, unknown>, onProgress?: (reply: NativeReply) => void, timeoutMs = 180_000) {
  const requestId = crypto.randomUUID();
  const message = { requestId, ...command };
  const bytes = new TextEncoder().encode(JSON.stringify(message)).byteLength;
  if (bytes > MAX_NATIVE_MESSAGE_BYTES) {
    return Promise.reject(new NativeRequestError("REQUEST_TOO_LARGE", `Запрос ${(bytes / 1024 / 1024).toFixed(1)} МБ превышает лимит 32 МБ.`));
  }

  return new Promise<NativeReply>((resolve, reject) => {
    let port: browser.runtime.Port;
    let settled = false;
    try { port = browser.runtime.connectNative(NATIVE_HOST); }
    catch (error) { reject(new NativeRequestError("NATIVE_HOST_UNAVAILABLE", error instanceof Error ? error.message : String(error))); return; }
    const timer = setTimeout(() => finish(new NativeRequestError("NATIVE_TIMEOUT", "Локальный компонент не ответил вовремя.")), timeoutMs);
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
      if (reply.type === "error") finish(new NativeRequestError(reply.code || "NATIVE_ERROR", reply.error || "Ошибка локального компонента"));
      else finish(undefined, reply);
    });
    port.onDisconnect.addListener(() => {
      if (settled) return;
      const portError = (port as browser.runtime.Port & { error?: { message?: string } }).error?.message;
      finish(new NativeRequestError("NATIVE_DISCONNECTED", portError || "Связь с локальным компонентом прервалась."));
    });
    try { port.postMessage(message); }
    catch (error) { finish(new NativeRequestError("NATIVE_WRITE_FAILED", error instanceof Error ? error.message : String(error))); }
  });
}

async function recoverNativeJob(job: JobState) {
  try {
    const data = await nativeRequest({ type: "job-status", jobId: job.jobId }, undefined, 15_000);
    if (data.status === "not_found") {
      await clearRecovery();
      await setJob({ ...job, status: "error", retryJobId: job.jobId, message: "Локальный компонент не начинал эту отправку. Её можно безопасно повторить.", finishedAt: Date.now() });
      await setBadge("!", "#b42318");
      return;
    }
    if (data.status === "completed") {
      await clearRecovery();
      await setJob({ ...job, status: "success", message: resultMessage(data.entry?.result), finishedAt: Date.now() });
      await setBadge("✓", "#157347");
    } else if (data.status === "interrupted") {
      await clearRecovery();
      await setJob({ ...job, status: "interrupted", message: data.entry?.error || "Результат отправки неизвестен. Проверьте библиотеку Kindle перед повтором.", finishedAt: Date.now() });
      await setBadge("?", "#9a6700");
    } else if (data.status === "failed") {
      await clearRecovery();
      await setJob({ ...job, status: "error", retryJobId: job.jobId, message: data.entry?.error || "Отправка завершилась до SMTP. Её можно безопасно повторить.", finishedAt: Date.now() });
      await setBadge("!", "#b42318");
    } else {
      await setJob({ ...job, status: "sending", message: data.status === "pending" ? "Локальный компонент собирает EPUB…" : "SMTP-отправка выполняется…" });
      await scheduleRecovery();
    }
  } catch {
    if (Date.now() - job.startedAt >= CLIENT_JOB_TTL_MS) {
      await clearRecovery();
      await setJob({ ...job, status: "error", retryJobId: job.jobId, message: "Не удалось узнать результат отправки за семь дней. Повтор с тем же идентификатором останется защищён локальным компонентом.", finishedAt: Date.now() });
      await setBadge("!", "#b42318");
    } else {
      await setJob({ ...job, status: "sending", message: "Жду локальный компонент, чтобы узнать результат отправки…" });
      await scheduleRecovery(60_000);
    }
  }
}

async function resumePendingJob() {
  if (activeRun) {
    await scheduleRecovery();
    return;
  }
  const stored = await browser.storage.local.get("sendJob");
  const job = stored.sendJob as JobState | undefined;
  if (!job) return;
  if (job.status === "preparing") {
    await clearRecovery();
    await setJob({ ...job, status: "error", retryJobId: job.jobId, message: "Подготовка прервалась до запуска локального компонента. Задание можно безопасно повторить.", finishedAt: Date.now() });
    await setBadge("!", "#b42318");
    return;
  }
  if (job.status !== "sending") return;
  await recoverNativeJob(job);
}

function blobToData(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error("Не удалось прочитать изображение"));
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
  if (!converted) throw new Error("Не удалось преобразовать формат изображения");
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
    throw new Error("Недопустимые данные вставленного изображения");
  }
  const binary = atob(image.data);
  if (binary.length > MAX_SOURCE_IMAGE_BYTES) throw new Error("Вставленное изображение превышает лимит 12 МБ");
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
  if (!injected[0]?.result) throw new Error("Статья не распознана");
  return injected[0].result as ExtractedArticle;
}

async function runJob(message: StartMessage) {
  const startedAt = Date.now();
  const isText = message.type === "start-text-send";
  const baseJob = {
    jobId: message.jobId,
    source: isText ? "text" as const : "tabs" as const,
    ...(!isText ? { tabIds: message.tabIds } : {}),
    title: message.title,
    startedAt
  };
  const heartbeat = setInterval(() => {
    void browser.storage.local.set({ sendJobHeartbeat: Date.now() });
  }, 20_000);
  const update = async (text: string) => setJob({ ...baseJob, status: "preparing", message: text });
  await update("Проверяю локальный компонент…");
  await setBadge("…", "#1769aa");

  try {
    const health = await nativeRequest({ type: "health" }, undefined, 15_000);
    if (!health.ok || !health.configOk) throw new Error(health.error || "Локальный компонент не настроен");
    if (Number(health.protocolVersion) !== REQUIRED_PROTOCOL_VERSION) throw new Error("Версии расширения и локального компонента несовместимы. Обновите оба компонента.");

    const stored = await browser.storage.local.get("grayscaleImages");
    const grayscale = stored.grayscaleImages !== false;
    const imageBytes = { bytes: 0 };
    const articles: Array<ExtractedArticle | PreparedTextArticle> = [];
    if (isText) {
      if (!health.capabilities?.includes("pastedRichText")) {
        throw new Error("Для форматированного текста обновите локальный компонент до версии 0.8.0 или новее.");
      }
      const text = message.text.replace(/\r\n?/g, "\n").trim();
      if (text.length > MAX_PASTED_TEXT_CHARS) throw new Error("Текст превышает лимит 1 000 000 символов.");
      if (!message.content.trim() || message.content.length > 5_000_000) throw new Error("Форматированный текст пуст или превышает допустимый размер.");
      await update("Подготавливаю форматирование и изображения…");
      const articleTitle = message.title?.trim() || `Текст — ${new Date().toLocaleString("ru-RU")}`;
      const pastedImages = await normalizePastedImages(message.images || [], imageBytes, grayscale);
      const article: PreparedTextArticle & ExtractedArticle = {
        kind: "text",
        title: articleTitle,
        ...(text ? { text } : {}),
        content: message.content,
        lang: browser.i18n.getUILanguage() || "ru",
        imageSources: (message.imageSources || []).slice(0, MAX_IMAGES_PER_ARTICLE),
        images: pastedImages.images
      };
      const remoteImages = await downloadImages(article, imageBytes, grayscale, "paste");
      const skippedImages = pastedImages.skipped + remoteImages.skipped;
      if (skippedImages) throw new Error(`Не удалось безопасно подготовить изображений: ${skippedImages}. Удалите их из текста или повторите отправку.`);
      if (!text && !article.images?.length) throw new Error("Вставьте текст или изображение для отправки.");
      articles.push(article);
    } else {
      for (let index = 0; index < message.tabIds.length; index++) {
        const tabId = message.tabIds[index];
        await update(`Извлекаю статью ${index + 1} из ${message.tabIds.length}…`);
        try {
          const article = await extractArticle(tabId);
          await update(`Загружаю изображения ${index + 1} из ${message.tabIds.length}…`);
          await downloadImages(article, imageBytes, grayscale);
          articles.push(article);
        } catch (error) {
          const tab = await browser.tabs.get(tabId);
          throw new Error(`${tab.title || tab.url}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }

    const sendingJob: JobState = { ...baseJob, status: "sending", message: "Запускаю локальный компонент…" };
    await setJob(sendingJob);
    await scheduleRecovery();
    let data: NativeReply;
    try {
      data = await nativeRequest(
        { type: "send", jobId: message.jobId, title: message.title || undefined, articles },
        progress => {
          const text = progress.message || (progress.status === "sending" ? "Отправляю через SMTP…" : "Собираю EPUB…");
          void setJob({ ...baseJob, status: "sending", message: text });
        }
      );
    } catch (error) {
      if (error instanceof NativeRequestError && error.code === "JOB_INTERRUPTED") {
        await clearRecovery();
        await setJob({ ...baseJob, status: "interrupted", message: error.message, finishedAt: Date.now() });
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
    const result = resultMessage({ title: data.title, articleCount: data.articleCount, imageCount: data.imageCount });
    await setJob({ ...baseJob, status: "success", message: result, finishedAt: Date.now() });
    await setBadge("✓", "#157347");
    return { ok: true };
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    await clearRecovery();
    await setJob({ ...baseJob, status: "error", message: messageText, retryJobId: message.jobId, finishedAt: Date.now() });
    await setBadge("!", "#b42318");
    return { ok: false, error: messageText };
  } finally {
    clearInterval(heartbeat);
  }
}

browser.runtime.onMessage.addListener((message: unknown) => {
  if (!message) return undefined;
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
        return { ok: false, code: "PROTOCOL_MISMATCH", error: "Версии расширения и локального компонента несовместимы." };
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
        return { ok: false, code: "PROTOCOL_MISMATCH", error: "Версии расширения и локального компонента несовместимы." };
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
  if ((message as RefreshMessage).type === "refresh-job") {
    return resumePendingJob().then(async () => (await browser.storage.local.get("sendJob")).sendJob);
  }
  const startMessage = message as StartMessage;
  if (startMessage.type !== "start-send" && startMessage.type !== "start-text-send") return undefined;
  return (async () => {
    const current = (await browser.storage.local.get("sendJob")).sendJob as JobState | undefined;
    if (activeRun || current?.status === "preparing" || current?.status === "sending") {
      return { ok: false, error: "Предыдущая отправка ещё выполняется или её результат проверяется" };
    }
    const task = runJob(startMessage);
    activeRun = task;
    void task.finally(() => { if (activeRun === task) activeRun = undefined; });
    return task;
  })();
});

browser.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === RECOVERY_ALARM) void resumePendingJob();
});
browser.runtime.onStartup.addListener(() => { void resumePendingJob(); });
void resumePendingJob();
void browser.storage.local.remove("apiToken");
