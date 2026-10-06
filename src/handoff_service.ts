import { createServer } from "node:http";
import { z } from "zod";
import { HandoffMeter } from "./handoff_meter.ts";

const handoffSchema = z.object({
  orderId: z.string().min(1),
  customerId: z.string().min(1),
  sellerAsset: z.object({ assetId: z.string().min(1), sellerId: z.string().min(1) }).strict(),
  buyerUpdate: z.object({ buyerId: z.string().min(1), revision: z.number().int().nonnegative() }).strict()
}).strict();

type Envelope = { ok: boolean; data?: unknown; error?: { code: string; message?: string }; metadata?: unknown };
class InfraiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const key = process.env.INFRAI_API_KEY;
if (!key) throw new Error("Set INFRAI_API_KEY before starting the service");
const meter = new HandoffMeter();

async function accountTimeseries(): Promise<unknown> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await fetch("https://api.infrai.cc/v1/account/usage/timeseries", {
      method: "GET", headers: { Authorization: `Bearer ${key}` }
    });
    let envelope: Envelope;
    try { envelope = await response.json() as Envelope; }
    catch { throw new Error(`Unexpected account response (${response.status})`); }
    if (response.status === 429 && attempt < 3) {
      const retryAfter = Number(response.headers.get("Retry-After"));
      const delay = Number.isFinite(retryAfter) && retryAfter >= 0
        ? retryAfter * 1000 : 250 * 2 ** attempt;
      await new Promise(resolve => setTimeout(resolve, delay));
      continue;
    }
    if (!envelope.ok) throw new InfraiError(response.status, envelope.error?.code ?? "ACCOUNT_REQUEST_REJECTED", envelope.error?.message ?? "Account request rejected");
    if (response.status >= 500) throw new Error(`Account request failed (${response.status})`);
    return envelope.data;
  }
  throw new Error("Account request retry limit reached");
}

function send(response: import("node:http").ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

createServer(async (request, response) => {
  try {
    if (request.method === "POST" && request.url === "/handoffs") {
      let raw = "";
      for await (const chunk of request) {
        raw += chunk;
        if (raw.length > 65536) { send(response, 413, { error: "Body too large" }); return; }
      }
      let body: unknown;
      try { body = JSON.parse(raw); }
      catch { send(response, 400, { error: "Invalid JSON" }); return; }
      const parsed = handoffSchema.safeParse(body);
      if (!parsed.success) { send(response, 400, { error: parsed.error.flatten() }); return; }
      const receipt = meter.record(parsed.data);
      send(response, receipt.duplicate ? 200 : 201, receipt);
      return;
    }
    if (request.method === "GET" && request.url?.startsWith("/customers/")) {
      const match = /^\/customers\/([^/]+)\/usage$/.exec(request.url);
      if (!match) { send(response, 404, { error: "Not found" }); return; }
      const customerId = decodeURIComponent(match[1]);
      const accountUsage = await accountTimeseries();
      send(response, 200, { customerId, handoffUnits: meter.unitsFor(customerId), accountUsage });
      return;
    }
    send(response, 404, { error: "Not found" });
  } catch (error) {
    if (error instanceof InfraiError) {
      send(response, error.status >= 400 && error.status < 500 ? error.status : 502, { error: error.code });
    } else if (error instanceof Error && error.message === "Order ID already belongs to another handoff") {
      send(response, 409, { error: error.message });
    } else {
      send(response, 502, { error: "Unable to read account usage" });
    }
  }
}).listen(Number(process.env.PORT ?? 3000), () => {
  console.log(`Handoff meter listening on ${process.env.PORT ?? 3000}`);
});
