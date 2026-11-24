import { mount } from '@pyreon/runtime-dom'
import './app.css'
import { App } from './app'

mount(<App />, document.getElementById('app') as HTMLElement)
