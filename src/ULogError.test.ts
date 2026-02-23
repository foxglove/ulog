import { ULogError } from "./ULogError";

describe("ULogError", () => {
  it("has name 'ULogError'", () => {
    const error = new ULogError("test message");
    expect(error.name).toBe("ULogError");
    expect(error.message).toBe("test message");
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ULogError);
  });

  it("supports cause option", () => {
    const cause = new Error("underlying issue");
    const error = new ULogError("wrapper", { cause });
    expect(error.cause).toBe(cause);
  });

  describe("is()", () => {
    it("returns true for ULogError instances", () => {
      expect(ULogError.is(new ULogError("test"))).toBe(true);
    });

    it("returns true for Error with name 'ULogError' (cross-worker boundary)", () => {
      const error = new Error("deserialized");
      error.name = "ULogError";
      expect(ULogError.is(error)).toBe(true);
    });

    it("returns false for regular Error", () => {
      expect(ULogError.is(new Error("nope"))).toBe(false);
    });

    it("returns false for non-Error values", () => {
      expect(ULogError.is("string")).toBe(false);
      expect(ULogError.is(null)).toBe(false);
      expect(ULogError.is(undefined)).toBe(false);
    });
  });
});
