import { routes } from 'virtual:zero/routes'
import { registerServiceWorker, startClient } from '@pyreon/zero/client'

// No-op in development; in the production build it registers `<base>sw.js`.
void registerServiceWorker()

startClient({ routes })
