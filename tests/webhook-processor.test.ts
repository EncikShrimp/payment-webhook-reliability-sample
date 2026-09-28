import assert from "node:assert/strict";
import test from "node:test";

import {
  InMemoryPaymentStore,
  InvalidWebhookSignatureError,
  WebhookProcessor,
  signWebhook,
  type PaymentWebhook,
} from "../src/index.js";

const secret = "sample-signing-secret";

function webhook(overrides: Partial<PaymentWebhook> = {}): PaymentWebhook {
  const unsigned: Omit<PaymentWebhook, "signature"> = {
    eventId: "evt_001",
    paymentId: "pay_001",
    type: "payment.succeeded",
    occurredAt: "2026-09-28T10:00:00.000Z",
    ...overrides,
  };

  return { ...unsigned, signature: signWebhook(unsigned, secret) };
}

test("moves a pending payment to completed after a valid success webhook", () => {
  const store = new InMemoryPaymentStore();
  store.createPayment({ id: "pay_001", state: "pending" });
  const processor = new WebhookProcessor({ secret, store });

  const result = processor.process(webhook());

  assert.deepEqual(result, { outcome: "applied", state: "completed" });
  assert.deepEqual(store.payment("pay_001"), { id: "pay_001", state: "completed" });
  assert.equal(store.events().length, 1);
});

test("does not execute the same provider event twice", () => {
  const store = new InMemoryPaymentStore();
  store.createPayment({ id: "pay_001", state: "pending" });
  let transitionCount = 0;
  const processor = new WebhookProcessor({
    secret,
    store,
    onTransition: () => {
      transitionCount += 1;
    },
  });
  const event = webhook();

  const first = processor.process(event);
  const duplicate = processor.process(event);

  assert.deepEqual(first, { outcome: "applied", state: "completed" });
  assert.deepEqual(duplicate, { outcome: "duplicate", state: "completed" });
  assert.equal(transitionCount, 1);
  assert.equal(store.events().length, 1);
});

test("records an out-of-order terminal event without moving a completed payment backwards", () => {
  const store = new InMemoryPaymentStore();
  store.createPayment({ id: "pay_001", state: "pending" });
  const processor = new WebhookProcessor({ secret, store });

  processor.process(webhook());
  const lateFailure = webhook({
    eventId: "evt_002",
    type: "payment.failed",
    occurredAt: "2026-09-28T10:01:00.000Z",
  });

  const result = processor.process(lateFailure);

  assert.deepEqual(result, { outcome: "ignored", state: "completed" });
  assert.deepEqual(store.payment("pay_001"), { id: "pay_001", state: "completed" });
  assert.deepEqual(store.events().map((event) => event.outcome), ["applied", "ignored"]);
});

test("rejects an invalid signature before reading or changing payment state", () => {
  const store = new InMemoryPaymentStore();
  store.createPayment({ id: "pay_001", state: "pending" });
  const processor = new WebhookProcessor({ secret, store });
  const invalid = { ...webhook(), signature: "not-a-valid-signature" };

  assert.throws(() => processor.process(invalid), InvalidWebhookSignatureError);
  assert.deepEqual(store.payment("pay_001"), { id: "pay_001", state: "pending" });
  assert.deepEqual(store.events(), []);
});
