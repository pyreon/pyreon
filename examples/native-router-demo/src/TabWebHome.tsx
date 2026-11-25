import { Button, Inline, Stack, Text, WebView } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'

// A full-screen web page in a tab (#4827, #4829). What it PROVES on device:
//   - Android system Back goes back in the PAGE's history (a followed link)
//     while it has one, then leaves the tab as before; iOS's edge swipe goes back;
//   - a HIDDEN tab's web view never takes Back from the visible tab's stack
//     (visited tabs stay composed);
//   - after the app swaps the page (a new `html`), Back does not return to the
//     page it replaced;
//   - `onLoad` runs once per document (not for the in-page `#two` navigation),
//     an unreachable page reports `onError` with kind 'load', and a new
//     `reloadKey` loads it again.
// The page posts where it is through the reverse bridge, so the tests read it in
// NATIVE text instead of inside the web view. The link is the only way the page
// gets history: a user activation, so WebView's history intervention keeps it.
const WEB_PAGE_SCRIPT =
  "<script>function send(m){if(window.pyreonPostMessage){window.pyreonPostMessage(m)}else{setTimeout(function(){send(m)},100)}}" +
  "addEventListener('hashchange',function(){send('at:'+(location.hash||'#one'))});</script>"
const WEB_PAGE_ONE =
  '<!doctype html><meta name="viewport" content="width=device-width"><body style="margin:0;font:24px sans-serif">' +
  '<a href="#two" style="display:block;padding:48px 16px;font-size:32px">Go to two</a>' +
  WEB_PAGE_SCRIPT +
  "<script>send('at:#one')</script></body>"
const WEB_PAGE_TWO =
  '<!doctype html><meta name="viewport" content="width=device-width"><body style="margin:0;font:24px sans-serif">' +
  '<p style="padding:48px 16px">Page two</p>' +
  WEB_PAGE_SCRIPT +
  "<script>send('at:page-two')</script></body>"

export function TabWebHome() {
  const page = signal(WEB_PAGE_ONE)
  const at = signal('loading')
  const loads = signal(0)
  const errors = signal(0)
  const errorKind = signal('none')
  const attempt = signal(0)
  return (
    // No padding: the web view reaches the screen's left edge, where iOS's back swipe starts.
    <Stack gap={2} data-testid="tabs-web-home">
      <Text data-testid="tabs-web-state">{at()}</Text>
      <Text data-testid="tabs-web-loads">loads:{loads()}</Text>
      <Text data-testid="tabs-web-errors">errors:{errors()} {errorKind()}</Text>
      <Inline gap={2}>
        <Button onPress={() => page.set(WEB_PAGE_TWO)} data-testid="tabs-web-swap">
          Swap page
        </Button>
        <Button onPress={() => attempt.set(attempt() + 1)} data-testid="tabs-web-retry">
          Retry
        </Button>
      </Inline>
      <WebView
        html={page()}
        grow
        onMessage={(m) => at.set(m)}
        onLoad={() => loads.set(loads() + 1)}
        data-testid="tabs-web-view"
      />
      <WebView
        src="https://127.0.0.1:9/"
        reloadKey={attempt()}
        onError={(e) => {
          errors.set(errors() + 1)
          errorKind.set(e.kind)
        }}
        data-testid="tabs-web-offline"
      />
    </Stack>
  )
}
