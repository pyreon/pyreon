---
'@pyreon/flow': patch
---

Native flow edge labels now take hardware-keyboard focus on iOS and Android, like the web's focusable edge path. Enter or Space selects the focused edge. Before, an edge was reachable by VoiceOver and TalkBack only. `handleKeyboardCommand` gains an optional `edgeId` for this.
