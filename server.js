const http = require('http');
const net = require('net');
const WebSocket = require('ws');

const UUID = 'fb5a3026-f642-4dda-94d0-a94501929e18';
const PORT = process.env.PORT || 10000;

// HTTP Server for Render Health Check
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('VLESS Render Node is Active\n');
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
    ws.once('message', (chunk) => {
        if (chunk.length < 24) return ws.close();

        // Verify Client UUID
        const clientUUID = chunk.slice(1, 17).toString('hex').replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');
        if (clientUUID !== UUID) return ws.close();

        const optLen = chunk[17];
        const command = chunk[18 + optLen];
        if (command !== 1) return ws.close(); // TCP Connection

        let portIndex = 19 + optLen;
        const port = chunk.readUInt16BE(portIndex);
        let addressIndex = portIndex + 2;
        const addressType = chunk[addressIndex++];
        let address = '';

        if (addressType === 1) { // IPv4
            address = chunk.slice(addressIndex, addressIndex + 4).join('.');
            addressIndex += 4;
        } else if (addressType === 2) { // Domain Name
            const len = chunk[addressIndex++];
            address = chunk.slice(addressIndex, addressIndex + len).toString();
            addressIndex += len;
        } else if (addressType === 3) { // IPv6
            address = chunk.slice(addressIndex, addressIndex + 16).toString('hex');
            addressIndex += 16;
        }

        const rawData = chunk.slice(addressIndex);

        // Connect directly to destination
        const socket = net.connect({ host: address, port: port }, () => {
            ws.send(Buffer.from([chunk[0], 0]));
            if (rawData.length > 0) socket.write(rawData);

            ws.on('message', (msg) => socket.write(msg));
            socket.on('data', (data) => ws.send(data));
        });

        socket.on('error', () => ws.close());
        ws.on('close', () => socket.destroy());
    });
});

server.listen(PORT, () => {
    console.log(`VLESS Server running on port ${PORT}`);
});
