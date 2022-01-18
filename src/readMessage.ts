/* eslint-disable @typescript-eslint/return-await */

import { ChunkedReader } from "./ChunkedReader";
import { LogLevel, MessageType, ParameterDefaultFlags } from "./enums";
import { toHex } from "./hex";
import {
  MessageFlagBits,
  BitFlags,
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
  SyncMagic,
  Message,
} from "./messages";

export type MessageHeader = { size: number; type: number };

const SYNC_MAGIC: SyncMagic = [0x2f, 0x73, 0x13, 0x20, 0x25, 0x0c, 0xbb, 0x12];

export async function readMessageHeader(reader: ChunkedReader): Promise<MessageHeader> {
  const size = await reader.readUint16();
  const type = await reader.readUint8();
  return { size, type };
}

export async function readRawMessage(
  reader: ChunkedReader,
  dataEnd: number | undefined,
): Promise<Message | undefined> {
  if (dataEnd != undefined) {
    if (dataEnd - reader.position() < 3) {
      return undefined;
    }
  } else if (reader.remaining() < 3) {
    return undefined;
  }

  try {
    const header = await readMessageHeader(reader);
    switch (header.type) {
      case MessageType.FlagBits:
        return await readMessageFlagBits(reader, header);
      case MessageType.Information:
        return await readMessageInformation(reader, header);
      case MessageType.InformationMulti:
        return await readMessageInformationMulti(reader, header);
      case MessageType.FormatDefinition:
        return await readMessageFormatDefinition(reader, header);
      case MessageType.Parameter:
        return await readMessageParameter(reader, header);
      case MessageType.ParameterDefault:
        return await readMessageParameterDefault(reader, header);
      case MessageType.AddLogged:
        return await readMessageAddLogged(reader, header);
      case MessageType.RemoveLogged:
        return await readMessageRemoveLogged(reader, header);
      case MessageType.Data:
        return await readMessageData(reader, header);
      case MessageType.Log:
        return await readMessageLog(reader, header);
      case MessageType.LogTagged:
        return await readMessageLogTagged(reader, header);
      case MessageType.Synchronization:
        return await readMessageSynchronization(reader, header);
      case MessageType.Dropout:
        return await readMessageDropout(reader, header);
      default:
        return await readMessageUnknown(reader, header);
    }
  } catch (err) {
    return undefined;
  }
}

export async function readMessageFlagBits(
  reader: ChunkedReader,
  header: MessageHeader,
): Promise<MessageFlagBits> {
  if (header.size < 40) {
    throw new Error(`Invalid 'B' message, expected 40 bytes but got ${header.size}`);
  }

  const compatFlags = await reader.readBytes(8);
  const incompatFlags = await reader.readBytes(8);

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
      await reader.readUint64(),
      await reader.readUint64(),
      await reader.readUint64(),
    ],
  };
}

export async function readMessageInformation(
  reader: ChunkedReader,
  header: MessageHeader,
): Promise<MessageInformation> {
  const keyLen = await reader.readUint8();
  if (keyLen > header.size - 1) {
    throw new Error(`Invalid 'I' message, size is ${header.size} but key_len is ${keyLen}`);
  }

  return {
    size: header.size,
    type: header.type,
    key: await reader.readString(keyLen),
    value: await reader.readBytes(header.size - 1 - keyLen),
  };
}

export async function readMessageInformationMulti(
  reader: ChunkedReader,
  header: MessageHeader,
): Promise<MessageInformationMulti> {
  const isContinued = Boolean(await reader.readUint8());
  const keyLen = await reader.readUint8();
  if (keyLen > header.size - 1) {
    throw new Error(`Invalid 'I' message, size is ${header.size} but key_len is ${keyLen}`);
  }

  const key = await reader.readString(keyLen);
  const value = await reader.readBytes(header.size - 2 - keyLen);
  return { size: header.size, type: header.type, isContinued, key, value };
}

export async function readMessageFormatDefinition(
  reader: ChunkedReader,
  header: MessageHeader,
): Promise<MessageFormatDefinition> {
  const format = await reader.readString(header.size);
  return { size: header.size, type: header.type, format };
}

