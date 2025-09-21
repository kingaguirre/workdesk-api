# Workdesk API (Express)

Synthetic API for demos. Deploy to **Render** (stateful) or **Vercel** (serverless).

## Local dev
```bash
cp .env.example .env   # optional
npm i
npm run dev
# http://localhost:4000/health
```

## Endpoints
- `GET /health`
- `GET /workdesk/search?q=&limit=&skip=&sortBy=&order=&filters=&status=&trnSearch=&hideAcr=&savedFilter=`
- `GET /workdesk/:id`
- `PATCH /workdesk/:id`
- `POST /workdesk`
- `DELETE /workdesk/:id`
- `PATCH /workdesk/ack/booking-location`

## Deploy — Render (stateful)
**Recommended** for sticky in-memory mutations.
1. Push this repo to GitHub.
2. In Render: **New + → Blueprint** → pick your repo (`render.yaml` drives infra).
3. Create & deploy.
4. Test:
   ```bash
   curl 'https://<service>.onrender.com/health'
   curl 'https://<service>.onrender.com/workdesk/search?limit=2'
   ```

## Deploy — Vercel (serverless)
Mutations are ephemeral without a DB.
1. Import this repo as a project.
2. Deploy.
3. Endpoints live under `/api/index/*` by default:
   ```bash
   curl 'https://<project>.vercel.app/api/index/health'
   curl 'https://<project>.vercel.app/api/index/workdesk/search?limit=2'
   ```
   To route **all** paths to the API, replace `vercel.json` with:
   ```json
   { "rewrites": [{ "source": "/(.*)", "destination": "/api/index" }],
     "functions": { "api/index.mjs": { "runtime": "nodejs20.x" } } }
   ```

## Notes
- Row count `N` is ~4.9k for sensible cold starts.
- For durable persistence, use a DB (Supabase/Postgres/SQLite+volume).
