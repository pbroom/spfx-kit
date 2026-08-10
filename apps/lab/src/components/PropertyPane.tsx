import * as React from 'react';
import {
  Combobox,
  ComboboxContent,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxList
} from '@spfx-kit/ui-profile/combobox';
import { Checkbox } from '@spfx-kit/ui-profile/checkbox';
import { Field, FieldDescription, FieldLabel } from '@spfx-kit/ui-profile/field';
import { Input } from '@spfx-kit/ui-profile/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@spfx-kit/ui-profile/select';
import { Textarea } from '@spfx-kit/ui-profile/textarea';
import { ToggleGroup, ToggleGroupItem } from '@spfx-kit/ui-profile/toggle-group';
import { useSpfxUiDerivedId, useSpfxUiId } from '@spfx-kit/ui-profile';
import { AlignCenter, AlignLeft, AlignRight } from 'lucide-react';
import {
  LabPropertyBag,
  LabPropertyControl,
  LabPropertyPaneRenderProps,
  LabSourceEditorControl,
  LabThemeMode,
  LabWebPart
} from '@spfx-kit/spfx-lab-runtime';
import {
  createDefaultCodeWorkbenchSource,
  createSpfxBridge,
  deserializeCodeWorkbenchSource,
  serializeCodeWorkbenchSource
} from '@spfx-kit/code-workbench-runtime';
import { createMockSpfxContext } from '@spfx-kit/spfx-lab-runtime';
import { CssEditor } from './CssEditor';
import { ColorField } from './ColorField';
import { resolveSelectControlState } from './propertyPaneSelectState';
import { SourceEditor } from './SourceEditor';
import { SourceWorkspace } from './SourceWorkspace';
import type { SourceWorkspaceDocument } from './SourceWorkspace';

const LazyCodeWorkspaceEditor = React.lazy(async () => {
  const codeWorkspace = await import('./CodeWorkspaceEditor');
  const modules = codeWorkspace.createApprovedCodeWorkspaceModules();
  return {
    default: (props: Omit<React.ComponentProps<typeof codeWorkspace.CodeWorkspaceEditor>, 'modules'>) => (
      <codeWorkspace.CodeWorkspaceEditor {...props} modules={modules} />
    )
  };
});
const codeWorkbenchMockSpfx = createSpfxBridge(createMockSpfxContext());
// Keep in sync with the monaco-editor version pinned in apps/lab/package.json.
const labMonacoBaseUrl = 'https://cdn.jsdelivr.net/npm/monaco-editor@0.53.0/min/vs';

interface PropertyPaneProps {
  themeMode: LabThemeMode;
  webPart?: LabWebPart;
  values: LabPropertyBag;
  onChange: (patch: LabPropertyBag) => void;
}

export function PropertyPane(props: PropertyPaneProps): JSX.Element {
  const renderControl = (control: LabPropertyControl): JSX.Element => {
    const value = control.getValue ? control.getValue(props.values) : props.values[control.name];
    const onChange = (nextValue: LabPropertyBag[string]): void => {
      props.onChange(control.getPatch ? control.getPatch(nextValue, props.values) : { [control.name]: nextValue });
    };

    return (
      <ControlRenderer
        control={control}
        key={control.name}
        values={props.values}
        value={value}
        onChange={onChange}
        onPatch={props.onChange}
      />
    );
  };

  const CustomPropertyPane = props.webPart?.propertyPane as React.ComponentType<LabPropertyPaneRenderProps> | undefined;

  return (
    <div className="property-pane">
      <section className="property-section">
        {!CustomPropertyPane && <h2>{props.webPart ? props.webPart.title : 'Property pane'}</h2>}
        {CustomPropertyPane && props.webPart ? (
          <CustomPropertyPane
            title={props.webPart.title}
            values={props.values}
            onChange={props.onChange}
            renderControl={renderControl}
          />
        ) : props.webPart ? (
          renderControlRows(props.webPart.controls, renderControl)
        ) : (
          <p className="property-empty">No web part selected.</p>
        )}
      </section>
    </div>
  );
}

