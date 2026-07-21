import * as React from 'react';
import {
  Button,
  Checkbox,
  ColorArea,
  ColorPicker,
  ColorSlider,
  Combobox,
  Dropdown,
  Field,
  Input,
  Option,
  Popover,
  PopoverSurface,
  PopoverTrigger,
  Textarea,
  Toolbar,
  ToolbarRadioButton,
  ToolbarRadioGroup
} from '@fluentui/react-components';
import { TextAlignCenterRegular, TextAlignLeftRegular, TextAlignRightRegular } from '@fluentui/react-icons';
import {
  LabPropertyBag,
  LabPropertyControl,
  LabPropertyPaneRenderProps,
  LabSourceEditorControl,
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
  if (control.type === 'codeWorkspace') {
    const source = deserializeCodeWorkbenchSource(
      typeof value === 'string' ? value : undefined,
      createDefaultCodeWorkbenchSource()
    );
    return (
      <Field className="property-field" hint={control.description} label={control.label} size="small">
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
      </Field>
    );
  }

  if (control.type === 'toggle') {
    return (
      <Checkbox
        checked={Boolean(value)}
        className="property-field property-field--inline"
        label={control.label}
        onChange={(_event, data) => onChange(Boolean(data.checked))}
      />
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
          label={control.label}
        />
      </div>
    );
  }

  if (control.type === 'textarea') {
    return (
      <Field className="property-field" label={control.label} size="small">
        <Textarea
          placeholder={control.placeholder}
          resize="vertical"
          rows={3}
          value={String(value ?? '')}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
      </Field>
    );
  }

  if (control.type === 'number') {
    const unit = control.getUnit ? control.getUnit(values) : control.unit;
    return (
      <Field className="property-field" label={control.label} size="small">
        <Input
          aria-label={unit ? `${control.label} (${unit})` : control.label}
          contentAfter={unit ? <span className="property-number-unit">{unit}</span> : undefined}
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
      </Field>
    );
  }

  if (control.type === 'select') {
    const options = control.getOptions ? control.getOptions(values) : control.options;
    const { selectedOption, selectedOptions, selectedValue } = resolveSelectControlState(value, options);

    return (
      <Field className="property-field" label={control.label} size="small">
        <Dropdown
          aria-label={control.label}
          selectedOptions={selectedOptions}
          value={selectedOption?.label || selectedValue}
          onOptionSelect={(_event, data) => {
            if (data.optionValue !== undefined) {
              onChange(data.optionValue);
            }
          }}
        >
          {options.map((option) => (
            <Option value={option.value} key={option.value}>
              {option.label}
            </Option>
          ))}
        </Dropdown>
      </Field>
    );
  }

  if (control.type === 'combobox') {
    return (
      <Field className="property-field" label={control.label} size="small">
        <ComboboxPropertyControl
          label={control.label}
          maxVisibleOptions={control.maxVisibleOptions}
          options={control.options}
          placeholder={control.placeholder}
          value={String(value ?? '')}
          onChange={onChange}
        />
      </Field>
    );
  }

  if (control.type === 'radio') {
    const selectedValue = String(value ?? '');

    return (
      <Field className="property-field" label={control.label} size="small">
        <Toolbar
          aria-label={control.label}
          checkedValues={{ [control.name]: selectedValue ? [selectedValue] : [] }}
          className="property-radio-toolbar"
          size="small"
          onCheckedValueChange={(_event, data) => {
            const [nextValue] = data.checkedItems;
            if (nextValue) {
              onChange(nextValue);
            }
          }}
        >
          <ToolbarRadioGroup className="property-radio-toolbar__group">
            {control.options.map((option) => (
              <ToolbarRadioButton
                aria-label={option.label}
                icon={getPropertyControlIcon(option.icon)}
                key={option.value}
                name={control.name}
                title={option.label}
                value={option.value}
              >
                {option.icon ? undefined : option.label}
              </ToolbarRadioButton>
            ))}
          </ToolbarRadioGroup>
        </Toolbar>
      </Field>
    );
  }

  if (control.type === 'color') {
    const colorValue = normalizeHexColor(String(value ?? ''));

    return (
      <Field className="property-field" label={control.label} size="small">
        <ColorPropertyControl label={control.label} value={colorValue} onChange={onChange} />
      </Field>
    );
  }

  return (
    <Field className="property-field" label={control.label} size="small">
      <Input
        type="text"
        value={String(value ?? '')}
        placeholder={control.placeholder}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
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
    return <TextAlignLeftRegular />;
  }
  if (icon === 'text-align-center') {
    return <TextAlignCenterRegular />;
  }
  if (icon === 'text-align-right') {
    return <TextAlignRightRegular />;
  }

  return undefined;
}

