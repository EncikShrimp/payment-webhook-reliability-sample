# Payment webhook reliability sample

A small, self-contained TypeScript code sample showing how to process asynchronous payment webhooks safely when providers resend, delay, or reorder events.

> This is a clean demonstration built from general engineering principles. It contains no client, employer, provider, customer, credential, or production-system code.

## What it demonstrates

- HMAC-style webhook signature verification before state is read or changed.
- Idempotency by stable provider event ID.
- Explicit workflow states: `pending`, `processing`, `completed`, and `failed`.
- Terminal-state protection: a late failure cannot move a completed payment backwards.
- Audit records for applied and safely ignored events.
- An injected transition hook so downstream work runs exactly once per valid transition.

## Why this design

External systems are not reliable event streams. A provider can emit the same event twice, deliver events out of order, or retry after a network failure. The processor therefore treats each event as untrusted input:

1. Verify its signature.
2. Reject or ignore repeat event IDs.
3. Load the current workflow state.
4. Allow only valid forward transitions.
5. Record the handling outcome for traceability.
6. Trigger downstream work only after an accepted transition.

The example uses an in-memory store so the state-machine behavior remains easy to inspect. A production system would replace that store with transactional database operations and durable event/audit storage.

## Run locally

```bash
npm ci
npm test
npm run typecheck
npm run build
```

## Test coverage

The automated tests cover:

- applying a valid success webhook;
- ignoring a duplicate provider event without repeating the transition hook;
- recording an out-of-order terminal event without reversing completed state; and
- rejecting an invalid signature without changing payment state.

## Structure

```text
src/index.ts                    Core types, signature helper, store, and processor
tests/webhook-processor.test.ts Behaviour-focused tests
AGENTS.md                       Public-artifact and privacy boundary
```

## Design notes

- Signatures are calculated from a canonical event representation in this small example. Real providers have their own signed payload formats; adopt their documented canonicalisation rules rather than copying this format.
- Idempotency keys must be stored durably in production and written atomically with state/audit changes.
- A received event is not automatically a valid transition. Its relationship to current state matters as much as its signature.

## License

MIT. See [LICENSE](LICENSE).
