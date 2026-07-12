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
| 把任意终端会话自动「导入」成全新 AionUi 会话并 ACP load | ⚠️ 需 aioncore 支持 `session/load` 外部 id；本 MVP 做绑定建议与命令，不写脏 DB |

## 快速开始

```bash
cd packages/external-cli-sessions

# 列出最近会话
node src/cli.js list --limit 30

# 启动本地 Web UI（手机经 Tailscale 访问时加 --host 0.0.0.0）
node src/cli.js serve --port 18765
# 浏览器打开 http://127.0.0.1:18765/?token=<启动时打印的 token>
```

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
