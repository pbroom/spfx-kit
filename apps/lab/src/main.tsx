import * as React from 'react';
import * as ReactDom from 'react-dom';
import { LabApp } from './LabApp';
import './styles/lab.css';

const root = document.getElementById('root');
if (!root) throw new Error('Lab root element is missing');

const isUiProfileContractRoute = new URLSearchParams(window.location.search).get('ui-profile-contract') === '1';

if (isUiProfileContractRoute) {
  void import('./components/UiProfileContractHarness').then(({ mountUiProfileContractHarness }) => {
    mountUiProfileContractHarness(root);
  });
} else {
  ReactDom.render(<LabApp />, root);
}
