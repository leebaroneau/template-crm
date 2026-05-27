# Twenty CRM Coolify Deployment — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create `leebaroneau/template-crm` GitHub repo with a Coolify-ready Twenty CRM Docker Compose stack, then deploy it to `twenty.haverford.com.au` on haverford-droplet.

**Architecture:** Generic Docker Compose template (server + worker + postgres + redis) sourced from upstream `twentyhq/twenty` with minimal Coolify adaptations. All brand-specific values live in Coolify env vars, never committed. Traefik routes `twenty.haverford.com.au → server:3000`.

**Tech Stack:** Twenty CRM (`twentycrm/twenty:latest`), PostgreSQL 16, Redis, Docker Compose, Coolify, Traefik, Let's Encrypt, Resend SMTP.

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `docker-compose.yml` | Create | Generic Coolify-adapted compose (no brand values) |
| `.env.example` | Create | Documents all vars with placeholders |
| `README.md` | Create | Setup instructions for new instances |
| `docs/specs/2026-05-27-twenty-coolify-deployment-design.md` | Already exists | Design reference |
| `docs/plans/2026-05-27-twenty-coolify-deployment.md` | This file | Implementation plan |

---

## Task 1: Initialise local repo structure

**Files:**
- Create: `docker-compose.yml`
- Create: `.env.example`
- Create: `README.md`

- [ ] **Step 1: Verify working directory is the template-crm root**

```bash
cd /Users/leebaroneau/Documents/GitHub/lee-dashboard/haverford-brands/00_repos/services/template-crm
ls
```

Expected output includes `docs/` directory.

- [ ] **Step 2: Initialise git**

```bash
git init
git checkout -b main
```

Expected: `Initialized empty Git repository` and `Switched to a new branch 'main'`

---

## Task 2: Create docker-compose.yml

**Files:**
- Create: `docker-compose.yml`

- [ ] **Step 1: Write docker-compose.yml**

Verbatim from upstream `twentyhq/twenty` commit `9d6c5b7d58c1`, with three changes: (1) `ports` → `expose` on server, (2) password/key defaults stripped, (3) email vars uncommented as env refs.

```yaml
name: twenty

services:
  server:
    image: twentycrm/twenty:${TAG:-latest}
    expose:
      - "3000"
    volumes:
      - server-local-data:/app/packages/twenty-server/.local-storage
    environment:
      NODE_PORT: 3000
      PG_DATABASE_URL: postgres://${PG_DATABASE_USER:-postgres}:${PG_DATABASE_PASSWORD}@${PG_DATABASE_HOST:-db}:${PG_DATABASE_PORT:-5432}/default
      SERVER_URL: ${SERVER_URL}
      REDIS_URL: ${REDIS_URL:-redis://redis:6379}
      DISABLE_DB_MIGRATIONS: ${DISABLE_DB_MIGRATIONS}
      DISABLE_CRON_JOBS_REGISTRATION: ${DISABLE_CRON_JOBS_REGISTRATION}
      STORAGE_TYPE: ${STORAGE_TYPE:-local}
      STORAGE_S3_REGION: ${STORAGE_S3_REGION}
      STORAGE_S3_NAME: ${STORAGE_S3_NAME}
      STORAGE_S3_ENDPOINT: ${STORAGE_S3_ENDPOINT}
      ENCRYPTION_KEY: ${ENCRYPTION_KEY}
      FALLBACK_ENCRYPTION_KEY: ${FALLBACK_ENCRYPTION_KEY:-}
      APP_SECRET: ${APP_SECRET:-}
      EMAIL_FROM_ADDRESS: ${EMAIL_FROM_ADDRESS}
      EMAIL_FROM_NAME: ${EMAIL_FROM_NAME}
      EMAIL_DRIVER: ${EMAIL_DRIVER}
      EMAIL_SMTP_HOST: ${EMAIL_SMTP_HOST}
      EMAIL_SMTP_PORT: ${EMAIL_SMTP_PORT}
      EMAIL_SMTP_USER: ${EMAIL_SMTP_USER}
      EMAIL_SMTP_PASSWORD: ${EMAIL_SMTP_PASSWORD}
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    healthcheck:
      test: curl --fail http://localhost:3000/healthz
      interval: 5s
      timeout: 5s
      retries: 20
    restart: always

  worker:
    image: twentycrm/twenty:${TAG:-latest}
    command: ["yarn", "worker:prod"]
    volumes:
      - server-local-data:/app/packages/twenty-server/.local-storage
    environment:
      PG_DATABASE_URL: postgres://${PG_DATABASE_USER:-postgres}:${PG_DATABASE_PASSWORD}@${PG_DATABASE_HOST:-db}:${PG_DATABASE_PORT:-5432}/default
      SERVER_URL: ${SERVER_URL}
      REDIS_URL: ${REDIS_URL:-redis://redis:6379}
      DISABLE_DB_MIGRATIONS: "true"
      DISABLE_CRON_JOBS_REGISTRATION: "true"
      STORAGE_TYPE: ${STORAGE_TYPE:-local}
      STORAGE_S3_REGION: ${STORAGE_S3_REGION}
      STORAGE_S3_NAME: ${STORAGE_S3_NAME}
      STORAGE_S3_ENDPOINT: ${STORAGE_S3_ENDPOINT}
      ENCRYPTION_KEY: ${ENCRYPTION_KEY}
      FALLBACK_ENCRYPTION_KEY: ${FALLBACK_ENCRYPTION_KEY:-}
      APP_SECRET: ${APP_SECRET:-}
    depends_on:
      db:
        condition: service_healthy
      server:
        condition: service_healthy
    restart: always

  db:
    image: postgres:16
    volumes:
      - db-data:/var/lib/postgresql/data
    environment:
      POSTGRES_DB: ${PG_DATABASE_NAME:-default}
      POSTGRES_PASSWORD: ${PG_DATABASE_PASSWORD}
      POSTGRES_USER: ${PG_DATABASE_USER:-postgres}
    healthcheck:
      test: pg_isready -U ${PG_DATABASE_USER:-postgres} -h localhost -d postgres
      interval: 5s
      timeout: 5s
      retries: 10
    restart: always

  redis:
    image: redis
    restart: always
    command: ["--maxmemory-policy", "noeviction"]
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 10

volumes:
  db-data:
  server-local-data:
```

