export interface Filelike {
  open(): Promise<number>;
  read(offset: number, length: number): Promise<Uint8Array>;
  size(): number;
}
