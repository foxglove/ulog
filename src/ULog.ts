import { AVLTree } from "@foxglove/avl";

import { ChunkedReader } from "./ChunkedReader";
import {
  Field,
  MessageDefinition,
  parseFieldDefinition,
  parseMessageDefinition,
} from "./definition";
import { MessageType, ParameterDefaultFlags, LogLevel } from "./enums";
import { Filelike } from "./file";
import { toHex } from "./hex";
import {
  SyncMagic,
  MessageFlagBits,
  Message,
  MessageInformation,
  MessageInformationMulti,
  MessageFormatDefinition,
  MessageParameter,
  MessageParameterDefault,
  MessageAddLogged,
  MessageRemoveLogged,
  MessageData,
  MessageLog,
  MessageLogTagged,
  MessageSynchronization,
  MessageDropout,
  MessageUnknown,
  BitFlags,
} from "./messages";
import { FieldPrimitive, MessageDataParsed, parseBasicFieldValue, parseMessage } from "./parse";

export type DataSectionMessage =
  | MessageAddLogged
  | MessageRemoveLogged
  | MessageDataParsed
  | MessageLog
  | MessageLogTagged
  | MessageSynchronization
  | MessageDropout;

export type ParameterEntry = { value: number; defaultTypes: number };

export type ULogHeader = {
  version: number;
  timestamp: bigint; // [μs]
  flagBits?: MessageFlagBits;
  information: Map<string, FieldPrimitive | FieldPrimitive[]>;
  parameters: Map<string, ParameterEntry>;
  definitions: Map<string, MessageDefinition>;
};

const MAGIC = [0x55, 0x4c, 0x6f, 0x67, 0x01, 0x12, 0x35];
const SYNC_MAGIC: SyncMagic = [0x2f, 0x73, 0x13, 0x20, 0x25, 0x0c, 0xbb, 0x12];

type MessageHeader = {
  size: number;
  type: number;
};

export class ULog {
  private _reader: ChunkedReader;
  private _dataStart?: number;
  private _dataEnd?: number;
  private _header?: ULogHeader;
  private _appendedOffsets?: [number, number, number];
  private _subscriptions = new Map<number, MessageDefinition>();
  private _timeIndex?: AVLTree<bigint, number>; // An ordered map from timestamp to message index for all DATA section messages with timestamps
  private _positionIndex?: number[]; // Stores byte offsets for all DATA section messages

  constructor(filelike: Filelike) {
    this._reader = new ChunkedReader(filelike);
  }

  get header(): ULogHeader | undefined {
    return this._header;
  }

  get subscriptions(): Map<number, MessageDefinition> {
    return this._subscriptions;
  }

