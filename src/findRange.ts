export function findRange(
  entries: [timestamp: bigint, _: number][],
  minValue: bigint,
  maxValue: bigint,
): [number, number] | undefined {
  let low = 0;
  let high = entries.length - 1;

  // get the start index
  let startIndex = -1;
  while (low <= high) {
    const mid = Math.floor((high - low) / 2) + low;
    const curValue = entries[mid]![0];
    if (curValue >= minValue) {
      startIndex = mid;
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }

  // get the end index
  let endIndex = -1;
  low = 0;
  high = entries.length - 1;
  while (low <= high) {
    const mid = Math.floor((high - low) / 2) + low;
    if (entries[mid]![0] <= maxValue) {
      endIndex = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  if (startIndex !== -1 && endIndex !== -1) {
    return [startIndex, endIndex];
  }
  return undefined;
}
