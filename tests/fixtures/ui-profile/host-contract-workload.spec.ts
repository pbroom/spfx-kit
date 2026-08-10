import * as React from 'react';
import * as ReactDom from 'react-dom';
import { act } from 'react-dom/test-utils';
import { Window as HappyWindow } from 'happy-dom';
import { afterEach, expect, it } from 'vitest';
import { Dialog, DialogContent, DialogPortal } from '@spfx-kit/ui-profile/dialog';
import {
  SPFX_UI_PORTAL_ATTRIBUTE,
  SPFX_UI_PROFILE_ATTRIBUTE,
  SPFX_UI_ROOT_ATTRIBUTE,
  SPFX_UI_SCOPE_ATTRIBUTE,
  SPFX_UI_THEME_ATTRIBUTE,
  SpfxUiHostProvider,
  createSpfxUiHost,
  mapSharePointTheme,
  useSpfxUiHost,
  useSpfxUiDerivedId,
  useSpfxUiId,
  useSpfxUiPortalId,
  SPFX_UI_PROFILE_ID,
  SPFX_UI_SCOPE_VALUE,
  type SpfxUiHost
} from '@spfx-kit/ui-profile';

const ownedHosts: SpfxUiHost[] = [];
const mountPoints: HTMLElement[] = [];

afterEach(() => {
  for (const host of ownedHosts.splice(0)) {
    act(() => ReactDom.unmountComponentAtNode(host.appRoot));
    host.dispose();
  }
  for (const mountPoint of mountPoints.splice(0)) mountPoint.remove();
});

it('mirrors scope and SharePoint theme tokens to both owned surfaces without mutating host nodes', () => {
  const mountPoint = createMountPoint();
  const sharePointNode = document.createElement('p');
  sharePointNode.textContent = 'SharePoint-owned';
  mountPoint.appendChild(sharePointNode);
  const host = createHost(mountPoint, 'theme-root', false);

  expect(mountPoint.firstElementChild).toBe(sharePointNode);
  expect(host.appRoot.getAttribute(SPFX_UI_ROOT_ATTRIBUTE)).toBe('theme-root');
  expect(host.portalHost.getAttribute(SPFX_UI_PORTAL_ATTRIBUTE)).toBe('theme-root');
  for (const element of [host.appRoot, host.portalHost]) {
    expect(element.getAttribute(SPFX_UI_PROFILE_ATTRIBUTE)).toBe(SPFX_UI_PROFILE_ID);
    expect(element.getAttribute(SPFX_UI_SCOPE_ATTRIBUTE)).toBe(SPFX_UI_SCOPE_VALUE);
    expect(element.getAttribute(SPFX_UI_THEME_ATTRIBUTE)).toBe('light');
    expect(element.style.getPropertyValue('--spfx-ui-color-primary')).toBe('#0f6cbd');
    expect(element.style.getPropertyValue('--spfx-ui-font-heading')).toBe('Aptos');
  }

  host.applyTheme(mapSharePointTheme(testSharePointTheme(true)));
  for (const element of [host.appRoot, host.portalHost]) {
    expect(element.getAttribute(SPFX_UI_THEME_ATTRIBUTE)).toBe('dark');
    expect(element.style.getPropertyValue('--spfx-ui-color-background')).toBe('#111111');
  }
  const invalidTheme = { ...mapSharePointTheme(testSharePointTheme(false)), colorPrimary: '' };
  expect(() => host.applyTheme(invalidTheme)).toThrow('colorPrimary must not be empty');
  for (const element of [host.appRoot, host.portalHost]) {
    expect(element.getAttribute(SPFX_UI_THEME_ATTRIBUTE)).toBe('dark');
    expect(element.style.getPropertyValue('--spfx-ui-color-background')).toBe('#111111');
  }

  host.dispose();
  host.dispose();
  expect(mountPoint.children).toHaveLength(1);
  expect(mountPoint.firstElementChild).toBe(sharePointNode);
});

