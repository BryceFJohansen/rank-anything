RANK ANYTHING
Offline personal preference ranking • Version 1.1

GET STARTED
1. Extract this entire ZIP into a folder.
2. Double-click Rank-Anything.html (standalone) or index.html (modular)
   to open it in a modern desktop browser. Pick one entry point and keep using
   that same file/browser, since local file storage may differ by file path.
3. Create a collection and paste item names, one per line.
4. Start a ballot, or use Choose items to select 2–5 familiar items.
5. Move items with the arrow buttons. Tie ↑ joins the rank above.
   Moving an item out of a tied rank splits it into its own rank.
6. Skip anything unfamiliar; it never counts as a loss.
7. Save the ballot, then choose Next round for another small comparison or
   View results to see the combined ranking. History lets you undo ballots.

No installation, server, account, internet connection, external fonts, or
third-party services are required. Keep index.html, style.css, engine.js,
and app.js together. The demo is optional, contains only example activities,
and starts with no assumed preferences.

IMPORTANT: SAVE BACKUPS
Use Export backup regularly. Data is saved in your current browser when
local storage works. Private browsing, clearing browser data, moving files,
or changing browser may lose or separate that state. Nothing is synced.
The app warns if it cannot save; exporting remains available.
Import accepts a Rank Anything JSON backup and ADDS separate collections;
it never overwrites existing collections. Importing the same backup twice
creates copies. Ballots in progress are not included in backups.
An unreadable previous save is preserved until you explicitly replace it;
use Download unreadable save if you need to attempt recovery later.

SMALL ROUNDS
New automatic and manual ballots contain 2–5 items. Next round mixes new
pairs and less-compared items with a familiar anchor when possible, connecting
your preferences across the collection. Starting order is shuffled each time.
With six or more items, consecutive sets change when alternatives are ready;
small collections naturally repeat items. Skipped items rest for two saved
rounds when at least two alternatives exist. Rounds can be smaller while
items rest. Skip never means a loss or permanent exclusion. Choose items can
bring any item back immediately. Nothing is saved until you save the ballot.
Old version-1 backups and browser saves, including ten-item ballots, continue
to load with all their original evidence. The storage key and backup format
are unchanged. To retain local-file storage, replace the app at its existing
path in the same browser; export a backup first.

RANKING MODEL
This app records your preferences, not objective quality or numerical scores.
Each ballot is a list of ordered tie groups. Every pair in different groups
gives one preference vote to the higher item. A tied pair is observed but
gives neither item a strict-preference vote. Skipped and unmentioned items
produce no comparisons at all.

The ranking uses Schulze strongest paths, with winning-vote strengths.
A direct majority edge exists only when A has more votes over B than B over A.
Its strength is A's winning-vote count. A path's strength is its weakest edge.
A precedes B when the strongest path from A to B is stronger than the reverse.
A cycle such as A > B > C > A is allowed; the app flags direct majority cycles.

Results display successive maximal tiers in that strict strongest-path order.
Shared tiers are unresolved, not proof of equal preference. They can come from
explicit ties, cycles, or missing/disconnected evidence. Within each tier,
items are shown alphabetically. With sparse evidence, tier numbers do not
imply that every item in one tier directly beats every item in the next tier.
Items with no comparisons are shown separately, never silently placed last.
Coverage is the number of observed item pairs, not a confidence percentage.

Every saved ballot has equal weight. Repeated ballots add evidence; remove
an old ballot if you want to replace your earlier preference rather than
count both. Collections never share ranking evidence.

LIMITATIONS
- This is a single-person, single-browser tool; use one tab at a time.
- No automatic cloud backup, collaboration, external catalogue, or accounts.
- Limits: 100 collections, 300 items per collection, 10,000 total items;
  20,000 ballots per collection, 50,000 total ballots; names up to 200 chars.
- Import file limit: 100 MB. Unsupported or malformed backups are rejected
  without changing existing data. Duplicate names are normalized and rejected.
- History displays 50 ballots per page. Pairwise evidence displays the first
  200 observed pairs in collection order. Exports preserve all saved data.
- Deleting an item removes it from old ballots; ballots left with fewer than
  two ranked items are removed. Export first when you may want to undo this.
- Local file storage behavior varies by browser; export before moving files.
- Mobile browsers/file managers may restrict opening local HTML packages;
  desktop opening is the intended offline route.

FILES / DEVELOPMENT
Rank-Anything.html  Self-contained app, all styles/scripts included
index.html   Modular entry point
style.css    Responsive, dependency-free styles
app.js       Accessible UI, persistence, import/export
engine.js    Pure UMD ranking and validation engine (also CommonJS)
tests/       Automated Node.js tests (no packages needed)
VERIFICATION.txt  Automated and real-browser QA results and limits
LICENSE      MIT license and copyright notice

To run tests with Node.js 20 or later:
  node --test tests/*.test.js

For development, use Node.js 24 LTS (also specified in .nvmrc), then run:
  npm ci
  npm run lint
  npm test

ESLint checks the JavaScript source, tests, configuration, and inline scripts
in the HTML files. Warnings fail the lint command. To apply available automatic
fixes, run npm run lint:fix. Keep the embedded engine.js, app.js, and style.css
in Rank-Anything.html synchronized when editing the modular files.

The npm dependencies are development tools only. No dependencies or build
process are required to open the app. The source is included for inspection
and modification. No external network requests are made by the app.

LICENSE
MIT License. Copyright (c) 2026 Bryce Johansen.
See LICENSE for the full terms, including the warranty and liability disclaimer.
The same license notice is embedded in the standalone Rank-Anything.html file.
