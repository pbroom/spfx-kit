import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { exists } from './fs.mjs';

export async function scaffoldLabAdapter(targetDir, slug, description) {
  const adapterPath = path.join(targetDir, '.spfx-kit', 'lab', 'register.tsx');
  if (await exists(adapterPath)) {
    return false;
  }

  const title = titleFromSlug(slug);
  const source = `import * as React from 'react';
import type { LabPropertyBag, LabWebPart, LabWebPartRegistry } from '@spfx-kit/spfx-lab-runtime';

export type ${toPascal(slug)}LabProps = LabPropertyBag & {
  title: string;
  description: string;
};

const defaultProps: ${toPascal(slug)}LabProps = {
  title: ${JSON.stringify(title)},
  description: ${JSON.stringify(description || 'Imported SPFx web part')}
};

const Preview: React.FunctionComponent<{ props: ${toPascal(slug)}LabProps }> = ({ props }) => (
  <section style={{ fontFamily: '"Segoe UI", sans-serif', color: '#242424' }}>
    <h2 style={{ margin: 0, fontSize: 24 }}>{props.title}</h2>
    <p style={{ marginTop: 8, fontSize: 14, lineHeight: 1.5 }}>{props.description}</p>
  </section>
);

const webPart: LabWebPart<${toPascal(slug)}LabProps> = {
  id: '${slug}:default',
  appId: '${slug}',
  title: '${title}',
  description: 'Imported SPFx web part adapter stub.',
  defaultProps,
  controls: [
    { type: 'text', name: 'title', label: 'Title' },
    { type: 'textarea', name: 'description', label: 'Description' }
  ],
  render: Preview
};

export function register(registry: LabWebPartRegistry): void {
  registry.register(webPart);
}
`;
  await mkdir(path.dirname(adapterPath), { recursive: true });
  await writeFile(adapterPath, source);
  return true;
}

export function titleFromSlug(slug) {
  return slug
    .split('-')
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(' ');
}

export function toPascal(slug) {
  return titleFromSlug(slug).replace(/[^A-Za-z0-9]/g, '') || 'ImportedSpfx';
}
