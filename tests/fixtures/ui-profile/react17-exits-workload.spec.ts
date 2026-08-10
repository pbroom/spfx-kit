import * as React from 'react';
import * as ReactDom from 'react-dom';
import { act, Simulate } from 'react-dom/test-utils';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Button } from '@spfx-kit/ui-profile/button';
import { Checkbox } from '@spfx-kit/ui-profile/checkbox';
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@spfx-kit/ui-profile/dialog';
import { Input } from '@spfx-kit/ui-profile/input';
import { Switch } from '@spfx-kit/ui-profile/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@spfx-kit/ui-profile/select';
import { Spinner } from '@spfx-kit/ui-profile/spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@spfx-kit/ui-profile/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@spfx-kit/ui-profile/tooltip';
import { SpfxUiHostProvider, createSpfxUiHost, mapSharePointTheme, type SpfxUiHost } from '@spfx-kit/ui-profile';

const h = React.createElement;
let container: HTMLDivElement;
let mountPoint: HTMLDivElement;
let host: SpfxUiHost;

beforeEach(() => {
  mountPoint = document.createElement('div');
  document.body.appendChild(mountPoint);
  host = createSpfxUiHost({
    mountPoint,
    portalParent: mountPoint,
    targetDocument: document,
    instanceId: 'react17-exit-root',
    theme: mapSharePointTheme(testSharePointTheme(false))
  });
  container = host.appRoot as HTMLDivElement;
  const nativeMatches = Element.prototype.matches;
  vi.spyOn(Element.prototype, 'matches').mockImplementation(function matches(selector: string): boolean {
    if (selector === ':focus-visible') return this === document.activeElement;
    return nativeMatches.call(this, selector);
  });
  if (typeof HTMLElement.prototype.scrollIntoView === 'function') {
    vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(() => undefined);
  } else {
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn()
    });
  }
});

afterEach(() => {
  act(() => {
    ReactDom.unmountComponentAtNode(container);
  });
  host.dispose();
  mountPoint.remove();
  vi.restoreAllMocks();
});

it('forwards Button and Input refs to their DOM elements', () => {
  const buttonRef = React.createRef<HTMLButtonElement>();
  const inputRef = React.createRef<HTMLInputElement>();

  render(
    h(
      'div',
      null,
      h(Button, { ref: buttonRef, type: 'button' }, 'Action'),
      h(Input, { ref: inputRef, 'aria-label': 'Profile input' })
    )
  );

  expect(buttonRef.current).toBeInstanceOf(HTMLButtonElement);
  expect(buttonRef.current?.dataset.slot).toBe('button');
  expect(inputRef.current).toBeInstanceOf(HTMLInputElement);
  expect(inputRef.current?.dataset.slot).toBe('input');
});

it('preserves Spinner accessibility, styling, caller props, and its SVG ref', () => {
  const spinnerRef = React.createRef<SVGSVGElement>();
  render(h(Spinner, { ref: spinnerRef, className: 'caller-class', 'data-probe': 'preserved' }));

  expect(spinnerRef.current).toBeInstanceOf(SVGSVGElement);
  expect(spinnerRef.current?.dataset.slot).toBe('spinner');
  expect(spinnerRef.current?.dataset.probe).toBe('preserved');
  expect(spinnerRef.current?.getAttribute('role')).toBe('status');
  expect(spinnerRef.current?.getAttribute('aria-label')).toBe('Loading');
  expect(spinnerRef.current?.getAttribute('class')).toContain('animate-spin');
  expect(spinnerRef.current?.getAttribute('class')).toContain('caller-class');
});

