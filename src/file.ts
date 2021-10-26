export interface Filelike {
  read(offset: number, length: number): Promise<Uint8Array>;
  size(): number;
}
