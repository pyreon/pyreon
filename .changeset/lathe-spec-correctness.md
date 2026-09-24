---
'@pyreon/lathe': minor
---

Spec correctness: lathe now opens and generates working clients for real-world specs.

- **YAML is read by the `yaml` package** (YAML 1.2 core), configured strictly. The previous hand-written reader refused GitHub, Stripe, OpenAI, Twilio and DigitalOcean outright and silently corrupted block scalars, `\u` escapes and duplicate keys in the files it did open (31 of 57 micro-cases diverged). Anchors, aliases and merge keys now resolve; duplicate keys, multi-document streams, custom tags, recursive aliases and `.inf`/`.nan` are refused with a line number. A UTF-8 BOM is accepted on the JSON path too.
