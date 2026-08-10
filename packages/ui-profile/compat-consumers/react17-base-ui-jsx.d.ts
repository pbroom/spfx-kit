import 'react';

type React17JsxElement = JSX.Element;
type React17JsxElementChildrenAttribute = JSX.ElementChildrenAttribute;
type React17JsxIntrinsicElements = JSX.IntrinsicElements;

declare global {
  interface TrustedHTML {
    readonly __spfxUiTrustedHtmlBrand?: never;
  }
}

declare module 'react' {
  namespace JSX {
    type Element = React17JsxElement;
    type ElementChildrenAttribute = React17JsxElementChildrenAttribute;
    type IntrinsicElements = React17JsxIntrinsicElements;
  }
}

declare module 'react/jsx-runtime' {
  namespace JSX {
    type Element = React17JsxElement;
    type ElementChildrenAttribute = React17JsxElementChildrenAttribute;
    type IntrinsicElements = React17JsxIntrinsicElements;
  }
}

declare module 'react/jsx-dev-runtime' {
  namespace JSX {
    type Element = React17JsxElement;
    type ElementChildrenAttribute = React17JsxElementChildrenAttribute;
    type IntrinsicElements = React17JsxIntrinsicElements;
  }
}
