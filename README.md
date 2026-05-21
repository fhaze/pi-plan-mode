# Pi Plan Mode

Read-only plan mode for [Pi coding agent](https://github.com/earendil-works/pi).

Delegates task tracking to [rpiv-todo](https://github.com/juicesharp/rpiv-mono/tree/main/packages/rpiv-todo) and clarifying questions to [rpiv-ask-user-question](https://github.com/juicesharp/rpiv-mono/tree/main/packages/rpiv-ask-user-question).

## Features

- **Read-only enforcement**: Restricts tools to `read`, `bash`, `grep`, `find`, `ls`
- **Bash allowlist**: Only read-only bash commands are allowed
- **Structured questions**: Uses `ask_user_question` to clarify requirements
- **Todo tracking**: Uses `todo` tool to create and manage a plan
- **Session persistence**: State survives session resume

## Recommended companion packages

```bash
pi install npm:@juicesharp/rpiv-todo
pi install npm:@juicesharp/rpiv-ask-user-question
```

## Installation

```bash
pi install git:github.com/fhaze/pi-plan-mode
```

## Commands

| Command | Description |
|---------|-------------|
| `/plan` | Toggle plan mode |

## Shortcuts

| Shortcut | Description |
|----------|-------------|
| `Ctrl+Shift+P` | Toggle plan mode |

## CLI Flag

```bash
pi --plan    # Start in plan mode
```

## Usage

1. Enable plan mode with `/plan` or `Ctrl+Shift+P`
2. The agent explores the codebase in read-only mode
3. For complex tasks, the agent creates a structured todo list using the `todo` tool
4. For simple tasks, the agent just confirms its approach briefly
5. Disable plan mode with `/plan` to restore full write access

## How It Works

### Plan Mode (Read-Only)

- Only read-only exploration tools available
- `ask_user_question` for clarifying questions
- `todo` tool for creating a structured task list with dependencies
- Bash commands filtered through allowlist
- Agent creates a plan without making changes

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
