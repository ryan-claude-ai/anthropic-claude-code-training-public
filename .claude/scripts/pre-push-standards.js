#!/usr/bin/env node
/**
 * Pre-push standards check.
 *
 * Wired as a PreToolUse hook on Bash in .claude/settings.json. It ignores every
 * command except a git push, so the cost on an ordinary command is one process
 * start and an early exit.
 *
 * It reads only ADDED lines in the change, so a rule already broken elsewhere in
 * a file does not block work that did not break it. Each finding cites the
 * numbered item in docs/ORG-STANDARDS.md that it violates, because that is what
 * a reviewer here cites.
 *
 * Exit 0  — nothing to say. Silent on purpose.
 * Exit 2  — blocked. The message on stderr is what Claude is handed.
 */

const { execSync } = require("node:child_process")

function sh(command) {
  try {
    return execSync(command, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
  } catch {
    return ""
  }
}

function readStdin() {
  try {
    return require("node:fs").readFileSync(0, "utf8")
  } catch {
    return ""
  }
}

// --- 1. Is this a push? -----------------------------------------------------

const raw = readStdin()
let command = ""
try {
  command = JSON.parse(raw)?.tool_input?.command ?? ""
} catch {
  command = raw
}

if (!/\bgit\s+push\b/.test(command)) process.exit(0)

// --- 2. What is about to go out? -------------------------------------------

const base = sh("git rev-parse --verify --quiet main").trim() ? "main" : ""
let diff = base ? sh(`git diff ${base}...HEAD -U0`) : ""
let scope = `commits on this branch vs ${base}`

if (!diff.trim()) {
  // No commits yet, or no base to compare against. Check what is on disk so the
  // hook still says something useful rather than passing by default.
  diff = sh("git diff HEAD -U0")
  scope = "uncommitted working tree (branch has no commits yet)"
}

// A new file is not in `git diff` until it is tracked, and a whole new file is
// exactly where a rule is most likely to be broken for the first time. Treat
// every line of an untracked file as added.
const untracked = sh("git ls-files --others --exclude-standard")
  .split("\n")
  .map((f) => f.trim())
  .filter(Boolean)

if (!diff.trim() && untracked.length === 0) process.exit(0)

// --- 3. Added lines only ----------------------------------------------------

const added = []
let file = ""
let lineNumber = 0

for (const line of diff.split("\n")) {
  if (line.startsWith("+++ b/")) {
    file = line.slice(6)
    continue
  }
  if (line.startsWith("@@")) {
    // @@ -old,n +new,n @@ — the number after + is where this hunk starts.
    const m = /\+(\d+)/.exec(line)
    lineNumber = m ? Number(m[1]) : 0
    continue
  }
  if (line.startsWith("+") && !line.startsWith("+++")) {
    added.push({ file, line: lineNumber, text: line.slice(1) })
    lineNumber += 1
  }
}

for (const path of untracked) {
  if (!/\.(ts|tsx|js|jsx)$/.test(path)) continue
  let text = ""
  try {
    text = require("node:fs").readFileSync(path, "utf8")
  } catch {
    continue
  }
  text.split("\n").forEach((t, i) => {
    added.push({ file: path, line: i + 1, text: t })
  })
}

// Tool configuration is not product code, and the checker would otherwise match
// its own rule strings. The standards apply to what ships, not to the thing that
// enforces them.
const code = added.filter(
  (a) => /\.(ts|tsx|js|jsx)$/.test(a.file) && !a.file.startsWith(".claude/"),
)

// --- 4. The checks ----------------------------------------------------------

const MONEY_CONTEXT = /amount|total|fee|net|gross|refund|price|minor/i

const checks = [
  {
    item: "#1/#2",
    name: "Money is integer minor units, formatted once",
    hit: (t) =>
      (/\bparseFloat\s*\(/.test(t) && MONEY_CONTEXT.test(t)) ||
      (/\.toFixed\s*\(/.test(t) && MONEY_CONTEXT.test(t)) ||
      (/\/\s*100\b/.test(t) && MONEY_CONTEXT.test(t)),
    why: "a float or a formatter result in an amount path",
  },
  {
    item: "#4/#5",
    name: "Store and bucket in UTC",
    hit: (t) =>
      /\.(getMonth|getDate|getHours|getFullYear)\s*\(/.test(t) ||
      /setHours\s*\(\s*0/.test(t) ||
      /toLocaleDateString\s*\(/.test(t),
    why: "a local-time call; bucketing and comparison must be UTC",
  },
  {
    item: "#10",
    name: "No debris",
    hit: (t) =>
      /\bconsole\.(log|warn|error|debug)\s*\(/.test(t) ||
      /\b(TODO|FIXME|HACK|XXX)\b/.test(t),
    why: "console output or a pending-work marker on its way to main",
  },
]

const findings = []
for (const line of code) {
  for (const check of checks) {
    if (check.hit(line.text)) {
      findings.push({ ...line, check })
    }
  }
}

// --- 5. Report --------------------------------------------------------------

if (findings.length === 0) process.exit(0)

const out = []
out.push(`Push blocked: ${findings.length} standards finding(s).`)
out.push(`Checked: ${scope}. Added lines only.`)
out.push("")

for (const f of findings) {
  out.push(`  ${f.check.item}  ${f.check.name}`)
  out.push(`      ${f.file}:${f.line}`)
  out.push(`      ${f.text.trim().slice(0, 100)}`)
  out.push(`      ${f.check.why}`)
  out.push("")
}

out.push("See docs/ORG-STANDARDS.md. Fix these, or say why each one is correct")
out.push("and push again — the check reads added lines, so a justified exception")
out.push("needs a human decision, not a flag.")

process.stderr.write(out.join("\n") + "\n")
process.exit(2)
