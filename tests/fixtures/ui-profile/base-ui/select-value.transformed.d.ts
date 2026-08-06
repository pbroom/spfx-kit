export interface SelectValueProps extends Omit<BaseUIComponentProps<'span', SelectValueState>, 'children' | 'placeholder'> {
  children?: React.ReactNode;
  placeholder?: React.ReactNode;
}
