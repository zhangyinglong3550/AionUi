/**
 * Desktop settings page: CLI session list / bind (Claude · Codex · Grok).
 * Embeds the external-cli-sessions UI served on the Mac (Caddy /external-cli/ or localhost:18765).
 */
import React, { useMemo, useState } from 'react';
import { Alert, Button, Input, Space, Typography } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';

const DEFAULT_TOKEN_KEY = 'aionui_external_cli_token';
const DEFAULT_BASE_KEY = 'aionui_external_cli_base';

function defaultBase(): string {
  // Prefer same-origin reverse proxy when opened via WebUI/Caddy; else local serve.
  if (typeof window !== 'undefined' && window.location?.protocol === 'https:') {
    return `${window.location.origin}/external-cli`;
  }
  return 'http://127.0.0.1:18765';
}

const CliSessionsSettings: React.FC = () => {
  const { t } = useTranslation();
  const [base, setBase] = useState(() => {
    try {
      return localStorage.getItem(DEFAULT_BASE_KEY) || defaultBase();
    } catch {
      return defaultBase();
    }
  });
  const [token, setToken] = useState(() => {
    try {
      return localStorage.getItem(DEFAULT_TOKEN_KEY) || '182ba44fffca398461fc4968';
    } catch {
      return '182ba44fffca398461fc4968';
    }
  });
  const [reloadKey, setReloadKey] = useState(0);

  const iframeSrc = useMemo(() => {
    const b = base.replace(/\/$/, '');
    const q = token ? `?token=${encodeURIComponent(token)}` : '';
    return `${b}/${q}`.replace(/([^:]\/)\/+/g, '$1');
  }, [base, token, reloadKey]);

  const save = () => {
    try {
      localStorage.setItem(DEFAULT_BASE_KEY, base.trim());
      localStorage.setItem(DEFAULT_TOKEN_KEY, token.trim());
    } catch {
      /* ignore */
    }
    setReloadKey((k) => k + 1);
  };

  return (
    <div className='flex h-full min-h-0 flex-col gap-12px p-16px'>
      <div>
        <Typography.Title heading={5} style={{ marginTop: 0 }}>
          {t('settings.cliSessions', { defaultValue: 'CLI 会话 / 绑定' })}
        </Typography.Title>
        <Typography.Paragraph type='secondary' style={{ marginBottom: 8 }}>
          {t('settings.cliSessionsDesc', {
            defaultValue:
              '扫描本机 Claude Code / Codex / Grok 会话，绑定到 AionUi（共享 session_id，不复制）。打开列表后可绑定并进入对话。',
          })}
        </Typography.Paragraph>
      </div>

      <Alert
        type='info'
        content={t('settings.cliSessionsHint', {
          defaultValue:
            '需本机 external-cli-sessions 服务在跑（默认 18765，或经 Caddy /external-cli/）。LaunchAgent 可开机自启。',
        })}
      />

      <Space wrap>
        <Input
          style={{ width: 360 }}
          addBefore='Base'
          value={base}
          onChange={setBase}
          placeholder='http://127.0.0.1:18765 或 https://host/external-cli'
        />
        <Input
          style={{ width: 280 }}
          addBefore='Token'
          value={token}
          onChange={setToken}
          placeholder='token'
        />
        <Button type='primary' onClick={save}>
          {t('common.apply', { defaultValue: '应用并刷新' })}
        </Button>
        <Button
          onClick={() => {
            window.open(iframeSrc, '_blank', 'noopener,noreferrer');
          }}
        >
          {t('common.openExternal', { defaultValue: '外部窗口打开' })}
        </Button>
      </Space>

      <div className='min-h-0 flex-1 overflow-hidden rounded-8px border border-[var(--color-border-2)]'>
        <iframe
          key={reloadKey}
          title='cli-sessions'
          src={iframeSrc}
          style={{ width: '100%', height: '100%', border: 0, minHeight: 480, background: '#0f1115' }}
          allow='clipboard-read; clipboard-write'
        />
      </div>
    </div>
  );
};

export default CliSessionsSettings;
