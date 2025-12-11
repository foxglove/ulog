import { McapIndexedReader, TempBuffer, McapWriter } from "@mcap/core";

import { ULog, Subscription } from "./ULog";
import { ulogDefinitionToJSONSchema, convertULogFileToMCAP } from "./convert";
import { MessageDefinition, Field } from "./definition";
import { MessageType } from "./enums";
import { ParsedMessage } from "./messages";
import { FileReader } from "./node/FileReader";

function createULogMock({
  messageFields,
  subscriptions,
  timestamp = 0n,
  messages = [],
}: {
  messageFields: Map<string, Field[]>;
  subscriptions: string[];
  timestamp?: bigint;
  messages?: { topic: string; message: ParsedMessage }[];
}): jest.Mocked<ULog> {
  const msgIds = new Map<string, number>();
  const definitions = new Map<string, MessageDefinition>();
  messageFields.forEach((fields, name) => {
    definitions.set(name, {
      name,
      fields,
      format: "not read",
    } as MessageDefinition);
  });
  const subscriptionMap = new Map<number, Subscription>();
  subscriptions.forEach((name, index) => {
    msgIds.set(name, index + 1);
    subscriptionMap.set(index + 1, {
      multiId: index + 1,
      ...definitions.get(name)!,
    });
  });
  const ulogMock: jest.Mocked<ULog> = {
    open: jest.fn().mockResolvedValue(undefined),
    header: {
      timestamp,
      definitions,
    },
    subscriptions: subscriptionMap,
    readMessages: jest.fn().mockImplementation(async function* () {
      for (const msg of messages) {
        yield {
          type: MessageType.Data,
          msgId: msgIds.get(msg.topic)!,
          value: msg.message,
        };
      }
    }),
  } as unknown as jest.Mocked<ULog>;
  return ulogMock;
}

