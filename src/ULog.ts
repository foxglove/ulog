import { ChunkedReader } from "./ChunkedReader";
import {
  Field,
  MessageDefinition,
  parseFieldDefinition,
  parseMessageDefinition,
} from "./definition";
import { MessageType } from "./enums";
import { Filelike } from "./file";
import { findRange } from "./findRange";
import { toHex } from "./hex";
import {
  MessageFlagBits,
  MessageAddLogged,
  DataSectionMessage,
  FieldPrimitive,
  MessageDataParsed,
} from "./messages";
import { fieldSize, parseBasicFieldValue, parseMessage } from "./parse";
import {
  readMessageAddLogged,
  readMessageData,
  readMessageHeader,
  readMessageLog,
  readMessageLogTagged,
  readRawMessage,
} from "./readMessage";

export type ParameterEntry = { value: number; defaultTypes: number };

export type ULogHeader = {
  version: number;
  timestamp: bigint; // [μs]
  flagBits?: MessageFlagBits;
  information: Map<string, FieldPrimitive | FieldPrimitive[]>;
  parameters: Map<string, ParameterEntry>;
  definitions: Map<string, MessageDefinition>;
};

export type Subscription = MessageDefinition & Pick<MessageAddLogged, "multiId">;

const MAGIC = [0x55, 0x4c, 0x6f, 0x67, 0x01, 0x12, 0x35];

type MsgId = number & { __brand: "MsgId" };

/**
 * The synthetic message id for log messages.
 *
 * When entering a log message in an IndexEntry we tag it with this message id so we can identify
 * log messages in the readMessage function if the `includeLogs` option is true.
 */
const LogMessageId = -1 as MsgId;

/**
 * An entry in the time index pointing to a message in the ulog file
 *
 * timestamp: the timestamp of the message
 * offset: byte location in the file
 * msgId: the message id if the message is a data message, LogMessageId if it is a log message, or undefined if it is not a data message
 */
type IndexEntry = [timestamp: bigint, offset: number, msgId: MsgId | undefined];

export class ULog {
  #filelike: Filelike;
  #chunkSize: number | undefined;

  // These members are only populated after open()
  #dataEnd?: number;
  #header?: ULogHeader;
  #appendedOffsets?: [number, number, number];
  #subscriptions = new Map<number, Subscription>();
  #timeIndex?: IndexEntry[];
  #dataMessageCounts?: Map<number, number>;
  #logMessageCount?: number;
  #dataTimeRange?: [bigint, bigint];

  constructor(filelike: Filelike, opts: { chunkSize?: number } = {}) {
    this.#filelike = filelike;
    this.#chunkSize = opts.chunkSize;
  }

  get header(): ULogHeader | undefined {
    return this.#header;
  }

  /**
   * Return a map of message ids to their corresponding subscription
   */
  get subscriptions(): Map<number, Subscription> {
    return this.#subscriptions;
  }

