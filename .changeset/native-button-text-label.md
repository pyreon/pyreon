---
'@pyreon/native-compiler': patch
---

A `<Button>` whose children are a text label (`Tapped {n}`) now lowers to one native Text on iOS and Android, built exactly as `<Text>` builds it. It used to emit one view per child: a Compose Button announced two fragments, and a SwiftUI Button label with several views was laid out per view instead of as one running label. Labels containing JSX (an icon plus text) keep one view per child.
