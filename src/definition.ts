const BUILTIN_TYPES = new Set([
  "int8_t",
  "uint8_t",
  "int16_t",
  "uint16_t",
  "int32_t",
  "uint32_t",
  "int64_t",
  "uint64_t",
  "float",
  "double",
  "bool",
  "char",
]);

export type Field = {
  type: string;
  name: string;
  isComplex: boolean;
  arrayLength?: number;
  size?: number;
};

export type MessageDefinition = {
  name: string;
  fields: Field[];
  format: string;
};

export function parseMessageDefinition(format: string): MessageDefinition | undefined {
  const [name, fieldStrings] = format.split(":");
  if (!name || !fieldStrings) {
    return undefined;
  }

  const fields: Field[] = [];

  for (const fieldString of fieldStrings.split(";")) {
    const trimmed = fieldString.trim();
    if (!trimmed) {
      continue;
    }
    const definition = parseFieldDefinition(trimmed);
    if (!definition) {
      return undefined;
    }
    fields.push(definition);
  }

  return { name, fields, format };
}

export function parseFieldDefinition(fieldString: string): Field | undefined {
  const [typeAndArray, name] = fieldString.split(" ");
  if (!typeAndArray || !name) {
    return undefined;
  }

  // Handle fixed length arrays as part of the type, e.g. "float[8]"
  const arrayMatch = /([^[]+)\[(\d+)\]/.exec(typeAndArray);
  if (arrayMatch) {
    const type = arrayMatch[1]!;
    const arrayLength = parseInt(arrayMatch[2]!);
    if (isNaN(arrayLength) || arrayLength <= 0) {
      return undefined;
    }
    return { type, name, arrayLength, isComplex: !BUILTIN_TYPES.has(type) };
  }

  const type = typeAndArray;
  return { type, name, isComplex: !BUILTIN_TYPES.has(type) };
}
