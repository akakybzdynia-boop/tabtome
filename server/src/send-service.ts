import { z } from "zod";
import { createEpub } from "./epub.js";
import {
  JobBusyError,
  JobPersistenceError,
  JobStore,
  type JobEntry,
  type SendResult
} from "./job-store.js";
import { log } from "./logger.js";
import type { DeliveryDestination } from "./settings-store.js";

const articleMetadata = {
  title: z.string().trim().min(1).max(500),
  byline: z.string().max(500).nullish(),
  siteName: z.string().max(500).nullish(),
  excerpt: z.string().max(2000).nullish(),
  lang: z.string().max(30).nullish()
};

const articleImages = z.array(z.object({
  id: z.string().regex(/^[a-z0-9-]{1,50}$/),
  mediaType: z.enum(["image/jpeg", "image/png", "image/gif"]),
  data: z.string().min(1).max(8_000_000)
})).max(30);

const webArticle = z.object({
  ...articleMetadata,
  kind: z.literal("web").optional(),
  url: z.string().url().max(4000),
  content: z.string().min(1).max(5_000_000),
  images: articleImages.optional()
});

const textArticle = z.object({
  ...articleMetadata,
  kind: z.literal("text"),
  text: z.string().trim().min(1).max(1_000_000).optional(),
  content: z.string().trim().min(1).max(5_000_000).optional(),
  images: articleImages.optional()
}).superRefine((value, context) => {
  if (!value.text && !value.content) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Text article must contain text or HTML content" });
  }
});

const article = z.union([textArticle, webArticle]);

export const sendInputSchema = z.object({
  jobId: z.string().uuid(),
  destinationId: z.enum(["kindle", "pocketbook"]),
  title: z.string().max(200).optional(),
  articles: z.array(article).min(1).max(25)
});
export type SendInput = z.infer<typeof sendInputSchema>;

export type Mailer = {
  verify(): Promise<unknown>;
  send(recipient: string, filename: string, title: string, content: Buffer): Promise<unknown>;
};

export type ProgressUpdate = { status: "pending" | "sending"; message: string };
export type ProgressListener = (update: ProgressUpdate) => void | Promise<void>;

const MAX_EPUB_BYTES = 18 * 1024 * 1024;

export class EpubTooLargeError extends Error {
  readonly code = "EPUB_TOO_LARGE";
  constructor(readonly bytes: number, readonly limit = MAX_EPUB_BYTES) {
    super(`Книга ${(bytes / 1024 / 1024).toFixed(1)} МБ превышает безопасный лимит ${(limit / 1024 / 1024).toFixed(0)} МБ. Уберите часть вкладок или изображений.`);
    this.name = "EpubTooLargeError";
  }
}

export class SendOutcomeUncertainError extends Error {
  readonly code = "JOB_INTERRUPTED";
  constructor(message = "Результат SMTP-отправки неизвестен. Проверьте библиотеку читалки перед повтором.") {
    super(message);
    this.name = "SendOutcomeUncertainError";
  }
}

export class JobInterruptedError extends Error {
  readonly code = "JOB_INTERRUPTED";
  constructor(message: string) {
    super(message);
    this.name = "JobInterruptedError";
  }
}

export function assertEpubSize(bytes: number, limit = MAX_EPUB_BYTES) {
  if (bytes > limit) throw new EpubTooLargeError(bytes, limit);
}

export class SendService {
  constructor(private readonly mailer: Mailer, private readonly jobs: JobStore) {}

  private async progress(listener: ProgressListener | undefined, update: ProgressUpdate) {
    try { await listener?.(update); }
    catch (error) { log("Could not deliver a native progress update", error); }
  }

  status(jobId: string): JobEntry | undefined {
    return this.jobs.get(jobId);
  }

  async smtpCheck() {
    await this.mailer.verify();
    return { ok: true as const, checkedAt: new Date().toISOString() };
  }

  async send(raw: unknown, destination: DeliveryDestination, onProgress?: ProgressListener): Promise<SendResult & { deduplicated?: true }> {
    const input = sendInputSchema.parse(raw);
    if (input.destinationId !== destination.id) throw new Error("Получатель задания не совпадает с локальными настройками.");
    const beforeLock = this.jobs.get(input.jobId);
    this.assertDestination(beforeLock, input.destinationId);
    if (beforeLock?.status === "completed") return { ...beforeLock.result, deduplicated: true };
    if (beforeLock?.status === "interrupted") throw new JobInterruptedError(beforeLock.error);
    if (beforeLock?.status === "pending" || beforeLock?.status === "sending") throw new JobBusyError();

    const release = this.jobs.acquire(input.jobId);
    try {
      const stored = this.jobs.get(input.jobId);
      this.assertDestination(stored, input.destinationId);
      if (stored?.status === "completed") return { ...stored.result, deduplicated: true };
      if (stored?.status === "interrupted") throw new JobInterruptedError(stored.error);
      if (stored?.status === "pending" || stored?.status === "sending") throw new JobBusyError();

      this.jobs.begin(input.jobId, input.destinationId);
      await this.progress(onProgress, { status: "pending", message: "Собираю EPUB…" });
      let epub: Awaited<ReturnType<typeof createEpub>>;
      try {
        epub = await createEpub(input.articles, input.title);
        assertEpubSize(epub.buffer.length);
      } catch (error) {
        try { this.jobs.fail(input.jobId, error instanceof Error ? error.message : "Неизвестная ошибка EPUB", input.destinationId); }
        catch (storeError) { log("Could not persist a safe pre-SMTP failure", storeError); }
        throw error;
      }

      // Fail closed: SMTP must not start unless "sending" is durable.
      this.jobs.markSending(input.jobId, input.destinationId);
      await this.progress(onProgress, { status: "sending", message: "Отправляю книгу через SMTP…" });
      try {
        await this.mailer.send(destination.email, epub.filename, epub.title, epub.buffer);
      } catch (error) {
        const detail = error instanceof Error ? error.message : "Неизвестная ошибка SMTP";
        try { this.jobs.interrupt(input.jobId, detail, input.destinationId); }
        catch (storeError) { log("Could not persist an interrupted SMTP job", storeError); }
        throw new SendOutcomeUncertainError("SMTP-соединение завершилось с неопределённым результатом. Проверьте библиотеку читалки перед повтором.");
      }

      const result: SendResult = {
        ok: true,
        title: epub.title,
        articleCount: input.articles.length,
        imageCount: epub.imageCount,
        epubBytes: epub.buffer.length,
        destinationId: input.destinationId
      };
      try {
        this.jobs.complete(input.jobId, result);
      } catch (error) {
        log("SMTP succeeded, but the completed job could not be persisted", error);
        throw new SendOutcomeUncertainError("SMTP принял письмо, но результат не удалось сохранить. Проверьте библиотеку читалки перед повтором.");
      }
      return result;
    } finally {
      release();
    }
  }

  private assertDestination(entry: JobEntry | undefined, destinationId: string) {
    const storedDestination = entry?.status === "completed" ? entry.result.destinationId : entry?.destinationId;
    if (storedDestination && storedDestination !== destinationId) {
      throw new Error("Идентификатор задания уже использован для другого получателя.");
    }
  }
}

export function errorCode(error: unknown) {
  if (error instanceof z.ZodError) return "INVALID_REQUEST";
  if (error instanceof EpubTooLargeError) return error.code;
  if (error instanceof SendOutcomeUncertainError || error instanceof JobInterruptedError) return error.code;
  if (error instanceof JobPersistenceError || error instanceof JobBusyError) return error.code;
  return "INTERNAL_ERROR";
}
