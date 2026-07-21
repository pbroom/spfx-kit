import { describe, expect, it } from 'vitest';

import { resolveSelectControlState } from '../apps/lab/src/components/propertyPaneSelectState';

describe('property pane select controls', () => {
  it('keeps an authored empty-string option selected', () => {
    expect(resolveSelectControlState('', [
      { label: 'No unit', value: '' },
      { label: 'Pixels', value: 'px' }
    ])).toMatchObject({
      selectedOption: { label: 'No unit', value: '' },
      selectedOptions: [''],
      selectedValue: ''
    });
  });

  it('does not select an empty value when no matching option exists', () => {
    expect(resolveSelectControlState(undefined, [
      { label: 'Pixels', value: 'px' }
    ]).selectedOptions).toEqual([]);
  });
});
