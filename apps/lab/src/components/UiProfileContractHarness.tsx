import * as React from 'react';
import * as ReactDom from 'react-dom';
import { Badge } from '@spfx-kit/ui-profile/badge';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@spfx-kit/ui-profile/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@spfx-kit/ui-profile/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@spfx-kit/ui-profile/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@spfx-kit/ui-profile/tooltip';
import {
  createSpfxUiHost,
  mapSharePointTheme,
  SpfxUiHostProvider,
  type SpfxUiHost,
  type SpfxUiThemeMode,
  type SpfxUiThemeTokens,
  useSpfxUiId
} from '@spfx-kit/ui-profile';

const triggerStyle: React.CSSProperties = {
  alignItems: 'center',
  background: 'var(--spfx-ui-color-secondary)',
  border: '1px solid var(--spfx-ui-color-border)',
  borderRadius: 'var(--spfx-ui-radius-md)',
  color: 'var(--spfx-ui-color-secondary-foreground)',
  cursor: 'pointer',
  display: 'inline-flex',
  font: 'inherit',
  gap: '0.375rem',
  minHeight: '2rem',
  padding: '0.375rem 0.625rem'
};

const rootPanelStyle: React.CSSProperties = {
  background: 'var(--spfx-ui-color-background)',
  color: 'var(--spfx-ui-color-foreground)',
  display: 'grid',
  gap: '0.75rem',
  minHeight: '18rem',
  padding: '1rem'
};

const controlsStyle: React.CSSProperties = {
  alignItems: 'center',
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.5rem'
};

const lightTheme = mapSharePointTheme({
  isInverted: false,
  palette: {
    white: '#ffffff',
    neutralPrimary: '#242424',
    neutralSecondary: '#616161',
    neutralLight: '#d1d1d1',
    neutralLighter: '#f0f0f0',
    neutralLighterAlt: '#fafafa',
    themePrimary: '#0f6cbd',
    themeDarkAlt: '#115ea3',
    themeLighter: '#ebf3fc',
    redDark: '#c50f1f'
  },
  semanticColors: {
    bodyBackground: '#ffffff',
    bodyText: '#242424',
    bodyDivider: '#d1d1d1',
    buttonBackground: '#f5f5f5',
    buttonBackgroundHovered: '#e6f2ff',
    buttonText: '#242424',
    buttonTextHovered: '#0f548c',
    disabledBackground: '#f0f0f0',
    disabledText: '#8a8886',
    errorText: '#c50f1f',
    focusBorder: '#0f6cbd',
    inputBorder: '#8a8886',
    primaryButtonText: '#ffffff'
  },
  fonts: { medium: { fontFamily: '"Segoe UI", sans-serif' } }
});

const darkTheme = mapSharePointTheme({
  isInverted: true,
  palette: {
    white: '#ffffff',
    neutralPrimary: '#f5f5f5',
    neutralSecondary: '#c8c6c4',
    neutralLight: '#484644',
    neutralLighter: '#323130',
    neutralLighterAlt: '#252423',
    themePrimary: '#75b6e7',
    themeDarkAlt: '#9ccbee',
    themeLighter: '#173a5e',
    redDark: '#ff99a4'
  },
  semanticColors: {
    bodyBackground: '#201f1e',
    bodyText: '#f5f5f5',
    bodyDivider: '#484644',
    buttonBackground: '#323130',
    buttonBackgroundHovered: '#3b4f65',
    buttonText: '#f5f5f5',
    buttonTextHovered: '#ffffff',
    disabledBackground: '#323130',
    disabledText: '#a19f9d',
    errorText: '#ff99a4',
    focusBorder: '#75b6e7',
    inputBorder: '#8a8886',
    primaryButtonText: '#201f1e'
  },
  fonts: { medium: { fontFamily: '"Segoe UI", sans-serif' } }
});

const themes: Record<SpfxUiThemeMode, SpfxUiThemeTokens> = {
  light: lightTheme,
  dark: darkTheme
};

interface ContractRootProps {
  host: SpfxUiHost;
  label: string;
  initialTheme: SpfxUiThemeMode;
}

