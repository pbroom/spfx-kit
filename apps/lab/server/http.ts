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

export function readJsonBody(req: IncomingMessage, maximumBytes = 1024 * 1024): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let receivedBytes = 0;
    let settled = false;
    const settle = (action: () => void) => {
      if (!settled) {
        settled = true;
        action();
      }
    };
    req.on('data', (chunk) => {
      if (settled) {
        return;
      }
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      receivedBytes += bytes.length;
      if (receivedBytes > maximumBytes) {
        settle(() => reject(new JsonBodyError(413, `JSON request body exceeds the ${maximumBytes}-byte limit.`)));
        return;
      }
      chunks.push(bytes);
    });
    req.on('end', () => {
      settle(() => {
        try {
          const body = Buffer.concat(chunks).toString('utf8');
          resolve(body ? JSON.parse(body) : {});
        } catch {
          reject(new JsonBodyError(400, 'JSON request body is malformed.'));
        }
      });
    });
    req.on('error', (error) => {
      settle(() => reject(new JsonBodyError(400, 'JSON request body could not be read.', { cause: error })));
    });
    // Aborted/destroyed requests can close without ever emitting 'end'.
    req.on('close', () => {
      settle(() => reject(new JsonBodyError(400, 'Request closed before the JSON body was fully received.')));
    });
  });
}

export class JsonBodyError extends Error {
  public constructor(
    public readonly statusCode: 400 | 413,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options);
  }
}

export function sendJson(res: ServerResponse, value: unknown) {
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(value));
}
