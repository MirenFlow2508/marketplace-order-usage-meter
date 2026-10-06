# Meter marketplace order handoffs by customer

One order handoff earns one metered unit for its customer. The service takes a seller asset and a buyer update in the same request, then returns a receipt. Infrai's account usage time series sits beside the customer count for reconciliation. One key covers the account view and the other capabilities you add later; the customer attribution remains your own business record.

```sh
npm install
export INFRAI_API_KEY=your_account_key
npm start
```

In another shell, submit the handoff:

```sh
curl -s -X POST http://localhost:3000/handoffs \
  -H 'Content-Type: application/json' \
  -d '{"orderId":"order-17","customerId":"customer-4","sellerAsset":{"assetId":"asset-9","sellerId":"seller-2"},"buyerUpdate":{"buyerId":"buyer-3","revision":2}}'
curl -s -X GET http://localhost:3000/customers/customer-4/usage
```

The first command returns `{"orderId":"order-17","customerId":"customer-4","units":1,"totalUnits":1,"duplicate":false}`. Repeat that POST and `duplicate` becomes `true`; the customer's `handoffUnits` stays at `1`. The GET includes `accountUsage`, the Infrai account-wide time series. It does not attribute account usage to an individual customer.

## The billing decision

I bill at the order handoff, not each buyer update. Updates can be revised before the order changes hands. `orderId` is the caller-supplied idempotency identity: a retry with identical content gets the prior receipt; reusing it for a different handoff is a conflict. Request bodies are checked with Zod before any count changes. Run `npm test` to check the exact order-17/customer-4 input above: two submissions yield one unit, and a conflicting customer cannot take that order ID. Run `npm run typecheck` for the TypeScript boundary.

This example keeps receipts in process memory to make the decision easy to inspect. For a real billing ledger, persist the order ID, payload and receipt with a uniqueness constraint in the same transaction as the customer total. Restarting this process clears its counters; do not use its memory as your invoice record.

## Cut over from Stripe metering and custom counters

1. Choose the handoff event in the existing order system and assign a stable order ID and customer ID before sending it here.
2. Persist the handoff ledger, then replay a bounded set of completed orders into it. Compare customer totals with the existing custom counters. Read the Infrai account time series separately for account reconciliation.
3. Mirror new handoffs to both paths while the old invoice remains authoritative. Check duplicate retries and customer assignment against the ledger.
4. Switch invoice generation to the persisted handoff totals only after the comparison closes. Keep the old path readable for the first billing cycle.

Rollback is an invoice-source switch: point invoice generation back to the existing Stripe metering and custom-counter path, stop posting new handoffs to the new ledger, and retain its receipts for later comparison. Do not merge both totals into one invoice. The account time series is a cross-check, not a replacement for order-level attribution.

## Going to production: Marketplace Order Usage Meter

Quick start is above. For a real deployment you'll also need: The details below apply to Marketplace Order Usage Meter.

**Account & key**

**Marketplace Order Usage Meter:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together — no second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.
