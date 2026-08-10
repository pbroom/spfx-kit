export const uiProfileCatalogEntries = [
  { id: 'accordion', title: 'Accordion' },
  { id: 'alert', title: 'Alert' },
  { id: 'alert-dialog', title: 'Alert Dialog' },
  { id: 'aspect-ratio', title: 'Aspect Ratio' },
  { id: 'attachment', title: 'Attachment' },
  { id: 'avatar', title: 'Avatar' },
  { id: 'badge', title: 'Badge' },
  { id: 'breadcrumb', title: 'Breadcrumb' },
  { id: 'bubble', title: 'Bubble' },
  { id: 'button', title: 'Button' },
  { id: 'button-group', title: 'Button Group' },
  { id: 'calendar', title: 'Calendar' },
  { id: 'card', title: 'Card' },
  { id: 'carousel', title: 'Carousel' },
  { id: 'chart', title: 'Chart' },
  { id: 'checkbox', title: 'Checkbox' },
  { id: 'collapsible', title: 'Collapsible' },
  { id: 'combobox', title: 'Combobox' },
  { id: 'context-menu', title: 'Context Menu' },
  { id: 'dialog', title: 'Dialog' },
  { id: 'direction', title: 'Direction' },
  { id: 'drawer', title: 'Drawer' },
  { id: 'dropdown-menu', title: 'Dropdown Menu' },
  { id: 'empty', title: 'Empty' },
  { id: 'field', title: 'Field' },
  { id: 'hover-card', title: 'Hover Card' },
  { id: 'input', title: 'Input' },
  { id: 'input-group', title: 'Input Group' },
  { id: 'input-otp', title: 'Input OTP' },
  { id: 'item', title: 'Item' },
  { id: 'kbd', title: 'Keyboard Key' },
  { id: 'label', title: 'Label' },
  { id: 'marker', title: 'Marker' },
  { id: 'menubar', title: 'Menubar' },
  { id: 'message', title: 'Message' },
  { id: 'native-select', title: 'Native Select' },
  { id: 'navigation-menu', title: 'Navigation Menu' },
  { id: 'pagination', title: 'Pagination' },
  { id: 'popover', title: 'Popover' },
  { id: 'progress', title: 'Progress' },
  { id: 'radio-group', title: 'Radio Group' },
  { id: 'scroll-area', title: 'Scroll Area' },
  { id: 'select', title: 'Select' },
  { id: 'separator', title: 'Separator' },
  { id: 'sheet', title: 'Sheet' },
  { id: 'sidebar', title: 'Sidebar' },
  { id: 'skeleton', title: 'Skeleton' },
  { id: 'slider', title: 'Slider' },
  { id: 'spinner', title: 'Spinner' },
  { id: 'switch', title: 'Switch' },
  { id: 'table', title: 'Table' },
  { id: 'tabs', title: 'Tabs' },
  { id: 'textarea', title: 'Textarea' },
  { id: 'toast', title: 'Toast' },
  { id: 'toggle', title: 'Toggle' },
  { id: 'toggle-group', title: 'Toggle Group' },
  { id: 'tooltip', title: 'Tooltip' }
] as const;

export type UiProfileCatalogComponentId = (typeof uiProfileCatalogEntries)[number]['id'];

export interface UiProfileCatalogExampleDocumentation {
  id: string;
  title: string;
  summary: string;
  code: string;
}

export interface UiProfileCatalogApiPropDocumentation {
  name: string;
  type: string;
  description: string;
  defaultValue?: string;
}

export interface UiProfileCatalogApiPartDocumentation {
  name: string;
  element: string;
  props: readonly UiProfileCatalogApiPropDocumentation[];
}

export interface UiProfileCatalogDocumentation {
  primaryExport: string;
  summary: string;
  composition?: readonly string[];
  examples?: readonly UiProfileCatalogExampleDocumentation[];
  api?: readonly UiProfileCatalogApiPartDocumentation[];
  compatibilityNotes?: readonly string[];
}

