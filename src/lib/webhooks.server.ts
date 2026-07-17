// Server-only helpers for verifying incoming webhooks with timing-safe HMAC.
import { createHmac, timingSafeEqual } from "crypto";

export function verifyHmacSignature(params: {
  rawBody: string;
  signature: string | null | undefined;
  secret: string;
  algorithm?: "sha256" | "sha1";
}): boolean {
  const { rawBody, signature, secret, algorithm = "sha256" } = params;
  if (!signature) return false;
  const expected = createHmac(algorithm, secret).update(rawBody).digest("hex");
  // Support "sha256=<hex>" and raw hex signatures
  const provided = signature.includes("=") ? signature.split("=", 2)[1] : signature;
  const a = Buffer.from(provided, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(a, b);
}

export interface WebhookGuardResult {
  ok: boolean;
  status: number;
  reason?: string;
  requestId: string;
}

export function extractRequestId(request: Request): string {
  const incoming = request.headers.get("x-request-id");
  if (incoming && /^[a-zA-Z0-9_\-]{8,128}$/.test(incoming)) return incoming;
  return `req_${crypto.randomUUID().replace(/-/g, "")}`;
}
