import 'react';

type React17JsxElement = JSX.Element;
type React17JsxElementClass = JSX.ElementClass;
type React17JsxElementAttributesProperty = JSX.ElementAttributesProperty;
type React17JsxElementChildrenAttribute = JSX.ElementChildrenAttribute;
type React17JsxLibraryManagedAttributes<Component, Props> = JSX.LibraryManagedAttributes<Component, Props>;
type React17JsxIntrinsicAttributes = JSX.IntrinsicAttributes;
type React17JsxIntrinsicClassAttributes<Instance> = JSX.IntrinsicClassAttributes<Instance>;
type React17JsxIntrinsicElements = JSX.IntrinsicElements;

declare module 'react' {
  namespace JSX {
    type Element = React17JsxElement;
    type ElementClass = React17JsxElementClass;
    type ElementAttributesProperty = React17JsxElementAttributesProperty;
    type ElementChildrenAttribute = React17JsxElementChildrenAttribute;
    type LibraryManagedAttributes<Component, Props> = React17JsxLibraryManagedAttributes<Component, Props>;
    type IntrinsicAttributes = React17JsxIntrinsicAttributes;
    type IntrinsicClassAttributes<Instance> = React17JsxIntrinsicClassAttributes<Instance>;
    type IntrinsicElements = React17JsxIntrinsicElements;
  }
}

declare module 'react/jsx-runtime' {
  namespace JSX {
    type Element = React17JsxElement;
    type ElementClass = React17JsxElementClass;
    type ElementAttributesProperty = React17JsxElementAttributesProperty;
    type ElementChildrenAttribute = React17JsxElementChildrenAttribute;
    type LibraryManagedAttributes<Component, Props> = React17JsxLibraryManagedAttributes<Component, Props>;
    type IntrinsicAttributes = React17JsxIntrinsicAttributes;
    type IntrinsicClassAttributes<Instance> = React17JsxIntrinsicClassAttributes<Instance>;
    type IntrinsicElements = React17JsxIntrinsicElements;
  }
}

declare module 'react/jsx-dev-runtime' {
  namespace JSX {
    type Element = React17JsxElement;
    type ElementClass = React17JsxElementClass;
    type ElementAttributesProperty = React17JsxElementAttributesProperty;
    type ElementChildrenAttribute = React17JsxElementChildrenAttribute;
    type LibraryManagedAttributes<Component, Props> = React17JsxLibraryManagedAttributes<Component, Props>;
    type IntrinsicAttributes = React17JsxIntrinsicAttributes;
    type IntrinsicClassAttributes<Instance> = React17JsxIntrinsicClassAttributes<Instance>;
    type IntrinsicElements = React17JsxIntrinsicElements;
  }
}
