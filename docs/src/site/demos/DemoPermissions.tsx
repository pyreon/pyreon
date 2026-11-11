import { For } from '@pyreon/core'
import { createPermissions, type PermissionMap } from '@pyreon/permissions'
import { batch, computed, signal } from '@pyreon/reactivity'
import { font, paper, weight } from '../theme'
import { el, txt } from '../kit/bases'
import { DemoSurface } from '../kit/cards'
import { CodeBlock } from '../kit/code'
import { DemoGrid, DemoPanel, Meters, PaperButton, PaperHint, PaperLabel } from '../kit/demo'
import { Eyebrow } from '../kit/type'
import { PaperToggle, ToggleRow } from './_toggle-b'

type User = { id: string; name: string; role: 'editor' | 'viewer' | 'admin' }
type Post = { id: string; title: string; authorId: string }

const USERS: readonly User[] = [
  { id: 'ada', name: 'Ada', role: 'editor' },
  { id: 'bo', name: 'Bo', role: 'viewer' },
  { id: 'cy', name: 'Cy', role: 'admin' },
]

const POST: Post = { id: 'p1', title: 'Launch checklist', authorId: 'ada' }

const ACTIONS = [
  { label: 'Read', key: 'posts.read' },
  { label: 'Edit', key: 'posts.update' },
  { label: 'Delete', key: 'posts.delete' },
  { label: 'Manage users', key: 'users.manage' },
] as const

/** The source shown on the card for each role (the same rules `rulesFor` builds). */
const SOURCE: Record<User['role'], string> = {
  editor: `can.set({
  'posts.read': true,
  'posts.update': (post) => post.authorId === me().id,
  'posts.delete': (post) => post.authorId === me().id,
  'users.manage': false,
})`,
  viewer: `can.set({
  'posts.read': true,
  'posts.update': false,
  'posts.delete': false,
  'users.manage': false,
})`,
  admin: `can.set({
  '*': true,
})`,
}

const Stack = el.config({ name: 'PermStack' }).attrs({ block: true, gap: 14, contentAlignX: 'block' })

const Byline = txt
  .config({ name: 'PermByline' })
  .attrs({ tag: 'p' })
  .theme(() => ({ margin: 0, fontSize: 12.5, color: paper.fog }))

const Title = txt
  .config({ name: 'PermTitle' })
  .attrs({ tag: 'h3' })
  .theme(() => ({ margin: 0, marginTop: 4, marginBottom: 14, fontFamily: font.sans, fontSize: 18, fontWeight: weight.semibold, color: paper.text }))

const Actions = el
  .config({ name: 'PermActions' })
  .attrs({ block: true, contentDirection: 'inline', contentAlignY: 'center', gap: 8 })
  .theme(() => ({ flexWrap: 'wrap', extendCss: '& > button:disabled { opacity: .45; cursor: not-allowed; }' }))

/**
 * Permissions demo (`permissions.json` → demo): one real `createPermissions`
 * instance from `@pyreon/permissions`. Signing in as someone else is
 * `can.set(rules)`; Ada's edit and delete are predicates over the post
 * (`post.authorId === me().id`). Each action button's `disabled` is its own
 * `can()` read, so a role switch re-runs those four checks and nothing else:
 * the post component's body ran once.
 */
export default function DemoPermissions() {
  const me = signal<User>(USERS[0] as User)

  const owns = (post: unknown) => (post as Post | undefined)?.authorId === me().id
  const rulesFor = (u: User): PermissionMap =>
    u.role === 'admin'
      ? { '*': true }
      : u.role === 'editor'
        ? { 'posts.read': true, 'posts.update': owns, 'posts.delete': owns, 'users.manage': false }
        : { 'posts.read': true, 'posts.update': false, 'posts.delete': false, 'users.manage': false }

  const can = createPermissions(rulesFor(me.peek()))

  // Counters for the card: checks are counted where they happen (inside the
  // button bindings), then published once the switch has settled.
  let checks = 0
  const lastChecks = signal(0)
  const switches = signal(0)
  const bodyRuns = signal(0)

  const check = (key: string) => {
    checks++
    return can(key, POST)
  }

  const signIn = (u: User) => {
    if (u.id === me.peek().id) return
    checks = 0
    batch(() => {
      me.set(u)
      can.set(rulesFor(u))
    })
    switches.update((n) => n + 1)
    void Promise.resolve().then(() => lastChecks.set(checks))
  }

  const allowed = computed(() =>
    ACTIONS.filter((a) => can(a.key, POST))
      .map((a) => a.label.toLowerCase())
      .join(', '),
  )

  function PostCard() {
    bodyRuns.update((n) => n + 1)
    return (
      <div>
        <Byline>Post by Ada</Byline>
        <Title>{POST.title}</Title>
        <Actions>
          <For each={ACTIONS} by={(a) => a.key}>
            {(a) => {
              // One computed per button: the check re-runs once per change, however
              // often the button reads its `disabled` prop.
              const allowed = computed(() => check(a.key))
              return (
                // The compiler wraps this read in _rp(): each button updates on its own.
                // pyreon-lint-disable-next-line pyreon/no-signal-in-props
                <PaperButton type="button" disabled={!allowed()}>
                  {a.label}
                </PaperButton>
              )
            }}
          </For>
        </Actions>
      </div>
    )
  }

  return (
    <DemoGrid>
      <DemoPanel note="Edit and delete are predicates: they get the post and compare its author with the signed-in user.">
        <Stack>
          <Eyebrow>{() => `signed in as ${me().name} · ${me().role}`}</Eyebrow>
          <CodeBlock code={SOURCE[me().role]} label="Permission rules for the signed-in user" />
          <Meters
            label="What ran"
            items={[
              { label: 'role switches (can.set)', value: () => switches() },
              { label: 'can() checks on the last switch', value: () => lastChecks() },
              { label: 'post component renders', value: () => bodyRuns() },
            ]}
          />
        </Stack>
      </DemoPanel>
      <DemoSurface aria-label="Blog post with role-based actions">
        <Stack>
          <div>
            <PaperLabel id="perm-demo-user">Signed in as</PaperLabel>
            <ToggleRow aria-labelledby="perm-demo-user">
              <For each={USERS} by={(u) => u.id}>
                {(u) => (
                  <PaperToggle type="button" aria-pressed={() => (me().id === u.id ? 'true' : 'false')} onClick={() => signIn(u)}>
                    {`${u.name} · ${u.role}`}
                  </PaperToggle>
                )}
              </For>
            </ToggleRow>
          </div>
          <PostCard />
          <PaperHint aria-live="polite">{() => `${me().name} (${me().role}) can: ${allowed() || 'nothing'}`}</PaperHint>
        </Stack>
      </DemoSurface>
    </DemoGrid>
  )
}
