import path from "node:path";
import ts from "typescript";

function hasTopLevelDoc(text: string): boolean {
  return text.trimStart().startsWith("/**");
}

function buildFileHeader(filePath: string): string {
  const moduleName = path.basename(filePath, path.extname(filePath));
  return `/**
 * @packageDocumentation
 * @module 模块名 ${moduleName}
 * @since 版本 1.0.0 不变
 * @author zkali
 * @tags [自动生成]
 * @description 请补充文件功能描述
 * @path ${filePath.replace(/\\/g, "/")}
 */
`;
}

function hasNearbyJSDoc(source: string, pos: number): boolean {
  const prefix = source.slice(Math.max(0, pos - 600), pos);
  const start = prefix.lastIndexOf("/**");
  const end = prefix.lastIndexOf("*/");
  return start !== -1 && end > start;
}

function isNodeExported(node: ts.Node): boolean {
  const mods = (node as ts.HasModifiers).modifiers;
  return !!mods?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
}

function functionName(node: ts.Node, sf: ts.SourceFile): string {
  if ((ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) && node.name) return node.name.getText(sf);
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) return node.name.text;
  return "anonymous";
}

function buildFunctionDoc(name: string, params: string[], isAsync: boolean): string {
  const p = params.length
    ? params.map((x) => ` * @param ${x} ${x} 参数说明`).join("\n")
    : " * @param void 无参数";
  return `/**
 * @function ${name}
 * @description 请补充函数功能描述
${p}
 * @returns 返回值说明
 * @throws 异常说明${isAsync ? "\n * @async" : ""}
 */
`;
}

function buildTypeDoc(kind: "interface" | "type", name: string): string {
  return `/**
 * @${kind} ${name}
 * @description 请补充${kind === "interface" ? "接口" : "类型"}说明
 */
`;
}

export function fixComments(filePath: string, sourceText: string): { content: string; changed: boolean; actions: string[] } {
  let content = sourceText;
  const actions: string[] = [];

  if (!hasTopLevelDoc(content)) {
    content = `${buildFileHeader(filePath)}\n${content}`;
    actions.push("补齐文件头注释");
  }

  const sf = ts.createSourceFile(filePath, content, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const inserts: Array<{ pos: number; text: string }> = [];

  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) && isNodeExported(node)) {
      const start = node.getStart(sf);
      if (!hasNearbyJSDoc(content, start)) {
        const name = functionName(node, sf);
        const params = node.parameters.map((p) => p.name.getText(sf));
        const isAsync = !!node.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword);
        inserts.push({ pos: start, text: buildFunctionDoc(name, params, isAsync) });
      }
    }

    if ((ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) && isNodeExported(node)) {
      const start = node.getStart(sf);
      if (!hasNearbyJSDoc(content, start)) {
        const name = node.name.getText(sf);
        inserts.push({
          pos: start,
          text: buildTypeDoc(ts.isInterfaceDeclaration(node) ? "interface" : "type", name)
        });
      }
    }

    ts.forEachChild(node, visit);
  };

  ts.forEachChild(sf, visit);

  inserts.sort((a, b) => b.pos - a.pos);
  for (const i of inserts) content = content.slice(0, i.pos) + i.text + content.slice(i.pos);

  if (inserts.length) actions.push(`补齐公开导出 API 注释 ${inserts.length} 处`);
  return { content, changed: actions.length > 0, actions };
}