  async open(): Promise<ULogHeader> {
    const data = await this._reader.readBytes(8);
    for (let i = 0; i < MAGIC.length; i++) {
      if (data[i] !== MAGIC[i]) {
        throw new Error(`Invalid ULog header: ${toHex(data)}`);
      }
    }

    const version = data[7]!;
    const timestamp = await this._reader.readUint64();
    const information = new Map<string, FieldPrimitive | FieldPrimitive[]>();
    const parameters = new Map<string, ParameterEntry>();
    const definitions = new Map<string, MessageDefinition>();

    let flagBits: MessageFlagBits | undefined;
    while (!(await this.isDataSectionStart())) {
      const message = await this.readRawMessage();
      if (!message) {
        break;
      }

      switch (message.type) {
        case MessageType.FlagBits: {
          flagBits = message as MessageFlagBits;
          break;
        }
        case MessageType.Information: {
          const infoMsg = message as MessageInformation;
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
          const infoMultiMsg = message as MessageInformationMulti;
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
          const formatMsg = message as MessageFormatDefinition;
          const msgdef = parseMessageDefinition(formatMsg.format);
          if (msgdef) {
            definitions.set(msgdef.name, msgdef);
          } else {
            throw new Error(`oops: ${formatMsg.format}`);
          }
          break;
        }
        case MessageType.Parameter: {
          const paramMsg = message as MessageParameter;
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
          const paramMsg = message as MessageParameterDefault;
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
        default:
          throw new Error(`Unrecognized message type ${message.type}`);
      }
    }

    // File offsets are stored as 64-bit unsigned integers, but we cast to Number here which safely
    // stores up to 53-bit integers. This supports ulogs up to 8192 TB in length
    const appendedOffsets = flagBits?.appendedOffsets ?? [0n, 0n, 0n];
    this._appendedOffsets = appendedOffsets.map((n) => Number(n)) as [number, number, number];
    const firstOffset = this._appendedOffsets[0];

    this._dataStart = this._reader.position();
    this._dataEnd = this._reader.size();
    if (firstOffset > 0 && firstOffset < this._dataEnd) {
      this._dataEnd = firstOffset;
    }

    this._header = { version, timestamp, flagBits, information, parameters, definitions };
    return this._header;
  }

  async createIndex(): Promise<void> {
    if (this._dataStart == undefined || this._dataEnd == undefined) {
      throw new Error(`Cannot create index before open`);
    }

    const timeIndex = new AVLTree<bigint, number>();
    const positionIndex: number[] = [];

    for await (const message of this.messages()) {
      if (message.type === MessageType.Data) {
        const timestamp = (message.value as { timestamp?: bigint }).timestamp;
        if (timestamp != undefined) {
          if (!timeIndex.has(timestamp)) {
            timeIndex.set(timestamp, positionIndex.length);
          }
        }
      } else if (message.type === MessageType.Log || message.type === MessageType.LogTagged) {
        const timestamp = message.timestamp;
        if (!timeIndex.has(timestamp)) {
          timeIndex.set(timestamp, positionIndex.length);
        }
      }

      const msgPos = this._reader.position() - message.size - 3;
      positionIndex.push(msgPos);
    }

    this._timeIndex = timeIndex;
    this._positionIndex = positionIndex;
  }

  async *messages(): AsyncIterableIterator<DataSectionMessage> {
    if (this._dataStart == undefined) {
      throw new Error(`Cannot read before open`);
    }

    const originalPosition = this._reader.position();
    this._reader.seekTo(this._dataStart);

    let message: DataSectionMessage | undefined;
    while ((message = await this.readMessage())) {
      yield message;
    }

    this._reader.seekTo(originalPosition);
  }

  async readMessage(): Promise<DataSectionMessage | undefined> {
    if (!this._header) {
      throw new Error(`Cannot read before open`);
    }

    const rawMessage = await this.readRawMessage();
    if (!rawMessage) {
      return undefined;
    }

    if (rawMessage.type !== MessageType.Data) {
      return rawMessage as DataSectionMessage;
    }

    const dataMsg = rawMessage as MessageData;
    const definition = this._subscriptions.get(dataMsg.msgId);
    if (!definition) {
      const msgPos = this._reader.position() - rawMessage.size - 3;
      throw new Error(
        `Unknown msg_id ${dataMsg.msgId} for ${rawMessage.size} byte 'D' message at offset ${msgPos}`,
      );
    }

    const data = dataMsg.data;
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const value = parseMessage(definition, this._header.definitions, view);
    const parsed: MessageDataParsed = {
      size: dataMsg.size,
      type: MessageType.Data,
      msgId: dataMsg.msgId,
      data,
      value,
    };
    return parsed;
  }

  async readRawMessage(): Promise<Message | undefined> {
    if (this._dataEnd != undefined) {
      if (this._dataEnd - this._reader.position() < 3) {
        return undefined;
      }
    } else if (this._reader.remaining() < 3) {
      return undefined;
    }

    const header = await this.readMessageHeader();
    switch (header.type) {
      case MessageType.FlagBits:
        return await this.readMessageFlagBits(header);
      case MessageType.Information:
        return await this.readMessageInformation(header);
      case MessageType.InformationMulti:
        return await this.readMessageInformationMulti(header);
      case MessageType.FormatDefinition:
        return await this.readMessageFormatDefinition(header);
      case MessageType.Parameter:
        return await this.readMessageParameter(header);
      case MessageType.ParameterDefault:
        return await this.readMessageParameterDefault(header);
      case MessageType.AddLogged: {
        const subscribe = await this.readMessageAddLogged(header);
        this.handleSubscription(subscribe);
        return subscribe;
      }
      case MessageType.RemoveLogged:
        // Subscription msg_ids cannot be reused, so we can ignore this
        return await this.readMessageRemoveLogged(header);
      case MessageType.Data:
        return await this.readMessageData(header);
      case MessageType.Log:
        return await this.readMessageLog(header);
      case MessageType.LogTagged:
        return await this.readMessageLogTagged(header);
      case MessageType.Synchronization:
        return await this.readMessageSynchronization(header);
      case MessageType.Dropout:
        return await this.readMessageDropout(header);
      default:
        return await this.readMessageUnknown(header);
    }
  }

  messageCount(): number | undefined {
    return this._positionIndex?.length;
  }

  timeRange(): [bigint, bigint] | undefined {
    const timeIndex = this._timeIndex;
    const start = timeIndex?.minKey();
    const end = timeIndex?.maxKey();
    if (start == undefined || end == undefined) {
      return undefined;
    }
    return [start, end];
  }

  seekToMessage(index: number): void {
    if (this._dataStart == undefined) {
      throw new Error(`Cannot seek before open`);
    }

    if (index === 0) {
      this._reader.seekTo(this._dataStart);
      return;
    }

    const positionIndex = this._positionIndex;
    if (!positionIndex) {
      throw new Error(`Cannot seek before createIndex`);
    }

    if (index < 0 || index >= positionIndex.length) {
      throw new Error(`Invalid index ${index}, ${positionIndex.length} messages total`);
    }

    const byteOffset = positionIndex[index]!;
    this._reader.seekTo(byteOffset);
  }

  seekToTime(timestamp: bigint): number {
    if (this._dataStart == undefined) {
      throw new Error(`Cannot seek before open`);
    }

    const timeIndex = this._timeIndex;
    if (!timeIndex) {
      throw new Error(`Cannot seek before createIndex`);
    }

    const res = timeIndex.findLessThanOrEqual(timestamp);
    if (!res) {
      this._reader.seekTo(this._dataStart);
      return 0;
    }

    const index = res[1];
    this.seekToMessage(index);
    return index;
  }

  private handleSubscription(subscribe: MessageAddLogged): void {
    const definition = this._header?.definitions.get(subscribe.messageName);
    if (!definition) {
      throw new Error(`AddLogged unknown message_name: ${subscribe.messageName}`);
    }
    this._subscriptions.set(subscribe.msgId, definition);
  }

  private async isDataSectionStart(): Promise<boolean> {
    const view = await this._reader.peek(3);
    const type = view.getUint8(2) as MessageType;
    switch (type) {
      case MessageType.AddLogged:
      case MessageType.RemoveLogged:
      case MessageType.Data:
      case MessageType.Log:
      case MessageType.LogTagged:
      case MessageType.Synchronization:
      case MessageType.Dropout:
        return true;
      default:
        return false;
    }
  }

  private async readMessageHeader(): Promise<MessageHeader> {
    const size = await this._reader.readUint16();
    const type = await this._reader.readUint8();
    return { size, type };
  }

  private async readMessageFlagBits(header: MessageHeader): Promise<MessageFlagBits> {
    if (header.size < 40) {
      throw new Error(`Invalid 'B' message, expected 40 bytes but got ${header.size}`);
    }

    const compatFlags = await this._reader.readBytes(8);
    const incompatFlags = await this._reader.readBytes(8);

    for (let i = 0; i < 8; i++) {
      if ((i === 0 && incompatFlags[i]! > 1) || (i !== 0 && incompatFlags[i] !== 0)) {
        throw new Error(`Incompatible flag bit: ${i} is ${incompatFlags[i]!}`);
      }
    }

    return {
      size: header.size,
      type: header.type,
      compatibleFlags: Array.from(compatFlags) as BitFlags,
      incompatibleFlags: Array.from(incompatFlags) as BitFlags,
      appendedOffsets: [
        await this._reader.readUint64(),
        await this._reader.readUint64(),
        await this._reader.readUint64(),
      ],
    };
  }

  private async readMessageInformation(header: MessageHeader): Promise<MessageInformation> {
    const keyLen = await this._reader.readUint8();
    if (keyLen > header.size - 1) {
      throw new Error(`Invalid 'I' message, size is ${header.size} but key_len is ${keyLen}`);
    }

    return {
      size: header.size,
      type: header.type,
      key: await this._reader.readString(keyLen),
      value: await this._reader.readBytes(header.size - 1 - keyLen),
    };
  }

  private async readMessageInformationMulti(
    header: MessageHeader,
  ): Promise<MessageInformationMulti> {
    const isContinued = Boolean(await this._reader.readUint8());
    const keyLen = await this._reader.readUint8();
    if (keyLen > header.size - 1) {
      throw new Error(`Invalid 'I' message, size is ${header.size} but key_len is ${keyLen}`);
    }

    const key = await this._reader.readString(keyLen);
    const value = await this._reader.readBytes(header.size - 1 - keyLen);
    return { size: header.size, type: header.type, isContinued, key, value };
  }

  private async readMessageFormatDefinition(
    header: MessageHeader,
  ): Promise<MessageFormatDefinition> {
    const format = await this._reader.readString(header.size);
    return { size: header.size, type: header.type, format };
  }

  private async readMessageParameter(header: MessageHeader): Promise<MessageParameter> {
    const keyLen = await this._reader.readUint8();
    if (keyLen > header.size - 1) {
      throw new Error(`Invalid 'P' message, size is ${header.size} but key_len is ${keyLen}`);
    }

    const key = await this._reader.readString(keyLen);
    const value = await this._reader.readBytes(header.size - 1 - keyLen);
    return { size: header.size, type: header.type, key, value };
  }

  private async readMessageParameterDefault(
    header: MessageHeader,
  ): Promise<MessageParameterDefault> {
    const defaultTypes = (await this._reader.readUint8()) as ParameterDefaultFlags;
    const keyLen = await this._reader.readUint8();
    if (keyLen > header.size - 2) {
      throw new Error(`Invalid 'Q' message, size is ${header.size} but key_len is ${keyLen}`);
    }

    const key = await this._reader.readString(keyLen);
    const value = await this._reader.readBytes(header.size - 2 - keyLen);
    return { size: header.size, type: header.type, defaultTypes, key, value };
  }

  private async readMessageAddLogged(header: MessageHeader): Promise<MessageAddLogged> {
    if (header.size < 3) {
      throw new Error(`Invalid 'A' message, size is ${header.size} but expected at least 3`);
    }

    const multiId = await this._reader.readUint8();
    const msgId = await this._reader.readUint16();
    const messageName = await this._reader.readString(header.size - 3);
    return { size: header.size, type: header.type, multiId, msgId, messageName };
  }

  private async readMessageRemoveLogged(header: MessageHeader): Promise<MessageRemoveLogged> {
    if (header.size < 1) {
      throw new Error(`Invalid 'R' message, size is ${header.size} but expected at least 1`);
    }

    const msgId = await this._reader.readUint8();
    return { size: header.size, type: header.type, msgId };
  }

  private async readMessageData(header: MessageHeader): Promise<MessageData> {
    if (header.size < 2) {
      throw new Error(`Invalid 'D' message, size is ${header.size} but expected at least 2`);
    }

    const msgId = await this._reader.readUint16();
    const data = await this._reader.readBytes(header.size - 2);
    return { size: header.size, type: header.type, msgId, data };
  }

  private async readMessageLog(header: MessageHeader): Promise<MessageLog> {
    if (header.size < 9) {
      throw new Error(`Invalid 'L' message, size is ${header.size} but expected at least 9`);
    }

    const logLevel = (await this._reader.readUint8()) as LogLevel;
    const timestamp = await this._reader.readUint64();
    const message = await this._reader.readString(header.size - 9);
    return { size: header.size, type: header.type, logLevel, timestamp, message };
  }

  private async readMessageLogTagged(header: MessageHeader): Promise<MessageLogTagged> {
    if (header.size < 11) {
      throw new Error(`Invalid 'T' message, size is ${header.size} but expected at least 11`);
    }

    const logLevel = (await this._reader.readUint8()) as LogLevel;
    const tag = await this._reader.readUint16();
    const timestamp = await this._reader.readUint64();
    const message = await this._reader.readString(header.size - 11);
    return { size: header.size, type: header.type, logLevel, tag, timestamp, message };
  }

  private async readMessageSynchronization(header: MessageHeader): Promise<MessageSynchronization> {
    if (header.size !== 8) {
      throw new Error(`Invalid 'S' message, size is ${header.size} but expected 8`);
    }

    const syncMagic = await this._reader.readBytes(8);
    for (let i = 0; i < 8; i++) {
      if (syncMagic[i] !== SYNC_MAGIC[i]) {
        throw new Error(`Invalid 'S' message: ${toHex(syncMagic)}`);
      }
    }

    return { size: header.size, type: header.type, syncMagic: SYNC_MAGIC };
  }

  private async readMessageDropout(header: MessageHeader): Promise<MessageDropout> {
    if (header.size < 2) {
      throw new Error(`Invalid 'O' message, size is ${header.size} but expected at least 2`);
    }

    const duration = await this._reader.readUint16();
    return { size: header.size, type: header.type, duration };
  }

  private async readMessageUnknown(header: MessageHeader): Promise<MessageUnknown> {
    const data = await this._reader.readBytes(header.size);
    return { size: header.size, type: header.type, data };
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
