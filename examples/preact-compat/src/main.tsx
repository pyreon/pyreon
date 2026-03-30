import { render } from 'preact'
import App from './App'

const el = document.getElementById('app')
if (el) render(<App />, el)
