# buyback-scout

[![GitHub release](https://img.shields.io/github/v/release/flyingfinger1/buyback-scout)](https://github.com/flyingfinger1/buyback-scout/releases)
[![Docker Image](https://img.shields.io/badge/ghcr.io-buyback--scout-blue?logo=docker)](https://github.com/flyingfinger1/buyback-scout/pkgs/container/buyback-scout)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-no%20dependencies-green?logo=node.js)](server.js)

A mobile-first web app that scans book barcodes and instantly compares buyback prices from multiple German recommerce platforms.

## What it does

Point your phone camera at a book's barcode, take a photo, and the app shows you how much each buyback service will pay — so you can spot profitable books at flea markets at a glance.

**Supported platforms:**
- [Momox](https://www.momox.de)
- [Rebuy](https://www.rebuy.de)
- [Bonavendi](https://www.bonavendi.de) (aggregates 20+ additional buyers)

## How it works

The app is a single `index.html` frontend paired with a lightweight Node.js proxy server. The proxy is needed because the buyback APIs do not send CORS headers, so direct browser requests would be blocked.

```
Phone browser → Node.js proxy → Momox / Rebuy / Bonavendi APIs
```

## Local setup

**Requirements:** Node.js

```bash
git clone https://github.com/your-username/buyback-scout
cd buchscanner
node server.js
```

Open `http://localhost:3000` in your browser.

**Using on your phone (same Wi-Fi network):**

The server prints your local IP on startup, e.g. `http://192.168.1.25:3000`.

Camera access requires a secure context. Either deploy with HTTPS (see below) or enable the Chrome flag on Android:

1. Open `chrome://flags/#unsafely-treat-insecure-origin-as-secure`
2. Add your local URL (e.g. `http://192.168.1.25:3000`)
3. Set to **Enabled** and relaunch Chrome

## Docker deployment (with Caddy reverse proxy)

The included `docker-compose.yml` is set up for a Caddy reverse proxy using Docker labels. Caddy handles TLS automatically via Let's Encrypt — no certificate workarounds needed.

```bash
docker compose up -d --build
```

Adjust the domain in `docker-compose.yml`:

```yaml
labels:
  caddy: buchscanner.yourdomain.com
  caddy.reverse_proxy: "{{upstreams 3000}}"
```

## Configuration

| Environment variable | Default | Description |
|---|---|---|
| `MOMOX_TOKEN` | built-in fallback | API token for the Momox API |

## Disclaimer

The Momox, Rebuy, and Bonavendi APIs used by this app are **not officially documented or supported**. They were reverse-engineered from public sources and may change or stop working at any time. This project is not affiliated with any of these services.
