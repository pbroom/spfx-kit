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

export function isUiProfileCatalogComponentId(value: string | undefined): value is UiProfileCatalogComponentId {
  return uiProfileCatalogEntries.some((entry) => entry.id === value);
}

export function uiProfileCatalogSectionId(component: UiProfileCatalogComponentId): string {
  return `ui-library-component-${component}`;
}
