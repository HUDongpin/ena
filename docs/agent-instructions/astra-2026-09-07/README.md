# Astra 指令修订记录 — 2026-09-07

本轮根据已完成的六项审查修订指令，保留科学、安全和团队权限边界。

## 实际应用范围

- 已直接修改当前维护的 `/Volumes/Starship/ENA/j-3dENA/AGENTS.md`，所在分支 `codex/strict-gap-closure-20260821`，修订前 HEAD 为 `47e05006ff5308b6cb857111c2114e47e7bdfc6d`。
- 依赖、npm 缓存、历史恢复目录及其他 worktree 中的原件保留。本目录保存修订完成的 skills 和恢复文件版本，附来源、差异和验证记录。
- 本目录不属于 Codex 自动发现的 `.agents/skills` 路径；没有修改全局技能配置、注册或自动加载状态。两个 Playwright 版本分别保存，避免把同名技能和不同版本语法混在一起。
- 没有 commit、push、merge、部署或安装新依赖。

## 对应审查项

| 审查项 | 修订结果 | 文件 |
|---|---|---|
| 1 描述冗长 | Phaser migration 描述 74 → 15 词；new-features 描述 64 → 20 词，保留版本和任务边界 | [迁移技能](skills/phaser/v3-to-v4-migration/SKILL.md)、[新功能技能](skills/phaser/v4-new-features/SKILL.md) |
| 2 缺少按需加载 | Playwright 当前入口 420 → 48 行；旧版 328 → 48 行；命令与示例移入参考文档 | [当前 Playwright](skills/playwright-current/playwright-cli/SKILL.md)、[旧版 Playwright](skills/playwright-legacy/playwright-cli/SKILL.md) |
| 2 缺少按需加载 | Phaser 新功能入口 384 → 27 行，按具体功能路由到参考文档 | [Phaser 新功能入口](skills/phaser/v4-new-features/SKILL.md) |
| 3 固定串行配方 | 根据共享 session、文件和可变状态决定串行；隔离的任务可并行，结束后只回收自己的资源 | [测试生成与修复](skills/playwright-current/playwright-cli/references/test-generation.md) |
| 4 全量上下文 | 当前 j-3dENA 改为按任务读取科学、架构、UI 或历史材料；恢复的 MAIS 修订版只要求适用章节 | [当前 AGENTS 差异](evidence/j3dena-AGENTS.diff)、[MAIS 修订副本](recovered-mais/AGENTS.md) |
| 5 过度测试 | 已有失败用例或有效失败输出时直接定位该用例；未知失败范围或必要门禁才扩大运行范围 | [测试修复参考](skills/playwright-current/playwright-cli/references/test-generation.md) |
| 6 权限边界 | 审查未发现应删除的真实权限边界；修订版明确沿用已有授权，保护未授权的共享会话与测试验收契约 | [当前 Playwright 入口](skills/playwright-current/playwright-cli/SKILL.md) |

另将当前 j-3dENA 的 Worker-first 架构文字更新为项目已经接受的持久化 Node.js/TypeScript 决策。此处是现有决策的指令同步，不代表新的架构批准或部署完成。

## 保留内容

科学不变量、R/rENA 开发验证 oracle、数值容差和 golden 变更规范、类型身份、数据/AI 隐私、进程终止证据、独立科学与发布验收、外部状态变更授权及许可证要求保持原意。j-3dENA 的 12 个受保护章节逐字未变。

Playwright 当前/旧版分别保留 1.62.1 / 1.59.1 的命令语法与 LICENSE/NOTICE；Phaser 保留 MIT 许可证。原有 API 示例通过按需参考文档保存，Phaser 新功能的 11 个代码示例逐字保留。

独立场景复查还纠正了旧参考文档的四处冲突：已批准需求优先于应用当前表现；确认 bug 不自动授权跳过测试；清理发生在各自场景结束后；跨会话清理必须处于既有授权范围内。

## 验证

- 四个技能均通过官方 Skill Creator `quick_validate.py`。使用本机已有 PyYAML wheel 的纯 Python 读取方式，未安装或改动环境。
- 99 个 Markdown 相对文件/锚点链接检查通过，代码围栏中的示例输出不作为真实文件链接检查。
- j-3dENA 独立差异审查通过；普通 UI 拼写修改与 bootstrap 科学变更的上下文/验证范围得到区分。
- 三个技能使用场景通过独立静态复查：指定失败测试修复、隔离场景并行生成、Phaser Noise 最小设置。
- 根仓库与 j-3dENA 的 `git diff --check` 通过。
- 原依赖与历史来源文件的 SHA-256 保持不变；详细来源和修订哈希见映射记录。
- 未运行应用测试、浏览器或生产验证：本轮只修改文档与技能指令。场景复查是静态决策检查，不是运行时测试。

## 证据与来源

- [官方结构校验](evidence/quick-validate.json)
- [最终链接检查](evidence/final-link-check.json)
- [AGENTS 独立复查](evidence/j3dena-review.md)
- [技能场景复查](evidence/skill-scenarios-review.md)
- [Playwright 来源映射](evidence/playwright-source-map.json)
- [Phaser 来源映射](skills/phaser/source-mapping.json)
- [恢复 AGENTS 来源映射](recovered-mais/source-map.json)
- [当前 AGENTS 修改前内容](evidence/j3dena-AGENTS.before.md)

依据已打开核对的 [OpenAI Astra 指南](https://developers.openai.com/api/docs/guides/latest-model)、[技能编写与加载指南](https://learn.chatgpt.com/docs/build-skills) 和本机系统 Skill Creator 指令。结构校验通过不等于 OpenAI 对整套行为作出认证。
