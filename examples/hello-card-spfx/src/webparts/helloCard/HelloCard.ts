import * as React from 'react';
import * as ReactDom from 'react-dom';
import { Version } from '@microsoft/sp-core-library';
import { IPropertyPaneConfiguration, PropertyPaneChoiceGroup, PropertyPaneTextField } from '@microsoft/sp-property-pane';
import { IReadonlyTheme } from '@microsoft/sp-component-base';
import { BaseClientSideWebPart } from '@microsoft/sp-webpart-base';
import {
  createSpfxUiHost,
  mapSharePointTheme,
  SpfxUiHostProvider,
  type SharePointThemeLike,
  type SpfxUiHost
} from '@spfx-kit/ui-profile';
import { Button } from '@spfx-kit/ui-profile/button';
import * as strings from 'WebPartStrings';
import '@spfx-kit/ui-profile/styles.css';

export interface IHelloCardProps {
  title: string;
  message: string;
  align: string;
}

const fallbackTheme: SharePointThemeLike = {
  palette: {
    white: '#ffffff',
    neutralPrimary: '#242424',
    neutralSecondary: '#616161',
    neutralLight: '#e5e5e5',
    neutralLighter: '#f0f0f0',
    neutralLighterAlt: '#f5f5f5',
    themePrimary: '#0f6cbd',
    themeDarkAlt: '#0f548c',
    themeLighter: '#eef6ff',
    redDark: '#c50f1f'
  },
  semanticColors: {
    bodyBackground: '#ffffff',
    bodyText: '#242424',
    primaryButtonText: '#ffffff'
  }
};

const HelloCard: React.FunctionComponent<IHelloCardProps> = ({ title, message, align }) =>
  React.createElement(
    'section',
    {
      style: {
        display: 'grid',
        gap: 12,
        justifyItems: align === 'center' ? 'center' : align === 'right' ? 'end' : 'start',
        padding: 16,
        textAlign: align === 'center' ? 'center' : align === 'right' ? 'right' : 'left'
      }
    },
    React.createElement('h2', { style: { fontFamily: 'var(--spfx-ui-font-heading)', margin: 0 } }, title || 'Hello Card'),
    React.createElement('p', { style: { margin: 0 } }, message || ''),
    React.createElement(Button, { type: 'button', variant: 'outline' }, 'Shared UI ready')
  );

export default class HelloCardWebPart extends BaseClientSideWebPart<IHelloCardProps> {
  private uiHost: SpfxUiHost | undefined;
  private theme: IReadonlyTheme | undefined;

  public render(): void {
    if (!this.uiHost) {
      this.uiHost = createSpfxUiHost({
        mountPoint: this.domElement,
        portalParent: this.domElement,
        targetDocument: this.domElement.ownerDocument,
        instanceId: this.instanceId,
        theme: mapSharePointTheme(this.theme ?? fallbackTheme)
      });
    } else {
      this.uiHost.applyTheme(mapSharePointTheme(this.theme ?? fallbackTheme));
    }
    ReactDom.render(
      React.createElement(
        SpfxUiHostProvider,
        { host: this.uiHost },
        React.createElement(HelloCard, {
          title: this.properties.title,
          message: this.properties.message,
          align: this.properties.align
        })
      ),
      this.uiHost.appRoot
    );
  }

  protected onThemeChanged(currentTheme: IReadonlyTheme | undefined): void {
    this.theme = currentTheme;
    if (this.uiHost) this.uiHost.applyTheme(mapSharePointTheme(currentTheme ?? fallbackTheme));
  }

  protected onDispose(): void {
    if (!this.uiHost) return;
    ReactDom.unmountComponentAtNode(this.uiHost.appRoot);
    this.uiHost.dispose();
    this.uiHost = undefined;
  }
  protected get dataVersion(): Version {
    return Version.parse('1.0');
  }
  protected getPropertyPaneConfiguration(): IPropertyPaneConfiguration {
    return {
      pages: [
        {
          header: { description: strings.PropertyPaneDescription },
          groups: [
            {
              groupName: 'Display',
              groupFields: [
                PropertyPaneTextField('title', { label: strings.TitleFieldLabel }),
                PropertyPaneTextField('message', { label: strings.MessageFieldLabel, multiline: true }),
                PropertyPaneChoiceGroup('align', {
                  label: strings.AlignFieldLabel,
                  options: [
                    { key: 'left', text: 'Left' },
                    { key: 'center', text: 'Center' },
                    { key: 'right', text: 'Right' }
                  ]
                })
              ]
            }
          ]
        }
      ]
    };
  }
}
