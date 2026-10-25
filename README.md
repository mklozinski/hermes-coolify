# Hermes Agent on Coolify

Deploy [Hermes Agent](https://github.com/NousResearch/hermes-agent) with a self-hosted [Camoufox](https://github.com/daijro/camoufox) browser on Coolify. Unofficial community deployment; not affiliated with Nous Research.

## Deploy

1. Add a **Git repository → Docker Compose** resource in Coolify using this repository.
2. Keep the base directory `/` and Compose file `/docker-compose.yml`. Build from the full repository, not pasted Compose text alone.
3. Set your environment variables in Coolify:

   ```dotenv
   OPENROUTER_API_KEY=your-provider-key
   LLM_MODEL=your-model-name
   TELEGRAM_BOT_TOKEN=your-bot-token
   TELEGRAM_ALLOWED_USERS=your-telegram-user-id
   BROWSER_TOKEN=your-long-random-secret
   BROWSER_PROXY_STRING=
   ```

   Use your own values. Generate a browser token with `openssl rand -hex 32`. Secrets need runtime availability; don't commit them to Git.
4. Deploy and check the gateway/browser logs. Message your bot to verify it responds.

Other providers and channels are configured through the variables in `docker-compose.yml`. For OpenAI-compatible providers use `OPENAI_API_KEY`, `OPENAI_BASE_URL`, and `LLM_MODEL`. Discord uses `DISCORD_BOT_TOKEN` and `DISCORD_ALLOWED_USERS`. Keep user allowlists restricted.

See the [Hermes documentation](https://hermes-agent.nousresearch.com/docs/) for provider login, channel setup, tools, and configuration.

## Browser and optional proxy

The browser service uses Camoufox (Firefox) through the [Camofox REST server](https://github.com/jo-inc/camofox-browser) and Hermes's official Camofox plugin. It is **not Chromium CDP**. Keep the browser API private: no public domain or host port is needed.

The gateway installs and enables the pinned official plugin on first boot (Internet access is needed). Existing plugin installations and configuration are left alone. If you have customized platform tool lists, run `hermes tools` in the gateway terminal and enable **camofox** for your channel. Disable the standard **browser** toolset unless you separately configure a Chromium backend.

```dotenv
# Direct browsing:
BROWSER_PROXY_STRING=

# Authenticated SOCKS5 proxy:
BROWSER_PROXY_STRING=socks5://username:password@proxy.example:1080
```

A bare `username:password@host:port` is also treated as SOCKS5. URL-encode reserved characters in credentials. Empty means direct; a configured proxy must not silently fall back to direct browsing. Recreate the browser container after changing its proxy, then check the public IP from a new browser session.

Camoufox can reduce automation detection, but access to protected sites and CAPTCHA handling are not guaranteed. The official plugin does not support Hermes's Chromium vault-fill tool; page snapshots may expose filled password fields. Don't send passwords or two-factor codes in chat. This recipe does not provide a public interactive login viewer.

### Migrating from Browserless

Remove the old `BROWSER_CDP_URL` and Browserless-only settings from Coolify. Remove any public Browserless domain before redeploying. Camoufox cannot reuse Chromium's saved profile; keep the old browser volume for rollback rather than deleting it. Gateway data and credentials remain on their existing volumes.

## Data and updates

- `hermes-data` stores Hermes configuration, credentials, sessions, plugins, and installed CLI tools.
- `hermes-workspace` stores workspace files.
- `browser-data` stores Camoufox profile checkpoints under `/data/profiles`. Hermes uses temporary browser identities by default; enable `browser.camofox.managed_persistence` in its configuration if you want logins reused between sessions. Stop the browser gracefully so profiles can be saved.
- Do not delete persistent volumes when redeploying. Back them up before upgrades.
- Edit `/root/.hermes/config.yaml` through the gateway terminal when needed, then restart through Coolify—not by launching a second gateway inside the container.
- `HERMES_REF` defaults to `main`. Use **Build without cache** to fetch fresh upstream code, or set a compatible release tag for controlled updates.

Global npm tools installed from the gateway terminal use persistent storage. For example, `npm install -g @openai/codex` followed by `codex login --device-auth` keeps its installation and login across rebuilds.

## Optional webhooks

Set `WEBHOOK_ENABLED=true`, `WEBHOOK_PORT=8644`, and a strong `WEBHOOK_SECRET`. Route a Coolify HTTPS domain to the gateway's port 8644; do not publish an unprotected host port. Configure routes with `hermes webhook add` and follow the [webhook documentation](https://hermes-agent.nousresearch.com/docs/user-guide/messaging/webhooks/).

## Troubleshooting

- **No bot replies:** verify provider credentials, channel tokens, and allowed user IDs.
- **Browser unavailable:** inspect the browser logs and check `hermes camofox status` in the gateway terminal.
- **Wrong browser IP:** verify the proxy value is available at runtime, recreate the browser, and test a fresh session.
- **Older upstream code after redeploy:** rebuild without cache.

Adapted from [creazy231/hermes-agent-coolify](https://github.com/creazy231/hermes-agent-coolify). Hermes and the browser projects retain their respective licenses.
