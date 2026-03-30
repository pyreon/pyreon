import type { ElementType } from './utils'

export type GenericHoc = (component: ElementType) => ElementType

export type ComposeParam = Record<string, GenericHoc | null | undefined | false>
