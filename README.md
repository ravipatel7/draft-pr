# @ravilabs/draft-pr

[![npm version](https://img.shields.io/npm/v/@ravilabs/draft-pr)](https://www.npmjs.com/package/@ravilabs/draft-pr)
[![npm downloads](https://img.shields.io/npm/dm/@ravilabs/draft-pr)](https://www.npmjs.com/package/@ravilabs/draft-pr)
[![license](https://img.shields.io/npm/l/@ravilabs/draft-pr)](LICENSE)
[![node](https://img.shields.io/node/v/@ravilabs/draft-pr)](package.json)

A zero-dependency NPM package that installs the **draft-pr** [Claude Code](https://claude.ai/code) skill into your project. Run `npx @ravilabs/draft-pr` once to set it up, then tell Claude Code _"draft pr"_ — it analyzes your git diff and creates a fully populated GitHub Pull Request in seconds.

---

## What it does

The package installs a skill file that Claude Code reads. When triggered, Claude will:

1. Read your saved config (base branch, PR template path)
2. Run preflight checks — git repo, `gh` CLI auth, branch state
3. Detect whether a PR already exists and skip if nothing changed
4. Read your PR template (existing or default)
5. Analyze the full `git diff` to determine change type, title, description, and checklist items
6. Ask you three quick questions in chat: ticket ID, how it was tested, and show a preview for approval
7. Resolve labels — create any missing ones in the repo with sensible default colors
8. Run `gh pr create --draft` (or `gh pr edit` for updates) and print the PR URL

No AI logic lives in this package — it is purely a skill file distributor. All intelligence runs inside Claude Code at execution time.

---

## Prerequisites

- [Claude Code](https://claude.ai/code)
- [gh CLI](https://cli.github.com) — installed and authenticated (`gh auth login`)
- Node.js ≥ 18

---

## Setup

Run once from your project root:

```bash
npx @ravilabs/draft-pr
```

The installer asks two questions:

| Question | Details |
|----------|---------|
| Do you have an existing PR template? | Auto-detects `.github/pull_request_template.md` — installs default if not found |
| Default base branch | Required — e.g. `main`, `master`, `develop` |

It then writes `.claude/skills/draft-pr/config.json` and drops the skill files into `.claude/skills/draft-pr/`.

---

## Usage

Once installed, trigger the skill inside Claude Code:

```
draft pr                  → creates PR against your configured default branch
draft pr main             → creates PR against main (one-time override)
draft pr staging          → creates PR against staging (one-time override)
```

Any of these phrasings also work:

```
create pr
open pull request
raise a PR
submit PR
update my PR
fix my PR description
```

---

## Files installed into your project

```
.claude/
└── skills/
    └── draft-pr/
        ├── SKILL.md              ← skill definition Claude Code reads
        ├── config.json           ← your base branch + template config
        ├── scripts/
        │   └── preflight.sh      ← git/gh checks run before each PR
        └── templates/
            └── pr_template.md    ← default PR template (if you didn't have one)
.github/
└── pull_request_template.md      ← installed if you didn't already have one
```

---

## Reconfigure

Re-run the installer at any time to change your base branch or template settings:

```bash
npx @ravilabs/draft-pr
```

If the skill is already installed, it will ask whether to overwrite the skill files. Your `config.json` is always preserved during overwrites — only `SKILL.md`, `scripts/`, and `templates/` are updated.

---

## Default PR template

If you don't have an existing PR template, the installer copies this one:

```markdown
## Description
## Fixes / Changes
## Type of Change
## Jira / Linear Ticket
## How Have You Tested?
## Checklist
## Additional Notes
```

You can edit `.github/pull_request_template.md` freely — the skill reads whatever is there at runtime.

---

## Package contents

```
draft-pr/
├── bin/
│   └── install.js          ← npx entrypoint (pure Node built-ins, zero deps)
├── skills/
│   └── draft-pr/
│       ├── SKILL.md
│       ├── templates/
│       │   └── pr_template.md
│       └── scripts/
│           └── preflight.sh
├── package.json
└── README.md
```

---

## Publishing (maintainers)

```bash
npm version patch   # or minor / major
npm publish         # publishConfig.access = "public" is already set
```

---

## License

MIT
