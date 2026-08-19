import { describe, expect, it } from "vitest";
import {
  COMPRESSION_FLOOR_BYTES, MAX_IMAGE_EDGE, describeSaving, formatBytes,
  shouldCompress, targetDimensions,
} from "./image-compression";

describe("resizing a phone photograph", () => {
  it("scales a typical portrait phone photo to the long edge", () => {
    // 12MP phone camera, portrait
    expect(targetDimensions(3024, 4032)).toEqual({ width: 1200, height: 1600 });
  });

  it("scales landscape the same way, on whichever edge is longer", () => {
    expect(targetDimensions(4032, 3024)).toEqual({ width: 1600, height: 1200 });
  });

  it("preserves the aspect ratio", () => {
    const { width, height } = targetDimensions(4000, 3000);
    expect(width / height).toBeCloseTo(4000 / 3000, 5);
  });

  it("never upscales a small image", () => {
    expect(targetDimensions(800, 600)).toEqual({ width: 800, height: 600 });
    expect(targetDimensions(MAX_IMAGE_EDGE, 900)).toEqual({ width: MAX_IMAGE_EDGE, height: 900 });
  });

  it("handles extreme shapes without collapsing an edge to zero", () => {
    const { width, height } = targetDimensions(10000, 30);
    expect(width).toBe(MAX_IMAGE_EDGE);
    expect(height).toBeGreaterThanOrEqual(1);
  });

  it("copes with nonsense dimensions rather than throwing", () => {
    expect(targetDimensions(0, 0)).toEqual({ width: 0, height: 0 });
  });
});

describe("deciding what is worth compressing", () => {
  it("compresses large photographs", () => {
    expect(shouldCompress({ type: "image/jpeg", size: 3_200_000 })).toBe(true);
    expect(shouldCompress({ type: "image/png", size: 900_000 })).toBe(true);
  });

  it("leaves small images alone, where re-encoding tends to cost more than it saves", () => {
    expect(shouldCompress({ type: "image/jpeg", size: COMPRESSION_FLOOR_BYTES - 1 })).toBe(false);
  });

  it("never touches a PDF, or a format a canvas cannot decode", () => {
    expect(shouldCompress({ type: "application/pdf", size: 5_000_000 })).toBe(false);
    expect(shouldCompress({ type: "image/heic", size: 5_000_000 })).toBe(false);
  });
});

describe("reporting the saving", () => {
  it("reads the way a person would say it", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(184_320)).toBe("180 KB");
    expect(formatBytes(3_250_000)).toBe("3.1 MB");
    expect(describeSaving(3_250_000, 184_320)).toBe("3.1 MB → 180 KB");
  });

  it("says nothing when compression did not help", () => {
    expect(describeSaving(100_000, 100_000)).toBeNull();
    expect(describeSaving(100_000, 120_000)).toBeNull();
  });
});
