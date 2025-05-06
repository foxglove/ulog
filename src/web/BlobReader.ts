import { Filelike } from "../file";

// browser reader for Blob|File objects
export class BlobReader implements Filelike {
  #blob: Blob;
  #size: number;

  constructor(blob: Blob | File) {
    if (!(blob instanceof Blob)) {
      throw new Error("Expected file to be a File or Blob.");
    }

    this.#blob = blob;
    this.#size = blob.size;
  }

  async open(): Promise<number> {
    return this.#size;
  }

  /**
   * Read `length` bytes starting from `offset` bytes.
   */
  async read(offset: number, length: number): Promise<Uint8Array> {
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = function () {
        reader.onload = null;
        reader.onerror = null;

        if (reader.result == undefined || !(reader.result instanceof ArrayBuffer)) {
          reject(new Error("Unsupported format for BlobReader"));
          return;
        }

        resolve(new Uint8Array(reader.result));
      };
      reader.onerror = function () {
        reader.onload = null;
        reader.onerror = null;
        reject(reader.error ?? new Error("Unknown FileReader error"));
      };
      reader.readAsArrayBuffer(this.#blob.slice(offset, offset + length));
    });
  }

  size(): number {
    return this.#size;
  }
}
