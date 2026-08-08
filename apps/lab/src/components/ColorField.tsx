import * as React from 'react';
import { Button } from '../../../../packages/ui-profile/normalized/src/components/ui/button';
import { Field, FieldLabel } from '../../../../packages/ui-profile/normalized/src/components/ui/field';
import { Input } from '../../../../packages/ui-profile/normalized/src/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger
} from '../../../../packages/ui-profile/normalized/src/components/ui/popover';
import { useSpfxUiDerivedId, useSpfxUiHost } from '../../../../packages/ui-profile/normalized/src/lib/ui-root';
import {
  clampPercentage,
  clampUnit,
  hexToHsl,
  hexToHsv,
  hslToHex,
  hsvToHex,
  normalizeHexColor,
  normalizeHue,
  parseHexColor,
  type HslColor,
  type HsvColor
} from './colorFieldMath';

export interface ColorFieldProps {
  controlId: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}

interface PointerDrag {
  area: HTMLDivElement;
  pointerId: number;
  ownerWindow: Window;
  move: (event: PointerEvent) => void;
  finish: (event: PointerEvent) => void;
}

export function ColorField({ controlId, label, value, onChange }: ColorFieldProps): JSX.Element {
  const { targetDocument, targetWindow } = useSpfxUiHost();
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const pointerDragRef = React.useRef<PointerDrag | null>(null);
  const [isOpen, setIsOpen] = React.useState(false);
  const normalizedValue = normalizeHexColor(value);
  const [hexDraft, setHexDraft] = React.useState(normalizedValue);
  const parsedDraft = parseHexColor(hexDraft);
  const isHexInvalid = parsedDraft === null;
  const hsvColor = hexToHsv(normalizedValue);
  const hslColor = hexToHsl(normalizedValue);
  const fieldId = useSpfxUiDerivedId(controlId, 'color-field');
  const hexId = useSpfxUiDerivedId(fieldId, 'hex');
  const triggerId = useSpfxUiDerivedId(fieldId, 'trigger');
  const popoverId = useSpfxUiDerivedId(fieldId, 'popover');
  const saturationValueId = useSpfxUiDerivedId(fieldId, 'saturation-value');
  const hueFieldId = useSpfxUiDerivedId(fieldId, 'hue-field');
  const hueId = useSpfxUiDerivedId(fieldId, 'hue');
  const hslGroupId = useSpfxUiDerivedId(fieldId, 'hsl-group');
  const hslHueFieldId = useSpfxUiDerivedId(fieldId, 'hsl-h-field');
  const hslSaturationFieldId = useSpfxUiDerivedId(fieldId, 'hsl-s-field');
  const hslLightnessFieldId = useSpfxUiDerivedId(fieldId, 'hsl-l-field');
  const hslHueId = useSpfxUiDerivedId(fieldId, 'hsl-h');
  const hslSaturationId = useSpfxUiDerivedId(fieldId, 'hsl-s');
  const hslLightnessId = useSpfxUiDerivedId(fieldId, 'hsl-l');
  const hslIds: Record<keyof HslColor, string> = {
    h: hslHueId,
    s: hslSaturationId,
    l: hslLightnessId
  };
  const hslFieldIds: Record<keyof HslColor, string> = {
    h: hslHueFieldId,
    s: hslSaturationFieldId,
    l: hslLightnessFieldId
  };

  React.useEffect(() => {
    setHexDraft(normalizedValue);
  }, [normalizedValue]);

  const stopPointerDrag = React.useCallback((event?: PointerEvent): void => {
    const drag = pointerDragRef.current;
    if (!drag) return;

    drag.ownerWindow.removeEventListener('pointermove', drag.move);
    drag.ownerWindow.removeEventListener('pointerup', drag.finish);
    drag.ownerWindow.removeEventListener('pointercancel', drag.finish);
    if (drag.area.hasPointerCapture?.(drag.pointerId)) {
      drag.area.releasePointerCapture(drag.pointerId);
    }
    pointerDragRef.current = null;
    event?.preventDefault();
  }, []);

  React.useEffect(() => () => stopPointerDrag(), [stopPointerDrag]);

  const emitHsv = React.useCallback((nextColor: HsvColor): void => onChange(hsvToHex(nextColor)), [onChange]);

  const updateSaturationValue = React.useCallback(
    (area: HTMLDivElement, clientX: number, clientY: number): void => {
      const bounds = area.getBoundingClientRect();
      const width = Math.max(bounds.width, 1);
      const height = Math.max(bounds.height, 1);
      emitHsv({
        h: hsvColor.h,
        s: clampUnit((clientX - bounds.left) / width),
        v: clampUnit(1 - (clientY - bounds.top) / height)
      });
    },
    [emitHsv, hsvColor.h]
  );

  const beginPointerDrag = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return;
    stopPointerDrag();

    const area = event.currentTarget;
    const ownerWindow = area.ownerDocument.defaultView;
    if (!ownerWindow || area.ownerDocument !== targetDocument || ownerWindow !== targetWindow) return;

    const move = (nextEvent: PointerEvent): void => {
      if (nextEvent.pointerId !== event.pointerId) return;
      updateSaturationValue(area, nextEvent.clientX, nextEvent.clientY);
      nextEvent.preventDefault();
    };
    const finish = (nextEvent: PointerEvent): void => {
      if (nextEvent.pointerId === event.pointerId) stopPointerDrag(nextEvent);
    };

    area.setPointerCapture?.(event.pointerId);
    pointerDragRef.current = { area, pointerId: event.pointerId, ownerWindow, move, finish };
    ownerWindow.addEventListener('pointermove', move);
    ownerWindow.addEventListener('pointerup', finish);
    ownerWindow.addEventListener('pointercancel', finish);
    updateSaturationValue(area, event.clientX, event.clientY);
    event.preventDefault();
    area.focus();
  };

  const onAreaKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    const step = event.shiftKey ? 0.1 : 0.01;
    let saturation = hsvColor.s;
    let colorValue = hsvColor.v;

    if (event.key === 'ArrowLeft') saturation -= step;
    else if (event.key === 'ArrowRight') saturation += step;
    else if (event.key === 'ArrowDown') colorValue -= step;
    else if (event.key === 'ArrowUp') colorValue += step;
    else return;

    event.preventDefault();
    emitHsv({ h: hsvColor.h, s: clampUnit(saturation), v: clampUnit(colorValue) });
  };

  const onHueKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    const step = event.shiftKey ? 10 : 1;
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowDown' && event.key !== 'ArrowRight' && event.key !== 'ArrowUp') {
      return;
    }

    event.preventDefault();
    const direction = event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -1 : 1;
    emitHsv({ ...hsvColor, h: normalizeHue(hsvColor.h + direction * step) });
  };

  const onHslChange = (channel: keyof HslColor, nextValue: string): void => {
    const parsedValue = Number(nextValue);
    if (!Number.isFinite(parsedValue)) return;

    onChange(
      hslToHex({
        ...hslColor,
        [channel]: channel === 'h' ? normalizeHue(parsedValue) : clampPercentage(parsedValue)
      })
    );
  };

  const restoreHexDraft = (): void => setHexDraft(normalizedValue);

  return (
    <Field className="property-field" data-invalid={isHexInvalid || undefined} id={fieldId}>
      <FieldLabel htmlFor={hexId}>{label}</FieldLabel>
      <div className="property-color-picker">
        <div className="property-color-picker__footer">
          <Popover
            open={isOpen}
            onOpenChange={(open, details) => {
              setIsOpen(open);
              if (!open && details.reason === 'escape-key') {
                targetWindow.setTimeout(() => triggerRef.current?.focus(), 0);
              }
            }}
          >
            <PopoverTrigger
              ref={triggerRef}
              aria-label={`Open ${label} color picker`}
              className="property-color-picker__swatch-button"
              id={triggerId}
              render={<Button size="icon" type="button" variant="outline" />}
            >
              <span aria-hidden="true" className="property-color-picker__swatch" style={{ backgroundColor: normalizedValue }} />
            </PopoverTrigger>
            <PopoverContent
              align="start"
              aria-label={`${label} color picker`}
              className="property-color-picker__popover"
              id={popoverId}
            >
              <PopoverTitle className="property-color-picker__sr-only">{label} color picker</PopoverTitle>
              <div
                aria-label={`${label} saturation and brightness`}
                aria-valuemax={100}
                aria-valuemin={0}
                aria-valuenow={Math.round(hsvColor.s * 100)}
                aria-valuetext={`${Math.round(hsvColor.s * 100)}% saturation, ${Math.round(hsvColor.v * 100)}% brightness`}
                className="property-color-picker__area"
                id={saturationValueId}
                role="slider"
                style={{ backgroundColor: `hsl(${hsvColor.h} 100% 50%)` }}
                tabIndex={0}
                onKeyDown={onAreaKeyDown}
                onPointerDown={beginPointerDrag}
              >
                <span
                  aria-hidden="true"
                  className="property-color-picker__area-thumb"
                  style={{ left: `${hsvColor.s * 100}%`, top: `${(1 - hsvColor.v) * 100}%` }}
                />
              </div>
              <Field className="property-color-picker__hue-field" id={hueFieldId}>
                <FieldLabel htmlFor={hueId}>Hue</FieldLabel>
                <Input
                  aria-label={`${label} hue`}
                  aria-valuetext={`${hsvColor.h} degrees`}
                  className="property-color-picker__hue"
                  id={hueId}
                  max={359}
                  min={0}
                  step={1}
                  type="range"
                  value={hsvColor.h}
                  onChange={(event) => emitHsv({ ...hsvColor, h: normalizeHue(Number(event.currentTarget.value)) })}
                  onKeyDown={onHueKeyDown}
                />
              </Field>
              <div className="property-color-picker__hsl" aria-label={`${label} HSL values`} id={hslGroupId} role="group">
                {(['h', 's', 'l'] as const).map((channel) => {
                  const channelId = hslIds[channel];
                  return (
                    <Field className="property-color-picker__hsl-field" id={hslFieldIds[channel]} key={channel}>
                      <FieldLabel htmlFor={channelId}>{channel.toUpperCase()}</FieldLabel>
                      <div className="property-color-picker__number">
                        <Input
                          aria-label={`${label} HSL ${channel === 'h' ? 'hue' : channel === 's' ? 'saturation' : 'lightness'}`}
                          id={channelId}
                          max={channel === 'h' ? 359 : 100}
                          min={0}
                          step={1}
                          type="number"
                          value={String(hslColor[channel])}
                          onChange={(event) => onHslChange(channel, event.currentTarget.value)}
                        />
                        {channel !== 'h' && <span className="property-number-unit">%</span>}
                      </div>
                    </Field>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
          <Input
            aria-invalid={isHexInvalid || undefined}
            aria-label={`${label} hex value`}
            className="property-color-picker__hex"
            id={hexId}
            value={hexDraft}
            onBlur={restoreHexDraft}
            onChange={(event) => {
              const nextDraft = event.currentTarget.value;
              const nextColor = parseHexColor(nextDraft);
              setHexDraft(nextDraft);
              if (nextColor) onChange(nextColor);
            }}
            onKeyDown={(event) => {
              if (event.key !== 'Escape') return;
              event.preventDefault();
              restoreHexDraft();
              event.currentTarget.blur();
            }}
          />
        </div>
      </div>
    </Field>
  );
}
