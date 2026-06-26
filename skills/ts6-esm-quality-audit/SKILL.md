---
name: ts6-esm-quality-audit
description: 审查并修复 TypeScript 6.0 ESM 项目的代码质量、结构规范、命名标准、函数冗余与注释规范问题。
scope:
  tasks:
    - typescript代码审查
    - esm规范检查
    - 项目结构治理
    - 命名规范审查
    - 函数冗余检测与修复
    - 代码注释规范审查
  targets:
    - tsconfig.json
    - package.json
    - src/**/*.ts
    - src/**/*.mts
    - tests/**/*.ts
    - '**/index.ts'
  excludes:
    - 非TypeScript项目
    - CommonJS-only且无迁移ESM计划项目
    - 仅要求风格建议且明确禁止任何修复与计划输出的场景
context:
  - name: repository_tree
    label: 仓库目录结构
    required: true
    source: project_file
    description: 用于识别分层边界、模块划分与目录异常
  - name: tsconfig
    label: TypeScript配置
    required: true
    source: project_file
    description: 用于校验 module/moduleResolution/strict/noUnused 系列基线
  - name: package_manifest
    label: 包配置
    required: true
    source: project_file
    description: 用于校验 type=module、exports、imports、scripts 与依赖约束
  - name: comment_standard
    label: 注释规范
    required: true
    source: references
    description: 用于审查文件头部、函数、类型、导出注释是否符合团队标准
workflow:
  step_1:
    name: collect_context
    label: 收集上下文
    action: 读取项目结构与关键配置并建立审查上下文
    uses:
      - references/review-checklist.md
      - references/comment-standard.md
      - assets/rule-config.yaml
      - scripts/scan-structure.ts
    on_failure: abort
    idempotent: true
    description: 收集 tsconfig.json、package.json、目录结构、注释规范并明确扫描边界
  step_2:
    name: validate_esm_baseline
    label: 校验ESM基线
    action: 校验 TypeScript 6.0 + ESM 所需关键配置与导入导出模式
    uses:
      - scripts/scan-structure.ts
      - scripts/esm-resolver.ts
      - references/review-checklist.md
    on_failure: collect_all
    idempotent: true
    description: 检查 module、moduleResolution、type字段、扩展名策略、路径别名解析一致性
  step_3:
    name: inspect_quality_naming_comments
    label: 审查质量命名与注释
    action: 扫描复杂度、命名一致性、注释规范与可维护性
    uses:
      - scripts/analyze-quality.ts
      - scripts/check-comments.ts
      - references/naming-standard.md
      - references/comment-standard.md
    on_failure: collect_all
    idempotent: true
    description: 识别超长函数、高复杂度、弱命名、注释缺失/缺标签、中文注释不一致等问题
  step_4:
    name: detect_duplicate_and_cycles
    label: 检测冗余与循环依赖
    action: 检测函数冗余与依赖环并输出重构建议
    uses:
      - scripts/detect-duplicates.ts
      - scripts/dependency-graph.ts
      - references/fix-strategy.md
    on_failure: warn_and_continue
    idempotent: true
    description: 输出重复逻辑分组与循环依赖链路，提供拆解建议
  step_5:
    name: generate_fix_plan
    label: 生成修复计划
    action: 按严重级别与风险分层形成可执行修复清单
    uses:
      - templates/fix-plan.yaml.tpl
      - references/fix-strategy.md
    on_failure: collect_all
    idempotent: true
    description: 生成 must/should/may 分级修复计划，明确自动修复与人工修复边界
  step_6:
    name: apply_safe_fixes
    label: 应用安全修复
    action: 对低风险问题执行自动修复并记录变更
    uses:
      - scripts/apply-fixes.ts
      - assets/rule-config.yaml
    condition: auto_fix == true
    on_failure: warn_and_continue
    idempotent: false
    description: 自动修复无用导入、相对导入扩展名、轻量命名问题
  step_7:
    name: generate_reports
    label: 生成审查报告
    action: 输出结构化审查报告、PR摘要与辅助产物
    uses:
      - scripts/generate-report.ts
      - scripts/pr-summary.ts
      - templates/audit-report.md.tpl
      - assets/report.schema.json
    on_failure: abort
    idempotent: true
    description: 产出 markdown/json 主报告、重复组、依赖环与 PR 摘要
