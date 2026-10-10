# Rank Anything

An offline app for discovering your personal preference order. Create a collection of books, games, films, meals, or anything else, then compare a few items at a time to build a ranking.

Rank Anything runs entirely in your browser. There are no accounts, tracking, cloud services, or runtime dependencies.

## Features

- **Small comparisons:** rank 2–5 items per round, with ties and skips supported.
- **Flexible collections:** keep separate rankings for different topics.
- **Suggested rounds:** compare new pairs and less-compared items, with familiar items helping connect rounds.
- **Results you can inspect:** see ranking tiers, pairwise evidence, and comparison coverage.
- **Editable history:** remove saved ballots when your preferences change.
- **Portable backups:** export and import your collections as JSON.

## Run locally

Clone the repository:

```sh
git clone https://github.com/BryceFJohansen/Rank-Anything.git
cd Rank-Anything
```

Open `index.html` in a modern desktop browser. Keep `app.js`, `engine.js`, and `style.css` beside it. No server, build step, or npm installation is needed to use the app.

Alternatively, open `Rank-Anything.html`. It contains the entire app and license in a single file, so it can be used on its own.

Use the same entry point and browser each time to retain access to your saved data. Export a backup before moving the app or switching entry points; browser storage can depend on the file path.

## Create your first ranking

1. Create a collection and add item names, one per line. The optional demo provides a collection to try.
2. Select **Start a ballot**, or use **Choose items** to pick 2–5 familiar items yourself.
3. Use the arrow buttons to put your preferred items first. **Tie ↑** joins the group above; **Skip** leaves an item out of that comparison.
4. Select **Save ballot**, then **Next round** to keep comparing or **View results** to see your ranking.
5. Use **History** to review or remove saved ballots.

Skipped items never count as losses. Automatic rounds give recently skipped items a short rest when enough alternatives exist; **Choose items** can bring them back immediately.

## Your data and backups

Collections and saved ballots stay in the current browser's local storage. Nothing is uploaded or synced. Use one tab at a time, and use **Export backup** regularly—clearing browser data, private browsing, or changing browsers can make saved data unavailable.

**Import backup** adds separate collections without overwriting existing ones. Importing the same file twice creates copies. Backups include saved ballots, but not a ballot in progress.

If saving fails, the app displays a warning and you can still export your session. If an earlier save cannot be read, the app preserves it and offers a download before you explicitly replace it.

Export before deleting items: removing an item also removes it from previous ballots, and saved ballots with fewer than two ranked items are discarded. An unfinished ballot keeps its remaining order, ties, and skips; it needs at least two ranked items before it can be saved.

## How rankings work

Each saved ballot records pairwise preferences. Items in higher groups receive a preference vote over items in lower groups. Tied pairs count as compared without giving either item a win; skipped and unmentioned items provide no evidence.

The engine combines those votes using the **Schulze strongest-path method**, with winning-vote strengths. It supports conflicting preferences, including cycles such as A over B, B over C, and C over A.

- Results are grouped into tiers. A shared tier can reflect ties, cycles, or insufficient evidence; it does not necessarily mean equal preference.
- Items with no comparisons appear separately under **Not ranked yet**.
- Coverage describes how many pairs have been compared, rather than confidence in the ranking.

Every saved ballot has equal weight. Repeating a comparison adds evidence; remove an old ballot if you want to replace it. Collections never share ranking evidence.

## Development

Use **Node.js 24 LTS**, as specified in [`.nvmrc`](.nvmrc). Install the development tools and run the checks:

```sh
npm ci
npm run check
```

`npm run check` verifies formatting, runs ESLint, checks the standalone HTML, and runs the Node tests. ESLint warnings fail the check. Use `npm run format` to format the repository or `npm run lint:fix` to apply available lint fixes; both regenerate the standalone HTML afterward.

To run the browser suite against both entry points:

```sh
npx playwright install --with-deps --only-shell chromium
npm run test:browser
```

GitHub Actions runs these checks on Linux and Windows for pushes and pull requests. See [TESTING.md](TESTING.md) for coverage, individual commands, and manual testing guidance.

### Project structure

| File                                               | Purpose                                                    |
| -------------------------------------------------- | ---------------------------------------------------------- |
| [`index.html`](index.html)                         | Entry point using the separate source files                |
| [`app.js`](app.js)                                 | Interface, browser storage, and backup import/export       |
| [`engine.js`](engine.js)                           | Ranking, round selection, and data validation              |
| [`style.css`](style.css)                           | App styles and responsive layouts                          |
| [`Rank-Anything.html`](Rank-Anything.html)         | Standalone copy with embedded styles, scripts, and license |
| [`tests/`](tests/)                                 | Engine and UI interaction tests                            |
| [`e2e/`](e2e/)                                     | Chromium regression and smoke tests for both entry points  |
| [`scripts/standalone.mjs`](scripts/standalone.mjs) | Standalone HTML generation and consistency checking        |
| [`eslint.config.mjs`](eslint.config.mjs)           | ESLint rules and file configuration                        |

Edit `index.html`, `app.js`, `engine.js`, and `style.css`, then run `npm run build:standalone` to update `Rank-Anything.html`. The generator also embeds `LICENSE`. Commit the regenerated file alongside source changes; CI rejects stale output. The generated HTML is already included in the repository, so users can open it without running a build.

## Current limits

The app is intended for one person using a desktop browser. Mobile file opening and local storage behavior vary by browser.

- Up to 100 collections and 300 items per collection, with 10,000 items total.
- Up to 20,000 ballots per collection, with 50,000 ballots total.
- Names up to 200 characters; backup imports up to 100 MB.
- History shows 50 ballots per page; the evidence view shows the first 200 observed pairs. Exports retain all saved data.

Existing version-1 backups, including historical ballots with up to ten items, remain supported.

## License

[MIT](LICENSE). Copyright (c) 2026 Bryce Johansen.