it('derives stable semantic IDs from the explicit instance namespace across remounts', () => {
  const firstMount = createMountPoint();
  const secondMount = createMountPoint();
  const first = createHost(firstMount, 'instance-alpha', false);
  const second = createHost(secondMount, 'instance-beta', false);
  const firstId = first.idFor('field-label');
  const firstDescriptionId = first.deriveElementId(firstId, 'description');
  const firstPortalId = first.portalIdFor(first.idFor('dialog-content'));

  expect(firstId).not.toBe(second.idFor('field-label'));
  expect(first.idFor('field-label')).toBe(firstId);
  expect(first.deriveElementId(firstId, 'description')).toBe(firstDescriptionId);
  expect(firstDescriptionId).not.toBe(firstId);
  expect(firstDescriptionId).not.toBe(second.deriveElementId(second.idFor('field-label'), 'description'));
  expect(first.requireElementId(firstDescriptionId, 'derived fixture ID')).toBe(firstDescriptionId);
  expect(() => first.deriveElementId(second.idFor('field-label'), 'description')).toThrow(
    "must come from this host's idFor namespace"
  );
  expect(() => first.deriveElementId(firstId, '')).toThrow('derived ID semantic part must be a non-empty');
  expect(first.appRoot.id).not.toBe(firstId);
  expect(first.portalHost.id).not.toBe(firstId);
  expect(first.appRoot.id).not.toBe(first.portalHost.id);
  expect(firstPortalId).not.toBe(first.idFor('dialog-content'));
  expect(firstPortalId).not.toBe(second.portalIdFor(second.idFor('dialog-content')));
  expect(first.portalIdFor(first.idFor('dialog-content'))).toBe(firstPortalId);
  expect(first.requirePortalId(firstPortalId, 'fixture portal ID')).toBe(firstPortalId);
  expect(() => first.portalIdFor(second.idFor('dialog-content'))).toThrow("must come from this host's idFor namespace");
  expect(() => first.portalIdFor('mui-1')).toThrow("must come from this host's idFor namespace");
  expect(() => first.requirePortalId(second.portalIdFor(second.idFor('dialog-content')), 'fixture portal ID')).toThrow(
    "must come from this host's portalIdFor namespace"
  );
  expect(() => first.requirePortalId(first.idFor('dialog-content'), 'fixture portal ID')).toThrow(
    "must come from this host's portalIdFor namespace"
  );
  expect(first.requireElementId(firstId, 'fixture ID')).toBe(firstId);
  expect(() => first.requireElementId(`${firstId}-not-hex`, 'fixture ID')).toThrow("must come from this host's idFor namespace");
  const elementPrefix = firstId.slice(0, firstId.indexOf('-element-') + '-element-'.length);
  for (const forgedElementId of [`${elementPrefix}00`, `${elementPrefix}110000`, `${elementPrefix}1f`]) {
    expect(() => first.requireElementId(forgedElementId, 'fixture ID')).toThrow("must come from this host's idFor namespace");
  }
  const portalPrefix = firstPortalId.slice(0, firstPortalId.indexOf('-portal-') + '-portal-'.length);
  for (const forgedPortalId of [`${portalPrefix}00`, `${portalPrefix}110000`, `${firstPortalId}-00`]) {
    expect(() => first.requirePortalId(forgedPortalId, 'fixture portal ID')).toThrow(
      "must come from this host's portalIdFor namespace"
    );
  }
  expect(() => createHost(createMountPoint(), 'instance-alpha', false)).toThrow('is already mounted');

  first.dispose();
  const remounted = createHost(firstMount, 'instance-alpha', false);
  expect(remounted.idFor('field-label')).toBe(firstId);
  expect(remounted.deriveElementId(firstId, 'description')).toBe(firstDescriptionId);
  expect(remounted.portalIdFor(remounted.idFor('dialog-content'))).toBe(firstPortalId);
});

