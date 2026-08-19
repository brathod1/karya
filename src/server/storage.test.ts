import { describe, expect, it } from "vitest";
import { ALLOWED_UPLOAD_TYPES, MAX_UPLOAD_BYTES, buildStorageKey, contentMatchesType, safeFileName } from "./storage";

describe("upload safety", () => {
  it("leaves an ordinary filename alone", () => {
    expect(safeFileName("receipt 2026.png")).toBe("receipt 2026.png");
    expect(safeFileName("yarn-invoice_04.pdf")).toBe("yarn-invoice_04.pdf");
  });

  it("makes any filename safe, whatever is thrown at it", () => {
    const hostile = [
      "../../etc/passwd",
      "..\\..\\windows\\system32\\config",
      "bill; rm -rf /.pdf",
      "C:\\Users\\me\\receipt.png",
      "....//....//secret",
      ".htaccess",
      "",
      "   ",
    ];
    for (const name of hostile) {
      const safe = safeFileName(name);
      expect(safe).not.toContain("/");
      expect(safe).not.toContain("\\");
      expect(safe.startsWith(".")).toBe(false);
      expect(safe.length).toBeGreaterThan(0);
      expect(safe.length).toBeLessThanOrEqual(120);
    }
  });

  it("namespaces every key by organisation, so a leaked key cannot cross tenants", () => {
    const key = buildStorageKey("org-1", "EXPENSE", "exp-9", "receipt.png");
    expect(key.startsWith("org-1/expense/exp-9/")).toBe(true);
    expect(key.endsWith("-receipt.png")).toBe(true);
  });

  it("gives every upload a unique key, so same-named files never collide", () => {
    const a = buildStorageKey("org-1", "EXPENSE", "exp-9", "receipt.png");
    const b = buildStorageKey("org-1", "EXPENSE", "exp-9", "receipt.png");
    expect(a).not.toBe(b);
  });

  it("allows only images and PDFs, and caps the size", () => {
    expect(Object.keys(ALLOWED_UPLOAD_TYPES).sort()).toEqual([
      "application/pdf", "image/gif", "image/heic", "image/jpeg", "image/png", "image/webp",
    ]);
    expect(ALLOWED_UPLOAD_TYPES["text/html"]).toBeUndefined();
    expect(ALLOWED_UPLOAD_TYPES["application/javascript"]).toBeUndefined();
    // Must stay under the 4.5 MB serverless request-body cap.
    expect(MAX_UPLOAD_BYTES).toBe(4 * 1024 * 1024);
    expect(MAX_UPLOAD_BYTES).toBeLessThan(4.5 * 1024 * 1024);
  });
});

describe("content sniffing — the browser's declared type is only a claim", () => {
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(16)]);
  const pdf = Buffer.concat([Buffer.from("%PDF-1.7"), Buffer.alloc(16)]);
  const html = Buffer.from("<html><script>alert(1)</script></html>");

  it("accepts files whose bytes match the declared type", () => {
    expect(contentMatchesType("image/png", png)).toBe(true);
    expect(contentMatchesType("application/pdf", pdf)).toBe(true);
  });

  it("rejects a script disguised as an image", () => {
    expect(contentMatchesType("image/png", html)).toBe(false);
    expect(contentMatchesType("application/pdf", html)).toBe(false);
  });

  it("rejects a type that is not on the allow-list at all", () => {
    expect(contentMatchesType("image/svg+xml", Buffer.from("<svg onload=alert(1)>"))).toBe(false);
    expect(contentMatchesType("text/html", html)).toBe(false);
  });

  it("rejects a truncated file that cannot be identified", () => {
    expect(contentMatchesType("image/png", Buffer.from([0x89, 0x50]))).toBe(false);
  });
});

describe("storage keys carry their tenant, which is what scopes the database driver", () => {
  it("puts the organisation first, so a key alone identifies its owner", () => {
    const key = buildStorageKey("11111111-2222-3333-4444-555555555555", "EXPENSE", "exp-1", "bill.pdf");
    expect(key.split("/")[0]).toBe("11111111-2222-3333-4444-555555555555");
  });

  it("keeps entity type and id in the path, so objects stay browsable", () => {
    const parts = buildStorageKey("org", "PRODUCT", "prod-7", "photo.png").split("/");
    expect(parts[1]).toBe("product");
    expect(parts[2]).toBe("prod-7");
  });
});
