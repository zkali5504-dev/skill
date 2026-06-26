cd skills/ts6-esm-quality-audit/scripts
npm install
npm run build

# 仅修复/审查变更文件（相对 origin/main）
node dist/run-audit.js ../examples/input-project-manifest.yaml --changed-only --base-ref=origin/main

# 全量模式
node dist/run-audit.js ../examples/input-project-manifest.yaml
