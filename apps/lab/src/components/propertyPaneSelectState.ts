export interface PropertyPaneSelectOption {
  label: string;
  value: string;
}

export function resolveSelectControlState(
  value: unknown,
  options: ReadonlyArray<PropertyPaneSelectOption>
): {
  selectedOption: PropertyPaneSelectOption | undefined;
  selectedOptions: string[];
  selectedValue: string;
} {
  const selectedValue = String(value ?? '');
  const selectedOption = options.find((option) => option.value === selectedValue);

  return {
    selectedOption,
    selectedOptions: selectedOption !== undefined ? [selectedValue] : [],
    selectedValue
  };
}
