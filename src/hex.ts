const LUT_HEX_4b = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "a", "b", "c", "d", "e", "f"];
const LUT_HEX_8b: string[] = new Array<string>(0x100);
for (let n = 0; n < 0x100; n++) {
  LUT_HEX_8b[n] = `${LUT_HEX_4b[(n >>> 4) & 0xf]!}${LUT_HEX_4b[n & 0xf]!}`;
}

export function fromHex(hex: string): Uint8Array {
  const match = hex.match(/.{1,2}/g) ?? [];
  return new Uint8Array(match.map((byte) => parseInt(byte, 16)));
}

export function toHex(data: Uint8Array): string {
  let out = "";
  for (let idx = 0, edx = data.length; idx < edx; idx++) {
    out += LUT_HEX_8b[data[idx]!]!;
  }
  return out;
}