- [ ] **Step 2: Verify yaml is valid**

```bash
docker compose -f docker-compose.yml config --quiet 2>&1
```

Expected: no output (silent = valid). If errors appear, fix yaml syntax.

---

## Task 3: Create .env.example

**Files:**
- Create: `.env.example`

- [ ] **Step 1: Write .env.example**

```bash
cat > .env.example << 'EOF'
# ─── Image ────────────────────────────────────────────────────────────────────
TAG=latest

# ─── Server ───────────────────────────────────────────────────────────────────
# Must match the public URL users type in their browser.
# Required for SSL features (clipboard API etc.)
SERVER_URL=https://your-domain.com

# ─── Database ─────────────────────────────────────────────────────────────────
# PG_DATABASE_USER=postgres         # default: postgres
# PG_DATABASE_HOST=db               # default: db (compose service name)
# PG_DATABASE_PORT=5432             # default: 5432
# PG_DATABASE_NAME=default          # default: default
PG_DATABASE_PASSWORD=replace_me_strong_password_no_special_chars

# ─── Redis ────────────────────────────────────────────────────────────────────
# REDIS_URL=redis://redis:6379      # default: redis://redis:6379

# ─── Secrets ──────────────────────────────────────────────────────────────────
# Generate with: openssl rand -base64 32
# WARNING: ENCRYPTION_KEY cannot be changed after data is stored.
# Losing it = losing access to all OAuth tokens, app variables, TOTP secrets.
ENCRYPTION_KEY=replace_me_openssl_rand_base64_32
# FALLBACK_ENCRYPTION_KEY=         # set to previous ENCRYPTION_KEY during rotation only
# APP_SECRET=                      # legacy: only for instances pre-dating ENCRYPTION_KEY

# ─── Storage ──────────────────────────────────────────────────────────────────
STORAGE_TYPE=local
# STORAGE_S3_REGION=
# STORAGE_S3_NAME=
# STORAGE_S3_ENDPOINT=
# STORAGE_S3_ACCESS_KEY_ID=
# STORAGE_S3_SECRET_ACCESS_KEY=

# ─── Email (SMTP) ─────────────────────────────────────────────────────────────
# Example values shown for Resend — replace with your provider.
EMAIL_DRIVER=smtp
EMAIL_SMTP_HOST=smtp.resend.com
EMAIL_SMTP_PORT=587
EMAIL_SMTP_USER=resend
EMAIL_SMTP_PASSWORD=your_resend_api_key
EMAIL_FROM_ADDRESS=crm@your-domain.com
EMAIL_FROM_NAME=Your CRM
EOF
```

- [ ] **Step 2: Verify file created**

```bash
cat .env.example | head -5
```

Expected: first 5 lines of the file.

---

## Task 4: Create README.md

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write README.md**

