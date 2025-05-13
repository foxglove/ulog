// Copyright 2018-2020 Cruise LLC
// Copyright 2021 Foxglove Technologies Inc
//
// This source code is licensed under the Apache License, Version 2.0,
// found in the LICENSE file in the root directory of this source tree.
// You may not use this file except in compliance with the License.

import { TextEncoder, TextDecoder } from "util";

import { BlobReader } from "./BlobReader";

// github.com/jsdom/jsdom/issues/2524
global.TextEncoder = TextEncoder;
// @ts-expect-error ignore type mismatch with util TextDecode and global one
global.TextDecoder = TextDecoder;

describe("browser reader", () => {
  it("works in node", async () => {
    const buffer = new Blob([Uint8Array.from([0x00, 0x01, 0x02, 0x03, 0x04])]);
    const reader = new BlobReader(buffer);
    const res = await reader.read(0, 2);
    expect(res).toHaveLength(2);
    expect(res instanceof Uint8Array).toBe(true);
    const buff = res;
    expect(buff[0]).toBe(0x00);
    expect(buff[1]).toBe(0x01);
  });

  it("allows multiple read operations at once", async () => {
    const buffer = new Blob([Uint8Array.from([0x00, 0x01, 0x02, 0x03, 0x04])]);
    const reader = new BlobReader(buffer);
    await expect(Promise.all([reader.read(0, 2), reader.read(0, 2)])).resolves.toEqual([
      Uint8Array.from([0, 1]),
      Uint8Array.from([0, 1]),
    ]);
  });
});
