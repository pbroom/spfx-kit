// @vitest-environment happy-dom

import * as React from 'react';
import * as ReactDom from 'react-dom';
import { act, Simulate } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ColorField } from '../apps/lab/src/components/ColorField';
import { createSpfxUiHost, SpfxUiHostProvider, type SpfxUiHost } from '../packages/ui-profile/normalized/src/lib/ui-root';

interface Fixture {
  controlIds: string[];
  host: SpfxUiHost;
  mountPoint: HTMLElement;
  portalParent: HTMLElement;
  onChange: ReturnType<typeof vi.fn>;
  dispose(): void;
}

interface FixtureField {
  label: string;
  localKey: string;
}

const fixtures: Fixture[] = [];

afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.dispose();
});

describe('ColorField React 17 organism', () => {
  it('keeps invalid text local, emits normalized colors, owns its portal, and restores focus on Escape', async () => {
    const fixture = renderFixture(document, 'color-field-main');
    const hexInput = fixture.host.appRoot.querySelector<HTMLInputElement>('[aria-label="Accent hex value"]');
    expect(hexInput).not.toBeNull();

    changeInput(hexInput!, '#zz');
    expect(hexInput?.value).toBe('#zz');
    expect(hexInput?.getAttribute('aria-invalid')).toBe('true');
    expect(fixture.onChange).not.toHaveBeenCalled();

    act(() => Simulate.blur(hexInput!));
    expect(hexInput?.value).toBe('#336699');
    changeInput(hexInput!, 'ABC');
    expect(fixture.onChange).toHaveBeenLastCalledWith('#aabbcc');
    expect(hexInput?.value).toBe('#aabbcc');

    const trigger = fixture.host.appRoot.querySelector<HTMLButtonElement>('[aria-label="Open Accent color picker"]');
    expect(trigger).not.toBeNull();
    await act(async () => {
      Simulate.click(trigger!);
      await Promise.resolve();
    });

    const popover = fixture.host.portalHost.querySelector<HTMLElement>('[aria-label="Accent color picker"]');
    expect(popover).not.toBeNull();
    expect(popover?.ownerDocument).toBe(document);
    expect(popover?.id).toContain('spfx-ui-');

    const hue = popover?.querySelector<HTMLInputElement>('[aria-label="Accent hue"]');
    expect(hue).not.toBeNull();
    act(() => Simulate.keyDown(hue!, { key: 'ArrowRight' }));
    expect(fixture.onChange).toHaveBeenLastCalledWith(expect.stringMatching(/^#[0-9a-f]{6}$/u));

    await act(async () => {
      popover?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });
    expect(fixture.host.portalHost.querySelector('[aria-label="Accent color picker"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('uses the iframe owner window for pointer capture listeners and removes them on teardown', async () => {
    const iframe = document.createElement('iframe');
    document.body.appendChild(iframe);
    const ownerDocument = iframe.contentDocument;
    const ownerWindow = iframe.contentWindow;
    expect(ownerDocument).not.toBeNull();
    expect(ownerWindow).not.toBeNull();
    const fixture = renderFixture(ownerDocument!, 'color-field-iframe');
    const addEventListener = vi.spyOn(ownerWindow!, 'addEventListener');
    const removeEventListener = vi.spyOn(ownerWindow!, 'removeEventListener');

    const trigger = fixture.host.appRoot.querySelector<HTMLButtonElement>('[aria-label="Open Accent color picker"]');
    await act(async () => {
      Simulate.click(trigger!);
      await Promise.resolve();
    });
    const area = fixture.host.portalHost.querySelector<HTMLDivElement>('[aria-label="Accent saturation and brightness"]');
    expect(area).not.toBeNull();
    expect(area?.ownerDocument).toBe(ownerDocument);
    vi.spyOn(area!, 'getBoundingClientRect').mockReturnValue({
      bottom: 120,
      height: 100,
      left: 10,
      right: 110,
      top: 20,
      width: 100,
      x: 10,
      y: 20,
      toJSON: () => undefined
    });

    act(() => {
      Simulate.pointerDown(area!, { button: 0, clientX: 210, clientY: -20, pointerId: 7 });
    });
    expect(fixture.onChange).toHaveBeenLastCalledWith('#0080ff');
    expect(addEventListener).toHaveBeenCalledWith('pointermove', expect.any(Function));
    expect(addEventListener).toHaveBeenCalledWith('pointerup', expect.any(Function));

    fixture.dispose();
    fixtures.splice(fixtures.indexOf(fixture), 1);
    expect(removeEventListener).toHaveBeenCalledWith('pointermove', expect.any(Function));
    expect(removeEventListener).toHaveBeenCalledWith('pointerup', expect.any(Function));
    expect(ownerDocument?.querySelector('[data-spfx-ui-portal-host]')).toBeNull();
    iframe.remove();
  });

  it('derives unique field, input, ARIA, content, and portal IDs for two fields in one host', async () => {
    const fixture = renderFixture(document, 'color-field-pair', [
      { label: 'Accent', localKey: 'accent-control' },
      { label: 'Background', localKey: 'background-control' }
    ]);
    const staticIds = Array.from(fixture.host.appRoot.querySelectorAll<HTMLElement>('[id]'), (element) => element.id);
    expect(new Set(staticIds).size).toBe(staticIds.length);

    const overlayIds: string[] = [];
    for (const [index, field] of ['Accent', 'Background'].entries()) {
      const controlId = fixture.controlIds[index];
      const fieldId = fixture.host.deriveElementId(controlId, 'color-field');
      const expectedStaticIds = [
        fieldId,
        fixture.host.deriveElementId(fieldId, 'hex'),
        fixture.host.deriveElementId(fieldId, 'trigger')
      ];
      for (const expectedId of expectedStaticIds) {
        expect(fixture.host.appRoot.contains(document.getElementById(expectedId))).toBe(true);
      }

      const trigger = fixture.host.appRoot.querySelector<HTMLButtonElement>(`[aria-label="Open ${field} color picker"]`);
      await act(async () => {
        Simulate.click(trigger!);
        await Promise.resolve();
      });

      const contentId = fixture.host.deriveElementId(fieldId, 'popover');
      const portalId = fixture.host.portalIdFor(contentId);
      const content = document.getElementById(contentId);
      expect(content).not.toBeNull();
      expect(fixture.host.portalHost.contains(content)).toBe(true);
      expect(content?.closest<HTMLElement>('[data-base-ui-portal]')?.id).toBe(portalId);
      expect(trigger?.getAttribute('aria-controls')).toBe(contentId);

      const expectedOverlayIds = [
        contentId,
        portalId,
        fixture.host.deriveElementId(fieldId, 'saturation-value'),
        fixture.host.deriveElementId(fieldId, 'hue-field'),
        fixture.host.deriveElementId(fieldId, 'hue'),
        fixture.host.deriveElementId(fieldId, 'hsl-group'),
        fixture.host.deriveElementId(fieldId, 'hsl-h-field'),
        fixture.host.deriveElementId(fieldId, 'hsl-s-field'),
        fixture.host.deriveElementId(fieldId, 'hsl-l-field'),
        fixture.host.deriveElementId(fieldId, 'hsl-h'),
        fixture.host.deriveElementId(fieldId, 'hsl-s'),
        fixture.host.deriveElementId(fieldId, 'hsl-l')
      ];
      for (const expectedId of expectedOverlayIds) {
        expect(document.getElementById(expectedId), expectedId).not.toBeNull();
      }
      for (const label of content?.querySelectorAll<HTMLLabelElement>('label[for]') ?? []) {
        expect(document.getElementById(label.htmlFor), label.htmlFor).not.toBeNull();
      }
      overlayIds.push(...expectedOverlayIds);

      await act(async () => {
        Simulate.click(trigger!);
        await Promise.resolve();
      });
    }

    const everyRelevantId = [...staticIds, ...overlayIds];
    expect(new Set(everyRelevantId).size).toBe(everyRelevantId.length);
  });
});

function renderFixture(
  ownerDocument: Document,
  instanceId: string,
  fields: FixtureField[] = [{ label: 'Accent', localKey: 'accent-control' }]
): Fixture {
  const mountPoint = ownerDocument.createElement('div');
  const portalParent = ownerDocument.createElement('div');
  ownerDocument.body.append(mountPoint, portalParent);
  const host = createSpfxUiHost({
    mountPoint,
    portalParent,
    targetDocument: ownerDocument,
    instanceId,
    profileId: 'spfx-react17-base-nova-v1',
    scopeValue: 'skui-9eea46b8e51bf75d',
    theme: {
      mode: 'light',
      colorBackground: '#ffffff',
      colorForeground: '#242424',
      colorCard: '#ffffff',
      colorCardForeground: '#242424',
      colorPopover: '#ffffff',
      colorPopoverForeground: '#242424',
      colorPrimary: '#0f6cbd',
      colorPrimaryForeground: '#ffffff',
      colorSecondary: '#f5f5f5',
      colorSecondaryForeground: '#242424',
      colorMuted: '#f0f0f0',
      colorMutedForeground: '#616161',
      colorAccent: '#eef6ff',
      colorAccentForeground: '#0f548c',
      colorDestructive: '#c50f1f',
      colorBorder: '#d1d1d1',
      colorInput: '#8a8886',
      colorRing: '#0f6cbd',
      radiusSm: '0.25rem',
      radiusMd: '0.375rem',
      radiusLg: '0.5rem',
      radiusXl: '0.75rem',
      fontHeading: 'sans-serif'
    }
  });
  const onChange = vi.fn();
  const controlIds = fields.map((field) => host.idFor(field.localKey));

  function Harness(): JSX.Element {
    const [values, setValues] = React.useState(() => fields.map(() => '#336699'));
    return React.createElement(
      React.Fragment,
      null,
      fields.map((field, index) =>
        React.createElement(ColorField, {
          controlId: controlIds[index],
          key: field.localKey,
          label: field.label,
          value: values[index],
          onChange: (nextValue) => {
            onChange(nextValue);
            setValues((currentValues) =>
              currentValues.map((currentValue, currentIndex) => (currentIndex === index ? nextValue : currentValue))
            );
          }
        })
      )
    );
  }

  act(() => {
    ReactDom.render(React.createElement(SpfxUiHostProvider, { host }, React.createElement(Harness)), host.appRoot);
  });

  const fixture = {
    controlIds,
    host,
    mountPoint,
    portalParent,
    onChange,
    dispose: () => {
      act(() => {
        ReactDom.unmountComponentAtNode(host.appRoot);
      });
      host.dispose();
      mountPoint.remove();
      portalParent.remove();
    }
  };
  fixtures.push(fixture);
  return fixture;
}

function changeInput(input: HTMLInputElement, value: string): void {
  input.value = value;
  act(() => Simulate.change(input));
}
