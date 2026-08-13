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

  it("falls back to existing environment addresses without persisting them", () => {
    const { store } = makeStore();
    expect(store.resolve({ SMTP_FROM: "sender@example.com", KINDLE_EMAIL: "reader@kindle.com" })).toEqual({
      senderEmail: "sender@example.com",
      kindleEmail: "reader@kindle.com",
      amazonSenderApproved: false
    });
    expect(store.read()).toBeUndefined();
  });

  it("validates, persists and applies address settings", () => {
    const { directory, store } = makeStore();
    const saved = store.save({
      senderEmail: "sender@example.com",
      kindleEmail: "reader@kindle.com",
      amazonSenderApproved: true
    });
    expect(store.read()).toEqual(saved);
    expect(store.apply({ SMTP_HOST: "smtp.example.com", SMTP_USER: "old@example.com" })).toEqual(expect.objectContaining({
      SMTP_USER: "sender@example.com",
      SMTP_FROM: "sender@example.com",
      KINDLE_EMAIL: "reader@kindle.com"
    }));
    expect(JSON.parse(readFileSync(join(directory, "data", "settings.json"), "utf8"))).toEqual(saved);

    const updated = store.save({ ...saved, kindleEmail: "second@kindle.com" });
    expect(store.read()).toEqual(updated);
  });

  it("rejects invalid and unknown fields", () => {
    const { store } = makeStore();
    expect(() => store.save({ senderEmail: "bad", kindleEmail: "reader@kindle.com", amazonSenderApproved: true })).toThrow();
    expect(() => store.save({ senderEmail: "sender@example.com", kindleEmail: "reader@kindle.com", amazonSenderApproved: true, password: "secret" })).toThrow();
  });

  it("reports a corrupt settings file instead of silently ignoring it", () => {
    const { directory, store } = makeStore();
    mkdirSync(join(directory, "data"));
    writeFileSync(join(directory, "data", "settings.json"), "{", { encoding: "utf8", flag: "wx" });
    expect(() => store.read()).toThrow("Не удалось прочитать локальные настройки");
  });
});
