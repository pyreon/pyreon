---
'@pyreon/primitives': minor
'@pyreon/native-compiler': minor
'@pyreon/hooks': minor
---

`<WebView>` handles downloads on iOS and Android. Before, both native hosts dropped them silently: an `<a download>` link (including the `blob:` / `data:` URL a page builds for an export), a `Content-Disposition: attachment` response and a file type the engine cannot display all did nothing.

Two new props:

- `onDownload={(d) => …}` receives `{ url, filename, mimeType }` (`WebViewDownload`) once the download is ready to hand to the user (a download that cannot be fetched or read is not reported). The file name comes from the link's `download` attribute, the `Content-Disposition` header or the URL, reduced to one safe path component of at most 255 UTF-8 bytes with bidi controls removed.
- `saveDownloads` (default `true`, a literal) saves the file where the user can find it. On iOS that is a `WKDownload` followed by the share sheet (Save to Files, AirDrop, …). On Android an `http(s)` URL goes to `DownloadManager` with its notification and the page's cookies (sent only to the page's own origin; redirects are resolved first), and a `blob:` / `data:` URL is streamed from the page in chunks (up to 256 MB) and offered to the system "save as" picker. `saveDownloads={false}` reports each download as it starts and leaves it to the app.

Downloads are scoped like the message bridge: only the main frame on the page the app loaded, after a tap or key press there (one download per gesture), and one at a time. A download from an iframe, without a gesture, or while another is in flight is refused with a `[Pyreon] <WebView>` log and does not reach `onDownload`.

On the web the browser handles downloads in the `<iframe>` itself, and both props are ignored. The usual export snippet (`a.click(); URL.revokeObjectURL(a.href)`) works on Android too: the host starts reading a `blob:` link as it is clicked.
