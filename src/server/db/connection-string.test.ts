import { describe, expect, it } from "vitest";
import { normaliseConnectionString } from "./connection-string";

/**
 * `pg` already treats `require` as `verify-full`; stating it explicitly keeps
 * today's behaviour, stops the deprecation warning, and stops a future `pg`
 * release from silently weakening the connection.
 */
describe("connection string SSL mode", () => {
  it("makes the implied verification explicit", () => {
    expect(normaliseConnectionString("postgresql://u:p@host/db?sslmode=require"))
      .toBe("postgresql://u:p@host/db?sslmode=verify-full");
  });

  it("handles the other aliased modes", () => {
    expect(normaliseConnectionString("postgres://h/db?sslmode=prefer")).toContain("sslmode=verify-full");
    expect(normaliseConnectionString("postgres://h/db?sslmode=verify-ca")).toContain("sslmode=verify-full");
  });

  it("leaves a deliberate choice untouched", () => {
    const libpq = "postgres://h/db?uselibpqcompat=true&sslmode=require";
    expect(normaliseConnectionString(libpq)).toBe(libpq);

    const disabled = "postgres://h/db?sslmode=disable";
    expect(normaliseConnectionString(disabled)).toBe(disabled);
  });

  it("leaves a plain local connection alone", () => {
    const local = "postgresql://postgres:postgres@localhost:5432/karya";
    expect(normaliseConnectionString(local)).toBe(local);
  });

  it("keeps other parameters intact", () => {
    expect(normaliseConnectionString("postgres://h/db?sslmode=require&application_name=karya"))
      .toBe("postgres://h/db?sslmode=verify-full&application_name=karya");
  });
});
