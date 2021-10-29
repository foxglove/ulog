const { ULog } = require("../dist");
const { FileReader } = require("../dist/node");
const path = require("path");

async function main() {
  const reader = new FileReader(
    path.join(__dirname, "..", "tests", "log_6_2021-7-20-11-41-56.ulg"),
  );
  for (let i = 0; i < 1; i++) {
    const ulog = new ULog(reader);
    await ulog.open();
  }
  await reader.close();
}

void main();
