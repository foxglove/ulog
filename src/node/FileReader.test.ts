import fs from "fs";
import path from "path";

import { FileReader } from "./FileReader";

describe("node entrypoint", () => {
  describe("Reader", () => {
    const fixture = path.join(__dirname, "..", "..", "tests", "sample_info.txt");

    it("should read bytes from a file", async () => {
      const reader = new FileReader(fixture);
      const buff = await reader.read(5, 10);
      expect(reader.size()).toBe(fs.statSync(fixture).size);
      expect(buff).toEqual(Uint8Array.from([110, 103, 32, 115, 116, 97, 114, 116, 32, 116]));
      await reader.close();
    });
  });
});
