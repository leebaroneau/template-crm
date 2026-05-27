# Twenty CRM — Coolify Deployment Design

**Date:** 2026-05-27
**Status:** Approved
**Repo:** `leebaroneau/template-crm`
**Instance:** `twenty.haverford.com.au` on haverford-droplet

---

## Overview

Deploy Twenty CRM (open-source CRM) to Haverford's existing haverford-droplet via Coolify using a Git-sourced Docker Compose stack. The repo is designed as a reusable template — all instance-specific values (domain, secrets, SMTP credentials) live in Coolify's env var UI, not in the repo.

---

## Architecture

### Services

| Service | Image | Role | External |
|---|---|---|---|
| `server` | `twentycrm/twenty:${TAG:-latest}` | API + Web UI on port 3000. Runs DB migrations on startup. | Yes — `twenty.haverford.com.au` |
| `worker` | `twentycrm/twenty:${TAG:-latest}` | Background jobs, queues, cron. Runs `yarn worker:prod`. | No |
| `db` | `postgres:16` | PostgreSQL database | No |
| `redis` | `redis` | Job queue + cache. `noeviction` policy required. | No |

### Networking

No custom `networks:` block. Coolify auto-creates an isolated bridge network for all 4 services; all communicate by service name. Traefik routes `twenty.haverford.com.au → server:3000`.

### Volumes

Named volumes (`db-data`, `server-local-data`) scoped by Coolify to the app UUID. Both `server` and `worker` mount `server-local-data` for shared file storage.

> **Warning:** If the Coolify app is deleted and recreated, a new empty volume is created. Always `pg_dump` before any destructive Coolify operation.

---

## Repository Structure

```
template-crm/
├── docker-compose.yml     # Generic — no brand-specific values
├── .env.example           # Documents all required vars with placeholder values
└── README.md              # Setup instructions for new instances
```

Repo is public on `leebaroneau/template-crm`. All instance-specific configuration (domain, secrets, SMTP) is set in Coolify's env var UI and never committed.

---

## docker-compose.yml

Derived from upstream `packages/twenty-docker/docker-compose.yml` (commit `9d6c5b7d58c1`, 2026-05-26) with minimal changes:

**Changes from upstream:**
1. `ports: "3000:3000"` → `expose: ["3000"]` on `server` — Traefik routes, don't bind host port
2. `PG_DATABASE_PASSWORD` default removed — fails loudly if not set
3. `ENCRYPTION_KEY` and `APP_SECRET` defaults removed — fails loudly if not set
4. Email vars uncommented, all as `${VAR}` references (no hardcoded provider values)

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

---

## Environment Variables

### Required (no defaults — deployment fails if unset)

| Variable | Description |
|---|---|
| `SERVER_URL` | Public URL. e.g. `https://twenty.haverford.com.au` |
| `ENCRYPTION_KEY` | `openssl rand -base64 32`. Cannot change after data exists. |
| `PG_DATABASE_PASSWORD` | Strong random, no special characters. |

### Optional with defaults in compose

| Variable | Default | Description |
|---|---|---|
| `TAG` | `latest` | Docker image tag |
| `PG_DATABASE_USER` | `postgres` | Postgres username |
| `PG_DATABASE_HOST` | `db` | Postgres service name |
| `PG_DATABASE_PORT` | `5432` | Postgres port |
| `PG_DATABASE_NAME` | `default` | Database name |
| `REDIS_URL` | `redis://redis:6379` | Redis connection string |
| `STORAGE_TYPE` | `local` | `local` or `s3` |

### Email (all required when enabling email)

| Variable | Description |
|---|---|
| `EMAIL_DRIVER` | `smtp` |
| `EMAIL_SMTP_HOST` | SMTP server hostname |
| `EMAIL_SMTP_PORT` | SMTP port (587 for Resend) |
| `EMAIL_SMTP_USER` | SMTP username (`resend` for Resend) |
| `EMAIL_SMTP_PASSWORD` | SMTP password / API key |
| `EMAIL_FROM_ADDRESS` | From address |
| `EMAIL_FROM_NAME` | From display name |

### Haverford instance values (set in Coolify UI)

| Variable | Value |
|---|---|
| `SERVER_URL` | `https://twenty.haverford.com.au` |
| `EMAIL_DRIVER` | `smtp` |
| `EMAIL_SMTP_HOST` | `smtp.resend.com` |
| `EMAIL_SMTP_PORT` | `587` |
| `EMAIL_SMTP_USER` | `resend` |
| `EMAIL_SMTP_PASSWORD` | Resend API key |
| `EMAIL_FROM_ADDRESS` | `crm@haverford.com.au` |
| `EMAIL_FROM_NAME` | `Haverford CRM` |

---

## Coolify Configuration

**App type:** Docker Compose
**Source:** Private Git repo — `github.com/Haverford-Brands/crm-haverford`, `main` branch
**Compose file path:** `/docker-compose.yml`
**Server:** haverford-droplet (170.64.147.137)
**Domain:** `twenty.haverford.com.au` → service `server`, port `3000`
**TLS:** Auto via Let's Encrypt (Coolify manages)

> `leebaroneau/template-crm` is the upstream reference template — not deployed directly.
> Coolify deploys from `Haverford-Brands/crm-haverford`. Pull upstream changes via PR.

---

## Data Protection

Before any destructive Coolify operation (delete app, change volume config):

```bash
docker exec twenty-db pg_dump -U postgres default > backup_$(date +%Y%m%d).sql
```

---

## Upstream Reference

- Repo: https://github.com/twentyhq/twenty
- Compose source: `packages/twenty-docker/docker-compose.yml`
- Env reference: `packages/twenty-docker/.env.example`
- Docs: https://docs.twenty.com/developers/self-host/capabilities/docker-compose
- Brain pages: `concepts/twenty`, `sources/twenty-docs/`
- Commit at import: `9d6c5b7d58c1` (2026-05-26)
