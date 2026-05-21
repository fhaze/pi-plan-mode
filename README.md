# Pi Plan Mode

Read-only plan mode for [Pi coding agent](https://github.com/earendil-works/pi) with execution tracking.

## Features

- **Read-only tools**: Restricts available tools to `read`, `bash`, `grep`, `find`, `ls`
- **Bash allowlist**: Only read-only bash commands are allowed
- **Plan extraction**: Extracts numbered steps from `Plan:` sections
- **Progress tracking**: Widget shows completion status during execution
- **`[DONE:n]` markers**: Explicit step completion tracking
- **Session persistence**: State survives session resume

## Installation

```bash
pi install git:github.com/fhaze/pi-plan-mode
```

## Commands

| Command | Description |
|---------|-------------|
| `/plan` | Toggle plan mode |
| `/todos` | Show current plan progress |

## Shortcuts

| Shortcut | Description |
|----------|-------------|
| `Ctrl+Shift+P` | Toggle plan mode |

## CLI Flag

```bash
pi --plan    # Start in plan mode
```

## Usage

1. Enable plan mode with `/plan`, `Shift+P`, or `--plan` flag
2. Ask the agent to analyze code and create a plan
3. The agent outputs a numbered plan under a `Plan:` header:

```
Plan:
1. First step description
2. Second step description
3. Third step description
```

4. Choose **"Execute the plan"** when prompted
5. During execution, the agent marks steps complete with `[DONE:n]` tags
6. Progress widget shows completion status

## How It Works

### Plan Mode (Read-Only)

- Only read-only tools available
- Bash commands filtered through allowlist
- Agent creates a plan without making changes

### Execution Mode

- Full tool access restored
- Agent executes steps in order
- `[DONE:n]` markers track completion
- Widget shows progress

### Command Allowlist

**Safe (allowed):**
- File inspection: `cat`, `head`, `tail`, `less`, `more`
- Search: `grep`, `find`, `rg`, `fd`
- Directory: `ls`, `pwd`, `tree`
- Git read: `git status`, `git log`, `git diff`, `git branch`
- Package info: `npm list`, `npm outdated`, `yarn info`
- System info: `uname`, `whoami`, `date`, `uptime`

**Blocked:**
- File modification: `rm`, `mv`, `cp`, `mkdir`, `touch`
- Git write: `git add`, `git commit`, `git push`
- Package install: `npm install`, `yarn add`, `pip install`
- System: `sudo`, `kill`, `reboot`
- Editors: `vim`, `nano`, `code`

## License

MIT
