import { createHmac, timingSafeEqual } from "node:crypto";

export type PaymentState = "pending" | "processing" | "completed" | "failed";
export type PaymentWebhookType = "payment.succeeded" | "payment.failed";
export type WebhookOutcome = "applied" | "duplicate" | "ignored";

export interface Payment {
  id: string;
  state: PaymentState;
}

export interface PaymentWebhook {
  eventId: string;
  paymentId: string;
  type: PaymentWebhookType;
  occurredAt: string;
  signature: string;
}

export interface WebhookAuditEvent {
  eventId: string;
  paymentId: string;
  type: PaymentWebhookType;
  occurredAt: string;
  outcome: Exclude<WebhookOutcome, "duplicate">;
}

export interface ProcessResult {
  outcome: WebhookOutcome;
  state: PaymentState;
}

export class InvalidWebhookSignatureError extends Error {
  constructor() {
    super("Webhook signature is invalid.");
    this.name = "InvalidWebhookSignatureError";
  }
}

export class UnknownPaymentError extends Error {
  constructor(paymentId: string) {
    super(`Unknown payment: ${paymentId}`);
    this.name = "UnknownPaymentError";
  }
}

export class InMemoryPaymentStore {
  private readonly payments = new Map<string, Payment>();
  private readonly processedEventIds = new Set<string>();
  private readonly auditEvents: WebhookAuditEvent[] = [];

  createPayment(payment: Payment): void {
    this.payments.set(payment.id, { ...payment });
  }

  payment(paymentId: string): Payment | undefined {
    const payment = this.payments.get(paymentId);
    return payment ? { ...payment } : undefined;
  }

  events(): WebhookAuditEvent[] {
    return this.auditEvents.map((event) => ({ ...event }));
  }

  hasProcessed(eventId: string): boolean {
    return this.processedEventIds.has(eventId);
  }

  updateState(paymentId: string, state: PaymentState): Payment {
    const payment = this.payments.get(paymentId);
    if (!payment) {
      throw new UnknownPaymentError(paymentId);
    }

    payment.state = state;
    return { ...payment };
  }

  record(event: WebhookAuditEvent): void {
    this.processedEventIds.add(event.eventId);
    this.auditEvents.push({ ...event });
  }
}

export interface WebhookProcessorOptions {
  secret: string;
  store: InMemoryPaymentStore;
  onTransition?: (payment: Payment, event: PaymentWebhook) => void;
}

export class WebhookProcessor {
  private readonly secret: string;
  private readonly store: InMemoryPaymentStore;
  private readonly onTransition?: (payment: Payment, event: PaymentWebhook) => void;

  constructor(options: WebhookProcessorOptions) {
    this.secret = options.secret;
    this.store = options.store;
    this.onTransition = options.onTransition;
  }

  process(event: PaymentWebhook): ProcessResult {
    if (!verifyWebhook(event, this.secret)) {
      throw new InvalidWebhookSignatureError();
    }

    const payment = this.store.payment(event.paymentId);
    if (!payment) {
      throw new UnknownPaymentError(event.paymentId);
    }

    if (this.store.hasProcessed(event.eventId)) {
      return { outcome: "duplicate", state: payment.state };
    }

    const nextState = stateFor(event.type);
    const outcome = canTransition(payment.state, nextState) ? "applied" : "ignored";
    const resultingPayment = outcome === "applied"
      ? this.store.updateState(payment.id, nextState)
      : payment;

    this.store.record({
      eventId: event.eventId,
      paymentId: event.paymentId,
      type: event.type,
      occurredAt: event.occurredAt,
      outcome,
    });

    if (outcome === "applied") {
      this.onTransition?.(resultingPayment, event);
    }

    return { outcome, state: resultingPayment.state };
  }
}

export function signWebhook(
  event: Omit<PaymentWebhook, "signature">,
  secret: string,
): string {
  return createHmac("sha256", secret)
    .update(serialise(event))
    .digest("hex");
}

export function verifyWebhook(event: PaymentWebhook, secret: string): boolean {
  const expected = Buffer.from(signWebhook(event, secret), "hex");
  const received = Buffer.from(event.signature, "hex");

  return expected.length === received.length && timingSafeEqual(expected, received);
}

function stateFor(type: PaymentWebhookType): Extract<PaymentState, "completed" | "failed"> {
  return type === "payment.succeeded" ? "completed" : "failed";
}

function canTransition(current: PaymentState, next: PaymentState): boolean {
  if (current === "completed" || current === "failed") {
    return false;
  }

  return next === "completed" || next === "failed";
}

function serialise(event: Omit<PaymentWebhook, "signature">): string {
  return [event.eventId, event.paymentId, event.type, event.occurredAt].join("|");
}
