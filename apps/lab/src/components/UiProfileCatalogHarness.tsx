import * as React from 'react';
import * as ReactDom from 'react-dom';

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@spfx-kit/ui-profile/accordion';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@spfx-kit/ui-profile/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@spfx-kit/ui-profile/alert-dialog';
import { AspectRatio } from '@spfx-kit/ui-profile/aspect-ratio';
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentTitle
} from '@spfx-kit/ui-profile/attachment';
import { Avatar, AvatarFallback } from '@spfx-kit/ui-profile/avatar';
import { Badge } from '@spfx-kit/ui-profile/badge';
import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@spfx-kit/ui-profile/breadcrumb';
import { Bubble, BubbleContent, BubbleGroup } from '@spfx-kit/ui-profile/bubble';
import { Button, buttonVariants } from '@spfx-kit/ui-profile/button';
import { ButtonGroup, ButtonGroupSeparator, ButtonGroupText } from '@spfx-kit/ui-profile/button-group';
import { Calendar } from '@spfx-kit/ui-profile/calendar';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@spfx-kit/ui-profile/card';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from '@spfx-kit/ui-profile/carousel';
import { ChartContainer } from '@spfx-kit/ui-profile/chart';
import { Checkbox } from '@spfx-kit/ui-profile/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@spfx-kit/ui-profile/collapsible';
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxList
} from '@spfx-kit/ui-profile/combobox';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuTrigger
} from '@spfx-kit/ui-profile/context-menu';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@spfx-kit/ui-profile/dialog';
import { DirectionProvider } from '@spfx-kit/ui-profile/direction';
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle, DrawerTrigger } from '@spfx-kit/ui-profile/drawer';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@spfx-kit/ui-profile/dropdown-menu';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from '@spfx-kit/ui-profile/empty';
import { Field, FieldDescription, FieldLabel } from '@spfx-kit/ui-profile/field';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@spfx-kit/ui-profile/hover-card';
import { Input } from '@spfx-kit/ui-profile/input';
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '@spfx-kit/ui-profile/input-group';
import { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot } from '@spfx-kit/ui-profile/input-otp';
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from '@spfx-kit/ui-profile/item';
import { Kbd, KbdGroup } from '@spfx-kit/ui-profile/kbd';
import { Label } from '@spfx-kit/ui-profile/label';
import { Marker, MarkerContent, MarkerIcon } from '@spfx-kit/ui-profile/marker';
import { Menubar, MenubarContent, MenubarGroup, MenubarItem, MenubarMenu, MenubarTrigger } from '@spfx-kit/ui-profile/menubar';
import { Message, MessageContent, MessageFooter, MessageGroup, MessageHeader } from '@spfx-kit/ui-profile/message';
import { NativeSelect, NativeSelectOption } from '@spfx-kit/ui-profile/native-select';
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger
} from '@spfx-kit/ui-profile/navigation-menu';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious
} from '@spfx-kit/ui-profile/pagination';
import { Popover, PopoverContent, PopoverDescription, PopoverTitle, PopoverTrigger } from '@spfx-kit/ui-profile/popover';
import { Progress, ProgressLabel, ProgressValue } from '@spfx-kit/ui-profile/progress';
import { RadioGroup, RadioGroupItem } from '@spfx-kit/ui-profile/radio-group';
import { ScrollArea } from '@spfx-kit/ui-profile/scroll-area';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@spfx-kit/ui-profile/select';
import { Separator } from '@spfx-kit/ui-profile/separator';
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from '@spfx-kit/ui-profile/sheet';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger
} from '@spfx-kit/ui-profile/sidebar';
import { Skeleton } from '@spfx-kit/ui-profile/skeleton';
import { Slider } from '@spfx-kit/ui-profile/slider';
import { Spinner } from '@spfx-kit/ui-profile/spinner';
import { Switch } from '@spfx-kit/ui-profile/switch';
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@spfx-kit/ui-profile/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@spfx-kit/ui-profile/tabs';
import { Textarea } from '@spfx-kit/ui-profile/textarea';
import {
  Toast,
  ToastClose,
  ToastContent,
  ToastDescription,
  ToastPortal,
  ToastProvider,
  ToastTitle,
  ToastViewport,
  createToastManager,
  useToastManager
} from '@spfx-kit/ui-profile/toast';
import { Toggle } from '@spfx-kit/ui-profile/toggle';
import { ToggleGroup, ToggleGroupItem } from '@spfx-kit/ui-profile/toggle-group';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@spfx-kit/ui-profile/tooltip';
import {
  uiProfileCatalogDocumentation,
  uiProfileCatalogExampleSectionId,
  uiProfileCatalogSectionId,
  type UiProfileCatalogComponentId
} from './uiProfileCatalogEntries';
import { UiLibraryCodeBlock } from './UiLibraryCodeBlock';
import { createSpfxUiHost, SpfxUiHostProvider, useSpfxUiDerivedId, useSpfxUiId } from '@spfx-kit/ui-profile';
import { createLabTheme } from '@spfx-kit/spfx-lab-runtime';
import { createLabUiThemeTokens } from '../ui-profile/lab-theme';

interface CatalogSampleProps {
  children: React.ReactNode;
  component: UiProfileCatalogComponentId;
  title: string;
}

const ActiveCatalogComponentContext = React.createContext<UiProfileCatalogComponentId | undefined>(undefined);
const ActiveCatalogExampleContext = React.createContext<string | undefined>(undefined);

