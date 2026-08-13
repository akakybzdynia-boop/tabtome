import { endianness } from "node:os";
import type { Readable, Writable } from "node:stream";

export const MAX_NATIVE_INPUT_BYTES = 32 * 1024 * 1024;
export const MAX_NATIVE_OUTPUT_BYTES = 1024 * 1024;

export class NativeProtocolError extends Error {
  readonly code = "NATIVE_PROTOCOL_ERROR";
  constructor(message: string) {
    super(message);
    this.name = "NativeProtocolError";
  }
}

function readLength(header: Buffer) {
  return endianness() === "LE" ? header.readUInt32LE(0) : header.readUInt32BE(0);
}

function writeLength(header: Buffer, length: number) {
  if (endianness() === "LE") header.writeUInt32LE(length, 0);
  else header.writeUInt32BE(length, 0);
}

export function encodeNativeMessage(value: unknown, maxBytes = MAX_NATIVE_OUTPUT_BYTES) {
  const body = Buffer.from(JSON.stringify(value), "utf8");
  if (body.length > maxBytes) throw new NativeProtocolError(`Native response exceeds ${maxBytes} bytes.`);
  const header = Buffer.allocUnsafe(4);
  writeLength(header, body.length);
  return Buffer.concat([header, body]);
}

export async function writeNativeMessage(output: Writable, value: unknown) {
  const frame = encodeNativeMessage(value);
  await new Promise<void>((resolve, reject) => {
    output.write(frame, error => error ? reject(error) : resolve());
  });
}

export async function* readNativeMessages(input: Readable, maxBytes = MAX_NATIVE_INPUT_BYTES): AsyncGenerator<unknown> {
  let buffered = Buffer.alloc(0);
  let expected: number | undefined;
  for await (const chunk of input) {
    buffered = Buffer.concat([buffered, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)]);
    while (true) {
      if (expected == null) {
        if (buffered.length < 4) break;
        expected = readLength(buffered.subarray(0, 4));
        buffered = buffered.subarray(4);
        if (expected > maxBytes) throw new NativeProtocolError(`Native request exceeds ${maxBytes} bytes.`);
      }
      if (buffered.length < expected) break;
      const body = buffered.subarray(0, expected);
      buffered = buffered.subarray(expected);
      expected = undefined;
      try { yield JSON.parse(body.toString("utf8")); }
      catch { throw new NativeProtocolError("Native request is not valid UTF-8 JSON."); }
    }
  }
  if (expected != null || buffered.length) throw new NativeProtocolError("Native request ended before the complete frame was received.");
}