```bash
cat > README.md << 'EOF'
# template-crm

Generic Twenty CRM deployment template for Coolify. No brand-specific values in this repo — all instance config lives in Coolify's env var UI.

## What's included

- `docker-compose.yml` — Coolify-adapted from [twentyhq/twenty](https://github.com/twentyhq/twenty) upstream
- `.env.example` — documents all required env vars

## Services

| Service | Role |
|---|---|
| `server` | API + Web UI (port 3000). Runs DB migrations on start. |
| `worker` | Background jobs, queues, cron. Mandatory. |
| `db` | PostgreSQL 16 |
| `redis` | Job queue + cache (`noeviction` policy) |

## Deploy on Coolify

1. In Coolify → New Resource → Public Repository
2. Paste this repo URL, select Docker Compose build pack
3. Set compose file path: `/docker-compose.yml`
4. Set domain → service `server`, port `3000`
5. Add env vars (see `.env.example` for all options):

   | Variable | Notes |
   |---|---|
   | `SERVER_URL` | `https://your-domain.com` |
   | `ENCRYPTION_KEY` | `openssl rand -base64 32` — **cannot change after first run** |
   | `PG_DATABASE_PASSWORD` | Strong random, no special characters |
   | `EMAIL_*` | See `.env.example` for SMTP config |

6. Deploy

## Data protection

Before any destructive Coolify operation (delete app, modify volumes):

```bash
docker exec twenty-db-1 pg_dump -U postgres default > backup_$(date +%Y%m%d).sql
```

## Upstream

- Twenty CRM: https://github.com/twentyhq/twenty
- Docs: https://docs.twenty.com/developers/self-host/capabilities/docker-compose
EOF
```

- [ ] **Step 2: Verify file created**

```bash
wc -l README.md
```

Expected: > 30 lines.

---

## Task 5: Commit and push to GitHub

- [ ] **Step 1: Stage all files**

```bash
cd /Users/leebaroneau/Documents/GitHub/lee-dashboard/haverford-brands/00_repos/services/template-crm
git add docker-compose.yml .env.example README.md docs/
git status
```

Expected: all files listed under "Changes to be committed".

- [ ] **Step 2: Commit**

```bash
git commit -m "feat: initial Twenty CRM Coolify template

- docker-compose.yml adapted from upstream twentyhq/twenty@9d6c5b7d58c1
- expose port 3000 (no host binding, Traefik routes)
- generic env vars, no brand-specific values
- .env.example documents all required vars
- README with Coolify setup steps"
```

- [ ] **Step 3: Create GitHub repo and push**

```bash
gh repo create leebaroneau/template-crm --public --description "Twenty CRM Docker Compose template for Coolify" --push --source .
```

Expected: repo created at `https://github.com/leebaroneau/template-crm` and push confirmed.

- [ ] **Step 4: Verify repo is live**

```bash
gh repo view leebaroneau/template-crm --web
```

Expected: browser opens to the new repo showing all files.

---

## Task 6: Configure DNS

> **Manual step** — requires access to your DNS provider for `haverford.com.au`.

- [ ] **Step 1: Add DNS A record**

In your DNS provider dashboard, add:

| Type | Name | Value | TTL |
|---|---|---|---|
| `A` | `twenty` | `170.64.147.137` | 300 (or auto) |

This creates `twenty.haverford.com.au → haverford-droplet`.

- [ ] **Step 2: Verify propagation**

```bash
dig twenty.haverford.com.au +short
```

Expected: `170.64.147.137`

Do not proceed to Coolify setup until DNS resolves correctly — Let's Encrypt cert provisioning will fail otherwise.

---

## Task 7: Create Coolify app

> **Manual steps** — performed in the Coolify dashboard at your Coolify instance URL.

- [ ] **Step 1: Open Coolify and navigate to haverford-droplet project**

Go to your Coolify dashboard → select the project that contains haverford-droplet services.

- [ ] **Step 2: Create new resource**

Click **+ New Resource** → **Public Repository**.

- [ ] **Step 3: Configure source**

- Repository URL: `https://github.com/leebaroneau/template-crm`
- Branch: `main`
- Build pack: select **Docker Compose** (not Nixpacks)
- Base directory: `/`
- Docker Compose location: `docker-compose.yml`

Click **Continue**.

- [ ] **Step 4: Configure domain**

In the app settings, under **Domains**:

