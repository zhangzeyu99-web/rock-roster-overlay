import path from "node:path";

export type LocalCorsDecision = "allow" | "omit" | "reject";

const stateChangingMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function getLocalCorsDecision(method: string, origin: string | undefined): LocalCorsDecision {
  if (!origin) {
    return "omit";
  }
  if (isAllowedLoopbackOrigin(origin)) {
    return "allow";
  }
  return method.toUpperCase() === "OPTIONS" || stateChangingMethods.has(method.toUpperCase())
    ? "reject"
    : "omit";
}

export function isPathWithinRoot(root: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return (
    relative === "" ||
    (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`))
  );
}

function isAllowedLoopbackOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return url.protocol === "http:" && (url.hostname === "127.0.0.1" || url.hostname === "localhost");
  } catch {
    return false;
  }
}