it('forwards Checkbox and Switch refs to their Base UI span roots', () => {
  const checkboxRef = React.createRef<HTMLElement>();
  const switchRef = React.createRef<HTMLElement>();

  render(
    h(
      'div',
      null,
      h(Checkbox, { ref: checkboxRef, 'aria-label': 'Ref checkbox' }),
      h(Switch, { ref: switchRef, 'aria-label': 'Ref switch' })
    )
  );

  expect(checkboxRef.current).toBeInstanceOf(HTMLSpanElement);
  expect(checkboxRef.current?.dataset.slot).toBe('checkbox');
  expect(switchRef.current).toBeInstanceOf(HTMLSpanElement);
  expect(switchRef.current?.dataset.slot).toBe('switch');
});

it('supports controlled and uncontrolled Checkbox state', async () => {
  const controlledChanges: boolean[] = [];

  function Checkboxes(): React.ReactElement {
    const [controlled, setControlled] = React.useState(false);
    return h(
      'div',
      null,
      h(Checkbox, { 'aria-label': 'Uncontrolled checkbox', defaultChecked: false }),
      h(Checkbox, {
        'aria-label': 'Controlled checkbox',
        checked: controlled,
        onCheckedChange: (next: boolean) => {
          controlledChanges.push(next);
          setControlled(next);
        }
      })
    );
  }

  render(h(Checkboxes));
  const [uncontrolled, controlled] = Array.from(document.querySelectorAll<HTMLElement>('[data-slot="checkbox"]'));
  expect(uncontrolled).toBeDefined();
  expect(controlled).toBeDefined();
  expect(uncontrolled.getAttribute('aria-checked')).toBe('false');
  expect(controlled.getAttribute('aria-checked')).toBe('false');

  click(uncontrolled);
  click(controlled);
  await settle();

  expect(uncontrolled.getAttribute('aria-checked')).toBe('true');
  expect(controlled.getAttribute('aria-checked')).toBe('true');
  expect(controlledChanges).toEqual([true]);
});

it('keeps controlled Tabs externally owned while uncontrolled Tabs update themselves', async () => {
  const controlledChanges: string[] = [];
  render(
    h(
      'div',
      null,
      h(
        Tabs,
        { defaultValue: 'first' },
        h(
          TabsList,
          { 'aria-label': 'Uncontrolled tabs' },
          h(TabsTrigger, { value: 'first' }, 'First'),
          h(TabsTrigger, { value: 'second' }, 'Second')
        ),
        h(TabsContent, { value: 'first' }, 'First panel'),
        h(TabsContent, { value: 'second' }, 'Second panel')
      ),
      h(
        Tabs,
        { value: 'first', onValueChange: (next: string) => controlledChanges.push(next) },
        h(
          TabsList,
          { 'aria-label': 'Controlled tabs' },
          h(TabsTrigger, { value: 'first' }, 'Controlled first'),
          h(TabsTrigger, { value: 'second' }, 'Controlled second')
        )
      )
    )
  );

  const uncontrolledSecond = getButton('Second');
  const controlledSecond = getButton('Controlled second');
  click(uncontrolledSecond);
  click(controlledSecond);
  await settle();

  expect(uncontrolledSecond.getAttribute('aria-selected')).toBe('true');
  expect(controlledSecond.getAttribute('aria-selected')).toBe('false');
  expect(getButton('Controlled first').getAttribute('aria-selected')).toBe('true');
  expect(controlledChanges).toEqual(['second']);
});