function ContractRoot({ host, label, initialTheme }: ContractRootProps): React.ReactElement {
  const [themeMode, setThemeMode] = React.useState<SpfxUiThemeMode>(initialTheme);
  const dialogTriggerId = useSpfxUiId('dialog-trigger');
  const dialogContentId = useSpfxUiId('dialog-content');
  const dialogTitleId = useSpfxUiId('dialog-title');
  const dialogDescriptionId = useSpfxUiId('dialog-description');
  const selectTriggerId = useSpfxUiId('select-trigger');
  const selectContentId = useSpfxUiId('select-content');
  const tooltipTriggerId = useSpfxUiId('tooltip-trigger');
  const tooltipContentId = useSpfxUiId('tooltip-content');
  const menuTriggerId = useSpfxUiId('menu-trigger');
  const menuContentId = useSpfxUiId('menu-content');

  const toggleTheme = React.useCallback(() => {
    setThemeMode((current) => {
      const next = current === 'light' ? 'dark' : 'light';
      host.applyTheme(themes[next]);
      return next;
    });
  }, [host]);

  return (
    <section
      aria-labelledby={host.idFor('heading')}
      data-contract-document={
        host.targetDocument === document && host.targetWindow === window ? 'target-document-owned' : 'mismatch'
      }
      data-contract-root={host.instanceId}
      data-contract-theme={themeMode}
      style={rootPanelStyle}
    >
      <div style={controlsStyle}>
        <h2 id={host.idFor('heading')} style={{ margin: 0 }}>
          Profile root {label}
        </h2>
        <Badge data-contract-badge={host.instanceId}>React 17 · {themeMode}</Badge>
      </div>

      <output data-contract-id-ledger={host.instanceId}>{host.appRoot.id}</output>

      <div style={controlsStyle}>
        <button data-action={`toggle-theme-${host.instanceId}`} onClick={toggleTheme} style={triggerStyle} type="button">
          Toggle {label} theme
        </button>

        <Dialog>
          <DialogTrigger aria-controls={dialogContentId} id={dialogTriggerId} style={triggerStyle}>
            Open {label} dialog
          </DialogTrigger>
          <DialogContent
            aria-describedby={dialogDescriptionId}
            aria-labelledby={dialogTitleId}
            data-contract-overlay={`${host.instanceId}-dialog`}
            id={dialogContentId}
            showCloseButton={false}
          >
            <DialogTitle id={dialogTitleId}>{label} dialog</DialogTitle>
            <DialogDescription id={dialogDescriptionId}>
              This dialog must remain inside the {label} portal host.
            </DialogDescription>
            <DialogClose style={triggerStyle}>Close {label} dialog</DialogClose>
          </DialogContent>
        </Dialog>

        <Select defaultValue="alpha" id={host.idFor('select-root')}>
          <SelectTrigger
            aria-controls={selectContentId}
            aria-label={`${label} selection`}
            id={selectTriggerId}
            style={triggerStyle}
          >
            <SelectValue placeholder="Choose an option" />
          </SelectTrigger>
          <SelectContent data-contract-overlay={`${host.instanceId}-select`} id={selectContentId}>
            <SelectItem value="alpha">Alpha</SelectItem>
            <SelectItem value="beta">Beta</SelectItem>
          </SelectContent>
        </Select>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger aria-describedby={tooltipContentId} id={tooltipTriggerId} style={triggerStyle}>
              Show {label} tooltip
            </TooltipTrigger>
            <TooltipContent data-contract-overlay={`${host.instanceId}-tooltip`} id={tooltipContentId}>
              Tooltip owned by {label}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <DropdownMenu>
          <DropdownMenuTrigger aria-controls={menuContentId} id={menuTriggerId} style={triggerStyle}>
            Open {label} menu
          </DropdownMenuTrigger>
          <DropdownMenuContent data-contract-overlay={`${host.instanceId}-menu`} id={menuContentId}>
            <DropdownMenuItem id={host.idFor('menu-item')}>Menu item {label}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </section>
  );
}

interface HostSection {
  section: HTMLElement;
  mountPoint: HTMLElement;
  portalParent: HTMLElement;
  teardownButton: HTMLButtonElement;
  remountButton: HTMLButtonElement;
  status: HTMLOutputElement;
}

function appendElement<K extends keyof HTMLElementTagNameMap>(
  parent: HTMLElement,
  tagName: K,
  attributes: Record<string, string>
): HTMLElementTagNameMap[K] {
  const element = parent.ownerDocument.createElement(tagName);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  parent.append(element);
  return element;
}

function applyStyles(element: HTMLElement, styles: Record<string, string>): void {
  Object.assign(element.style, styles);
}