  async open(): Promise<void> {
    await this.#filelike.open();
    const reader = new ChunkedReader(this.#filelike, this.#chunkSize);
    const data = await reader.readBytes(8);
    for (let i = 0; i < MAGIC.length; i++) {
      if (data[i] !== MAGIC[i]) {
        throw new Error(`Invalid ULog header: ${toHex(data)}`);
      }
    }

    const version = data[7]!;
    const timestamp = await reader.readUint64();
    const information = new Map<string, FieldPrimitive | FieldPrimitive[]>();
    const parameters = new Map<string, ParameterEntry>();
    const definitions = new Map<string, MessageDefinition>();

    let flagBits: MessageFlagBits | undefined;
    while (!(await isDataSectionStart(reader))) {
      const message = await readRawMessage(reader, this.#dataEnd);
      if (!message) {
        break;
      }

      switch (message.type) {
        case MessageType.FlagBits: {
          flagBits = message;
          break;
        }
        case MessageType.Information: {
          const infoMsg = message;
          const field = parseFieldDefinition(infoMsg.key);
          if (isValidInfoField(field)) {
            const value = infoMsg.value;
            const view = new DataView(value.buffer, value.byteOffset, value.byteLength);
            const parsed = parseBasicFieldValue(field, view);
            information.set(field.name, parsed);
          }
          break;
        }
        case MessageType.InformationMulti: {
          const infoMultiMsg = message;
          const field = parseFieldDefinition(infoMultiMsg.key);
          if (isValidInfoField(field)) {
            let array = information.get(infoMultiMsg.key) as FieldPrimitive[] | undefined;
            if (!Array.isArray(array)) {
              array = [];
              information.set(infoMultiMsg.key, array);
            }

            const value = infoMultiMsg.value;
            const view = new DataView(value.buffer, value.byteOffset, value.byteLength);
            const parsed = parseBasicFieldValue(field, view);
            array.push(parsed);
          }
          break;
        }
        case MessageType.FormatDefinition: {
          const formatMsg = message;
          const msgdef = parseMessageDefinition(formatMsg.format);
          if (msgdef) {
            definitions.set(msgdef.name, msgdef);
          } else {
            throw new Error(`oops: ${formatMsg.format}`);
          }
          break;
        }
        case MessageType.Parameter: {
          const paramMsg = message;
          const field = parseFieldDefinition(paramMsg.key);
          if (isValidParameter(field)) {
            const value = paramMsg.value;
            const view = new DataView(value.buffer, value.byteOffset, value.byteLength);
            const parsed = parseBasicFieldValue(field, view);
            parameters.set(field.name, { value: parsed as number, defaultTypes: 0 });
          }
          break;
        }
        case MessageType.ParameterDefault: {
          const paramMsg = message;
          const field = parseFieldDefinition(paramMsg.key);
          if (isValidParameter(field)) {
            const value = paramMsg.value;
            const view = new DataView(value.buffer, value.byteOffset, value.byteLength);
            const parsed = parseBasicFieldValue(field, view) as number | undefined;
            if (parsed != undefined) {
              parameters.set(field.name, { value: parsed, defaultTypes: paramMsg.defaultTypes });
            }
          }
          break;
        }
        case MessageType.Unknown:
        case MessageType.AddLogged:
        case MessageType.RemoveLogged:
        case MessageType.Data:
        case MessageType.Log:
        case MessageType.LogTagged:
        case MessageType.Synchronization:
        case MessageType.Dropout:
        default:
          throw new Error(`Unrecognized message type ${message.type}`);
      }
    }

    // File offsets are stored as 64-bit unsigned integers, but we cast to Number here which safely
    // stores up to 53-bit integers. This supports ulogs up to 8192 TB in length
    const appendedOffsets = flagBits?.appendedOffsets ?? [0n, 0n, 0n];
    this.#appendedOffsets = appendedOffsets.map((n) => Number(n)) as [number, number, number];
    const firstOffset = this.#appendedOffsets[0];

    this.#dataEnd = reader.size();
    if (firstOffset > 0 && firstOffset < this.#dataEnd) {
      this.#dataEnd = firstOffset;
    }

    this.#header = { version, timestamp, flagBits, information, parameters, definitions };

    await this.#createIndex(reader);
  }

  async *readMessages(
    opts: {
      startTime?: bigint;
      endTime?: bigint;
      /** If true (default) logs messages are yielded from the time range. */
      includeLogs?: boolean;
      /** If specified, only messages with the given message ids are yielded. */
      msgIds?: Set<number>;
      /** If true, the messages are yielded in reverse order (default false). */
      reverse?: boolean;
    } = {},
  ): AsyncIterableIterator<DataSectionMessage> {
    const includeLogs = opts.includeLogs ?? true;
    const msgIds = opts.msgIds;

    const reader = new ChunkedReader(this.#filelike, this.#chunkSize);

    const timeIndex = this.#timeIndex;
    if (timeIndex == undefined) {
      throw new Error(`Cannot readMessages before createIndex`);
    }

    if (timeIndex.length === 0) {
      return;
    }

    const startTime = opts.startTime ?? timeIndex[0]![0];
    const endTime = opts.endTime ?? timeIndex[timeIndex.length - 1]![0];

    const range = findRange(timeIndex, startTime, endTime);
    if (range == undefined) {
      return;
    }

    if (opts.reverse === true) {
      for (let i = range[1]; i >= range[0]; i--) {
        const [_timestamp, offset, msgId] = timeIndex[i]!;

        if (includeLogs && msgId === LogMessageId) {
          reader.seekTo(offset);
          const msg = await this.#readParsedMessage(reader);
          if (msg) {
            yield msg;
            continue;
          }
        }

        // If there are message ids specified, then only yield if the locator msgId matches
        if (msgIds != undefined) {
          if (msgId == undefined || !msgIds.has(msgId)) {
            continue;
          }
        }

        reader.seekTo(offset);
        const msg = await this.#readParsedMessage(reader);
        if (msg) {
          yield msg;
        }
      }
    } else {
      for (let i = range[0]; i <= range[1]; i++) {
        const [_timestamp, offset, msgId] = timeIndex[i]!;

        if (includeLogs && msgId === LogMessageId) {
          reader.seekTo(offset);
          const msg = await this.#readParsedMessage(reader);
          if (msg) {
            yield msg;
            continue;
          }
        }

        // If there are message ids specified, then only yield if the locator msgId matches
        if (msgIds != undefined) {
          if (msgId == undefined || !msgIds.has(msgId)) {
            continue;
          }
        }

        reader.seekTo(offset);
        const msg = await this.#readParsedMessage(reader);
        if (msg) {
          yield msg;
        }
      }
    }
  }

  messageCount(): number | undefined {
    return this.#timeIndex?.length;
  }

  dataMessageCounts(): ReadonlyMap<number, number> | undefined {
    return this.#dataMessageCounts;
  }

  logCount(): number | undefined {
    return this.#logMessageCount;
  }

  timeRange(): Readonly<[bigint, bigint]> | undefined {
    return this.#dataTimeRange;
  }

  async #createIndex(reader: ChunkedReader): Promise<void> {
    if (!this.#header || this.#dataEnd == undefined) {
      throw new Error(`Cannot read before open`);
    }

    const dataEnd = this.#dataEnd;
    const timeIndex: IndexEntry[] = [];
    const dataCounts = new Map<number, number>();
    let minTimestamp: bigint | undefined;
    let maxTimestamp = 0n;
    let logMessageCount = 0;

    // The offset of the timestamp field for a data message. The offset is from the start of the
    // message data.
    const timestampFieldOffsets = new Map<MsgId, number>();

    for (;;) {
      const offset = reader.position();

      // If there is less than 3 bytes left in the file, we can't read a message header so we're done
      if (dataEnd - offset < 3) {
        break;
      }

      const header = await readMessageHeader(reader);
      const type = header.type as MessageType;

      // If there's not enough bytes in the file to read the message then we end indexing
      if (reader.position() + header.size > dataEnd) {
        break;
      }

      if (type === MessageType.AddLogged) {
        // read the AddLogged message from the reader data
        const addLogged = await readMessageAddLogged(reader, header);
        this.#handleSubscription(addLogged);

        timeIndex.push([maxTimestamp, offset, undefined]);
      } else if (type === MessageType.Log) {
        const logMsg = await readMessageLog(reader, header);

        if (minTimestamp == undefined || logMsg.timestamp < minTimestamp) {
          minTimestamp = logMsg.timestamp;
        }
        if (logMsg.timestamp > maxTimestamp) {
          maxTimestamp = logMsg.timestamp;
        }

        timeIndex.push([logMsg.timestamp, offset, LogMessageId]);
        logMessageCount++;
      } else if (type === MessageType.LogTagged) {
        const logMsg = await readMessageLogTagged(reader, header);

        if (minTimestamp == undefined || logMsg.timestamp < minTimestamp) {
          minTimestamp = logMsg.timestamp;
        }
        if (logMsg.timestamp > maxTimestamp) {
          maxTimestamp = logMsg.timestamp;
        }

        timeIndex.push([logMsg.timestamp, offset, LogMessageId]);
        logMessageCount++;
      } else if (type === MessageType.Data) {
        const dataMsg = await readMessageData(reader, header);

        let timestampOffset = timestampFieldOffsets.get(dataMsg.msgId as MsgId);
        if (timestampOffset == undefined) {
          // We don't yet have a timestamp offset for this message id so we compute it
          const definition = this.#subscriptions.get(dataMsg.msgId);
          if (!definition) {
            const msgPos = reader.position() - header.size - 3;
            throw new Error(
              `Unknown msg_id ${dataMsg.msgId} for ${header.size} byte 'D' message at offset ${msgPos}`,
            );
          }

          timestampOffset = computeTimetampOffset(definition, this.#header.definitions);
          timestampFieldOffsets.set(dataMsg.msgId as MsgId, timestampOffset);
        }

        const view = new DataView(
          dataMsg.data.buffer,
          dataMsg.data.byteOffset,
          dataMsg.data.byteLength,
        );
        // we know the timestamp offset so we can parse the timestamp
        const timestamp = view.getBigUint64(timestampOffset, true);

        if (minTimestamp == undefined || timestamp < minTimestamp) {
          minTimestamp = timestamp;
        }
        if (timestamp > maxTimestamp) {
          maxTimestamp = timestamp;
        }

        timeIndex.push([timestamp, offset, dataMsg.msgId as MsgId]);
        dataCounts.set(dataMsg.msgId, (dataCounts.get(dataMsg.msgId) ?? 0) + 1);
      } else {
        timeIndex.push([maxTimestamp, offset, undefined]);

        // Skip past this message
        reader.seek(header.size);
      }
    }

    this.#timeIndex = timeIndex.sort(sortTimeIndex);
    this.#dataMessageCounts = dataCounts;
    this.#logMessageCount = logMessageCount;
    this.#dataTimeRange = minTimestamp != undefined ? [minTimestamp, maxTimestamp] : undefined;
  }

  async #readParsedMessage(reader: ChunkedReader): Promise<DataSectionMessage | undefined> {
    if (!this.#header) {
      throw new Error(`Cannot read before open`);
    }

    const rawMessage = await readRawMessage(reader, this.#dataEnd);
    if (!rawMessage) {
      return undefined;
    }

    if (rawMessage.type !== MessageType.Data) {
      return rawMessage as DataSectionMessage;
    }

    const dataMsg = rawMessage;
    const definition = this.#subscriptions.get(dataMsg.msgId);
    if (!definition) {
      const msgPos = reader.position() - rawMessage.size - 3;
      throw new Error(
        `Unknown msg_id ${dataMsg.msgId} for ${rawMessage.size} byte 'D' message at offset ${msgPos}`,
      );
    }

    const data = dataMsg.data;
    const value = parseMessage(
      definition,
      this.#header.definitions,
      reader.view()!,
      data.byteOffset,
    );
    const parsed: MessageDataParsed = {
      size: dataMsg.size,
      type: MessageType.Data,
      msgId: dataMsg.msgId,
      data,
      value,
    };
    return parsed;
  }

  #handleSubscription(subscribe: MessageAddLogged): void {
    const definition = this.#header?.definitions.get(subscribe.messageName);
    if (!definition) {
      throw new Error(`AddLogged unknown message_name: ${subscribe.messageName}`);
    }
    this.#subscriptions.set(subscribe.msgId, { ...definition, multiId: subscribe.multiId });
  }
}

async function isDataSectionStart(reader: ChunkedReader): Promise<boolean> {
  const type = (await reader.peekUint8(2)) as MessageType;
  switch (type) {
    case MessageType.AddLogged:
    case MessageType.RemoveLogged:
    case MessageType.Data:
    case MessageType.Log:
    case MessageType.LogTagged:
    case MessageType.Synchronization:
    case MessageType.Dropout:
      return true;
    case MessageType.Unknown:
    case MessageType.FlagBits:
    case MessageType.Information:
    case MessageType.InformationMulti:
    case MessageType.FormatDefinition:
    case MessageType.Parameter:
    case MessageType.ParameterDefault:
      return false;
  }
}

function isValidInfoField(field: Field | undefined): field is Field {
  return field?.isComplex === false;
}

function isValidParameter(field: Field | undefined): field is Field {
  return Boolean(
    field && (field.type === "int32_t" || field.type === "float") && field.arrayLength == undefined,
  );
}

function sortTimeIndex(a: IndexEntry, b: IndexEntry) {
  const timestampA = a[0];
  const timestampB = b[0];

  // If the timestamps are the same, sort by the offset within the file
  if (timestampA === timestampB) {
    const indexA = a[1];
    const indexB = b[1];
    return indexA - indexB;
  }

  return Number(timestampA - timestampB);
}

export function computeTimetampOffset(
  definition: MessageDefinition,
  definitions: Map<string, MessageDefinition>,
): number {
  let curOffset = 0;
  for (const field of definition.fields) {
    if (field.name.startsWith("_")) {
      continue;
    }
    if (field.name === "timestamp") {
      if (field.type !== "uint64_t") {
        throw new Error(
          `Message "${definition.name}" has a timestamp field with a non-uint64_t type`,
        );
      }

      return curOffset;
    }
    curOffset += fieldSize(field, definitions) * (field.arrayLength ?? 1);
  }

  throw new Error(`Message "${definition.name}" is missing a timestamp field`);
}
