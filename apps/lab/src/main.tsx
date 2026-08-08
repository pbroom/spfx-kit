import * as React from 'react';
import * as ReactDom from 'react-dom';
import { profileId, scopeValue } from 'virtual:spfx-ui-profile-delivery';
import { createSpfxUiHost, SpfxUiHostProvider } from '../../../packages/ui-profile/normalized/src/lib/ui-root';
import { LabApp } from './LabApp';
import { createLabTheme } from '@spfx-kit/spfx-lab-runtime';
import { createLabUiThemeTokens } from './ui-profile/lab-theme';
import './styles/lab.css';

const root = document.getElementById('root');
if (!root) throw new Error('Lab root element is missing');

const isUiProfileContractRoute = new URLSearchParams(window.location.search).get('ui-profile-contract') === '1';

if (isUiProfileContractRoute) {
  void import('./components/UiProfileContractHarness').then(({ mountUiProfileContractHarness }) => {
    mountUiProfileContractHarness(root);
  });
} else {
  const host = createSpfxUiHost({
    mountPoint: root,
    portalParent: root,
    targetDocument: root.ownerDocument,
    instanceId: 'spfx-kit-lab-shell',
    profileId,
    scopeValue,
    theme: createLabUiThemeTokens('light', createLabTheme('light'))
  });
  ReactDom.render(
    <SpfxUiHostProvider host={host}>
      <LabApp uiHost={host} />
    </SpfxUiHostProvider>,
    host.appRoot
  );
}
