# QueueFlow — Digital Queue Management System

An Express + SQLite queue manager with a responsive dashboard and REST API. SQLite data is persisted in `data/queue.db` instead of being lost whenever the Node process restarts. It uses Node.js 22's built-in `node:sqlite` module, so no extra database package is required.

## Requirements
- Node.js 22.5+ (recommended: Node 22 LTS)
- npm

## Run locally
```bash
npm install
npm start
```
Open http://localhost:3000. The database is created automatically at `data/queue.db`. To store it elsewhere, set `DATA_DIR` before starting the app. `AVG_SERVICE_MINUTES` controls the estimated wait calculation (default 5).

## API endpoints
Base URL: `http://localhost:3000`

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/health` | Health and SQLite status |
| GET | `/api` | API overview |
| GET | `/api/docs` | Machine-readable endpoint documentation |
| GET | `/api/queue` | List all tokens; supports `?status=WAITING`, `SERVING`, or `COMPLETED` |
| GET | `/api/queue/current` | Current serving token, or `null` |
| GET | `/api/queue/stats` | Counts and estimated wait |
| GET | `/api/queue/:id` | Get token by numeric database ID |
| POST | `/api/queue` | Create token with JSON `{ "name": "Priya", "department": "Accounts" }` |
| POST | `/api/queue/next` | Call the next waiting token |
| PATCH | `/api/queue/:id/complete` | Complete a serving token |
| DELETE | `/api/queue/:id` | Cancel a waiting token |
| DELETE | `/api/queue/reset` | Clear tokens for local demos/tests |

Example:
```bash
curl -X POST http://localhost:3000/api/queue \\
  -H "Content-Type: application/json" \\
  -d '{"name":"Priya","department":"Accounts"}'
```

## Docker
```bash
docker build -t digital-queue-system .
docker run --name queue-app -p 3000:3000 -v queue-data:/app/data digital-queue-system
```
The named volume preserves SQLite data between container replacements. For your Jenkins deployment, also mount a persistent volume at `/app/data` or the database will be recreated when the container is removed.

## Notes before public deployment
The reset endpoint is intended only for a local demo and automated tests. Add authentication/authorization to admin actions, rate limiting, and HTTPS before exposing this service publicly. SQLite is appropriate for a small single-instance demonstration; a multi-instance deployment should use a shared database service.
