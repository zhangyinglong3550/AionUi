---
name: aionui-fork-maintain
description: |
  维护 zhangyinglong 的 AionUi Fork：检查官方更新、merge 上游、会话绑定（Claude/Codex/Grok）、
  打 Mac 包、重装 Android 壳、Caddy/external-cli serve。
  当用户说「AionUi 官方更新了」「合并上游」「会话绑定」「打 Mac 包」「AionUi fork」「CLI 会话迁移」时使用。
---

# AionUi Fork 维护 Skill

## 仓库与路径（已验证）

| 项 | 路径 / URL |
|----|------------|
| 本地 monorepo | `/Users/zhangyinglong/file/codex/AionUi` |
| 功能分支 | `feature/external-cli-session-browser` |
| 官方上游 remote | `origin` → `https://github.com/iOfficeAI/AionUi.git` |
| 用户 Fork remote | `fork` → `https://github.com/zhangyinglong3550/AionUi.git` |
| CLI 会话包 | `packages/external-cli-sessions/` |
| 桌面入口 | 设置 → CLI 会话 / 绑定（`/settings/cli-sessions`） |
| Android 壳 | `/Users/zhangyinglong/file/grok/aionui-android-shell` |
| Android APK | `/Users/zhangyinglong/file/grok/AionUi-remote-debug.apk` |
| serve 脚本 | `/Users/zhangyinglong/file/grok/aionui-external-sessions/start-serve.sh` |
| token 文件 | `/Users/zhangyinglong/file/grok/external-sessions-token.txt` |
| Caddy | `~/.aionui/caddy/Caddyfile`（含 `/external-cli/*`） |
| 说明 | 仓库根 `FORK_README.md` |

## 用户如何唤起本 skill

用户可以说（任选）：

- 「按 **aionui-fork-maintain** 检查官方有没有更新」
- 「合并 AionUi 上游」
- 「会话绑定 / CLI 会话迁移」
- 「打 AionUi Mac 包」
- 「重装手机 AionUi 壳」

Agent 应 **先读本 SKILL.md**，再执行对应任务，不要从零重新调研架构。

---

## 任务 A：检查官方是否更新

```bash
cd /Users/zhangyinglong/file/codex/AionUi
./scripts/check-upstream-updates.sh
# 或
gh release list -R iOfficeAI/AionUi --limit 5
git fetch origin
git log --oneline HEAD..origin/main | head -20
```

有 `STATUS=UPSTREAM_AHEAD` 或 `NEW_RELEASE` → 进入任务 B。

---

## 任务 B：合并上游并推送 Fork

```bash
cd /Users/zhangyinglong/file/codex/AionUi
git checkout feature/external-cli-session-browser
git fetch origin
git merge origin/main   # 有冲突则优先保留 packages/external-cli-sessions 与 cli-sessions 设置页
# 验证
cd packages/external-cli-sessions && node --test test/*.test.js && node src/cli.js list --limit 3
git push fork feature/external-cli-session-browser
```

冲突原则：

1. 不删 `packages/external-cli-sessions`
2. 保留 `CliSessionsSettings` 路由与 SettingsSider 入口
3. 若 aioncore / create conversation API 变了，只改编 `bind.js`

---

## 任务 C：会话列表 / 绑定（不打包）

```bash
# 确保 aioncore 在跑（AionUi 已启动）
/Users/zhangyinglong/file/grok/aionui-external-sessions/start-serve.sh
cd /Users/zhangyinglong/file/codex/AionUi/packages/external-cli-sessions
node src/cli.js list --limit 15
node src/cli.js bind --source codex|claude|grok --session-id <UUID>
```

同步机制：**打开列表时扫磁盘**，不是实时推送。  
绑定 = 共享 `session_id`（`session/load`），不复制 jsonl。

手机：App 菜单「CLI 会话 / 绑定」或  
`https://zhangyinglongmacbook-pro.tail2ec02b.ts.net:8443/external-cli/?token=<token>`

---

## 任务 D：打 Mac 安装包

```bash
cd /Users/zhangyinglong/file/codex/AionUi
git checkout feature/external-cli-session-browser
bun install
# 本机未签名包（便于本地装）
export CSC_IDENTITY_AUTO_DISCOVERY=false
# 仅当前架构可加快速度
node scripts/build-with-builder.js auto --mac --arm64
# 产物一般在 out/
ls -lh out/*.dmg out/*.zip 2>/dev/null
# 复制到交付目录
cp -f out/*.dmg /Users/zhangyinglong/file/grok/ 2>/dev/null || true
```

安装：可能需右键打开（未签名）。  
**注意**：自建包与官网自动更新是两条线。

---

## 任务 E：重装 Android 壳

```bash
export ANDROID_HOME=/Users/zhangyinglong/file/grok/android-sdk
export JAVA_HOME=/Library/Java/JavaVirtualMachines/jdk-17.jdk/Contents/Home
cd /Users/zhangyinglong/file/grok/aionui-android-shell
./gradlew :app:assembleDebug
cp -f app/build/outputs/apk/debug/app-debug.apk /Users/zhangyinglong/file/grok/AionUi-remote-debug.apk
```

菜单「CLI 会话 / 绑定」→ 默认打开 WebUI 同源 `/external-cli/?token=...`。  
若改 token，同步改 `strings.xml` 的 `default_cli_sessions_token` 与 `external-sessions-token.txt`。

---

## 任务 F：Caddy /external-cli 健康检查

```bash
TOKEN=$(cat /Users/zhangyinglong/file/grok/external-sessions-token.txt)
curl -sk "https://zhangyinglongmacbook-pro.tail2ec02b.ts.net:8443/external-cli/api/health?token=$TOKEN"
caddy reload --config /Users/zhangyinglong/.aionui/caddy/Caddyfile
```

---

## 完成回复模板

- 做了什么（merge / 打包 / 绑定）  
- 产物路径  
- 如何验证  
- 剩余风险（签名、上游冲突、serve 未启动）  