function createHostSection(shell: HTMLElement, instanceId: string, label: string): HostSection {
  const section = appendElement(shell, 'section', {
    'aria-label': `Host fixture ${label}`,
    'data-host-fixture': instanceId
  });
  applyStyles(section, {
    border: '1px solid #8a8886',
    borderRadius: '0.5rem',
    display: 'grid',
    gap: '0.75rem',
    overflow: 'visible',
    padding: '0.75rem'
  });

  const lifecycle = appendElement(section, 'div', { 'data-host-lifecycle': instanceId });
  applyStyles(lifecycle, { alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' });
  const teardownButton = appendElement(lifecycle, 'button', {
    'data-action': `teardown-${instanceId}`,
    type: 'button'
  });
  teardownButton.textContent = `Teardown ${label}`;
  const remountButton = appendElement(lifecycle, 'button', {
    'data-action': `remount-${instanceId}`,
    type: 'button'
  });
  remountButton.textContent = `Remount ${label}`;
  remountButton.disabled = true;
  const status = appendElement(lifecycle, 'output', { 'data-host-status': instanceId });
  status.textContent = 'mounted';

  const sentinel = appendElement(section, 'div', { 'data-host-sentinel': instanceId });
  sentinel.textContent = `SharePoint host sentinel ${label}`;
  sentinel.style.borderTop = '3px solid rgb(163, 44, 44)';

  const mountPoint = appendElement(section, 'div', { 'data-host-mount': instanceId });
  const portalParent = appendElement(section, 'div', { 'data-host-portal-parent': instanceId });

  return { section, mountPoint, portalParent, teardownButton, remountButton, status };
}

interface MountedRootController {
  mount(): void;
  teardown(): void;
}

function createMountedRootController(
  fixture: HostSection,
  instanceId: string,
  label: string,
  initialTheme: SpfxUiThemeMode
): MountedRootController {
  let host: SpfxUiHost | undefined;

  const updateLifecycleControls = (): void => {
    const mounted = Boolean(host);
    fixture.teardownButton.disabled = !mounted;
    fixture.remountButton.disabled = mounted;
    fixture.status.textContent = mounted ? 'mounted' : 'disposed';
    fixture.section.setAttribute('data-host-state', mounted ? 'mounted' : 'disposed');
  };

  const mount = (): void => {
    if (host) return;
    host = createSpfxUiHost({
      mountPoint: fixture.mountPoint,
      portalParent: fixture.portalParent,
      targetDocument: fixture.mountPoint.ownerDocument,
      instanceId,
      theme: themes[initialTheme]
    });
    ReactDom.render(
      <SpfxUiHostProvider host={host}>
        <ContractRoot host={host} initialTheme={initialTheme} label={label} />
      </SpfxUiHostProvider>,
      host.appRoot
    );
    updateLifecycleControls();
  };

  const teardown = (): void => {
    if (!host) return;
    ReactDom.unmountComponentAtNode(host.appRoot);
    host.dispose();
    host = undefined;
    updateLifecycleControls();
  };

  fixture.teardownButton.addEventListener('click', teardown);
  fixture.remountButton.addEventListener('click', mount);
  mount();

  return { mount, teardown };
}

export function mountUiProfileContractHarness(container: HTMLElement): () => void {
  const targetDocument = container.ownerDocument;
  targetDocument.title = 'SPFx UI profile root contract canary';
  container.replaceChildren();

  const shell = appendElement(container, 'main', {
    'aria-labelledby': 'ui-profile-contract-heading',
    'data-ui-profile-contract-harness': 'ready'
  });
  applyStyles(shell, {
    display: 'grid',
    fontFamily: '"Segoe UI", sans-serif',
    gap: '1rem',
    margin: '0 auto',
    maxWidth: '72rem',
    padding: '1.5rem'
  });
  const heading = appendElement(shell, 'h1', { id: 'ui-profile-contract-heading' });
  heading.textContent = 'SPFx UI profile root contract';
  const description = appendElement(shell, 'p', {});
  description.textContent = 'Two isolated React 17 roots exercise document, theme, ID, and portal ownership.';

  const fixtureA = createHostSection(shell, 'contract-a', 'A');
  const fixtureB = createHostSection(shell, 'contract-b', 'B');
  const rootA = createMountedRootController(fixtureA, 'contract-a', 'A', 'light');
  const rootB = createMountedRootController(fixtureB, 'contract-b', 'B', 'dark');

  return () => {
    rootA.teardown();
    rootB.teardown();
    container.replaceChildren();
  };
}
