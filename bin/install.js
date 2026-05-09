#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(__dirname, '..');
const CWD = process.cwd();

// ─── Output helpers ──────────────────────────────────────────────────────────

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
  dim: '\x1b[2m',
};

const ok  = (msg) => console.log(`${c.green}✓${c.reset} ${msg}`);
const warn = (msg) => console.log(`${c.yellow}⚠${c.reset} ${msg}`);
const err  = (msg) => console.log(`${c.red}✗${c.reset} ${msg}`);
const dim  = (msg) => console.log(`${c.dim}${msg}${c.reset}`);

function printHeader() {
  console.log();
  console.log(`${c.cyan}${c.bold}  ╭─────────────────────────────╮${c.reset}`);
  console.log(`${c.cyan}${c.bold}  │  @ravilabs/draft-pr setup   │${c.reset}`);
  console.log(`${c.cyan}${c.bold}  ╰─────────────────────────────╯${c.reset}`);
  console.log();
}

// ─── Line-queue input ─────────────────────────────────────────────────────────
//
// readline fires all 'line' events immediately when stdin is a pipe, before any
// rl.question() call has a chance to register. The queue below captures lines as
// they arrive and hands them to waiters (pending ask() calls) in order. Works
// identically for TTY (interactive) and non-TTY (piped / redirected) input.

function createLineQueue() {
  const queue   = [];
  const waiters = [];

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: process.stdin.isTTY ?? false,
  });

  rl.on('line', (line) => {
    if (waiters.length > 0) {
      waiters.shift()(line);
    } else {
      queue.push(line);
    }
  });

  return {
    ask(prompt) {
      process.stdout.write(prompt);
      return new Promise((resolve) => {
        if (queue.length > 0) {
          resolve(queue.shift());
        } else {
          waiters.push(resolve);
        }
      });
    },
    close() {
      rl.close();
    },
  };
}

// ─── Filesystem helpers ──────────────────────────────────────────────────────

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function copyFile(src, dest) {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function copyDirRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  ensureDir(dest);
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// ─── PR template detection ───────────────────────────────────────────────────

const STANDARD_TEMPLATE_PATHS = [
  '.github/pull_request_template.md',
  '.github/PULL_REQUEST_TEMPLATE.md',
  'docs/pull_request_template.md',
];

function detectExistingTemplate() {
  for (const rel of STANDARD_TEMPLATE_PATHS) {
    if (fs.existsSync(path.join(CWD, rel))) return rel;
  }
  return null;
}

function installDefaultTemplate() {
  const src  = path.join(PKG_ROOT, 'skills', 'draft-pr', 'templates', 'pr_template.md');
  const dest = path.join(CWD, '.github', 'pull_request_template.md');
  copyFile(src, dest);
}

// ─── Question 1: PR template ─────────────────────────────────────────────────

async function askTemplateQuestion(lq) {
  console.log();
  const answer = await lq.ask(
    `Do you already have a PR template in this project?\n  (.github/pull_request_template.md or similar) [y/N]: `
  );

  const yes = /^y(es)?$/i.test(answer.trim());

  if (yes) {
    const found = detectExistingTemplate();
    if (found) {
      ok(`Found existing template at: ${c.cyan}${found}${c.reset}`);
      return { prTemplate: found, useExistingTemplate: true };
    } else {
      console.log();
      warn(`No template file found at standard locations.\n  I'll install the default template and you can replace it later.`);
      installDefaultTemplate();
      return { prTemplate: '.github/pull_request_template.md', useExistingTemplate: false };
    }
  } else {
    installDefaultTemplate();
    ok(`Default PR template installed at .github/pull_request_template.md`);
    return { prTemplate: '.github/pull_request_template.md', useExistingTemplate: false };
  }
}

// ─── Question 2: Default base branch ─────────────────────────────────────────

async function askBranchQuestion(lq) {
  console.log();
  let branch = (
    await lq.ask(
      `What is the default branch you want to raise PRs against?\n  (e.g. main, master, develop) [required]: `
    )
  ).trim();

  while (!branch) {
    branch = (await lq.ask(`Branch name is required. Please enter a branch name: `)).trim();
  }

  return branch;
}

// ─── Config writer ────────────────────────────────────────────────────────────

function writeConfig(configDir, config) {
  ensureDir(configDir);
  fs.writeFileSync(
    path.join(configDir, 'config.json'),
    JSON.stringify(config, null, 2) + '\n',
    'utf8'
  );
}

// ─── Skill installer ──────────────────────────────────────────────────────────

async function installSkillFiles(lq, skillDestDir) {
  if (fs.existsSync(path.join(skillDestDir, 'SKILL.md'))) {
    console.log();
    const answer = await lq.ask(
      `${c.yellow}draft-pr skill already installed.${c.reset} Overwrite with latest version? (y/N): `
    );
    if (!/^y(es)?$/i.test(answer.trim())) {
      dim('Skipping skill file update. Config was still saved.');
      return;
    }
  }

  const skillSrcDir = path.join(PKG_ROOT, 'skills', 'draft-pr');

  copyFile(
    path.join(skillSrcDir, 'SKILL.md'),
    path.join(skillDestDir, 'SKILL.md')
  );

  copyDirRecursive(
    path.join(skillSrcDir, 'scripts'),
    path.join(skillDestDir, 'scripts')
  );

  const preflightDest = path.join(skillDestDir, 'scripts', 'preflight.sh');
  if (fs.existsSync(preflightDest)) {
    fs.chmodSync(preflightDest, 0o755);
  }

  copyDirRecursive(
    path.join(skillSrcDir, 'templates'),
    path.join(skillDestDir, 'templates')
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  printHeader();

  const lq = createLineQueue();

  try {
    // Steps 2–4: questions → config → skill files
    const templateConfig = await askTemplateQuestion(lq);
    const baseBranch     = await askBranchQuestion(lq);

    console.log();

    const skillDestDir = path.join(CWD, '.claude', 'skills', 'draft-pr');

    writeConfig(skillDestDir, {
      defaultBaseBranch: baseBranch,
      prTemplate: templateConfig.prTemplate,
      useExistingTemplate: templateConfig.useExistingTemplate,
      installedAt: new Date().toISOString(),
      version: '0.1.0',
    });

    await installSkillFiles(lq, skillDestDir);

    // Step 5: Success
    console.log();
    ok(`draft-pr skill installed to .claude/skills/draft-pr/`);
    ok(`Config saved (base branch: ${c.cyan}${baseBranch}${c.reset}, template: ${c.cyan}${templateConfig.prTemplate}${c.reset})`);
    console.log();
    console.log(`${c.bold}  Next step:${c.reset} Restart Claude Code to register the skill.`);
    console.log();
    console.log(`${c.bold}  Usage in Claude Code:${c.reset}`);
    console.log(`    ${c.cyan}/draft-pr${c.reset}             → creates PR against ${c.bold}${baseBranch}${c.reset}`);
    console.log(`    ${c.cyan}/draft-pr main${c.reset}        → creates PR against main (overrides config)`);
    console.log(`    ${c.cyan}/draft-pr develop${c.reset}     → creates PR against develop (overrides config)`);
    console.log();
    dim(`  To reconfigure, re-run: npx @ravilabs/draft-pr`);
    console.log();
  } finally {
    lq.close();
  }
}

main().catch((e) => {
  err(`Unexpected error: ${e.message}`);
  process.exit(1);
});
