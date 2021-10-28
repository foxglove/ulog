const { ULog } = require("../dist");
const { FileReader } = require("../dist/node");
const path = require("path");

async function main() {
  const reader = new FileReader(path.join(__dirname, "..", "tests", "sample.ulg"));
  for (let i = 0; i < 10; i++) {
    const ulog = new ULog(reader);
    await ulog.open();
  }
  await reader.close();
}

void main();
