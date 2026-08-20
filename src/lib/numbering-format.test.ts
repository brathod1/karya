import { describe, expect, it } from "vitest";
import { extractSeq, nextSequenceValue, renderNumber, splitPattern } from "@/lib/numbering-format";

const on2026 = new Date(2026, 2, 10);
const on2027 = new Date(2027, 2, 10);

const used = (...values: number[]) => new Set(values);

describe("nextSequenceValue — numbers are never reused", () => {
  // counter = the stored "next value to issue" (highest ever issued + 1)

  it("orders 1..10 exist, #5 deleted → next is 11, not 5", () => {
    expect(nextSequenceValue(11, used(1, 2, 3, 4, 6, 7, 8, 9, 10))).toBe(11);
  });

  it("latest deleted: 1..10 exist, #10 deleted → next is 11, not 10", () => {
    expect(nextSequenceValue(11, used(1, 2, 3, 4, 5, 6, 7, 8, 9))).toBe(11);
  });

  it("multiple deleted: #2, #5, #8 gone → next is still 11, then 12, 13…", () => {
    const remaining = used(1, 3, 4, 6, 7, 9, 10);
    expect(nextSequenceValue(11, remaining)).toBe(11);
    expect(nextSequenceValue(12, new Set([...remaining, 11]))).toBe(12);
    expect(nextSequenceValue(13, new Set([...remaining, 11, 12]))).toBe(13);
  });

  it("client's exact case: orders up to 47, #37 deleted → next is 48", () => {
    const existing = new Set(Array.from({ length: 47 }, (_, i) => i + 1));
    existing.delete(37);
    expect(nextSequenceValue(48, existing)).toBe(48);
  });

  it("gaps are never searched: 1, 3, 7 with counter 8 → 8", () => {
    expect(nextSequenceValue(8, used(1, 3, 7))).toBe(8);
  });

  it("self-heals a counter that fell behind existing orders", () => {
    // The short-lived gap-reuse deployment could leave the counter below the
    // highest existing order; the max-scan floor pulls allocation above it.
    expect(nextSequenceValue(38, used(1, 2, 45, 46, 47))).toBe(48);
    // Counter also heals past numbers consumed by deleted orders it remembers:
    expect(nextSequenceValue(48, used(1, 2, 3))).toBe(48);
  });

  it("fresh sequence with no orders → 1", () => {
    expect(nextSequenceValue(1, used())).toBe(1);
  });
});

describe("splitPattern — period scoping comes from the rendered pattern", () => {
  it("splits the default yearly order pattern", () => {
    expect(splitPattern("{PREFIX}-{YYYY}-{SEQ:4}", "ORD", on2026)).toEqual({ before: "ORD-2026-", after: "", digits: 4 });
  });

  it("different years produce independent scopes (2027 restarts at 0001)", () => {
    const a = splitPattern("{PREFIX}-{YYYY}-{SEQ:4}", "ORD", on2026)!;
    const b = splitPattern("{PREFIX}-{YYYY}-{SEQ:4}", "ORD", on2027)!;
    expect(a.before).not.toBe(b.before);
    expect(extractSeq("ORD-2027-0001", a)).toBeNull(); // 2027 numbers invisible to the 2026 scan
    expect(extractSeq("ORD-2026-0099", b)).toBeNull(); // and vice versa
  });

  it("handles month tokens and text after the sequence", () => {
    expect(splitPattern("{PREFIX}-{YY}{MM}-{SEQ:4}", "ORD", on2026)).toEqual({ before: "ORD-2603-", after: "", digits: 4 });
    expect(splitPattern("{PREFIX}/{SEQ:3}/K", "ORD", on2026)).toEqual({ before: "ORD/", after: "/K", digits: 3 });
  });

  it("returns null when the pattern has no {SEQ} token", () => {
    expect(splitPattern("{PREFIX}-{YYYY}", "ORD", on2026)).toBeNull();
  });
});

describe("extractSeq — only numbers of this pattern and period count", () => {
  const parts = splitPattern("{PREFIX}-{YYYY}-{SEQ:4}", "ORD", on2026)!;

  it("reads the sequence out of a well-formed number", () => {
    expect(extractSeq("ORD-2026-0014", parts)).toBe(14);
    expect(extractSeq("ORD-2026-0001", parts)).toBe(1);
    expect(extractSeq("ORD-2026-12345", parts)).toBe(12345); // outgrew its padding
  });

  it("ignores other years, other prefixes, and foreign formats", () => {
    expect(extractSeq("ORD-2027-0014", parts)).toBeNull();
    expect(extractSeq("INV-2026-0014", parts)).toBeNull();
    expect(extractSeq("ORD-2026-", parts)).toBeNull();
    expect(extractSeq("ORD-2026-14b", parts)).toBeNull(); // imported serial junk
    expect(extractSeq("legacy-777", parts)).toBeNull();
  });

  it("respects a suffix after the sequence", () => {
    const p = splitPattern("{PREFIX}/{SEQ:3}/K", "ORD", on2026)!;
    expect(extractSeq("ORD/007/K", p)).toBe(7);
    expect(extractSeq("ORD/007/X", p)).toBeNull();
  });
});

describe("allocation round-trip — scan, advance, render", () => {
  it("renders strictly increasing numbers in the unchanged visible format", () => {
    const parts = splitPattern("{PREFIX}-{YYYY}-{SEQ:4}", "ORD", on2026)!;
    const existing = ["ORD-2026-0045", "ORD-2026-0046", "ORD-2026-0047"];
    const taken = new Set(existing.map((n) => extractSeq(n, parts)!));
    const value = nextSequenceValue(48, taken);
    expect(value).toBe(48);
    expect(renderNumber("{PREFIX}-{YYYY}-{SEQ:4}", "ORD", value, on2026)).toBe("ORD-2026-0048");
  });

  it("two businesses have fully independent sequences", () => {
    const parts = splitPattern("{PREFIX}-{YYYY}-{SEQ:4}", "ORD", on2026)!;
    const orgA = new Set([extractSeq("ORD-2026-0047", parts)!]);
    const orgB = new Set<number>();
    expect(nextSequenceValue(48, orgA)).toBe(48);
    expect(nextSequenceValue(1, orgB)).toBe(1); // B starts at ORD-2026-0001 regardless of A
  });
});
