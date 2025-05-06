import { Filelike } from "./file";

const CHUNK_SIZE = 256 * 1024;

export class ChunkedReader {
  readonly chunkSize: number;

  #file: Filelike;
  #chunk?: Uint8Array;
  #view?: DataView;
  #fileCursor = 0;
  #chunkCursor = 0;
  #textDecoder = new TextDecoder();

  constructor(filelike: Filelike, chunkSize = CHUNK_SIZE) {
    this.#file = filelike;
    this.chunkSize = chunkSize;
  }

  async open(): Promise<number> {
    return await this.#file.open();
  }

  view(): DataView | undefined {
    return this.#view;
  }

  position(): number {
    return this.#fileCursor - (this.#chunk?.byteLength ?? 0) + this.#chunkCursor;
  }

  size(): number {
    return this.#file.size();
  }

  remaining(): number {
    return this.size() - (this.#fileCursor - (this.#chunk?.byteLength ?? 0) + this.#chunkCursor);
  }

  seek(relativeByteOffset: number): void {
    const byteOffset = this.position() + relativeByteOffset;
    if (byteOffset < 0 || byteOffset > this.size()) {
      throw new Error(`Cannot seek to ${byteOffset}`);
    }

    this.#fileCursor = byteOffset;
    this.#chunkCursor = 0;
    this.#chunk = undefined;
    this.#view = undefined;
  }

  seekTo(byteOffset: number): void {
    if (byteOffset < 0 || byteOffset > this.size()) {
      throw new Error(`Cannot seek to ${byteOffset}`);
    }

    this.#fileCursor = byteOffset;
    this.#chunkCursor = 0;
    this.#chunk = undefined;
    this.#view = undefined;
  }

  async skip(count: number): Promise<void> {
    const byteOffset = this.#chunkCursor + count;
    if (count < 0 || byteOffset < 0 || byteOffset > this.size()) {
      throw new Error(`Cannot skip ${count} bytes`);
    }

    await this.#fetch(count);
    this.#chunkCursor += count;
  }

  async peekUint8(offset: number): Promise<number> {
    const view = await this.#fetch(offset + 1);
    return view.getUint8(this.#chunkCursor + offset);
  }

  async readBytes(count: number): Promise<Uint8Array> {
    const view = await this.#fetch(count);
    const data = new Uint8Array(view.buffer, view.byteOffset + this.#chunkCursor, count);
    this.#chunkCursor += count;
    return data;
  }

  async readUint8(): Promise<number> {
    const view = await this.#fetch(1);
    return view.getUint8(this.#chunkCursor++);
  }

  async readInt16(): Promise<number> {
    const view = await this.#fetch(2);
    const data = view.getInt16(this.#chunkCursor, true);
    this.#chunkCursor += 2;
    return data;
  }

  async readUint16(): Promise<number> {
    const view = await this.#fetch(2);
    const data = view.getUint16(this.#chunkCursor, true);
    this.#chunkCursor += 2;
    return data;
  }

  async readInt32(): Promise<number> {
    const view = await this.#fetch(4);
    const data = view.getInt32(this.#chunkCursor, true);
    this.#chunkCursor += 4;
    return data;
  }

  async readUint32(): Promise<number> {
    const view = await this.#fetch(4);
    const data = view.getUint32(this.#chunkCursor, true);
    this.#chunkCursor += 4;
    return data;
  }

  async readFloat32(): Promise<number> {
    const view = await this.#fetch(4);
    const data = view.getFloat32(this.#chunkCursor, true);
    this.#chunkCursor += 4;
    return data;
  }

  async readFloat64(): Promise<number> {
    const view = await this.#fetch(8);
    const data = view.getFloat64(this.#chunkCursor, true);
    this.#chunkCursor += 8;
    return data;
  }

  async readInt64(): Promise<bigint> {
    const view = await this.#fetch(8);
    const data = view.getBigInt64(this.#chunkCursor, true);
    this.#chunkCursor += 8;
    return data;
  }

  async readUint64(): Promise<bigint> {
    const view = await this.#fetch(8);
    const data = view.getBigUint64(this.#chunkCursor, true);
    this.#chunkCursor += 8;
    return data;
  }

  async readString(length: number): Promise<string> {
    const view = await this.#fetch(length);
    const data = this.#textDecoder.decode(
      view.buffer.slice(
        view.byteOffset + this.#chunkCursor,
        view.byteOffset + this.#chunkCursor + length,
      ),
    );
    this.#chunkCursor += length;
    return data;
  }

  async #fetch(bytesRequired: number): Promise<DataView> {
    if (bytesRequired > this.remaining()) {
      throw new Error(
        `Cannot read ${bytesRequired} bytes from ${this.size()} byte source, ${this.remaining()} bytes remaining`,
      );
    }

    if (!this.#chunk || this.#chunkCursor === this.#chunk.byteLength) {
      const fileRemaining = this.size() - this.#fileCursor;
      this.#chunk = await this.#file.read(
        this.#fileCursor,
        clamp(this.chunkSize, bytesRequired, fileRemaining),
      );
      this.#view = new DataView(this.#chunk.buffer, this.#chunk.byteOffset, this.#chunk.byteLength);
      this.#chunkCursor = 0;
      this.#fileCursor += this.#chunk.byteLength;
    }

    let bytesAvailable = this.#chunk.byteLength - this.#chunkCursor;
    const bytesNeeded = bytesRequired - bytesAvailable;
    if (bytesAvailable < bytesRequired) {
      const fileRemaining = this.size() - this.#fileCursor;
      const curChunk = this.#chunk;
      const nextChunk = await this.#file.read(
        this.#fileCursor,
        clamp(this.chunkSize, bytesNeeded, fileRemaining),
      );
      this.#chunk = concat(curChunk.slice(this.#chunkCursor), nextChunk);
      this.#view = new DataView(this.#chunk.buffer, this.#chunk.byteOffset, this.#chunk.byteLength);
      this.#chunkCursor = 0;
      this.#fileCursor += nextChunk.byteLength;

      bytesAvailable = this.#chunk.byteLength - this.#chunkCursor;

      if (bytesAvailable < bytesRequired) {
        throw new Error(`Requested ${bytesRequired} bytes but ${bytesAvailable} bytes available`);
      }
    }

    return this.#view!;
  }
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const c = new Uint8Array(a.byteLength + b.byteLength);
  c.set(a);
  c.set(b, a.byteLength);
  return c;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
