import { DataReader } from ".";
import { ChunkedReader } from "./ChunkedReader";

describe("ChunkedReader", () => {
  const sampleFixture = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]);

  // open
  it("should open a Filelike", async () => {
    const reader = new ChunkedReader(new DataReader(sampleFixture));
    expect(await reader.open()).toBe(sampleFixture.byteLength);
  });

  // view
  it("should return a view of the data", async () => {
    const reader = new ChunkedReader(new DataReader(sampleFixture), 3);
    expect(reader.view()).toBeUndefined();
    await reader.open();
    expect(reader.view()).toBeUndefined();
    await reader.peekUint8(0);
    expect(reader.view()?.buffer.byteLength).toBe(sampleFixture.byteLength);
    expect(reader.view()?.byteOffset).toBe(0);
    expect(reader.view()?.byteLength).toBe(sampleFixture.byteLength);
  });

  // position
  it("should return the current position", () => {
    for (let i = 1; i < sampleFixture.byteLength + 1; i++) {
      const reader = new ChunkedReader(new DataReader(sampleFixture), i);
      expect(reader.position()).toBe(0);

      reader.seek(3);
      expect(reader.position()).toBe(3);

      reader.seek(-2);
      expect(reader.position()).toBe(1);
      expect(() => {
        reader.seek(-2);
      }).toThrow();

      reader.seek(7);
      expect(reader.position()).toBe(8);
      expect(() => {
        reader.seek(1);
      }).toThrow();
    }
  });

  // size
  it("should return the size of the file", () => {
    for (let i = 1; i < sampleFixture.byteLength + 1; i++) {
      const reader = new ChunkedReader(new DataReader(sampleFixture), i);
      expect(reader.size()).toBe(sampleFixture.byteLength);
    }
  });

  // remaining
  it("should return the remaining bytes in the file", () => {
    for (let i = 1; i < sampleFixture.byteLength + 1; i++) {
      const reader = new ChunkedReader(new DataReader(sampleFixture), i);
      expect(reader.remaining()).toBe(sampleFixture.byteLength);
      reader.seek(3);
      expect(reader.remaining()).toBe(5);

      reader.seek(0);
      expect(reader.remaining()).toBe(5);

      reader.seek(5);
      expect(reader.remaining()).toBe(0);

      reader.seek(-2);
      expect(reader.remaining()).toBe(2);
    }
  });

  // seek
  it("should seek to the given position", () => {
    for (let i = 1; i < sampleFixture.byteLength + 1; i++) {
      const reader = new ChunkedReader(new DataReader(sampleFixture), i);
      reader.seek(3);
      expect(reader.position()).toBe(3);
      reader.seek(-2);
      expect(reader.position()).toBe(1);
      expect(() => {
        reader.seek(-2);
      }).toThrow();
      reader.seek(7);
      expect(reader.position()).toBe(8);
      expect(() => {
        reader.seek(1);
      }).toThrow();
    }
  });

  // seekTo
  it("should seekTo the given position", () => {
    for (let i = 1; i < sampleFixture.byteLength + 1; i++) {
      const reader = new ChunkedReader(new DataReader(sampleFixture), i);
      reader.seekTo(3);
      expect(reader.position()).toBe(3);
      expect(() => {
        reader.seekTo(-2);
      }).toThrow();
      reader.seekTo(6);
      expect(reader.position()).toBe(6);
      reader.seekTo(0);
      expect(reader.position()).toBe(0);
      reader.seekTo(8);
      expect(reader.position()).toBe(8);
      expect(() => {
        reader.seekTo(9);
      }).toThrow();
      expect(reader.remaining()).toBe(0);
    }
  });

  // skip
  it("should skip the given number of bytes", async () => {
    for (let i = 1; i < sampleFixture.byteLength + 1; i++) {
      const reader = new ChunkedReader(new DataReader(sampleFixture), i);
      await reader.skip(3);
      expect(reader.position()).toBe(3);
      expect(reader.remaining()).toBe(5);
      await reader.skip(5);
      expect(reader.position()).toBe(8);
      await expect(reader.skip(-2)).rejects.toThrow();
    }
  });

  // peekUint8
  it("should peek the next byte", async () => {
    for (let i = 1; i < sampleFixture.byteLength + 1; i++) {
      const reader = new ChunkedReader(new DataReader(sampleFixture), i);
      for (let j = 0; j < sampleFixture.byteLength; j++) {
        expect(await reader.peekUint8(j)).toBe(sampleFixture[j]);
      }
      await expect(reader.peekUint8(sampleFixture.byteLength)).rejects.toThrow();
    }
  });

  // readUint8
  it("should read the next byte", async () => {
    for (let i = 1; i < sampleFixture.byteLength + 1; i++) {
      const reader = new ChunkedReader(new DataReader(sampleFixture), i);
      for (let j = 0; j < sampleFixture.byteLength; j++) {
        expect(await reader.readUint8()).toBe(sampleFixture[j]);
      }
      await expect(reader.readUint8()).rejects.toThrow();
    }
  });

  // readUint16
  it("should read the next 2 bytes", async () => {
    for (let i = 1; i < sampleFixture.byteLength + 1; i++) {
      const reader = new ChunkedReader(new DataReader(sampleFixture), i);
      for (let j = 0; j < sampleFixture.byteLength - 1; j += 2) {
        expect(await reader.readUint16()).toBe((sampleFixture[j + 1]! << 8) | sampleFixture[j]!);
      }
      await expect(reader.readUint16()).rejects.toThrow();
    }
  });

  // readUint32
  it("should read the next 4 bytes", async () => {
    for (let i = 1; i < sampleFixture.byteLength + 1; i++) {
      const reader = new ChunkedReader(new DataReader(sampleFixture), i);
      for (let j = 0; j < sampleFixture.byteLength - 3; j += 4) {
        expect(await reader.readUint32()).toBe(
          (sampleFixture[j + 3]! << 24) |
            (sampleFixture[j + 2]! << 16) |
            (sampleFixture[j + 1]! << 8) |
            sampleFixture[j]!,
        );
      }
      await expect(reader.readUint32()).rejects.toThrow();
    }
  });

  // readUint64
  it("should read the next 8 bytes", async () => {
    const fixture = new ArrayBuffer(16);
    const view = new DataView(fixture);
    view.setBigUint64(0, 1n, true);
    view.setBigUint64(8, 1635730037824203178n, true);
    for (let i = 1; i < fixture.byteLength + 1; i++) {
      const reader = new ChunkedReader(new DataReader(fixture), i);
      expect(await reader.readUint64()).toBe(1n);
      expect(await reader.readUint64()).toBe(1635730037824203178n);
      await expect(reader.readUint64()).rejects.toThrow();
    }
  });

  // readFloat32
  it("should read the next 4 bytes as a float", async () => {
    const fixture = new ArrayBuffer(8);
    const view = new DataView(fixture);
    view.setFloat32(0, 1.0, true);
    view.setFloat32(4, Number.NaN, true);
    for (let i = 1; i < fixture.byteLength + 1; i++) {
      const reader = new ChunkedReader(new DataReader(fixture), i);
      expect(await reader.readFloat32()).toBe(1.0);
      expect(await reader.readFloat32()).toBe(Number.NaN);
      await expect(reader.readFloat32()).rejects.toThrow();
    }
  });

  // readFloat64
  it("should read the next 8 bytes as a double", async () => {
    const fixture = new ArrayBuffer(16);
    const view = new DataView(fixture);
    view.setFloat64(0, 1.0, true);
    view.setFloat64(8, Number.NaN, true);
    for (let i = 1; i < fixture.byteLength + 1; i++) {
      const reader = new ChunkedReader(new DataReader(fixture), i);
      expect(await reader.readFloat64()).toBe(1.0);
      expect(await reader.readFloat64()).toBe(Number.NaN);
      await expect(reader.readFloat64()).rejects.toThrow();
    }
  });

  // readString
  it("should read the next string", async () => {
    for (let i = 1; i < sampleFixture.byteLength + 1; i++) {
      const reader = new ChunkedReader(new DataReader(sampleFixture), i);
      for (let j = 0; j < sampleFixture.byteLength; j++) {
        expect(await reader.readString(1)).toBe(String.fromCharCode(sampleFixture[j]!));
      }
      await expect(reader.readString(1)).rejects.toThrow();
    }

    const fixture = new TextEncoder().encode("Hello World");
    expect(fixture.byteLength).toBe(11);
    for (let i = 1; i < fixture.byteLength + 1; i++) {
      const reader2 = new ChunkedReader(new DataReader(fixture), i);
      expect(await reader2.readString(fixture.byteLength)).toBe("Hello World");
      await expect(reader2.readString(1)).rejects.toThrow();
    }
  });
});
