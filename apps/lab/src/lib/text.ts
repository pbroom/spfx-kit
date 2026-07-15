export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'spfx-web-part';
}

export function managedAppPath(appId: string): string {
  return `.spfx-kit/apps/${appId}`;
}

export function titleFromSlug(value: string): string {
  return value
    .replace(/-spfx$/, '')
    .split('-')
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(' ') || value;
}

export function slugInputValue(value: string): string {
  return value
    .trimStart()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-');
}

export function isSlugInput(value: string): boolean {
  return /^[a-z0-9][a-z0-9-]*$/.test(value);
}

export function getPrimaryShortcutLabel(key: string): string {
  if (typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform)) {
    return `⌘${key.toUpperCase()}`;
  }

  return `Ctrl+${key.toUpperCase()}`;
}

export function middleTruncatePath(path: string, maxLength = 42): string {
  if (path.length <= maxLength) {
    return path;
  }

  const ellipsis = '…';
  const lastSlash = path.lastIndexOf('/');
  if (lastSlash > 0) {
    const leaf = path.slice(lastSlash + 1);
    const leafWithSlash = `/${leaf}`;
    const prefixBudget = maxLength - ellipsis.length - leafWithSlash.length;
    if (prefixBudget >= 1) {
      return `${path.slice(0, prefixBudget)}${ellipsis}${leafWithSlash}`;
    }

    if (leafWithSlash.length < maxLength) {
      return `${ellipsis}${leafWithSlash}`;
    }

    const leafBudget = maxLength - ellipsis.length - 1;
    return `${ellipsis}/${leaf.slice(0, Math.max(1, leafBudget))}`;
  }

  const available = maxLength - ellipsis.length;
  const headLength = Math.max(1, Math.ceil(available * 0.35));
  const tailLength = Math.max(1, available - headLength);
  return `${path.slice(0, headLength)}${ellipsis}${path.slice(-tailLength)}`;
}
