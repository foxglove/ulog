import { parseMessageDefinition, parseFieldDefinition } from "./definition";

describe("definition", () => {
  it("parseFieldDefinition", async () => {
    let field = parseFieldDefinition("");
    expect(field).toBeUndefined();
    field = parseFieldDefinition("uint8_t");
    expect(field).toBeUndefined();
    field = parseFieldDefinition("uint8_t foo")!;
    expect(field).toBeDefined();
    expect(field.type).toBe("uint8_t");
    expect(field.name).toBe("foo");
  });

  it("parseMessageDefinition", async () => {
    const msgdef = parseMessageDefinition(
      "esc_status:uint64_t timestamp;uint16_t counter;uint8_t esc_count;uint8_t esc_connectiontype;uint8_t[4] _padding0;esc_report[8] esc;",
    )!;
    expect(msgdef).toBeDefined();
    expect(msgdef.name).toBe("esc_status");
    expect(msgdef.fields.length).toBe(6);
    expect(msgdef.fields[0]!.type).toBe("uint64_t");
    expect(msgdef.fields[0]!.name).toBe("timestamp");
    expect(msgdef.fields[1]!.type).toBe("uint16_t");
    expect(msgdef.fields[1]!.name).toBe("counter");
    expect(msgdef.fields[2]!.type).toBe("uint8_t");
    expect(msgdef.fields[2]!.name).toBe("esc_count");
    expect(msgdef.fields[3]!.type).toBe("uint8_t");
    expect(msgdef.fields[3]!.name).toBe("esc_connectiontype");
    expect(msgdef.fields[4]!.type).toBe("uint8_t");
    expect(msgdef.fields[4]!.arrayLength).toBe(4);
    expect(msgdef.fields[4]!.name).toBe("_padding0");
    expect(msgdef.fields[5]!.type).toBe("esc_report");
    expect(msgdef.fields[5]!.name).toBe("esc");
    expect(msgdef.fields[5]!.arrayLength).toBe(8);
  });
});
