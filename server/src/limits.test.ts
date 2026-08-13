import { describe, expect, it } from "vitest";
import { assertEpubSize, EpubTooLargeError } from "./send-service.js";

describe("EPUB mail size guard", () => {
  it("accepts an EPUB at the configured limit", () => {
    expect(() => assertEpubSize(18 * 1024 * 1024)).not.toThrow();
  });

  it("rejects an EPUB above the configured limit", () => {
    expect(() => assertEpubSize(18 * 1024 * 1024 + 1)).toThrow(EpubTooLargeError);
  });
});