it('provides the owning document, window, portal host, and deterministic label relationships through React 17', () => {
  const mountPoint = createMountPoint();
  const host = createHost(mountPoint, 'provider-root', false);

  function IdProbe(): React.ReactElement {
    const labelId = useSpfxUiId('account-label');
    const inputId = useSpfxUiId('account-input');
    const descriptionId = useSpfxUiDerivedId(inputId, 'description');
    const dialogContentId = useSpfxUiId('account-dialog');
    const portalId = useSpfxUiPortalId(dialogContentId);
    const context = useSpfxUiHost();
    return React.createElement(
      'div',
      { 'data-document-match': String(context.targetDocument === document), 'data-portal-id': portalId },
      React.createElement('label', { id: labelId, htmlFor: inputId }, 'Account'),
      React.createElement('input', { id: inputId, 'aria-labelledby': labelId, 'aria-describedby': descriptionId }),
      React.createElement('p', { id: descriptionId }, 'Account description')
    );
  }

  act(() => {
    ReactDom.render(React.createElement(SpfxUiHostProvider, { host }, React.createElement(IdProbe)), host.appRoot);
  });
  const label = host.appRoot.querySelector<HTMLLabelElement>('label');
  const input = host.appRoot.querySelector<HTMLInputElement>('input');
  expect(host.appRoot.querySelector('[data-document-match="true"]')).not.toBeNull();
  expect(label?.htmlFor).toBe(input?.id);
  expect(input?.getAttribute('aria-labelledby')).toBe(label?.id);
  expect(input?.getAttribute('aria-describedby')).toBe(host.deriveElementId(host.idFor('account-input'), 'description'));
  expect(host.appRoot.querySelector('[data-portal-id]')?.getAttribute('data-portal-id')).toBe(
    host.portalIdFor(host.idFor('account-dialog'))
  );
  expect(host.portalHost.ownerDocument).toBe(document);
  expect(host.targetWindow).toBe(window);
});

it('fails closed before a portal can render without an owned content ID', () => {
  const mountPoint = createMountPoint();
  const host = createHost(mountPoint, 'missing-portal-id-root', false);

  function MissingPortalIdProbe(): React.ReactElement {
    useSpfxUiPortalId(undefined);
    return React.createElement('div');
  }

  expect(() => {
    act(() => {
      ReactDom.render(React.createElement(SpfxUiHostProvider, { host }, React.createElement(MissingPortalIdProbe)), host.appRoot);
    });
  }).toThrow('portal content must provide an ID from useSpfxUiId');
});

it('preserves the contracted popup ID across Base UI render prop customization', () => {
  const mountPoint = createMountPoint();
  const host = createHost(mountPoint, 'render-prop-root', false);
  const contentId = host.idFor('dialog-content');

  act(() => {
    ReactDom.render(
      React.createElement(
        SpfxUiHostProvider,
        { host },
        React.createElement(
          Dialog,
          { defaultOpen: true },
          React.createElement(DialogContent, {
            id: contentId,
            render: React.createElement('section', { 'data-render-probe': 'owned' }),
            showCloseButton: false
          })
        )
      ),
      host.appRoot
    );
  });
  expect(host.portalHost.querySelector('[data-render-probe="owned"]')?.id).toBe(contentId);

  const foreignMountPoint = createMountPoint();
  const foreignHost = createHost(foreignMountPoint, 'render-prop-foreign-root', false);
  expect(() => {
    act(() => {
      ReactDom.render(
        React.createElement(
          SpfxUiHostProvider,
          { host: foreignHost },
          React.createElement(
            Dialog,
            { defaultOpen: true },
            React.createElement(DialogContent, {
              id: foreignHost.idFor('dialog-content'),
              render: React.createElement('section', { id: 'foreign-or-colliding-id' }),
              showCloseButton: false
            })
          )
        ),
        foreignHost.appRoot
      );
    });
  }).toThrow('DialogContent render prop must not override its owned ID');
});

