import 'react';

type React17JsxElement = JSX.Element;
type React17JsxIntrinsicElements = JSX.IntrinsicElements;

declare module 'react' {
  namespace JSX {
    type Element = React17JsxElement;
    type IntrinsicElements = React17JsxIntrinsicElements;
  }
}

declare module 'react/jsx-runtime' {
  namespace JSX {
    type Element = React17JsxElement;
    type IntrinsicElements = React17JsxIntrinsicElements;
  }
}

declare module 'react/jsx-dev-runtime' {
  namespace JSX {
    type Element = React17JsxElement;
    type IntrinsicElements = React17JsxIntrinsicElements;
  }
}
