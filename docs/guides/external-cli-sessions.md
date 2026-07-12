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

## 后续（产品化）

1. aioncore：支持创建 conversation 时传入外部 `session_id` 并走 `session/load`  
2. WebUI：会话列表增加「外部 CLI」分区  
3. 手机：直接嵌进 WebUI 路由，无需独立 18765 端口  