export const uiProfileCatalogDocumentation: Record<UiProfileCatalogComponentId, UiProfileCatalogDocumentation> = {
  accordion: {
    primaryExport: 'Accordion',
    summary: 'Organizes related content into disclosure sections that people can expand as needed.'
  },
  alert: {
    primaryExport: 'Alert',
    summary: 'Presents a concise inline status or message without interrupting the current task.'
  },
  'alert-dialog': {
    primaryExport: 'AlertDialog',
    summary: 'Requests confirmation for an important action in a focused modal surface.'
  },
  'aspect-ratio': {
    primaryExport: 'AspectRatio',
    summary: 'Keeps media and preview content inside a consistent proportional frame.'
  },
  attachment: {
    primaryExport: 'Attachment',
    summary: 'Displays a file with its supporting metadata and relevant actions.'
  },
  avatar: {
    primaryExport: 'Avatar',
    summary: 'Represents a person or entity with an image or readable fallback.'
  },
  badge: {
    primaryExport: 'Badge',
    summary: 'Adds a compact status, category, or count beside related content.'
  },
  breadcrumb: {
    primaryExport: 'Breadcrumb',
    summary: 'Shows the current location within a navigable content hierarchy.',
    composition: [
      'Breadcrumb provides the labelled navigation landmark.',
      'BreadcrumbList contains ordered BreadcrumbItem elements.',
      'BreadcrumbLink represents an ancestor, while BreadcrumbPage marks the current location.',
      'BreadcrumbSeparator and BreadcrumbEllipsis express hierarchy and collapsed levels without changing navigation semantics.'
    ],
    examples: [
      {
        id: 'basic',
        title: 'Basic',
        summary: 'A short hierarchy with one ancestor link and the current page.',
        code: `import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@spfx-kit/ui-profile/breadcrumb';

<Breadcrumb>
  <BreadcrumbList>
    <BreadcrumbItem><BreadcrumbLink href="#home">Home</BreadcrumbLink></BreadcrumbItem>
    <BreadcrumbSeparator />
    <BreadcrumbItem><BreadcrumbPage>Components</BreadcrumbPage></BreadcrumbItem>
  </BreadcrumbList>
</Breadcrumb>`
      },
      {
        id: 'custom-separator',
        title: 'Custom separator',
        summary: 'Separator content can be replaced while the ordered-list structure remains intact.',
        code: `import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@spfx-kit/ui-profile/breadcrumb';

<Breadcrumb>
  <BreadcrumbList>
    <BreadcrumbItem><BreadcrumbLink href="#home">Home</BreadcrumbLink></BreadcrumbItem>
    <BreadcrumbSeparator>/</BreadcrumbSeparator>
    <BreadcrumbItem><BreadcrumbPage>Components</BreadcrumbPage></BreadcrumbItem>
  </BreadcrumbList>
</Breadcrumb>`
      },
      {
        id: 'dropdown',
        title: 'Dropdown',
        summary: 'A host-owned dropdown can expose intermediate locations without widening the breadcrumb.',
        code: `import { useSpfxUiId } from '@spfx-kit/ui-profile';
import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@spfx-kit/ui-profile/breadcrumb';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@spfx-kit/ui-profile/dropdown-menu';

const triggerId = useSpfxUiId('docs:breadcrumb:dropdown-trigger');
const contentId = useSpfxUiId('docs:breadcrumb:dropdown-content');

<Breadcrumb>
  <BreadcrumbList>
    <BreadcrumbItem><BreadcrumbLink href="#home">Home</BreadcrumbLink></BreadcrumbItem>
    <BreadcrumbSeparator />
    <BreadcrumbItem>
      <DropdownMenu>
        <DropdownMenuTrigger aria-label="Open intermediate pages" id={triggerId}>
          <BreadcrumbEllipsis />
        </DropdownMenuTrigger>
        <DropdownMenuContent id={contentId}>
          <DropdownMenuItem>Documentation</DropdownMenuItem>
          <DropdownMenuItem>Components</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </BreadcrumbItem>
    <BreadcrumbSeparator />
    <BreadcrumbItem><BreadcrumbPage>Breadcrumb</BreadcrumbPage></BreadcrumbItem>
  </BreadcrumbList>
</Breadcrumb>`
      },
      {
        id: 'collapsed',
        title: 'Collapsed',
        summary: 'BreadcrumbEllipsis signals omitted levels when those destinations are intentionally not interactive.',
        code: `import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@spfx-kit/ui-profile/breadcrumb';

<Breadcrumb>
  <BreadcrumbList>
    <BreadcrumbItem><BreadcrumbLink href="#home">Home</BreadcrumbLink></BreadcrumbItem>
    <BreadcrumbSeparator />
    <BreadcrumbItem><BreadcrumbEllipsis /></BreadcrumbItem>
    <BreadcrumbSeparator />
    <BreadcrumbItem><BreadcrumbPage>Breadcrumb</BreadcrumbPage></BreadcrumbItem>
  </BreadcrumbList>
</Breadcrumb>`
      },
      {
        id: 'custom-link',
        title: 'Custom link',
        summary: 'The Base UI render prop composes a project link without nesting interactive elements.',
        code: `import { BreadcrumbLink } from '@spfx-kit/ui-profile/breadcrumb';

<BreadcrumbLink render={<a href="#components" data-route="components" />}>
  Components
</BreadcrumbLink>`
      },
      {
        id: 'responsive',
        title: 'Responsive hierarchy',
        summary: 'The middle levels collapse into an owned menu while the first and current locations remain visible.',
        code: `import { useSpfxUiId } from '@spfx-kit/ui-profile';
import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@spfx-kit/ui-profile/breadcrumb';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@spfx-kit/ui-profile/dropdown-menu';

// Use host-owned IDs for the menu trigger and portal content.
const triggerId = useSpfxUiId('docs:breadcrumb:responsive-trigger');
const contentId = useSpfxUiId('docs:breadcrumb:responsive-content');

<Breadcrumb>
  <BreadcrumbList>
    <BreadcrumbItem><BreadcrumbLink href="#home">Home</BreadcrumbLink></BreadcrumbItem>
    <BreadcrumbSeparator />
    <BreadcrumbItem>
      <DropdownMenu>
        <DropdownMenuTrigger aria-controls={contentId} aria-label="Open hidden breadcrumb levels" id={triggerId}>
          <BreadcrumbEllipsis />
        </DropdownMenuTrigger>
        <DropdownMenuContent id={contentId}>
          <DropdownMenuItem>Docs</DropdownMenuItem>
          <DropdownMenuItem>Shared UI</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </BreadcrumbItem>
    <BreadcrumbSeparator />
    <BreadcrumbItem><BreadcrumbPage>Breadcrumb</BreadcrumbPage></BreadcrumbItem>
  </BreadcrumbList>
</Breadcrumb>`
      },
      {
        id: 'rtl',
        title: 'Right-to-left',
        summary: 'The same composition follows the nearest reading direction without a separate component variant.',
        code: `import { DirectionProvider } from '@spfx-kit/ui-profile/direction';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@spfx-kit/ui-profile/breadcrumb';

<div dir="rtl">
  <DirectionProvider direction="rtl">
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem><BreadcrumbLink href="#home">الرئيسية</BreadcrumbLink></BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem><BreadcrumbPage>المكونات</BreadcrumbPage></BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  </DirectionProvider>
</div>`
      }
    ],
    api: [
      { name: 'Breadcrumb', element: 'nav', props: [{ name: 'className', type: 'string', description: 'Adds classes to the navigation landmark.' }] },
      { name: 'BreadcrumbList', element: 'ol', props: [{ name: 'className', type: 'string', description: 'Adds classes to the ordered list.' }] },
      { name: 'BreadcrumbItem', element: 'li', props: [{ name: 'className', type: 'string', description: 'Adds classes to an individual hierarchy item.' }] },
      {
        name: 'BreadcrumbLink',
        element: 'a',
        props: [
          { name: 'render', type: 'ReactElement | function', description: 'Composes a custom link element through Base UI without nested anchors.' },
          { name: 'className', type: 'string', description: 'Adds classes to the link.' }
        ]
      },
      { name: 'BreadcrumbPage', element: 'span', props: [{ name: 'className', type: 'string', description: 'Adds classes to the current-page label.' }] },
      {
        name: 'BreadcrumbSeparator',
        element: 'li',
        props: [
          { name: 'children', type: 'ReactNode', description: 'Replaces the default chevron separator.' },
          { name: 'className', type: 'string', description: 'Adds classes to the separator.' }
        ]
      },
      { name: 'BreadcrumbEllipsis', element: 'span', props: [{ name: 'className', type: 'string', description: 'Adds classes to the collapsed-level indicator.' }] }
    ]
  },
  bubble: {
    primaryExport: 'Bubble',
    summary: 'Frames short conversational content in a message-oriented surface.'
  },
  button: {
    primaryExport: 'Button',
    summary: 'Triggers an action using the shared profile’s accessible interaction states.'
  },
  'button-group': {
    primaryExport: 'ButtonGroup',
    summary: 'Arranges closely related actions as one visually connected control set.'
  },
  calendar: {
    primaryExport: 'Calendar',
    summary: 'Supports date browsing and selection within a familiar monthly grid.'
  },
  card: {
    primaryExport: 'Card',
    summary: 'Groups a focused piece of content with optional header, body, and actions.'
  },
  carousel: {
    primaryExport: 'Carousel',
    summary: 'Moves through a sequence of related panels with previous and next controls.'
  },
  chart: {
    primaryExport: 'ChartContainer',
    summary: 'Provides the themed, responsive container contract for data visualizations.'
  },
  checkbox: {
    primaryExport: 'Checkbox',
    summary: 'Lets people independently include or exclude a single option.'
  },
  collapsible: {
    primaryExport: 'Collapsible',
    summary: 'Reveals optional content while keeping its trigger in the surrounding flow.'
  },
  combobox: {
    primaryExport: 'Combobox',
    summary: 'Combines text search with an accessible collection of selectable results.'
  },
  'context-menu': {
    primaryExport: 'ContextMenu',
    summary: 'Offers actions that are specific to the item or region being invoked.'
  },
  dialog: {
    primaryExport: 'Dialog',
    summary: 'Hosts a focused task or supporting content in an owned modal portal.'
  },
  direction: {
    primaryExport: 'DirectionProvider',
    summary: 'Provides a local reading-direction context for bidirectional interfaces.'
  },
  drawer: {
    primaryExport: 'Drawer',
    summary: 'Presents supporting content in an overlay that enters from a screen edge.'
  },
  'dropdown-menu': {
    primaryExport: 'DropdownMenu',
    summary: 'Collects a compact set of actions behind a clearly labelled trigger.'
  },
  empty: {
    primaryExport: 'Empty',
    summary: 'Explains an empty state and gives the next useful action or context.'
  },
  field: {
    primaryExport: 'Field',
    summary: 'Composes a form control with its label, description, and validation state.'
  },
  'hover-card': {
    primaryExport: 'HoverCard',
    summary: 'Previews supporting information when a linked trigger receives hover or focus.'
  },
  input: {
    primaryExport: 'Input',
    summary: 'Captures a single line of text using the shared field presentation.'
  },
  'input-group': {
    primaryExport: 'InputGroup',
    summary: 'Combines an input with contextual text, icons, or adjacent actions.'
  },
  'input-otp': {
    primaryExport: 'InputOTP',
    summary: 'Captures a short verification code in a structured sequence of slots.'
  },
  item: {
    primaryExport: 'Item',
    summary: 'Builds a reusable structured row with content, description, and actions.'
  },
  kbd: {
    primaryExport: 'Kbd',
    summary: 'Represents a keyboard key or shortcut within instructional content.'
  },
  label: {
    primaryExport: 'Label',
    summary: 'Provides an accessible visible name for an associated form control.'
  },
  marker: {
    primaryExport: 'Marker',
    summary: 'Pairs a compact visual marker with a short piece of supporting content.'
  },
  menubar: {
    primaryExport: 'Menubar',
    summary: 'Keeps application-level command menus available in a persistent row.'
  },
  message: {
    primaryExport: 'Message',
    summary: 'Structures conversational content with optional header, body, and footer.'
  },
  'native-select': {
    primaryExport: 'NativeSelect',
    summary: 'Uses the platform select control with the shared profile’s visual treatment.'
  },
  'navigation-menu': {
    primaryExport: 'NavigationMenu',
    summary: 'Organizes primary navigation links and optional flyout content.'
  },
  pagination: {
    primaryExport: 'Pagination',
    summary: 'Moves between pages while keeping the current location understandable.'
  },
  popover: {
    primaryExport: 'Popover',
    summary: 'Shows non-modal supporting content in an owned portal anchored to a trigger.'
  },
  progress: {
    primaryExport: 'Progress',
    summary: 'Communicates completion for a measurable task or operation.'
  },
  'radio-group': {
    primaryExport: 'RadioGroup',
    summary: 'Lets people choose one value from a visible set of mutually exclusive options.'
  },
  'scroll-area': {
    primaryExport: 'ScrollArea',
    summary: 'Constrains overflow within a styled, keyboard-accessible scrolling region.'
  },
  select: {
    primaryExport: 'Select',
    summary: 'Chooses one value from a compact list presented in an owned portal.'
  },
  separator: {
    primaryExport: 'Separator',
    summary: 'Creates a visual boundary between neighboring groups of content.'
  },
  sheet: {
    primaryExport: 'Sheet',
    summary: 'Opens a task-oriented side panel within the current host and theme.'
  },
  sidebar: {
    primaryExport: 'Sidebar',
    summary: 'Composes persistent navigation and supporting content beside a main surface.'
  },
  skeleton: {
    primaryExport: 'Skeleton',
    summary: 'Reserves content shape while the final information is still loading.'
  },
  slider: {
    primaryExport: 'Slider',
    summary: 'Selects a numeric value along a bounded visual range.'
  },
  spinner: {
    primaryExport: 'Spinner',
    summary: 'Signals that a short operation is currently in progress.'
  },
  switch: {
    primaryExport: 'Switch',
    summary: 'Toggles an immediately applied setting between on and off states.'
  },
  table: {
    primaryExport: 'Table',
    summary: 'Presents structured data with explicit rows, columns, and headings.'
  },
  tabs: {
    primaryExport: 'Tabs',
    summary: 'Switches between related views while keeping one panel active at a time.'
  },
  textarea: {
    primaryExport: 'Textarea',
    summary: 'Captures longer, multi-line text using the shared field presentation.'
  },
  toast: {
    primaryExport: 'Toast',
    summary: 'Delivers a transient status message through the host-owned notification portal.'
  },
  toggle: {
    primaryExport: 'Toggle',
    summary: 'Represents an action that can remain in a pressed or unpressed state.'
  },
  'toggle-group': {
    primaryExport: 'ToggleGroup',
    summary: 'Coordinates related pressed-state controls as a single selection group.'
  },
  tooltip: {
    primaryExport: 'Tooltip',
    summary: 'Adds a brief accessible label or hint to a focused or hovered trigger.'
  }
};

export function uiProfileCatalogImportPath(component: UiProfileCatalogComponentId): string {
  return '@spfx-kit/ui-profile/' + component;
}

export function isUiProfileCatalogComponentId(value: string | undefined): value is UiProfileCatalogComponentId {
  return uiProfileCatalogEntries.some((entry) => entry.id === value);
}

export function uiProfileCatalogSectionId(component: UiProfileCatalogComponentId): string {
  return `ui-library-component-${component}`;
}
