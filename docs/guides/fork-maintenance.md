# 自有 Fork 维护说明（会话绑定 + 官方更新）

## 仓库

- 上游：https://github.com/iOfficeAI/AionUi  
- 你的 Fork：https://github.com/zhangyinglong3550/AionUi  
- 功能分支：`feature/external-cli-session-browser`

## 定期合并官方更新

```bash
cd /path/to/AionUi
git remote add upstream https://github.com/iOfficeAI/AionUi.git   # 若尚未添加
git fetch upstream
git checkout feature/external-cli-session-browser
git merge upstream/main   # 或 rebase
# 解决冲突后：重点检查 packages/external-cli-sessions 与 settings/cli-sessions
git push fork feature/external-cli-session-browser
```

## 桌面 App 内入口（需用本 fork 构建）

设置 → **CLI 会话 / 绑定**（`/settings/cli-sessions`）  
内嵌 external-cli UI；本机需 `external-cli-sessions` 服务（18765 或 Caddy `/external-cli/`）。

当前**官网安装的 AionUi.app** 不含此菜单，除非用本仓库重新打包安装。

## 会话何时可见（同步机制）

不是实时推送，而是 **打开列表时扫磁盘**：

1. Claude / Codex / Grok 把会话写到本机固定目录（发消息/落盘后）  
2. 打开 CLI 会话页（或点刷新）→ 扫描目录  
3. 新会话出现 → 可绑定 / 打开  

因此：在 Codex 刚说完一句话，通常 **几秒内写盘**；打开绑定页刷新即可看到，无需等云同步。
