import * as React from 'react';
import * as ReactDom from 'react-dom';
import { createSpfxUiHost, SpfxUiHostProvider } from '@spfx-kit/ui-profile';
import 'virtual:spfx-ui-profile-delivery';
import { LabApp } from './LabApp';
import { createLabTheme } from '@spfx-kit/spfx-lab-runtime';
import { createLabUiThemeTokens } from './ui-profile/lab-theme';
import './styles/lab.css';

const root = document.getElementById('root');
if (!root) throw new Error('Lab root element is missing');

const searchParams = new URLSearchParams(window.location.search);
const isUiProfileCatalogRoute = searchParams.get('ui-profile-catalog') === '1';
const isUiProfileContractRoute = searchParams.get('ui-profile-contract') === '1';

if (isUiProfileCatalogRoute) {
  void import('./components/UiProfileCatalogHarness').then(({ mountUiProfileCatalogHarness }) => {
    mountUiProfileCatalogHarness(root);
  });
} else if (isUiProfileContractRoute) {
  void import('./components/UiProfileContractHarness').then(({ mountUiProfileContractHarness }) => {
    mountUiProfileContractHarness(root);
  });
} else {
  const host = createSpfxUiHost({
    mountPoint: root,
    portalParent: root,
    targetDocument: root.ownerDocument,
    instanceId: 'spfx-kit-lab-shell',
    theme: createLabUiThemeTokens('light', createLabTheme('light'))
  });
  ReactDom.render(
    <SpfxUiHostProvider host={host}>
      <LabApp uiHost={host} />
    </SpfxUiHostProvider>,
    host.appRoot
  );
}
