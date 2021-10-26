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
  });
});
