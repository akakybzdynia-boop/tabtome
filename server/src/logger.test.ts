import { describe, expect, it } from "vitest";
import { redactLogText } from "./logger.js";

describe("log hygiene", () => {
  it("redacts email addresses", () => {
    expect(redactLogText("send to reader@kindle.com failed")).toBe("send to [REDACTED_EMAIL] failed");
  });

  it("redacts API-token-shaped values", () => {
    expect(redactLogText(`token ${"a".repeat(64)}`)).toBe("token [REDACTED_TOKEN]");
  });
});