it('runs a controlled Select through trigger, item selection, and value display', async () => {
  const changes: string[] = [];

  function ControlledSelect(): React.ReactElement {
    const [value, setValue] = React.useState('alpha');
    return h(
      Select,
      {
        id: host.idFor('controlled-select-root'),
        value,
        onValueChange: (next: string) => {
          changes.push(next);
          setValue(next);
        }
      },
      h(SelectTrigger, { 'aria-label': 'Controlled select' }, h(SelectValue, { placeholder: 'Choose an option' })),
      h(
        SelectContent,
        { id: host.idFor('controlled-select-content') },
        h(SelectItem, { value: 'alpha' }, 'Alpha'),
        h(SelectItem, { value: 'beta' }, 'Beta')
      )
    );
  }

  render(h(ControlledSelect));
  const trigger = getButton('Controlled select');
  expect(trigger.textContent).toContain('alpha');
  mouseDown(trigger);
  await settle();

  const beta = Array.from(document.body.querySelectorAll<HTMLElement>('[data-slot="select-item"]')).find((item) =>
    item.textContent?.includes('Beta')
  );
  expect(beta).toBeDefined();
  act(() => {
    Simulate.pointerDown(beta as HTMLElement, { button: 0, buttons: 1, pointerType: 'mouse' });
    Simulate.click(beta as HTMLElement, { button: 0, detail: 1 });
  });
  await settle();

  expect(changes).toEqual(['beta']);
  expect(trigger.textContent).toContain('beta');
  expect(host.portalHost.querySelector('[data-slot="select-content"]')?.hasAttribute('data-closed')).toBe(true);
  expect(trigger.getAttribute('aria-expanded')).toBe('false');
});

it('forwards the Dialog trigger ref, traps focus, closes on Escape, and returns focus', async () => {
  const dialogTriggerRef = React.createRef<HTMLButtonElement>();

  render(
    h(
      'div',
      null,
      h(Button, { type: 'button', 'aria-label': 'Outside focus target' }, 'Outside'),
      h(
        Dialog,
        null,
        h(DialogTrigger, { ref: dialogTriggerRef }, 'Open dialog'),
        h(
          DialogContent,
          { id: host.idFor('compatibility-dialog-content'), showCloseButton: false },
          h(DialogTitle, null, 'Compatibility dialog'),
          h(Button, { type: 'button', 'aria-label': 'Dialog first' }, 'First action'),
          h(Button, { type: 'button', 'aria-label': 'Dialog last' }, 'Last action')
        )
      )
    )
  );

  expect(dialogTriggerRef.current).toBeInstanceOf(HTMLButtonElement);
  expect(dialogTriggerRef.current?.dataset.slot).toBe('dialog-trigger');
  click(dialogTriggerRef.current as HTMLButtonElement);
  await settle();

  const content = host.portalHost.querySelector<HTMLElement>('[data-slot="dialog-content"]');
  const first = getButton('Dialog first');
  const last = getButton('Dialog last');
  expect(content).not.toBeNull();
  expect(content?.contains(document.activeElement)).toBe(true);

  act(() => last.focus());
  act(() => {
    last.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Tab', code: 'Tab' }));
  });
  const insideGuards = document.querySelectorAll<HTMLElement>('[data-base-ui-focus-guard][data-type="inside"]');
  expect(insideGuards.length).toBeGreaterThanOrEqual(2);
  act(() => insideGuards[insideGuards.length - 1]?.focus());
  await settle();
  expect(document.activeElement).toBe(first);

  act(() => {
    (document.activeElement as HTMLElement).dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Escape', code: 'Escape' })
    );
  });
  await settle();
  expect(host.portalHost.querySelector('[data-slot="dialog-content"]')).toBeNull();
  expect(document.activeElement).toBe(dialogTriggerRef.current);
});

it('opens Tooltip content when its trigger receives keyboard focus', async () => {
  const tooltipTriggerRef = React.createRef<HTMLButtonElement>();
  const openChanges: Array<{ open: boolean; reason: string }> = [];
  render(
    h(
      TooltipProvider,
      { delay: 0 },
      h(
        Tooltip,
        {
          onOpenChange: (open: boolean, details: { reason: string }) => openChanges.push({ open, reason: details.reason })
        },
        h(TooltipTrigger, { ref: tooltipTriggerRef }, 'Tooltip target'),
        h(TooltipContent, { id: host.idFor('keyboard-tooltip-content') }, 'Keyboard tooltip')
      )
    )
  );

  expect(tooltipTriggerRef.current).toBeInstanceOf(HTMLButtonElement);
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Tab', code: 'Tab' }));
    tooltipTriggerRef.current?.focus();
  });
  await settle();
  expect(document.activeElement).toBe(tooltipTriggerRef.current);
  expect(openChanges).toEqual([{ open: true, reason: 'trigger-focus' }]);
  expect(host.portalHost.querySelector('[data-slot="tooltip-content"]')?.textContent).toContain('Keyboard tooltip');
});

