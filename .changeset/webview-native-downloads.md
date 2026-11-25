---
'@pyreon/primitives': minor
'@pyreon/native-compiler': minor
'@pyreon/hooks': minor
---

`<WebView>` handles downloads on iOS and Android. Before, both native hosts dropped them silently: an `<a download>` link (including the `blob:` / `data:` URL a page builds for an export), a `Content-Disposition: attachment` response and a file type the engine cannot display all did nothing.

Two new props:

- `onDownload={(d) => …}` is called once per download, before it is saved, with `{ url, filename, mimeType }` (`WebViewDownload`). The file name comes from the link's `download` attribute, the `Content-Disposition` header or the URL, reduced to one safe path component.
- `saveDownloads` (default `true`, a literal) saves the file where the user can find it. On iOS that is a `WKDownload` followed by the share sheet (Save to Files, AirDrop, …). On Android an `http(s)` URL goes to `DownloadManager` with the page's cookies and its notification, and a `blob:` / `data:` URL is read inside the page (up to 50 MB) and offered to the system "save as" picker. `saveDownloads={false}` leaves every download to `onDownload`.

On the web the browser handles downloads in the `<iframe>` itself, and both props are ignored. On Android, a page must not revoke a `blob:` URL right after clicking it, because the host reads the blob after the click.
