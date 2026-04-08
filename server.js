/**
 * Local HTTP server for the book scanner.
 * No npm install required — Node.js built-ins only.
 *
 * Start: node server.js
 */

const https   = require('https');
const http    = require('http');
const fs      = require('fs');
const path    = require('path');
const crypto  = require('crypto');
const os      = require('os');

const PORT     = 3000;
const CERT_KEY = path.join(__dirname, 'cert.key');
const CERT_CRT = path.join(__dirname, 'cert.crt');

// ── Self-signed certificate (local dev only) ──────────────────────────────────

function generateSelfSignedCert() {
    // Uses openssl if available, otherwise falls back to HTTP
    try {
        const { execSync } = require('child_process');
        execSync(
            `openssl req -x509 -newkey rsa:2048 -keyout "${CERT_KEY}" -out "${CERT_CRT}" ` +
            `-days 365 -nodes -subj "/CN=localhost" ` +
            `-addext "subjectAltName=IP:127.0.0.1,${getLocalIPs().map(ip => 'IP:' + ip).join(',')}"`,
            { stdio: 'pipe' }
        );
        console.log('Certificate created with openssl.');
    } catch {
        console.log('openssl not found — falling back to HTTP (camera may not work on mobile).');
        return false;
    }
    return true;
}

function getLocalIPs() {
    const nets = os.networkInterfaces();
    const ips  = [];
    for (const iface of Object.values(nets)) {
        for (const alias of iface) {
            if (alias.family === 'IPv4' && !alias.internal)
                ips.push(alias.address);
        }
    }
    return ips;
}

// ── MIME types ────────────────────────────────────────────────────────────────

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.css':  'text/css',
    '.js':   'application/javascript',
    '.json': 'application/json',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.svg':  'image/svg+xml',
    '.ico':  'image/x-icon',
};

// ── Proxy helper ──────────────────────────────────────────────────────────────

function proxyRequest(options, body, res) {
    const req = https.request(options, (apiRes) => {
        let data = '';
        apiRes.on('data', chunk => data += chunk);
        apiRes.on('end', () => {
            res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(data);
        });
    });
    req.on('error', (e) => {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
    });
    if (body) req.write(body);
    req.end();
}

// ── Request handler ───────────────────────────────────────────────────────────

function handler(req, res) {
    const url = new URL(req.url, 'http://localhost');

    // CORS preflight
    if (req.method === 'OPTIONS') {
        res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST' });
        res.end();
        return;
    }

    // Proxy: Momox
    if (url.pathname === '/api/momox') {
        const ean = url.searchParams.get('ean');
        if (!/^\d{10,13}$/.test(ean)) { res.writeHead(400); res.end('invalid ean'); return; }
        proxyRequest({
            hostname: 'api.momox.de',
            path: `/api/v4/media/offer/?ean=${ean}`,
            method: 'GET',
            headers: {
                'X-API-TOKEN':      process.env.MOMOX_TOKEN || '2231443b8fb511c7b6a0eb25a62577320bac69b6',
                'X-MARKETPLACE-ID': 'momox_de',
                'User-Agent':       'momox/11.0 (Android)',
                'Accept':           'application/json'
            }
        }, null, res);
        return;
    }

    // Proxy: Bonavendi (returns top offers from 20+ buyback partners)
    if (url.pathname === '/api/bonavendi') {
        const ean = url.searchParams.get('ean');
        if (!/^\d{10,13}$/.test(ean)) { res.writeHead(400); res.end('invalid ean'); return; }
        const BV  = 'api.bonavendi.de';
        const BV_HEADERS = {
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-ApiVersion': '2.0',
            'Origin': 'https://www.bonavendi.de'
        };

        // Step 1: resolve product UUID and title
        const productReq = https.request(
            { hostname: BV, path: `/rest/v2/products/${ean}`, method: 'POST', headers: BV_HEADERS },
            (r1) => {
                let d1 = '';
                r1.on('data', c => d1 += c);
                r1.on('end', () => {
                    let uuid, title;
                    try {
                        const payload = JSON.parse(d1)?.payload;
                        uuid  = payload?.uuid;
                        title = payload?.name ?? null;
                    } catch {}
                    if (!uuid) {
                        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                        res.end(JSON.stringify({ offers: [], title: null }));
                        return;
                    }

                    // Step 2: fetch buy offers for the product
                    const offersReq = https.request(
                        { hostname: BV, path: `/rest/v2/products/${uuid}/buyOffers?maxAgeOfOfferInMinutes=-1`, method: 'POST', headers: BV_HEADERS },
                        (r2) => {
                            let d2 = '';
                            r2.on('data', c => d2 += c);
                            r2.on('end', () => {
                                let offers = [];
                                try {
                                    const all = JSON.parse(d2)?.payload ?? [];
                                    offers = all
                                        .filter(o => o.price > 0)
                                        .sort((a, b) => b.price - a.price)
                                        .slice(0, 8)
                                        .map(o => ({ name: o.partner.name, price: o.price }));
                                } catch {}
                                res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                                res.end(JSON.stringify({ offers, title }));
                            });
                        }
                    );
                    offersReq.on('error', () => {
                        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                        res.end(JSON.stringify({ offers: [] }));
                    });
                    offersReq.end();
                });
            }
        );
        productReq.on('error', () => {
            res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ offers: [] }));
        });
        productReq.end();
        return;
    }

    // Proxy: Rebuy
    if (url.pathname === '/api/rebuy') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            const bodyBuf = Buffer.from(body);
            proxyRequest({
                hostname: 'www.rebuy.de',
                path: '/verkaufen/api/bulk-isbn',
                method: 'POST',
                headers: {
                    'Content-Type':     'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                    'User-Agent':       'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36',
                    'Accept':           'application/json',
                    'Content-Length':   bodyBuf.length
                }
            }, bodyBuf, res);
        });
        return;
    }

    // Static files
    let filePath = path.join(__dirname, url.pathname === '/' ? '/index.html' : url.pathname);

    if (!filePath.startsWith(__dirname)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    const ext      = path.extname(filePath).toLowerCase();
    const mimeType = MIME[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not found: ' + url.pathname);
            return;
        }
        res.writeHead(200, { 'Content-Type': mimeType });
        res.end(data);
    });
}

// ── Start server ──────────────────────────────────────────────────────────────

const localIPs = getLocalIPs();

http.createServer(handler).listen(PORT, '0.0.0.0', () => {
    console.log('\nBook scanner running!');
    console.log(`\n  Local:  http://localhost:${PORT}`);
    localIPs.forEach(ip =>
        console.log(`  Mobile: http://${ip}:${PORT}`)
    );
    console.log('\nStop: Ctrl+C\n');
});
