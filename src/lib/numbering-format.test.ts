import { describe, expect, it } from "vitest";
import { extractSeq, lowestAvailable, renderNumber, splitPattern } from "@/lib/numbering-format";

const on2026 = new Date(2026, 2, 10);
const on2027 = new Date(2027, 2, 10);

const used = (...values: number[]) => new Set(values);

describe("lowestAvailable — new order takes the lowest free sequence", () => {
  it("no gaps: 1,2,3 → 4", () => {
    expect(lowestAvailable(used(1, 2, 3))).toBe(4);
  });

  it("middle gap: 1,2,4,5 → 3", () => {
    expect(lowestAvailable(used(1, 2, 4, 5))).toBe(3);
  });

  it("multiple gaps: 1,3,7 → 2 (lowest wins)", () => {
    expect(lowestAvailable(used(1, 3, 7))).toBe(2);
  });

  it("lowest deleted: 1,2,3 minus 1 → 1", () => {
    expect(lowestAvailable(used(2, 3))).toBe(1);
  });

  it("latest deleted: 1,2,3 minus 3 → 3", () => {
    expect(lowestAvailable(used(1, 2))).toBe(3);
  });

  it("multiple deleted: 1,2,3,4 minus 2 and 4 → 2", () => {
    expect(lowestAvailable(used(1, 3))).toBe(2);
  });

  it("empty set → 1", () => {
    expect(lowestAvailable(used())).toBe(1);
  });

  it("client's exact example: 10..15 minus 14 → 14, minus 14+15 → 14, minus 13+14+15 → 13", () => {
    // Sequences 1..9 were themselves deleted in this scenario, so 1 is genuinely
    // free — but with 1..9 still present the gap logic must land inside 10..15.
    const base = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    expect(lowestAvailable(new Set([...base, 10, 11, 12, 13, 15]))).toBe(14);
    expect(lowestAvailable(new Set([...base, 10, 11, 12, 13]))).toBe(14);
    expect(lowestAvailable(new Set([...base, 10, 11, 12]))).toBe(13);
  });
});

describe("splitPattern — period scoping comes from the rendered pattern", () => {
  it("splits the default yearly order pattern", () => {
    expect(splitPattern("{PREFIX}-{YYYY}-{SEQ:4}", "ORD", on2026)).toEqual({ before: "ORD-2026-", after: "", digits: 4 });
  });

  it("different years produce different scopes (2026 vs 2027 sequences are independent)", () => {
    const a = splitPattern("{PREFIX}-{YYYY}-{SEQ:4}", "ORD", on2026)!;
    const b = splitPattern("{PREFIX}-{YYYY}-{SEQ:4}", "ORD", on2027)!;
    expect(a.before).not.toBe(b.before);
    expect(extractSeq("ORD-2027-0001", a)).toBeNull(); // a 2027 number never occupies a 2026 slot
    expect(extractSeq("ORD-2026-0001", b)).toBeNull();
  });

  it("handles month tokens and text after the sequence", () => {
    expect(splitPattern("{PREFIX}-{YY}{MM}-{SEQ:4}", "ORD", on2026)).toEqual({ before: "ORD-2603-", after: "", digits: 4 });
    expect(splitPattern("{PREFIX}/{SEQ:3}/K", "ORD", on2026)).toEqual({ before: "ORD/", after: "/K", digits: 3 });
  });

  it("returns null when the pattern has no {SEQ} token", () => {
    expect(splitPattern("{PREFIX}-{YYYY}", "ORD", on2026)).toBeNull();
  });
});

describe("extractSeq — only numbers of this pattern and period count as taken", () => {
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

describe("allocation round-trip — extract, fill the gap, render", () => {
  it("renders the filled gap in the unchanged visible format", () => {
    const parts = splitPattern("{PREFIX}-{YYYY}-{SEQ:4}", "ORD", on2026)!;
    const existing = ["ORD-2026-0010", "ORD-2026-0011", "ORD-2026-0012", "ORD-2026-0013", "ORD-2026-0015"];
    const taken = new Set(existing.map((n) => extractSeq(n, parts)!));
    for (let i = 1; i <= 9; i++) taken.add(i); // 1..9 also in use
    const value = lowestAvailable(taken);
    expect(value).toBe(14);
    expect(renderNumber("{PREFIX}-{YYYY}-{SEQ:4}", "ORD", value, on2026)).toBe("ORD-2026-0014");
  });

  it("two businesses never share a pool (each org's used-set is queried per org)", () => {
    const parts = splitPattern("{PREFIX}-{YYYY}-{SEQ:4}", "ORD", on2026)!;
    const orgA = new Set([extractSeq("ORD-2026-0001", parts)!]);
    const orgB = new Set<number>();
    expect(lowestAvailable(orgA)).toBe(2);
    expect(lowestAvailable(orgB)).toBe(1); // B happily issues ORD-2026-0001 too
  });
});
