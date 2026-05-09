---
name: draft-pr
description: >
  Creates or updates a GitHub Pull Request from the current branch using gh CLI.
  Analyzes git diff to auto-fill PR title, description, type of change, and checklist.
  Use this skill whenever the user says "draft pr", "create pr", "open pull request",
  "raise a PR", "submit PR", or any variation of creating or updating a GitHub PR.
  Also triggers when the user asks to "update my PR" or "fix my PR description".
  Supports optional branch argument: "draft pr main" or "draft pr develop".
---

# draft-pr skill

You are executing the `draft-pr` skill. Follow every step in order. Do not skip steps.
At each step, use the exact commands specified. Surface any errors immediately and stop.

---

## Step 0 — Read config

Read the file `.claude/skills/draft-pr/config.json`.

Extract these values:
- `defaultBaseBranch` — the configured default base branch
- `prTemplate` — path to the PR template file
- `useExistingTemplate` — boolean: true = read from prTemplate path, false = use bundled template

**If config.json does not exist**, stop immediately and tell the user:
> Config not found. Re-run `npx @ravilabs/draft-pr` to set up the skill.

**Resolve the base branch:**
- Check if the user's message contains a branch name argument after "draft pr" (e.g. "draft pr main", "draft pr staging", "draft pr develop").
- If a branch argument is present, use it as the base branch for this entire run.
- If no argument is present, use `defaultBaseBranch` from config.

Tell the user at the start:
> Using base branch: <resolved-branch>

---

## Step 1 — Preflight checks

Run the preflight script with the resolved base branch:

```
bash .claude/skills/draft-pr/scripts/preflight.sh <resolved-base-branch>
```

The script checks:
1. We are inside a git repository
2. `gh` CLI is installed
3. `gh` CLI is authenticated
4. Current branch is NOT the base branch
5. Warns if branch is not yet pushed to remote

If the script exits with a non-zero status code, surface the error output to the user verbatim and **stop**. Do not proceed past a failed preflight.

---

## Step 2 — Detect existing PR

Run:
```
gh pr view --json number,url,headRefName,baseRefName,commits 2>/dev/null || echo "NO_PR"
```

**If the output is `NO_PR`**: this is a new PR — continue to Step 3.

**If a PR exists**:
- Get the current HEAD SHA: `git rev-parse HEAD`
- Get the remote HEAD SHA for the PR branch: `git ls-remote origin <current-branch-name> | awk '{print $1}'`
- If the local HEAD matches the remote HEAD exactly → the PR is already up to date. Tell the user:
  > No new changes. Your PR is already up to date.
  > PR: <url>
  Then stop.
- If they differ → new commits have been pushed since the PR was created. Continue through Steps 3–7 and use `gh pr edit` instead of `gh pr create` at Step 7.

---

## Step 3 — Resolve PR template

**If `useExistingTemplate` is `true`**:
- Read the file at the path stored in `prTemplate` from config.
- Tell the user: `Using your existing PR template at <prTemplate-path>`

**If `useExistingTemplate` is `false`**:
- Read `.claude/skills/draft-pr/templates/pr_template.md`.
- Tell the user: `Using default draft-pr template`

Store the template content — you will use it in Step 7 to assemble the final PR body.

---

## Step 4 — Gather the git diff

Run both commands:

```
git diff <resolved-base-branch>...HEAD --stat
git diff <resolved-base-branch>...HEAD
```

**If the diff is empty** (both commands return no output), stop and tell the user:
> No changes detected between this branch and `<resolved-base-branch>`. Nothing to PR.

Analyze the full diff output yourself to determine:

### Change type (pick one)
| Type | When to use |
|------|-------------|
| `feat` | New user-facing feature or capability |
| `fix` | Bug fix, corrects incorrect behavior |
| `chore` | Routine maintenance, dependency bumps, config tweaks |
| `deps` | Dependency upgrades/additions (package.json, requirements.txt, go.mod, etc.) |
| `refactor` | Code restructuring with no behavior change |
| `perf` | Performance improvement (faster, less memory, fewer requests) |
| `ci` | CI/CD pipeline changes (.github/workflows, Dockerfile, Makefile) |
| `docs` | Documentation-only changes |
| `test` | Adding or fixing tests only |

### Scope (optional, in parentheses)
Derive from the most-changed directory or module name. Omit if the change is repo-wide.

### PR title
Format: `<type>(<scope>): <imperative description>` — max 72 characters.
Use imperative mood: "add", "fix", "remove", "update" — not "added", "fixes", "removing".

### Description
1–2 sentences explaining WHAT changed and WHY. Focus on intent, not implementation detail.

### Change bullets
Verb-first bullet points of the most significant individual changes. 3–6 bullets. Each starts with a capital verb: "Add", "Fix", "Remove", "Update", "Extract", "Replace", etc.

### Auto-detect checklist items
Set the following to `[x]` (checked) or `[ ]` (unchecked) based on diff evidence:

- **Tests added/updated**: check if any files matching `*.test.*`, `*.spec.*`, `__tests__/`, `test/`, `tests/` appear in the diff
- **Docs update required**: set to `[x]` if significant logic changed but no `.md`, `.mdx`, `docs/` files appear in the diff
- **Breaking change**: set to `[x]` if you see: removed exports, changed function signatures, renamed/removed API endpoints, major interface changes

