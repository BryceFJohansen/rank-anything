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

Backup tests use a smaller byte limit with real UTF-8 blobs to check export/import at the boundary, combined imports exceeding the limit, and rejected edits preserving unsaved input. Fixtures include Unicode names and IDs and historical ten-item ballots.

## Browser coverage

The browser suite opens both `index.html` and `Rank-Anything.html` through `file://` in isolated Chromium contexts. It checks:

- Draft preservation when collection creation is cancelled, and confirmed creation without losing saved ballots.
- Item deletion preserving the rest of an unfinished ballot, including ties, skips, and drafts with too few items to save.
- Unicode duplicate handling, preservation of invalid pasted input, and successful correction.
- Unadded lists surviving item edits and view changes, remaining separate between collections, and clearing after submission.
- Keyboard focus while moving, skipping, and restoring items, including restoring into an empty ballot.
- Keyboard focus after view and collection changes, item edits and deletion, starting and saving ballots, and history pagination and deletion.
- Dialog cancellation with Cancel or Escape returning focus to the original control, including nested collection creation and the item chooser.
- Dialog validation errors appearing beside the input, being exposed in Chromium's accessibility tree, and clearing after correction.
- Rejected item and collection renames retaining their input and saved data, including control characters and names that become too long after Unicode normalization.
- History opening on the newest page after collection changes, imports, and saving a new round, while retaining its page during ordinary view changes.
- Long unbroken names wrapping in the chooser and skipped-items list at desktop and narrow widths, with controls remaining usable.
- Long names in Results and History staying within the page from 320 to 1280 pixels wide, including the tablet layout and expanded evidence table.
- Saved data surviving reload, backup download and additive import, and a narrow results layout.
- JavaScript errors and unexpected network requests during the smoke workflow.

On failure, Playwright saves screenshots and traces under `test-results/`. View the browser report with `npx playwright show-report`. These generated artifacts are ignored by Git.

## Continuous integration

[GitHub Actions](.github/workflows/checks.yml) runs the checks on Linux and Windows for pushes and pull requests using the Node version in `.nvmrc`. Each job installs Chromium, tests both entry points, and uploads a separate browser report.

## Manual checks and limits

Automated browser coverage currently uses Chromium on Linux and Windows in CI. It does not establish compatibility with every Windows browser, Safari, Firefox, or mobile file manager. Use a separate browser profile and disposable collections for manual checks.

Before a release, check direct file opening in the target browsers, keyboard and screen-reader navigation, storage failure warnings, backup recovery, and responsiveness with representative large collections. Automated accessibility checks inspect Chromium's accessibility tree; they do not replace testing with a screen reader. Layout checks cover collection views and long names in the chooser and skipped-items list at representative widths, not every screen or device size.