interface ComboboxPropertyControlProps {
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
  const visibleOptions = React.useMemo(() => {
    const normalized = (query || '').trim().toLowerCase();
    if (!normalized) {
      return props.options.slice(0, limit);
    }
    return props.options.filter((option) => option.label.toLowerCase().includes(normalized)).slice(0, limit);
  }, [limit, props.options, query]);

  return (
    <Combobox
      aria-label={props.label}
      placeholder={props.placeholder}
      selectedOptions={props.value ? [props.value] : ['']}
      value={displayValue}
      onBlur={() => setQuery(undefined)}
      onChange={(event) => setQuery(event.currentTarget.value)}
      onOptionSelect={(_event, data) => {
        setQuery(undefined);
        if (data.optionValue !== undefined) {
          props.onChange(data.optionValue);
        }
      }}
    >
      {visibleOptions.map((option) => (
        <Option key={option.value || '__empty__'} text={option.label} value={option.value}>
          {option.label}
        </Option>
      ))}
    </Combobox>
  );
}

interface ColorPropertyControlProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

function ColorPropertyControl({ label, value, onChange }: ColorPropertyControlProps): JSX.Element {
  const [isOpen, setIsOpen] = React.useState(false);
  const hsvColor = hexToHsv(value);
  const hslColor = hexToHsl(value);
  const onHslChange = (channel: keyof HslColor, nextValue: string): void => {
    const parsedValue = Number(nextValue);

    if (!Number.isFinite(parsedValue)) {
      return;
    }

    onChange(
      hslToHex({
        ...hslColor,
        [channel]: channel === 'h' ? clampHue(parsedValue) : clampPercentage(parsedValue)
      })
    );
  };

  return (
    <div className="property-color-picker">
      <div className="property-color-picker__footer">
        <Popover
          open={isOpen}
          positioning={{ position: 'below', align: 'start' }}
          withArrow
          onOpenChange={(_event, data) => setIsOpen(data.open)}
        >
          <PopoverTrigger disableButtonEnhancement>
            <Button
              appearance="outline"
              aria-label={`Open ${label} color picker`}
              className="property-color-picker__swatch-button"
              onClick={() => setIsOpen((currentValue) => !currentValue)}
            >
              <span aria-hidden="true" className="property-color-picker__swatch" style={{ backgroundColor: value }} />
            </Button>
          </PopoverTrigger>
          <PopoverSurface className="property-color-picker__popover">
            <ColorPicker color={hsvColor} onColorChange={(_event, data) => onChange(hsvToHex(data.color))}>
              <ColorArea aria-label={`${label} saturation and brightness`} />
              <ColorSlider aria-label={`${label} hue`} />
              <div className="property-color-picker__hsl" aria-label={`${label} HSL values`}>
                <label className="property-color-picker__hsl-field">
                  <span>H</span>
                  <Input
                    aria-label={`${label} HSL hue`}
                    max={360}
                    min={0}
                    step={1}
                    type="number"
                    value={String(hslColor.h)}
                    onChange={(event) => onHslChange('h', event.currentTarget.value)}
                  />
                </label>
                <label className="property-color-picker__hsl-field">
                  <span>S</span>
                  <Input
                    aria-label={`${label} HSL saturation`}
                    contentAfter={<span className="property-number-unit">%</span>}
                    max={100}
                    min={0}
                    step={1}
                    type="number"
                    value={String(hslColor.s)}
                    onChange={(event) => onHslChange('s', event.currentTarget.value)}
                  />
                </label>
                <label className="property-color-picker__hsl-field">
                  <span>L</span>
                  <Input
                    aria-label={`${label} HSL lightness`}
                    contentAfter={<span className="property-number-unit">%</span>}
                    max={100}
                    min={0}
                    step={1}
                    type="number"
                    value={String(hslColor.l)}
                    onChange={(event) => onHslChange('l', event.currentTarget.value)}
                  />
                </label>
              </div>
            </ColorPicker>
          </PopoverSurface>
        </Popover>
        <Input
          aria-label={`${label} hex value`}
          className="property-color-picker__hex"
          value={value}
          onChange={(event) => onChange(normalizeHexColor(event.currentTarget.value))}
        />
      </div>
    </div>
  );
}

interface HsvColor {
  h: number;
  s: number;
  v: number;
  a?: number;
}

interface HslColor {
  h: number;
  s: number;
  l: number;
}

