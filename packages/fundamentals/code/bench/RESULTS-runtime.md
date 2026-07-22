
# @pyreon/code vs @uiw/react-codemirror — RUNTIME wrapper overhead (real Chromium)

Controlled-value pattern, 100 keystrokes/run (one macrotask per keystroke — real typing cadence), 8 runs (median [p25–p75]), plain language, basicSetup parity.

| Phase | @pyreon/code | @uiw/react-codemirror | verdict |
| --- | --- | --- | --- |
| Mount → editor ready | 7.30ms [7.10ms–8.20ms] | 6.30ms [6.20ms–6.50ms] | **1.16× slower** |
| 100 keystrokes (controlled round-trip) | 445.50ms [444.30ms–446.80ms] | 447.30ms [445.70ms–447.60ms] | **1.00× faster** | ← timer-floor-dominated (one macrotask per key, ~4.7ms clamp both cells); the wrapper delta lives in the COUNT below
| External write → DOM | 400.0µs [300.0µs–400.0µs] | 83.10ms [81.70ms–83.90ms] | **207.75× faster** |
| Dispose | 100.0µs [100.0µs–200.0µs] | 200.0µs [100.0µs–200.0µs] | **2.00× faster** |

**Deterministic count** (portable signal): owner re-renders for 110 keystrokes + 1 external write — Pyreon **1** (body runs once; updates ride the signal), @uiw controlled **110** React commits.

External-write note: the React number is the passive-effect + @uiw sync machinery in a QUIET editor (700ms after typing); written within ~250ms of typing it measured ~530ms — @uiw's anti-clobber TimeoutLatch defers external values near typing (deliberate design, disclosed rather than counted).

Honest limits: author-judge; SAME CM6 engine both sides (wrapper-only claim, not "editor is faster"); @uiw uncontrolled mode skips the round-trip and is exempt; one shared page, interleaved order, no per-cell process isolation — magnitudes are the signal.
