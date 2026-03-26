# @pyreon/zero-cli

Unified CLI for [Pyreon Zero](https://github.com/pyreon/zero) — development, builds, code quality, and project scaffolding.

## Install

```bash
bun add -D @pyreon/zero-cli
```

## Commands

### Development

```bash
zero dev [root]          # Start dev server (prints route table on startup)
  --port <port>          # Server port (default: 3000)
  --host [host]          # Server host (use --host for 0.0.0.0)
  --open                 # Open browser on start

zero build [root]        # Build for production
  --mode <mode>          # Rendering mode override (ssr, ssg, spa)

zero preview [root]      # Preview production build
  --port <port>          # Server port (default: 3000)
  --host [host]          # Server host
```

### Code Quality

```bash
zero doctor [root]       # Detect React patterns in codebase
  --fix                  # Auto-fix fixable issues (className → class, etc.)
  --json                 # Output as JSON
  --ci                   # CI mode — exit with code 1 on errors
```

### Project Context

```bash
zero context [root]      # Generate AI project context (.pyreon/context.json)
  --out <path>           # Custom output path
```

### Scaffolding

```bash
zero create <name>       # Scaffold a new Pyreon Zero project
```

## License

[MIT](LICENSE)
