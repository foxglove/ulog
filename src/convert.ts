import { McapWriter } from "@mcap/core";

import { ULog } from "./ULog";
import { MessageDefinition } from "./definition";
import { MessageType } from "./enums";
import { ParsedMessage, FieldArray, FieldPrimitive, FieldStruct } from "./messages";

type MessageMinusTimestamp = Omit<ParsedMessage, "timestamp">;

function ulogFieldTypeToJSONPrimitive(fieldType: string): string | undefined {
  switch (fieldType) {
    case "bool":
      return "boolean";
    case "char":
      return "string";
    case "float":
    case "double":
      return "number";
    case "int8_t":
    case "uint8_t":
    case "int16_t":
    case "uint16_t":
    case "int32_t":
    case "uint32_t":
    case "int64_t":
    case "uint64_t":
      return "integer";
    default:
      return undefined;
  }
}

export function ulogDefinitionToJSONSchema(
  schemaName: string,
  definitions: Map<string, MessageDefinition>,
): object {
  const definition = definitions.get(schemaName);
  if (definition == undefined) {
    throw new Error(`Missing ULog definition for message type: ${schemaName}`);
  }
  const jsonFields: Record<string, object> = {};

  for (const field of definition.fields) {
    if (field.name === "timestamp" || field.name.startsWith("_padding")) {
      continue; // Skip special fields
    }

    const primitiveType = ulogFieldTypeToJSONPrimitive(field.type);

    let fieldSchema: object;
    if (primitiveType == undefined) {
      fieldSchema = ulogDefinitionToJSONSchema(field.type, definitions);
    } else {
      fieldSchema = { type: primitiveType };
    }

    if (field.arrayLength != undefined && primitiveType !== "string") {
      fieldSchema = {
        type: "array",
        items: fieldSchema,
        minItems: field.arrayLength,
        maxItems: field.arrayLength,
      };
    }
    jsonFields[field.name] = fieldSchema;
  }

  return {
    title: schemaName,
    type: "object",
    properties: jsonFields,
  };
}

/**
 * Read a ULog file and convert it to MCAP format.
 * @param inputFile - the ULog file handle to convert
 * @param outputFile - the MCAP file writer to write to
 * @param startTime - the initial time to use for message timestamps (in microseconds). This is required since ULog timestamps are often only relative to device startup.
 */
export async function convertULogFileToMCAP(
  inputFile: ULog,
  outputFile: McapWriter,
  startTime: bigint,
): Promise<void> {
  await inputFile.open();
  if (inputFile.header == undefined) {
    throw new Error("Invalid ULog file: missing header");
  }

  await outputFile.start({
    profile: "",
    library: "ulog conversion",
  });

  const fileStartTime = inputFile.header.timestamp;

  // Register schemas and channels
  const msgIdToChannelId = new Map<number, number>();
  for (const [msgId, subscription] of inputFile.subscriptions.entries()) {
    const channelName = subscription.name;
    const schema = ulogDefinitionToJSONSchema(channelName, inputFile.header.definitions);
    const schemaId = await outputFile.registerSchema({
      name: channelName,
      encoding: "jsonschema",
      data: Buffer.from(JSON.stringify(schema)),
    });

    const channelId = await outputFile.registerChannel({
      schemaId,
      topic: channelName,
      messageEncoding: "json",
      metadata: new Map(),
    });
    msgIdToChannelId.set(msgId, channelId);
  }

  // Read messages and write to MCAP
  for await (const msg of inputFile.readMessages()) {
    if (msg.type === MessageType.Data) {
      const channelId = msgIdToChannelId.get(msg.msgId);
      if (channelId == undefined) {
        throw new Error(`No channel ID found for message ID: ${msg.msgId}`);
      }

      const msgTimestamp = (msg.value.timestamp - fileStartTime + startTime) * 1000n;
      const msgData: MessageMinusTimestamp = { ...msg.value };
      delete msgData.timestamp;
      await outputFile.addMessage({
        channelId,
        sequence: 0,
        publishTime: msgTimestamp,
        logTime: msgTimestamp,
        data: Buffer.from(
          JSON.stringify(
            msgData,
            (_, value: FieldStruct | FieldPrimitive | FieldArray) =>
              typeof value === "bigint" ? Number(value) : value, // We can afford loss of precision here because we are generating test data
          ),
        ),
      });
    }
  }

  await outputFile.end();
}
