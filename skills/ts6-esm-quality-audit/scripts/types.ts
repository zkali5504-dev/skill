export type Severity = "must" | "should" | "may";

export interface AuditInput {
  projectPath: string;
  scanScope?: string[];
  excludePaths?: string[];
  autoFix: boolean;
  severityThreshold?: Severity;
  tsVersionExpected?: string;
  changedOnly?: boolean;
  baseRef?: string;
}

export interface Finding {
  id: string;
  severity: Severity;
  category: "esm" | "structure" | "naming" | "quality" | "duplicate" | "fix" | "dependency";
  file?: string;
  message: string;
  suggestion: string;
  evidence?: string;
}

export interface AuditSummary {
  must: number;
  should: number;
  may: number;
}

export interface AuditResult {
  summary: AuditSummary;
  findings: Finding[];
  fix_plan: Array<{ id: string; severity: Severity; title: string; action: string }>;
  applied_fixes: Array<{ file: string; action: string; before?: string; after?: string }>;
  rollback_notes: string[];
}
