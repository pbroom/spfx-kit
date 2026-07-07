import * as React from 'react';
import type { LabPropertyBag, LabRenderProps, LabWebPart, LabWebPartRegistry } from '@spfx-kit/spfx-lab-runtime';
import './helloCardLab.css';

type HelloCardProps = LabPropertyBag & {
  title: string;
  message: string;
  align: string;
};

const defaultProps: HelloCardProps = {
  title: 'Hello Card',
  message: 'This committed example shows how a managed SPFx app registers into the lab. Use it as a template for your own adapters.',
  align: 'left'
};

const Preview: React.FunctionComponent<LabRenderProps<HelloCardProps>> = ({ props, lab }) => (
  <section
    className="hello-card"
    style={{
      background: lab.theme.surface,
      borderColor: lab.theme.border,
      color: lab.theme.foreground,
      textAlign: props.align === 'center' ? 'center' : props.align === 'right' ? 'right' : 'left'
    }}
  >
    <h2 className="hello-card__title">{props.title}</h2>
    <p className="hello-card__message" style={{ color: lab.theme.mutedForeground }}>
      {props.message}
    </p>
    <p className="hello-card__meta" style={{ color: lab.theme.mutedForeground }}>
      Signed in as {lab.spfxContext.pageContext.user.displayName} on a {lab.breakpoint.label} column.
    </p>
  </section>
);

const webPart: LabWebPart<HelloCardProps> = {
  id: 'hello-card-spfx:default',
  appId: 'hello-card-spfx',
  title: 'Hello Card',
  description: 'Built-in example web part that ships with SPFx Kit.',
  defaultProps,
  controls: [
    { type: 'text', name: 'title', label: 'Title' },
    { type: 'textarea', name: 'message', label: 'Message' },
    {
      type: 'radio',
      name: 'align',
      label: 'Alignment',
      options: [
        { label: 'Left', value: 'left', icon: 'text-align-left' },
        { label: 'Center', value: 'center', icon: 'text-align-center' },
        { label: 'Right', value: 'right', icon: 'text-align-right' }
      ]
    }
  ],
  render: Preview
};

export function register(registry: LabWebPartRegistry): void {
  registry.register(webPart);
}
