export const FONT_OPTION_COUNT = 1_940;

// Public synthetic cardinality data only. This intentionally does not reproduce
// or claim evidence for the private real-font catalog required by ADR-0001.
export const FONT_OPTIONS = Object.freeze(
  Array.from({ length: FONT_OPTION_COUNT }, (_unused, index) =>
    Object.freeze({
      id: `font-family-${String(index + 1).padStart(4, '0')}`,
      label: `Font Family ${String(index + 1).padStart(4, '0')}`,
      value: `Font Family ${index + 1}`
    })
  )
);
