#!/usr/bin/env node
// Configurable code-quality scanner driven by .github/code-quality-rules.json.
// Emits .github/code-quality-report.md and exits non-zero if any "fail"-severity rule hit.
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, extname } from "node:path";

const ROOT = process.cwd();
const config = JSON.parse(readFileSync(join(ROOT, ".github/code-quality-rules.json"), "utf8"));

const TEXT_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".rs", ".mjs", ".cjs"]);

function isExcludedDir(name) {
  return config.excludeDirs.includes(name);
}

function isExcludedFile(relPath, base) {
  if (config.excludeFiles.some((glob) => matchGlob(glob, base))) return true;
  if (config.excludePaths.some((p) => relPath.startsWith(p) || relPath.includes(`/${p}`))) return true;
  return false;
}

function matchGlob(glob, name) {
  if (!glob.includes("*")) return glob === name;
  const re = new RegExp("^" + glob.split("*").map(escapeRe).join(".*") + "$");
  return re.test(name);
}
function escapeRe(s) {
  return s.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
}

function walk(dir, files) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (!isExcludedDir(entry)) walk(full, files);
    } else if (TEXT_EXT.has(extname(entry))) {
      const rel = relative(ROOT, full);
      if (!isExcludedFile(rel, entry)) files.push(full);
    }
  }
}

const files = [];
walk(ROOT, files);

const rules = config.rules.map((r) => ({ ...r, re: new RegExp(r.pattern, r.flags ? r.flags + "g" : "g") }));

const findings = [];
for (const file of files) {
  let content;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  const lines = content.split("\n");
  for (const rule of rules) {
    lines.forEach((line, i) => {
      rule.re.lastIndex = 0;
      if (rule.re.test(line)) {
        findings.push({
          rule: rule.id,
          severity: rule.severity,
          description: rule.description,
          file: relative(ROOT, file),
          line: i + 1,
          snippet: line.trim().slice(0, 160),
        });
      }
    });
  }
}

const failCount = findings.filter((f) => f.severity === "fail").length;
const warnCount = findings.filter((f) => f.severity === "warn").length;

const byRule = {};
for (const f of findings) {
  (byRule[f.rule] ??= []).push(f);
}

let report = `# Code Quality Report\n\nGenerated: ${new Date().toISOString()}\n\n`;
report += `**Fail-severity findings:** ${failCount}\n**Warn-severity findings:** ${warnCount}\n\n`;

if (findings.length === 0) {
  report += "No findings.\n";
} else {
  for (const [ruleId, items] of Object.entries(byRule)) {
    const severity = items[0].severity;
    report += `## ${ruleId} (${severity}, ${items.length} hit${items.length === 1 ? "" : "s"})\n\n`;
    for (const f of items) {
      report += `- \`${f.file}:${f.line}\` — ${f.snippet}\n`;
    }
    report += "\n";
  }
}

writeFileSync(join(ROOT, "code-quality-report.md"), report);
console.log(report);

if (failCount > 0) {
  console.error(`::error::${failCount} fail-severity code quality finding(s). See code-quality-report.md`);
  process.exit(1);
}
if (warnCount > 0) {
  console.warn(`::warning::${warnCount} warn-severity code quality finding(s).`);
}