it('hands Tooltip activity between triggers and closes a genuinely unmounted active trigger', async () => {
  let hideFirst: () => void = () => undefined;

  function TooltipHandoff(): React.ReactElement {
    const [showFirst, setShowFirst] = React.useState(true);
    hideFirst = () => setShowFirst(false);
    return h(
      TooltipProvider,
      { delay: 0 },
      showFirst
        ? h(
            Tooltip,
            null,
            h(TooltipTrigger, { 'aria-label': 'First tooltip trigger' }, 'First tooltip trigger'),
            h(TooltipContent, { id: host.idFor('handoff-first-tooltip-content') }, 'First tooltip content')
          )
        : null,
      h(
        Tooltip,
        null,
        h(TooltipTrigger, { 'aria-label': 'Second tooltip trigger' }, 'Second tooltip trigger'),
        h(TooltipContent, { id: host.idFor('handoff-second-tooltip-content') }, 'Second tooltip content')
      )
    );
  }

  render(h(TooltipHandoff));
  const first = getButton('First tooltip trigger');
  const second = getButton('Second tooltip trigger');
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Tab', code: 'Tab' }));
    first.focus();
  });
  await settle();
  expect(document.body.textContent).toContain('First tooltip content');

  act(() => second.focus());
  await settle();
  expect(document.body.textContent).not.toContain('First tooltip content');
  expect(document.body.textContent).toContain('Second tooltip content');

  act(() => {
    second.blur();
    second.focus();
  });
  await settle();
  expect(document.body.textContent).toContain('Second tooltip content');

  act(() => first.focus());
  await settle();
  expect(document.body.textContent).toContain('First tooltip content');
  act(() => hideFirst());
  await settle();
  expect(document.body.textContent).not.toContain('First tooltip content');
  expect(document.querySelector('[aria-label="First tooltip trigger"]')).toBeNull();

  act(() => second.focus());
  await settle();
  expect(document.body.textContent).toContain('Second tooltip content');
});

it('keeps Tooltip open across a same-tick replacement trigger with the same id', async () => {
  let replaceTrigger: () => void = () => undefined;
  const openChanges: boolean[] = [];

  function SameIdReplacement(): React.ReactElement {
    const [revision, setRevision] = React.useState(0);
    replaceTrigger = () => setRevision((value) => value + 1);
    return h(
      TooltipProvider,
      { delay: 0 },
      h(
        Tooltip,
        { onOpenChange: (open: boolean) => openChanges.push(open) },
        h(
          TooltipTrigger,
          { id: 'stable-tooltip-trigger', key: revision, 'aria-label': 'Stable replacement trigger' },
          `Stable trigger ${revision}`
        ),
        h(TooltipContent, { id: host.idFor('stable-replacement-tooltip-content') }, 'Stable replacement content')
      )
    );
  }

  render(h(SameIdReplacement));
  const first = getButton('Stable replacement trigger');
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Tab', code: 'Tab' }));
    first.focus();
  });
  await settle();
  expect(document.body.textContent).toContain('Stable replacement content');

  act(() => replaceTrigger());
  await settle();
  const replacement = getButton('Stable replacement trigger');
  expect(replacement).not.toBe(first);
  expect(replacement.id).toBe('stable-tooltip-trigger');
  expect(document.body.textContent).toContain('Stable replacement content');
  expect(openChanges).toEqual([true]);
});

