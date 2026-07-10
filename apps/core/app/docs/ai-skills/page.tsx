import type { Metadata } from "next"
import { CodeBlock, InlineCode } from "../components/code-block"
import { Callout, Lede, Para, PropsTable, Section, Sub } from "../components/docs-ui"
import { PageFooter } from "../components/page-footer"

export const metadata: Metadata = {
  title: "AI Skills",
  description:
    "Sentroy's canonical SKILL.md — drop into Claude Code, Cursor, Windsurf or any AGENTS.md tool with one command. Agents stop guessing API shapes.",
}

export default function AiSkillsDocsPage() {
  return (
    <article>
      <header className="mb-12 flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Tools / AI Skills
          </div>
          <h1 className="text-4xl font-semibold tracking-tight text-foreground">
            AI Skills
          </h1>
          <Lede>
            One canonical <InlineCode>SKILL.md</InlineCode> file describes
            every Sentroy API surface, auth mode, SDK call and gotcha. AI
            coding tools read it, so your agent stops trial-and-erroring its
            way through our REST endpoints — and you stop pasting docs into
            chat.
          </Lede>
        </div>
      </header>

      <Section
        id="overview"
        title="Overview"
        description={
          <>
            Sentroy publishes a single source-of-truth{" "}
            <InlineCode>SKILL.md</InlineCode> alongside the{" "}
            <InlineCode>@sentroy-co/client-sdk</InlineCode> npm package.
            Claude Code, Cursor, Windsurf, Codex, Aider and other agent
            harnesses read it as part of their working context, so they
            know — without guessing — that auth tokens start with{" "}
            <InlineCode>stk_</InlineCode>, that the SDK constructor takes a{" "}
            <InlineCode>companySlug</InlineCode>, that{" "}
            <InlineCode>send.execute</InlineCode> needs a permission scope,
            and so on.
          </>
        }
      >
        <Para>
          The skill ships pinned to the SDK version. <InlineCode>npm install
          @sentroy-co/client-sdk@latest</InlineCode> bumps both, so when we
          ship a new resource (or break an old shape — rare, but it
          happens), your agent context updates with one command.
        </Para>
        <Callout variant="info" title="Why a separate file?">
          We tried inlining docs into every snippet. Agents truncated it,
          missed sections, repeated outdated advice. A single canonical
          file lets harnesses keep it pinned, fully in context, and
          identical across editors.
        </Callout>
      </Section>

      <Section
        id="why"
        title="Why install the skill"
        description="Three concrete wins for any team using AI to build against Sentroy."
      >
        <ul className="my-4 ml-6 list-disc space-y-3 text-sm">
          <li>
            <strong>Hands-off coding.</strong> Agents immediately know which
            auth header to send for which endpoint —{" "}
            <InlineCode>stk_</InlineCode> (Bearer access token, SDK
            entrypoint) vs <InlineCode>aps_</InlineCode> (Auth Project key,
            end-user pool) vs <InlineCode>x-internal-secret</InlineCode>{" "}
            (server-to-server). No more &ldquo;why is this 401-ing&rdquo;
            loops.
          </li>
          <li>
            <strong>Less hallucination.</strong> Agents reference the
            canonical <InlineCode>SKILL.md</InlineCode> instead of
            inventing endpoint shapes from training data (which is months
            out of date and missing every resource we shipped this year).
            Resource lists, payload shapes, error codes — all real.
          </li>
          <li>
            <strong>Always-fresh.</strong> The skill ships pinned to the
            SDK version. Bumping the SDK bumps the skill in lock-step, so
            the agent context can never drift behind the code you&apos;re
            actually calling.
          </li>
        </ul>
      </Section>

      <Section
        id="install"
        title="Installing the skill"
        description="One command. The CLI autodetects which AI tools your project already uses and writes the skill in the right format for each."
      >
        <Para>Run it with <InlineCode>npx</InlineCode> — no install needed:</Para>
        <CodeBlock
          lang="bash"
          code={`npx @sentroy-co/client-sdk ai install`}
        />
        <Para>
          Or, if the SDK is already a dependency in your project, use the
          bin name directly:
        </Para>
        <CodeBlock
          lang="bash"
          code={`sentroy ai install`}
        />
        <Para>
          The CLI walks your project root, identifies every supported AI
          tool present (Claude Code, Cursor, Windsurf, AGENTS.md
          consumers), and writes the skill into each at the canonical
          location for that tool. Re-running is idempotent — sentinel
          blocks let the CLI replace only its own section without touching
          anything you&apos;ve added by hand.
        </Para>

        <Sub title="Flags">
          <PropsTable
            rows={[
              {
                name: "--claude",
                type: "boolean",
                description: (
                  <>
                    Force-install for Claude Code / Claude Agent SDK
                    (writes to <InlineCode>.claude/skills/sentroy/SKILL.md</InlineCode>),
                    even if no <InlineCode>.claude/</InlineCode> directory
                    is detected.
                  </>
                ),
              },
              {
                name: "--cursor",
                type: "boolean",
                description: (
                  <>
                    Force-install for Cursor (writes to{" "}
                    <InlineCode>.cursor/rules/sentroy.mdc</InlineCode> in
                    MDC format with appropriate frontmatter).
                  </>
                ),
              },
              {
                name: "--windsurf",
                type: "boolean",
                description: (
                  <>
                    Force-install for Windsurf / Cascade (merges into{" "}
                    <InlineCode>.windsurfrules</InlineCode> inside a
                    sentinel block).
                  </>
                ),
              },
              {
                name: "--agents",
                type: "boolean",
                description: (
                  <>
                    Force-install into <InlineCode>AGENTS.md</InlineCode>{" "}
                    at the project root — the universal convention picked
                    up by Codex, Aider, Continue, and most other agent
                    harnesses.
                  </>
                ),
              },
              {
                name: "--all",
                type: "boolean",
                description:
                  "Install to every supported target regardless of autodetection. Useful for monorepos where the agent context may shift between editors.",
              },
              {
                name: "--upgrade",
                type: "boolean",
                description: (
                  <>
                    Force-rewrite even if the existing sentinel block
                    matches the current skill version. Use when re-syncing
                    after a manual edit, or to repair a partially-written
                    file.
                  </>
                ),
              },
              {
                name: "--check",
                type: "boolean",
                description:
                  "Dry-run mode. Reports which targets would be written / updated / skipped without touching any file. Exits non-zero if any target is out of date — handy in CI.",
              },
              {
                name: "--source <path|url>",
                type: "string",
                description: (
                  <>
                    Override the source of the skill. Defaults to the{" "}
                    <InlineCode>SKILL.md</InlineCode> bundled with the
                    installed SDK; pass a file path or HTTPS URL to point
                    at a fork (internal additions, pinned older version,
                    etc.).
                  </>
                ),
              },
            ]}
          />
        </Sub>
      </Section>

      <Section
        id="targets"
        title="What gets installed where"
        description="The CLI maps each tool to its canonical location and format. Re-runs replace only the Sentroy block — your other content is untouched."
      >
        <div className="my-5 overflow-x-auto rounded-lg border border-border">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-muted/40">
              <tr className="border-b border-border">
                <th className="px-4 py-2.5 font-semibold">Tool</th>
                <th className="px-4 py-2.5 font-semibold">Detected via</th>
                <th className="px-4 py-2.5 font-semibold">Written to</th>
                <th className="px-4 py-2.5 font-semibold">Format</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border/60 align-top">
                <td className="px-4 py-3 text-foreground">
                  Claude Code / Agent SDK
                </td>
                <td className="px-4 py-3 font-mono text-[12.5px] text-muted-foreground">
                  .claude/ or CLAUDE.md
                </td>
                <td className="px-4 py-3 font-mono text-[12.5px] text-muted-foreground">
                  .claude/skills/sentroy/SKILL.md
                </td>
                <td className="px-4 py-3 text-[13.5px] text-muted-foreground">
                  SKILL.md with frontmatter
                </td>
              </tr>
              <tr className="border-b border-border/60 align-top">
                <td className="px-4 py-3 text-foreground">Cursor</td>
                <td className="px-4 py-3 font-mono text-[12.5px] text-muted-foreground">
                  .cursor/
                </td>
                <td className="px-4 py-3 font-mono text-[12.5px] text-muted-foreground">
                  .cursor/rules/sentroy.mdc
                </td>
                <td className="px-4 py-3 text-[13.5px] text-muted-foreground">
                  MDC format
                </td>
              </tr>
              <tr className="border-b border-border/60 align-top">
                <td className="px-4 py-3 text-foreground">Windsurf</td>
                <td className="px-4 py-3 font-mono text-[12.5px] text-muted-foreground">
                  .windsurfrules
                </td>
                <td className="px-4 py-3 font-mono text-[12.5px] text-muted-foreground">
                  .windsurfrules (sentinel block)
                </td>
                <td className="px-4 py-3 text-[13.5px] text-muted-foreground">
                  merged section
                </td>
              </tr>
              <tr className="align-top">
                <td className="px-4 py-3 text-foreground">
                  Universal (Codex, Aider, etc.)
                </td>
                <td className="px-4 py-3 font-mono text-[12.5px] text-muted-foreground">
                  always
                </td>
                <td className="px-4 py-3 font-mono text-[12.5px] text-muted-foreground">
                  AGENTS.md (cwd root, sentinel block)
                </td>
                <td className="px-4 py-3 text-[13.5px] text-muted-foreground">
                  merged section
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <Callout variant="info" title="Sentinel blocks">
          Merged targets (<InlineCode>AGENTS.md</InlineCode>,{" "}
          <InlineCode>.windsurfrules</InlineCode>) are written inside a
          fenced block:
          <CodeBlock
            lang="markdown"
            code={`<!-- sentroy-skill-begin -->
... canonical Sentroy SKILL.md content ...
<!-- sentroy-skill-end -->`}
          />
          On re-install the CLI replaces only the content between those
          markers. Anything you&apos;ve written above or below the block
          (project conventions, internal libraries, team rules) is
          preserved verbatim.
        </Callout>
      </Section>

      <Section
        id="content"
        title="What&rsquo;s in the skill"
        description="A walk-through of the sections inside SKILL.md so you know what your agent is reading."
      >
        <ul className="my-4 ml-6 list-disc space-y-2 text-sm">
          <li>
            <strong>Auth modes.</strong> Token prefixes (
            <InlineCode>stk_</InlineCode>, <InlineCode>aps_</InlineCode>,{" "}
            <InlineCode>oat_</InlineCode>), header shape, when to use
            which, and concrete examples for each.
          </li>
          <li>
            <strong>Base URLs.</strong> Production (
            <InlineCode>https://sentroy.com</InlineCode>) plus subdomain
            map for mail / storage / auth and how SDK routing hides the{" "}
            <InlineCode>/api/mail/*</InlineCode> rewrites.
          </li>
          <li>
            <strong>Install snippets.</strong> npm / bun / pnpm / yarn
            commands so the agent picks the right package manager from
            your lockfile.
          </li>
          <li>
            <strong>Common task recipes.</strong> &ldquo;Send a transactional
            email,&rdquo; &ldquo;upload a file with multipart,&rdquo;
            &ldquo;list a bucket,&rdquo; &ldquo;sign up an end user&rdquo;
            — each as a 5-10 line working snippet.
          </li>
          <li>
            <strong>Resource API surface.</strong> Method signatures for
            every <InlineCode>sentroy.domains.*</InlineCode>,{" "}
            <InlineCode>sentroy.mailboxes.*</InlineCode>,{" "}
            <InlineCode>sentroy.media.*</InlineCode> etc. with required
            and optional params labelled.
          </li>
          <li>
            <strong>LocalizedString gotcha.</strong> Why{" "}
            <InlineCode>name</InlineCode> on most resources is{" "}
            <InlineCode>{`{tr, en}`}</InlineCode> rather than a string,
            with the right shape inline.
          </li>
          <li>
            <strong>Permission scopes.</strong> The full
            permission-string vocabulary (
            <InlineCode>domains.create</InlineCode>,{" "}
            <InlineCode>storage.view</InlineCode>,{" "}
            <InlineCode>send.execute</InlineCode>, …) so agents can ask
            for the right scope when creating tokens.
          </li>
          <li>
            <strong>Error codes.</strong> Response shapes for 400 / 401 /
            403 / 422 / 429, with the canonical{" "}
            <InlineCode>{`{error: {code, message, details}}`}</InlineCode>{" "}
            envelope.
          </li>
          <li>
            <strong>Rate limits.</strong> Per-token RPS, per-endpoint
            burst windows, the headers we surface (
            <InlineCode>X-RateLimit-*</InlineCode>) and back-off advice.
          </li>
          <li>
            <strong>Gotchas.</strong> Cross-subdomain cookie quirks, the
            avatar upload split (
            <InlineCode>DirectAvatarUpload</InlineCode> vs{" "}
            <InlineCode>MediaManagerTrigger</InlineCode>), build-time DB
            connection flakiness, and the{" "}
            <InlineCode>SelectValue</InlineCode> convention.
          </li>
          <li>
            <strong>CLI reference.</strong> Every <InlineCode>sentroy *</InlineCode>{" "}
            subcommand with flags — so the agent can drive the CLI as
            well as the API.
          </li>
          <li>
            <strong>Versioning.</strong> The skill embeds the SDK semver
            it was built against, so the agent can tell when its context
            is older than the installed package.
          </li>
        </ul>
      </Section>

      <Section
        id="public-urls"
        title="Public URLs"
        description="For agents that can&rsquo;t (or shouldn&rsquo;t) run the CLI — fetch the skill straight off the docs origin."
      >
        <Para>
          We mirror the canonical skill on three stable URLs. Use{" "}
          <InlineCode>llms.txt</InlineCode> for discovery (small, lists
          every doc page),{" "}
          <InlineCode>skill.md</InlineCode> for the full SKILL.md with
          frontmatter, and <InlineCode>agents.md</InlineCode> for the
          frontmatter-stripped version that drops cleanly into{" "}
          <InlineCode>AGENTS.md</InlineCode>.
        </Para>

        <CodeBlock
          lang="bash"
          code={`# Discovery index (~80 lines — what docs exist, which is canonical)
curl https://docs.sentroy.com/llms.txt

# Canonical SKILL.md (with frontmatter)
curl https://docs.sentroy.com/skill.md

# Frontmatter-stripped — paste into AGENTS.md
curl https://docs.sentroy.com/agents.md

# Raw GitHub backup (if docs.sentroy.com is unreachable)
curl https://raw.githubusercontent.com/Sentroy-Co/client-sdk/main/typescript/skill/SKILL.md`}
        />

        <Callout variant="info">
          The docs origin sets generous cache headers; agents that fetch
          on every request will hit a 304 within the same hour. If you
          need a guaranteed-fresh pull, add{" "}
          <InlineCode>?v=$(date +%s)</InlineCode> as a cache buster — the
          origin ignores unknown query params.
        </Callout>
      </Section>

      <Section
        id="updating"
        title="Updating"
        description="The skill is pinned to the SDK version. Bumping one bumps the other; the CLI handles the rest."
      >
        <Para>
          To pull the latest skill content, bump the SDK and re-run install
          with <InlineCode>--upgrade</InlineCode>:
        </Para>
        <CodeBlock
          lang="bash"
          code={`bun add @sentroy-co/client-sdk@latest
# or: npm install @sentroy-co/client-sdk@latest

sentroy ai install --upgrade`}
        />
        <Para>
          Without <InlineCode>--upgrade</InlineCode>, the CLI hashes the
          existing sentinel block and skips the write if the content is
          unchanged. With it, every target is force-rewritten — useful if
          you&apos;ve manually edited the block and want to discard your
          changes, or if a previous install was interrupted.
        </Para>
        <Callout variant="success" title="CI integration">
          Add <InlineCode>sentroy ai install --check</InlineCode> to your
          CI pre-flight. It exits non-zero if any target is out of date,
          so a PR that bumps the SDK but forgets to update AGENTS.md
          fails loudly instead of shipping stale agent context.
        </Callout>
      </Section>

      <Section
        id="custom"
        title="Building your own skill"
        description="Have internal conventions, team-specific rules, or a private API your agent should know about? Append them below the Sentroy block — they survive re-installs."
      >
        <Para>
          For <InlineCode>AGENTS.md</InlineCode> and{" "}
          <InlineCode>.windsurfrules</InlineCode>, the sentinel block
          only owns its own region. Anything before or after it is
          preserved verbatim, even across <InlineCode>--upgrade</InlineCode>{" "}
          runs. Use that to layer your own rules on top:
        </Para>
        <CodeBlock
          lang="markdown"
          code={`# Project: acme-internal

Use Bun, not npm. Database is Postgres (Drizzle ORM). Never edit
\`packages/legacy-billing/\` — talk to @finance first.

<!-- sentroy-skill-begin -->
... auto-managed Sentroy SKILL.md ...
<!-- sentroy-skill-end -->

## Acme conventions

- Email sender domain is always \`@acme.dev\` (set via SENTROY_DEFAULT_DOMAIN).
- All storage uploads go in the \`assets-prod\` bucket — never create new buckets without ticket approval.
- For magic-link signups, use our internal wrapper at \`lib/auth/sentroy.ts\`, not the SDK directly.`}
        />
        <Para>
          Claude Code is a special case — it reads every file under{" "}
          <InlineCode>.claude/skills/</InlineCode>, so the cleanest layout
          is to keep the Sentroy skill as its own file (
          <InlineCode>.claude/skills/sentroy/SKILL.md</InlineCode>) and
          add your conventions as separate sibling files (
          <InlineCode>.claude/skills/acme/SKILL.md</InlineCode>). No
          merging required.
        </Para>
      </Section>

      <Section
        id="editor-tips"
        title="Editor-specific tips"
        description="How each supported tool surfaces the skill, plus the one or two settings that matter."
      >
        <Sub id="tips-claude" title="Claude Code">
          <Para>
            The skill is auto-discovered on session start — no
            configuration needed. The agent can invoke it via the Skill
            tool whenever the user&apos;s prompt mentions Sentroy
            keywords (domains, mailboxes, buckets, send, auth project,
            access token). Frontmatter advertises trigger keywords; you
            can edit them in{" "}
            <InlineCode>.claude/skills/sentroy/SKILL.md</InlineCode> if
            your team uses different terminology.
          </Para>
        </Sub>

        <Sub id="tips-cursor" title="Cursor">
          <Para>
            The MDC rule defaults to <InlineCode>alwaysApply: false</InlineCode>{" "}
            with a keyword trigger list — so Cursor only injects the skill
            when the prompt or open file looks Sentroy-related. To force
            it into every prompt (handy if your project is Sentroy
            top-to-bottom), edit the frontmatter at the top of{" "}
            <InlineCode>.cursor/rules/sentroy.mdc</InlineCode> and set{" "}
            <InlineCode>alwaysApply: true</InlineCode>.
          </Para>
        </Sub>

        <Sub id="tips-windsurf" title="Windsurf / Cascade">
          <Para>
            Cascade reads <InlineCode>.windsurfrules</InlineCode> on every
            prompt — no triggering, the file is always in context. Keep
            the file under ~6,000 tokens total; the Sentroy block is
            ~3,200 today, leaving room for your own rules. If you exceed
            Cascade&apos;s context budget, move project-specific rules to{" "}
            <InlineCode>.codeiumignore</InlineCode>-style scoped files
            and keep only the Sentroy block in{" "}
            <InlineCode>.windsurfrules</InlineCode>.
          </Para>
        </Sub>

        <Sub id="tips-universal" title="AGENTS.md (Codex, Aider, others)">
          <Para>
            <InlineCode>AGENTS.md</InlineCode> sits at the project root
            and is read on every prompt by Codex CLI, Aider, Continue,
            and most other open-source harnesses. The CLI writes the
            Sentroy block in-place; you own everything around it.
            Re-installs touch only the sentinel region — your other
            content is safe.
          </Para>
        </Sub>

        <Callout variant="warning">
          <strong>Don&apos;t commit secrets into the skill file.</strong>{" "}
          The bundled SKILL.md never references env values — only env
          variable <em>names</em>. If you fork it, keep that discipline:
          <InlineCode>.cursor/rules/</InlineCode>,{" "}
          <InlineCode>AGENTS.md</InlineCode>, and{" "}
          <InlineCode>.windsurfrules</InlineCode> are all committed to
          source control by default.
        </Callout>
      </Section>

      <PageFooter current="/docs/ai-skills" />
    </article>
  )
}
