# Public artifact boundary

This repository is a clean, self-contained demonstration. It must never contain client, employer, provider, customer, credential, deployment, or database material.

- Use only synthetic payment IDs, event IDs, and secrets in tests and examples.
- Do not add real provider names, real integration payloads, or copied private code.
- Keep the project reproducible with `npm ci`, `npm test`, `npm run typecheck`, and `npm run build`.
- The README may describe the demonstrated engineering principles, but must not claim a production deployment or invented performance outcomes.
