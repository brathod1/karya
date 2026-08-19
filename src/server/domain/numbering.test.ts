import { describe, expect, it } from "vitest";
import { renderNumber } from "@/lib/numbering-format";

describe("human-readable numbering (requirement 35)", () => {
  const on = new Date(2026, 7, 18);

  it("renders the documented formats", () => {
    expect(renderNumber("{PREFIX}-{YYYY}-{SEQ:4}", "ORD", 42, on)).toBe("ORD-2026-0042");
    expect(renderNumber("{PREFIX}-{SEQ:5}", "CUS", 42, on)).toBe("CUS-00042");
    expect(renderNumber("{PREFIX}-{SEQ:5}", "EXP", 18, on)).toBe("EXP-00018");
    expect(renderNumber("{PREFIX}-{SEQ:5}", "EVT", 7, on)).toBe("EVT-00007");
  });

  it("supports short year and month tokens", () => {
    expect(renderNumber("{PREFIX}-{YY}{MM}-{SEQ:4}", "ORD", 5, on)).toBe("ORD-2608-0005");
  });

  it("does not truncate a sequence that outgrows its padding", () => {
    expect(renderNumber("{PREFIX}-{SEQ:3}", "ORD", 12345, on)).toBe("ORD-12345");
  });
});
