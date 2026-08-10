import * as React from 'react';
import * as ReactDom from 'react-dom';

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@spfx-kit/ui-profile/accordion';
import { Alert, AlertDescription, AlertTitle } from '@spfx-kit/ui-profile/alert';
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
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@spfx-kit/ui-profile/breadcrumb';
import { Bubble, BubbleContent, BubbleGroup } from '@spfx-kit/ui-profile/bubble';
import { Button } from '@spfx-kit/ui-profile/button';
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
import { createSpfxUiHost, SpfxUiHostProvider, useSpfxUiId } from '@spfx-kit/ui-profile';
import { createLabTheme } from '@spfx-kit/spfx-lab-runtime';
import { createLabUiThemeTokens } from '../ui-profile/lab-theme';

interface CatalogSampleProps {
  children: React.ReactNode;
  component: string;
  title: string;
}

function CatalogSample({ children, component, title }: CatalogSampleProps): React.ReactElement {
  return (
    <section data-catalog-component={component}>
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

/** A browser-smoke gallery for every React 17-compatible public catalog subpath. */
export function UiProfileCatalogHarness(): React.ReactElement {
  const [calendarDate, setCalendarDate] = React.useState<Date | undefined>(new Date(2026, 7, 9));
  const toastManager = React.useMemo(() => createToastManager(), []);

  const alertDialogTriggerId = useSpfxUiId('catalog:alert-dialog-trigger');
  const alertDialogContentId = useSpfxUiId('catalog:alert-dialog-content');
  const alertDialogTitleId = useSpfxUiId('catalog:alert-dialog-title');
  const alertDialogDescriptionId = useSpfxUiId('catalog:alert-dialog-description');
  const accordionItemId = useSpfxUiId('catalog:accordion-item');
  const chartId = useSpfxUiId('catalog:chart');
  const checkboxId = useSpfxUiId('catalog:checkbox');
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

  return (
    <section aria-label="Shared UI component catalog" data-ui-profile-catalog="base-nova">
      <h2>Shared UI component catalog</h2>

      <CatalogSample component="accordion" title="Accordion">
        <Accordion>
          <AccordionItem id={accordionItemId} value="catalog-item">
            <AccordionTrigger>Is this the official default?</AccordionTrigger>
            <AccordionContent>Yes. The catalog classes and behavior are preserved.</AccordionContent>
          </AccordionItem>
        </Accordion>
      </CatalogSample>

      <CatalogSample component="alert" title="Alert">
        <Alert>
          <AlertTitle>Catalog ready</AlertTitle>
          <AlertDescription>Default Base Nova alert styling.</AlertDescription>
        </Alert>
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
        <Badge>Default</Badge>
      </CatalogSample>

      <CatalogSample component="breadcrumb" title="Breadcrumb">
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
      </CatalogSample>

      <CatalogSample component="bubble" title="Bubble">
        <BubbleGroup>
          <Bubble>
            <BubbleContent>Shared UI is ready.</BubbleContent>
          </Bubble>
        </BubbleGroup>
      </CatalogSample>

      <CatalogSample component="button" title="Button">
        <Button>Button</Button>
      </CatalogSample>

      <CatalogSample component="button-group" title="Button Group">
        <ButtonGroup>
          <Button variant="outline">Previous</Button>
          <ButtonGroupSeparator />
          <ButtonGroupText>1 of 3</ButtonGroupText>
          <ButtonGroupSeparator />
          <Button variant="outline">Next</Button>
        </ButtonGroup>
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
        <Progress id={progressId} value={68}>
          <ProgressLabel>Coverage</ProgressLabel>
          <ProgressValue />
        </Progress>
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
        <Spinner aria-label="Loading catalog" />
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
