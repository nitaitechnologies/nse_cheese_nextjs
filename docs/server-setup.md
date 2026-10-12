# Server setup

Live site: `https://nsecheese.nitaidemo.in.net`

Coolify builds this repository with Nixpacks and serves HTTPS. One Coolify application runs the website and the Kite worker in the same container. The database is the persistent volume at `/app/data/nse.sqlite`. This PC keeps a separate file, `data/nse.sqlite`. A redeploy does not delete the Coolify volume.

Deploy when the market is closed. A restart drops the Kite socket until the worker connects again.

## 1. Put Coolify where ports 80 and 443 arrive

Public ports 80 and 443 on `145.239.142.129` are answered by the provider's Debian machine. This Ubuntu server is reachable on SSH port `20034`.

Coolify has to run on the machine that receives public ports 80 and 443. Ask the provider to forward TCP **80**, **443**, and **8000** to this VPS. Then install Coolify on this Ubuntu server:

```bash
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
```

Open `http://145.239.142.129:8000` and create the admin account.

## 2. Point the domain at the server

In DNS, the A record is:

| Name | Type | Value |
|---|---|---|
| `nsecheese` | A | `145.239.142.129` |

The full name is `nsecheese.nitaidemo.in.net`.

## 3. Set the Kite redirect URL

In the Zerodha developer console, set the app redirect URL to exactly:

```text
https://nsecheese.nitaidemo.in.net/api/kite/callback
```

Zerodha allows plain HTTP only for `127.0.0.1`. The server must use HTTPS.

## 4. Create the Coolify application

Push this project to `https://github.com/nitaitechnologies/nse_cheese_nextjs.git` first. Coolify builds the commit on GitHub, and `nixpacks.toml` has to be in that commit.

In Coolify: **+ New** → **Application** → GitHub repository `nitaitechnologies/nse_cheese_nextjs`.

| Setting | Value |
|---|---|
| Build pack | Nixpacks |
| Branch | the branch you pushed |
| Port | `3000` |
| Domain | `https://nsecheese.nitaidemo.in.net` |
| Health check path | `/api/health` |

Persistent storage, one volume:

| Destination path |
|---|
| `/app/data` |

Runtime environment variables. Leave them off for the build. Copy the values from `.env.server` on this PC.

```text
SQLITE_PATH=/app/data/nse.sqlite
SESSION_SECRET=
DASHBOARD_PASSWORD_HASH_B64=
KITE_API_KEY=
KITE_API_SECRET=
KITE_REDIRECT_URL=https://nsecheese.nitaidemo.in.net/api/kite/callback
PUSHOVER_APP_TOKEN=
PUSHOVER_USER_KEY=
TZ=Asia/Kolkata
```

Leave `WORKER_INTERNAL_URL` unset. The start command runs the worker on `127.0.0.1:4001` inside the same container.

Click Deploy. The first build takes several minutes. The volume starts empty.

## 5. Open the site

Visit `https://nsecheese.nitaidemo.in.net`. Coolify issues the certificate for the domain.

Log in with the dashboard password, connect Kite, then from Settings sync the indices and backfill history.

## Later updates

Push to the same branch. In Coolify, click Deploy. The `/app/data` volume stays in place.

## Backup

While the market is closed, from the Coolify server:

```bash
docker ps --format '{{.Names}}' | grep nse
```

Use the application container name from that list:

```bash
docker cp CONTAINER:/app/data/nse.sqlite /root/nse.sqlite.backup
```
