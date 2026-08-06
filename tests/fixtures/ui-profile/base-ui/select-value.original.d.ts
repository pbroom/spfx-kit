export interface SelectValueProps extends Omit<BaseUIComponentProps<'span', SelectValueState>, 'children'> {
  children?: React.ReactNode;
  placeholder?: React.ReactNode;
}