function renderControlRows(
  controls: LabPropertyControl[],
  renderControl: (control: LabPropertyControl) => JSX.Element
): JSX.Element[] {
  const rows: JSX.Element[] = [];

  for (let index = 0; index < controls.length; index += 1) {
    const control = controls[index];

    if (control.inlineGroup) {
      const group = [control];
      let nextIndex = index + 1;

      while (nextIndex < controls.length && controls[nextIndex].inlineGroup === control.inlineGroup) {
        group.push(controls[nextIndex]);
        nextIndex += 1;
      }

      if (group.length > 1) {
        rows.push(
          <div className="property-field-row" key={`inline-${control.inlineGroup}`}>
            {group.map(renderControl)}
          </div>
        );
        index = nextIndex - 1;
        continue;
      }
    }

    rows.push(renderControl(control));
  }

  return rows;
}

interface ControlRendererProps {
  control: LabPropertyControl;
  values: LabPropertyBag;
  value: LabPropertyBag[string];
  onChange: (value: LabPropertyBag[string]) => void;
  onPatch: (patch: LabPropertyBag) => void;
}

function ControlRenderer({ control, values, value, onChange, onPatch }: ControlRendererProps): JSX.Element {
  const controlId = useSpfxUiId(`property-control:${control.name}`);
  const contentId = useSpfxUiDerivedId(controlId, 'content');

  if (control.type === 'codeWorkspace') {
    const source = deserializeCodeWorkbenchSource(
      typeof value === 'string' ? value : undefined,
      createDefaultCodeWorkbenchSource()
    );
    return (
      <LabField controlId={controlId} description={control.description} label={control.label}>
        <React.Suspense fallback={<p className="property-field__loading">Loading editor…</p>}>
          <LazyCodeWorkspaceEditor
            source={source}
            spfx={codeWorkbenchMockSpfx}
            updatedAt={source.updatedAt}
            updatedBy={source.updatedBy}
            monacoBaseUrl={labMonacoBaseUrl}
            onSourceChange={(nextSource) => {
              const serialized = serializeCodeWorkbenchSource(nextSource);
              onChange(serialized.blocked ? value : serialized.value);
            }}
          />
        </React.Suspense>
      </LabField>
    );
  }

  if (control.type === 'toggle') {
    return (
      <Field className="property-field property-field--inline" orientation="horizontal">
        <FieldLabel htmlFor={controlId}>{control.label}</FieldLabel>
        <Checkbox id={controlId} checked={Boolean(value)} onCheckedChange={(checked) => onChange(Boolean(checked))} />
      </Field>
    );
  }

  if (control.type === 'cssEditor') {
    return (
      <div className="property-field">
        <CssEditor
          description={control.description}
          label={control.label}
          minHeight={control.minHeight}
          monacoBaseUrl={labMonacoBaseUrl}
          placeholder={control.placeholder}
          targetComment={control.getTargetComment ? control.getTargetComment(values) : control.targetComment}
          targets={control.getTargets ? control.getTargets(values) : control.targets}
          value={String(value ?? '')}
          onChange={onChange}
          onTargetRename={(target, nextSelector, nextValue) => {
            onPatch(
              control.getTargetRenamePatch
                ? control.getTargetRenamePatch(target, nextSelector, nextValue, values)
                : { [control.name]: nextValue }
            );
          }}
        />
      </div>
    );
  }

  if (control.type === 'sourceEditor') {
    const targets = control.language === 'scss' ? (control.getTargets ? control.getTargets(values) : control.targets) : undefined;
    const targetComment =
      control.language === 'scss'
        ? control.getTargetComment
          ? control.getTargetComment(values)
          : control.targetComment
        : undefined;

    return (
      <div className="property-field">
        <SourceEditor
          commitMode={control.commitMode}
          description={control.description}
          height={control.height}
          label={control.label}
          language={control.language}
          maxBytes={control.maxBytes}
          minHeight={control.minHeight}
          monacoBaseUrl={labMonacoBaseUrl}
          placeholder={control.placeholder}
          snippets={control.snippets}
          targetComment={targetComment}
          targets={targets}
          validate={control.validate ? (source) => control.validate?.(source, values) || [] : undefined}
          value={String(value ?? '')}
          onChange={onChange}
          onTargetRename={
            control.language === 'scss'
              ? (target, nextSelector, nextValue) => {
                  onPatch(
                    control.getTargetRenamePatch
                      ? control.getTargetRenamePatch(target, nextSelector, nextValue, values)
                      : { [control.name]: nextValue }
                  );
                }
              : undefined
          }
        />
      </div>
    );
  }

  if (control.type === 'sourceWorkspace') {
    const documents = control.documents.map((document): SourceWorkspaceDocument =>
      resolveSourceWorkspaceDocument(document, values, onPatch)
    );
    return (
      <div className="property-field">
        <SourceWorkspace
          defaultView={control.defaultView}
          description={control.description}
          documents={documents}
          instanceId={`lab-source-workspace-${control.name}`}
          label={control.label}
        />
      </div>
    );
  }

  if (control.type === 'textarea') {
    return (
      <LabField controlId={controlId} label={control.label}>
        <Textarea
          id={controlId}
          placeholder={control.placeholder}
          rows={3}
          value={String(value ?? '')}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
      </LabField>
    );
  }

  if (control.type === 'number') {
    const unit = control.getUnit ? control.getUnit(values) : control.unit;
    return (
      <LabField controlId={controlId} label={control.label}>
        <div className="property-number-input">
          <Input
            aria-label={unit ? `${control.label} (${unit})` : control.label}
            id={controlId}
            type="number"
            min={control.min}
            max={control.max}
            step={control.step}
            value={value === undefined ? '' : String(value)}
            onChange={(event) => {
              const rawValue = event.currentTarget.value;
              onChange(rawValue === '' ? undefined : Number(rawValue));
            }}
          />
          {unit ? <span className="property-number-unit">{unit}</span> : null}
        </div>
      </LabField>
    );
  }

  if (control.type === 'select') {
    const options = control.getOptions ? control.getOptions(values) : control.options;
    const { selectedOption, selectedOptions, selectedValue } = resolveSelectControlState(value, options);

    return (
      <LabField controlId={controlId} label={control.label}>
        <Select
          id={controlId}
          items={options}
          value={selectedOptions[0] || null}
          onValueChange={(nextValue) => {
            if (nextValue !== null) onChange(String(nextValue));
          }}
        >
          <SelectTrigger aria-label={control.label} className="property-select">
            <SelectValue>{selectedOption?.label || selectedValue}</SelectValue>
          </SelectTrigger>
          <SelectContent id={contentId} align="start">
            <SelectGroup>
              {options.map((option) => (
                <SelectItem value={option.value} key={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </LabField>
    );
  }

  if (control.type === 'combobox') {
    return (
      <LabField controlId={controlId} label={control.label}>
        <ComboboxPropertyControl
          contentId={contentId}
          controlId={controlId}
          label={control.label}
          maxVisibleOptions={control.maxVisibleOptions}
          options={control.options}
          placeholder={control.placeholder}
          value={String(value ?? '')}
          onChange={onChange}
        />
      </LabField>
    );
  }

  if (control.type === 'radio') {
    const selectedValue = String(value ?? '');

    return (
      <LabField controlId={controlId} label={control.label}>
        <ToggleGroup
          aria-label={control.label}
          className="property-radio-toolbar__group"
          size="sm"
          spacing={2}
          value={selectedValue ? [selectedValue] : []}
          variant="outline"
          onValueChange={(nextValues) => {
            const nextValue = nextValues[0];
            if (nextValue) onChange(nextValue);
          }}
        >
          {control.options.map((option) => (
            <ToggleGroupItem aria-label={option.label} key={option.value} title={option.label} value={option.value}>
              {getPropertyControlIcon(option.icon) || option.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </LabField>
    );
  }

  if (control.type === 'color') {
    return <ColorField controlId={controlId} label={control.label} value={String(value ?? '')} onChange={onChange} />;
  }

  return (
    <LabField controlId={controlId} label={control.label}>
      <Input
        id={controlId}
        type="text"
        value={String(value ?? '')}
        placeholder={control.placeholder}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </LabField>
  );
}

interface LabFieldProps {
  children: React.ReactNode;
  controlId: string;
  description?: string;
  label: string;
}

function LabField({ children, controlId, description, label }: LabFieldProps): JSX.Element {
  return (
    <Field className="property-field">
      <FieldLabel htmlFor={controlId}>{label}</FieldLabel>
      {children}
      {description ? <FieldDescription>{description}</FieldDescription> : null}
    </Field>
  );
}

function resolveSourceWorkspaceDocument(
  control: LabSourceEditorControl,
  values: LabPropertyBag,
  onPatch: (patch: LabPropertyBag) => void
): SourceWorkspaceDocument {
  const value = control.getValue ? control.getValue(values) : values[control.name];
  const targets = control.language === 'scss' ? (control.getTargets ? control.getTargets(values) : control.targets) : undefined;
  const targetComment =
    control.language === 'scss'
      ? control.getTargetComment
        ? control.getTargetComment(values)
        : control.targetComment
      : undefined;
  const updateValue = (nextValue: string): void => {
    onPatch(control.getPatch ? control.getPatch(nextValue, values) : { [control.name]: nextValue });
  };

  return {
    commitMode: control.commitMode,
    description: control.description,
    height: control.height || control.minHeight,
    id: control.name,
    label: control.label,
    language: control.language,
    maxBytes: control.maxBytes,
    placeholder: control.placeholder,
    snippets: control.snippets,
    targetComment,
    targets,
    validate: control.validate ? (source) => control.validate?.(source, values) || [] : undefined,
    value: String(value ?? ''),
    onChange: updateValue,
    onTargetRename:
      control.language === 'scss'
        ? (target, nextSelector, nextValue) => {
            onPatch(
              control.getTargetRenamePatch
                ? control.getTargetRenamePatch(target, nextSelector, nextValue, values)
                : { [control.name]: nextValue }
            );
          }
        : undefined
  };
}

function getPropertyControlIcon(icon: string | undefined): JSX.Element | undefined {
  if (icon === 'text-align-left') {
    return <AlignLeft aria-hidden="true" data-icon="inline-start" />;
  }
  if (icon === 'text-align-center') {
    return <AlignCenter aria-hidden="true" data-icon="inline-start" />;
  }
  if (icon === 'text-align-right') {
    return <AlignRight aria-hidden="true" data-icon="inline-start" />;
  }

  return undefined;
}

interface ComboboxPropertyControlProps {
  contentId: string;
  controlId: string;
  label: string;
  maxVisibleOptions?: number;
  options: Array<{ label: string; value: string }>;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
}

function ComboboxPropertyControl(props: ComboboxPropertyControlProps): JSX.Element {
  const [query, setQuery] = React.useState<string | undefined>(undefined);
  const limit = props.maxVisibleOptions ?? 50;
  const selectedOption = props.options.find((option) => option.value === props.value);
  const displayValue = query !== undefined ? query : selectedOption?.label || props.value;
  const items = React.useMemo(() => props.options.map((option) => option.value), [props.options]);
  const labelsByValue = React.useMemo(
    () => new Map(props.options.map((option) => [option.value, option.label])),
    [props.options]
  );
  const visibleOptions = React.useMemo(() => {
    const normalized = (query || '').trim().toLowerCase();
    if (!normalized) {
      return props.options.slice(0, limit);
    }
    return props.options.filter((option) => option.label.toLowerCase().includes(normalized)).slice(0, limit);
  }, [limit, props.options, query]);

  return (
    <Combobox
      id={props.controlId}
      aria-label={props.label}
      inputValue={displayValue}
      items={items}
      itemToStringLabel={(itemValue) => labelsByValue.get(itemValue) ?? itemValue}
      value={props.value || null}
      onInputValueChange={(nextQuery) => setQuery(nextQuery)}
      onOpenChange={(open) => {
        if (!open) setQuery(undefined);
      }}
      onValueChange={(nextValue) => {
        setQuery(undefined);
        if (nextValue !== null) props.onChange(String(nextValue));
      }}
    >
      <ComboboxInput aria-label={props.label} placeholder={props.placeholder} showClear={Boolean(query)} />
      <ComboboxContent id={props.contentId}>
        <ComboboxList>
          <ComboboxGroup>
            {visibleOptions.map((option) => (
              <ComboboxItem key={option.value || '__empty__'} value={option.value}>
                {option.label}
              </ComboboxItem>
            ))}
          </ComboboxGroup>
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
