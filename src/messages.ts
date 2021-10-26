import { MessageType, LogLevel } from "./enums";

export type SyncMagic = [0x2f, 0x73, 0x13, 0x20, 0x25, 0x0c, 0xbb, 0x12];
export type BitFlags = [number, number, number, number, number, number, number, number];

export type MessageFlagBits = {
  size: number;
  type: MessageType.FlagBits;
  compatibleFlags: BitFlags;
  incompatibleFlags: BitFlags;
  appendedOffsets: [bigint, bigint, bigint]; // File offset(s) for appended data if appending bit is set
};

export type MessageInformation = {
  size: number;
  type: MessageType.Information;
  key: string;
  value: Uint8Array;
};

export type MessageInformationMulti = {
  size: number;
  type: MessageType.InformationMulti;
  isContinued: boolean;
  key: string;
  value: Uint8Array;
};

export type MessageFormatDefinition = {
  size: number;
  type: MessageType.FormatDefinition;
  format: string;
};

export type MessageParameter = {
  size: number;
  type: MessageType.Parameter;
  key: string;
  value: Uint8Array;
};

export type MessageParameterDefault = {
  size: number;
  type: MessageType.ParameterDefault;
  defaultTypes: number;
  key: string;
  value: Uint8Array;
};

export type MessageAddLogged = {
  size: number;
  type: MessageType.AddLogged;
  multiId: number;
  msgId: number;
  messageName: string;
};

export type MessageRemoveLogged = {
  size: number;
  type: MessageType.AddLogged;
  msgId: number;
};

export type MessageData = {
  size: number;
  type: MessageType.Data;
  msgId: number;
  data: Uint8Array;
};

export type MessageLog = {
  size: number;
  type: MessageType.Log;
  logLevel: LogLevel;
  timestamp: bigint; // [μs]
  message: string;
};

export type MessageLogTagged = {
  size: number;
  type: MessageType.LogTagged;
  logLevel: LogLevel;
  tag: number;
  timestamp: bigint; // [μs]
  message: string;
};

export type MessageSynchronization = {
  size: number;
  type: MessageType.Synchronization;
  syncMagic: SyncMagic;
};

export type MessageDropout = {
  size: number;
  type: MessageType.Dropout;
  duration: number; // [ms]
};

export type MessageUnknown = {
  size: number;
  type: number;
  data: Uint8Array;
};

export type Message =
  | MessageFlagBits
  | MessageInformation
  | MessageInformationMulti
  | MessageFormatDefinition
  | MessageParameter
  | MessageParameterDefault
  | MessageAddLogged
  | MessageRemoveLogged
  | MessageData
  | MessageLog
  | MessageLogTagged
  | MessageSynchronization
  | MessageDropout
  | MessageUnknown;
