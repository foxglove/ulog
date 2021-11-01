import { Field, MessageDefinition } from "./definition";
import { BuiltinType } from "./enums";
import { FieldPrimitive, FieldStruct, FieldValue, ParsedMessage } from "./messages";

const BASIC_PARSERS = {
  bool: (view: DataView, offset: number) => view.getUint8(offset) !== 0,
  int8_t: (view: DataView, offset: number) => view.getInt8(offset),
  uint8_t: (view: DataView, offset: number) => view.getUint8(offset),
  int16_t: (view: DataView, offset: number) => view.getInt16(offset, true),
  uint16_t: (view: DataView, offset: number) => view.getUint16(offset, true),
  int32_t: (view: DataView, offset: number) => view.getInt32(offset, true),
  uint32_t: (view: DataView, offset: number) => view.getUint32(offset, true),
  int64_t: (view: DataView, offset: number) => view.getBigInt64(offset, true),
  uint64_t: (view: DataView, offset: number) => view.getBigUint64(offset, true),
  float: (view: DataView, offset: number) => view.getFloat32(offset, true),
  double: (view: DataView, offset: number) => view.getFloat64(offset, true),
  char: (view: DataView, offset: number) => String.fromCharCode(view.getUint8(offset)),
};

const BASIC_SIZES = {
  bool: 1,
  int8_t: 1,
  uint8_t: 1,
  int16_t: 2,
  uint16_t: 2,
  int32_t: 4,
  uint32_t: 4,
  int64_t: 8,
  uint64_t: 8,
  float: 4,
  double: 8,
  char: 1,
};

const textDecoder = new TextDecoder();

export function parseMessage(
  definition: MessageDefinition,
  definitions: Map<string, MessageDefinition>,
  view: DataView,
  offset = 0,
): ParsedMessage {
  const output: FieldStruct = {};
  let curOffset = offset;
  for (const field of definition.fields) {
    if (field.name.startsWith("_")) {
      continue;
    }
    output[field.name] = parseFieldValue(field, definitions, view, curOffset);
    curOffset += fieldSize(field, definitions) * (field.arrayLength ?? 1);
  }
  if (typeof output.timestamp !== "bigint") {
    throw new Error(`Message "${definition.name}" is missing a timestamp field`);
  }
  return output as ParsedMessage;
}

export function parseFieldValue(
  field: Field,
  definitions: Map<string, MessageDefinition>,
  view: DataView,
  offset = 0,
): FieldValue {
  if (field.isComplex) {
    const definition = definitions.get(field.type);
    if (!definition) {
      throw new Error(`Unknown type ${field.type}, searched ${definitions.size} definitions`);
    }
    if (field.arrayLength != undefined) {
      const size = fieldSize(field, definitions);
      const output = new Array<FieldStruct>(field.arrayLength);
      for (let i = 0; i < field.arrayLength; i++) {
        output[i] = parseMessage(definition, definitions, view, offset + i * size);
      }
      return output;
    }

    return parseMessage(definition, definitions, view, offset);
  }

  return parseBasicFieldValue(field, view, offset);
}

export function parseBasicFieldValue(field: Field, view: DataView, offset = 0): FieldPrimitive {
  const basicType = field.type as BuiltinType;
  const parser = BASIC_PARSERS[basicType];

  if (field.arrayLength != undefined) {
    // String handling
    if (field.type === "char") {
      const len = Math.min(field.arrayLength, view.byteLength - offset);
      const byteOffset = view.byteOffset + offset;
      return textDecoder.decode(new Uint8Array(view.buffer, byteOffset, len));
    }

    const basicSize = BASIC_SIZES[basicType];
    const output = new Array<FieldPrimitive>(field.arrayLength);
    for (let i = 0; i < field.arrayLength; i++) {
      output[i] = parser(view, offset + i * basicSize);
    }
    return output;
  }

  return parser(view, offset);
}

export function messageSize(
  definition: MessageDefinition,
  definitions: Map<string, MessageDefinition>,
): number {
  return definition.fields.reduce((size, f) => size + fieldSize(f, definitions), 0);
}

export function fieldSize(field: Field, definitions: Map<string, MessageDefinition>): number {
  if (field.size != undefined) {
    return field.size;
  }

  if (field.isComplex) {
    const definition = definitions.get(field.type);
    if (!definition) {
      throw new Error(`Unknown type ${field.type}, searched ${definitions.size} definitions`);
    }
    field.size = messageSize(definition, definitions);
  } else {
    field.size = BASIC_SIZES[field.type as BuiltinType];
  }

  return field.size;
}
