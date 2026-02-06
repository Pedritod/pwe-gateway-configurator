"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dgram_1 = __importDefault(require("dgram"));
const os_1 = __importDefault(require("os"));
const app = (0, express_1.default)();
const PORT = 3001;
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// Discovery keyword
const DISCOVERY_KEYWORD = Buffer.from('FF010102', 'hex');
const DISCOVERY_PORT = 1901;
const DISCOVERY_TIMEOUT = 3000; // 3 seconds
// Parse discovery response
function parseDiscoveryResponse(data, remoteIp) {
    try {
        // Response format: FF24010000[IP 4 bytes][MAC 6 bytes][firmware ascii]...[model ascii]
        if (data.length < 20)
            return null;
        const header = data.slice(0, 2).toString('hex').toUpperCase();
        if (header !== 'FF24' && header !== 'FF01')
            return null;
        // Skip echo responses (just the keyword echoed back)
        if (data.toString('hex').toUpperCase() === 'FF010102')
            return null;
        // Extract IP from bytes 5-8
        const ipBytes = data.slice(5, 9);
        const ip = `${ipBytes[0]}.${ipBytes[1]}.${ipBytes[2]}.${ipBytes[3]}`;
        // Extract MAC from bytes 9-14
        const macBytes = data.slice(9, 15);
        const mac = Array.from(macBytes)
            .map(b => b.toString(16).padStart(2, '0').toUpperCase())
            .join('-');
        // Extract firmware version and model from ASCII part
        let firmware = '';
        let model = '';
        const dataStr = data.toString('ascii', 15);
        const versionMatch = dataStr.match(/V?\d+\.\d+\.\d+/);
        if (versionMatch) {
            firmware = versionMatch[0];
        }
        const modelMatch = dataStr.match(/(USR-)?N\d{3}/i);
        if (modelMatch) {
            model = modelMatch[0];
        }
        return {
            ip: ip !== '0.0.0.0' ? ip : remoteIp,
            mac: mac || 'Unknown',
            model: model || 'USR Gateway',
            firmware: firmware || 'Unknown'
        };
    }
    catch (error) {
        console.error('Error parsing discovery response:', error);
        return null;
    }
}
// UDP Gateway Discovery endpoint
app.get('/api/discover', async (_req, res) => {
    const gateways = [];
    const seen = new Set();
    const socket = dgram_1.default.createSocket('udp4');
    socket.on('error', (err) => {
        console.error('Socket error:', err);
        socket.close();
    });
    socket.on('message', (msg, rinfo) => {
        console.log(`Received response from ${rinfo.address}:${rinfo.port}`);
        const gateway = parseDiscoveryResponse(msg, rinfo.address);
        if (gateway && !seen.has(gateway.mac)) {
            seen.add(gateway.mac);
            gateways.push(gateway);
            console.log('Discovered gateway:', gateway);
        }
    });
    socket.bind(() => {
        socket.setBroadcast(true);
        // Send broadcast to 255.255.255.255
        socket.send(DISCOVERY_KEYWORD, DISCOVERY_PORT, '255.255.255.255', (err) => {
            if (err) {
                console.error('Error sending broadcast:', err);
            }
            else {
                console.log('Sent discovery broadcast');
            }
        });
        // Also try common subnet broadcasts
        const interfaces = os_1.default.networkInterfaces();
        for (const name of Object.keys(interfaces)) {
            for (const iface of interfaces[name] || []) {
                if (iface.family === 'IPv4' && !iface.internal) {
                    // Calculate broadcast address
                    const ipParts = iface.address.split('.').map(Number);
                    const maskParts = iface.netmask.split('.').map(Number);
                    const broadcastParts = ipParts.map((ip, i) => (ip | (~maskParts[i] & 255)));
                    const broadcast = broadcastParts.join('.');
                    console.log(`Sending to broadcast: ${broadcast}`);
                    socket.send(DISCOVERY_KEYWORD, DISCOVERY_PORT, broadcast, (err) => {
                        if (err)
                            console.error(`Error sending to ${broadcast}:`, err);
                    });
                }
            }
        }
    });
    // Wait for responses
    setTimeout(() => {
        socket.close();
        res.json({ gateways });
    }, DISCOVERY_TIMEOUT);
});
// Proxy GET requests to gateway (to bypass CORS)
// Using query parameter for host to avoid path parsing issues
app.get('/api/proxy', async (req, res) => {
    const host = req.query.host;
    const path = req.query.path;
    if (!host || !path) {
        res.status(400).json({ error: 'Missing host or path query parameter' });
        return;
    }
    // Determine if host is a domain (ngrok) or IP
    const protocol = host.includes('ngrok') ? 'https' : 'http';
    const queryParams = { ...req.query };
    delete queryParams.host;
    delete queryParams.path;
    const queryString = new URLSearchParams(queryParams).toString();
    const url = `${protocol}://${host}/${path}${queryString ? '?' + queryString : ''}`;
    console.log(`Proxying GET to: ${url}`);
    try {
        const headers = {
            'Authorization': 'Basic ' + Buffer.from('admin:admin').toString('base64'),
        };
        // Add ngrok skip warning header for ngrok URLs
        if (host.includes('ngrok')) {
            headers['ngrok-skip-browser-warning'] = 'true';
        }
        const response = await fetch(url, { headers });
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json') || path.endsWith('.json')) {
            const data = await response.json();
            res.json(data);
        }
        else {
            const text = await response.text();
            res.type(contentType).send(text);
        }
    }
    catch (error) {
        console.error('Proxy error:', error);
        res.status(500).json({ error: 'Failed to connect to gateway', details: String(error) });
    }
});
// Proxy POST requests
app.post('/api/proxy', async (req, res) => {
    const host = req.query.host;
    const path = req.query.path;
    if (!host || !path) {
        res.status(400).json({ error: 'Missing host or path query parameter' });
        return;
    }
    const protocol = host.includes('ngrok') ? 'https' : 'http';
    const url = `${protocol}://${host}/${path}`;
    console.log(`Proxying POST to: ${url}`);
    try {
        const headers = {
            'Authorization': 'Basic ' + Buffer.from('admin:admin').toString('base64'),
            'Content-Type': 'application/json',
        };
        if (host.includes('ngrok')) {
            headers['ngrok-skip-browser-warning'] = 'true';
        }
        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(req.body),
        });
        const text = await response.text();
        try {
            res.json(JSON.parse(text));
        }
        catch {
            res.send(text);
        }
    }
    catch (error) {
        console.error('Proxy error:', error);
        res.status(500).json({ error: 'Failed to connect to gateway', details: String(error) });
    }
});
// Health check
app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
app.listen(PORT, () => {
    console.log(`Gateway Configurator Backend running on http://localhost:${PORT}`);
    console.log('Endpoints:');
    console.log('  GET  /api/discover                  - Scan for gateways');
    console.log('  GET  /api/proxy?host=X&path=Y       - Proxy GET to gateway');
    console.log('  POST /api/proxy?host=X&path=Y       - Proxy POST to gateway');
    console.log('  GET  /api/health                    - Health check');
});
