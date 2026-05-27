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
docker ps --filter 'name=twenty' --filter 'name=db' --format '{{.Names}}' | head -1 | xargs -I{} docker exec {} pg_dump -U postgres default > backup_$(date +%Y%m%d).sql
```

## Upstream

- Twenty CRM: https://github.com/twentyhq/twenty
- Docs: https://docs.twenty.com/developers/self-host/capabilities/docker-compose
