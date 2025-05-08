/**
 * Filelike interface defines an api for random access to some underlying data.
 *
 * This abstracts the underlying data source from the rest of the library. For example, it could be
 * a file or an in-memory buffer.
 */
export interface Filelike {
  open(): Promise<number>;
  read(offset: number, length: number): Promise<Uint8Array>;
  size(): number;
}
