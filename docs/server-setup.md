# Server setup

Live site: `https://nsecheese.nitaidemo.in.net`

CloudPanel terminates HTTPS and proxies the domain to the Node app on port `3000`. PM2 keeps one process named `nse-cheese` running. That process starts the website and the Kite worker. The database is `/home/nitaidemo-nsecheese/nse-data/nse.sqlite`, outside the site folder. This PC keeps a separate file, `data/nse.sqlite`. A `git pull` does not delete the server database or `.env`.

Deploy when the market is closed. A restart drops the Kite socket until the worker connects again.

Use Node **22.20 or newer**. The database is Node’s built-in SQLite, and older 22.x builds do not include it.

## 1. Create the CloudPanel site

In CloudPanel: **Sites → Add Site → Create a Node.js Site**.

| Setting | Value |
|---|---|
| Domain | `nsecheese.nitaidemo.in.net` |
| Node.js version | **22** |
| App port | **3000** |

The site user is `nitaidemo-nsecheese`. The site directory is `~/htdocs/nsecheese.nitaidemo.in.net`.

In DNS, the A record is:

| Name | Type | Value |
|---|---|---|
| `nsecheese` | A | `145.239.142.129` |

In the site, open **SSL/TLS** and issue a Let’s Encrypt certificate. Zerodha allows plain HTTP only for `127.0.0.1`. The server must use HTTPS.

Leave ports **3000** and **4001** closed on the firewall. Nginx on 80/443 is the public entry. Port 4001 is the worker and stays on the machine.

## 2. Check Node

SSH in as `nitaidemo-nsecheese` (not root):

```bash
node -v
```

If that prints anything below `v22.20.0`:

```bash
nvm install 22.20.0
nvm alias default 22.20.0
hash -r
node -v
```

## 3. Put the code on the server

The server copies the app from `https://github.com/nitaitechnologies/nse_cheese_nextjs.git`. Push `master` from this PC first.

Still as `nitaidemo-nsecheese`:

```bash
cd ~/htdocs/nsecheese.nitaidemo.in.net
git clone https://github.com/nitaitechnologies/nse_cheese_nextjs.git .
npm ci
npm run build
```

`npm run build` compiles the site and the worker. The first build needs roughly 2 GB of RAM. On a small VPS, add swap before building.

Keep the database outside the site folder:

```bash
mkdir -p ~/nse-data
```

## 4. Set the Kite redirect URL

In the Zerodha developer console, set the app redirect URL to exactly:

```text
https://nsecheese.nitaidemo.in.net/api/kite/callback
```

## 5. Environment file

Create `~/htdocs/nsecheese.nitaidemo.in.net/.env`. Copy the secret values from `.env.server` on this PC.

```bash
nano .env
chmod 600 .env
```

```text
SQLITE_PATH=/home/nitaidemo-nsecheese/nse-data/nse.sqlite
SESSION_SECRET=
DASHBOARD_PASSWORD_HASH_B64=
KITE_API_KEY=
KITE_API_SECRET=
KITE_REDIRECT_URL=https://nsecheese.nitaidemo.in.net/api/kite/callback
PUSHOVER_APP_TOKEN=
PUSHOVER_USER_KEY=
PORT=3000
WORKER_PORT=4001
TZ=Asia/Kolkata
```

`PORT` must match the CloudPanel app port. Leave `WORKER_INTERNAL_URL` unset. The start script sets it to `http://127.0.0.1:4001` for the worker in the same process.

## 6. Keep it running with PM2

From the site directory:

```bash
npm install pm2@latest -g
pm2 start scripts/start-production.mjs --name nse-cheese --node-args="--env-file=.env"
pm2 save
curl -sS http://127.0.0.1:3000/api/health
```

`--env-file` matters. The Next process and the Kite worker both need those variables. A healthy response is JSON with `"ok":true`. If curl fails, run `pm2 logs nse-cheese`.

So it comes back after a reboot:

```bash
echo $PATH
crontab -e
```

Add these two lines, using the path you just printed:

```bash
PATH=PASTE_THAT_PATH_HERE
@reboot pm2 resurrect &> /dev/null
```

## 7. Open the site

Visit `https://nsecheese.nitaidemo.in.net`. Log in with the dashboard password, connect Kite, then from Settings sync the indices and backfill history. The SQLite file is created on first start.

## Later updates

Do this while the market is closed. A restart drops the Kite socket until the worker connects again.

**1. On this PC**, commit the changes and push `master` to `https://github.com/nitaitechnologies/nse_cheese_nextjs.git`. The server only sees what is already on GitHub.

**2. On the server**, as `nitaidemo-nsecheese`:

```bash
cd ~/htdocs/nsecheese.nitaidemo.in.net
git pull
npm ci
npm run build
pm2 restart nse-cheese
curl -sS http://127.0.0.1:3000/api/health
```

Leave `.env` and `~/nse-data/nse.sqlite` as they are. `git pull` does not touch them.

When curl returns `"ok":true`, reload `https://nsecheese.nitaidemo.in.net`.

## Backup

While the market is closed, as `nitaidemo-nsecheese`:

```bash
cp ~/nse-data/nse.sqlite ~/nse-data/nse.sqlite.backup
```
