import { createHash } from 'node:crypto';
import {
  assertPortableAssetPath,
  assetUrl,
  normalizeExactCdnBasePath
} from './cdn-stage-paths.mjs';

export async function verifyRemoteCdnFiles(
  { cdnBasePath, files },
  { authorization, expectedCdnBasePath } = {}
) {
  const expectedBasePath = normalizeExactCdnBasePath(expectedCdnBasePath);
  const artifactBasePath = normalizeExactCdnBasePath(cdnBasePath);
  if (artifactBasePath !== expectedBasePath) {
    throw new Error(
      `Artifact CDN base path does not match the trusted staging prefix: ${artifactBasePath}`
    );
  }
  for (const file of files) {
    assertExpectedRemoteUrl(file, expectedBasePath);
  }
  const headers = { 'Accept-Encoding': 'identity' };
  if (authorization) {
    headers.Authorization = authorization;
  }
  const results = new Array(files.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(6, files.length) }, async () => {
    while (nextIndex < files.length) {
      const index = nextIndex;
      nextIndex += 1;
      const file = files[index];
      await verifyRemoteFile(file, headers);
      results[index] = { path: file.path, url: file.url, bytes: file.bytes, sha256: file.sha256 };
    }
  });
  await Promise.all(workers);
  return results;
}

function assertExpectedRemoteUrl(file, expectedCdnBasePath) {
  assertPortableAssetPath(file.path, 'Remote CDN file path');
  const expectedUrl = assetUrl(expectedCdnBasePath, file.path);
  if (file.url !== expectedUrl) {
    throw new Error(`Remote CDN URL does not match its staged file path: ${file.url}`);
  }
}

async function verifyRemoteFile(file, headers) {
  let response;
  try {
    response = await fetch(file.url, {
      headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(30_000)
    });
  } catch (error) {
    throw new Error(`Remote CDN request failed: ${file.url}`, { cause: error });
  }
  if (!response.ok) {
    throw new Error(`Remote CDN check failed with HTTP ${response.status}: ${file.url}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  const actualHash = createHash('sha256').update(bytes).digest('hex');
  if (bytes.length !== file.bytes || actualHash !== file.sha256) {
    throw new Error(`Remote CDN bytes do not match the staged artifact: ${file.url}`);
  }
}
