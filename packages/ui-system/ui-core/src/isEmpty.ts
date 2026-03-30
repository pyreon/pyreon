export type IsEmpty = <T extends Record<number | string, any> | any[] | null | undefined>(
  param: T,
) => T extends null | undefined
  ? true
  : keyof T extends never
    ? true
    : T extends T[]
      ? T[number] extends never
        ? true
        : false
      : false

const isEmpty = (<T extends Record<number | string, any> | any[] | null | undefined>(param: T) => {
  if (!param) return true
  if (typeof param !== 'object') return true
  if (Array.isArray(param)) return param.length === 0
  return Object.keys(param).length === 0
}) as IsEmpty

export default isEmpty
