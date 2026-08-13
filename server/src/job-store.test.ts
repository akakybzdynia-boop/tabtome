import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JOB_TTL_MS, JobBusyError, JobPersistenceError, JobStore } from "./job-store.js";

describe("multi-process job ledger", () => {
  const directories: string[] = [];
  const makeDirectory = () => {
    const root = mkdtempSync(join(tmpdir(), "page-to-ereader-jobs-"));
    directories.push(root);
    return join(root, "data", "jobs");
  };

  afterEach(() => {
    for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
  });

  it("restores a completed result in a new process store", () => {
    const directory = makeDirectory();
    const result = { ok: true as const, title: "Book", articleCount: 1, imageCount: 0, epubBytes: 123 };
    const first = new JobStore(directory);
    const release = first.acquire("job");
    first.begin("job");
    first.markSending("job");
    first.complete("job", result);
    release();
    expect(new JobStore(directory).get("job")).toMatchObject({ status: "completed", result });
  });

  it("keeps a sending job active while its owner lock is alive", () => {
    const directory = makeDirectory();
    const first = new JobStore(directory);
    const release = first.acquire("job");
    first.begin("job");
    first.markSending("job");
    expect(new JobStore(directory).get("job")).toMatchObject({ status: "sending" });
    release();
  });

  it("turns an abandoned sending marker into interrupted", () => {
    const directory = makeDirectory();
    const first = new JobStore(directory);
    const release = first.acquire("job");
    first.begin("job");
    first.markSending("job");
    release();
    expect(new JobStore(directory).get("job")).toMatchObject({ status: "interrupted" });
  });

  it("turns an abandoned pending marker into a safely retryable failure", () => {
    const directory = makeDirectory();
    const first = new JobStore(directory);
    const release = first.acquire("job");
    first.begin("job");
    release();
    expect(new JobStore(directory).get("job")).toMatchObject({ status: "failed" });
  });

  it("prevents two host processes from owning the same job", () => {
    const directory = makeDirectory();
    const first = new JobStore(directory);
    const release = first.acquire("job");
    expect(() => new JobStore(directory).acquire("job")).toThrow(JobBusyError);
    release();
  });

  it("conservatively migrates a legacy HTTP processing marker", () => {
    const directory = makeDirectory();
    const legacy = join(dirname(directory), "jobs.json");
    mkdirSync(dirname(directory), { recursive: true });
    writeFileSync(legacy, JSON.stringify({ legacy: { status: "processing", ts: Date.now() } }), "utf8");
    expect(new JobStore(directory).get("legacy")).toMatchObject({ status: "interrupted" });
  });

  it("rolls back markSending when its durable write fails", () => {
    const store = new JobStore();
    const release = store.acquire("job");
    store.begin("job");
    vi.spyOn(store as unknown as { write(id: string, entry: unknown): void }, "write").mockImplementationOnce(() => { throw new Error("disk full"); });
    expect(() => store.markSending("job")).toThrow(JobPersistenceError);
    expect(store.get("job")).toMatchObject({ status: "pending" });
    release();
  });

  it("keeps server tombstones longer than the client recovery window", () => {
    expect(JOB_TTL_MS).toBeGreaterThan(7 * 24 * 60 * 60 * 1000);
  });
});
