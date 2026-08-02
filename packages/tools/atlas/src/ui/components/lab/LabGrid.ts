import { el } from '../../kit'

export const LabGrid = el
  .attrs({
    tag: 'div',
  })
  .theme(() => ({
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))',
    gap: '16px',
    width: '100%',
    maxWidth: '1100px',
    margin: '0 auto',
  }))
