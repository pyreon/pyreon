import type { Props } from '@pyreon/core'
import { RouterView } from '@pyreon/router'
import { TopBar } from '../components/TopBar'
import '../styles/tokens.css'
import '../styles/global.css'
import '../styles/content.css'
import './playground.css'

export function layout(_props: Props) {
  return (
    <div>
      <TopBar />
      <RouterView />
    </div>
  )
}
