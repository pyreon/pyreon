import { el } from '../../factory'
import { ModalBase } from '@pyreon/ui-primitives'

const Drawer = el.config({ name: 'Drawer', component: ModalBase })
  .theme(() => ({
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 50,
  }))
  .variants(() => ({
    left: { display: 'flex', justifyContent: 'flex-start' },
    right: { display: 'flex', justifyContent: 'flex-end' },
    top: { display: 'flex', flexDirection: 'column', justifyContent: 'flex-start' },
    bottom: { display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' },
  }))
  .sizes(() => ({
    small: { width: '280px' },
    medium: { width: '360px' },
    large: { width: '480px' },
    xLarge: { width: '640px' },
  }))

export default Drawer
