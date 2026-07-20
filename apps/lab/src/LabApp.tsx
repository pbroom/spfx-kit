import * as React from 'react';
import LayoutRightIcon from '@hugeicons/core-free-icons/LayoutRightIcon';
import { HugeiconsIcon } from '@hugeicons/react';
import { Pin16Filled, Pin16Regular } from '@fluentui/react-icons';
import {
  Button,
  Dropdown,
  FluentProvider,
  Menu,
  MenuButton,
  MenuItem,
  MenuItemRadio,
  MenuList,
  MenuPopover,
  MenuTrigger,
  Option,
  Tab,
  TabList,
  webDarkTheme,
  webLightTheme
} from '@fluentui/react-components';
import {
  Moon,
  PanelRight,
  PanelRightOpen,
  RectangleHorizontal,
  Smartphone,
  Square,
  SquareDashed,
  Columns3,
  Columns2,
  FolderInput,
  FolderPlus,
  Menu as MenuIcon,
  Settings,
  Upload
} from 'lucide-react';
import {
  createLabTheme,
  createMockSpfxContext,
  LabBreakpoint,
  LabPropertyBag,
  LabThemeMode,
  LabWebPart,
  LabWebPartRegistry,
  SHAREPOINT_BREAKPOINTS
} from '@spfx-kit/spfx-lab-runtime';
import { registerGeneratedWebParts } from './generated/lab-registry';
import { PropertyPane } from './components/PropertyPane';
import { AddAppDrawer, AddAppMode } from './components/AddAppDrawer';
import { ExportDrawer } from './components/ExportDrawer';
import { ManageAppsDialog } from './components/ManageAppsDialog';
import {
  getBrowserStorage,
  getLabAppId,
  persistPinnedAppId,
  readPinnedAppId,
  resolveInitialWebPartId,
  resolvePinnedAppId
} from './lib/pinnedApp';
import { getPrimaryShortcutLabel } from './lib/text';

type PropsByWebPart = Record<string, LabPropertyBag>;

const themeOptions: Array<{ label: string; value: LabThemeMode }> = [
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
  { label: 'Custom', value: 'custom' }
];

