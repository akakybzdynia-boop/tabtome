import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

export type SendResult = {
  ok: true;
  title: string;
  articleCount: number;
  imageCount: number;
  epubBytes: number;
};

export type JobEntry =
  | { status: "pending"; ts: number }
  | { status: "sending"; ts: number }
  | { status: "completed"; ts: number; result: SendResult }
  | { status: "failed"; ts: number; error: string }
  | { status: "interrupted"; ts: number; error: string };

type LockOwner = { pid: number; token: string; createdAt: number };

export class JobPersistenceError extends Error {
  readonly code = "JOB_STORE_UNAVAILABLE";
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "JobPersistenceError";
  }
}

export class JobBusyError extends Error {
  readonly code = "JOB_BUSY";
  constructor() {
    super("Задание уже выполняется другим процессом.");
    this.name = "JobBusyError";
  }
}

export const JOB_TTL_MS = 8 * 24 * 60 * 60 * 1000;
const LOCK_TTL_MS = 10 * 60 * 1000;
const NEW_LOCK_GRACE_MS = 5_000;
const VALID_ID = /^[a-zA-Z0-9_-]{1,100}$/;

export class JobStore {
  private readonly memory = new Map<string, JobEntry>();
  private readonly memoryLocks = new Set<string>();

  constructor(private readonly directory?: string, private readonly ttlMs = JOB_TTL_MS) {
    if (!directory) return;
    mkdirSync(directory, { recursive: true });
    this.migrateLegacyLedger();
    this.purge();
  }

  get(id: string): JobEntry | undefined {
    this.assertId(id);
    const entry = this.read(id);
    if (!entry || (entry.status !== "pending" && entry.status !== "sending")) return entry;
    if (this.isLockActive(id)) return entry;
    return this.recoverAbandoned(id, entry);
  }

