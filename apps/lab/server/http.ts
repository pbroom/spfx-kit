import type { IncomingMessage, ServerResponse } from 'node:http';

const labApiIntentHeader = 'x-spfx-kit-lab-intent';

export function verifyStateChangingLabRequest(req: IncomingMessage, res: ServerResponse): boolean {
  if (!isSameOriginRequest(req)) {
    res.statusCode = 403;
    sendJson(res, { error: 'Lab API writes require a same-origin request.' });
    return false;
  }

  if (req.headers[labApiIntentHeader] !== 'same-origin') {
    res.statusCode = 403;
    sendJson(res, { error: 'Lab API writes require an explicit lab request intent.' });
    return false;
  }

  if (!isJsonRequest(req)) {
    res.statusCode = 415;
    sendJson(res, { error: 'Lab API writes require application/json.' });
    return false;
  }

  return true;
}

export function isSameOriginRequest(req: IncomingMessage): boolean {
  const host = req.headers.host;
  if (!host) {
    return false;
  }

  const origin = req.headers.origin;
  if (origin) {
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  }

  const fetchSite = req.headers['sec-fetch-site'];
  if (fetchSite) {
    return fetchSite === 'same-origin' || fetchSite === 'none';
  }

  return false;
}

export function isJsonRequest(req: IncomingMessage): boolean {
  const contentType = req.headers['content-type'];
  return typeof contentType === 'string' && contentType.split(';', 1)[0]?.trim().toLowerCase() === 'application/json';
}

export function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = '';
    let settled = false;
    const settle = (action: () => void) => {
      if (!settled) {
        settled = true;
        action();
      }
    };
    req.on('data', (chunk) => {
      body += String(chunk);
    });
    req.on('end', () => {
      settle(() => {
        try {
          resolve(body ? JSON.parse(body) : {});
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on('error', (error) => {
      settle(() => reject(error));
    });
    // Aborted/destroyed requests can close without ever emitting 'end'.
    req.on('close', () => {
      settle(() => reject(new Error('Request closed before the body was fully received.')));
    });
  });
}

export function sendJson(res: ServerResponse, value: unknown) {
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(value));
}
