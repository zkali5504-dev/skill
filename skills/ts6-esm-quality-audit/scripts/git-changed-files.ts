import { execSync } from "node:child_process";
import path from "node:path";

function run(cmd: string, cwd: string): string {
  return execSync(cmd, { cwd, stdio: ["ignore", "pipe", "ignore"] }).toString("utf8").trim();
}

export function getChangedTsFiles(projectPath: string, baseRef?: string): string[] {
  try {
    const diffCmd = baseRef
      ? `git diff --name-only ${baseRef}...HEAD`
      : `git diff --name-only --cached && git diff --name-only`;

    const output = run(diffCmd, projectPath)
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

    const tsFiles = output
      .filter((f) => /\.(ts|mts|tsx)$/.test(f))
      .map((f) => path.resolve(projectPath, f));

    return [...new Set(tsFiles)];
  } catch {
    return [];
  }
}
