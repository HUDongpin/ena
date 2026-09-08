# CLI interaction examples

Adapted from Microsoft Playwright Core 1.59.1. See [LICENSE](../LICENSE) and [NOTICE](../NOTICE).

Use the example relevant to the requested interaction. Element refs such as `e1` are placeholders for refs observed in the current session.

## Form submission

```bash
playwright-cli open https://example.com/form
playwright-cli snapshot

playwright-cli fill e1 "user@example.com"
playwright-cli fill e2 "password123"
playwright-cli click e3
playwright-cli snapshot
playwright-cli close
```

## Multi-tab workflow

```bash
playwright-cli open https://example.com
playwright-cli tab-new https://example.com/other
playwright-cli tab-list
playwright-cli tab-select 0
playwright-cli snapshot
playwright-cli close
```

## Debugging with DevTools

```bash
playwright-cli open https://example.com
playwright-cli click e4
playwright-cli fill e7 "test"
playwright-cli console
playwright-cli network
playwright-cli close
```

For capture and replay, see [tracing.md](tracing.md).