  acquire(id: string): () => void {
    this.assertId(id);
    if (!this.directory) {
      if (this.memoryLocks.has(id)) throw new JobBusyError();
      this.memoryLocks.add(id);
      const existing = this.memory.get(id);
      if (existing?.status === "pending" || existing?.status === "sending") this.recoverAbandoned(id, existing);
      return () => { this.memoryLocks.delete(id); };
    }

    const lockDirectory = this.lockDirectory(id);
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        mkdirSync(lockDirectory);
        const owner: LockOwner = { pid: process.pid, token: randomUUID(), createdAt: Date.now() };
        writeFileSync(join(lockDirectory, "owner.json"), JSON.stringify(owner), { encoding: "utf8", mode: 0o600 });
        const existing = this.read(id);
        if (existing?.status === "pending" || existing?.status === "sending") this.recoverAbandoned(id, existing);
        let released = false;
        return () => {
          if (released) return;
          released = true;
          try {
            const current = this.readLockOwner(id);
            if (current?.token === owner.token) rmSync(lockDirectory, { recursive: true, force: true });
          } catch { /* A stale lock is recovered by the next host process. */ }
        };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
          try { rmSync(lockDirectory, { recursive: true, force: true }); } catch { /* Best effort cleanup. */ }
          throw new JobPersistenceError("Не удалось создать блокировку задания.", { cause: error });
        }
        if (this.isLockActive(id)) throw new JobBusyError();
        try { rmSync(lockDirectory, { recursive: true, force: true }); }
        catch (cause) { throw new JobPersistenceError("Не удалось удалить устаревшую блокировку задания.", { cause }); }
      }
    }
    throw new JobBusyError();
  }

  begin(id: string) { this.transition(id, { status: "pending", ts: Date.now() }); }
  markSending(id: string) { this.transition(id, { status: "sending", ts: Date.now() }); }

  complete(id: string, result: SendResult) {
    try {
      this.transition(id, { status: "completed", ts: Date.now(), result });
    } catch (error) {
      this.interruptInMemory(id, "SMTP принял письмо, но результат не удалось сохранить. Проверьте библиотеку Kindle.");
      throw error;
    }
  }

  fail(id: string, error: string) { this.transition(id, { status: "failed", ts: Date.now(), error }); }

  interrupt(id: string, error: string) {
    const entry: JobEntry = { status: "interrupted", ts: Date.now(), error };
    if (!this.directory) {
      this.memory.set(id, entry);
      return;
    }
    try { this.write(id, entry); }
    catch (cause) { throw new JobPersistenceError("Не удалось сохранить неопределённый результат SMTP-отправки.", { cause }); }
  }

  private recoverAbandoned(id: string, entry: Extract<JobEntry, { status: "pending" | "sending" }>) {
    const recovered: JobEntry = entry.status === "sending"
      ? { status: "interrupted", ts: Date.now(), error: "Процесс был остановлен во время SMTP-отправки. Проверьте библиотеку Kindle перед повтором." }
      : { status: "failed", ts: Date.now(), error: "Процесс был остановлен до начала SMTP-отправки. Задание можно безопасно повторить." };
    this.write(id, recovered);
    return recovered;
  }

  private interruptInMemory(id: string, error: string) {
    const entry: JobEntry = { status: "interrupted", ts: Date.now(), error };
    if (!this.directory) {
      this.memory.set(id, entry);
      return;
    }
    try { this.write(id, entry); } catch { /* The durable sending marker remains conservative. */ }
  }

  private transition(id: string, next: JobEntry) {
    this.assertId(id);
    const previous = this.read(id);
    try { this.write(id, next); }
    catch (cause) {
      if (!this.directory) {
        if (previous) this.memory.set(id, previous);
        else this.memory.delete(id);
      }
      throw new JobPersistenceError("Не удалось надёжно сохранить состояние отправки. SMTP не запущен.", { cause });
    }
  }

  private read(id: string): JobEntry | undefined {
    if (!this.directory) return this.memory.get(id);
    try {
      const parsed = JSON.parse(readFileSync(this.jobFile(id), "utf8")) as JobEntry;
      return this.normalizeEntry(id, parsed);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw new JobPersistenceError(`Не удалось прочитать состояние задания ${id}.`, { cause: error });
    }
  }

  private write(id: string, entry: JobEntry) {
    if (!this.directory) {
      this.memory.set(id, entry);
      return;
    }
    mkdirSync(this.directory, { recursive: true });
    const file = this.jobFile(id);
    const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
    writeFileSync(temporary, JSON.stringify(entry), { encoding: "utf8", mode: 0o600 });
    renameSync(temporary, file);
  }

  private normalizeEntry(id: string, raw: JobEntry): JobEntry {
    const status = (raw as unknown as { status?: string }).status;
    if (status === "processing") {
      return { status: "interrupted", ts: Date.now(), error: "Незавершённое задание HTTP-версии имеет неопределённый результат. Проверьте Kindle перед повтором." };
    }
    if (!["pending", "sending", "completed", "failed", "interrupted"].includes(String(status))) {
      throw new Error(`Некорректное состояние задания ${id}: ${String(status)}`);
    }
    return raw;
  }

  private isLockActive(id: string) {
    if (!this.directory) return this.memoryLocks.has(id);
    const lockDirectory = this.lockDirectory(id);
    try {
      const owner = this.readLockOwner(id);
      if (!owner) return Date.now() - statSync(lockDirectory).mtimeMs < NEW_LOCK_GRACE_MS;
      if (Date.now() - owner.createdAt >= LOCK_TTL_MS) return false;
      try { process.kill(owner.pid, 0); return true; }
      catch (error) { return (error as NodeJS.ErrnoException).code !== "ESRCH"; }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      return true;
    }
  }

  private readLockOwner(id: string): LockOwner | undefined {
    try { return JSON.parse(readFileSync(join(this.lockDirectory(id), "owner.json"), "utf8")) as LockOwner; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
  }

  private purge() {
    if (!this.directory) return;
    const cutoff = Date.now() - this.ttlMs;
    for (const name of readdirSync(this.directory)) {
      if (!name.endsWith(".json")) continue;
      const id = name.slice(0, -5);
      if (!VALID_ID.test(id)) continue;
      try {
        const entry = this.read(id);
        if (entry && entry.ts < cutoff && entry.status !== "pending" && entry.status !== "sending") unlinkSync(this.jobFile(id));
      } catch { /* A corrupt ledger entry must remain for diagnosis. */ }
    }
  }

  private migrateLegacyLedger() {
    if (!this.directory) return;
    const legacy = join(dirname(this.directory), "jobs.json");
    if (!existsSync(legacy)) return;
    const entries = JSON.parse(readFileSync(legacy, "utf8")) as Record<string, JobEntry>;
    for (const [id, raw] of Object.entries(entries)) {
      if (!VALID_ID.test(id) || existsSync(this.jobFile(id))) continue;
      const status = (raw as unknown as { status?: string }).status;
      const entry: JobEntry = status === "processing" || status === "sending"
        ? { status: "interrupted", ts: Date.now(), error: "Незавершённое задание предыдущей версии имеет неопределённый результат. Проверьте Kindle перед повтором." }
        : status === "pending"
          ? { status: "failed", ts: Date.now(), error: "Задание предыдущей версии остановилось до SMTP и может быть безопасно повторено." }
          : this.normalizeEntry(id, raw);
      this.write(id, entry);
    }
    renameSync(legacy, join(dirname(this.directory), `jobs-v0.5-imported-${Date.now()}.json`));
  }

  private assertId(id: string) {
    if (!VALID_ID.test(id)) throw new Error("Некорректный идентификатор задания.");
  }
  private jobFile(id: string) { return join(this.directory!, `${id}.json`); }
  private lockDirectory(id: string) { return join(this.directory!, `${id}.lock`); }
}
