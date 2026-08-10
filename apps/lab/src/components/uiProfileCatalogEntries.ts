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

interface UiProfileCatalogDocumentation {
  primaryExport: string;
  summary: string;
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
    summary: 'Shows the current location within a navigable content hierarchy.'
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
