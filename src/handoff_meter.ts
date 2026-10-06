export type Handoff = {
  orderId: string;
  customerId: string;
  sellerAsset: { assetId: string; sellerId: string };
  buyerUpdate: { buyerId: string; revision: number };
};

export type Receipt = {
  orderId: string;
  customerId: string;
  units: number;
  totalUnits: number;
  duplicate: boolean;
};

export class HandoffMeter {
  private readonly orders = new Map<string, { handoff: Handoff; receipt: Receipt }>();
  private readonly totals = new Map<string, number>();

  record(handoff: Handoff): Receipt {
    const previous = this.orders.get(handoff.orderId);
    if (previous) {
      if (JSON.stringify(previous.handoff) !== JSON.stringify(handoff)) {
        throw new Error("Order ID already belongs to another handoff");
      }
      return { ...previous.receipt, duplicate: true };
    }
    const totalUnits = (this.totals.get(handoff.customerId) ?? 0) + 1;
    const receipt = { orderId: handoff.orderId, customerId: handoff.customerId, units: 1, totalUnits, duplicate: false };
    this.orders.set(handoff.orderId, { handoff, receipt });
    this.totals.set(handoff.customerId, totalUnits);
    return receipt;
  }

  unitsFor(customerId: string): number {
    return this.totals.get(customerId) ?? 0;
  }
}
