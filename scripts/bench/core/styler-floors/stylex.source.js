import * as stylex from '@stylexjs/stylex'

export const styles = stylex.create({
  base: {
    display: 'inline-flex',
    gap: 8,
    paddingBlock: 12,
    paddingInline: 16,
    borderRadius: 6,
    backgroundColor: '#0d6efd',
    color: '#fff',
  },
  dyn: (color, bg) => ({
    color,
    backgroundColor: bg,
    padding: 10,
    borderRadius: 4,
  }),
})