### Suggested labels (1–3)
Choose from: `bug`, `enhancement`, `dependencies`, `documentation`, `refactor`, `ci`, `breaking-change`, `chore`, `performance`
Use lowercase kebab-case. Match to the change type.

---

## Step 5 — Interactive questions

Ask the user these questions **in chat** (not via shell). Wait for each answer before proceeding.

### Question A — Ticket reference
> Do you have a Jira/Linear ticket for this? (e.g. PROJ-123, or press Enter to skip)

If the user provides a ticket ID, store it. If they press Enter or say "no"/"skip", store `"-"`.

### Question B — Test methods
> How was this tested? (unit / integration / manual — you can combine, e.g. "unit and manual")

Parse liberally:
- Any mention of "unit" → check `[ ] Unit tests`
- Any mention of "integration" → check `[ ] Integration tests`
- Any mention of "manual" → check `[ ] Manual testing`
- If the user says "none" or "not tested" → leave all unchecked
- If the user says "all" → check all three

### Question C — Preview and confirm

Assemble a full markdown preview of the PR body using the template from Step 3 (see Step 7 for assembly rules). Show it to the user with:

> Here's the PR body preview:
>
> ---
> <full assembled markdown body>
> ---
>
> Looks good? (Y/n/edit)

Handle responses:
- **"Y"**, **"y"**, or Enter → proceed to Step 6
- **"n"** or **"no"** → tell the user "PR creation cancelled." and stop
- **"edit"** → ask: "What would you like to change?" Apply the requested change, show the preview again, and re-ask "Looks good? (Y/n/edit)"

---

## Step 6 — Resolve and create labels

Run:
```
gh label list --json name,color --limit 100
```

For each label in your suggested list (from Step 4):
- If the label name exists in the repo's label list → use it as-is
- If it does not exist → create it:
  ```
  gh label create "<name>" --color "<hex>" --description ""
  ```
  Use these default colors:
  | Label | Hex |
  |-------|-----|
  | bug | #d73a4a |
  | enhancement | #a2eeef |
  | dependencies | #0075ca |
  | documentation | #0075ca |
  | refactor | #e4e669 |
  | ci | #f9d0c4 |
  | breaking-change | #e11d48 |
  | chore | #fef3c7 |
  | performance | #d946ef |

---

## Step 7 — Assemble and submit

Build the final PR body by filling in the template from Step 3:

**Filling the template sections:**

`## Description`
→ Replace the HTML comment with the 1–2 sentence description from Step 4.

`## Fixes / Changes`
→ Replace the HTML comment with the verb-first bullet list from Step 4.

`## Type of Change`
→ Check `[x]` the one type that matches the change type from Step 4. Leave all others `[ ]`.

`## Jira / Linear Ticket`
→ Replace the HTML comment with the ticket ID from Step 5A (or `-`).

`## How Have You Tested?`
→ Check `[x]` the test methods the user selected in Step 5B. Leave others `[ ]`.

`## Checklist`
→ Pre-check these based on diff evidence:
- `[x] My code follows the project's code standards and style guidelines` — always pre-checked
- `[x] I have performed a self-review of my own code` — always pre-checked
- `[x] I have added/updated tests that prove my fix or feature works` — only if tests were detected in diff
- `[ ] All existing tests pass locally` — leave unchecked (user must verify)
- `[x] This change requires a documentation update` — check if docs update was flagged in Step 4
- `[ ] I have updated the documentation accordingly` — leave unchecked (user must verify)
- `[x] I have checked for and resolved any merge conflicts` — always pre-checked
- `[ ] Any dependent changes have been merged and published` — leave unchecked

`## Additional Notes`
→ Keep the HTML comment placeholder. Do not fill this in.

### Submit — New PR

```
gh pr create \
  --base <resolved-base-branch> \
  --title "<type>(<scope>): <title>" \
  --body "<assembled body>" \
  --assignee @me \
  --label "<label1>" \
  --label "<label2>" \
  --draft
```

Add one `--label` flag per label. If no labels, omit the `--label` flags.

### Submit — Update existing PR

If a PR was detected in Step 2 and new commits exist:
```
gh pr edit <pr-number> \
  --title "<updated title>" \
  --body "<updated body>" \
  --add-label "<label>"
```

Add one `--add-label` flag per new label.

---

## Step 8 — Success output

After the `gh` command succeeds, print:

```
PR created ✓ — fill in Additional Notes on GitHub and remove the draft flag when ready.
<pr-url>
```

For updates, say "PR updated ✓" instead.

---

## Error reference

| Situation | What to do |
|-----------|------------|
| Empty diff | "No changes detected between this branch and `<base>`. Nothing to PR." |
| config.json missing | "Config not found. Re-run `npx @ravilabs/draft-pr` to set up." |
| gh not authenticated | Surface preflight error. Suggest: `gh auth login` |
| Branch not pushed | Surface preflight warning. Suggest: `git push -u origin HEAD` |
| On base branch | Surface preflight error with branch name |
| gh pr create fails | Show the raw error from gh and stop |
