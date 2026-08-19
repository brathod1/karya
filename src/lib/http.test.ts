import { describe, expect, it } from "vitest";
import { contentDisposition } from "./http";

/** Throws exactly as the Response constructor would on a non-Latin-1 header. */
const mustBeAValidHeader = (value: string) =>
  expect(() => new Headers({ "Content-Disposition": value })).not.toThrow();

describe("Content-Disposition for real-world filenames", () => {
  it("survives a Devanagari filename, which is routine for these users", () => {
    const header = contentDisposition("ऑर्डर-bill.pdf");
    mustBeAValidHeader(header);
    expect(header).toContain("filename*=UTF-8''");
    expect(header).toContain("%E0%A4%91");
  });

  it("leaves an ordinary filename readable", () => {
    expect(contentDisposition("receipt.pdf")).toContain('filename="receipt.pdf"');
  });

  it("cannot be used to inject extra headers", () => {
    const header = contentDisposition('evil"\r\nSet-Cookie: a=b.png');
    mustBeAValidHeader(header);
    expect(header).not.toContain("\r");
    expect(header).not.toContain("\n");
    expect(header.match(/"/g)?.length).toBe(2);
  });

  it("never produces an empty filename", () => {
    expect(contentDisposition("　")).toContain('filename="file"');
  });
});
