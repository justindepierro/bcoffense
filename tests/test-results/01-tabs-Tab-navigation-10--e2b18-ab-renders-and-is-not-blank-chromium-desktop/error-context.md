# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 01-tabs.spec.js >> Tab navigation (#10) >> Playbook tab renders and is not blank
- Location: specs/01-tabs.spec.js:27:5

# Error details

```
Error: Channel closed
```

```
Error: locator.click: Target page, context or browser has been closed
Call log:
  - waiting for locator('[data-action="showTab"][data-arg="playbook"]')

```

```
Error: browserContext.close: Target page, context or browser has been closed
```