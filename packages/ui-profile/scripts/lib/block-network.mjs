import dgram from 'node:dgram';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';

function blockedNetworkCall() {
  throw new Error('UI profile CSS compilation attempted network access');
}

globalThis.fetch = blockedNetworkCall;
dgram.createSocket = blockedNetworkCall;
http.get = blockedNetworkCall;
http.request = blockedNetworkCall;
https.get = blockedNetworkCall;
https.request = blockedNetworkCall;
net.connect = blockedNetworkCall;
net.createConnection = blockedNetworkCall;
tls.connect = blockedNetworkCall;
