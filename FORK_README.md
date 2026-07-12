# 本 Fork 定制说明（zhangyinglong3550/AionUi）

> 上游官方仓库：[iOfficeAI/AionUi](https://github.com/iOfficeAI/AionUi)  
> 本 Fork：https://github.com/zhangyinglong3550/AionUi  
> 功能分支：`feature/external-cli-session-browser`  
> **当前基底版本：官方 v2.1.33（aioncore v0.1.45）+ 本分支 CLI 会话能力**  
> 最近一次 merge：`origin/main` → feature（2026-07-12，无冲突）

本仓库在**官方 AionUi 基础上**增加「CLI 会话发现 / 绑定 / 手机远程」能力。  
日常聊天仍走 AionUi 官方能力；会话复用是叠加层，通过 **merge 上游** 持续跟进官方更新。

### 已知坑（已修）

| 问题 | 原因 | 处理 |
|------|------|------|
| 点设置白屏卡死 | `BUILTIN_TAB_IDS` 含 `cli-sessions`，但 `SettingsPageWrapper` 导航 map 漏了该项 → `undefined.id` | 已在 Wrapper 注册 `cli-sessions` 并 filter 空项 |
| 2.1.29 装到 2.1.33 库上迁移失败 | aioncore 降级，缺 migration 19/20 | 必须用 ≥2.1.33 基底 + 对应 aioncore 打包；勿只装旧 DMG |

---

## 我们加了什么

| 模块 | 路径 | 作用 |
|------|------|------|
| CLI 会话扫描 + 绑定 | `packages/external-cli-sessions/` | 扫描 Claude / Codex / Grok 本机会话；绑定到 AionUi（**共享 session_id，不复制文件**） |
| 桌面设置页入口 | `packages/desktop/.../CliSessionsSettings.tsx` | 设置 → **CLI 会话 / 绑定**，App 内嵌绑定 UI |
| 路由 / 侧栏 | `Router.tsx`、`SettingsSider.tsx` | `/settings/cli-sessions` |
| 维护文档 | `docs/guides/external-cli-sessions.md`、`docs/guides/fork-maintenance.md` | 绑定原理、合并上游、同步机制 |
| 本说明 | `FORK_README.md` | Fork 总览 |

### 支持的 CLI 会话源

| 来源 | 磁盘位置 | 绑定后 resume |
|------|----------|----------------|
| Claude Code | `~/.claude/projects/**/*.jsonl` | `claude --resume <id>` |
| Codex | `~/.codex/sessions/**/rollout-*.jsonl` | `codex resume <id>` |
| Grok CLI | `~/.grok/sessions/<cwd>/<id>/` | `grok --resume <id>` |

### 手机端（旁路，不在本 monorepo 打包内）

| 项 | 路径 |
|----|------|
| Android WebView 壳 | `/Users/zhangyinglong/file/grok/aionui-android-shell` |
| 安装包 | `/Users/zhangyinglong/file/grok/AionUi-remote-debug.apk` |
| 绑定页（Caddy） | `https://<你的.ts.net>:8443/external-cli/?token=...` |
| Mac 常驻 serve | `~/file/grok/aionui-external-sessions/start-serve.sh` + LaunchAgent |

---

## 使用（开发 / 本机）

```bash
# 扫会话
cd packages/external-cli-sessions
node src/cli.js list --limit 20

# 绑定（共享）
node src/cli.js bind --source codex --session-id <UUID>

# 本地/手机绑定页
node src/cli.js serve --host 0.0.0.0 --port 18765
```

桌面 App（**需用本 fork 构建**）：**设置 → CLI 会话 / 绑定**。

---

## 与官方的关系

```text
官方更新（上游 release / main）
        │  git fetch + merge
        ▼
本 Fork（保留 packages/external-cli-sessions + 设置页）
        │  自己打包
        ▼
你使用的桌面 App / 文档

手机壳 + serve：独立目录，不随官方 DMG 分发
```

- **会丢的**：只装官方官网包、不带我们 fork 的构建 → 没有设置里的绑定页。  
- **不会丢的**：磁盘上的 Claude/Codex/Grok 会话、`~/.aionui` 里已绑定的对话。

---

## 会话何时出现（同步机制）

**不是实时推送**，是 **打开列表时扫本机磁盘**：

1. 你在 Codex/Claude/Grok 里聊 → 写入本机固定目录  
2. 打开「CLI 会话」页或 `list` / 点刷新 → 扫目录  
3. 看到条目 → 绑定（仅 CLI）或直接打开（已在 AionUi）

一般写盘后 **秒级** 可见，无需云同步。

---

## 感知官方更新

```bash
# 仓库内脚本
./scripts/check-upstream-updates.sh

# 或手动
gh release list -R iOfficeAI/AionUi --limit 5
git fetch origin
git log HEAD..origin/main --oneline | head
```

可选：本机 cron / LaunchAgent 定期跑 `check-upstream-updates.sh`，有新版本写日志到 `~/file/grok/aionui-upstream-check.log`。

---

## 以后让 AI 帮你合并 / 打包

仓库与个人环境已放维护 Skill：

- 仓库：`.agents/skills/aionui-fork-maintain/SKILL.md`  
- 全局：`~/.agents/skills/aionui-fork-maintain/SKILL.md`  

你可以直接说：

- 「按 **aionui-fork-maintain** 检查官方有没有更新」  
- 「按 skill **合并上游并解决冲突**」  
- 「按 skill **打 Mac 包** / **重装 Android 壳**」  

不必重新解释整套背景。

---

## 相关链接

| 说明 | 链接/路径 |
|------|-----------|
| 功能分支 | `feature/external-cli-session-browser` |
| 上游 | https://github.com/iOfficeAI/AionUi |
| 维护 playbook | `docs/guides/fork-maintenance.md` |
| CLI 会话包 README | `packages/external-cli-sessions/README.md` |
