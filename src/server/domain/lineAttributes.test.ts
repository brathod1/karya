import { describe, expect, it } from "vitest";
import { attributeSignature, formatLineAttributes, type AttributeDef } from "./lineAttributes";

const defs: AttributeDef[] = [
  { key: "colour", label: "Colour", type: "SELECT", options: [
    { value: "red", label: "Red" }, { value: "blue", label: "Blue" },
  ] },
  { key: "material", label: "Material", type: "SELECT", options: [
    { value: "cotton", label: "Cotton" }, { value: "silk", label: "Silk" },
  ] },
  { key: "country", label: "Country", type: "TEXT" },
];

describe("describing what to make", () => {
  it("reads back the chosen option labels, not their stored values", () => {
    expect(formatLineAttributes(defs, { colour: "red", material: "cotton" })).toBe("Red · Cotton");
  });

  it("keeps the configured order regardless of how the values were stored", () => {
    expect(formatLineAttributes(defs, { material: "silk", colour: "blue" })).toBe("Blue · Silk");
  });

  it("handles free text, like a flag's country", () => {
    expect(formatLineAttributes(defs, { country: "France" })).toBe("France");
  });

  it("skips anything not set", () => {
    expect(formatLineAttributes(defs, { colour: "red" })).toBe("Red");
    expect(formatLineAttributes(defs, {})).toBe("");
    expect(formatLineAttributes(defs, null)).toBe("");
  });

  it("falls back to the raw value if an option was removed from the configuration", () => {
    expect(formatLineAttributes(defs, { colour: "chartreuse" })).toBe("chartreuse");
  });
});

describe("grouping identical work together", () => {
  it("gives the same signature however the attributes were ordered", () => {
    expect(attributeSignature("Bandana", { colour: "red", material: "cotton" }))
      .toBe(attributeSignature("Bandana", { material: "cotton", colour: "red" }));
  });

  it("separates different variants of the same product", () => {
    expect(attributeSignature("Bandana", { colour: "red" }))
      .not.toBe(attributeSignature("Bandana", { colour: "blue" }));
  });

  it("separates different products", () => {
    expect(attributeSignature("Bandana", null)).not.toBe(attributeSignature("Flag", null));
  });

  it("treats a plain product with no attributes as itself", () => {
    expect(attributeSignature("Bandana", null)).toBe("Bandana");
    expect(attributeSignature("Bandana", {})).toBe("Bandana");
  });
});
