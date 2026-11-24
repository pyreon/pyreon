// The client entry an app with islands-only routes writes (#4371). Imported by
// relative path so the fixture builds against zero's SOURCE.
import * as islands from 'virtual:pyreon/islands-registry'
import { startClientLazy } from '../../../../client-lazy'

startClientLazy({
  routes: () => import('virtual:zero/routes'),
  islands,
  islandRoot: () => import('./island-root'),
})
