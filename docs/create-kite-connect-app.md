# Create a Kite Connect app

This desk signs in through Zerodha Kite Connect. After login, Zerodha sends the browser to `/api/kite/callback` with a `request_token`. The app exchanges that token for a daily access token and stores it in MongoDB.

Create the app on the [Kite Connect developer console](https://developers.kite.trade/). Sign in with the Zerodha account that will be used for live data.

## 1. Create the app

1. Open [developers.kite.trade](https://developers.kite.trade/) and sign in.
2. Create a new app. Choose **Connect** (or **Personal** if that is the option for your own account). Do not choose **Publisher**. Publisher is for basket orders and does not use this login flow.
3. Fill **App details** as below, then create the app.

The form matches the screen titled **App details**.

| Field | What to enter |
| --- | --- |
| App name | Any name, for example `Nitai`. |
| App icon | A **64×64 PNG** only. Other sizes and formats are rejected. |
| Redirect URL | The callback on this app. See below. It must be HTTPS, except `http://127.0.0.1` for local testing. |
| Postback URL | Any HTTPS URL you control. See below. `https://` alone is not valid. |

### Redirect URL

This must be the callback route, not the site root.

Production, for the host in your app form:

```text
https://nitaidemo.in.net/api/kite/callback
```

Local testing (Zerodha allows plain HTTP only for `127.0.0.1`):

```text
http://127.0.0.1:3000/api/kite/callback
```

`https://nitaidemo.in.net` with no path sends the browser to the home page. This app never receives the `request_token`, so **Connect Kite** cannot finish.

The value in the Kite app and `KITE_REDIRECT_URL` in `.env` must be the same string, including `https`, host, and path. If the public host changes, update both.

### Postback URL

Zerodha POSTs order-completion updates to this URL. This desk does not place orders and does not read those posts, but the form still requires a real HTTPS URL.

Use the site root:

```text
https://nitaidemo.in.net/
```

## 2. Copy the keys into `.env`

After the app is created, the console shows an **API key** and an **API secret**. Put them in `.env` (see `.env.example`):

```text
KITE_API_KEY=your_api_key
KITE_API_SECRET=your_api_secret
KITE_REDIRECT_URL=https://nitaidemo.in.net/api/kite/callback
```

For local testing, set the redirect to the `127.0.0.1` callback instead, and register that same URL on the Kite app.

Keep the API secret only in `.env`. Do not commit it.

Restart the Next.js server and the worker after changing these values. The worker reads `KITE_API_KEY` when it opens the market-data socket.

## 3. Connect for the day

1. Open this desk and sign in with the dashboard password.
2. Open **Setup**.
3. Click **Connect Kite**.
4. Sign in on Zerodha and approve the app.

You should land back on Setup with **Kite is connected for today.** The access token is valid for that trading day. Connect again the next morning.

Setup also shows the redirect URL it expects. If that line does not match the Redirect URL saved on the Kite app, the login will not return here.
