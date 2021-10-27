import * as fs from "fs/promises";

import { Filelike } from "../file";

/**
 * A FileReader implemented using the node.js filesystem API.
 */
export class FileReader implements Filelike {
  private _filename: string;
  private _file?: fs.FileHandle;
  private _size = 0;

  constructor(filename: string) {
    this._filename = filename;
  }

  private async open(): Promise<fs.FileHandle> {
    if (this._file) {
      return this._file;
    }
    this._file = await fs.open(this._filename, "r");
    const size = (await this._file.stat({ bigint: true })).size;
    if (size > Number.MAX_SAFE_INTEGER) {
      throw new Error(`File size ${size} exceeds the maximum size`);
    }
    this._size = Number(size);
    return this._file;
  }

  async close(): Promise<void> {
    await this._file?.close();
  }

  /**
   * Read up to `length` bytes starting from `offset` bytes.
   */
  async read(offset: number, length: number): Promise<Uint8Array> {
    const file = await this.open();
    const readLength = Math.min(length, this._size - offset);
    const data = new Uint8Array(readLength);
    const res = await file.read(data, 0, readLength, offset);
    return data.byteLength === res.bytesRead ? data : data.slice(0, res.bytesRead);
  }

  size(): number {
    return this._size;
  }
}
