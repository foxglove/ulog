import { Filelike } from "../types";

// browser reader for Blob|File objects
export class BlobReader implements Filelike {
  private _blob: Blob;
  private _size: number;

  constructor(blob: Blob | File) {
    if (!(blob instanceof Blob)) {
      throw new Error("Expected file to be a File or Blob.");
    }

    this._blob = blob;
    this._size = blob.size;
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
          return reject("Unsupported format for BlobReader");
        }

        resolve(new Uint8Array(reader.result));
      };
      reader.onerror = function () {
        reader.onload = null;
        reader.onerror = null;
        reject(reader.error ?? new Error("Unknown FileReader error"));
      };
      const readLength = Math.min(length, this._size - offset);
      reader.readAsArrayBuffer(this._blob.slice(offset, offset + readLength));
    });
  }

  size(): number {
    return this._size;
  }
}
