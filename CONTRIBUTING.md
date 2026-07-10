# Contributing to Sentroy

Thanks for your interest! Sentroy is **Fair Source** software
([FSL-1.1-ALv2](./LICENSE)); contributions are welcome under that license.

## Development setup

```bash
bun install
bun run dev          # all apps in parallel (core:3000, mail:3001, storage:3002, …)
bun run typecheck    # whole workspace — must pass before a PR
bun run build
bun run lint
```

Run a single app: `bun run dev --filter=core`.

Add a shadcn component (lands in `packages/ui`, imported everywhere):

```bash
bunx shadcn@latest add <component> -c apps/core
```

## Repo layout

A Turbo + Bun monorepo: `apps/*` (Next.js apps + workers) and `packages/*`
(`ui`, `db`, `auth`, `console`, `cdn-client`, `ai-assistant`, `app-manifest`).

## Pull requests

- `bun run typecheck` must pass (CI enforces it).
- Use conventional-commit style (`feat:`, `fix:`, `docs:`, `chore:` …).
- Keep changes focused; explain the "why" in the PR description.
- No secrets, ever — `.env` files are git-ignored and CI fails on a tracked one.

## Contributor License Agreement (CLA)

Because Sentroy is Fair Source (not a standard OSI license), contributors sign a
**CLA** before their first PR is merged (a bot will prompt you). A DCO sign-off
is **not** accepted in place of the CLA.

## Reporting bugs / requesting features

Use the GitHub issue templates. For security issues, see
[SECURITY.md](./SECURITY.md) (report privately, never in a public issue).
