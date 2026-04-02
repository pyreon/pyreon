# @pyreon/ui-theme

Theme system for the Pyreon UI component library.

## Install

```bash
bun add @pyreon/ui-theme
```

## Usage

```ts
import { createTheme, defaultTheme } from '@pyreon/ui-theme'

// Use default theme
<PyreonUI theme={defaultTheme}>...</PyreonUI>

// Custom theme
const theme = createTheme({
  colors: { primary: { 500: '#8b5cf6' } },
})
```

## License

MIT
