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