input:
  primary_format: markdown
  fallback_format: yaml
  formats:
    - type: markdown
      description: 自然语言描述审查目标、范围与限制
    - type: yaml
      extensions: [.yaml, .yml]
      description: 结构化输入（项目路径、扫描范围、阈值、自动修复开关）
    - type: directory
      description: 直接传入项目目录供扫描
  schema:
    type: object
    required:
      - project_path
      - auto_fix
    properties:
      project_path:
        type: string
      scan_scope:
        type: array
        items:
          type: string
      exclude_paths:
        type: array
        items:
          type: string
      auto_fix:
        type: boolean
      severity_threshold:
        type: string
        enum: [must, should, may]
      changedOnly:
        type: boolean
      baseRef:
        type: string
output:
  primary_format: markdown
  formats:
    - type: markdown
      description: 人类可读审查报告
    - type: json
      condition: 需要接入CI或机器消费结果时
      description: 结构化问题清单与统计摘要
    - type: yaml
      condition: 需要修复排期与任务拆分时
      description: 分阶段修复计划
rules:
  - name: enforce_esm_consistency
    label: 强制ESM一致性
    description: TypeScript与package模块制式必须一致
    severity: must
  - name: enforce_comment_standard
    label: 强制注释规范
    description: 文件头部、函数标签、异步标记、中文注释与导出边界必须符合团队规范
    severity: must
  - name: enforce_structure_clarity
    label: 保持结构清晰
    description: 目录分层应清晰、职责明确
    severity: should
  - name: reduce_function_redundancy
    label: 减少函数冗余
    description: 对重复逻辑进行抽象复用
    severity: should
done:
  - 已完成 TypeScript 6.0 ESM 基线一致性审查
  - 已输出结构、命名、冗余、注释规范分级问题清单
  - 已生成修复计划并明确自动/人工边界
  - auto_fix=true 时已输出修复记录与回滚建议
---

# Skill
**ts6-esm-quality-audit**  
审查并修复 TypeScript 6.0 ESM 项目的代码质量、项目结构、命名标准、函数冗余与注释规范问题。

## 基本信息
- 名称：ts6-esm-quality-audit
- 版本：1.5.3
- 生命周期状态：draft

## 适用范围
- TS6.0+ESM 审查与修复
- 注释规范审查（文件头、函数、类型、index导出边界）

## 上下文要求
- 仓库目录结构、tsconfig、package、注释规范文档

## 工作流
- 收集上下文 → ESM校验 → 质量/命名/注释审查 → 冗余/依赖检测 → 修复计划 → 自动修复 → 报告输出

## 输入规范
- markdown / yaml / directory

## 输出规范
- markdown 主报告 + json 结构化报告 + 辅助产物

## 执行规则
- must：ESM一致性、注释规范一致性
- should：结构、命名、冗余治理

## 文件索引
| 路径 | 类型 | 用途 | 调用时机 | 是否必须 |
|---|---|---|---|---|
| SKILL.md | 主文件 | 技能入口与契约说明 | 执行前读取 | 必须 |
| metadata.yaml | 元数据 | 版本与状态管理 | 执行前读取 | 必须 |
| references/ | 参考资料 | 审查规则与注释规范 | step_1~step_5 按需读取 | 必须 |
| references/comment-standard.md | 参考资料 | 注释标准定义 | step_1、step_3 | 必须 |
| scripts/ | 脚本 | 扫描、分析、修复、报告生成 | step_1~step_7 | 必须 |
| scripts/check-comments.ts | 脚本 | 注释规范检测 | step_3 | 必须 |
| assets/ | 静态资源 | 规则与schema | step_1、step_7 | 必须 |
| templates/ | 模板 | 报告/修复计划模板 | step_5、step_7 | 必须 |
| examples/ | 示例 | 输入输出样例 | 开发测试时按需 | 必须 |
| tests/ | 测试 | 结构/契约/IO/流程测试 | 审查模式或CI调用 | 必须 |
| outputs/ | 输出 | 审查产物目录 | step_7 输出 | 必须 |

## 完成标准
- 注释规范检查已执行并输出问题
- must 级问题可定位且有修复建议
- 主输出与声明格式一致

## 无效情况
- 缺少注释规范关键检查
- 缺少 must 级规则执行结果
- 输出格式与声明不一致
