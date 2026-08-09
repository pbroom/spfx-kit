import { parentPort, workerData } from 'node:worker_threads';

if (!parentPort) throw new Error('Pinned shadcn registry worker requires a parent port');

function serializedError(error) {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  return { name: 'Error', message: String(error) };
}

try {
  const { resolvedRegistryUrl, registryIds, preset } = workerData ?? {};
  if (typeof resolvedRegistryUrl !== 'string' || !Array.isArray(registryIds) || typeof preset !== 'string') {
    throw new Error('Pinned shadcn registry worker received invalid input');
  }
  const { getRegistryItems } = await import(resolvedRegistryUrl);
  if (typeof getRegistryItems !== 'function') {
    throw new Error('Pinned shadcn registry module does not export getRegistryItems');
  }
  const items = await getRegistryItems(registryIds, {
    config: { style: preset },
    useCache: false
  });
  parentPort.postMessage({ ok: true, items });
} catch (error) {
  parentPort.postMessage({ ok: false, error: serializedError(error) });
} finally {
  parentPort.close();
}
