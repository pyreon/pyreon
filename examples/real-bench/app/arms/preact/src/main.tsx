import { render } from 'preact'
import './app.css'
import { App } from './app'

render(<App />, document.getElementById('app') as HTMLElement)
