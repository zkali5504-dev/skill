import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { scanStructure } from "./scan-structure.js";
import { analyzeQuality } from "./analyze-quality.js";
import { detectDuplicates } from "./detect-duplicates.js";
import { applyFixes } from "./apply-fixes.js";
import { buildResult, toMarkdown } from "./generate-report.js";
import { listTsFilesByGlobsFallback } from "./utils.js";
import { analyzeWithAst } from "./ast-analyzer.js";
import { checkEsmImportResolvable } from "./esm-resolver.js";
import { detectCircularDependencies } from "./dependency-graph.js";
import { checkStructureRules } from "./structure-rules.js";
import { generatePrSummary } from "./pr-summary.js";
import { checkCommentStandard } from "./check-comments.js";
import { getChangedTsFiles } from "./git-changed-files.js";
import type { AuditInput, Severity } from "./types.js";

function loadInput(inputPath: string): AuditInput {
  if (!fs.existsSync(inputPath)) throw new Error(`输入文件不存在: ${inputPath}`);
  const raw = fs.readFileSync(inputPath, "utf8");
  if (inputPath.endsWith(".json")) return JSON.parse(raw) as AuditInput;
  return YAML.parse(raw) as AuditInput;
}

function ensureOutputDir(projectPath: string) {
  const dir = path.join(projectPath, "outputs");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function parseCli(argv: string[]) {
  return {
    changedOnly: argv.includes("--changed-only"),
    baseRef: argv.find((x) => x.startsWith("--base-ref="))?.split("=")[1]
  };
}

async function main() {
  const inputPath = process.argv[2] ?? "../examples/input-project-manifest.yaml";
  const cli = parseCli(process.argv.slice(3));
  const input = loadInput(inputPath);

  const changedOnly = cli.changedOnly || input.changedOnly === true;
  const baseRef = cli.baseRef || input.baseRef;
  const threshold: Severity = input.severityThreshold ?? "may";

  const structure = scanStructure(input.projectPath);
  const scanScope = input.scanScope ?? [];
  const excludes = [...new Set([...(input.excludePaths ?? []), ...structure.exclude])];

  const allCandidateFiles = scanScope.length
    ? listTsFilesByGlobsFallback(input.projectPath, scanScope.map((s) => `${s}/**/*.ts`), excludes)
    : listTsFilesByGlobsFallback(input.projectPath, structure.include, excludes);

  const changedFiles = changedOnly ? getChangedTsFiles(input.projectPath, baseRef) : [];
  const files = changedOnly
    ? allCandidateFiles.filter((f) => changedFiles.includes(path.resolve(f)))
    : allCandidateFiles;

  const lexicalFindings = analyzeQuality(files).findings;
  const duplicateFindings = detectDuplicates(input.projectPath, scanScope.length ? scanScope : ["src"], excludes).findings;
  const astResult = analyzeWithAst(input.projectPath, files);
  const esmResult = checkEsmImportResolvable(files);
  const depResult = detectCircularDependencies(files);
  const structureRuleResult = checkStructureRules(input.projectPath, files);
  const commentResult = checkCommentStandard(files);

  const allFindings = [
    ...structure.findings,
    ...lexicalFindings,
    ...duplicateFindings,
    ...astResult.findings,
    ...esmResult.findings,
    ...depResult.findings,
    ...structureRuleResult.findings,
    ...commentResult.findings
  ];

  const { applied, rollback } = applyFixes(input.autoFix, allFindings, changedOnly ? files : undefined);
  const result = buildResult(allFindings, threshold, applied, rollback);
  const markdown = toMarkdown(result, input.projectPath);
  const prSummary = generatePrSummary(result);

  const outDir = ensureOutputDir(input.projectPath);
  fs.writeFileSync(path.join(outDir, "audit-report.md"), markdown, "utf8");
  fs.writeFileSync(path.join(outDir, "audit-report.json"), JSON.stringify(result, null, 2), "utf8");
  fs.writeFileSync(path.join(outDir, "duplicate-groups.json"), JSON.stringify(astResult.duplicateGroups, null, 2), "utf8");
  fs.writeFileSync(path.join(outDir, "dependency-cycles.json"), JSON.stringify(depResult.cycles, null, 2), "utf8");
  fs.writeFileSync(path.join(outDir, "pr-summary.md"), prSummary, "utf8");

  console.log("审查完成:");
  console.log(`- changedOnly: ${changedOnly ? "true" : "false"}`);
  if (changedOnly) console.log(`- changedFiles: ${files.length}`);
  console.log(`- ${path.join(outDir, "audit-report.md")}`);
  console.log(`- ${path.join(outDir, "audit-report.json")}`);
  console.log(`- ${path.join(outDir, "duplicate-groups.json")}`);
  console.log(`- ${path.join(outDir, "dependency-cycles.json")}`);
  console.log(`- ${path.join(outDir, "pr-summary.md")}`);
}

main().catch((e) => {
  console.error("执行失败:", e.message);
  process.exit(1);
});
