# Deployment Guide — Supabase + Vercel

## Overview

| Layer | Service | Notes |
|-------|---------|-------|
| Database | Supabase (PostgreSQL 15+) | Free tier available |
| Backend API | Vercel Serverless (Node.js) | Express via `server/api.ts` |
| Frontend | Vercel Static (Vite/React) | `web/dist` |
| File Storage | `/tmp` (ephemeral) | Upgrade to Supabase Storage for persistent docs |

---

## Step 1 — Supabase Setup

1. Create a project at [supabase.com](https://supabase.com)
2. Go to **Project Settings → Database → Connection String**
3. Copy both:
   - **Transaction mode** (port 6543, pgBouncer) → `DATABASE_URL`
   - **Direct** (port 5432) → `DIRECT_URL`

### Run Prisma migrations against Supabase

```bash
cd server
cp .env.supabase.example .env
# Edit .env — fill in DATABASE_URL and DIRECT_URL from Supabase dashboard

npm run prisma:generate
npm run prisma:deploy       # runs existing migrations
npm run db:seed             # creates tenants, roles, admin user
```

> **Note**: Always use `prisma migrate deploy` (not `prisma migrate dev`) in production.

---

## Step 2 — Vercel Deployment

### Option A: Deploy from Vercel Dashboard (Recommended)

1. Push the repo to GitHub/GitLab
2. Go to [vercel.com](https://vercel.com) → New Project → Import repo
3. Set the following in **Project Settings**:

   | Setting | Value |
   |---------|-------|
   | Framework Preset | Other |
   | Root Directory | `. ` (repository root) |
   | Build Command | `npm install --prefix web && npm run build --prefix web` |
   | Output Directory | `web/dist` |
   | Install Command | `npm install --prefix server` |

4. Add **Environment Variables** in Vercel dashboard:

   ```
   DATABASE_URL          = postgresql://...?pgbouncer=true&connection_limit=1
   DIRECT_URL            = postgresql://... (port 5432, no pgbouncer)
   JWT_ACCESS_SECRET     = (strong random string, min 64 chars)
   JWT_REFRESH_SECRET    = (strong random string, min 64 chars)
   NODE_ENV              = production
   CORS_ORIGINS          = https://your-project.vercel.app
   UPLOAD_DIR            = /tmp/erp-uploads
   MAX_UPLOAD_MB         = 20
   ```

5. Add **Frontend Environment Variable**:
   ```
   VITE_API_URL = /api
   ```

6. Click **Deploy**

### Option B: Deploy via Vercel CLI

```bash
npm install -g vercel
vercel login
vercel --prod
```

---

## Step 3 — Verify Deployment

After deployment:
```bash
# Health check
curl https://your-project.vercel.app/api/health
# Expected: {"status":"ok","time":"..."}

# Login test
curl -X POST https://your-project.vercel.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@your-company.com","password":"YourStrongPassword@123"}'
```

---

## Important Limitations on Vercel

### File Uploads (Documents)
Vercel serverless functions use an ephemeral `/tmp` filesystem. Uploaded documents
**will not persist** between requests. For production document storage:

1. Sign up for [Supabase Storage](https://supabase.com/storage)
2. Create a bucket named `erp-documents`
3. Install `@supabase/supabase-js`:
   ```bash
   cd server && npm install @supabase/supabase-js
   ```
4. Replace the `resolveUploadDir` + `fs.writeFile` logic in
   `server/src/modules/documents/documents.routes.ts` with Supabase Storage API calls.

### Serverless Cold Starts
First request after idle may take 1–3 seconds. Prisma connects on each cold start.

### Rate Limiting
The in-memory rate limiter resets on each function instance. For production,
use [Upstash Redis](https://upstash.com) with `rate-limiter-flexible`.

---

## Environment Variables Reference

### Server (`server/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | Supabase pooled connection (port 6543) |
| `DIRECT_URL` | ✅ | Supabase direct connection (port 5432, for migrations) |
| `JWT_ACCESS_SECRET` | ✅ | Random 64+ char string |
| `JWT_REFRESH_SECRET` | ✅ | Random 64+ char string (different from above) |
| `NODE_ENV` | ✅ | `production` |
| `CORS_ORIGINS` | ✅ | Your Vercel URL, e.g. `https://erp.vercel.app` |
| `PORT` | — | Only used for local dev (Vercel ignores it) |
| `UPLOAD_DIR` | — | `/tmp/erp-uploads` on Vercel |
| `MAX_UPLOAD_MB` | — | Default: 20 |
| `JWT_ACCESS_TTL` | — | Default: 15m |
| `JWT_REFRESH_TTL` | — | Default: 7d |
| `BCRYPT_ROUNDS` | — | Default: 12 (higher in prod) |
| `ADMIN_EMAIL` | seed only | Initial admin email |
| `ADMIN_PASSWORD` | seed only | Initial admin password |

### Frontend (`web/.env.production`)

| Variable | Value |
|----------|-------|
| `VITE_API_URL` | `/api` (same-origin on Vercel) |

---

## Troubleshooting

**`Error: Cannot find module '@prisma/client'`**
→ Run `npm run prisma:generate` in `server/` after setting `DATABASE_URL`

**`Error: prepared statement ... already exists` (pgBouncer conflict)**
→ Add `?pgbouncer=true&connection_limit=1` to `DATABASE_URL` (already in template)

**CORS errors in browser**
→ Set `CORS_ORIGINS` to your exact Vercel URL (no trailing slash)

**Function timeout (30s)**
→ Check `DIRECT_URL` is set — some Prisma operations require direct connection

**Documents disappear after upload**
→ Expected on Vercel — implement Supabase Storage (see above)
