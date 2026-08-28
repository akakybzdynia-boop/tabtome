import { describe, expect, it, vi } from "vitest";
import { JobBusyError, JobPersistenceError, JobStore } from "./job-store.js";
import { JobInterruptedError, SendOutcomeUncertainError, SendService, type Mailer } from "./send-service.js";

const article = { title: "Test article", url: "https://example.com/article", content: "<p>Hello</p>" };
const kindle = { id: "kindle", kind: "kindle", email: "reader@kindle.com", senderApproved: true } as const;
const pocketbook = { id: "pocketbook", kind: "pocketbook", email: "reader@pbsync.com", senderApproved: true } as const;

function setup() {
  const mailer: Mailer = { verify: vi.fn(async () => true), send: vi.fn(async () => true) };
  const jobs = new JobStore();
  return { mailer, jobs, service: new SendService(mailer, jobs) };
}

describe("transport-independent send service", () => {
  it("sends an EPUB and saves its result", async () => {
    const { mailer, jobs, service } = setup();
    const jobId = crypto.randomUUID();
    const result = await service.send({ jobId, destinationId: "kindle", articles: [article] }, kindle);
    expect(result).toMatchObject({ ok: true, articleCount: 1, destinationId: "kindle" });
    expect(mailer.send).toHaveBeenCalledWith("reader@kindle.com", expect.any(String), expect.any(String), expect.any(Buffer));
    expect(jobs.get(jobId)).toMatchObject({ status: "completed" });
  });

  it("accepts pasted text without a source URL", async () => {
    const { mailer, service } = setup();
    const result = await service.send({
      jobId: crypto.randomUUID(), destinationId: "kindle",
      articles: [{ kind: "text", title: "Note", lang: "ru", text: "Обычный текст" }]
    }, kindle);
    expect(result).toMatchObject({ ok: true, articleCount: 1, imageCount: 0 });
    expect(mailer.send).toHaveBeenCalledOnce();
  });

  it("accepts formatted pasted text with embedded images", async () => {
    const { mailer, service } = setup();
    const result = await service.send({
      jobId: crypto.randomUUID(), destinationId: "kindle",
      articles: [{
        kind: "text",
        title: "Rich note",
        lang: "ru",
        content: "<p><strong>Текст</strong><img data-kindle-image-id=\"pasted-1\"></p>",
        images: [{ id: "pasted-1", mediaType: "image/png", data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=" }]
      }]
    }, kindle);
    expect(result).toMatchObject({ ok: true, articleCount: 1, imageCount: 1 });
    expect(mailer.send).toHaveBeenCalledOnce();
  });

  it("deduplicates a completed job", async () => {
    const { mailer, service } = setup();
    const input = { jobId: crypto.randomUUID(), destinationId: "kindle" as const, articles: [article] };
    await service.send(input, kindle);
    expect(await service.send(input, kindle)).toMatchObject({ deduplicated: true });
    expect(mailer.send).toHaveBeenCalledOnce();
  });

  it("reports a concurrently locked job instead of starting another SMTP send", async () => {
    const { mailer, service } = setup();
    let release!: () => void;
    let entered!: () => void;
    const wait = new Promise<void>(resolve => { release = resolve; });
    const started = new Promise<void>(resolve => { entered = resolve; });
    mailer.send = vi.fn(async () => { entered(); await wait; });
    const input = { jobId: crypto.randomUUID(), destinationId: "kindle" as const, articles: [article] };
    const first = service.send(input, kindle);
    await started;
    await expect(service.send(input, kindle)).rejects.toBeInstanceOf(JobBusyError);
    release();
    await first;
    expect(mailer.send).toHaveBeenCalledOnce();
  });

  it("marks an SMTP disconnect as interrupted", async () => {
    const { mailer, jobs, service } = setup();
    mailer.send = vi.fn(async () => { throw new Error("connection lost"); });
    const jobId = crypto.randomUUID();
    await expect(service.send({ jobId, destinationId: "kindle", articles: [article] }, kindle)).rejects.toBeInstanceOf(SendOutcomeUncertainError);
    expect(jobs.get(jobId)).toMatchObject({ status: "interrupted" });
  });

  it("refuses an explicit repeat of an interrupted id", async () => {
    const { jobs, service } = setup();
    const jobId = crypto.randomUUID();
    const release = jobs.acquire(jobId);
    jobs.begin(jobId, "kindle");
    jobs.markSending(jobId, "kindle");
    jobs.interrupt(jobId, "unknown result", "kindle");
    release();
    await expect(service.send({ jobId, destinationId: "kindle", articles: [article] }, kindle)).rejects.toBeInstanceOf(JobInterruptedError);
  });

  it("allows a pre-SMTP failed id to retry", async () => {
    const { jobs, mailer, service } = setup();
    const jobId = crypto.randomUUID();
    const release = jobs.acquire(jobId);
    jobs.begin(jobId, "kindle");
    jobs.fail(jobId, "safe failure", "kindle");
    release();
    await service.send({ jobId, destinationId: "kindle", articles: [article] }, kindle);
    expect(mailer.send).toHaveBeenCalledOnce();
  });

  it("never calls SMTP if the sending marker cannot be persisted", async () => {
    const { jobs, mailer, service } = setup();
    vi.spyOn(jobs, "markSending").mockImplementationOnce(() => { throw new JobPersistenceError("disk unavailable"); });
    await expect(service.send({ jobId: crypto.randomUUID(), destinationId: "kindle", articles: [article] }, kindle)).rejects.toBeInstanceOf(JobPersistenceError);
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it("continues safely if the progress channel closes", async () => {
    const { mailer, service } = setup();
    const progress = vi.fn(async () => { throw new Error("broken pipe"); });
    await expect(service.send({ jobId: crypto.randomUUID(), destinationId: "kindle", articles: [article] }, kindle, progress)).resolves.toMatchObject({ ok: true });
    expect(progress).toHaveBeenCalledTimes(2);
    expect(mailer.send).toHaveBeenCalledOnce();
  });

  it("does not reuse a job id for another destination", async () => {
    const { mailer, service } = setup();
    const jobId = crypto.randomUUID();
    await service.send({ jobId, destinationId: "kindle", articles: [article] }, kindle);
    await expect(service.send({ jobId, destinationId: "pocketbook", articles: [article] }, pocketbook))
      .rejects.toThrow("другого получателя");
    expect(mailer.send).toHaveBeenCalledOnce();
  });
});
