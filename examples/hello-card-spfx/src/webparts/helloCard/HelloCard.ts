import * as React from 'react';
import * as ReactDom from 'react-dom';
import { Version } from '@microsoft/sp-core-library';
import { IPropertyPaneConfiguration, PropertyPaneChoiceGroup, PropertyPaneTextField } from '@microsoft/sp-property-pane';
import { BaseClientSideWebPart } from '@microsoft/sp-webpart-base';
import { FluentProvider, Text, webLightTheme } from '@fluentui/react-components';
import * as strings from 'WebPartStrings';

export interface IHelloCardProps {
  title: string;
  message: string;
  align: string;
}

const HelloCard: React.FunctionComponent<IHelloCardProps> = ({ title, message, align }) =>
  React.createElement(
    FluentProvider,
    { theme: webLightTheme },
    React.createElement(
      'section',
      {
        style: {
          fontFamily: '"Segoe UI", sans-serif',
          padding: 16,
          textAlign: align === 'center' ? 'center' : align === 'right' ? 'right' : 'left'
        }
      },
      React.createElement(Text, { as: 'h2', size: 500, weight: 'semibold', block: true }, title || 'Hello Card'),
      React.createElement(Text, { as: 'p', size: 300, block: true }, message || '')
    )
  );

export default class HelloCardWebPart extends BaseClientSideWebPart<IHelloCardProps> {
  public render(): void {
    ReactDom.render(
      React.createElement(HelloCard, {
        title: this.properties.title,
        message: this.properties.message,
        align: this.properties.align
      }),
      this.domElement
    );
  }
  protected onDispose(): void {
    ReactDom.unmountComponentAtNode(this.domElement);
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
