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

function publicExample(
  id: string,
  title: string,
  summary: string,
  imports: ReadonlyArray<readonly [subpath: UiProfileCatalogComponentId | '', names: string]>,
  jsx: string
): UiProfileCatalogExampleDocumentation {
  const importCode = imports
    .map(([subpath, names]) => `import { ${names} } from '@spfx-kit/ui-profile${subpath ? `/${subpath}` : ''}';`)
    .join('\n');
  return { id, title, summary, code: `${importCode}\n\n${jsx}` };
}

export const uiProfileCatalogDocumentation: Record<UiProfileCatalogComponentId, UiProfileCatalogDocumentation> = {
  accordion: {
    primaryExport: 'Accordion',
    summary: 'Organizes related content into disclosure sections that people can expand as needed.'
  },
  alert: {
    primaryExport: 'Alert',
    summary: 'Presents a concise inline status or message without interrupting the current task.',
    composition: [
      'Alert provides the assertive status region and the shared default or destructive treatment.',
      'AlertTitle names the message while AlertDescription supplies the supporting detail.',
      'A leading icon should be decorative when the title and description already announce the same meaning.',
      'AlertAction reserves the trailing action area for one short, directly related control.'
    ],
    examples: [
      publicExample(
        'basic',
        'Basic',
        'A title and description communicate a successful account update.',
        [['alert', 'Alert, AlertDescription, AlertTitle']],
        '<Alert><span aria-hidden data-icon="inline-start">✓</span><AlertTitle>Account updated successfully</AlertTitle><AlertDescription>Your profile information has been saved.</AlertDescription></Alert>'
      ),
      publicExample(
        'destructive',
        'Destructive',
        'The destructive variant is reserved for an error that needs immediate attention.',
        [['alert', 'Alert, AlertDescription, AlertTitle']],
        '<Alert variant="destructive"><span aria-hidden data-icon="inline-start">!</span><AlertTitle>Payment failed</AlertTitle><AlertDescription>Check the payment method and try again.</AlertDescription></Alert>'
      ),
      publicExample(
        'action',
        'Action',
        'A single compact action can sit beside the message without obscuring its status.',
        [
          ['alert', 'Alert, AlertAction, AlertDescription, AlertTitle'],
          ['button', 'Button']
        ],
        '<Alert><AlertTitle>Dark mode is available</AlertTitle><AlertDescription>Enable it when you are ready.</AlertDescription><AlertAction><Button variant="outline">Enable</Button></AlertAction></Alert>'
      ),
      publicExample(
        'rtl',
        'Right-to-left',
        'The message grid and reading order follow the nearest direction provider.',
        [
          ['alert', 'Alert, AlertDescription, AlertTitle'],
          ['direction', 'DirectionProvider']
        ],
        '<div dir="rtl"><DirectionProvider direction="rtl"><Alert><AlertTitle>تم الدفع بنجاح</AlertTitle><AlertDescription>تمت معالجة الدفعة وإرسال الإيصال.</AlertDescription></Alert></DirectionProvider></div>'
      )
    ],
    api: [
      {
        name: 'Alert',
        element: 'div',
        props: [
          {
            name: 'variant',
            type: '"default" | "destructive"',
            defaultValue: '"default"',
            description: 'Selects the semantic status treatment.'
          },
          { name: 'className', type: 'string', description: 'Adds classes to the alert region.' }
        ]
      },
      {
        name: 'AlertTitle',
        element: 'div',
        props: [{ name: 'className', type: 'string', description: 'Adds classes to the message title.' }]
      },
      {
        name: 'AlertDescription',
        element: 'div',
        props: [{ name: 'className', type: 'string', description: 'Adds classes to the supporting description.' }]
      },
      {
        name: 'AlertAction',
        element: 'div',
        props: [{ name: 'className', type: 'string', description: 'Adds classes to the trailing action area.' }]
      }
    ],
    compatibilityNotes: [
      'Custom color overrides are not reproduced here because they bypass the shared semantic theme tokens; add a profile variant when a reusable status color is required.'
    ]
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
    summary: 'Adds a compact status, category, or count beside related content.',
    composition: [
      'Choose a built-in semantic variant before adding presentation classes.',
      'A leading or trailing icon uses data-icon so the shared profile owns inline spacing.',
      'A spinner is decorative when the adjacent label already communicates the pending state.',
      'Use the render prop to compose a semantic anchor when the badge is a destination rather than a status.'
    ],
    examples: [
      publicExample(
        'variants',
        'Variants',
        'The built-in variants cover primary, supporting, destructive, bordered, and low-emphasis labels.',
        [['badge', 'Badge']],
        '<><Badge>Default</Badge><Badge variant="secondary">Secondary</Badge><Badge variant="destructive">Destructive</Badge><Badge variant="outline">Outline</Badge><Badge variant="ghost">Ghost</Badge></>'
      ),
      publicExample(
        'with-icon',
        'With icon',
        'An icon can reinforce the badge label without becoming its accessible name.',
        [['badge', 'Badge']],
        '<Badge><span aria-hidden data-icon="inline-start">✓</span>Verified</Badge>'
      ),
      publicExample(
        'with-spinner',
        'With spinner',
        'A decorative spinner pairs with text that names the pending operation.',
        [
          ['badge', 'Badge'],
          ['spinner', 'Spinner']
        ],
        '<Badge variant="secondary"><Spinner aria-hidden data-icon="inline-start" />Generating</Badge>'
      ),
      publicExample(
        'link',
        'Link',
        'The Base UI render prop substitutes an anchor without nesting interactive elements.',
        [['badge', 'Badge']],
        '<Badge render={<a href="#catalog-release" />}>Open release</Badge>'
      ),
      publicExample(
        'rtl',
        'Right-to-left',
        'Badge order and inline spacing follow the nearest reading direction.',
        [
          ['badge', 'Badge'],
          ['direction', 'DirectionProvider']
        ],
        '<div dir="rtl"><DirectionProvider direction="rtl"><Badge>متحقق</Badge><Badge variant="secondary">ثانوي</Badge><Badge variant="outline">مخطط</Badge></DirectionProvider></div>'
      )
    ],
    api: [
      {
        name: 'Badge',
        element: 'span',
        props: [
          {
            name: 'variant',
            type: '"default" | "secondary" | "destructive" | "outline" | "ghost" | "link"',
            defaultValue: '"default"',
            description: 'Selects the semantic visual treatment.'
          },
          {
            name: 'render',
            type: 'ReactElement | function',
            description: 'Replaces the default span while merging the badge props and state.'
          },
          { name: 'className', type: 'string', description: 'Adds classes to the rendered badge element.' }
        ]
      }
    ],
    compatibilityNotes: [
      'Custom color overrides are omitted because status colors belong to the shared semantic profile rather than an individual Lab example.'
    ]
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
      {
        name: 'Breadcrumb',
        element: 'nav',
        props: [{ name: 'className', type: 'string', description: 'Adds classes to the navigation landmark.' }]
      },
      {
        name: 'BreadcrumbList',
        element: 'ol',
        props: [{ name: 'className', type: 'string', description: 'Adds classes to the ordered list.' }]
      },
      {
        name: 'BreadcrumbItem',
        element: 'li',
        props: [{ name: 'className', type: 'string', description: 'Adds classes to an individual hierarchy item.' }]
      },
      {
        name: 'BreadcrumbLink',
        element: 'a',
        props: [
          {
            name: 'render',
            type: 'ReactElement | function',
            description: 'Composes a custom link element through Base UI without nested anchors.'
          },
          { name: 'className', type: 'string', description: 'Adds classes to the link.' }
        ]
      },
      {
        name: 'BreadcrumbPage',
        element: 'span',
        props: [{ name: 'className', type: 'string', description: 'Adds classes to the current-page label.' }]
      },
      {
        name: 'BreadcrumbSeparator',
        element: 'li',
        props: [
          { name: 'children', type: 'ReactNode', description: 'Replaces the default chevron separator.' },
          { name: 'className', type: 'string', description: 'Adds classes to the separator.' }
        ]
      },
      {
        name: 'BreadcrumbEllipsis',
        element: 'span',
        props: [{ name: 'className', type: 'string', description: 'Adds classes to the collapsed-level indicator.' }]
      }
    ]
  },
  bubble: {
    primaryExport: 'Bubble',
    summary: 'Frames short conversational content in a message-oriented surface.'
  },
  button: {
    primaryExport: 'Button',
    summary: 'Triggers an action using the shared profile’s accessible interaction states.',
    composition: [
      'Choose a built-in variant and size before adding layout classes.',
      'Icon-only buttons need an accessible name; inline icons use data-icon for profile-owned spacing.',
      'Loading actions compose Spinner with a disabled Button instead of an invented loading prop.',
      'Use buttonVariants on a plain anchor for navigation because Base UI Button intentionally retains button semantics.'
    ],
    examples: [
      publicExample(
        'sizes',
        'Sizes',
        'The built-in size scale covers labelled and icon-only actions.',
        [['button', 'Button']],
        '<><Button size="xs">Extra small</Button><Button size="sm">Small</Button><Button>Default</Button><Button size="lg">Large</Button></>'
      ),
      publicExample('default', 'Default', 'The primary action treatment.', [['button', 'Button']], '<Button>Button</Button>'),
      publicExample(
        'outline',
        'Outline',
        'A bordered action with lower visual priority.',
        [['button', 'Button']],
        '<Button variant="outline">Outline</Button>'
      ),
      publicExample(
        'secondary',
        'Secondary',
        'A filled secondary action.',
        [['button', 'Button']],
        '<Button variant="secondary">Secondary</Button>'
      ),
      publicExample(
        'ghost',
        'Ghost',
        'A low-emphasis action without a persistent surface.',
        [['button', 'Button']],
        '<Button variant="ghost">Ghost</Button>'
      ),
      publicExample(
        'destructive',
        'Destructive',
        'A destructive action using the semantic danger treatment.',
        [['button', 'Button']],
        '<Button variant="destructive">Delete</Button>'
      ),
      publicExample(
        'link',
        'Link variant',
        'A button action presented with link-like styling.',
        [['button', 'Button']],
        '<Button variant="link">Link-styled action</Button>'
      ),
      publicExample(
        'icon',
        'Icon button',
        'A compact icon-only action with an explicit accessible label.',
        [['button', 'Button']],
        '<Button aria-label="Create item" size="icon"><span aria-hidden>+</span></Button>'
      ),
      publicExample(
        'with-icon',
        'With icon',
        'A labelled action whose icon participates in profile-owned spacing.',
        [['button', 'Button']],
        '<Button><span aria-hidden data-icon="inline-start">+</span>Create branch</Button>'
      ),
      publicExample(
        'rounded',
        'Rounded',
        'A pill-shaped presentation using the official layout utility.',
        [['button', 'Button']],
        '<Button className="rounded-full">Get started</Button>'
      ),
      publicExample(
        'spinner',
        'Spinner',
        'A disabled action communicates that its operation is still running.',
        [
          ['button', 'Button'],
          ['spinner', 'Spinner']
        ],
        '<Button disabled><Spinner aria-hidden data-icon="inline-start" />Generating</Button>'
      ),
      publicExample(
        'button-group',
        'Button group',
        'Closely related actions can share a labelled group surface.',
        [
          ['button', 'Button'],
          ['button-group', 'ButtonGroup']
        ],
        '<ButtonGroup aria-label="Message actions"><Button variant="outline">Archive</Button><Button variant="outline">Report</Button><Button variant="outline">Snooze</Button></ButtonGroup>'
      ),
      publicExample(
        'as-link',
        'As link',
        'Navigation uses a semantic anchor with the exported variant helper.',
        [['button', 'buttonVariants']],
        '<a className={buttonVariants({ variant: "outline" })} href="/login">Login</a>'
      ),
      publicExample(
        'rtl',
        'Right-to-left',
        'Action order and inline spacing follow the nearest reading direction.',
        [
          ['direction', 'DirectionProvider'],
          ['button', 'Button']
        ],
        '<div dir="rtl"><DirectionProvider direction="rtl"><Button>إرسال</Button></DirectionProvider></div>'
      )
    ],
    api: [
      {
        name: 'Button',
        element: 'button',
        props: [
          {
            name: 'variant',
            type: '"default" | "outline" | "ghost" | "destructive" | "secondary" | "link"',
            defaultValue: '"default"',
            description: 'Selects the semantic visual treatment.'
          },
          {
            name: 'size',
            type: '"default" | "xs" | "sm" | "lg" | "icon" | "icon-xs" | "icon-sm" | "icon-lg"',
            defaultValue: '"default"',
            description: 'Selects the control size.'
          },
          { name: 'disabled', type: 'boolean', defaultValue: 'false', description: 'Prevents activation.' },
          {
            name: 'focusableWhenDisabled',
            type: 'boolean',
            defaultValue: 'false',
            description: 'Keeps a disabled Base UI button in the focus order when required.'
          },
          {
            name: 'nativeButton',
            type: 'boolean',
            defaultValue: 'true',
            description: 'Controls Base UI native-button behavior; keep true for actions.'
          },
          {
            name: 'render',
            type: 'ReactElement | function',
            description: 'Composes a custom rendered element while retaining button semantics.'
          },
          { name: 'className', type: 'string', description: 'Adds layout-oriented classes to the button.' }
        ]
      }
    ]
  },
  'button-group': {
    primaryExport: 'ButtonGroup',
    summary: 'Arranges closely related actions as one visually connected control set.',
    composition: [
      'ButtonGroup supplies role="group"; give every group an accessible name.',
      'Use ButtonGroup for actions and ToggleGroup for persistent selected state.',
      'Button, Input, InputGroup, Select, and owned overlay triggers can participate in a group.',
      'ButtonGroupSeparator divides filled actions; outlined buttons already provide their own boundary.'
    ],
    examples: [
      publicExample(
        'basic',
        'Basic',
        'Three related document actions share a labelled group.',
        [
          ['button', 'Button'],
          ['button-group', 'ButtonGroup']
        ],
        '<ButtonGroup aria-label="Document actions"><Button variant="outline">Archive</Button><Button variant="outline">Report</Button><Button variant="outline">Snooze</Button></ButtonGroup>'
      ),
      publicExample(
        'orientation',
        'Orientation',
        'Vertical orientation stacks a compact control pair.',
        [
          ['button', 'Button'],
          ['button-group', 'ButtonGroup']
        ],
        '<ButtonGroup aria-label="Zoom controls" orientation="vertical"><Button aria-label="Zoom in" size="icon">+</Button><Button aria-label="Zoom out" size="icon">−</Button></ButtonGroup>'
      ),
      publicExample(
        'sizes',
        'Sizes',
        'Each child Button controls its size while the group preserves connected edges.',
        [
          ['button', 'Button'],
          ['button-group', 'ButtonGroup']
        ],
        '<ButtonGroup aria-label="Large actions"><Button size="lg">Large</Button><Button size="lg">Group</Button></ButtonGroup>'
      ),
      publicExample(
        'nested',
        'Nested groups',
        'Nested groups divide a compound composer into independently meaningful regions.',
        [
          ['button', 'Button'],
          ['button-group', 'ButtonGroup'],
          ['input', 'Input']
        ],
        '<ButtonGroup aria-label="Message composer"><ButtonGroup aria-label="Attachments"><Button aria-label="Attach" size="icon">+</Button></ButtonGroup><ButtonGroup aria-label="Message"><Input aria-label="Message" /></ButtonGroup><ButtonGroup aria-label="Send"><Button>Send</Button></ButtonGroup></ButtonGroup>'
      ),
      publicExample(
        'separator',
        'Separator',
        'A separator reinforces the boundary between adjacent filled actions.',
        [
          ['button', 'Button'],
          ['button-group', 'ButtonGroup, ButtonGroupSeparator']
        ],
        '<ButtonGroup aria-label="Clipboard actions"><Button>Copy</Button><ButtonGroupSeparator /><Button>Paste</Button></ButtonGroup>'
      ),
      publicExample(
        'split',
        'Split action',
        'A primary action and its options trigger form one split control.',
        [
          ['button', 'Button'],
          ['button-group', 'ButtonGroup, ButtonGroupSeparator']
        ],
        '<ButtonGroup aria-label="Create actions"><Button>Create</Button><ButtonGroupSeparator /><Button aria-label="More create options" size="icon">⌄</Button></ButtonGroup>'
      ),
      publicExample(
        'input',
        'Input',
        'An input and action share a single search control boundary.',
        [
          ['button', 'Button'],
          ['button-group', 'ButtonGroup'],
          ['input', 'Input']
        ],
        '<ButtonGroup aria-label="Search"><Input aria-label="Search terms" placeholder="Search…" /><Button>Search</Button></ButtonGroup>'
      ),
      publicExample(
        'input-group',
        'Input group',
        'InputGroup can be nested beside a send action for richer input context.',
        [
          ['button', 'Button'],
          ['button-group', 'ButtonGroup'],
          ['input-group', 'InputGroup, InputGroupAddon, InputGroupInput, InputGroupText']
        ],
        '<ButtonGroup aria-label="Send a message"><InputGroup><InputGroupInput aria-label="Message" /><InputGroupAddon><InputGroupText>Draft</InputGroupText></InputGroupAddon></InputGroup><Button>Send</Button></ButtonGroup>'
      ),
      publicExample(
        'dropdown-menu',
        'Dropdown menu',
        'A split menu uses host-owned trigger and content IDs.',
        [
          ['', 'useSpfxUiId'],
          ['button', 'Button'],
          ['button-group', 'ButtonGroup'],
          ['dropdown-menu', 'DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger']
        ],
        `const triggerId = useSpfxUiId('docs:button-group:menu-trigger');
const contentId = useSpfxUiId('docs:button-group:menu-content');

<ButtonGroup aria-label="Follow actions"><Button>Follow</Button><DropdownMenu><DropdownMenuTrigger aria-controls={contentId} aria-label="More follow options" id={triggerId} render={<Button size="icon" />}>⌄</DropdownMenuTrigger><DropdownMenuContent id={contentId}><DropdownMenuGroup><DropdownMenuItem>Follow quietly</DropdownMenuItem></DropdownMenuGroup></DropdownMenuContent></DropdownMenu></ButtonGroup>`
      ),
      publicExample(
        'select',
        'Select',
        'A value input and owned Select form a compact amount control.',
        [
          ['', 'useSpfxUiId'],
          ['button-group', 'ButtonGroup, ButtonGroupText'],
          ['input', 'Input'],
          ['select', 'Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue']
        ],
        `const rootId = useSpfxUiId('docs:button-group:select');
const triggerId = useSpfxUiId('docs:button-group:select-trigger');
const contentId = useSpfxUiId('docs:button-group:select-content');

<ButtonGroup aria-label="Amount and currency"><ButtonGroupText>$</ButtonGroupText><Input aria-label="Amount" /><Select defaultValue="usd" id={rootId}><SelectTrigger aria-controls={contentId} aria-label="Currency" id={triggerId}><SelectValue /></SelectTrigger><SelectContent id={contentId}><SelectGroup><SelectItem value="usd">USD</SelectItem></SelectGroup></SelectContent></Select></ButtonGroup>`
      ),
      publicExample(
        'popover',
        'Popover',
        'An owned Popover supplies supporting options for a grouped action.',
        [
          ['', 'useSpfxUiId'],
          ['button', 'Button'],
          ['button-group', 'ButtonGroup'],
          ['popover', 'Popover, PopoverContent, PopoverDescription, PopoverTitle, PopoverTrigger']
        ],
        `const triggerId = useSpfxUiId('docs:button-group:popover-trigger');
const contentId = useSpfxUiId('docs:button-group:popover-content');

<ButtonGroup aria-label="Assistant actions"><Button>Copilot</Button><Popover><PopoverTrigger aria-controls={contentId} aria-label="Open assistant options" id={triggerId} render={<Button size="icon" />}>⌄</PopoverTrigger><PopoverContent id={contentId}><PopoverTitle>Assistant options</PopoverTitle><PopoverDescription>Choose a response mode.</PopoverDescription></PopoverContent></Popover></ButtonGroup>`
      ),
      publicExample(
        'rtl',
        'Right-to-left',
        'The connected control follows the nearest RTL direction.',
        [
          ['direction', 'DirectionProvider'],
          ['button', 'Button'],
          ['button-group', 'ButtonGroup']
        ],
        '<div dir="rtl"><DirectionProvider direction="rtl"><ButtonGroup aria-label="إجراءات"><Button variant="outline">أرشفة</Button><Button variant="outline">تقرير</Button><Button variant="outline">تأجيل</Button></ButtonGroup></DirectionProvider></div>'
      )
    ],
    api: [
      {
        name: 'ButtonGroup',
        element: 'div',
        props: [
          {
            name: 'orientation',
            type: '"horizontal" | "vertical"',
            defaultValue: '"horizontal"',
            description: 'Controls the connected layout direction.'
          },
          { name: 'aria-label', type: 'string', description: 'Names the action group when no visible label exists.' },
          { name: 'className', type: 'string', description: 'Adds layout-oriented classes.' }
        ]
      },
      {
        name: 'ButtonGroupSeparator',
        element: 'div',
        props: [
          {
            name: 'orientation',
            type: '"horizontal" | "vertical"',
            defaultValue: '"vertical"',
            description: 'Controls the separator line direction.'
          }
        ]
      },
      {
        name: 'ButtonGroupText',
        element: 'div',
        props: [
          {
            name: 'render',
            type: 'ReactElement | function',
            description: 'Uses the Base UI render contract to compose a label or other text element.'
          },
          { name: 'className', type: 'string', description: 'Adds layout-oriented classes.' }
        ]
      }
    ],
    compatibilityNotes: [
      'The public Base UI package exposes render for ButtonGroupText composition; examples do not use the alternate asChild API.'
    ]
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
    summary: 'Communicates completion for a measurable task or operation.',
    composition: [
      'Progress owns the accessible root and appends its shared ProgressTrack and ProgressIndicator after any label content.',
      'ProgressLabel and ProgressValue provide a visible name and formatted value inside the same root.',
      'Pass value for a determinate operation or null while its completion cannot yet be measured.',
      'A controlled value can be driven by task state or by another accessible input such as Slider.'
    ],
    examples: [
      publicExample(
        'basic',
        'Basic',
        'A named progressbar communicates a determinate task value.',
        [['progress', 'Progress']],
        '<Progress aria-label="Task progress" value={33} />'
      ),
      publicExample(
        'label',
        'Label and value',
        'Visible label and formatted value content travel with the progressbar.',
        [['progress', 'Progress, ProgressLabel, ProgressValue']],
        '<Progress value={56}><ProgressLabel>Upload progress</ProgressLabel><ProgressValue /></Progress>'
      ),
      publicExample(
        'controlled',
        'Controlled',
        'Application state keeps the progressbar and an accessible Slider synchronized.',
        [
          ['progress', 'Progress, ProgressLabel, ProgressValue'],
          ['slider', 'Slider']
        ],
        `import * as React from 'react';

function ExportProgress() {
  const [value, setValue] = React.useState(42);
  return <><Progress value={value}><ProgressLabel>Export progress</ProgressLabel><ProgressValue /></Progress><Slider aria-label="Set export progress" max={100} onValueChange={(next) => setValue(typeof next === 'number' ? next : (next[0] ?? 0))} value={[value]} /></>;
}`
      ),
      publicExample(
        'rtl',
        'Right-to-left',
        'The visible label, value, and fill direction follow the nearest direction provider.',
        [
          ['progress', 'Progress, ProgressLabel, ProgressValue'],
          ['direction', 'DirectionProvider']
        ],
        '<div dir="rtl"><DirectionProvider direction="rtl"><Progress value={56}><ProgressLabel>تقدم الرفع</ProgressLabel><ProgressValue /></Progress></DirectionProvider></div>'
      )
    ],
    api: [
      {
        name: 'Progress',
        element: 'div',
        props: [
          {
            name: 'value',
            type: 'number | null',
            description: 'Sets the current determinate value, or null for an indeterminate operation.'
          },
          { name: 'min', type: 'number', defaultValue: '0', description: 'Sets the lower bound.' },
          { name: 'max', type: 'number', defaultValue: '100', description: 'Sets the upper bound.' },
          {
            name: 'aria-valuetext',
            type: 'string',
            description: 'Supplies an accessible text alternative for the numeric value.'
          },
          {
            name: 'getAriaValueText',
            type: '(formattedValue: string, value: number) => string',
            description: 'Builds accessible value text from the formatted and numeric values.'
          },
          {
            name: 'locale',
            type: 'string | string[]',
            description: 'Chooses the locale used to format ProgressValue.'
          },
          {
            name: 'format',
            type: 'Intl.NumberFormatOptions',
            description: 'Customizes the visible and accessible number format.'
          },
          {
            name: 'render',
            type: 'ReactElement | function',
            description: 'Replaces the default root element while merging progress props and state.'
          },
          { name: 'className', type: 'string', description: 'Adds classes to the progress root.' }
        ]
      },
      {
        name: 'ProgressTrack',
        element: 'div',
        props: [
          {
            name: 'render',
            type: 'ReactElement | function',
            description: 'Replaces the default track element while preserving its progress state.'
          },
          { name: 'className', type: 'string', description: 'Adds classes to the track.' }
        ]
      },
      {
        name: 'ProgressIndicator',
        element: 'div',
        props: [
          {
            name: 'render',
            type: 'ReactElement | function',
            description: 'Replaces the default indicator element while preserving its progress state.'
          },
          { name: 'className', type: 'string', description: 'Adds classes to the fill indicator.' }
        ]
      },
      {
        name: 'ProgressValue',
        element: 'span',
        props: [
          {
            name: 'children',
            type: 'ReactNode | (formattedValue: string, value: number) => ReactNode',
            description: 'Overrides or formats the visible value content.'
          },
          {
            name: 'render',
            type: 'ReactElement | function',
            description: 'Replaces the default value element while preserving progress state.'
          },
          { name: 'className', type: 'string', description: 'Adds classes to the visible value.' }
        ]
      },
      {
        name: 'ProgressLabel',
        element: 'span',
        props: [
          {
            name: 'render',
            type: 'ReactElement | function',
            description: 'Replaces the default label element while preserving progress state.'
          },
          { name: 'className', type: 'string', description: 'Adds classes to the visible label.' }
        ]
      }
    ]
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
    summary: 'Signals that a short operation is currently in progress.',
    composition: [
      'Use a labelled Spinner when it is the only loading announcement.',
      'Set aria-hidden when nearby text or a parent status already communicates the same loading state.',
      'Inside Button or Badge, data-icon gives the spinner the shared inline spacing.',
      'Size customization uses profile-compiled size utilities; replacing the shared icon belongs in the package source, not a consumer page.'
    ],
    examples: [
      publicExample(
        'basic',
        'Basic',
        'A standalone spinner carries its own accessible loading label.',
        [['spinner', 'Spinner']],
        '<Spinner aria-label="Loading" />'
      ),
      publicExample(
        'sizes',
        'Sizes',
        'Profile-compiled size utilities scale the SVG without changing its semantics.',
        [['spinner', 'Spinner']],
        '<><Spinner aria-label="Loading" className="size-6" /><Spinner aria-label="Loading" className="size-8" /></>'
      ),
      publicExample(
        'button',
        'Button',
        'A disabled Button owns the visible loading label while the spinner remains decorative.',
        [
          ['button', 'Button'],
          ['spinner', 'Spinner']
        ],
        '<Button disabled><Spinner aria-hidden data-icon="inline-start" />Loading</Button>'
      ),
      publicExample(
        'badge',
        'Badge',
        'A compact status badge can pair text with a decorative spinner.',
        [
          ['badge', 'Badge'],
          ['spinner', 'Spinner']
        ],
        '<Badge><Spinner aria-hidden data-icon="inline-start" />Syncing</Badge>'
      ),
      publicExample(
        'input-group',
        'Input group',
        'Validation progress appears beside an input without replacing its accessible name.',
        [
          ['input-group', 'InputGroup, InputGroupAddon, InputGroupInput, InputGroupText'],
          ['spinner', 'Spinner']
        ],
        '<InputGroup><InputGroupInput aria-label="Message" /><InputGroupAddon><Spinner aria-hidden /><InputGroupText>Validating…</InputGroupText></InputGroupAddon></InputGroup>'
      ),
      publicExample(
        'empty',
        'Empty state',
        'An empty-state composition explains a longer operation and offers cancellation.',
        [
          ['button', 'Button'],
          ['empty', 'Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle'],
          ['spinner', 'Spinner']
        ],
        '<Empty><EmptyHeader><Spinner aria-hidden /><EmptyTitle>Processing your request</EmptyTitle><EmptyDescription>Please wait while the request completes.</EmptyDescription></EmptyHeader><EmptyContent><Button variant="outline">Cancel</Button></EmptyContent></Empty>'
      ),
      publicExample(
        'rtl',
        'Right-to-left',
        'The status text follows the nearest reading direction.',
        [
          ['direction', 'DirectionProvider'],
          ['spinner', 'Spinner']
        ],
        '<div dir="rtl"><DirectionProvider direction="rtl"><span><Spinner aria-hidden /> جاري معالجة الدفع…</span></DirectionProvider></div>'
      )
    ],
    api: [
      {
        name: 'Spinner',
        element: 'svg',
        props: [
          { name: 'aria-label', type: 'string', description: 'Names a standalone loading status.' },
          {
            name: 'aria-hidden',
            type: 'boolean',
            defaultValue: 'false',
            description: 'Hides a decorative spinner when adjacent text already announces the state.'
          },
          {
            name: 'data-icon',
            type: '"inline-start" | "inline-end"',
            description: 'Uses component-owned spacing inside controls and badges.'
          },
          { name: 'className', type: 'string', description: 'Adds layout or profile-compiled sizing utilities.' }
        ]
      }
    ],
    compatibilityNotes: [
      'The package owns the shared spinner glyph; consumer pages can size or compose it but do not replace its implementation.'
    ]
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
