export function sanitizeSlug(value: string) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(value)) {
    throw new Error('Invalid app slug.');
  }
  return value;
}

export function sanitizeAppName(value: string) {
  const trimmed = value.trim();
  if (!/^[a-z0-9][a-z0-9-]*$/.test(trimmed)) {
    throw new Error('App slug must use lowercase letters, numbers, and hyphens.');
  }
  return trimmed;
}

export function normalizeSpfxSlug(value: string) {
  return value.endsWith('-spfx') ? value : `${value}-spfx`;
}

export function sanitizeRequiredText(value: unknown, message: string) {
  const trimmed = String(value || '').trim();
  if (!trimmed) {
    throw new Error(message);
  }
  if (trimmed.length > 2048) {
    throw new Error('Value is too long.');
  }
  return trimmed;
}

export function sanitizeOptionalRef(value: unknown) {
  const trimmed = String(value || '').trim();
  if (!trimmed) {
    return '';
  }
  if (!/^[A-Za-z0-9._/@-]+$/.test(trimmed)) {
    throw new Error('Git ref can only use letters, numbers, dot, slash, underscore, at, and hyphen.');
  }
  return trimmed;
}

export function sanitizeWebPartName(value: unknown) {
  const trimmed = sanitizeRequiredText(value, 'Web part name is required.');
  if (!/^[A-Za-z][A-Za-z0-9 _-]*$/.test(trimmed)) {
    throw new Error('Web part name must start with a letter and use letters, numbers, spaces, hyphens, or underscores.');
  }
  return trimmed;
}
