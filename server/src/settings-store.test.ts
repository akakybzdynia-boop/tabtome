import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SettingsStore } from "./settings-store.js";

describe("SettingsStore", () => {
  const directories: string[] = [];
  const makeStore = () => {
    const directory = mkdtempSync(join(tmpdir(), "page-to-ereader-settings-"));
    directories.push(directory);
    return { directory, store: new SettingsStore(join(directory, "data", "settings.json")) };
  };

  afterEach(() => {
    for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
  });

  it("falls back to the legacy Kindle environment without persisting it", () => {
    const { store } = makeStore();
    expect(store.resolve({ SMTP_FROM: "sender@example.com", KINDLE_EMAIL: "reader@kindle.com" })).toEqual({
      senderEmail: "sender@example.com",
      destinations: [{ id: "kindle", kind: "kindle", email: "reader@kindle.com", senderApproved: false }],
      defaultDestinationId: "kindle"
    });
    expect(store.read()).toBeUndefined();
  });

  it("validates, persists and applies Kindle and PocketBook settings", () => {
    const { directory, store } = makeStore();
    const saved = store.save({
      senderEmail: "sender@example.com",
      destinations: [
        { id: "kindle", kind: "kindle", email: "reader@kindle.com", senderApproved: true },
        { id: "pocketbook", kind: "pocketbook", email: "reader@pbsync.com", senderApproved: true }
      ],
      defaultDestinationId: "pocketbook"
    });
    expect(store.read()).toEqual(saved);
    expect(store.apply({ SMTP_HOST: "smtp.example.com", SMTP_USER: "old@example.com" })).toEqual(expect.objectContaining({
      SMTP_USER: "sender@example.com",
      SMTP_FROM: "sender@example.com",
      KINDLE_EMAIL: "reader@kindle.com"
    }));
    expect(store.destination({}, "pocketbook")).toMatchObject({ email: "reader@pbsync.com" });
    expect(JSON.parse(readFileSync(join(directory, "data", "settings.json"), "utf8"))).toEqual(saved);
  });

  it("migrates a 0.9.1 settings file atomically", () => {
    const { directory, store } = makeStore();
    mkdirSync(join(directory, "data"));
    writeFileSync(join(directory, "data", "settings.json"), JSON.stringify({
      senderEmail: "sender@example.com",
      kindleEmail: "reader@kindle.com",
      amazonSenderApproved: true
    }), "utf8");
    expect(store.read()).toEqual({
      senderEmail: "sender@example.com",
      destinations: [{ id: "kindle", kind: "kindle", email: "reader@kindle.com", senderApproved: true }],
      defaultDestinationId: "kindle"
    });
    expect(JSON.parse(readFileSync(join(directory, "data", "settings.json"), "utf8"))).toHaveProperty("destinations");
  });

  it("rejects invalid destinations, a missing default and unknown fields", () => {
    const { store } = makeStore();
    const base = { senderEmail: "sender@example.com", defaultDestinationId: "pocketbook" };
    expect(() => store.save({ ...base, destinations: [{ id: "pocketbook", kind: "pocketbook", email: "reader@example.com", senderApproved: true }] })).toThrow();
    expect(() => store.save({ ...base, destinations: [{ id: "kindle", kind: "kindle", email: "reader@kindle.com", senderApproved: true }] })).toThrow();
    expect(() => store.save({ ...base, destinations: [{ id: "pocketbook", kind: "pocketbook", email: "reader@pbsync.com", senderApproved: true }], password: "secret" })).toThrow();
  });

  it("reports a corrupt settings file instead of silently ignoring it", () => {
    const { directory, store } = makeStore();
    mkdirSync(join(directory, "data"));
    writeFileSync(join(directory, "data", "settings.json"), "{", { encoding: "utf8", flag: "wx" });
    expect(() => store.read()).toThrow("Не удалось прочитать локальные настройки");
  });
});
