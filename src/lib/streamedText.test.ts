import { describe, expect, it } from "vitest";
import { streamedTextField } from "./streamedText";

describe("streamedTextField", () => {
  it("reads nothing before the text field starts", () => {
    expect(streamedTextField("")).toBe("");
    expect(streamedTextField('{"te')).toBe("");
    expect(streamedTextField('{"text": ')).toBe("");
  });

  it("reads an unfinished string as far as it got", () => {
    expect(streamedTextField('{"text": "Hel')).toBe("Hel");
    expect(streamedTextField('{"text":"Fresh bread, still warm')).toBe("Fresh bread, still warm");
  });

  it("stops at the closing quote of a finished string", () => {
    expect(streamedTextField('{"text": "Hello!", "offers": ["sell_bread"]}')).toBe("Hello!");
  });

  it("decodes escapes, waiting for ones cut in half", () => {
    expect(streamedTextField('{"text": "She said \\"hi\\"\\nthen left')).toBe('She said "hi"\nthen left');
    expect(streamedTextField('{"text": "caf\\u00e9 time')).toBe("café time");
    expect(streamedTextField('{"text": "caf\\u00')).toBe("caf");
    expect(streamedTextField('{"text": "end\\')).toBe("end");
  });

  it("finds the text field even after other fields", () => {
    expect(streamedTextField('{"offers": [], "text": "Later field')).toBe("Later field");
  });

  it("shows plain prose as is", () => {
    expect(streamedTextField("  Just pulled the loaves out.")).toBe("Just pulled the loaves out.");
  });
});