export function LabApp(): JSX.Element {
  const registry = React.useMemo(() => {
    const next = new LabWebPartRegistry();
    registerGeneratedWebParts(next);
    return next;
  }, []);
  const webParts = React.useMemo(() => registry.list(), [registry]);
  const [pinnedAppId, setPinnedAppId] = React.useState(() => resolvePinnedAppId(webParts, readPinnedAppId(getBrowserStorage())));
  const [selectedId, setSelectedId] = React.useState<string>(() => resolveInitialWebPartId(webParts, pinnedAppId));
  const selected = registry.get(selectedId) || webParts[0];
  const [breakpointId, setBreakpointId] = React.useState<LabBreakpoint['id']>('one-column');
  const [boundsVisible, setBoundsVisible] = React.useState(false);
  const [appMenuOpen, setAppMenuOpen] = React.useState(false);
  const [themeMode, setThemeMode] = React.useState<LabThemeMode>('light');
  const [themeMenuOpen, setThemeMenuOpen] = React.useState(false);
  const [customBackground, setCustomBackground] = React.useState('#eef6ff');
  const [addDrawerOpen, setAddDrawerOpen] = React.useState(false);
  const [addMode, setAddMode] = React.useState<AddAppMode>('import');
  const [manageAppsOpen, setManageAppsOpen] = React.useState(false);
  const [exportDrawerOpen, setExportDrawerOpen] = React.useState(false);
  const [panelCollapsed, setPanelCollapsed] = React.useState(false);
  const [webPartPickerOpen, setWebPartPickerOpen] = React.useState(false);
  const [pinAnnouncement, setPinAnnouncement] = React.useState('');
  const activeWebPartOptionIdRef = React.useRef(selectedId);
  const [propsByWebPart, setPropsByWebPart] = React.useState<PropsByWebPart>(() =>
    Object.fromEntries(webParts.map((webPart) => [webPart.id, { ...webPart.defaultProps }]))
  );

  React.useEffect(() => {
    if (!selectedId && webParts[0]) {
      setSelectedId(webParts[0].id);
    }
  }, [selectedId, webParts]);

  React.useEffect(() => {
    const handleAppCommandShortcut = (event: KeyboardEvent): void => {
      const key = event.key.toLowerCase();
      const isAppCommandShortcut =
        (key === 'o' || key === 'n' || key === 'e') && (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey;

      if (!isAppCommandShortcut || event.defaultPrevented || event.repeat) {
        return;
      }

      event.preventDefault();
      setAppMenuOpen(false);

      if (key === 'o' || key === 'n') {
        setExportDrawerOpen(false);
        setAddMode(key === 'o' ? 'import' : 'create');
        setAddDrawerOpen(true);
        return;
      }

      setAddDrawerOpen(false);
      setExportDrawerOpen(true);
    };

    window.addEventListener('keydown', handleAppCommandShortcut);
    return () => window.removeEventListener('keydown', handleAppCommandShortcut);
  }, []);

  const activeBreakpoint = SHAREPOINT_BREAKPOINTS.find((item) => item.id === breakpointId) || SHAREPOINT_BREAKPOINTS[0];
  const theme = createLabTheme(themeMode, customBackground);
  const fluentTheme = themeMode === 'dark' ? webDarkTheme : webLightTheme;
  const activeProps = selected ? propsByWebPart[selected.id] || selected.defaultProps : {};
  const webPartsByAppId = React.useMemo(() => groupWebPartsByAppId(webParts), [webParts]);
  const importShortcutLabel = React.useMemo(() => getPrimaryShortcutLabel('O'), []);
  const createShortcutLabel = React.useMemo(() => getPrimaryShortcutLabel('N'), []);
  const exportShortcutLabel = React.useMemo(() => getPrimaryShortcutLabel('E'), []);
  const context = React.useMemo(() => createMockSpfxContext(), []);

  const updateProps = (patch: LabPropertyBag): void => {
    if (!selected) {
      return;
    }
    setPropsByWebPart((prev) => ({
      ...prev,
      [selected.id]: { ...(prev[selected.id] || selected.defaultProps), ...patch }
    }));
  };

  const selectThemeMode = (mode: LabThemeMode): void => {
    setThemeMode(mode);
    setThemeMenuOpen(false);
  };

  const selectCustomBackground = (value: string): void => {
    setCustomBackground(value);
    setThemeMode('custom');
  };

  const openManageApps = (): void => {
    setManageAppsOpen(true);
  };

  const openAddAppDrawer = (mode: AddAppMode): void => {
    setAddMode(mode);
    setAppMenuOpen(false);
    setExportDrawerOpen(false);
    setManageAppsOpen(false);
    setAddDrawerOpen(true);
  };

  const openExportDrawer = (): void => {
    setAppMenuOpen(false);
    setAddDrawerOpen(false);
    setExportDrawerOpen(true);
  };

  const togglePinnedApp = (webPart: LabWebPart): void => {
    const appId = getLabAppId(webPart);
    const nextPinnedAppId = pinnedAppId === appId ? '' : appId;
    setPinnedAppId(nextPinnedAppId);
    persistPinnedAppId(getBrowserStorage(), nextPinnedAppId);
    setPinAnnouncement(nextPinnedAppId ? `${webPart.title} pinned as the startup app.` : `${webPart.title} is no longer pinned.`);
  };

  const Preview = selected?.render;

  return (
    <FluentProvider theme={fluentTheme}>
      <main
        className={`lab-shell lab-shell--${themeMode}`}
        style={{ '--lab-section-background': theme.background } as React.CSSProperties}
      >
        <section className="preview-area" aria-label="Web part preview area">
          <div className="lab-toolbar lab-toolbar--preview">
            <div className="app-menu-control" aria-label="App menu">
              <Menu
                open={appMenuOpen}
                positioning={{ position: 'below', align: 'start' }}
                onOpenChange={(_event, data) => setAppMenuOpen(data.open)}
              >
                <MenuTrigger disableButtonEnhancement>
                  <MenuButton
                    appearance="subtle"
                    aria-label="Open app menu"
                    className="app-menu-button"
                    icon={<MenuIcon size={16} />}
                    size="small"
                    title="Open app menu"
                  />
                </MenuTrigger>
                <MenuPopover className="app-menu-popover">
                  <MenuList>
                    <MenuItem icon={<FolderInput size={14} />} onClick={() => openAddAppDrawer('import')}>
                      <span className="app-menu-command">
                        <span>Import SPFx app</span>
                        <kbd className="app-menu-shortcut">{importShortcutLabel}</kbd>
                      </span>
                    </MenuItem>
                    <MenuItem icon={<FolderPlus size={14} />} onClick={() => openAddAppDrawer('create')}>
                      <span className="app-menu-command">
                        <span>Create SPFx app</span>
                        <kbd className="app-menu-shortcut">{createShortcutLabel}</kbd>
                      </span>
                    </MenuItem>
                    <MenuItem icon={<Upload size={14} />} onClick={openExportDrawer}>
                      <span className="app-menu-command">
                        <span>Export package</span>
                        <kbd className="app-menu-shortcut">{exportShortcutLabel}</kbd>
                      </span>
                    </MenuItem>
                  </MenuList>
                </MenuPopover>
              </Menu>
            </div>

            <div className="preview-toolbar__center">
              <IconButton
                label={boundsVisible ? 'Hide preview bounds' : 'Show preview bounds'}
                pressed={boundsVisible}
                onClick={() => setBoundsVisible((value) => !value)}
              >
                <SquareDashed size={16} />
              </IconButton>

              <TabList
                aria-label="SharePoint breakpoint"
                className="breakpoint-tabs"
                selectedValue={breakpointId}
                size="small"
                onTabSelect={(_event, data) => setBreakpointId(data.value as LabBreakpoint['id'])}
              >
                {SHAREPOINT_BREAKPOINTS.map((breakpoint) => (
                  <Tab
                    aria-label={breakpoint.label}
                    icon={iconForBreakpoint(breakpoint.id)}
                    key={breakpoint.id}
                    title={`${breakpoint.label} - ${breakpoint.description}`}
                    value={breakpoint.id}
                    onClick={() => setBreakpointId(breakpoint.id)}
                  />
                ))}
              </TabList>

              <Menu
                checkedValues={{ theme: [themeMode] }}
                open={themeMenuOpen}
                positioning={{ position: 'below', align: 'start' }}
                onOpenChange={(_event, data) => setThemeMenuOpen(data.open)}
              >
                <MenuTrigger disableButtonEnhancement>
                  <MenuButton
                    appearance="subtle"
                    aria-label={`Theme: ${themeOptions.find((option) => option.value === themeMode)?.label || themeMode}`}
                    className="theme-menu-trigger"
                    icon={<Moon size={16} />}
                    size="small"
                  />
                </MenuTrigger>
                <MenuPopover className="theme-menu-popover">
                  <MenuList>
                    {themeOptions.map((option) => (
                      <MenuItemRadio
                        key={option.value}
                        name="theme"
                        value={option.value}
                        onClick={() => selectThemeMode(option.value)}
                      >
                        {option.label}
                      </MenuItemRadio>
                    ))}
                    <label className="theme-color-field">
                      <span>Background</span>
                      <input
                        aria-label="Section background"
                        className="theme-color-input"
                        type="color"
                        value={customBackground}
                        onInput={(event) => selectCustomBackground(event.currentTarget.value)}
                        onChange={(event) => selectCustomBackground(event.currentTarget.value)}
                      />
                    </label>
                  </MenuList>
                </MenuPopover>
              </Menu>
            </div>
          </div>

          <div className="preview-canvas">
            <div
              className={`preview-frame ${boundsVisible ? 'preview-frame--bounded' : ''}`}
              style={{ width: `min(${activeBreakpoint.width}px, calc(100% - 48px))` }}
            >
              {Preview ? (
                <Preview
                  props={activeProps}
                  updateProps={updateProps}
                  lab={{
                    breakpoint: activeBreakpoint,
                    theme,
                    spfxContext: context,
                    fixtures: selected.fixtures || {},
                    boundsVisible
                  }}
                />
              ) : (
                <div className="empty-preview">
                  <strong>No web parts registered</strong>
                  <span>Import an SPFx app or add a lab adapter.</span>
                </div>
              )}
            </div>
          </div>
        </section>

        <aside className={`options-panel ${panelCollapsed ? 'options-panel--collapsed' : ''}`} aria-label="Options panel">
          {!panelCollapsed && (
            <>
              <div className="lab-toolbar lab-toolbar--panel">
                <Dropdown
                  aria-label="Select web part"
                  className="webpart-select"
                  open={webPartPickerOpen}
                  selectedOptions={selected?.id ? [selected.id] : []}
                  size="small"
                  value={selected?.title || ''}
                  onActiveOptionChange={(_event, data) => {
                    activeWebPartOptionIdRef.current = data.nextOption?.value || selected?.id || '';
                  }}
                  onKeyDown={(event) => {
                    if (!webPartPickerOpen || !event.altKey || event.key.toLowerCase() !== 'p') {
                      return;
                    }
                    const activeWebPart = webParts.find((webPart) => webPart.id === activeWebPartOptionIdRef.current);
                    if (!activeWebPart) {
                      return;
                    }
                    event.preventDefault();
                    event.stopPropagation();
                    togglePinnedApp(activeWebPart);
                  }}
                  onOpenChange={(_event, data) => {
                    setWebPartPickerOpen(data.open);
                    if (data.open) {
                      activeWebPartOptionIdRef.current = selected?.id || '';
                    }
                  }}
                  onOptionSelect={(_event, data) => {
                    if (data.optionValue) {
                      setSelectedId(data.optionValue);
                    }
                  }}
                >
                  {webParts.map((webPart) => {
                    const appPinned = pinnedAppId === getLabAppId(webPart);
                    return (
                      <div
                        className={`webpart-option-row ${appPinned ? 'webpart-option-row--pinned' : ''}`}
                        key={webPart.id}
                        role="presentation"
                      >
                        <Option
                          aria-label={`${webPart.title}. ${appPinned ? 'Pinned' : 'Not pinned'}. Press Alt+P to ${
                            appPinned ? 'unpin' : 'pin'
                          }.`}
                          className="webpart-option"
                          text={webPart.title}
                          value={webPart.id}
                        >
                          <span className="webpart-option__label">{webPart.title}</span>
                        </Option>
                        <button
                          aria-label={`${appPinned ? 'Unpin' : 'Pin'} ${webPart.title} as startup app`}
                          aria-pressed={appPinned}
                          className="webpart-option__pin"
                          title={`${appPinned ? 'Unpin' : 'Pin'} ${webPart.title} as startup app`}
                          type="button"
                          onPointerDown={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            togglePinnedApp(webPart);
                          }}
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            if (event.detail === 0) {
                              togglePinnedApp(webPart);
                            }
                          }}
                        >
                          {appPinned ? <Pin16Filled aria-hidden="true" /> : <Pin16Regular aria-hidden="true" />}
                        </button>
                      </div>
                    );
                  })}
                </Dropdown>
                <span aria-live="polite" className="visually-hidden" role="status">
                  {pinAnnouncement}
                </span>
                <IconButton label="Manage apps" onClick={openManageApps}>
                  <Settings size={16} />
                </IconButton>
                <IconButton label="Collapse options panel" onClick={() => setPanelCollapsed(true)}>
                  <HugeiconsIcon className="huge-icon" icon={LayoutRightIcon} size={16} strokeWidth={1.7} aria-hidden="true" />
                </IconButton>
              </div>
              <PropertyPane webPart={selected} values={activeProps} onChange={updateProps} />
            </>
          )}
        </aside>

        {panelCollapsed && (
          <Button
            appearance="subtle"
            aria-label="Expand options panel"
            className="floating-panel-toggle"
            icon={<PanelRightOpen size={16} />}
            onClick={() => setPanelCollapsed(false)}
          />
        )}

        <ManageAppsDialog
          open={manageAppsOpen}
          onOpenChange={setManageAppsOpen}
          webPartsByAppId={webPartsByAppId}
          onOpenAddAppDrawer={openAddAppDrawer}
        />

        <AddAppDrawer open={addDrawerOpen} mode={addMode} onOpenChange={setAddDrawerOpen} onModeChange={setAddMode} />

        <ExportDrawer
          open={exportDrawerOpen}
          onOpenChange={setExportDrawerOpen}
          webParts={webParts}
          selected={selected}
          onSelectApp={setSelectedId}
        />
      </main>
    </FluentProvider>
  );
}

interface IconButtonProps {
  label: string;
  pressed?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

function IconButton(props: IconButtonProps): JSX.Element {
  return (
    <Button
      appearance={props.pressed ? 'secondary' : 'subtle'}
      aria-label={props.label}
      aria-pressed={props.pressed}
      className="icon-button"
      icon={props.children as React.ReactElement}
      size="small"
      title={props.label}
      onClick={props.onClick}
    />
  );
}

function groupWebPartsByAppId(webParts: LabWebPart[]): Map<string, LabWebPart[]> {
  const groups = new Map<string, LabWebPart[]>();
  for (const webPart of webParts) {
    const appId = getLabAppId(webPart);
    groups.set(appId, [...(groups.get(appId) || []), webPart]);
  }
  return groups;
}

function iconForBreakpoint(id: LabBreakpoint['id']): JSX.Element {
  switch (id) {
    case 'one-column':
      return <RectangleHorizontal size={20} />;
    case 'two-third':
      return <PanelRight size={20} />;
    case 'one-half':
      return <Columns2 size={20} />;
    case 'one-third':
      return <Columns3 size={20} />;
    case 'mobile':
      return <Smartphone size={20} />;
    default:
      return <Square size={20} />;
  }
}
