import * as React from 'react';
import {
  Button,
  Checkbox,
  Drawer,
  DrawerBody,
  DrawerFooter,
  DrawerHeader,
  DrawerHeaderTitle,
  Field,
  Input,
  Tab,
  TabList
} from '@fluentui/react-components';
import { Check, FolderInput, FolderPlus, PackagePlus, RefreshCw, X } from 'lucide-react';
import { labApiWriteHeaders, readApiJson, AddSpfxAppApiResult } from '../api/labApi';
import { isSlugInput, slugInputValue } from '../lib/text';

export type AddAppMode = 'import' | 'create';
type AddAppPhase = 'idle' | 'running' | 'complete' | 'error';

interface AddAppStatus {
  phase: AddAppPhase;
  message: string;
  detail?: string;
  appId?: string;
}

interface AddAppDrawerProps {
  open: boolean;
  mode: AddAppMode;
  onOpenChange: (open: boolean) => void;
  onModeChange: (mode: AddAppMode) => void;
}

export function AddAppDrawer(props: AddAppDrawerProps): JSX.Element {
  const { open, mode, onOpenChange, onModeChange } = props;
  const [importSource, setImportSource] = React.useState('');
  const [importName, setImportName] = React.useState('');
  const [importRef, setImportRef] = React.useState('');
  const [createName, setCreateName] = React.useState('');
  const [createTitle, setCreateTitle] = React.useState('');
  const [createWebPart, setCreateWebPart] = React.useState('');
  const [addForce, setAddForce] = React.useState(false);
  const [addingApp, setAddingApp] = React.useState(false);
  const [addStatus, setAddStatus] = React.useState<AddAppStatus>({ phase: 'idle', message: '' });

  React.useEffect(() => {
    if (open && !addingApp) {
      setAddStatus({ phase: 'idle', message: '' });
    }
    // Reset transient status whenever the drawer is (re)opened or the mode
    // changes while idle, matching the previous inline drawer behavior.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode]);

  const canSubmitAddApp = mode === 'import'
    ? Boolean(importSource.trim() && isSlugInput(importName.trim()) && !addingApp)
    : Boolean(isSlugInput(createName.trim()) && createTitle.trim() && createWebPart.trim() && !addingApp);
  const addActionLabel = mode === 'import' ? 'Import app' : 'Create app';

  const submitAddApp = async (): Promise<void> => {
    if (!canSubmitAddApp) {
      return;
    }

    const endpoint = mode === 'import' ? '/api/spfx-apps/import' : '/api/spfx-apps/create';
    const body = mode === 'import'
      ? {
          source: importSource.trim(),
          name: importName.trim(),
          ref: importRef.trim() || undefined,
          force: addForce
        }
      : {
          name: createName.trim(),
          title: createTitle.trim(),
          webpart: createWebPart.trim(),
          force: addForce
        };

    setAddingApp(true);
    setAddStatus({
      phase: 'running',
      message: mode === 'import' ? 'Importing SPFx app' : 'Creating SPFx app',
      detail: 'Running the local SPFx Kit tools.'
    });

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: labApiWriteHeaders,
        body: JSON.stringify(body)
      });
      const result = await readApiJson<AddSpfxAppApiResult>(response);
      setAddStatus({
        phase: 'complete',
        message: result.message,
        detail: `Synced ${result.syncedAdapters ?? 'the'} lab adapter${result.syncedAdapters === 1 ? '' : 's'}. Reload to pick up ${result.appId}.`,
        appId: result.appId
      });
    } catch (error) {
      setAddStatus({
        phase: 'error',
        message: 'SPFx app was not added',
        detail: error instanceof Error ? error.message : 'Unknown error.'
      });
    } finally {
      setAddingApp(false);
    }
  };

  return (
    <Drawer
      className="spfx-app-drawer"
      modalType="modal"
      onOpenChange={(_event, data) => onOpenChange(data.open)}
      open={open}
      position="start"
      size="medium"
      type="overlay"
    >
      <DrawerHeader>
        <DrawerHeaderTitle
          action={(
            <Button
              appearance="subtle"
              aria-label="Close add SPFx app drawer"
              icon={<X size={16} />}
              onClick={() => onOpenChange(false)}
            />
          )}
        >
          Add SPFx app
        </DrawerHeaderTitle>
      </DrawerHeader>
      <DrawerBody className="spfx-app-drawer__body">
        <p className="spfx-app-drawer__description">
          Bring an existing team SPFx project into the lab, or start a new managed SPFx app scaffold.
        </p>
        <TabList
          aria-label="Add SPFx app mode"
          className="spfx-app-drawer__tabs"
          selectedValue={mode}
          size="small"
          onTabSelect={(_event, data) => {
            onModeChange(data.value as AddAppMode);
            if (!addingApp) {
              setAddStatus({ phase: 'idle', message: '' });
            }
          }}
        >
          <Tab icon={<FolderInput size={14} />} value="import">
            Import
          </Tab>
          <Tab icon={<FolderPlus size={14} />} value="create">
            Create
          </Tab>
        </TabList>

        {mode === 'import' ? (
          <div className="spfx-app-drawer__form">
            <Field
              hint="Git URL or local path to an SPFx project."
              label="Source"
              required
              size="small"
            >
              <Input
                placeholder="https://github.com/team/app.git or /path/to/app"
                value={importSource}
                onChange={(event) => setImportSource(event.currentTarget.value)}
              />
            </Field>
            <div className="spfx-app-drawer__field-row">
              <Field
                hint="-spfx is added if omitted."
                label="App slug"
                required
                size="small"
              >
                <Input
                  placeholder="team-dashboard"
                  value={importName}
                  onChange={(event) => setImportName(slugInputValue(event.currentTarget.value))}
                />
              </Field>
              <Field
                hint="Branch, tag, or commit."
                label="Git ref"
                size="small"
              >
                <Input
                  placeholder="main"
                  value={importRef}
                  onChange={(event) => setImportRef(event.currentTarget.value)}
                />
              </Field>
            </div>
          </div>
        ) : (
          <div className="spfx-app-drawer__form">
            <Field
              hint="-spfx is added if omitted."
              label="App slug"
              required
              size="small"
            >
              <Input
                placeholder="team-dashboard"
                value={createName}
                onChange={(event) => setCreateName(slugInputValue(event.currentTarget.value))}
              />
            </Field>
            <Field label="App title" required size="small">
              <Input
                placeholder="Team Dashboard"
                value={createTitle}
                onChange={(event) => setCreateTitle(event.currentTarget.value)}
              />
            </Field>
            <Field
              hint="Used for the generated web part class name."
              label="Web part name"
              required
              size="small"
            >
              <Input
                placeholder="TeamDashboard"
                value={createWebPart}
                onChange={(event) => setCreateWebPart(event.currentTarget.value)}
              />
            </Field>
          </div>
        )}

        <Checkbox
          checked={addForce}
          className="spfx-app-drawer__force"
          label="Replace existing app with this slug"
          onChange={(_event, data) => setAddForce(data.checked === true)}
        />

        {addStatus.phase !== 'idle' && (
          <section
            aria-live={addStatus.phase === 'error' ? 'assertive' : 'polite'}
            className={`spfx-app-drawer__status spfx-app-drawer__status--${addStatus.phase}`}
            role={addStatus.phase === 'error' ? 'alert' : 'status'}
          >
            <span className={`spfx-app-drawer__status-icon spfx-app-drawer__status-icon--${addStatus.phase}`} aria-hidden="true">
              {addStatus.phase === 'complete' ? <Check size={13} /> : addStatus.phase === 'error' ? <X size={13} /> : <RefreshCw size={13} />}
            </span>
            <span>
              <strong>{addStatus.message}</strong>
              {addStatus.detail && <small>{addStatus.detail}</small>}
            </span>
          </section>
        )}
      </DrawerBody>
      <DrawerFooter className="spfx-app-drawer__footer">
        <Button appearance="secondary" disabled={addingApp} onClick={() => onOpenChange(false)}>
          {addStatus.phase === 'complete' ? 'Close' : 'Cancel'}
        </Button>
        {addStatus.phase === 'complete' ? (
          <Button appearance="primary" icon={<RefreshCw size={14} />} onClick={() => window.location.reload()}>
            Reload lab
          </Button>
        ) : (
          <Button
            appearance="primary"
            disabled={!canSubmitAddApp}
            icon={<PackagePlus size={14} />}
            onClick={() => void submitAddApp()}
          >
            {addingApp ? 'Adding...' : addActionLabel}
          </Button>
        )}
      </DrawerFooter>
    </Drawer>
  );
}
