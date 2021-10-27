import path from "path";

import { ULog } from "./ULog";
import { MessageDefinition } from "./definition";
import { MessageType } from "./enums";
import { Message, MessageAddLogged, MessageData } from "./messages";
import { FileReader } from "./node/FileReader";
import { MessageDataParsed, messageSize } from "./parse";

describe("ULog", () => {
  const sampleFixture = path.join(__dirname, "..", "tests", "sample.ulg");

  it("open()", async () => {
    const reader = new FileReader(sampleFixture);
    const ulog = new ULog(reader);
    const header = await ulog.open();

    expect(header.version).toBe(0);
    expect(header.timestamp).toBe(112500176n);
    expect(header.flagBits).toBeUndefined();

    expect(header.information.size).toBe(4);
    expect(header.information.get("ver_sw")).toBe("fd483321a5cf50ead91164356d15aa474643aa73");
    expect(header.information.get("ver_hw")).toBe("AUAV_X21");
    expect(header.information.get("sys_name")).toBe("PX4");
    expect(header.information.get("time_ref_utc")).toBe(0);

    expect(header.parameters.size).toEqual(493);
    expect(header.parameters.get("RC12_TRIM")).toEqual({ defaultTypes: 0, value: 1500 });
    expect(header.parameters.get("SENS_BARO_QNH")).toEqual({ defaultTypes: 0, value: 1013.25 });

    expect(header.definitions.size).toEqual(103);
    const esc_status = header.definitions.get("esc_status")!;
    expect(esc_status).toBeDefined();
    expect(esc_status.name).toBe("esc_status");
    expect(esc_status.fields).toHaveLength(6);
    const timestamp = esc_status.fields[0]!;
    expect(timestamp.name).toBe("timestamp");
    expect(timestamp.isComplex).toBe(false);
    expect(timestamp.type).toBe("uint64_t");
    const counter = esc_status.fields[1]!;
    expect(counter.name).toBe("counter");
    expect(counter.isComplex).toBe(false);
    expect(counter.type).toBe("uint16_t");
    const esc_count = esc_status.fields[2]!;
    expect(esc_count.name).toBe("esc_count");
    expect(esc_count.isComplex).toBe(false);
    expect(esc_count.type).toBe("uint8_t");
    const esc_connectiontype = esc_status.fields[3]!;
    expect(esc_connectiontype.name).toBe("esc_connectiontype");
    expect(esc_connectiontype.isComplex).toBe(false);
    expect(esc_connectiontype.type).toBe("uint8_t");
    const padding0 = esc_status.fields[4]!;
    expect(padding0.name).toBe("_padding0");
    expect(padding0.isComplex).toBe(false);
    expect(padding0.type).toBe("uint8_t");
    expect(padding0.arrayLength).toBe(4);
    const esc = esc_status.fields[5]!;
    expect(esc.name).toBe("esc");
    expect(esc.isComplex).toBe(true);
    expect(esc.type).toBe("esc_report");
    expect(esc.arrayLength).toBe(8);

    void reader.close();
  });

  it("readRawMessage()", async () => {
    const reader = new FileReader(sampleFixture);
    const ulog = new ULog(reader);
    await ulog.open();
    const messages: Message[] = [];
    let message: Message | undefined;
    while ((message = await ulog.readRawMessage())) {
      messages.push(message);
    }
    expect(messages.length).toBe(64599);

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
    expect(messages.length).toBe(64599);

    void reader.close();
  });

  it("createIndex()", async () => {
    const reader = new FileReader(sampleFixture);
    const ulog = new ULog(reader);
    await ulog.open();

    expect(ulog.messageCount()).toBeUndefined();
    expect(ulog.timeRange()).toBeUndefined();
    await ulog.createIndex();
    expect(ulog.messageCount()).toBe(64599);
    expect(Number(ulog.timeRange()![0])).toEqual(0);
    expect(Number(ulog.timeRange()![1])).toEqual(181493506);

    expect(ulog.seekToTime(0n)).toBe(53);
    ulog.seekToMessage(0);
    ulog.seekToMessage(ulog.messageCount()! - 1);
    expect((await ulog.readMessage())!.type).toBe(MessageType.Data);
    expect(await ulog.readMessage()).toBeUndefined();
    expect(ulog.seekToTime(0n)).toBe(53);

    void reader.close();
  });

  it("MessageAddLogged", async () => {
    const reader = new FileReader(sampleFixture);
    const ulog = new ULog(reader);
    await ulog.open();

    const subscribe = (await ulog.readRawMessage()) as MessageAddLogged;
    expect(subscribe.type).toBe(MessageType.AddLogged);
    expect(subscribe.size).toBe(19);
    expect(subscribe.multiId).toBe(0);
    expect(subscribe.msgId).toBe(0);
    expect(subscribe.messageName).toBe("vehicle_attitude");

    void reader.close();
  });

  it("MessageData", async () => {
    const reader = new FileReader(sampleFixture);
    const ulog = new ULog(reader);
    await ulog.open();

    for (let i = 0; i < 43; i++) {
      await ulog.readRawMessage();
    }

    const data = (await ulog.readRawMessage()) as MessageData;
    expect(data.type).toBe(MessageType.Data);
    expect(data.size).toBe(38);
    expect(data.msgId).toBe(0);
    expect(data.data.byteLength).toBe(36);
    expect(data.data[0]).toBe(0x63);
    expect(data.data[35]).toBe(0xbe);

    void reader.close();
  });

  it("MessageDataParsed", async () => {
    const reader = new FileReader(sampleFixture);
    const ulog = new ULog(reader);
    await ulog.open();

    for (let i = 0; i < 43; i++) {
      await ulog.readRawMessage();
    }

    expect(ulog.subscriptions.get(0)?.name).toBe("vehicle_attitude");
    const definition = ulog.header?.definitions.get("vehicle_attitude") as MessageDefinition;
    expect(definition).toBeDefined();
    expect(messageSize(definition, ulog.header!.definitions)).toBe(40);

    const data = (await ulog.readMessage()) as MessageDataParsed;
    expect(data.type).toBe(MessageType.Data);
    expect(data.size).toBe(38);
    expect(data.msgId).toBe(0);
    expect(data.data.byteLength).toBe(36);
    expect(data.data[0]).toBe(0x63);
    expect(data.data[35]).toBe(0xbe);
    expect(data.value).toEqual({
      timestamp: 112574307n,
      rollspeed: -0.0004259266424924135,
      pitchspeed: 0.000473720021545887,
      yawspeed: 0.0008371851872652769,
      q: [0.9545906186103821, 0.041478633880615234, 0.048174899071455, -0.2910595238208771],
    });

    void reader.close();
  });
});
