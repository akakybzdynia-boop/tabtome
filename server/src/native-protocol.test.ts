import { PassThrough, Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import {
  encodeNativeMessage,
  MAX_NATIVE_INPUT_BYTES,
  NativeProtocolError,
  readNativeMessages,
  writeNativeMessage
} from "./native-protocol.js";

async function collect(input: Readable, maxBytes?: number) {
  const messages: unknown[] = [];
  for await (const message of readNativeMessages(input, maxBytes)) messages.push(message);
  return messages;
}

describe("Firefox native messaging framing", () => {
  it("reads fragmented and consecutive frames", async () => {
    const first = encodeNativeMessage({ hello: "world" });
    const second = encodeNativeMessage({ value: 2 });
    const bytes = Buffer.concat([first, second]);
    const input = Readable.from([bytes.subarray(0, 2), bytes.subarray(2, 9), bytes.subarray(9)]);
    expect(await collect(input)).toEqual([{ hello: "world" }, { value: 2 }]);
  });

  it("writes exactly one framed JSON response", async () => {
    const output = new PassThrough();
    const chunks: Buffer[] = [];
    output.on("data", chunk => chunks.push(Buffer.from(chunk)));
    await writeNativeMessage(output, { ok: true });
    output.end();
    expect(await collect(Readable.from(chunks))).toEqual([{ ok: true }]);
  });

  it("rejects an incomplete frame", async () => {
    const frame = encodeNativeMessage({ ok: true });
    await expect(collect(Readable.from([frame.subarray(0, -1)]))).rejects.toBeInstanceOf(NativeProtocolError);
  });

  it("enforces the host input cap before allocating a body", async () => {
    const header = Buffer.alloc(4);
    header.writeUInt32LE(MAX_NATIVE_INPUT_BYTES + 1, 0);
    await expect(collect(Readable.from([header]))).rejects.toBeInstanceOf(NativeProtocolError);
  });

  it("accepts a synthetic 30 MB extension message", async () => {
    const payload = { data: "x".repeat(30 * 1024 * 1024) };
    const frame = encodeNativeMessage(payload, MAX_NATIVE_INPUT_BYTES);
    const [decoded] = await collect(Readable.from([frame]), MAX_NATIVE_INPUT_BYTES);
    expect((decoded as { data: string }).data.length).toBe(payload.data.length);
  });
});
