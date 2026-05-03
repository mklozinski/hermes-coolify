# Hermes Agent on Coolify

A self-contained [Coolify](https://coolify.io/) Docker Compose for the [Hermes Agent](https://github.com/NousResearch/hermes-agent) by Nous Research, pre-wired for **Telegram, Discord, WhatsApp, Slack, Signal, and Home Assistant** messaging channels.

The image is built from an inline Dockerfile that clones the upstream Hermes repo at build time, so this repository contains nothing but the compose file and these instructions. Each rebuild fetches the latest source from `main` (see [Updating to latest](#updating-to-latest)).

> **Unofficial — not affiliated with Nous Research.** This is a community-maintained deployment recipe. Upstream Hermes is built from `main` by default, so behavior can change between rebuilds. Pin `HERMES_REF` to a tag/sha for anything you depend on (see [Updating to latest](#updating-to-latest)). Tested on Coolify v4.

## Prerequisites

- A running Coolify instance (v4+).
- An LLM API key from one of:
  - [OpenRouter](https://openrouter.ai/) (recommended - broad model access, single key).
  - Any OpenAI-compatible endpoint (vLLM, Ollama, LiteLLM, Together, Groq, llama.cpp, ...).
  - Built-in providers: GLM (Zhipu), Kimi (Moonshot), MiniMax.
- Bot tokens for at least one messaging platform (see [Channel setup](#channel-setup)).

## Deploy on Coolify

1. In Coolify: **Add new resource &rarr; Docker Compose**.
2. Either point the resource at this repository, or paste the contents of `docker-compose.yml` directly into Coolify's compose editor.
3. Open the **Environment Variables** tab and set the [required env vars](#required-environment-variables).
4. Click **Deploy**. The first build takes ~3-10 minutes (mostly the Python venv install).
5. Tail the container logs - you should see the gateway start and platform-specific connect lines (e.g. `Telegram bot @<name> online`).

No inbound ports need to be exposed: the gateway dials messaging APIs outbound. Use Coolify's built-in container terminal for any interactive flows (e.g. WhatsApp QR pairing).

## Required environment variables

You must set **one LLM provider** and **at least one messaging platform**.

### LLM provider (pick one)

| Variable | Notes |
| --- | --- |
| `OPENROUTER_API_KEY` | OpenRouter API key. |
| `LLM_MODEL` | Default `anthropic/claude-sonnet-4.6`. Any OpenRouter model slug works. |

Or, for a custom OpenAI-compatible provider:

| Variable | Notes |
| --- | --- |
| `OPENAI_API_KEY` | API key for your provider. |
| `OPENAI_BASE_URL` | e.g. `https://api.together.xyz/v1`, `http://ollama:11434/v1`. |
| `LLM_MODEL` | Model name as the provider expects it. |

Or, a built-in provider: set the matching pair, e.g. `GLM_API_KEY` + `GLM_BASE_URL`, `KIMI_API_KEY` + `KIMI_BASE_URL`, `MINIMAX_API_KEY` + `MINIMAX_BASE_URL`.

### Messaging (at least one)

| Platform | Required vars |
| --- | --- |
| Telegram | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALLOWED_USERS` |
| Discord | `DISCORD_BOT_TOKEN`, `DISCORD_ALLOWED_USERS` |
| WhatsApp | `WHATSAPP_ALLOWED_USERS` (set `WHATSAPP_ENABLED=true` after pairing) |
| Slack | `SLACK_BOT_TOKEN`, `SLACK_APP_TOKEN`, `SLACK_ALLOWED_USERS` |
| Signal | `SIGNAL_HTTP_URL`, `SIGNAL_ACCOUNT`, `SIGNAL_ALLOWED_USERS` |
| Home Assistant | `HASS_TOKEN`, `HASS_URL` |

`*_ALLOWED_USERS` is a comma-separated list of user IDs/handles permitted to talk to the agent. Leave it tight - the gateway defaults to deny-by-default (`GATEWAY_ALLOW_ALL_USERS=false`).

## Optional environment variables

| Group | Variables |
| --- | --- |
| Tools | `FIRECRAWL_API_KEY`, `FIRECRAWL_API_URL`, `FAL_KEY`, `HONCHO_API_KEY`, `ELEVENLABS_API_KEY`, `VOICE_TOOLS_OPENAI_KEY` |
| Browser (self-hosted sidecar) | `BROWSER_TOKEN` (required if using the sidecar), `BROWSER_CDP_URL` (override to point elsewhere or empty to disable), `BROWSER_KEEP_ALIVE` (true), `BROWSER_CONCURRENT` (3), `BROWSER_QUEUED` (3), `BROWSER_TIMEOUT_MS` (300000) |
| Browser (Browserbase / agent) | `BROWSERBASE_API_KEY`, `BROWSERBASE_PROJECT_ID`, `BROWSERBASE_PROXIES`, `BROWSERBASE_ADVANCED_STEALTH`, `BROWSER_SESSION_TIMEOUT`, `BROWSER_INACTIVITY_TIMEOUT` |
| Agent tuning | `HERMES_MAX_ITERATIONS` (90), `CONTEXT_COMPRESSION_ENABLED` (true), `CONTEXT_COMPRESSION_THRESHOLD` (0.85), `HERMES_HUMAN_DELAY_MODE`, `HERMES_HUMAN_DELAY_MIN_MS`, `HERMES_HUMAN_DELAY_MAX_MS` |
| Auxiliary models | `AUXILIARY_VISION_PROVIDER`, `AUXILIARY_VISION_MODEL`, `AUXILIARY_WEB_EXTRACT_PROVIDER`, `AUXILIARY_WEB_EXTRACT_MODEL`, `CONTEXT_COMPRESSION_PROVIDER`, `CONTEXT_COMPRESSION_MODEL` |
| Terminal backend | `TERMINAL_ENV` (local), `TERMINAL_TIMEOUT`, `TERMINAL_LIFETIME_SECONDS`, plus `TERMINAL_SSH_HOST/USER/PORT/KEY` for SSH backend. Working directory is set in `config.yaml` (`terminal.cwd`) — see [Customizing config.yaml](#customizing-configyaml). |
| Integrations | `GITHUB_TOKEN`, `TINKER_API_KEY`, `WANDB_API_KEY` |
| Debug | `WEB_TOOLS_DEBUG`, `VISION_TOOLS_DEBUG`, `MOA_TOOLS_DEBUG`, `IMAGE_TOOLS_DEBUG` |
| Build | `HERMES_REF` (default `main`) - set to a tag/sha to pin a version |

## Channel setup

### Telegram

1. Open a chat with [@BotFather](https://t.me/BotFather) and run `/newbot`. Save the token into `TELEGRAM_BOT_TOKEN`.
2. Find your numeric Telegram user ID (e.g. via [@userinfobot](https://t.me/userinfobot)) and put it in `TELEGRAM_ALLOWED_USERS` (comma-separated for multiple users).
3. Optional: pre-set a "home" channel where the bot will post unsolicited updates - `TELEGRAM_HOME_CHANNEL` (chat ID) and `TELEGRAM_HOME_CHANNEL_NAME`.

### Discord

1. Register a new application at [discord.com/developers/applications](https://discord.com/developers/applications). Under **Bot**, reset the token and put it in `DISCORD_BOT_TOKEN`.
2. Enable **Message Content Intent** and **Server Members Intent** on the same page.
3. Use the OAuth2 URL generator with scopes `bot` + `applications.commands` to invite the bot to your server.
4. Put your Discord user ID in `DISCORD_ALLOWED_USERS`.

### WhatsApp

WhatsApp uses an embedded WhatsApp-Web client and needs a one-time QR-code pairing.

1. Deploy with `WHATSAPP_ENABLED=false` (the default).
2. Once the container is running, open Coolify &rarr; the service &rarr; **Terminal**.
3. Run `hermes whatsapp` and scan the QR code with the WhatsApp app on your phone (**Settings &rarr; Linked Devices &rarr; Link a Device**).
4. Set `WHATSAPP_ENABLED=true` and `WHATSAPP_ALLOWED_USERS` (comma-separated phone numbers in international format, no `+`).
5. Redeploy. The pairing is persisted in the `hermes-data` volume.

### Slack

1. Create a Slack app in **Socket Mode** at [api.slack.com/apps](https://api.slack.com/apps).
2. Generate a **bot token** (`xoxb-...`) into `SLACK_BOT_TOKEN` and an **app-level token** with `connections:write` scope (`xapp-...`) into `SLACK_APP_TOKEN`.
3. Install the app to your workspace and add the bot to the channels you want.
4. Set `SLACK_ALLOWED_USERS` (Slack member IDs, e.g. `U01ABC...`).

### Signal

Signal uses an external [signal-cli-rest-api](https://github.com/bbernhard/signal-cli-rest-api) instance - run it as a separate Coolify service or container.

| Variable | Notes |
| --- | --- |
| `SIGNAL_HTTP_URL` | URL of your signal-cli-rest-api (e.g. `http://signal:8080`). |
| `SIGNAL_ACCOUNT` | The Signal phone number registered with the API. |
| `SIGNAL_ALLOWED_USERS` | Comma-separated phone numbers. |
| `SIGNAL_HOME_CHANNEL`, `SIGNAL_GROUP_ALLOWED_USERS` | Optional. |

### Home Assistant

1. In Home Assistant, create a **Long-Lived Access Token** (Profile &rarr; Security).
2. Set `HASS_TOKEN` and `HASS_URL` (e.g. `http://homeassistant.local:8123`).

## Updating to latest

`HERMES_REF` defaults to `main`, so a fresh build clones the latest upstream commit. **Docker caches the `git clone` layer**, so a normal redeploy will not pick up new commits. To force a refresh:

- In Coolify, redeploy with **Build without cache** / **Force Rebuild** ticked, **or**
- Bump any build-time input (e.g. switch `HERMES_REF` to a different value and back).

**For production, pin a version.** Tracking `main` is convenient for personal use but means upstream breakage can hit you mid-deploy. Set `HERMES_REF=v0.12.0` (or whatever the latest [release tag](https://github.com/NousResearch/hermes-agent/releases) is) and bump intentionally.

## Persistence

Two named Docker volumes hold all stateful data:

| Volume | Mount | Contains |
| --- | --- | --- |
| `hermes-data` | `/root/.hermes` | Config, skills, memory/memories, sessions, cron jobs, WhatsApp pairing, logs, image/audio caches. |
| `hermes-workspace` | `/root/workspace` | Agent's scratch workspace for terminal commands and file ops. |

These survive redeploys. **Do not delete them** unless you want a clean slate (you'll lose memory, sessions, and the WhatsApp pairing).

## Customizing config.yaml

Hermes auto-creates `/root/.hermes/config.yaml` on first boot (lives on the `hermes-data` volume, persists across rebuilds). Most things you'd want to tune are exposed as env vars in this compose, but a few upstream-deprecated settings now only live in `config.yaml`. To edit it:

```sh
# from the Coolify terminal in hermes-gateway
vi /root/.hermes/config.yaml
hermes restart   # or just restart the container in Coolify
```

Common overrides:

```yaml
terminal:
  cwd: /root/workspace            # working dir for shell commands

agents:
  defaults:
    model:
      fallback: gemini/gemini-3-pro
```

Settings explicitly exposed via env vars in `docker-compose.yml` take precedence over `config.yaml` for those specific keys. Settings not exposed (like the deprecated `TERMINAL_CWD`) must go in `config.yaml`.

## Self-hosted browser sidecar (`hermes-browser`)

The compose ships a `hermes-browser` service running [browserless/chromium v2](https://docs.browserless.io/) — a headless Chromium with both a Chrome DevTools Protocol endpoint (for Hermes) and a live interactive view (for you). Hermes connects automatically via `BROWSER_CDP_URL=ws://hermes-browser:3000/chromium?token=…`.

### Why this exists

- **Free alternative to [Browserbase](https://browserbase.com/)** — cloud browser services charge per session/hour; the sidecar costs nothing beyond your Coolify host's RAM.
- **Persistent profile** — cookies, logins, and extensions live on the `browser-data` volume and survive every restart/rebuild.
- **Manual login escape hatch** — browserless's [Live View](https://docs.browserless.io/baas/live-debugger) is a real-time interactive view of Chromium in a normal browser tab. Use it once to log into sites that need 2FA / captcha / OAuth; Hermes reuses the authenticated session afterwards.
- **Resource isolation** — Chromium is a memory pig; running it in its own container means a browser OOM doesn't take Hermes down (and vice versa).

### License note

Browserless v2 community edition is **free for self-hosted personal use**. Commercial use (selling it as part of a product, multi-tenant SaaS, etc.) requires a [paid license](https://www.browserless.io/license/community). If you need pure-OSS, change the image in `docker-compose.yml` to `chromedp/headless-shell:latest` (Apache-2.0) — you lose the live debug view but keep CDP. You'll also need to override `BROWSER_CDP_URL` in Coolify env (e.g. `ws://hermes-browser:9222`), since `headless-shell` doesn't expose `/chromium` and doesn't support token auth.

### Setup

1. **Generate a token.** In Coolify → service → **Environment Variables**, set:

   ```sh
   BROWSER_TOKEN=<long-random-string>
   ```

   Anyone with this token can drive the browser (and hence your logged-in sessions) — treat it like a password. A 32-character random hex string is fine: `openssl rand -hex 32`.

2. **Set the domain.** Coolify will surface a "Domains" field for the `hermes-browser` service (it reads this from the `SERVICE_FQDN_HERMES-BROWSER_3000` env var in the compose). Enter `browser.yourdomain.com` or whatever subdomain you like. Make sure DNS A-records for that name point to your Coolify host. Coolify auto-issues a Let's Encrypt cert.

3. **Redeploy.**

### Accessing the Live View (for manual logins)

Open `https://browser.yourdomain.com/?token=<your-token>` in your normal browser. You'll see the browserless dashboard. Use the "Live Sessions" or open a new debug session — you get a Chrome DevTools-style interactive view of the remote Chromium where you can click around, type, log into sites, accept cookie banners, and so on.

Anything you do is persisted in the `browser-data` volume, so the next time Hermes connects via CDP it sees you as logged-in.

### How Hermes connects

Already wired automatically by these compose lines:

```yaml
- TOKEN=${BROWSER_TOKEN:-}                                          # browserless side
- BROWSER_CDP_URL=ws://hermes-browser:3000/chromium?token=${BROWSER_TOKEN:-}  # Hermes side
```

Same `BROWSER_TOKEN` is used on both ends. As soon as you set it in Coolify env and redeploy, Hermes can use the browser.

### Optional: disable the sidecar entirely

If you'd rather use Browserbase (or no browser at all):

1. In `docker-compose.yml`, comment out or delete the `hermes-browser` service block, the `depends_on: [hermes-browser]` line, and the `browser-data:` volume entry.
2. Unset `BROWSER_CDP_URL` (or set to empty in Coolify env).
3. For Browserbase: set `BROWSERBASE_API_KEY` and `BROWSERBASE_PROJECT_ID` in Coolify env.

### Resource notes

- Idle Chromium uses ~300–500 MB RAM. Active sessions can push that to 1–2 GB.
- `shm_size: 2gb` is set on the service — Chromium needs a large `/dev/shm` to render tabs without crashing.
- First boot pulls a ~500 MB image. Subsequent restarts are instant (cached).
- `KEEP_ALIVE=true` keeps one Chromium process alive across Hermes connect/disconnect cycles, so logged-in state and warm pages survive.

### Compose quirks worth knowing

A few non-obvious settings on the `hermes-browser` service, in case you fork or modify the compose:

- **`user: "0:0"`** — the `browser-data` named volume is created root-owned by Docker, but browserless's default non-root user can't write into it, so every new CDP session would fail with `EACCES: permission denied, mkdir '/data/browserless-data-dir-...'`. Chromium itself still runs sandboxed (browserless adds `--no-sandbox` automatically when running as root).
- **`DATA_DIR=/data`** (matching the mount target) — the browserless image does not auto-create subdirectories. Setting `DATA_DIR=/data/profile` while the volume mounts at `/data` fails on first boot with `Directory doesn't exist`.
- **`/chromium` in `BROWSER_CDP_URL`** — browserless v2 does not accept raw CDP websocket upgrades on the bare `/` path. `/chromium` is the actual CDP route; `/chromium/playwright` and `/chromium/puppeteer` exist for higher-level wire protocols if you ever need them.

## Persistent CLI tools (Codex, OpenCode, etc.)

You can install any CLI tool inside the container from the Coolify terminal and **both the binary and its login credentials will survive image rebuilds** — automatically, with no per-tool configuration.

How it works:

- `HOME` is set to `/root/.hermes/e-tools/home` (on the `hermes-data` volume), so every tool's dotfile dir (`~/.codex`, `~/.opencode`, `~/.config/foo`, ...) is persisted automatically.
- The npm global prefix is set to `/root/.hermes/e-tools/npm-global` (same volume), so every `npm install -g <pkg>` also lands on the volume.
- The container's entrypoint symlinks every binary from the persistent npm-global bin dir into `/usr/local/bin/` on each start. This makes user-installed CLIs callable from any shell — including login shells where `/etc/profile` would otherwise reset `PATH` to a Debian default that excludes the persistent prefix.
- Hermes finds its own data via `HERMES_HOME=/root/.hermes` (set explicitly), so it isn't affected by the `HOME` override.

Example — Codex CLI:

```sh
npm install -g @openai/codex
codex login --device-auth
```

Example — any other tool, same pattern, no extra config:

```sh
npm install -g opencode
opencode auth login

npm install -g @anthropic-ai/claude-code
claude /login
```

After a rebuild, open the terminal again and `which codex`, `codex whoami`, `which opencode`, etc. all keep working — no re-login needed.

### Caveats

- Anything you installed/authenticated **before** adding this configuration is on the overlay filesystem and is lost on the next rebuild. Re-run the install + login once after the upgrade; from then on it persists.
- If a tool reads its config exclusively via a hardcoded absolute path (very rare) or via `getpwuid(getuid())` instead of `$HOME` (also rare), it won't see the redirect. The vast majority of CLIs respect `$HOME`.

### Giving Hermes GitHub access (optional)

If you want Hermes to clone, push, open PRs, or create new repos:

1. Create a **fine-grained** PAT at <https://github.com/settings/personal-access-tokens>.
2. **Resource owner**: your account (or the org, if you want it on org repos — note org admins must allow fine-grained PATs in the org's settings).
3. **Repository access**:
   - **Only select repositories** if you want a tight blast radius (you'll have to add new repos to the token's list as you create them).
   - **All repositories** if you want zero friction including for repos Hermes itself creates.
4. **Repository permissions** — set to **Read and write**:
   - **Administration** (required for creating new repos).
   - **Contents** (clone, push, branches, releases).
   - **Pull requests**, **Issues**.
   - **Workflows** (only if Hermes will modify `.github/workflows/*` — pushes that touch workflow files are rejected without it).
5. Leave **Account permissions** and the rest of the repository permissions on **No access** unless you have a specific reason.
6. In Coolify → **Environment Variables** → set `GITHUB_TOKEN=github_pat_...` → restart.
7. In the container terminal, configure git once (persists across rebuilds via the `e-tools/home` volume):

   ```sh
   git config --global credential.helper 'store --file=/root/.hermes/e-tools/home/.git-credentials'
   echo "https://x-access-token:${GITHUB_TOKEN}@github.com" > /root/.hermes/e-tools/home/.git-credentials
   git config --global user.name  "Your Name"
   git config --global user.email "you@example.com"
   ```

After this, `git clone`, `git push`, and Hermes's built-in GitHub tools all use the token. Test:

```sh
curl -s -H "Authorization: Bearer $GITHUB_TOKEN" https://api.github.com/user | grep '"login"'
```

**Security note.** The token is stored plaintext at `/root/.hermes/e-tools/home/.git-credentials` on the persistent volume. That's standard for `credential.helper store` and acceptable on a personal Coolify instance you trust. If you don't, prefer one of:

- **`gh auth login`** — interactive device flow, no long-lived token to manage. Install `gh` from <https://cli.github.com/> into the persistent path (`/root/.hermes/e-tools/npm-global/bin/gh`) so it survives rebuilds.
- **SSH key** — `ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519 -N ""`, paste the public key into GitHub → Settings → SSH keys. Covers `git clone`/`push` for private repos via SSH; doesn't help with API operations.

**Why the on-disk credential helper instead of just the env var.** Hermes intentionally strips provider/tool secrets (including `GITHUB_TOKEN`) from the env it gives to terminal-tool subprocesses — see `tools/environments/local.py` upstream. That's why `git push` works (git reads the on-disk credential helper, which is unaffected) but a shell command like `echo $GITHUB_TOKEN` run by the agent comes back empty. If you specifically want raw env-var access from agent shells (e.g. so `gh` or `curl -H "Authorization: Bearer $GITHUB_TOKEN" ..."` work without extra config), opt in once after the container is up:

```sh
hermes config set terminal.env_passthrough '["GITHUB_TOKEN"]'
hermes restart
```

The same pattern works for any other secret env var Hermes blocks by default — add the variable name to the passthrough list. Trade-off: passed-through secrets are visible to every shell command the agent runs, so only opt in for ones you're comfortable exposing that broadly.

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `401 Unauthorized` on first message | LLM key missing or invalid. | Verify `OPENROUTER_API_KEY` (or `OPENAI_API_KEY` + `OPENAI_BASE_URL`) and that `LLM_MODEL` is reachable. |
| Container starts then exits | No messaging platform configured. | Set at least one platform's tokens. |
| WhatsApp keeps showing "not paired" | First-deploy pairing not done. | Run `hermes whatsapp` in the container terminal, scan QR, set `WHATSAPP_ENABLED=true`, redeploy. |
| Bot replies but to nobody | User not in allowlist. | Add the user's ID/number to the relevant `*_ALLOWED_USERS` var, or set `GATEWAY_ALLOW_ALL_USERS=true` (not recommended). |
| Upstream fix not picked up | Docker cached the `git clone` layer. | Redeploy with **Build without cache**. |
| `systemctl: command not found` in logs | Older upstream that the patch did not match. | The compose patches `status.py` defensively; if you still see the error, file an issue and pin `HERMES_REF` to the last known-good tag. |

## Credits

- Upstream agent: [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent)
- Coolify deployment pattern adapted from [creazy231/hermes-agent-coolify](https://github.com/creazy231/hermes-agent-coolify)
- Browser sidecar idea (browserless + persistent profile + live debug view) inspired by [coollabsio/openclaw](https://github.com/coollabsio/openclaw)

## License

The upstream Hermes Agent project is MIT licensed. This deployment configuration is provided as-is.

## Contributing

Issues and PRs welcome. Before publishing your own fork: replace any placeholders in the README with your details, and decide whether to keep `HERMES_REF=main` or pin to a tag.
