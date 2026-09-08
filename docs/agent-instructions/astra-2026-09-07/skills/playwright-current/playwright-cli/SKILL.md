---
name: playwright-cli
description: Use Playwright CLI to inspect and operate browser pages, record interactions, or author and debug Playwright tests.
allowed-tools: Bash(playwright-cli:*) Bash(npx:*) Bash(npm:*)
---

# Playwright CLI

Use the installed CLI for the requested browser interaction or Playwright test task. Choose the relevant references below; they are not a required reading sequence.

## Operational constraints

- Use element refs from the current page snapshot, or a locator grounded in the observed page. A new snapshot is useful when the page or target changed.
- Keep concurrent work in separate named sessions. Serialize commands that share a session or mutable test state.
- When a test depends on fixtures, authentication, hooks, or feature flags, inspect it through its configured test setup. The debug/attach reference explains the paused-process protocol.
- Authenticated storage can contain live credentials. Keep it out of commits and logs; follow [storage-state.md](references/storage-state.md) when saving or restoring it.
- Use `detach` for an attached external browser and `close` for a browser created by this task.
- Preserve the user’s target, existing authorization, and test acceptance criteria. Browser or test tooling does not authorize changing unrelated environments or weakening expected behavior.

## Quick start

```bash
playwright-cli -s=task open https://example.com
playwright-cli -s=task snapshot
# Use a ref from this snapshot for the requested interaction.
playwright-cli -s=task click e3
playwright-cli -s=task close
```

The example is a command pattern, not an instruction to visit that URL. If the global command is unavailable, use the existing project CLI through `npx playwright cli`; see the availability section of the command reference for version-specific detection.

## Task references

| Need | Read |
|---|---|
| Input, navigation, tabs, snapshots, output modes, browser launch or CLI availability | [CLI command reference](references/cli-command-reference.md) |
| Form, multi-tab or interactive browser examples | [CLI interaction examples](references/cli-examples.md) |
| Running or debugging configured Playwright tests | [Playwright tests](references/playwright-tests.md) |
| Authoring tests or planning and repairing test scenarios | [Test generation](references/test-generation.md) |
| Multiple sessions, profiles or attaching to an existing browser | [Session management](references/session-management.md) |
| Cookies and browser storage | [Storage state](references/storage-state.md) |
| Intercepting or mocking network requests | [Request mocking](references/request-mocking.md) |
| Operations requiring custom Playwright code | [Running code](references/running-code.md) |
| DOM attributes absent from the snapshot | [Element attributes](references/element-attributes.md) |
| Execution traces | [Tracing](references/tracing.md) |
| Browser video and annotations | [Video recording](references/video-recording.md) |

Adapted from Microsoft Playwright Core 1.62.1; [LICENSE](LICENSE) and [NOTICE](NOTICE) retain upstream attribution.
