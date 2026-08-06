import http from 'node:http';
import https from 'node:https';
import net from 'node:net';

function blockedNetworkCall() {
  throw new Error('UI profile verification attempted network access');
}

globalThis.fetch = blockedNetworkCall;
http.get = blockedNetworkCall;
http.request = blockedNetworkCall;
https.get = blockedNetworkCall;
https.request = blockedNetworkCall;
net.connect = blockedNetworkCall;
net.createConnection = blockedNetworkCall;