describe("Create MCAP files from ULog", () => {
  describe("Schema Conversion", () => {
    it("should throw an error for missing ULog definitions", () => {
      const definitions = new Map<string, MessageDefinition>();
      expect(() => {
        ulogDefinitionToJSONSchema("NonExistentSchema", definitions);
      }).toThrow("Missing ULog definition for message type: NonExistentSchema");
    });

    it("should convert primitive field types", () => {
      const definition = {
        name: "TestSchema",
        fields: [
          { name: "uint_1", type: "uint8_t", isComplex: false },
          { name: "uint_2", type: "uint16_t", isComplex: false },
          { name: "uint_3", type: "uint32_t", isComplex: false },
          { name: "uint_4", type: "uint64_t", isComplex: false },
          { name: "int_1", type: "int8_t", isComplex: false },
          { name: "int_2", type: "int16_t", isComplex: false },
          { name: "int_3", type: "int32_t", isComplex: false },
          { name: "int_4", type: "int64_t", isComplex: false },
          { name: "float_1", type: "float", isComplex: false },
          { name: "float_2", type: "double", isComplex: false },
          { name: "bool", type: "bool", isComplex: false },
          { name: "string", type: "char", isComplex: false },
          { name: "string", type: "char", arrayLength: 4, isComplex: false },
          { name: "string", type: "char", arrayLength: 20, isComplex: false },
        ],
        format: "not read",
      };
      const definitions = new Map<string, MessageDefinition>();
      definitions.set("TestSchema", definition);
      const schemaName = "TestSchema";
      const schema = ulogDefinitionToJSONSchema(schemaName, definitions);
      expect(schema).toEqual({
        title: "TestSchema",
        type: "object",
        properties: {
          uint_1: { type: "integer" },
          uint_2: { type: "integer" },
          uint_3: { type: "integer" },
          uint_4: { type: "integer" },
          int_1: { type: "integer" },
          int_2: { type: "integer" },
          int_3: { type: "integer" },
          int_4: { type: "integer" },
          float_1: { type: "number" },
          float_2: { type: "number" },
          bool: { type: "boolean" },
          string: { type: "string" },
        },
      });
    });

    it("should convert array field types correctly", () => {
      const definition = {
        name: "ArraySchema",
        fields: [
          { name: "array_int", type: "uint8_t", arrayLength: 4, isComplex: false },
          { name: "array_int16", type: "int16_t", arrayLength: 2, isComplex: false },
          { name: "array_float", type: "float", arrayLength: 3, isComplex: false },
          { name: "string_type", type: "char", arrayLength: 5, isComplex: false }, // Should be treated as string, not array
        ],
        format: "not read",
      };
      const definitions = new Map<string, MessageDefinition>();
      definitions.set("ArraySchema", definition);
      const schemaName = "ArraySchema";
      const schema = ulogDefinitionToJSONSchema(schemaName, definitions);
      expect(schema).toEqual({
        title: "ArraySchema",
        type: "object",
        properties: {
          array_int: {
            type: "array",
            items: { type: "integer" },
            minItems: 4,
            maxItems: 4,
          },
          array_int16: {
            type: "array",
            items: { type: "integer" },
            minItems: 2,
            maxItems: 2,
          },
          array_float: {
            type: "array",
            items: { type: "number" },
            minItems: 3,
            maxItems: 3,
          },
          string_type: { type: "string" },
        },
      });
    });

    it("should convert nested struct field types correctly", () => {
      const nestedDefinition = {
        name: "NestedStruct",
        fields: [
          { name: "nested_int", type: "int32_t", isComplex: false },
          { name: "nested_float", type: "float", isComplex: false },
        ],
        format: "not read",
      };
      const mainDefinition = {
        name: "MainStruct",
        fields: [
          { name: "main_int", type: "uint16_t", isComplex: false },
          { name: "nested", type: "NestedStruct", isComplex: true },
        ],
        format: "not read",
      };
      const definitions = new Map<string, MessageDefinition>();
      definitions.set("NestedStruct", nestedDefinition);
      definitions.set("MainStruct", mainDefinition);
      const schemaName = "MainStruct";
      const schema = ulogDefinitionToJSONSchema(schemaName, definitions);
      expect(schema).toEqual({
        title: "MainStruct",
        type: "object",
        properties: {
          main_int: { type: "integer" },
          nested: {
            title: "NestedStruct",
            type: "object",
            properties: {
              nested_int: { type: "integer" },
              nested_float: { type: "number" },
            },
          },
        },
      });
    });
  });

  describe("Mocked MCAP File Writes", () => {
    const topicFixture = new Map([
      [
        "sensor_data",
        [
          { name: "timestamp", type: "uint64_t", isComplex: false },
          { name: "value", type: "float", isComplex: false },
        ],
      ],
      [
        "item_definition",
        [
          { name: "enabled", type: "bool", isComplex: false },
          { name: "matrix", type: "float", arrayLength: 4, isComplex: false },
        ],
      ],
      ["item_list", [{ name: "items", type: "item_definition", arrayLength: 2, isComplex: true }]],
    ]);

    const messageFixture = [
      {
        topic: "sensor_data",
        message: {
          timestamp: 1000n,
          value: 42.0,
        } as ParsedMessage,
      },
      {
        topic: "item_list",
        message: {
          timestamp: 2000n,
          items: [
            { enabled: true, matrix: [1.0, 0.0, 0.0, 0.0] },
            { enabled: false, matrix: [0.0, 1.0, 0.0, 0.0] },
          ],
        } as ParsedMessage,
      },
      {
        topic: "sensor_data",
        message: {
          timestamp: 3000n,
          value: 84.0,
        } as ParsedMessage,
      },
    ];

    it("should throw an error for missing ULog definitions", async () => {
      const ulogWithoutHeader = {
        open: jest.fn().mockResolvedValue(undefined),
        header: undefined,
        subscriptions: new Map<number, Subscription>(),
        readMessages: jest.fn(),
      } as unknown as jest.Mocked<ULog>;
      const mcapWriter = new McapWriter({
        writable: new TempBuffer(),
      });
      await expect(convertULogFileToMCAP(ulogWithoutHeader, mcapWriter, 0n)).rejects.toThrow(
        "Invalid ULog file: missing header",
      );
    });

    it("should add channels for all subscriptions", async () => {
      const mockULog = createULogMock({
        messageFields: topicFixture,
        subscriptions: ["sensor_data", "item_list"],
      });

      const mockOutputFile = new TempBuffer();
      const mcapWriter = new McapWriter({
        writable: mockOutputFile,
      });
      await convertULogFileToMCAP(mockULog, mcapWriter, 0n);

      const mcapReader = await McapIndexedReader.Initialize({
        readable: mockOutputFile,
      });
      const channelNames = Array.from(mcapReader.channelsById.values())
        .map((ch) => ch.topic)
        .sort();
      expect(channelNames).toEqual(["item_list", "sensor_data"]);
    });

    it("should add messages to MCAP with same content", async () => {
      const mockULog = createULogMock({
        messageFields: topicFixture,
        subscriptions: ["sensor_data", "item_list"],
        messages: messageFixture,
      });

      const mockOutputFile = new TempBuffer();
      const mcapWriter = new McapWriter({
        writable: mockOutputFile,
      });
      await convertULogFileToMCAP(mockULog, mcapWriter, 0n);

      const mcapReader = await McapIndexedReader.Initialize({
        readable: mockOutputFile,
      });
      const textDecoder = new TextDecoder();
      const logTimes = [];
      const messageData = [];
      const topics = [];
      for await (const msg of mcapReader.readMessages()) {
        logTimes.push(msg.publishTime);
        topics.push(mcapReader.channelsById.get(msg.channelId)?.topic);
        messageData.push(JSON.parse(textDecoder.decode(msg.data)));
      }
      expect(messageData.length).toBe(messageFixture.length);
      expect(logTimes).toEqual([1000000n, 2000000n, 3000000n]);
      expect(topics).toEqual(["sensor_data", "item_list", "sensor_data"]);
      expect(messageData).toEqual([
        { value: 42.0 },
        {
          items: [
            { enabled: true, matrix: [1.0, 0.0, 0.0, 0.0] },
            { enabled: false, matrix: [0.0, 1.0, 0.0, 0.0] },
          ],
        },
        { value: 84.0 },
      ]);
    });

    it("should add messages with correct timestamps", async () => {
      const mockULog = createULogMock({
        messageFields: topicFixture,
        subscriptions: ["sensor_data", "item_list"],
        messages: messageFixture,
      });

      const mockOutputFile = new TempBuffer();
      const mcapWriter = new McapWriter({
        writable: mockOutputFile,
      });
      await convertULogFileToMCAP(mockULog, mcapWriter, 1000n);

      const mcapReader = await McapIndexedReader.Initialize({
        readable: mockOutputFile,
      });
      const logTimes = [];
      for await (const msg of mcapReader.readMessages()) {
        logTimes.push(msg.publishTime);
      }
      expect(logTimes.length).toBe(messageFixture.length);
      expect(logTimes).toEqual([2000000n, 3000000n, 4000000n]);
    });

    it("should handle bigint conversions to integer", async () => {
      const mockULog = createULogMock({
        messageFields: new Map([
          [
            "sensor_data",
            [
              { name: "timestamp", type: "uint64_t", isComplex: false },
              { name: "value", type: "uint64_t", isComplex: false },
            ],
          ],
        ]),
        subscriptions: ["sensor_data"],
        messages: [
          {
            topic: "sensor_data",
            message: {
              timestamp: 1000n,
              value: 100000000000n,
            } as ParsedMessage,
          },
        ],
      });

      const mockOutputFile = new TempBuffer();
      const mcapWriter = new McapWriter({
        writable: mockOutputFile,
      });
      await convertULogFileToMCAP(mockULog, mcapWriter, 0n);
      const mcapReader = await McapIndexedReader.Initialize({
        readable: mockOutputFile,
      });
      const textDecoder = new TextDecoder();
      const messageData = [];
      for await (const msg of mcapReader.readMessages()) {
        messageData.push(JSON.parse(textDecoder.decode(msg.data)));
      }
      expect(messageData.length).toBe(1);
      expect(messageData).toEqual([{ value: 100000000000 }]);
    });
  });

  it("should perform full ULog to MCAP conversion with sample files", async () => {
    const inputFileHandle = new FileReader(__dirname + "/fixtures/test_ulog.ulg");

    const mockOutputFile = new TempBuffer();
    const mcapWriter = new McapWriter({
      writable: mockOutputFile,
    });
    await convertULogFileToMCAP(new ULog(inputFileHandle), mcapWriter, 1_000n);

    const mcapReader = await McapIndexedReader.Initialize({
      readable: mockOutputFile,
    });

    const channelTopics = Array.from(mcapReader.channelsById.values()).map((ch) => ch.topic);
    expect(channelTopics.length).toBe(114);
  });
});