function normalizeHexColor(value: string): string {
  const trimmed = value.trim();

  if (/^#[0-9a-f]{6}$/i.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  if (/^#[0-9a-f]{3}$/i.test(trimmed)) {
    const [, r, g, b] = trimmed.toLowerCase();
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  if (/^[0-9a-f]{6}$/i.test(trimmed)) {
    return `#${trimmed.toLowerCase()}`;
  }
  if (/^[0-9a-f]{3}$/i.test(trimmed)) {
    const [r, g, b] = trimmed.toLowerCase();
    return `#${r}${r}${g}${g}${b}${b}`;
  }

  return '#8a8886';
}

function hexToHsv(hex: string): HsvColor {
  const normalized = normalizeHexColor(hex);
  const red = parseInt(normalized.slice(1, 3), 16) / 255;
  const green = parseInt(normalized.slice(3, 5), 16) / 255;
  const blue = parseInt(normalized.slice(5, 7), 16) / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  let hue = 0;

  if (delta !== 0) {
    if (max === red) {
      hue = 60 * (((green - blue) / delta) % 6);
    } else if (max === green) {
      hue = 60 * ((blue - red) / delta + 2);
    } else {
      hue = 60 * ((red - green) / delta + 4);
    }
  }

  return {
    h: Math.round(hue < 0 ? hue + 360 : hue),
    s: max === 0 ? 0 : delta / max,
    v: max,
    a: 1
  };
}

function hexToHsl(hex: string): HslColor {
  const normalized = normalizeHexColor(hex);
  const red = parseInt(normalized.slice(1, 3), 16) / 255;
  const green = parseInt(normalized.slice(3, 5), 16) / 255;
  const blue = parseInt(normalized.slice(5, 7), 16) / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  const lightness = (max + min) / 2;
  let hue = 0;
  let saturation = 0;

  if (delta !== 0) {
    saturation = delta / (1 - Math.abs(2 * lightness - 1));

    if (max === red) {
      hue = 60 * (((green - blue) / delta) % 6);
    } else if (max === green) {
      hue = 60 * ((blue - red) / delta + 2);
    } else {
      hue = 60 * ((red - green) / delta + 4);
    }
  }

  return {
    h: clampHue(hue < 0 ? hue + 360 : hue),
    s: clampPercentage(saturation * 100),
    l: clampPercentage(lightness * 100)
  };
}

function hslToHex(color: HslColor): string {
  const hue = clampHue(color.h) / 360;
  const saturation = clampPercentage(color.s) / 100;
  const lightness = clampPercentage(color.l) / 100;

  if (saturation === 0) {
    return `#${toHexChannel(lightness)}${toHexChannel(lightness)}${toHexChannel(lightness)}`;
  }

  const q = lightness < 0.5 ? lightness * (1 + saturation) : lightness + saturation - lightness * saturation;
  const p = 2 * lightness - q;

  return `#${toHexChannel(hueToRgb(p, q, hue + 1 / 3))}${toHexChannel(hueToRgb(p, q, hue))}${toHexChannel(hueToRgb(p, q, hue - 1 / 3))}`;
}

function hsvToHex(color: HsvColor): string {
  const hue = (((color.h || 0) % 360) + 360) % 360;
  const saturation = clampUnit(color.s);
  const value = clampUnit(color.v);
  const chroma = value * saturation;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = value - chroma;
  let red = 0;
  let green = 0;
  let blue = 0;

  if (hue < 60) {
    red = chroma;
    green = x;
  } else if (hue < 120) {
    red = x;
    green = chroma;
  } else if (hue < 180) {
    green = chroma;
    blue = x;
  } else if (hue < 240) {
    green = x;
    blue = chroma;
  } else if (hue < 300) {
    red = x;
    blue = chroma;
  } else {
    red = chroma;
    blue = x;
  }

  return `#${toHexChannel(red + m)}${toHexChannel(green + m)}${toHexChannel(blue + m)}`;
}

function clampUnit(value: number | undefined): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.min(Math.max(parsed, 0), 1);
}

function clampHue(value: number): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.min(Math.max(Math.round(parsed), 0), 360);
}

function clampPercentage(value: number): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.min(Math.max(Math.round(parsed), 0), 100);
}

function hueToRgb(p: number, q: number, value: number): number {
  let normalizedValue = value;

  if (normalizedValue < 0) {
    normalizedValue += 1;
  }
  if (normalizedValue > 1) {
    normalizedValue -= 1;
  }
  if (normalizedValue < 1 / 6) {
    return p + (q - p) * 6 * normalizedValue;
  }
  if (normalizedValue < 1 / 2) {
    return q;
  }
  if (normalizedValue < 2 / 3) {
    return p + (q - p) * (2 / 3 - normalizedValue) * 6;
  }

  return p;
}

function toHexChannel(value: number): string {
  return Math.round(Math.min(Math.max(value, 0), 1) * 255)
    .toString(16)
    .padStart(2, '0');
}
