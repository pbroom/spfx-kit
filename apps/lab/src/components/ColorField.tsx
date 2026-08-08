import * as React from 'react';
import {
  Button,
  ColorArea,
  ColorPicker,
  ColorSlider,
  Field,
  Input,
  Popover,
  PopoverSurface,
  PopoverTrigger
} from '@fluentui/react-components';

export interface ColorFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

/** Temporary Fluent island; the owned ColorField organism replaces these internals in the next slice. */
export function ColorField({ label, value, onChange }: ColorFieldProps): JSX.Element {
  const [isOpen, setIsOpen] = React.useState(false);
  const normalizedValue = normalizeHexColor(value);
  const hsvColor = hexToHsv(normalizedValue);
  const hslColor = hexToHsl(normalizedValue);
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
    <Field className="property-field" label={label} size="small">
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
                <span aria-hidden="true" className="property-color-picker__swatch" style={{ backgroundColor: normalizedValue }} />
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
            value={normalizedValue}
            onChange={(event) => onChange(normalizeHexColor(event.currentTarget.value))}
          />
        </div>
      </div>
    </Field>
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

  if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(trimmed)) {
    const [, r, g, b] = trimmed.toLowerCase();
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  if (/^[0-9a-f]{6}$/i.test(trimmed)) return `#${trimmed.toLowerCase()}`;
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
    if (max === red) hue = 60 * (((green - blue) / delta) % 6);
    else if (max === green) hue = 60 * ((blue - red) / delta + 2);
    else hue = 60 * ((red - green) / delta + 4);
  }

  return { h: Math.round(hue < 0 ? hue + 360 : hue), s: max === 0 ? 0 : delta / max, v: max, a: 1 };
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
    if (max === red) hue = 60 * (((green - blue) / delta) % 6);
    else if (max === green) hue = 60 * ((blue - red) / delta + 2);
    else hue = 60 * ((red - green) / delta + 4);
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
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 0), 1) : 0;
}

function clampHue(value: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(Math.max(Math.round(parsed), 0), 360) : 0;
}

function clampPercentage(value: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(Math.max(Math.round(parsed), 0), 100) : 0;
}

function hueToRgb(p: number, q: number, value: number): number {
  let normalizedValue = value;
  if (normalizedValue < 0) normalizedValue += 1;
  if (normalizedValue > 1) normalizedValue -= 1;
  if (normalizedValue < 1 / 6) return p + (q - p) * 6 * normalizedValue;
  if (normalizedValue < 1 / 2) return q;
  if (normalizedValue < 2 / 3) return p + (q - p) * (2 / 3 - normalizedValue) * 6;
  return p;
}

function toHexChannel(value: number): string {
  return Math.round(Math.min(Math.max(value, 0), 1) * 255)
    .toString(16)
    .padStart(2, '0');
}
