import { signal } from '@pyreon/reactivity'
import { ChartDemo } from './demos/ChartDemo'
import { CodeDemo } from './demos/CodeDemo'
import { DashboardDemo } from './demos/DashboardDemo'
import { DocumentDemo } from './demos/DocumentDemo'
import { FormDemo } from './demos/FormDemo'
import { HotkeysDemo } from './demos/HotkeysDemo'
import { I18nDemo } from './demos/I18nDemo'
import { MachineDemo } from './demos/MachineDemo'
import { PermissionsDemo } from './demos/PermissionsDemo'
import { QueryDemo } from './demos/QueryDemo'
import { StateTreeDemo } from './demos/StateTreeDemo'
import { StorageDemo } from './demos/StorageDemo'
import { StoreDemo } from './demos/StoreDemo'
import { TableDemo } from './demos/TableDemo'
import { ValidationDemo } from './demos/ValidationDemo'
import { VirtualDemo } from './demos/VirtualDemo'

const tabs = [
  { id: 'dashboard', label: '📊 Dashboard', component: DashboardDemo },
  { id: 'store', label: 'Store', component: StoreDemo },
  { id: 'state-tree', label: 'State Tree', component: StateTreeDemo },
  { id: 'form', label: 'Form', component: FormDemo },
  { id: 'validation', label: 'Validation', component: ValidationDemo },
  { id: 'i18n', label: 'i18n', component: I18nDemo },
  { id: 'query', label: 'Query', component: QueryDemo },
  { id: 'table', label: 'Table', component: TableDemo },
  { id: 'virtual', label: 'Virtual', component: VirtualDemo },
  { id: 'charts', label: 'Charts', component: ChartDemo },
  { id: 'code', label: 'Code', component: CodeDemo },
  { id: 'document', label: 'Document', component: DocumentDemo },
  { id: 'storage', label: 'Storage', component: StorageDemo },
  { id: 'hotkeys', label: 'Hotkeys', component: HotkeysDemo },
  { id: 'permissions', label: 'Permissions', component: PermissionsDemo },
  { id: 'machine', label: 'Machine', component: MachineDemo },
] as const

const activeTab = signal(tabs[0]!.id)

export function App() {
  return (
    <div class="app">
      <nav class="sidebar">
        <h1>Pyreon Fundamentals</h1>
        <ul>
          {tabs.map((tab) => (
            <li key={tab.id}>
              <button
                class={activeTab() === tab.id ? 'active' : ''}
                onClick={() => activeTab.set(tab.id)}
              >
                {tab.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <main class="content">
        {tabs.map((tab) => {
          const Component = tab.component
          return (
            <div key={tab.id} style={() => (activeTab() === tab.id ? '' : 'display:none')}>
              <Component />
            </div>
          )
        })}
      </main>
    </div>
  )
}
