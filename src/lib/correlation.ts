// Request correlation ID helpers (server + client friendly names, no server-only imports).
export function newRequestId(): string {
  // 128-bit hex; works in Worker (crypto.randomUUID) and Node
  const uuid = (globalThis.crypto ?? require("crypto")).randomUUID();
  return `req_${uuid.replace(/-/g, "")}`;
}

export const REQUEST_ID_HEADER = "x-request-id";
