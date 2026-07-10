# Security Policy

## Reporting a vulnerability

Please report security issues **privately** — do not open a public issue.

Email **security@sentroy.com** with a description, reproduction steps, and
affected version/component. We aim to acknowledge within a few business days.

## Scope

- **Hosted (sentroy.com):** the running service and its APIs.
- **Self-hosted:** the code in this repository. Misconfiguration of your own
  deployment (weak secrets, exposed MongoDB, missing TLS) is your
  responsibility, but we welcome reports of insecure defaults.

## Bug bounty

There is **no paid bounty program yet**. We still credit reporters (with your
consent) once a fix ships.

## App Store registry signing

The App Store catalog is signed with an Ed25519 key held only by the Sentroy
team; self-hosted instances verify against a pinned public key. For key-rotation
or catalog-integrity concerns, contact **security@sentroy.com**.