- Add domain: `twenty.haverford.com.au`
- Service: `server`
- Port: `3000`
- Enable HTTPS (Let's Encrypt auto)

> **Note:** Only `server` needs an external domain. Coolify's auto-network handles internal service-to-service communication (`db`, `redis`, `worker`).

- [ ] **Step 5: Verify no custom networks warning**

Confirm the compose file shows no `networks:` block. If Coolify shows a network warning, it is safe to dismiss — the upstream compose has no custom networks and Coolify's auto-network is used.

---

## Task 8: Set environment variables in Coolify

> **Manual step** — in Coolify app settings → Environment Variables tab.

Generate secrets first on your local machine:

```bash
# Generate ENCRYPTION_KEY
openssl rand -base64 32

# Generate PG_DATABASE_PASSWORD (alphanumeric only, no special chars)
openssl rand -hex 24
```

- [ ] **Step 1: Add required vars**

Add each of these in Coolify's env var UI:

| Variable | Value |
|---|---|
| `SERVER_URL` | `https://twenty.haverford.com.au` |
| `ENCRYPTION_KEY` | output of first `openssl` command above |
| `PG_DATABASE_PASSWORD` | output of second `openssl` command above |

> ⚠️ **Save ENCRYPTION_KEY somewhere safe (1Password etc.) immediately. It cannot be recovered and cannot be changed after first run.**

- [ ] **Step 2: Add email vars**

| Variable | Value |
|---|---|
| `EMAIL_DRIVER` | `smtp` |
| `EMAIL_SMTP_HOST` | `smtp.resend.com` |
| `EMAIL_SMTP_PORT` | `587` |
| `EMAIL_SMTP_USER` | `resend` |
| `EMAIL_SMTP_PASSWORD` | your Resend API key |
| `EMAIL_FROM_ADDRESS` | `crm@haverford.com.au` |
| `EMAIL_FROM_NAME` | `Haverford CRM` |

> Resend API key: get from https://resend.com/api-keys — needs send permission for `haverford.com.au` domain.

- [ ] **Step 3: Confirm all vars saved**

Review the env vars list in Coolify. Confirm no required var is missing.

---

## Task 9: Deploy and verify

- [ ] **Step 1: Trigger first deploy**

In Coolify app → click **Deploy**.

Watch the deploy log. Expected sequence:
1. Coolify pulls `leebaroneau/template-crm` from GitHub
2. `db` and `redis` start, pass healthchecks
3. `server` starts, runs DB migrations (first run: ~60–90s), passes `/healthz`
4. `worker` starts after `server` is healthy

- [ ] **Step 2: Check all containers healthy**

```bash
ssh haverford-droplet "docker ps --filter 'name=twenty' --format 'table {{.Names}}\t{{.Status}}'"
```

Expected: 4 containers containing `server`, `worker`, `db`, `redis` in their names, all with status `healthy` or `Up X minutes`.

Note the exact container names from this output — you'll need them for the backup command in rollback.

- [ ] **Step 3: Verify server healthcheck**

```bash
ssh haverford-droplet "docker ps --filter 'name=twenty' --filter 'name=server' --format '{{.Names}}' | head -1 | xargs -I{} docker exec {} curl -s http://localhost:3000/healthz"
```

Expected: HTTP 200 response (any body is fine — confirms server is up).

- [ ] **Step 4: Verify HTTPS is live**

```bash
curl -sI https://twenty.haverford.com.au | head -3
```

Expected: `HTTP/2 200` or redirect. If TLS cert is still provisioning, wait 60s and retry.

- [ ] **Step 5: Open browser and create admin account**

Navigate to `https://twenty.haverford.com.au` in browser.

First-run flow: Twenty shows workspace setup screen. Create admin account with your email.

- [ ] **Step 6: Verify worker is processing**

In Twenty UI → Settings → (any async feature like email sync or workflow). Confirm no "worker not connected" errors in the UI.

---

## Task 10: Post-deploy — save ENCRYPTION_KEY to 1Password

> **Critical — do not skip.**

- [ ] **Step 1: Save ENCRYPTION_KEY**

In 1Password (or your password manager), create a new item:
- Title: `Twenty CRM — Haverford — ENCRYPTION_KEY`
- Value: the key you generated in Task 8
- Note: "Cannot be changed after first run. Required to restore from backup."

- [ ] **Step 2: Save PG_DATABASE_PASSWORD**

Create another item:
- Title: `Twenty CRM — Haverford — PG_DATABASE_PASSWORD`
- Value: the password generated in Task 8

---

## Rollback / recovery

If the deploy fails and needs to be torn down:

```bash
# On haverford-droplet — backup DB first if any data was written
ssh haverford-droplet "docker ps --filter 'name=twenty' --filter 'name=db' --format '{{.Names}}' | head -1 | xargs -I{} docker exec {} pg_dump -U postgres default > /tmp/twenty_backup_$(date +%Y%m%d).sql"

# Copy backup off server
scp haverford-droplet:/tmp/twenty_backup_*.sql .
```

Then delete the app in Coolify UI. Volumes will be destroyed with the app UUID — ensure backup is off-server first.
