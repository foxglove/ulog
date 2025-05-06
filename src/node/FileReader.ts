import * as fs from "fs/promises";

import { Filelike } from "../file";

/**
 * A FileReader implemented using the node.js filesystem API.
 */
export class FileReader implements Filelike {
  #filename: string;
  #file?: fs.FileHandle;
  #size = 0;

  constructor(filename: string) {
    this.#filename = filename;
  }

  async open(): Promise<number> {
    await this.#openHandle();
    return this.#size;
  }

  async #openHandle(): Promise<fs.FileHandle> {
    if (this.#file) {
      return this.#file;
    }
    this.#file = await fs.open(this.#filename, "r");
    const size = (await this.#file.stat({ bigint: true })).size;
    if (size > Number.MAX_SAFE_INTEGER) {
      throw new Error(`File size ${size} exceeds the maximum size`);
    }
    this.#size = Number(size);
    return this.#file;
  }

  async close(): Promise<void> {
    await this.#file?.close();
  }

  /**
   * Read up to `length` bytes starting from `offset` bytes.
   */
  async read(offset: number, length: number): Promise<Uint8Array> {
    const file = await this.#openHandle();
    const data = new Uint8Array(length);
    const res = await file.read(data, 0, length, offset);
    return data.byteLength === res.bytesRead ? data : data.slice(0, res.bytesRead);
  }

  size(): number {
    return this.#size;
  }
}