it('preserves the contracted portal ID across Base UI render elements and callbacks', () => {
  const mountPoint = createMountPoint();
  const host = createHost(mountPoint, 'portal-render-prop-root', false);
  const contentId = host.idFor('dialog-content');
  const portalId = host.portalIdFor(contentId);

  act(() => {
    ReactDom.render(
      React.createElement(
        SpfxUiHostProvider,
        { host },
        React.createElement(
          Dialog,
          { defaultOpen: true },
          React.createElement(
            DialogPortal,
            {
              id: contentId,
              keepMounted: true,
              render: React.createElement('section', { 'data-portal-render-probe': 'owned' })
            },
            React.createElement('div')
          )
        )
      ),
      host.appRoot
    );
  });
  expect(host.portalHost.querySelector('[data-portal-render-probe="owned"]')?.id).toBe(portalId);

  const foreignMountPoint = createMountPoint();
  const foreignHost = createHost(foreignMountPoint, 'portal-render-prop-foreign-root', false);
  expect(() => {
    act(() => {
      ReactDom.render(
        React.createElement(
          SpfxUiHostProvider,
          { host: foreignHost },
          React.createElement(
            Dialog,
            { defaultOpen: true },
            React.createElement(DialogPortal, {
              id: foreignHost.idFor('dialog-content'),
              keepMounted: true,
              render: () => React.createElement('section', { id: 'foreign-or-colliding-portal-id' })
            })
          )
        ),
        foreignHost.appRoot
      );
    });
  }).toThrow('DialogPortal render prop must not override its owned ID');

  function SwallowsOwnedId(): React.ReactElement {
    return React.createElement('section', { 'data-swallow-owned-id': 'true' });
  }
  for (const [instanceId, render] of [
    ['portal-fragment-render-root', React.createElement(React.Fragment, null, React.createElement('section'))],
    ['portal-component-render-root', React.createElement(SwallowsOwnedId)]
  ] as const) {
    const nonIntrinsicMountPoint = createMountPoint();
    const nonIntrinsicHost = createHost(nonIntrinsicMountPoint, instanceId, false);
    expect(() => {
      act(() => {
        ReactDom.render(
          React.createElement(
            SpfxUiHostProvider,
            { host: nonIntrinsicHost },
            React.createElement(
              Dialog,
              { defaultOpen: true },
              React.createElement(DialogPortal, {
                id: nonIntrinsicHost.idFor('dialog-content'),
                keepMounted: true,
                render
              })
            )
          ),
          nonIntrinsicHost.appRoot
        );
      });
    }).toThrow('DialogPortal render prop must return an intrinsic DOM element');
  }
});

it('rejects cross-document host inputs and derives the window only from the supplied document', () => {
  const foreignWindow = new HappyWindow();
  const foreignDocument = foreignWindow.document as unknown as Document;
  const foreignMount = foreignDocument.createElement('div');
  const localPortalParent = createMountPoint();
  expect(() =>
    createSpfxUiHost({
      mountPoint: foreignMount,
      portalParent: localPortalParent,
      targetDocument: foreignDocument,
      instanceId: 'foreign-root',
      theme: mapSharePointTheme(testSharePointTheme(false))
    })
  ).toThrow('portalParent must belong to targetDocument');

  const foreignPortalParent = foreignDocument.createElement('div');
  foreignDocument.body.append(foreignMount, foreignPortalParent);
  const host = createSpfxUiHost({
    mountPoint: foreignMount,
    portalParent: foreignPortalParent,
    targetDocument: foreignDocument,
    instanceId: 'foreign-root',
    theme: mapSharePointTheme(testSharePointTheme(false))
  });
  expect(host.targetDocument).toBe(foreignDocument);
  expect(host.targetWindow).toBe(foreignWindow);
  host.dispose();
  foreignWindow.close();
});

function createMountPoint(): HTMLDivElement {
  const mountPoint = document.createElement('div');
  document.body.appendChild(mountPoint);
  mountPoints.push(mountPoint);
  return mountPoint;
}

function createHost(mountPoint: HTMLElement, instanceId: string, isInverted: boolean): SpfxUiHost {
  const host = createSpfxUiHost({
    mountPoint,
    portalParent: mountPoint,
    targetDocument: document,
    instanceId,
    theme: mapSharePointTheme(testSharePointTheme(isInverted))
  });
  ownedHosts.push(host);
  return host;
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
    },
    fonts: { medium: { fontFamily: 'Aptos' } }
  };
}
