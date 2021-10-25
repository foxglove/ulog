import { ChunkedReader } from "./ChunkedReader";
import { Filelike } from "./types";

const MAGIC = [0x55, 0x4c, 0x6f, 0x67, 0x01, 0x12, 0x35];

enum MessageType {
  FlagBits = 0x42, // 'B'
  Information = 0x49, // 'I'
  FormatDefinition = 0x46, // 'F'
  InformationMulti = 0x4d, // 'M'
  Parameter = 0x50, // 'P'
  ParameterDefault = 0x51, // 'Q'
  Subscribe = 0x41, // 'A'
  Unsubscribe = 0x52, // 'R'
  Data = 0x44, // 'D'
  Log = 0x4c, // 'L'
  LogTagged = 0x43, // 'C'
  Synchronization = 0x53, // 'S'
  Dropout = 0x4f, // 'O'
}

enum CompatibleFlags {
  DefaultParameters = 1,
}

enum IncompatibleFlags {
  AppendedData = 1,
}

type ULogHeader = {
  version: number;
  timestamp: bigint;
  flagBits?: MessageFlagBits;
};

type MessageHeader = {
  size: number;
  type: number;
};

type MessageUnknown = {
  size: number;
  type: number;
  data: Uint8Array;
};

type MessageFlagBits = {
  size: number;
  type: MessageType.FlagBits;
  compatibleFlags: CompatibleFlags;
  incompatibleFlags: IncompatibleFlags;
  appendedOffsets: [bigint, bigint, bigint]; // File offset(s) for appended data if appending bit is set
};

export type Message = MessageUnknown | MessageFlagBits;

export class ULog {
  private _reader: ChunkedReader;

  constructor(filelike: Filelike) {
    this._reader = new ChunkedReader(filelike);
  }

  async open(): Promise<ULogHeader> {
    const data = await this._reader.readBytes(8);
    for (let i = 0; i < MAGIC.length; i++) {
      if (data[i] !== MAGIC[i]) {
        throw new Error("Invalid ULog header, magic mismatch");
      }
    }

    const version = data[7]!;
    const timestamp = await this._reader.readUint64();

    if (version === 0) {
      return { version, timestamp };
    }

    const firstMsg = await this.readMessage();
    if (!firstMsg || firstMsg.type !== MessageType.FlagBits) {
      throw new Error(
        `Unexpected first message type ${firstMsg?.type ?? "-1"}, expected ${MessageType.FlagBits}`,
      );
    }

    return { version, timestamp, flagBits: firstMsg as MessageFlagBits };
  }

  async readMessage(): Promise<Message | undefined> {
    if (this._reader.remaining() < 3) {
      return undefined;
    }

    const header = await this.readMessageHeader();
    switch (header.type) {
      case MessageType.FlagBits:
        return await this.readMessageFlagBits(header);
      case MessageType.Information:
      case MessageType.FormatDefinition:
      case MessageType.InformationMulti:
      case MessageType.Parameter:
      case MessageType.ParameterDefault:
      case MessageType.Subscribe:
      case MessageType.Unsubscribe:
      case MessageType.Data:
      case MessageType.Log:
      case MessageType.LogTagged:
      case MessageType.Synchronization:
      case MessageType.Dropout:
      default:
        return await this.readMessageUnknown(header);
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
      compatibleFlags: compatFlags[0] as CompatibleFlags,
      incompatibleFlags: incompatFlags[0] as IncompatibleFlags,
      appendedOffsets: [
        await this._reader.readUint64(),
        await this._reader.readUint64(),
        await this._reader.readUint64(),
      ],
    };
  }

  private async readMessageUnknown(header: MessageHeader): Promise<MessageUnknown> {
    return {
      size: header.size,
      type: header.type,
      data: await this._reader.readBytes(header.size),
    };
  }
}
