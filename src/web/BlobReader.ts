import { Filelike } from "../file";

// browser reader for Blob|File objects
export class BlobReader implements Filelike {
  public constructor(private file: Blob) {}

  public size(): number {
    return this.file.size;
  }

  async open(): Promise<number> {
    return this.size();
  }

  /**
   * Read `length` bytes starting from `offset` bytes.
   */
  public async read(offset: number, length: number): Promise<Uint8Array> {
    if (offset + length > this.file.size) {
      throw new Error(
        `Read of ${length} bytes at offset ${offset} exceeds file size ${this.file.size}`,
      );
    }
    return new Uint8Array(
      await this.file.slice(Number(offset), Number(offset + length)).arrayBuffer(),
    );
  }
}
