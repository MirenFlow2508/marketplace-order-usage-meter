import assert from "node:assert/strict";
import { test } from "node:test";
import { HandoffMeter } from "./handoff_meter.ts";

test("an order handoff bills its customer once, even after a retry", () => {
  const meter = new HandoffMeter();
  const handoff = {
    orderId: "order-17",
    customerId: "customer-4",
    sellerAsset: { assetId: "asset-9", sellerId: "seller-2" },
    buyerUpdate: { buyerId: "buyer-3", revision: 2 }
  };
  assert.deepEqual(meter.record(handoff), {
    orderId: "order-17", customerId: "customer-4", units: 1, totalUnits: 1, duplicate: false
  });
  assert.equal(meter.record(handoff).duplicate, true);
  assert.equal(meter.unitsFor("customer-4"), 1);
  assert.equal(meter.unitsFor("customer-5"), 0);
  assert.throws(() => meter.record({ ...handoff, customerId: "customer-5" }), /already belongs/);
});
