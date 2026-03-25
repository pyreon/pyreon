---
title: "@pyreon/devtools"
description: Chrome DevTools extension for inspecting Pyreon component trees, signals, and performance.
---

`@pyreon/devtools` is a Chrome DevTools extension for inspecting Pyreon applications. It provides a component tree view, signal inspection, and performance monitoring.

<PackageBadge name="@pyreon/devtools" href="/docs/devtools" status="beta" />

## Installation

Install from the [Chrome Web Store](https://chromewebstore.google.com/) or build from source:

```bash
git clone https://github.com/pyreon/devtools.git
cd devtools
bun install
bun run build
```

Then load the `dist/` folder as an unpacked extension in `chrome://extensions`.

## Overview

### Execution Contexts

The extension is composed of four execution contexts that work together:

1. **Page hook** — injected into the inspected page to instrument Pyreon's runtime, capturing component mounts, signal updates, and render timings.
2. **Content script** — bridges between the page hook and the extension background, forwarding messages across the isolated world boundary.
3. **Background service worker** — coordinates communication between the content script and any open DevTools panels, maintaining connection state.
4. **DevTools panel** — the UI you interact with inside Chrome DevTools, rendering the component tree, signal inspector, and performance graphs.

### Component Tree Visualization

The component tree panel shows every mounted Pyreon component in a collapsible hierarchy. Selecting a component reveals its current props, internal signals, and computed values. Components re-rendering in real time are highlighted so you can spot unnecessary updates.

### Signal State Inspection

The signals panel lists every signal and computed value in the selected component's scope. Each entry shows the current value, the number of subscribers, and a history of recent changes. You can manually set a signal's value from the panel for quick debugging.

### Performance Monitoring

The performance tab records render durations and signal propagation times. Use it to identify slow components or overly broad signal dependencies that trigger excessive re-renders.
