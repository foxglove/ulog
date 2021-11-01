import { Filelike } from "./file";

export class DataReader implements Filelike {
  private _data: ArrayBuffer;

  constructor(data: ArrayBuffer) {
    this._data = data;
  }

  async open(): Promise<number> {
    return this._data.byteLength;
  }

  async close(): Promise<void> {
    // no-op
  }

  async read(offset: number, length: number): Promise<Uint8Array> {
    return new Uint8Array(this._data, offset, length);
  }

  size(): number {
    return this._data.byteLength;
  }
}
