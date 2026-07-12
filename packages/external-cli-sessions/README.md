# External CLI Sessions（Claude / Codex → AionUi）

扫描本机固定目录中的 **Claude Code** / **Codex** 会话，并与 AionUi 的 `acp_session` 做匹配，方便你在手机 / WebUI 上找到「能接着聊」的入口。

## 能力范围（MVP）

| 能力 | 状态 |
|------|------|
| 扫描 `~/.claude/projects/**/*.jsonl` | ✅ |
| 扫描 `~/.codex/sessions/**/rollout-*.jsonl` | ✅ |
| 匹配 AionUi `acp_session.session_id` → 已有对话 | ✅ |
| 打开 AionUi WebUI 对话（`/#/conversation/:id`） | ✅ 已匹配时 |
| 生成终端 resume 命令 | ✅ 未匹配时 |
| **绑定共享**（建 conversation + `acp_session.session_id` = 外部 id + `session/load`） | ✅ Codex / Claude PoC（不复制 jsonl） |

## 快速开始

```bash
cd packages/external-cli-sessions

# 列出最近会话
node src/cli.js list --limit 30

# 绑定一条「仅 CLI」会话到 AionUi（共享同一 session_id，不复制文件）
node src/cli.js bind --source codex --session-id <UUID>

# 启动本地 Web UI（手机经 Tailscale 访问时加 --host 0.0.0.0）
node src/cli.js serve --port 18765
# 浏览器打开 http://127.0.0.1:18765/?token=<启动时打印的 token>
# 页面上对「仅 CLI」条目点「绑定到 AionUi（共享）」
```

### 绑定原理

1. `POST /api/conversations` 创建 AionUi 对话壳  
2. 写 `acp_session.session_id = 外部 CLI session_id`（**共享**，不拷贝 jsonl）  
3. `runtime/ensure` → ACP `session/load` 加载该 id  
4. 打开 `/#/conversation/<新 id>` 继续聊  

环境变量 `AIONUI_BASE_URL`（默认 `http://127.0.0.1:63695`）指向本机 aioncore。

环境变量（可选）：

| 变量 | 默认 |
|------|------|
| `HOME` | 系统 home |
| `AIONUI_DATA_DIR` | `~/.aionui` |
| `AIONUI_WEBUI_BASE` | `http://127.0.0.1:25808`（也可填 Tailscale HTTPS 入口） |
| `EXTERNAL_SESSIONS_TOKEN` | 随机生成 |

## 手机远程用法

1. Mac 上 AionUi + WebUI 保持运行  
2. `node src/cli.js serve --host 0.0.0.0 --port 18765 --webui-base 'https://你的.ts.net:8443'`  
3. 手机浏览器打开：`http://<Mac-Tailscale-IP>:18765/?token=...`  
4. 列表中：  
   - **已在 AionUi**：点「打开 AionUi 对话」→ 进原会话续聊  
   - **仅 CLI**：点「复制 resume 命令」或在本机终端执行（完整 ACP 导入留给后续）

## 验收清单

- [ ] `node --test test/*.test.js` 通过  
- [ ] `node src/cli.js list` 能列出本机 Claude/Codex 会话  
- [ ] 对 AionUi 已创建过的 Codex/Claude 会话显示 `aionuiConversationId`  
- [ ] serve 页面可筛选、可打开已匹配对话  

## 安全

- 默认监听 `127.0.0.1`；对公网暴露前务必设 token，并优先只在 Tailnet 内访问  
- 会话摘要可能含项目路径与用户消息片段，勿转发 token 与页面链接到公网
