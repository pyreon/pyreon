import { el } from '../../factory'

const VisuallyHidden = el
  .config({ name: 'VisuallyHidden' })
  .attrs({ tag: 'span' })
  .theme(() => ({
    position: 'absolute',
    width: '1px',
    height: '1px',
    padding: 0,
    margin: '-1px',
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    borderWidth: 0,
  }))

export default VisuallyHidden
