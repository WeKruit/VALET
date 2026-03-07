import { describe, expect, it } from "vitest";
import {
  ManagedRuntimeAuthError,
  createManagedRuntimeGrant,
  hashManagedRuntimeGrant,
  normalizeManagedRuntimeGrant,
} from "../llm-runtime-auth.js";

describe("llm-runtime-auth", () => {
  it("creates opaque managed runtime grants", () => {
    const grant = createManagedRuntimeGrant();

    expect(grant).toMatch(/^lwrg_v1_[A-Za-z0-9_-]+$/);
  });

  it("normalizes managed runtime grants", () => {
    const grant = createManagedRuntimeGrant();

    expect(normalizeManagedRuntimeGrant(`  ${grant}  `)).toBe(grant);
  });

  it("rejects malformed managed runtime grants", () => {
    expect(() => normalizeManagedRuntimeGrant("bad-token")).toThrow(
      "Missing managed runtime grant prefix",
    );
  });

  it("hashes normalized managed runtime grants deterministically", () => {
    const grant = createManagedRuntimeGrant();

    expect(hashManagedRuntimeGrant(grant)).toBe(hashManagedRuntimeGrant(` ${grant} `));
  });

  it("throws a managed auth error for malformed grants", () => {
    expect(() => normalizeManagedRuntimeGrant("lwrg_v1_")).toThrow(ManagedRuntimeAuthError);
  });
});
