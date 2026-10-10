# Testing Rank Anything

The repository contains Node tests and Chromium browser tests. Run the commands below to check the current code; the test runners report the current totals and results.

## Setup

Use Node.js 24 LTS, as specified in `.nvmrc`:

```sh
npm ci
npx playwright install --with-deps --only-shell chromium
```

The browser installation is needed once per Playwright version. On Linux, `--with-deps` also installs the browser's system libraries and may require administrator access. All npm packages are development dependencies; opening the app does not require them.

## Run the checks

```sh
npm run check
npm run test:browser
```

`npm run check` checks formatting, runs ESLint, verifies that the standalone HTML matches its inputs, and runs the Node tests. It does not rebuild files, so stale standalone output fails the check.

The individual commands are:

| Command                    | Checks                                                                                 |
| -------------------------- | -------------------------------------------------------------------------------------- |
| `npm run format:check`     | Prettier formatting for source, tests, configuration, and documentation                |
| `npm run lint`             | JavaScript in source, tooling, tests, and inline HTML scripts                          |
| `npm run check:standalone` | Generated HTML against `index.html`, `app.js`, `engine.js`, `style.css`, and `LICENSE` |
| `npm test`                 | Ranking, validation, round selection, UI logic, and standalone generation              |
| `npm run test:browser`     | Real browser behavior for both app entry points                                        |

The Node tests require no npm packages and can also be run directly with `node --test`. The UI unit tests use a lightweight DOM harness; focus, rendering, and native browser behavior are checked separately with Playwright.

## Browser coverage

The browser suite opens both `index.html` and `Rank-Anything.html` through `file://` in isolated Chromium contexts. It checks:

- Draft preservation when collection creation is cancelled, and confirmed creation without losing saved ballots.
- Item deletion preserving the rest of an unfinished ballot, including ties, skips, and drafts with too few items to save.
- Unicode duplicate handling, preservation of invalid pasted input, and successful correction.
- Unadded lists surviving item edits and view changes, remaining separate between collections, and clearing after submission.
- Keyboard focus while moving, skipping, and restoring items, including restoring into an empty ballot.
- Saved data surviving reload, backup download and additive import, and a narrow results layout.
- JavaScript errors and unexpected network requests during the smoke workflow.

On failure, Playwright saves screenshots and traces under `test-results/`. View the browser report with `npx playwright show-report`. These generated artifacts are ignored by Git.

## Continuous integration

[GitHub Actions](.github/workflows/checks.yml) runs the checks on Linux and Windows for pushes and pull requests using the Node version in `.nvmrc`. Each job installs Chromium, tests both entry points, and uploads a separate browser report.

## Manual checks and limits

Automated browser coverage currently uses Chromium on Linux and Windows in CI. It does not establish compatibility with every Windows browser, Safari, Firefox, or mobile file manager. Use a separate browser profile and disposable collections for manual checks.

Before a release, check direct file opening in the target browsers, keyboard and screen-reader navigation, storage failure warnings, backup recovery, and responsiveness with representative large collections. The narrow-layout smoke check covers the results page, not every screen or device size.
