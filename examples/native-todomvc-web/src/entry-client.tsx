// Entry — boots TodoApp into the #app element via @pyreon/runtime-dom.

import { mount } from '@pyreon/runtime-dom'
import { TodoApp } from './TodoApp'

const root = document.getElementById('app')
if (root === null) {
  throw new Error('[native-todomvc-web] #app element missing from index.html')
}

mount(TodoApp, root)
