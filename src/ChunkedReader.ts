import { Filelike } from "./types";

const CHUNK_SIZE = 16384;

export class ChunkedReader {
  readonly chunkSize: number;

  private _file: Filelike;
  private _chunk?: Uint8Array;
  private _view?: DataView;
  private _fileCursor = 0;
  private _chunkCursor = 0;
  private _textDecoder = new TextDecoder();

  constructor(filelike: Filelike, chunkSize = CHUNK_SIZE) {
    this._file = filelike;
    this.chunkSize = chunkSize;
  }

  offset(): number {
    return this._fileCursor - (this._chunk?.byteLength ?? 0) + this._chunkCursor;
  }

  remaining(): number {
    return this._file.size() - this._fileCursor;
  }

  seek(relativeByteOffset: number): void {
    this._fileCursor = this.offset() + relativeByteOffset;
    this._chunkCursor = 0;
    this._chunk = undefined;
    this._view = undefined;
  }

  seekTo(byteOffset: number): void {
    this._fileCursor = byteOffset;
    this._chunkCursor = 0;
    this._chunk = undefined;
    this._view = undefined;
  }

  async readBytes(count: number): Promise<Uint8Array> {
    const view = await this.view(count);
    const data = new Uint8Array(view.buffer, view.byteOffset + this._chunkCursor, count);
    this._chunkCursor += count;
    return data;
  }

  async readUint8(): Promise<number> {
    const view = await this.view(1);
    return view.getUint8(this._chunkCursor++);
  }

  async readInt16(): Promise<number> {
    const view = await this.view(2);
    const data = view.getInt16(this._chunkCursor, true);
    this._chunkCursor += 2;
    return data;
  }

  async readUint16(): Promise<number> {
    const view = await this.view(2);
    const data = view.getUint16(this._chunkCursor, true);
    this._chunkCursor += 2;
    return data;
  }

  async readInt32(): Promise<number> {
    const view = await this.view(4);
    const data = view.getInt32(this._chunkCursor, true);
    this._chunkCursor += 4;
    return data;
  }

  async readUint32(): Promise<number> {
    const view = await this.view(4);
    const data = view.getUint32(this._chunkCursor, true);
    this._chunkCursor += 4;
    return data;
  }

  async readFloat32(): Promise<number> {
    const view = await this.view(4);
    const data = view.getFloat32(this._chunkCursor, true);
    this._chunkCursor += 4;
    return data;
  }

  async readFloat64(): Promise<number> {
    const view = await this.view(8);
    const data = view.getFloat64(this._chunkCursor, true);
    this._chunkCursor += 8;
    return data;
  }

  async readInt64(): Promise<bigint> {
    const view = await this.view(8);
    const data = view.getBigInt64(this._chunkCursor, true);
    this._chunkCursor += 8;
    return data;
  }

  async readUint64(): Promise<bigint> {
    const view = await this.view(8);
    const data = view.getBigUint64(this._chunkCursor, true);
    this._chunkCursor += 8;
    return data;
  }

  async readString(length: number): Promise<string> {
    const view = await this.view(length);
    const data = this._textDecoder.decode(
      view.buffer.slice(
        view.byteOffset + this._chunkCursor,
        view.byteOffset + this._chunkCursor + length,
      ),
    );
    this._chunkCursor += length;
    return data;
  }

  private async view(bytesRequired: number): Promise<DataView> {
    if (!this._chunk || this._chunkCursor === this._chunk.byteLength) {
      this._chunk = await this._file.read(
        this._fileCursor,
        Math.max(bytesRequired, this.chunkSize),
      );
      this._view = new DataView(this._chunk.buffer, this._chunk.byteOffset, this._chunk.byteLength);
      this._chunkCursor = 0;
      this._fileCursor += this._chunk.byteLength;
    }

    let bytesAvailable = this._chunk.byteLength - this._chunkCursor;
    const bytesNeeded = bytesRequired - bytesAvailable;
    if (bytesAvailable < bytesRequired) {
      const curChunk = this._chunk;
      const nextChunk = await this._file.read(
        this._fileCursor,
        Math.max(bytesNeeded, this.chunkSize),
      );
      this._chunk = concat(curChunk.slice(this._chunkCursor), nextChunk);
      this._view = new DataView(this._chunk.buffer, this._chunk.byteOffset, this._chunk.byteLength);
      this._chunkCursor = 0;
      this._fileCursor += nextChunk.byteLength;

      bytesAvailable = this._chunk.byteLength - this._chunkCursor;

      if (bytesAvailable < bytesRequired) {
        throw new Error(
          `Requested ${bytesRequired} bytes but only ${bytesAvailable} bytes available`,
        );
      }
    }

    return this._view!;
  }
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const c = new Uint8Array(a.byteLength + b.byteLength);
  c.set(a);
  c.set(b, a.byteLength);
  return c;
}
