import path from "node:path";
import { describe, expect, test } from "vitest";
import { getLocalCorsDecision, isPathWithinRoot } from "../electron/security";

describe("local HTTP security", () => {
  test("allows loopback renderer origins and requests without a browser origin", () => {
    expect(getLocalCorsDecision("PUT", "http://127.0.0.1:51736")).toBe("allow");
    expect(getLocalCorsDecision("GET", "http://localhost:51736")).toBe("allow");
    expect(getLocalCorsDecision("POST", undefined)).toBe("omit");
  });

  test("rejects cross-site writes and preflight requests", () => {
    expect(getLocalCorsDecision("PUT", "https://example.com")).toBe("reject");
    expect(getLocalCorsDecision("OPTIONS", "https://example.com")).toBe("reject");
    expect(getLocalCorsDecision("GET", "https://example.com")).toBe("omit");
    expect(getLocalCorsDecision("PATCH", "null")).toBe("reject");
  });
});

describe("asset path containment", () => {
  const root = path.resolve("data", "assets", "avatars");

  test("accepts files under the requested asset root", () => {
    expect(isPathWithinRoot(root, path.join(root, "pet.png"))).toBe(true);
    expect(isPathWithinRoot(root, path.join(root, "nested", "pet.png"))).toBe(true);
  });

  test("rejects sibling paths that only share the root prefix", () => {
    expect(isPathWithinRoot(root, path.resolve(root, "../avatars-private/pet.png"))).toBe(false);
    expect(isPathWithinRoot(root, path.resolve(root, "../backgrounds/pet.png"))).toBe(false);
  });
});
