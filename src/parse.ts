import { Field, MessageDefinition } from "./definition";
import { BuiltinType } from "./enums";
import { FieldPrimitive, FieldStruct, FieldValue, ParsedMessage } from "./messages";

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
    curOffset += fieldSize(field, definitions);
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
    }

    return parseMessage(definition, definitions, view, offset);
  }

  return parseBasicFieldValue(field, view, offset);
}

export function parseBasicFieldValue(field: Field, view: DataView, offset = 0): FieldPrimitive {
  const basicType = field.type as BuiltinType;

  if (field.arrayLength != undefined) {
    // String handling
    if (field.type === "char") {
      const len = Math.min(field.arrayLength, view.byteLength - offset);
      const byteOffset = view.byteOffset + offset;
      return textDecoder.decode(new Uint8Array(view.buffer, byteOffset, len));
    }

    const basicSize = basicFieldSize(basicType, undefined);
    const output = new Array<FieldPrimitive>();
    for (let i = 0; i < field.arrayLength; i++) {
      output[i] = parseBasic(basicType, view, offset + i * basicSize);
    }
    return output;
  }

  return parseBasic(basicType, view, offset);
}

function parseBasic(
  fieldType: BuiltinType,
  view: DataView,
  offset: number,
): string | number | bigint | boolean {
  switch (fieldType) {
    case "bool":
      return view.getUint8(offset) !== 0;
    case "int8_t":
      return view.getInt8(offset);
    case "uint8_t":
      return view.getUint8(offset);
    case "int16_t":
      return view.getInt16(offset, true);
    case "uint16_t":
      return view.getUint16(offset, true);
    case "int32_t":
      return view.getInt32(offset, true);
    case "uint32_t":
      return view.getUint32(offset, true);
    case "int64_t":
      return view.getBigInt64(offset, true);
    case "uint64_t":
      return view.getBigUint64(offset, true);
    case "float":
      return view.getFloat32(offset, true);
    case "double":
      return view.getFloat64(offset, true);
    case "char":
      return String.fromCharCode(view.getUint8(offset));
    default:
      throw new Error(`Unrecognized basic type "${fieldType as string}"`);
  }
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
    field.size = basicFieldSize(field.type as BuiltinType, field.arrayLength);
  }

  return field.size;
}

export function basicFieldSize(type: BuiltinType, arrayLength: number | undefined): number {
  switch (type) {
    case "bool":
    case "int8_t":
    case "uint8_t":
    case "char":
      return arrayLength ?? 1;
    case "int16_t":
    case "uint16_t":
      return 2 * (arrayLength ?? 1);
    case "int32_t":
    case "uint32_t":
    case "float":
      return 4 * (arrayLength ?? 1);
    case "int64_t":
    case "uint64_t":
    case "double":
      return 8 * (arrayLength ?? 1);
    default:
      throw new Error(`Unrecognized basic type "${type as string}"`);
  }
}
