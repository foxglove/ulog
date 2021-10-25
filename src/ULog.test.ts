import path from "path";

import { ULog, Message } from "./ULog";
import { FileReader } from "./node/FileReader";

describe("ULog", () => {
  const sampleFixture = path.join(__dirname, "..", "tests", "sample.ulg");

  it("open()", async () => {
    const reader = new FileReader(sampleFixture);
    const ulog = new ULog(reader);
    const header = await ulog.open();
    expect(header.version).toBe(0);
    expect(header.timestamp).toBe(112500176n);
    expect(header.flagBits).toBeUndefined();
    void reader.close();
  });

  it("readMessage()", async () => {
    const reader = new FileReader(sampleFixture);
    const ulog = new ULog(reader);
    await ulog.open();
    const messages: Message[] = [];
    let message: Message | undefined;
    while ((message = await ulog.readMessage())) {
      messages.push(message);
    }
    expect(messages.length).toBe(65092);
    void reader.close();
  });
});
