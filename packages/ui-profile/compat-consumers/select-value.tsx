import * as React from 'react';

import { SelectValue } from '../normalized/src/components/ui/select';

export function SelectValuePlaceholderCompatibilityProbe(): React.ReactElement {
  return <SelectValue placeholder="Choose an option" />;
}