function CatalogSample({ children, component, title }: CatalogSampleProps): React.ReactElement | null {
  const activeComponent = React.useContext(ActiveCatalogComponentContext);
  const active = activeComponent === component;
  if (activeComponent !== undefined && !active) return null;

  return (
    <section
      data-catalog-active={active ? 'true' : undefined}
      data-catalog-component={component}
      id={uiProfileCatalogSectionId(component)}
    >
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function CatalogToastList(): React.ReactElement {
  const { toasts } = useToastManager();
  return (
    <>
      {toasts.map((toastItem) => (
        <Toast key={toastItem.id} toast={toastItem}>
          <ToastContent>
            <div>
              <ToastTitle />
              <ToastDescription />
            </div>
            <ToastClose />
          </ToastContent>
        </Toast>
      ))}
    </>
  );
}

interface CatalogDocumentationExampleProps {
  children: React.ReactNode;
  id: string;
  title: string;
}

function CatalogDocumentationExample({ children, id, title }: CatalogDocumentationExampleProps): React.ReactElement {
  const activeComponent = React.useContext(ActiveCatalogComponentContext);
  const activeExample = React.useContext(ActiveCatalogExampleContext);
  const sectionRef = React.useRef<HTMLElement>(null);
  const tabsId = useSpfxUiId(`catalog:${activeComponent ?? 'gallery'}:example:${id}:tabs`);
  const documentation = activeComponent ? uiProfileCatalogDocumentation[activeComponent] : undefined;
  const example = documentation?.examples?.find((candidate) => candidate.id === id);
  const selected = activeExample === id;

  React.useEffect(() => {
    const section = sectionRef.current;
    if (!selected || !section) return;

    section.focus({ preventScroll: true });
    section.scrollIntoView({ block: 'start' });

    return () => {
      if (section.ownerDocument.activeElement === section) section.blur();
    };
  }, [selected]);

  if (!activeComponent || !example) {
    return (
      <div data-catalog-example={id}>
        <h4>{title}</h4>
        <div data-catalog-example-content>{children}</div>
      </div>
    );
  }

  return (
    <section
      data-catalog-example={id}
      data-catalog-example-active={selected ? 'true' : undefined}
      id={uiProfileCatalogExampleSectionId(activeComponent, id)}
      ref={sectionRef}
      tabIndex={selected ? -1 : undefined}
    >
      <div className="ui-library-docs__example-heading">
        <h4>{title}</h4>
        <p>{example.summary}</p>
      </div>
      <Tabs className="ui-library-docs__example-tabs" defaultValue="preview" id={tabsId}>
        <TabsList aria-label={`${title} example view`} variant="line">
          <TabsTrigger value="preview">Preview</TabsTrigger>
          <TabsTrigger value="code">Code</TabsTrigger>
        </TabsList>
        <TabsContent value="preview">
          <div data-catalog-example-content>{children}</div>
        </TabsContent>
        <TabsContent value="code">
          <UiLibraryCodeBlock
            code={example.code}
            label={`${title} code for ${uiProfileCatalogDocumentation[activeComponent].primaryExport}`}
          />
        </TabsContent>
      </Tabs>
    </section>
  );
}

function CatalogInlineIcon({ position = 'inline-start' }: { position?: 'inline-start' | 'inline-end' }): React.ReactElement {
  return (
    <svg aria-hidden="true" data-icon={position} viewBox="0 0 16 16">
      <path d="M8 3v10M3 8h10" fill="none" stroke="currentColor" strokeLinecap="round" />
    </svg>
  );
}

interface BreadcrumbDocumentationExamplesProps {
  dropdownContentId: string;
  dropdownTriggerId: string;
  responsiveContentId: string;
  responsiveTriggerId: string;
}

function BreadcrumbBasic(): React.ReactElement {
  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink href="#catalog-home">Home</BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbPage>Components</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}

function BreadcrumbDocumentationExamples({
  dropdownContentId,
  dropdownTriggerId,
  responsiveContentId,
  responsiveTriggerId
}: BreadcrumbDocumentationExamplesProps): React.ReactElement {
  return (
    <div data-catalog-documentation-examples="breadcrumb">
      <CatalogDocumentationExample id="basic" title="Basic">
        <BreadcrumbBasic />
      </CatalogDocumentationExample>

      <CatalogDocumentationExample id="custom-separator" title="Custom separator">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="#catalog-home">Home</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator>/</BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbPage>Components</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </CatalogDocumentationExample>

      <CatalogDocumentationExample id="dropdown" title="Dropdown">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="#catalog-home">Home</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <DropdownMenu>
                <DropdownMenuTrigger
                  aria-controls={dropdownContentId}
                  aria-label="Open intermediate pages"
                  id={dropdownTriggerId}
                >
                  <BreadcrumbEllipsis />
                </DropdownMenuTrigger>
                <DropdownMenuContent id={dropdownContentId}>
                  <DropdownMenuItem>Documentation</DropdownMenuItem>
                  <DropdownMenuItem>Components</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Breadcrumb</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </CatalogDocumentationExample>

      <CatalogDocumentationExample id="collapsed" title="Collapsed">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="#catalog-home">Home</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbEllipsis />
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Breadcrumb</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </CatalogDocumentationExample>

      <CatalogDocumentationExample id="custom-link" title="Custom link">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink data-route="components" render={<a href="#catalog-components" />}>
                Components
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Breadcrumb</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </CatalogDocumentationExample>

      <CatalogDocumentationExample id="responsive" title="Responsive hierarchy">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="#catalog-home">Home</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <DropdownMenu>
                <DropdownMenuTrigger
                  aria-controls={responsiveContentId}
                  aria-label="Open hidden breadcrumb levels"
                  id={responsiveTriggerId}
                >
                  <BreadcrumbEllipsis />
                </DropdownMenuTrigger>
                <DropdownMenuContent id={responsiveContentId}>
                  <DropdownMenuItem>Docs</DropdownMenuItem>
                  <DropdownMenuItem>Shared UI</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Breadcrumb</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </CatalogDocumentationExample>

      <CatalogDocumentationExample id="rtl" title="Right-to-left">
        <div dir="rtl">
          <DirectionProvider direction="rtl">
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink href="#catalog-home">الرئيسية</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>المكونات</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </DirectionProvider>
        </div>
      </CatalogDocumentationExample>
    </div>
  );
}

interface AccordionDocumentationExamplesProps {
  baseId: string;
}

interface CatalogAccordionItemData {
  content: string;
  disabled?: boolean;
  id: string;
  title: string;
  value: string;
}

function CatalogAccordionItems({ items }: { items: readonly CatalogAccordionItemData[] }): React.ReactElement {
  return (
    <>
      {items.map((item) => (
        <AccordionItem disabled={item.disabled} id={item.id} key={item.value} value={item.value}>
          <AccordionTrigger>{item.title}</AccordionTrigger>
          <AccordionContent>{item.content}</AccordionContent>
        </AccordionItem>
      ))}
    </>
  );
}

function AccordionDocumentationExamples({ baseId }: AccordionDocumentationExamplesProps): React.ReactElement {
  const primaryItems = [
    {
      content: 'Standard delivery takes three to five business days, with expedited service available at checkout.',
      id: useSpfxUiDerivedId(baseId, 'primary-shipping'),
      title: 'What delivery options are available?',
      value: 'shipping'
    },
    {
      content: 'Unused items can be returned within thirty days from the original delivery date.',
      id: useSpfxUiDerivedId(baseId, 'primary-returns'),
      title: 'What is the return window?',
      value: 'returns'
    },
    {
      content: 'Support is available through the account portal during normal business hours.',
      id: useSpfxUiDerivedId(baseId, 'primary-support'),
      title: 'How do I contact support?',
      value: 'support'
    }
  ] as const;
  const basicItems = [
    {
      content: 'Use the reset link on the sign-in screen. The emailed link remains active for one hour.',
      id: useSpfxUiDerivedId(baseId, 'basic-password'),
      title: 'How do I reset my password?',
      value: 'password'
    },
    {
      content: 'Plan changes take effect at the start of the next billing period.',
      id: useSpfxUiDerivedId(baseId, 'basic-plan'),
      title: 'Can I change my plan?',
      value: 'plan'
    },
    {
      content: 'The account accepts major cards and approved purchase orders.',
      id: useSpfxUiDerivedId(baseId, 'basic-payment'),
      title: 'Which payment methods are supported?',
      value: 'payment'
    }
  ] as const;
  const multipleItems = [
    {
      content: 'Choose immediate alerts, daily summaries, or both from notification settings.',
      id: useSpfxUiDerivedId(baseId, 'multiple-notifications'),
      title: 'Notification settings',
      value: 'notifications'
    },
    {
      content: 'Review active sessions and revoke devices from the security page.',
      id: useSpfxUiDerivedId(baseId, 'multiple-privacy'),
      title: 'Privacy and security',
      value: 'privacy'
    },
    {
      content: 'Invoices and renewal dates remain available in the billing workspace.',
      id: useSpfxUiDerivedId(baseId, 'multiple-billing'),
      title: 'Billing and subscription',
      value: 'billing'
    }
  ] as const;
  const disabledItems = [
    {
      content: 'Account history is retained for the period shown in the organization policy.',
      id: useSpfxUiDerivedId(baseId, 'disabled-history'),
      title: 'Can I review account history?',
      value: 'history'
    },
    {
      content: 'This feature becomes available after the workspace upgrade is complete.',
      disabled: true,
      id: useSpfxUiDerivedId(baseId, 'disabled-premium'),
      title: 'Premium feature details',
      value: 'premium'
    },
    {
      content: 'Update the address from profile settings, then confirm the verification message.',
      id: useSpfxUiDerivedId(baseId, 'disabled-email'),
      title: 'How do I update my email?',
      value: 'email'
    }
  ] as const;
  const borderedItems = [
    {
      content: 'Billing runs at the start of each cycle and invoices remain available in the account.',
      id: useSpfxUiDerivedId(baseId, 'borders-billing'),
      title: 'How does billing work?',
      value: 'billing'
    },
    {
      content: 'Workspace data is encrypted in transit and at rest.',
      id: useSpfxUiDerivedId(baseId, 'borders-security'),
      title: 'How is data protected?',
      value: 'security'
    },
    {
      content: 'Available connectors are listed in the organization integration catalog.',
      id: useSpfxUiDerivedId(baseId, 'borders-integrations'),
      title: 'Which integrations are available?',
      value: 'integrations'
    }
  ] as const;
  const cardItems = [
    {
      content: 'Choose the tier that matches the workspace size and governance needs.',
      id: useSpfxUiDerivedId(baseId, 'card-plans'),
      title: 'Which plans are offered?',
      value: 'plans'
    },
    {
      content: 'Renewals follow the billing cadence selected by the organization owner.',
      id: useSpfxUiDerivedId(baseId, 'card-billing'),
      title: 'When does billing renew?',
      value: 'billing'
    },
    {
      content: 'An owner can cancel renewal while retaining access through the paid period.',
      id: useSpfxUiDerivedId(baseId, 'card-cancel'),
      title: 'How do I cancel renewal?',
      value: 'cancel'
    }
  ] as const;
  const rtlItems = [
    {
      content: 'استخدم رابط إعادة التعيين في صفحة تسجيل الدخول ثم راجع رسالة التحقق.',
      id: useSpfxUiDerivedId(baseId, 'rtl-password'),
      title: 'كيف يمكنني إعادة تعيين كلمة المرور؟',
      value: 'password'
    },
    {
      content: 'تدخل تغييرات الخطة حيز التنفيذ في دورة الفوترة التالية.',
      id: useSpfxUiDerivedId(baseId, 'rtl-plan'),
      title: 'هل يمكنني تغيير خطة الاشتراك؟',
      value: 'plan'
    },
    {
      content: 'تظهر وسائل الدفع المتاحة عند إتمام الطلب.',
      id: useSpfxUiDerivedId(baseId, 'rtl-payment'),
      title: 'ما هي طرق الدفع المتاحة؟',
      value: 'payment'
    }
  ] as const;

  return (
    <div data-catalog-documentation-examples="accordion">
      <CatalogDocumentationExample id="primary" title="Primary demo">
        <Accordion defaultValue={['shipping']}>
          <CatalogAccordionItems items={primaryItems} />
        </Accordion>
      </CatalogDocumentationExample>
      <CatalogDocumentationExample id="basic" title="Basic">
        <Accordion defaultValue={['password']}>
          <CatalogAccordionItems items={basicItems} />
        </Accordion>
      </CatalogDocumentationExample>
      <CatalogDocumentationExample id="multiple" title="Multiple">
        <Accordion defaultValue={['notifications', 'privacy']} multiple>
          <CatalogAccordionItems items={multipleItems} />
        </Accordion>
      </CatalogDocumentationExample>
      <CatalogDocumentationExample id="disabled" title="Disabled item">
        <Accordion defaultValue={['history']}>
          <CatalogAccordionItems items={disabledItems} />
        </Accordion>
      </CatalogDocumentationExample>
      <CatalogDocumentationExample id="borders" title="Borders">
        <Accordion
          defaultValue={['billing']}
          style={{ border: '1px solid var(--spfx-ui-color-border)', borderRadius: 'var(--spfx-ui-radius-lg)' }}
        >
          <CatalogAccordionItems items={borderedItems} />
        </Accordion>
      </CatalogDocumentationExample>
      <CatalogDocumentationExample id="card" title="Card">
        <Card>
          <CardHeader>
            <CardTitle>Plans and billing</CardTitle>
            <CardDescription>Common questions about plans, renewal, and cancellation.</CardDescription>
          </CardHeader>
          <CardContent>
            <Accordion defaultValue={['plans']}>
              <CatalogAccordionItems items={cardItems} />
            </Accordion>
          </CardContent>
        </Card>
      </CatalogDocumentationExample>
      <CatalogDocumentationExample id="rtl" title="Right-to-left">
        <div dir="rtl">
          <DirectionProvider direction="rtl">
            <Accordion defaultValue={['password']}>
              <CatalogAccordionItems items={rtlItems} />
            </Accordion>
          </DirectionProvider>
        </div>
      </CatalogDocumentationExample>
    </div>
  );
}

function ButtonDocumentationExamples(): React.ReactElement {
  return (
    <div data-catalog-documentation-examples="button">
      <CatalogDocumentationExample id="sizes" title="Sizes">
        <ButtonGroup aria-label="Button sizes">
          <Button size="xs">Extra small</Button>
          <Button size="sm">Small</Button>
          <Button>Default</Button>
          <Button size="lg">Large</Button>
        </ButtonGroup>
      </CatalogDocumentationExample>
      <CatalogDocumentationExample id="default" title="Default">
        <Button>Button</Button>
      </CatalogDocumentationExample>
      <CatalogDocumentationExample id="outline" title="Outline">
        <Button variant="outline">Outline</Button>
      </CatalogDocumentationExample>
      <CatalogDocumentationExample id="secondary" title="Secondary">
        <Button variant="secondary">Secondary</Button>
      </CatalogDocumentationExample>
      <CatalogDocumentationExample id="ghost" title="Ghost">
        <Button variant="ghost">Ghost</Button>
      </CatalogDocumentationExample>
      <CatalogDocumentationExample id="destructive" title="Destructive">
        <Button variant="destructive">Delete</Button>
      </CatalogDocumentationExample>
      <CatalogDocumentationExample id="link" title="Link variant">
        <Button variant="link">Link-styled action</Button>
      </CatalogDocumentationExample>
      <CatalogDocumentationExample id="icon" title="Icon button">
        <Button aria-label="Create item" size="icon">
          <CatalogInlineIcon />
        </Button>
      </CatalogDocumentationExample>
      <CatalogDocumentationExample id="with-icon" title="With icon">
        <Button>
          <CatalogInlineIcon />
          Create branch
        </Button>
      </CatalogDocumentationExample>
      <CatalogDocumentationExample id="rounded" title="Rounded">
        <Button className="rounded-full">Get started</Button>
      </CatalogDocumentationExample>
      <CatalogDocumentationExample id="spinner" title="Spinner">
        <Button disabled>
          <Spinner aria-hidden="true" data-icon="inline-start" />
          Generating
        </Button>
      </CatalogDocumentationExample>
      <CatalogDocumentationExample id="button-group" title="Button group">
        <ButtonGroup aria-label="Message actions">
          <Button variant="outline">Archive</Button>
          <Button variant="outline">Report</Button>
          <Button variant="outline">Snooze</Button>
        </ButtonGroup>
      </CatalogDocumentationExample>
      <CatalogDocumentationExample id="as-link" title="As link">
        <a className={buttonVariants({ variant: 'outline' })} href="#catalog-login">
          Login
        </a>
      </CatalogDocumentationExample>
      <CatalogDocumentationExample id="rtl" title="Right-to-left">
        <div dir="rtl">
          <DirectionProvider direction="rtl">
            <ButtonGroup aria-label="إجراءات">
              <Button>إرسال</Button>
              <Button variant="destructive">حذف</Button>
            </ButtonGroup>
          </DirectionProvider>
        </div>
      </CatalogDocumentationExample>
    </div>
  );
}

interface ButtonGroupDocumentationExamplesProps {
  dropdownContentId: string;
  dropdownTriggerId: string;
  inputId: string;
  popoverContentId: string;
  popoverTriggerId: string;
  selectContentId: string;
  selectId: string;
  selectTriggerId: string;
}

function ButtonGroupDocumentationExamples({
  dropdownContentId,
  dropdownTriggerId,
  inputId,
  popoverContentId,
  popoverTriggerId,
  selectContentId,
  selectId,
  selectTriggerId
}: ButtonGroupDocumentationExamplesProps): React.ReactElement {
  return (
    <div data-catalog-documentation-examples="button-group">
      <CatalogDocumentationExample id="basic" title="Basic">
        <ButtonGroup aria-label="Document actions">
          <Button variant="outline">Archive</Button>
          <Button variant="outline">Report</Button>
          <Button variant="outline">Snooze</Button>
        </ButtonGroup>
      </CatalogDocumentationExample>
      <CatalogDocumentationExample id="orientation" title="Orientation">
        <ButtonGroup aria-label="Zoom controls" orientation="vertical">
          <Button aria-label="Zoom in" size="icon" variant="outline">
            <CatalogInlineIcon />
          </Button>
          <Button aria-label="Zoom out" size="icon" variant="outline">
            −
          </Button>
        </ButtonGroup>
      </CatalogDocumentationExample>
      <CatalogDocumentationExample id="sizes" title="Sizes">
        <ButtonGroup aria-label="Small actions">
          <Button size="sm">Small</Button>
          <Button size="sm">Group</Button>
        </ButtonGroup>
        <ButtonGroup aria-label="Default actions">
          <Button>Default</Button>
          <Button>Group</Button>
        </ButtonGroup>
        <ButtonGroup aria-label="Large actions">
          <Button size="lg">Large</Button>
          <Button size="lg">Group</Button>
        </ButtonGroup>
      </CatalogDocumentationExample>
      <CatalogDocumentationExample id="nested" title="Nested groups">
        <ButtonGroup aria-label="Message composer">
          <ButtonGroup>
            <Button aria-label="Attach" size="icon" variant="outline">
              <CatalogInlineIcon />
            </Button>
          </ButtonGroup>
          <ButtonGroup>
            <Input aria-label="Message" placeholder="Send a message…" />
          </ButtonGroup>
          <ButtonGroup>
            <Button variant="outline">Send</Button>
          </ButtonGroup>
        </ButtonGroup>
      </CatalogDocumentationExample>
      <CatalogDocumentationExample id="separator" title="Separator">
        <ButtonGroup aria-label="Clipboard actions">
          <Button>Copy</Button>
          <ButtonGroupSeparator />
          <Button>Paste</Button>
        </ButtonGroup>
      </CatalogDocumentationExample>
      <CatalogDocumentationExample id="split" title="Split action">
        <ButtonGroup aria-label="Create actions">
          <Button>Create</Button>
          <ButtonGroupSeparator />
          <Button aria-label="More create options" size="icon">
            <span aria-hidden="true">⌄</span>
          </Button>
        </ButtonGroup>
      </CatalogDocumentationExample>
      <CatalogDocumentationExample id="input" title="Input">
        <ButtonGroup aria-label="Search">
          <Input id={inputId} placeholder="Search…" />
          <Button variant="outline">Search</Button>
        </ButtonGroup>
      </CatalogDocumentationExample>
      <CatalogDocumentationExample id="input-group" title="Input group">
        <ButtonGroup aria-label="Send a message">
          <InputGroup>
            <InputGroupInput aria-label="Message" placeholder="Send a message…" />
            <InputGroupAddon>
              <InputGroupText>Draft</InputGroupText>
            </InputGroupAddon>
          </InputGroup>
          <Button>Send</Button>
        </ButtonGroup>
      </CatalogDocumentationExample>
      <CatalogDocumentationExample id="dropdown-menu" title="Dropdown menu">
        <ButtonGroup aria-label="Follow actions">
          <Button>Follow</Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-controls={dropdownContentId}
              aria-label="More follow options"
              id={dropdownTriggerId}
              render={<Button size="icon" />}
            >
              ⌄
            </DropdownMenuTrigger>
            <DropdownMenuContent id={dropdownContentId}>
              <DropdownMenuGroup>
                <DropdownMenuItem>Follow quietly</DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </ButtonGroup>
      </CatalogDocumentationExample>
      <CatalogDocumentationExample id="select" title="Select">
        <ButtonGroup aria-label="Amount and currency">
          <ButtonGroupText>$</ButtonGroupText>
          <Input aria-label="Amount" defaultValue="10.00" />
          <Select defaultValue="usd" id={selectId}>
            <SelectTrigger aria-controls={selectContentId} aria-label="Currency" id={selectTriggerId}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent id={selectContentId}>
              <SelectGroup>
                <SelectItem value="usd">USD</SelectItem>
                <SelectItem value="eur">EUR</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </ButtonGroup>
      </CatalogDocumentationExample>
      <CatalogDocumentationExample id="popover" title="Popover">
        <ButtonGroup aria-label="Assistant actions">
          <Button>Copilot</Button>
          <Popover>
            <PopoverTrigger
              aria-controls={popoverContentId}
              aria-label="Open assistant options"
              id={popoverTriggerId}
              render={<Button size="icon" />}
            >
              ⌄
            </PopoverTrigger>
            <PopoverContent id={popoverContentId}>
              <PopoverTitle>Assistant options</PopoverTitle>
              <PopoverDescription>Choose how the assistant should respond.</PopoverDescription>
            </PopoverContent>
          </Popover>
        </ButtonGroup>
      </CatalogDocumentationExample>
      <CatalogDocumentationExample id="rtl" title="Right-to-left">
        <div dir="rtl">
          <DirectionProvider direction="rtl">
            <ButtonGroup aria-label="إجراءات">
              <Button variant="outline">أرشفة</Button>
              <Button variant="outline">تقرير</Button>
              <Button variant="outline">تأجيل</Button>
            </ButtonGroup>
          </DirectionProvider>
        </div>
      </CatalogDocumentationExample>
    </div>
  );
}

function SpinnerDocumentationExamples(): React.ReactElement {
  return (
    <div data-catalog-documentation-examples="spinner">
      <CatalogDocumentationExample id="basic" title="Basic">
        <Spinner aria-label="Loading" />
      </CatalogDocumentationExample>
      <CatalogDocumentationExample id="sizes" title="Sizes">
        <Spinner aria-label="Loading" className="size-6" />
        <Spinner aria-label="Loading" className="size-8" />
      </CatalogDocumentationExample>
      <CatalogDocumentationExample id="button" title="Button">
        <Button disabled>
          <Spinner aria-hidden="true" data-icon="inline-start" />
          Loading
        </Button>
      </CatalogDocumentationExample>
      <CatalogDocumentationExample id="badge" title="Badge">
        <Badge>
          <Spinner aria-hidden="true" data-icon="inline-start" />
          Syncing
        </Badge>
      </CatalogDocumentationExample>
      <CatalogDocumentationExample id="input-group" title="Input group">
        <InputGroup>
          <InputGroupInput aria-label="Message" placeholder="Send a message…" />
          <InputGroupAddon>
            <Spinner aria-hidden="true" />
            <InputGroupText>Validating…</InputGroupText>
          </InputGroupAddon>
        </InputGroup>
      </CatalogDocumentationExample>
      <CatalogDocumentationExample id="empty" title="Empty state">
        <Empty>
          <EmptyHeader>
            <Spinner aria-hidden="true" />
            <EmptyTitle>Processing your request</EmptyTitle>
            <EmptyDescription>Please wait while the request completes.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline">Cancel</Button>
          </EmptyContent>
        </Empty>
      </CatalogDocumentationExample>
      <CatalogDocumentationExample id="rtl" title="Right-to-left">
        <div dir="rtl">
          <DirectionProvider direction="rtl">
            <span>
              <Spinner aria-hidden="true" /> جاري معالجة الدفع…
            </span>
          </DirectionProvider>
        </div>
      </CatalogDocumentationExample>
    </div>
  );
}

function CatalogStatusIcon({ destructive = false }: { destructive?: boolean }): React.ReactElement {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20">
      <circle cx="10" cy="10" fill="none" r="7" stroke="currentColor" />
      {destructive ? (
        <path d="M10 6v5m0 3h.01" fill="none" stroke="currentColor" strokeLinecap="round" />
      ) : (
        <path d="m6.5 10 2.25 2.25 4.75-5" fill="none" stroke="currentColor" strokeLinecap="round" />
      )}
    </svg>
  );
}

function AlertDocumentationExamples(): React.ReactElement {
  return (
    <div data-catalog-documentation-examples="alert">
      <CatalogDocumentationExample id="basic" title="Basic">
        <Alert>
          <CatalogStatusIcon />
          <AlertTitle>Account updated successfully</AlertTitle>
          <AlertDescription>Your profile information has been saved.</AlertDescription>
        </Alert>
      </CatalogDocumentationExample>
      <CatalogDocumentationExample id="destructive" title="Destructive">
        <Alert variant="destructive">
          <CatalogStatusIcon destructive />
          <AlertTitle>Payment failed</AlertTitle>
          <AlertDescription>Check the payment method and try again.</AlertDescription>
        </Alert>
      </CatalogDocumentationExample>
      <CatalogDocumentationExample id="action" title="Action">
        <Alert>
          <CatalogStatusIcon />
          <AlertTitle>Dark mode is available</AlertTitle>
          <AlertDescription>Enable it in profile settings when you are ready.</AlertDescription>
          <AlertAction>
            <Button variant="outline">Enable</Button>
          </AlertAction>
        </Alert>
      </CatalogDocumentationExample>
      <CatalogDocumentationExample id="rtl" title="Right-to-left">
        <div dir="rtl">
          <DirectionProvider direction="rtl">
            <Alert>
              <CatalogStatusIcon />
              <AlertTitle>تم الدفع بنجاح</AlertTitle>
              <AlertDescription>تمت معالجة الدفعة وإرسال الإيصال.</AlertDescription>
            </Alert>
          </DirectionProvider>
        </div>
      </CatalogDocumentationExample>
    </div>
  );
}

function BadgeDocumentationExamples(): React.ReactElement {
  return (
    <div data-catalog-documentation-examples="badge">
      <CatalogDocumentationExample id="variants" title="Variants">
        <Badge>Default</Badge>
        <Badge variant="secondary">Secondary</Badge>
        <Badge variant="destructive">Destructive</Badge>
        <Badge variant="outline">Outline</Badge>
        <Badge variant="ghost">Ghost</Badge>
      </CatalogDocumentationExample>
      <CatalogDocumentationExample id="with-icon" title="With icon">
        <Badge>
          <CatalogStatusIcon />
          Verified
        </Badge>
        <Badge variant="outline">
          Bookmark
          <span aria-hidden="true" data-icon="inline-end">
            +
          </span>
        </Badge>
      </CatalogDocumentationExample>
      <CatalogDocumentationExample id="with-spinner" title="With spinner">
        <Badge variant="secondary">
          <Spinner aria-hidden="true" data-icon="inline-start" />
          Generating
        </Badge>
      </CatalogDocumentationExample>
      <CatalogDocumentationExample id="link" title="Link">
        <Badge render={<a href="#catalog-release" />}>Open release</Badge>
      </CatalogDocumentationExample>
      <CatalogDocumentationExample id="rtl" title="Right-to-left">
        <div dir="rtl">
          <DirectionProvider direction="rtl">
            <Badge>متحقق</Badge>
            <Badge variant="secondary">ثانوي</Badge>
            <Badge variant="outline">مخطط</Badge>
          </DirectionProvider>
        </div>
      </CatalogDocumentationExample>
    </div>
  );
}

interface ProgressDocumentationExamplesProps {
  basicId: string;
  controlledId: string;
  labelledId: string;
  rtlId: string;
}

function ProgressDocumentationExamples({
  basicId,
  controlledId,
  labelledId,
  rtlId
}: ProgressDocumentationExamplesProps): React.ReactElement {
  const [controlledValue, setControlledValue] = React.useState(42);

  return (
    <div data-catalog-documentation-examples="progress">
      <CatalogDocumentationExample id="basic" title="Basic">
        <Progress aria-label="Task progress" id={basicId} value={33} />
      </CatalogDocumentationExample>
      <CatalogDocumentationExample id="label" title="Label and value">
        <Progress id={labelledId} value={56}>
          <ProgressLabel>Upload progress</ProgressLabel>
          <ProgressValue />
        </Progress>
      </CatalogDocumentationExample>
      <CatalogDocumentationExample id="controlled" title="Controlled">
        <Progress id={controlledId} value={controlledValue}>
          <ProgressLabel>Export progress</ProgressLabel>
          <ProgressValue />
        </Progress>
        <Slider
          aria-label="Set export progress"
          max={100}
          onValueChange={(value) => setControlledValue(typeof value === 'number' ? value : (value[0] ?? 0))}
          value={[controlledValue]}
        />
      </CatalogDocumentationExample>
      <CatalogDocumentationExample id="rtl" title="Right-to-left">
        <div dir="rtl">
          <DirectionProvider direction="rtl">
            <Progress id={rtlId} value={56}>
              <ProgressLabel>تقدم الرفع</ProgressLabel>
              <ProgressValue />
            </Progress>
          </DirectionProvider>
        </div>
      </CatalogDocumentationExample>
    </div>
  );
}

/** A browser-smoke gallery for every React 17-compatible public catalog subpath. */
export function UiProfileCatalogHarness({
  activeComponent,
  activeExample
}: { activeComponent?: UiProfileCatalogComponentId; activeExample?: string } = {}): React.ReactElement {
  const [calendarDate, setCalendarDate] = React.useState<Date | undefined>(new Date(2026, 7, 9));
  const toastManager = React.useMemo(() => createToastManager(), []);

  const alertDialogTriggerId = useSpfxUiId('catalog:alert-dialog-trigger');
  const alertDialogContentId = useSpfxUiId('catalog:alert-dialog-content');
  const alertDialogTitleId = useSpfxUiId('catalog:alert-dialog-title');
  const alertDialogDescriptionId = useSpfxUiId('catalog:alert-dialog-description');
  const accordionItemId = useSpfxUiId('catalog:accordion-item');
  const accordionExamplesId = useSpfxUiId('catalog:accordion-examples');
  const chartId = useSpfxUiId('catalog:chart');
  const checkboxId = useSpfxUiId('catalog:checkbox');
  const breadcrumbDropdownTriggerId = useSpfxUiId('catalog:breadcrumb-dropdown-trigger');
  const breadcrumbDropdownContentId = useSpfxUiId('catalog:breadcrumb-dropdown-content');
  const breadcrumbResponsiveTriggerId = useSpfxUiId('catalog:breadcrumb-responsive-trigger');
  const breadcrumbResponsiveContentId = useSpfxUiId('catalog:breadcrumb-responsive-content');
  const collapsibleTriggerId = useSpfxUiId('catalog:collapsible-trigger');
  const collapsibleContentId = useSpfxUiId('catalog:collapsible-content');
  const comboboxId = useSpfxUiId('catalog:combobox-root');
  const comboboxInputId = useSpfxUiId('catalog:combobox-input');
  const comboboxContentId = useSpfxUiId('catalog:combobox-content');
  const contextMenuTriggerId = useSpfxUiId('catalog:context-menu-trigger');
  const contextMenuContentId = useSpfxUiId('catalog:context-menu-content');
  const dialogTriggerId = useSpfxUiId('catalog:dialog-trigger');
  const dialogContentId = useSpfxUiId('catalog:dialog-content');
  const dialogTitleId = useSpfxUiId('catalog:dialog-title');
  const dialogDescriptionId = useSpfxUiId('catalog:dialog-description');
  const drawerTriggerId = useSpfxUiId('catalog:drawer-trigger');
  const drawerContentId = useSpfxUiId('catalog:drawer-content');
  const drawerTitleId = useSpfxUiId('catalog:drawer-title');
  const drawerDescriptionId = useSpfxUiId('catalog:drawer-description');
  const dropdownTriggerId = useSpfxUiId('catalog:dropdown-trigger');
  const dropdownContentId = useSpfxUiId('catalog:dropdown-content');
  const fieldInputId = useSpfxUiId('catalog:field-input');
  const hoverTriggerId = useSpfxUiId('catalog:hover-trigger');
  const hoverContentId = useSpfxUiId('catalog:hover-content');
  const inputId = useSpfxUiId('catalog:input');
  const menubarContentId = useSpfxUiId('catalog:menubar-content');
  const nativeSelectId = useSpfxUiId('catalog:native-select');
  const navigationMenuId = useSpfxUiId('catalog:navigation-menu');
  const popoverTriggerId = useSpfxUiId('catalog:popover-trigger');
  const popoverContentId = useSpfxUiId('catalog:popover-content');
  const progressId = useSpfxUiId('catalog:progress');
  const progressControlledId = useSpfxUiId('catalog:progress-controlled');
  const progressLabelledId = useSpfxUiId('catalog:progress-labelled');
  const progressRtlId = useSpfxUiId('catalog:progress-rtl');
  const radioGroupId = useSpfxUiId('catalog:radio-group');
  const selectId = useSpfxUiId('catalog:select-root');
  const selectTriggerId = useSpfxUiId('catalog:select-trigger');
  const selectContentId = useSpfxUiId('catalog:select-content');
  const sheetTriggerId = useSpfxUiId('catalog:sheet-trigger');
  const sheetContentId = useSpfxUiId('catalog:sheet-content');
  const sheetTitleId = useSpfxUiId('catalog:sheet-title');
  const sheetDescriptionId = useSpfxUiId('catalog:sheet-description');
  const sidebarId = useSpfxUiId('catalog:sidebar');
  const switchId = useSpfxUiId('catalog:switch');
  const tabsId = useSpfxUiId('catalog:tabs');
  const textareaId = useSpfxUiId('catalog:textarea');
  const toastPortalId = useSpfxUiId('catalog:toast-portal');
  const tooltipTriggerId = useSpfxUiId('catalog:tooltip-trigger');
  const tooltipContentId = useSpfxUiId('catalog:tooltip-content');

  const catalog = (
    <section
      aria-label="Shared UI component catalog"
      data-catalog-mode={activeComponent === undefined ? 'gallery' : 'single'}
      data-ui-profile-catalog="base-nova"
    >
      <h2>Shared UI component catalog</h2>

      <CatalogSample component="accordion" title="Accordion">
        {activeComponent === 'accordion' ? (
          <AccordionDocumentationExamples baseId={accordionExamplesId} />
        ) : (
          <Accordion>
            <AccordionItem id={accordionItemId} value="catalog-item">
              <AccordionTrigger>Is this the official default?</AccordionTrigger>
              <AccordionContent>Yes. The catalog classes and behavior are preserved.</AccordionContent>
            </AccordionItem>
          </Accordion>
        )}
      </CatalogSample>

      <CatalogSample component="alert" title="Alert">
        {activeComponent === 'alert' ? (
          <AlertDocumentationExamples />
        ) : (
          <Alert>
            <AlertTitle>Catalog ready</AlertTitle>
            <AlertDescription>Default Base Nova alert styling.</AlertDescription>
          </Alert>
        )}
      </CatalogSample>

      <CatalogSample component="alert-dialog" title="Alert Dialog">
        <AlertDialog>
          <AlertDialogTrigger id={alertDialogTriggerId} render={<Button variant="outline" />}>
            Open alert dialog
          </AlertDialogTrigger>
          <AlertDialogContent
            aria-describedby={alertDialogDescriptionId}
            aria-labelledby={alertDialogTitleId}
            id={alertDialogContentId}
          >
            <AlertDialogHeader>
              <AlertDialogTitle id={alertDialogTitleId}>Continue?</AlertDialogTitle>
              <AlertDialogDescription id={alertDialogDescriptionId}>
                Review the default confirmation dialog.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction>Continue</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CatalogSample>

      <CatalogSample component="aspect-ratio" title="Aspect Ratio">
        <AspectRatio ratio={16 / 9}>16:9 preview</AspectRatio>
      </CatalogSample>

      <CatalogSample component="attachment" title="Attachment">
        <Attachment>
          <AttachmentContent>
            <AttachmentTitle>design-notes.pdf</AttachmentTitle>
            <AttachmentDescription>240 KB</AttachmentDescription>
          </AttachmentContent>
          <AttachmentActions>
            <AttachmentAction>Open</AttachmentAction>
          </AttachmentActions>
        </Attachment>
      </CatalogSample>

      <CatalogSample component="avatar" title="Avatar">
        <Avatar>
          <AvatarFallback>SK</AvatarFallback>
        </Avatar>
      </CatalogSample>

      <CatalogSample component="badge" title="Badge">
        {activeComponent === 'badge' ? <BadgeDocumentationExamples /> : <Badge>Default</Badge>}
      </CatalogSample>

      <CatalogSample component="breadcrumb" title="Breadcrumb">
        {activeComponent === 'breadcrumb' ? (
          <BreadcrumbDocumentationExamples
            dropdownContentId={breadcrumbDropdownContentId}
            dropdownTriggerId={breadcrumbDropdownTriggerId}
            responsiveContentId={breadcrumbResponsiveContentId}
            responsiveTriggerId={breadcrumbResponsiveTriggerId}
          />
        ) : (
          <BreadcrumbBasic />
        )}
      </CatalogSample>

      <CatalogSample component="bubble" title="Bubble">
        <BubbleGroup>
          <Bubble>
            <BubbleContent>Shared UI is ready.</BubbleContent>
          </Bubble>
        </BubbleGroup>
      </CatalogSample>

      <CatalogSample component="button" title="Button">
        {activeComponent === 'button' ? <ButtonDocumentationExamples /> : <Button>Button</Button>}
      </CatalogSample>

      <CatalogSample component="button-group" title="Button Group">
        {activeComponent === 'button-group' ? (
          <ButtonGroupDocumentationExamples
            dropdownContentId={dropdownContentId}
            dropdownTriggerId={dropdownTriggerId}
            inputId={inputId}
            popoverContentId={popoverContentId}
            popoverTriggerId={popoverTriggerId}
            selectContentId={selectContentId}
            selectId={selectId}
            selectTriggerId={selectTriggerId}
          />
        ) : (
          <ButtonGroup aria-label="Pagination actions">
            <Button variant="outline">Previous</Button>
            <ButtonGroupSeparator />
            <ButtonGroupText>1 of 3</ButtonGroupText>
            <ButtonGroupSeparator />
            <Button variant="outline">Next</Button>
          </ButtonGroup>
        )}
      </CatalogSample>

      <CatalogSample component="calendar" title="Calendar">
        <Calendar mode="single" onSelect={setCalendarDate} selected={calendarDate} />
      </CatalogSample>

      <CatalogSample component="card" title="Card">
        <Card>
          <CardHeader>
            <CardTitle>Catalog card</CardTitle>
            <CardDescription>Official default composition.</CardDescription>
          </CardHeader>
          <CardContent>Shared content</CardContent>
          <CardFooter>
            <Button>Continue</Button>
          </CardFooter>
        </Card>
      </CatalogSample>

      <CatalogSample component="carousel" title="Carousel">
        <Carousel>
          <CarouselContent>
            <CarouselItem>First slide</CarouselItem>
            <CarouselItem>Second slide</CarouselItem>
          </CarouselContent>
          <CarouselPrevious />
          <CarouselNext />
        </Carousel>
      </CatalogSample>

      <CatalogSample component="chart" title="Chart">
        <ChartContainer config={{ catalog: { color: 'var(--chart-1)', label: 'Catalog' } }} id={chartId}>
          <svg aria-label="Catalog chart" role="img">
            <title>Catalog chart</title>
          </svg>
        </ChartContainer>
      </CatalogSample>

      <CatalogSample component="checkbox" title="Checkbox">
        <Label htmlFor={checkboxId}>
          <Checkbox id={checkboxId} /> Include examples
        </Label>
      </CatalogSample>

      <CatalogSample component="collapsible" title="Collapsible">
        <Collapsible>
          <CollapsibleTrigger
            aria-controls={collapsibleContentId}
            id={collapsibleTriggerId}
            render={<Button variant="outline" />}
          >
            Toggle details
          </CollapsibleTrigger>
          <CollapsibleContent id={collapsibleContentId}>Catalog details</CollapsibleContent>
        </Collapsible>
      </CatalogSample>

      <CatalogSample component="combobox" title="Combobox">
        <Combobox id={comboboxId} items={['Alpha', 'Beta']}>
          <ComboboxInput id={comboboxInputId} placeholder="Choose an option" />
          <ComboboxContent id={comboboxContentId}>
            <ComboboxList>
              <ComboboxGroup>
                {['Alpha', 'Beta'].map((item) => (
                  <ComboboxItem key={item} value={item}>
                    {item}
                  </ComboboxItem>
                ))}
              </ComboboxGroup>
            </ComboboxList>
            <ComboboxEmpty>No results.</ComboboxEmpty>
          </ComboboxContent>
        </Combobox>
      </CatalogSample>

      <CatalogSample component="context-menu" title="Context Menu">
        <ContextMenu>
          <ContextMenuTrigger id={contextMenuTriggerId}>Right click this area</ContextMenuTrigger>
          <ContextMenuContent id={contextMenuContentId}>
            <ContextMenuGroup>
              <ContextMenuItem>Inspect</ContextMenuItem>
            </ContextMenuGroup>
          </ContextMenuContent>
        </ContextMenu>
      </CatalogSample>

      <CatalogSample component="dialog" title="Dialog">
        <Dialog>
          <DialogTrigger id={dialogTriggerId} render={<Button variant="outline" />}>
            Open dialog
          </DialogTrigger>
          <DialogContent aria-describedby={dialogDescriptionId} aria-labelledby={dialogTitleId} id={dialogContentId}>
            <DialogTitle id={dialogTitleId}>Catalog dialog</DialogTitle>
            <DialogDescription id={dialogDescriptionId}>Default dialog composition.</DialogDescription>
          </DialogContent>
        </Dialog>
      </CatalogSample>

      <CatalogSample component="direction" title="Direction">
        <DirectionProvider direction="ltr">
          <span>Left to right</span>
        </DirectionProvider>
      </CatalogSample>

      <CatalogSample component="drawer" title="Drawer">
        <Drawer>
          <DrawerTrigger id={drawerTriggerId} render={<Button variant="outline" />}>
            Open drawer
          </DrawerTrigger>
          <DrawerContent aria-describedby={drawerDescriptionId} aria-labelledby={drawerTitleId} id={drawerContentId}>
            <DrawerTitle id={drawerTitleId}>Catalog drawer</DrawerTitle>
            <DrawerDescription id={drawerDescriptionId}>Default drawer composition.</DrawerDescription>
          </DrawerContent>
        </Drawer>
      </CatalogSample>

      <CatalogSample component="dropdown-menu" title="Dropdown Menu">
        <DropdownMenu>
          <DropdownMenuTrigger id={dropdownTriggerId} render={<Button variant="outline" />}>
            Open menu
          </DropdownMenuTrigger>
          <DropdownMenuContent id={dropdownContentId}>
            <DropdownMenuGroup>
              <DropdownMenuItem>Profile</DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </CatalogSample>

      <CatalogSample component="empty" title="Empty">
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No results</EmptyTitle>
            <EmptyDescription>Try another search.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button>Clear</Button>
          </EmptyContent>
        </Empty>
      </CatalogSample>

      <CatalogSample component="field" title="Field">
        <Field>
          <FieldLabel htmlFor={fieldInputId}>Project name</FieldLabel>
          <Input id={fieldInputId} />
          <FieldDescription>Visible to collaborators.</FieldDescription>
        </Field>
      </CatalogSample>

      <CatalogSample component="hover-card" title="Hover Card">
        <HoverCard>
          <HoverCardTrigger id={hoverTriggerId} render={<Button variant="link" />}>
            Hover for details
          </HoverCardTrigger>
          <HoverCardContent id={hoverContentId}>Shared package details.</HoverCardContent>
        </HoverCard>
      </CatalogSample>

      <CatalogSample component="input" title="Input">
        <Input aria-label="Catalog input" id={inputId} placeholder="Type here" />
      </CatalogSample>

      <CatalogSample component="input-group" title="Input Group">
        <InputGroup>
          <InputGroupAddon>
            <InputGroupText>https://</InputGroupText>
          </InputGroupAddon>
          <InputGroupInput aria-label="Catalog URL" placeholder="example.com" />
        </InputGroup>
      </CatalogSample>

      <CatalogSample component="input-otp" title="Input OTP">
        <InputOTP maxLength={4}>
          <InputOTPGroup>
            <InputOTPSlot index={0} />
            <InputOTPSlot index={1} />
          </InputOTPGroup>
          <InputOTPSeparator />
          <InputOTPGroup>
            <InputOTPSlot index={2} />
            <InputOTPSlot index={3} />
          </InputOTPGroup>
        </InputOTP>
      </CatalogSample>

      <CatalogSample component="item" title="Item">
        <Item>
          <ItemContent>
            <ItemTitle>Catalog item</ItemTitle>
            <ItemDescription>Default item description.</ItemDescription>
          </ItemContent>
          <ItemActions>
            <Button size="sm">Open</Button>
          </ItemActions>
        </Item>
      </CatalogSample>

      <CatalogSample component="kbd" title="Keyboard Key">
        <KbdGroup>
          <Kbd>⌘</Kbd>
          <span>+</span>
          <Kbd>K</Kbd>
        </KbdGroup>
      </CatalogSample>

      <CatalogSample component="label" title="Label">
        <Label htmlFor={inputId}>Catalog input label</Label>
      </CatalogSample>

      <CatalogSample component="marker" title="Marker">
        <Marker>
          <MarkerIcon>✓</MarkerIcon>
          <MarkerContent>Verified</MarkerContent>
        </Marker>
      </CatalogSample>

      <CatalogSample component="menubar" title="Menubar">
        <Menubar>
          <MenubarMenu>
            <MenubarTrigger>File</MenubarTrigger>
            <MenubarContent id={menubarContentId}>
              <MenubarGroup>
                <MenubarItem>New tab</MenubarItem>
              </MenubarGroup>
            </MenubarContent>
          </MenubarMenu>
        </Menubar>
      </CatalogSample>

      <CatalogSample component="message" title="Message">
        <MessageGroup>
          <Message>
            <MessageHeader>Assistant</MessageHeader>
            <MessageContent>The catalog is ready.</MessageContent>
            <MessageFooter>Just now</MessageFooter>
          </Message>
        </MessageGroup>
      </CatalogSample>

      <CatalogSample component="native-select" title="Native Select">
        <Label htmlFor={nativeSelectId}>Framework</Label>
        <NativeSelect id={nativeSelectId}>
          <NativeSelectOption>React 17</NativeSelectOption>
          <NativeSelectOption>SPFx</NativeSelectOption>
        </NativeSelect>
      </CatalogSample>

      <CatalogSample component="navigation-menu" title="Navigation Menu">
        <NavigationMenu id={navigationMenuId}>
          <NavigationMenuList>
            <NavigationMenuItem>
              <NavigationMenuTrigger>Components</NavigationMenuTrigger>
              <NavigationMenuContent>
                <NavigationMenuLink href="#catalog-components">Catalog</NavigationMenuLink>
              </NavigationMenuContent>
            </NavigationMenuItem>
          </NavigationMenuList>
        </NavigationMenu>
      </CatalogSample>

      <CatalogSample component="pagination" title="Pagination">
        <Pagination aria-label="Catalog pagination">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious href="#page-previous" />
            </PaginationItem>
            <PaginationItem>
              <PaginationLink href="#page-1" isActive>
                1
              </PaginationLink>
            </PaginationItem>
            <PaginationItem>
              <PaginationNext href="#page-next" />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </CatalogSample>

      <CatalogSample component="popover" title="Popover">
        <Popover>
          <PopoverTrigger id={popoverTriggerId} render={<Button variant="outline" />}>
            Open popover
          </PopoverTrigger>
          <PopoverContent id={popoverContentId}>
            <PopoverTitle>Catalog popover</PopoverTitle>
            <PopoverDescription>Default popover composition.</PopoverDescription>
          </PopoverContent>
        </Popover>
      </CatalogSample>

      <CatalogSample component="progress" title="Progress">
        {activeComponent === 'progress' ? (
          <ProgressDocumentationExamples
            basicId={progressId}
            controlledId={progressControlledId}
            labelledId={progressLabelledId}
            rtlId={progressRtlId}
          />
        ) : (
          <Progress id={progressId} value={68}>
            <ProgressLabel>Coverage</ProgressLabel>
            <ProgressValue />
          </Progress>
        )}
      </CatalogSample>

      <CatalogSample component="radio-group" title="Radio Group">
        <RadioGroup defaultValue="default" id={radioGroupId}>
          <Label>
            <RadioGroupItem value="default" /> Default
          </Label>
          <Label>
            <RadioGroupItem value="compact" /> Compact
          </Label>
        </RadioGroup>
      </CatalogSample>

      <CatalogSample component="scroll-area" title="Scroll Area">
        <ScrollArea>Scrollable catalog content</ScrollArea>
      </CatalogSample>

      <CatalogSample component="select" title="Select">
        <Select defaultValue="react17" id={selectId}>
          <SelectTrigger id={selectTriggerId}>
            <SelectValue placeholder="Choose a runtime" />
          </SelectTrigger>
          <SelectContent id={selectContentId}>
            <SelectGroup>
              <SelectItem value="react17">React 17</SelectItem>
              <SelectItem value="spfx">SPFx</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </CatalogSample>

      <CatalogSample component="separator" title="Separator">
        <span>Above</span>
        <Separator />
        <span>Below</span>
      </CatalogSample>

      <CatalogSample component="sheet" title="Sheet">
        <Sheet>
          <SheetTrigger id={sheetTriggerId} render={<Button variant="outline" />}>
            Open sheet
          </SheetTrigger>
          <SheetContent aria-describedby={sheetDescriptionId} aria-labelledby={sheetTitleId} id={sheetContentId}>
            <SheetTitle id={sheetTitleId}>Catalog sheet</SheetTitle>
            <SheetDescription id={sheetDescriptionId}>Default sheet composition.</SheetDescription>
          </SheetContent>
        </Sheet>
      </CatalogSample>

      <CatalogSample component="sidebar" title="Sidebar">
        <SidebarProvider defaultOpen={false}>
          <Sidebar collapsible="none" id={sidebarId}>
            <SidebarContent>
              <SidebarGroup>
                <SidebarGroupLabel>Catalog</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuButton>Components</SidebarMenuButton>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </SidebarContent>
          </Sidebar>
          <SidebarInset>
            <SidebarTrigger />
            <span>Sidebar content</span>
          </SidebarInset>
        </SidebarProvider>
      </CatalogSample>

      <CatalogSample component="skeleton" title="Skeleton">
        <Skeleton />
      </CatalogSample>

      <CatalogSample component="slider" title="Slider">
        <Slider aria-label="Catalog value" defaultValue={[40]} />
      </CatalogSample>

      <CatalogSample component="spinner" title="Spinner">
        {activeComponent === 'spinner' ? <SpinnerDocumentationExamples /> : <Spinner aria-label="Loading catalog" />}
      </CatalogSample>

      <CatalogSample component="switch" title="Switch">
        <Label htmlFor={switchId}>
          <Switch id={switchId} /> Enable catalog
        </Label>
      </CatalogSample>

      <CatalogSample component="table" title="Table">
        <Table>
          <TableCaption>Catalog entries</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Component</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>Button</TableCell>
              <TableCell>Included</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CatalogSample>

      <CatalogSample component="tabs" title="Tabs">
        <Tabs defaultValue="preview" id={tabsId}>
          <TabsList>
            <TabsTrigger value="preview">Preview</TabsTrigger>
            <TabsTrigger value="code">Code</TabsTrigger>
          </TabsList>
          <TabsContent value="preview">Catalog preview</TabsContent>
          <TabsContent value="code">Public import</TabsContent>
        </Tabs>
      </CatalogSample>

      <CatalogSample component="textarea" title="Textarea">
        <Textarea aria-label="Catalog notes" id={textareaId} placeholder="Add notes" />
      </CatalogSample>

      <CatalogSample component="toast" title="Toast">
        <ToastProvider toastManager={toastManager}>
          <Button
            onClick={() => toastManager.add({ description: 'Official default toast composition.', title: 'Catalog toast' })}
            variant="outline"
          >
            Show toast
          </Button>
          <ToastPortal id={toastPortalId}>
            <ToastViewport>
              <CatalogToastList />
            </ToastViewport>
          </ToastPortal>
        </ToastProvider>
      </CatalogSample>

      <CatalogSample component="toggle" title="Toggle">
        <Toggle aria-label="Toggle bold">Bold</Toggle>
      </CatalogSample>

      <CatalogSample component="toggle-group" title="Toggle Group">
        <ToggleGroup aria-label="Text alignment" defaultValue={['left']}>
          <ToggleGroupItem aria-label="Align left" value="left">
            Left
          </ToggleGroupItem>
          <ToggleGroupItem aria-label="Align right" value="right">
            Right
          </ToggleGroupItem>
        </ToggleGroup>
      </CatalogSample>

      <CatalogSample component="tooltip" title="Tooltip">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger id={tooltipTriggerId} render={<Button variant="outline" />}>
              Hover me
            </TooltipTrigger>
            <TooltipContent id={tooltipContentId}>Catalog tooltip</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </CatalogSample>
    </section>
  );

  return (
    <ActiveCatalogComponentContext.Provider value={activeComponent}>
      <ActiveCatalogExampleContext.Provider value={activeExample}>{catalog}</ActiveCatalogExampleContext.Provider>
    </ActiveCatalogComponentContext.Provider>
  );
}

export function mountUiProfileCatalogHarness(mountPoint: HTMLElement): () => void {
  const host = createSpfxUiHost({
    mountPoint,
    portalParent: mountPoint,
    targetDocument: mountPoint.ownerDocument,
    instanceId: 'spfx-kit-ui-profile-catalog',
    theme: createLabUiThemeTokens('light', createLabTheme('light'))
  });

  ReactDom.render(
    <SpfxUiHostProvider host={host}>
      <UiProfileCatalogHarness />
    </SpfxUiHostProvider>,
    host.appRoot
  );

  return () => {
    ReactDom.unmountComponentAtNode(host.appRoot);
    host.dispose();
  };
}
