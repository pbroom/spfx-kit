import type { ClassValue } from 'clsx';

export type ClassProp =
  { class: ClassValue; className?: never } | { class?: never; className: ClassValue } | { class?: never; className?: never };
