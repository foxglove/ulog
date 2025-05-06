import { findRange } from "./findRange";

describe("findRange", () => {
  it("works", async () => {
    let entries: [bigint, number, number][];

    expect(findRange([], 0n, 1n)).toBeUndefined();
    entries = [
      [1n, 0, 0],
      [2n, 0, 0],
      [3n, 0, 0],
      [4n, 0, 0],
      [5n, 0, 0],
    ];
    expect(findRange(entries, 2n, 4n)).toEqual([1, 3]);
    expect(findRange(entries, 5n, 6n)).toEqual([4, 4]);
    expect(findRange(entries, 6n, 7n)).toBeUndefined();
    entries = [[0n, 0, 0]];
    expect(findRange(entries, 0n, 0n)).toEqual([0, 0]);
    expect(findRange(entries, 0n, 1n)).toEqual([0, 0]);
    expect(findRange(entries, 0n, 2n)).toEqual([0, 0]);

    entries = [
      [0n, 0, 0],
      [0n, 0, 0],
      [3n, 0, 0],
      [4n, 0, 0],
      [4n, 0, 0],
      [5n, 0, 0],
    ];
    expect(findRange(entries, 0n, 0n)).toEqual([0, 1]);
    expect(findRange(entries, 0n, 1n)).toEqual([0, 1]);
    expect(findRange(entries, 0n, 3n)).toEqual([0, 2]);
    expect(findRange(entries, 3n, 3n)).toEqual([2, 2]);
    expect(findRange(entries, 3n, 50n)).toEqual([2, 5]);
    expect(findRange(entries, 5n, 50n)).toEqual([5, 5]);
    expect(findRange(entries, 6n, 50n)).toBeUndefined();
  });
});
