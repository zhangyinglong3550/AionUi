# 外部 CLI 会话桥接（Claude / Codex）

## 背景

终端里的 Claude Code / Codex 会话落在固定目录，但 **不会自动出现在 AionUi 会话列表**。  
本仓库 `packages/external-cli-sessions` 提供扫描 + 与 `acp_session` 匹配的 MVP，便于远程发现「能否在 AionUi 继续」。

## 目录

| 来源 | 路径 |
|------|------|
| Claude Code | `~/.claude/projects/**/<sessionId>.jsonl` |
| Codex | `~/.codex/sessions/**/rollout-*-<sessionId>.jsonl` |
| AionUi 绑定 | `~/.aionui/aionui-backend.db` → `acp_session.session_id` |

## 使用

见 [packages/external-cli-sessions/README.md](../../packages/external-cli-sessions/README.md)。

## 绑定（共享，不复制）

```bash
node src/cli.js bind --source codex --session-id <UUID>
# 或 Web UI 点「绑定到 AionUi（共享）」
```

实现：创建 AionUi conversation → 写 `acp_session.session_id` → `runtime/ensure` 触发 ACP `session/load`。  
已验证：load 后 `session_id` 保持为外部 id，与 `~/.codex/sessions` 同一会话。

## 后续（产品化）

1. aioncore 原生支持 create 时传入 `session_id`（免 sqlite 旁路写）  
2. WebUI：会话列表增加「外部 CLI」分区  
3. 手机：直接嵌进 WebUI 路由，无需独立 18765 端口  
