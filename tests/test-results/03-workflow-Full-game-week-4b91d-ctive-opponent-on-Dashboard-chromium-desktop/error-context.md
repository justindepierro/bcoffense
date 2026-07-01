# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 03-workflow.spec.js >> Full game-week workflow (#271–#281) >> #271 Select active opponent on Dashboard
- Location: specs/03-workflow.spec.js:27:3

# Error details

```
Error: Channel closed
```

```
Error: locator.click: Target page, context or browser has been closed
Call log:
  - waiting for locator('[data-action="showTab"][data-arg="dashboard"]')

```

```
Error: browserContext.close: Target page, context or browser has been closed
```