import { Filelike } from "../file";

// browser reader for Blob|File objects
export class BlobReader implements Filelike {
  #blob: Blob;

  public constructor(blob: Blob) {
    this.#blob = blob;
  }

  public size(): number {
    return this.#blob.size;
  }

  async open(): Promise<number> {
    return this.size();
  }

  /**
   * Read `length` bytes starting from `offset` bytes.
   */
  public async read(offset: number, length: number): Promise<Uint8Array> {
    if (offset + length > this.size()) {
      throw new Error(
        `Read of ${length} bytes at offset ${offset} exceeds blob size ${this.size()}`,
      );
    }
    return new Uint8Array(await this.#blob.slice(offset, offset + length).arrayBuffer());
  }
}
