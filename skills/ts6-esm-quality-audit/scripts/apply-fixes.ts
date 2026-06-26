import { readText, writeText } from "./utils.js";
import { fixComments } from "./comment-fixer.js";
import type { Finding } from "./types.js";

function normalizeImportExtensions(content: string): string {
  return content.replace(/(from\s+["'])(\.{1,2}\/[^"']+?)(["'])/g, (_m, p1, p2, p3) => {
    if (/\.(js|mjs|cjs|ts|mts|tsx|json)$/.test(p2)) return `${p1}${p2}${p3}`;
    return `${p1}${p2}.js${p3}`;
  });
}

function removeUnusedImports(content: string): string {
  const lines = content.split("\n");
  const imports = lines.filter((l) => l.trim().startsWith("import "));
  const body = lines.filter((l) => !l.trim().startsWith("import ")).join("\n");
  const kept: string[] = [];

  for (const line of imports) {
    const mNamed = line.match(/import\s+\{\s*([^}]+)\s*\}\s+from\s+["'][^"']+["']/);
    if (mNamed) {
      const names = mNamed[1].split(",").map((s) => s.trim()).filter(Boolean);
      const used = names.filter((n) => new RegExp(`\\b${n}\\b`).test(body));
      if (used.length) kept.push(line.replace(mNamed[1], used.join(", ")));
      continue;
    }
    const mDef = line.match(/import\s+([A-Za-z0-9_$]+)\s+from\s+["'][^"']+["']/);
    if (mDef) {
      if (new RegExp(`\\b${mDef[1]}\\b`).test(body)) kept.push(line);
      continue;
    }
    kept.push(line);
  }

  return [...kept, body].join("\n");
}

export function applyFixes(autoFix: boolean, findings: Finding[], onlyFiles?: string[]) {
  const applied: Array<{ file: string; action: string; before?: string; after?: string }> = [];
  const rollback: string[] = [];
  if (!autoFix) return { applied, rollback };

  const scoped = onlyFiles?.length ? new Set(onlyFiles) : null;
  const files = [...new Set(findings.map((f) => f.file).filter(Boolean) as string[])]
    .filter((f) => (scoped ? scoped.has(f) : true));

  for (const file of files) {
    const before = readText(file);
    let after = before;
    const actions: string[] = [];

    const a1 = removeUnusedImports(after);
    if (a1 !== after) { after = a1; actions.push("清理未使用导入"); }

    const a2 = normalizeImportExtensions(after);
    if (a2 !== after) { after = a2; actions.push("规范相对导入扩展名"); }

    const a3 = after.replace(/\bdoStuff\b/g, "executeTask").replace(/\bhandleData\b/g, "processData").replace(/\btemp\b/g, "temporaryValue");
    if (a3 !== after) { after = a3; actions.push("弱语义命名标准化"); }

    const c = fixComments(file, after);
    if (c.changed) { after = c.content; actions.push(...c.actions); }

    if (after !== before) {
      writeText(file, after);
      applied.push({ file, action: `自动修复：${actions.join(" + ")}` });
      rollback.push(`如需回滚 ${file}，请通过 Git 恢复此文件。`);
    }
  }

  return { applied, rollback };
}
