const path = require("path");

const { ULog } = require("../dist");
const { FileReader } = require("../dist/node");

const performance = require("perf_hooks").performance;

function formatBytes(totalBytes) {
  const units = ["B", "kiB", "MiB", "GiB", "TiB"];
  let bytes = totalBytes;
  let unit = 0;
  while (unit + 1 < units.length && bytes >= 1024) {
    bytes /= 1024;
    unit++;
  }
  return `${bytes.toFixed(2)}${units[unit]}`;
}

async function main() {
  const reader = new FileReader(
    path.join(__dirname, "..", "tests", "log_6_2021-7-20-11-41-56.ulg"),
  );
  for (let i = 0; i < 3; i++) {
    const startTime = performance.now();
    const ulog = new ULog(reader, { chunkSize: 1024 * 1024 });
    await ulog.open();

    const readBytes = reader.size();
    const durationMs = performance.now() - startTime;
    console.log(
      `Read ${formatBytes(Number(readBytes))} in ${durationMs.toFixed(2)}ms (${formatBytes(
        Number(readBytes) / (durationMs / 1000),
      )}/sec)`,
    );
  }
  await reader.close();
}

void main();