export async function readMessageParameter(
  reader: ChunkedReader,
  header: MessageHeader,
): Promise<MessageParameter> {
  const keyLen = await reader.readUint8();
  if (keyLen > header.size - 1) {
    throw new Error(`Invalid 'P' message, size is ${header.size} but key_len is ${keyLen}`);
  }

  const key = await reader.readString(keyLen);
  const value = await reader.readBytes(header.size - 1 - keyLen);
  return { size: header.size, type: header.type, key, value };
}

export async function readMessageParameterDefault(
  reader: ChunkedReader,
  header: MessageHeader,
): Promise<MessageParameterDefault> {
  const defaultTypes = (await reader.readUint8()) as ParameterDefaultFlags;
  const keyLen = await reader.readUint8();
  if (keyLen > header.size - 2) {
    throw new Error(`Invalid 'Q' message, size is ${header.size} but key_len is ${keyLen}`);
  }

  const key = await reader.readString(keyLen);
  const value = await reader.readBytes(header.size - 2 - keyLen);
  return { size: header.size, type: header.type, defaultTypes, key, value };
}

export async function readMessageAddLogged(
  reader: ChunkedReader,
  header: MessageHeader,
): Promise<MessageAddLogged> {
  if (header.size < 3) {
    throw new Error(`Invalid 'A' message, size is ${header.size} but expected at least 3`);
  }

  const multiId = await reader.readUint8();
  const msgId = await reader.readUint16();
  const messageName = await reader.readString(header.size - 3);
  return { size: header.size, type: header.type, multiId, msgId, messageName };
}

export async function readMessageRemoveLogged(
  reader: ChunkedReader,
  header: MessageHeader,
): Promise<MessageRemoveLogged> {
  if (header.size < 1) {
    throw new Error(`Invalid 'R' message, size is ${header.size} but expected at least 1`);
  }

  const msgId = await reader.readUint8();
  return { size: header.size, type: header.type, msgId };
}

export async function readMessageData(
  reader: ChunkedReader,
  header: MessageHeader,
): Promise<MessageData> {
  if (header.size < 2) {
    throw new Error(`Invalid 'D' message, size is ${header.size} but expected at least 2`);
  }

  const msgId = await reader.readUint16();
  const data = await reader.readBytes(header.size - 2);
  return { size: header.size, type: header.type, msgId, data };
}

export async function readMessageLog(
  reader: ChunkedReader,
  header: MessageHeader,
): Promise<MessageLog> {
  if (header.size < 9) {
    throw new Error(`Invalid 'L' message, size is ${header.size} but expected at least 9`);
  }

  const logLevel = (await reader.readUint8()) as LogLevel;
  const timestamp = await reader.readUint64();
  const message = await reader.readString(header.size - 9);
  return { size: header.size, type: header.type, logLevel, timestamp, message };
}

export async function readMessageLogTagged(
  reader: ChunkedReader,
  header: MessageHeader,
): Promise<MessageLogTagged> {
  if (header.size < 11) {
    throw new Error(`Invalid 'T' message, size is ${header.size} but expected at least 11`);
  }

  const logLevel = (await reader.readUint8()) as LogLevel;
  const tag = await reader.readUint16();
  const timestamp = await reader.readUint64();
  const message = await reader.readString(header.size - 11);
  return { size: header.size, type: header.type, logLevel, tag, timestamp, message };
}

export async function readMessageSynchronization(
  reader: ChunkedReader,
  header: MessageHeader,
): Promise<MessageSynchronization> {
  if (header.size !== 8) {
    throw new Error(`Invalid 'S' message, size is ${header.size} but expected 8`);
  }

  const syncMagic = await reader.readBytes(8);
  for (let i = 0; i < 8; i++) {
    if (syncMagic[i] !== SYNC_MAGIC[i]) {
      throw new Error(`Invalid 'S' message: ${toHex(syncMagic)}`);
    }
  }

  return { size: header.size, type: header.type, syncMagic: SYNC_MAGIC };
}

export async function readMessageDropout(
  reader: ChunkedReader,
  header: MessageHeader,
): Promise<MessageDropout> {
  if (header.size < 2) {
    throw new Error(`Invalid 'O' message, size is ${header.size} but expected at least 2`);
  }

  const duration = await reader.readUint16();
  return { size: header.size, type: header.type, duration };
}

export async function readMessageUnknown(
  reader: ChunkedReader,
  header: MessageHeader,
): Promise<MessageUnknown> {
  const data = await reader.readBytes(header.size);
  return { size: header.size, type: MessageType.Unknown, unknownType: header.type, data };
}