it('reconciles a new trigger id onto the same Tooltip element', async () => {
  let changeId: () => void = () => undefined;

  function SameElementNewId(): React.ReactElement {
    const [id, setId] = React.useState('tooltip-trigger-alpha');
    changeId = () => setId('tooltip-trigger-beta');
    return h(
      TooltipProvider,
      { delay: 0 },
      h(
        Tooltip,
        null,
        h(TooltipTrigger, { id, 'aria-label': 'Renamed tooltip trigger' }, 'Renamed tooltip trigger'),
        h(TooltipContent, { id: host.idFor('renamed-tooltip-content') }, 'Renamed tooltip content')
      )
    );
  }

  render(h(SameElementNewId));
  const trigger = getButton('Renamed tooltip trigger');
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Tab', code: 'Tab' }));
    trigger.focus();
  });
  await settle();
  expect(document.body.textContent).toContain('Renamed tooltip content');

  act(() => changeId());
  await settle();
  const renamed = getButton('Renamed tooltip trigger');
  expect(renamed).toBe(trigger);
  expect(renamed.id).toBe('tooltip-trigger-beta');
  expect(document.body.textContent).toContain('Renamed tooltip content');
});

it('retains Tooltip ownership when an active-trigger unmount close is canceled', async () => {
  let hideTrigger: () => void = () => undefined;
  const closeReasons: string[] = [];

  function CanceledUnmountClose(): React.ReactElement {
    const [showTrigger, setShowTrigger] = React.useState(true);
    hideTrigger = () => setShowTrigger(false);
    return h(
      TooltipProvider,
      { delay: 0 },
      h(
        Tooltip,
        {
          defaultOpen: true,
          onOpenChange: (open: boolean, details: { reason: string; cancel: () => void }) => {
            if (!open) {
              closeReasons.push(details.reason);
              details.cancel();
            }
          }
        },
        showTrigger
          ? h(TooltipTrigger, { id: 'cancel-close-trigger', 'aria-label': 'Cancelable trigger' }, 'Cancelable trigger')
          : null,
        h(TooltipContent, { id: host.idFor('canceled-close-tooltip-content') }, 'Canceled close content')
      )
    );
  }

  render(h(CanceledUnmountClose));
  await settle();
  expect(document.body.textContent).toContain('Canceled close content');
  act(() => hideTrigger());
  await settle();
  expect(document.querySelector('[aria-label="Cancelable trigger"]')).toBeNull();
  expect(closeReasons).toContain('none');
  expect(document.body.textContent).toContain('Canceled close content');
});

function render(element: React.ReactElement): void {
  act(() => {
    ReactDom.render(h(SpfxUiHostProvider, { host }, element), container);
  });
}

function testSharePointTheme(isInverted: boolean) {
  return {
    isInverted,
    palette: {
      white: isInverted ? '#111111' : '#ffffff',
      neutralPrimary: isInverted ? '#ffffff' : '#222222',
      neutralSecondary: isInverted ? '#c8c8c8' : '#666666',
      neutralLight: isInverted ? '#555555' : '#d8d8d8',
      neutralLighter: isInverted ? '#444444' : '#eeeeee',
      neutralLighterAlt: isInverted ? '#333333' : '#f6f6f6',
      themePrimary: '#0f6cbd',
      themeDarkAlt: '#115ea3',
      themeLighter: '#deecf9',
      redDark: '#a4262c'
    }
  };
}

function getButton(accessibleName: string): HTMLButtonElement {
  const exactLabel = document.querySelector<HTMLButtonElement>(`button[aria-label="${accessibleName}"]`);
  if (exactLabel) return exactLabel;
  const byText = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
    (button) => button.textContent?.trim() === accessibleName
  );
  if (!byText) throw new Error(`Missing button ${accessibleName}`);
  return byText;
}

function click(element: Element): void {
  act(() => Simulate.click(element, { button: 0 }));
}

function mouseDown(element: Element): void {
  act(() =>
    Simulate.mouseDown(element, {
      button: 0,
      buttons: 1,
      clientX: 1,
      clientY: 1
    })
  );
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
}
