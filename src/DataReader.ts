import { Filelike } from "./file";

export class DataReader implements Filelike {
  #data: ArrayBuffer;

  constructor(data: ArrayBuffer) {
    this.#data = data;
  }

  async open(): Promise<number> {
    return this.#data.byteLength;
  }

  async close(): Promise<void> {
    // no-op
  }

  async read(offset: number, length: number): Promise<Uint8Array> {
    return new Uint8Array(this.#data, offset, length);
  }

  size(): number {
    return this.#data.byteLength;
  }
}
