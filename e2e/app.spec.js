const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function createCollection(page, name = 'Books') {
  await page.getByRole('button', { name: 'Create a collection', exact: true }).click();
  await page.locator('dialog input').fill(name);
  await page.getByRole('button', { name: 'Create collection', exact: true }).click();
}

async function addItems(page, names) {
  await page.getByRole('textbox', { name: 'Items, one per line' }).fill(names.join('\n'));
  await page.getByRole('button', { name: 'Add to collection', exact: true }).click();
}

async function chooseItems(page, names) {
  await page.getByRole('button', { name: 'Rank', exact: true }).click();
  await page.getByRole('button', { name: 'Choose items', exact: true }).click();
  for (const name of names) {
    await page.getByRole('checkbox', { name, exact: true }).check();
  }
  await page.getByRole('button', { name: 'Start chosen ballot', exact: true }).click();
}

async function savedData(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('rank-anything-v1')));
}

async function removeItem(page, name, confirm = true) {
  await page
    .locator('.list-item')
    .filter({ has: page.getByText(name, { exact: true }) })
    .getByRole('button', { name: 'Remove', exact: true })
    .click();
  await page.getByRole('button', { name: confirm ? 'Remove item' : 'Cancel', exact: true }).click();
}

for (const entry of ['index.html', 'Rank-Anything.html']) {
  test.describe(entry, () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(pathToFileURL(path.resolve(__dirname, '..', entry)).href);
    });

    test('creating a collection preserves drafts until the user confirms and completes creation', async ({
      page,
    }) => {
      await createCollection(page);
      await addItems(page, ['Alpha', 'Beta', 'Gamma']);
      await chooseItems(page, ['Alpha', 'Beta', 'Gamma']);
      await page.getByRole('button', { name: 'Tie Beta with the rank above', exact: true }).click();

      await page.getByRole('button', { name: '+ New collection', exact: true }).click();
      await expect(page.getByRole('dialog', { name: 'Leave this ballot?' })).toBeVisible();
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
      await expect(
        page.getByRole('button', { name: '+ New collection', exact: true }),
      ).toBeFocused();
      await expect(page.locator('.rank-group').first()).toContainText('Beta');

      await page.getByRole('button', { name: '+ New collection', exact: true }).click();
      await page.getByRole('button', { name: 'Leave ballot', exact: true }).click();
      await expect(page.getByRole('dialog').getByRole('textbox')).toBeFocused();
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
      await expect(
        page.getByRole('button', { name: '+ New collection', exact: true }),
      ).toBeFocused();

      await page.keyboard.press('Enter');
      await page.getByRole('button', { name: 'Leave ballot', exact: true }).click();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(
        page.getByRole('button', { name: '+ New collection', exact: true }),
      ).toBeFocused();
      await page.getByRole('button', { name: 'Save ballot →', exact: true }).click();
      const saved = await savedData(page);
      const collection = saved.collections[0];
      expect(collection.ballots[0].groups[0]).toEqual(
        collection.items.slice(0, 2).map((item) => item.id),
      );

      await page.getByRole('button', { name: 'Next round', exact: true }).click();
      await page.getByRole('button', { name: '+ New collection', exact: true }).click();
      await page.getByRole('button', { name: 'Leave ballot', exact: true }).click();
      await page.locator('dialog input').fill('Films');
      await page.getByRole('button', { name: 'Create collection', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Films', exact: true })).toBeVisible();
      await expect(page.getByRole('textbox', { name: 'Items, one per line' })).toBeFocused();
      const after = await savedData(page);
      expect(after.collections).toHaveLength(2);
      expect(after.collections[0].ballots).toEqual(collection.ballots);
    });

    test('view navigation and collection changes keep keyboard focus in context', async ({
      page,
    }) => {
      expect(await page.evaluate(() => document.activeElement.tagName)).toBe('BODY');
      await createCollection(page);
      await expect(page.getByRole('textbox', { name: 'Items, one per line' })).toBeFocused();
      await addItems(page, ['Alpha', 'Beta']);
      await expect(page.getByRole('textbox', { name: 'Items, one per line' })).toBeFocused();

      const results = page.getByRole('button', { name: 'Results', exact: true });
      await results.focus();
      await page.keyboard.press('Enter');
      await expect(results).toBeFocused();
      await expect(results).toHaveAttribute('aria-current', 'page');
      await page.keyboard.press('Tab');
      const items = page.getByRole('button', { name: 'Items', exact: true });
      await expect(items).toBeFocused();
      await page.keyboard.press('Space');
      await expect(items).toBeFocused();
      await expect(items).toHaveAttribute('aria-current', 'page');
      await page.keyboard.press('Tab');
      await expect(page.getByRole('button', { name: 'History', exact: true })).toBeFocused();

      await page.getByRole('button', { name: '+ New collection', exact: true }).click();
      await page.getByRole('dialog').getByRole('textbox').fill('Films');
      await page.keyboard.press('Enter');
      const books = page
        .getByRole('navigation', { name: 'Collections', exact: true })
        .getByRole('button', { name: 'Books 2', exact: true });
      await books.focus();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('heading', { name: 'Books', exact: true })).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(page.getByRole('button', { name: 'Rank', exact: true })).toBeFocused();
      await page.getByRole('button', { name: 'Start a ballot', exact: true }).click();
      await page
        .getByRole('navigation', { name: 'Collections', exact: true })
        .getByRole('button', { name: 'Films 0', exact: true })
        .click();
      await page.getByRole('button', { name: 'Leave ballot', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Films', exact: true })).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(page.getByRole('button', { name: 'Rank', exact: true })).toBeFocused();
    });

    test('editing, cancelling, and removing items return focus to useful controls', async ({
      page,
    }) => {
      await createCollection(page);
      await addItems(page, ['Alpha', 'Beta']);
      const edit = (name) =>
        page
          .locator('.list-item')
          .filter({ has: page.getByText(name, { exact: true }) })
          .getByRole('button', { name: 'Edit', exact: true });
      await edit('Beta').focus();
      await page.keyboard.press('Enter');
      await page.getByRole('dialog').getByRole('textbox').fill('Renamed Beta');
      await page.keyboard.press('Enter');
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(edit('Renamed Beta')).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(
        page
          .locator('.list-item')
          .filter({ hasText: 'Renamed Beta' })
          .getByRole('button', { name: 'Remove', exact: true }),
      ).toBeFocused();

      for (const cancel of ['Cancel', 'Escape']) {
        await edit('Renamed Beta').click();
        await page.getByRole('dialog').getByRole('textbox').fill('Discard this change');
        if (cancel === 'Escape') await page.keyboard.press('Escape');
        else await page.getByRole('button', { name: 'Cancel', exact: true }).click();
        await expect(edit('Renamed Beta')).toBeFocused();
      }
      const rename = page.getByRole('button', { name: 'Rename collection', exact: true });
      await rename.click();
      await page.getByRole('dialog').getByRole('textbox').fill('Reading');
      await page.keyboard.press('Enter');
      await expect(rename).toBeFocused();
      await expect(page.getByRole('heading', { name: 'Reading', exact: true })).toBeVisible();

      await removeItem(page, 'Renamed Beta');
      await expect(page.getByRole('heading', { name: 'All items', exact: true })).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(edit('Alpha')).toBeFocused();
      await removeItem(page, 'Alpha');
      await expect(page.getByRole('textbox', { name: 'Items, one per line' })).toBeFocused();
      await page.getByRole('button', { name: 'Delete collection', exact: true }).click();
      await page
        .getByRole('dialog')
        .getByRole('button', { name: 'Delete collection', exact: true })
        .click();
      await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(
        page.getByRole('button', { name: 'Create a collection', exact: true }),
      ).toBeFocused();
    });

    test('ballot actions move focus to the next step and chooser cancellation restores it', async ({
      page,
    }) => {
      await createCollection(page);
      await addItems(page, ['Alpha', 'Beta']);
      await chooseItems(page, ['Alpha', 'Beta']);
      const heading = page.getByRole('heading', { name: 'Go with your preference', exact: true });
      await expect(heading).toBeFocused();
      await page.keyboard.press('Tab');
      const chooser = page.getByRole('button', { name: 'Choose items', exact: true });
      await expect(chooser).toBeFocused();
      await page.keyboard.press('Enter');
      await page.keyboard.press('Escape');
      await expect(chooser).toBeFocused();
      await page.keyboard.press('Enter');
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
      await expect(chooser).toBeFocused();

      await page.getByRole('button', { name: 'Save ballot →', exact: true }).focus();
      await page.keyboard.press('Space');
      const next = page.getByRole('button', { name: 'Next round', exact: true });
      await expect(next).toBeFocused();
      expect((await savedData(page)).collections[0].ballots).toHaveLength(1);
      await page.keyboard.press('Tab');
      await expect(page.getByRole('button', { name: 'View results', exact: true })).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('button', { name: 'Results', exact: true })).toBeFocused();
      await page.getByRole('button', { name: 'Rank', exact: true }).click();
      await next.focus();
      await page.keyboard.press('Enter');
      await expect(heading).toBeFocused();
      await page.getByRole('button', { name: 'Discard ballot', exact: true }).click();
      await page.getByRole('button', { name: 'Discard', exact: true }).click();
      const start = page.getByRole('button', { name: 'Start a ballot', exact: true });
      await expect(start).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(heading).toBeFocused();
      await page.getByRole('button', { name: 'Save ballot →', exact: true }).focus();
      await page.keyboard.press('Enter');
      await expect(next).toBeFocused();
      expect((await savedData(page)).collections[0].ballots).toHaveLength(2);
    });

    test('history pagination and deletion retain focus when controls disappear or become disabled', async ({
      page,
    }) => {
      await createCollection(page);
      await addItems(page, ['Alpha', 'Beta']);
      await chooseItems(page, ['Alpha', 'Beta']);
      await page.getByRole('button', { name: 'Save ballot →', exact: true }).click();
      const data = await savedData(page);
      const ballot = data.collections[0].ballots[0];
      data.collections[0].ballots = Array.from({ length: 51 }, (_, i) => ({
        ...ballot,
        id: 'ballot-' + i,
      }));
      await page.evaluate(
        (backup) => localStorage.setItem('rank-anything-v1', JSON.stringify(backup)),
        data,
      );
      await page.reload();
      await page.getByRole('button', { name: 'History', exact: true }).click();
      const older = page.getByRole('button', { name: 'Older', exact: true });
      const newer = page.getByRole('button', { name: 'Newer', exact: true });
      await older.focus();
      await page.keyboard.press('Enter');
      await expect(newer).toBeFocused();
      await expect(older).toBeDisabled();
      await page.keyboard.press('Space');
      await expect(older).toBeFocused();
      await expect(newer).toBeDisabled();
      await page.keyboard.press('Enter');
      await page.getByRole('button', { name: 'Delete ballot', exact: true }).click();
      await page.getByRole('button', { name: 'Remove ballot', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Your ballots', exact: true })).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(
        page.getByRole('button', { name: 'Undo this ballot', exact: true }),
      ).toBeFocused();

      data.collections[0].ballots = [ballot];
      await page.evaluate(
        (backup) => localStorage.setItem('rank-anything-v1', JSON.stringify(backup)),
        data,
      );
      await page.reload();
      await page.getByRole('button', { name: 'History', exact: true }).click();
      await page.getByRole('button', { name: 'Undo this ballot', exact: true }).click();
      await page.getByRole('button', { name: 'Remove ballot', exact: true }).click();
      await expect(
        page.getByRole('heading', { name: 'Every preference has a history', exact: true }),
      ).toBeFocused();
    });

    test('cancelling deletion and removing an unrelated item preserve draft ties and skips', async ({
      page,
    }) => {
      await createCollection(page);
      await addItems(page, ['Alpha', 'Beta', 'Gamma', 'Delta']);
      const [alpha, beta, gamma] = (await savedData(page)).collections[0].items.map(
        (item) => item.id,
      );
      await chooseItems(page, ['Alpha', 'Beta', 'Gamma']);
      await page.getByRole('button', { name: 'Tie Beta with the rank above', exact: true }).click();
      await page
        .getByRole('button', { name: 'Skip Gamma — not familiar or not today', exact: true })
        .click();
      await page.getByRole('button', { name: 'Items', exact: true }).click();
      const before = await savedData(page);
      await removeItem(page, 'Alpha', false);
      expect(await savedData(page)).toEqual(before);
      await removeItem(page, 'Delta');
      await page.getByRole('button', { name: 'Rank', exact: true }).click();
      await expect(page.locator('.rank-group')).toHaveCount(1);
      await expect(page.locator('.rank-group')).toContainText('Alpha');
      await expect(page.locator('.rank-group')).toContainText('Beta');
      await expect(page.locator('.skipped')).toContainText('Gamma');
      await page.getByRole('button', { name: 'Save ballot →', exact: true }).click();
      const ballot = (await savedData(page)).collections[0].ballots[0];
      expect(ballot.groups).toEqual([[alpha, beta]]);
      expect(ballot.skipped).toEqual([gamma]);
    });

    test('deleting ranked, tied, and skipped items retains the remaining draft order', async ({
      page,
    }) => {
      await createCollection(page);
      await addItems(page, ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon']);
      const [, , gamma, delta] = (await savedData(page)).collections[0].items.map(
        (item) => item.id,
      );
      await chooseItems(page, ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon']);
      await page.getByRole('button', { name: 'Move Gamma up', exact: true }).click();
      await page.getByRole('button', { name: 'Tie Beta with the rank above', exact: true }).click();
      await page
        .getByRole('button', { name: 'Skip Epsilon — not familiar or not today', exact: true })
        .click();
      await page.getByRole('button', { name: 'Items', exact: true }).click();
      for (const name of ['Alpha', 'Beta', 'Epsilon']) await removeItem(page, name);
      await page.getByRole('button', { name: 'Rank', exact: true }).click();
      await expect(page.locator('.rank-group')).toHaveCount(2);
      await expect(page.locator('.rank-group').first()).toContainText('Gamma');
      await expect(page.locator('.rank-group').last()).toContainText('Delta');
      await expect(page.locator('.skipped')).toHaveCount(0);
      await page.getByRole('button', { name: 'Save ballot →', exact: true }).click();
      const ballot = (await savedData(page)).collections[0].ballots[0];
      expect(ballot.groups).toEqual([[gamma], [delta]]);
      expect(ballot.skipped).toEqual([]);
    });

    test('an incomplete draft stays visible and supports restoring skips or discarding', async ({
      page,
    }) => {
      await createCollection(page);
      await addItems(page, ['Alpha', 'Beta', 'Gamma']);
      const [alpha, , gamma] = (await savedData(page)).collections[0].items.map((item) => item.id);
      await chooseItems(page, ['Alpha', 'Beta', 'Gamma']);
      await page
        .getByRole('button', { name: 'Skip Gamma — not familiar or not today', exact: true })
        .click();
      await page.getByRole('button', { name: 'Items', exact: true }).click();
      await removeItem(page, 'Beta');
      await page.getByRole('button', { name: 'Rank', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Save ballot →', exact: true })).toBeDisabled();
      await expect(page.getByRole('status')).toContainText('At least two ranked items are needed');
      await page.getByRole('button', { name: 'Restore Gamma', exact: true }).click();
      await page.getByRole('button', { name: 'Save ballot →', exact: true }).click();
      expect((await savedData(page)).collections[0].ballots[0].groups).toEqual([[alpha], [gamma]]);

      await chooseItems(page, ['Alpha', 'Gamma']);
      await page.getByRole('button', { name: 'Items', exact: true }).click();
      await removeItem(page, 'Gamma');
      await page.getByRole('button', { name: 'Rank', exact: true }).click();
      await expect(page.locator('.rank-group')).toContainText('Alpha');
      await expect(page.getByRole('button', { name: 'Save ballot →', exact: true })).toBeDisabled();
      await expect(page.getByRole('status')).toContainText('Add more items in Items');
      await page.getByRole('button', { name: 'Discard ballot', exact: true }).click();
      await page.getByRole('button', { name: 'Discard', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Add your items', exact: true })).toBeVisible();
    });

    test('Unicode duplicates are skipped and invalid pasted text can be corrected', async ({
      page,
    }) => {
      await createCollection(page);
      await addItems(page, ['Straße', 'Café']);
      await addItems(page, ['Strasse', 'Cafe\u0301', 'New item', 'Ｎｅｗ item']);
      expect((await savedData(page)).collections[0].items.map((item) => item.name)).toEqual([
        'Straße',
        'Café',
        'New item',
      ]);
      await expect(page.getByRole('status')).toContainText('3 duplicate names skipped');

      const before = await savedData(page);
      const invalid = 'Valid addition\nbad\tname';
      await addItems(page, invalid.split('\n'));
      const input = page.getByRole('textbox', { name: 'Items, one per line' });
      await expect(page.getByRole('status')).toContainText('Change not saved');
      await expect(input).toHaveValue(invalid);
      expect(await savedData(page)).toEqual(before);
      await addItems(page, ['Valid addition', 'Corrected name']);
      expect((await savedData(page)).collections[0].items).toHaveLength(5);
    });

    test('dialog errors are exposed to assistive technology and clear after correction', async ({
      page,
    }) => {
      await page.getByRole('button', { name: 'Create a collection', exact: true }).click();
      const creation = page.getByRole('dialog');
      await creation.getByRole('textbox').fill('bad\tname');
      await creation.getByRole('button', { name: 'Create collection', exact: true }).click();
      await expect(creation.getByRole('alert')).toContainText('cannot contain control characters');
      await expect(creation.getByRole('textbox')).toHaveValue('bad\tname');
      await creation.getByRole('textbox').fill('Books');
      await creation.getByRole('button', { name: 'Create collection', exact: true }).click();
      await addItems(page, ['Alpha', 'Straße']);
      const before = await savedData(page);
      await page
        .locator('.list-item')
        .filter({ has: page.getByText('Alpha', { exact: true }) })
        .getByRole('button', { name: 'Edit', exact: true })
        .click();
      const dialog = page.getByRole('dialog', { name: 'Rename item', exact: true });
      const input = dialog.getByRole('textbox');
      await input.fill('Strasse');
      await input.press('Enter');
      const message = 'Another item already uses that name.';
      await expect(dialog.getByRole('alert')).toHaveText(message);
      await expect(input).toHaveAccessibleDescription(message);
      await expect(input).toHaveAttribute('aria-invalid', 'true');
      await expect(input).toBeFocused();
      expect(await savedData(page)).toEqual(before);
      const client = await page.context().newCDPSession(page);
      const { nodes } = await client.send('Accessibility.getFullAXTree');
      expect(nodes.some((node) => !node.ignored && node.role?.value === 'alert')).toBe(true);
      expect(
        nodes.find(
          (node) =>
            !node.ignored && node.role?.value === 'textbox' && node.name?.value === 'Rename item',
        )?.description?.value,
      ).toBe(message);
      await client.detach();
      await input.fill('');
      await input.press('Enter');
      await expect(dialog.getByRole('alert')).toHaveText('Please enter a name.');
      await input.fill('Renamed Alpha');
      await expect(input).toHaveAttribute('aria-invalid', 'false');
      await expect(input).toHaveAccessibleDescription('');
      await expect(dialog.getByRole('alert')).toHaveCount(0);
      await input.press('Enter');
      await expect(dialog).toHaveCount(0);
      expect((await savedData(page)).collections[0].items.map((item) => item.name)).toEqual([
        'Renamed Alpha',
        'Straße',
      ]);
    });

    test('invalid item and collection renames retain input and allow correction without changing saved data', async ({
      page,
    }) => {
      await createCollection(page);
      await addItems(page, ['Alpha', 'Beta']);
      for (const target of ['item', 'collection']) {
        const before = await savedData(page);
        const opener =
          target === 'item'
            ? page.getByRole('button', { name: 'Edit', exact: true }).first()
            : page.getByRole('button', { name: 'Rename collection', exact: true });
        await opener.click();
        const dialog = page.getByRole('dialog');
        const input = dialog.getByRole('textbox');
        for (const [value, error] of [
          ['bad\tname', 'cannot contain control characters'],
          ['\u0344'.repeat(101), 'normalized characters'],
        ]) {
          await input.fill(value);
          await input.press('Enter');
          await expect(dialog).toBeVisible();
          await expect(input).toHaveValue(value);
          await expect(input).toHaveAttribute('aria-invalid', 'true');
          await expect(input).toBeFocused();
          await expect(dialog.getByRole('alert')).toContainText(error);
          expect(await savedData(page)).toEqual(before);
        }
        await input.fill('Cafe\u0301');
        await expect(input).toHaveAttribute('aria-invalid', 'false');
        await input.press('Enter');
        await expect(dialog).toHaveCount(0);
        await expect(opener).toBeFocused();
        const after = (await savedData(page)).collections[0];
        expect(target === 'item' ? after.items[0].name : after.name).toBe('Café');
        expect(after.ballots).toEqual(before.collections[0].ballots);
      }
    });

    test('long names stay inside Results and History across desktop, tablet, and narrow widths', async ({
      page,
    }) => {
      await createCollection(page);
      const names = ['A', 'B', 'C'].map((letter) => letter.repeat(200));
      await addItems(page, names);
      await chooseItems(page, names);
      await page
        .getByRole('button', {
          name: 'Skip ' + names[2] + ' — not familiar or not today',
          exact: true,
        })
        .click();
      await page.getByRole('button', { name: 'Save ballot →', exact: true }).click();
      for (const width of [1280, 800, 601, 390, 320]) {
        await page.setViewportSize({ width, height: 900 });
        for (const tab of ['Results', 'History', 'Items', 'Rank', 'Guide']) {
          await page.getByRole('button', { name: tab, exact: true }).click();
          if (tab === 'Results' || tab === 'History') {
            const text = page.getByText(tab === 'Results' ? names[2] : 'Skipped: ' + names[2], {
              exact: true,
            });
            const size = await text.evaluate((node) => ({
              width: node.clientWidth,
              content: node.scrollWidth,
            }));
            expect(size.content, `${tab} text at ${width}px`).toBeLessThanOrEqual(size.width + 1);
          }
          if (tab === 'Results') {
            await page.getByText('Inspect the pairwise evidence', { exact: true }).click();
            await expect(page.getByRole('table')).toBeVisible();
          }
          const content = await page.evaluate(() => document.documentElement.scrollWidth);
          expect(content, `${tab} page at ${width}px`).toBeLessThanOrEqual(width + 1);
        }
      }
    });

    test('history starts with newest ballots after changing collections, importing, or saving a round', async ({
      page,
    }) => {
      await createCollection(page);
      await addItems(page, ['Alpha', 'Beta']);
      await chooseItems(page, ['Alpha', 'Beta']);
      await page.getByRole('button', { name: 'Save ballot →', exact: true }).click();
      const data = await savedData(page);
      const first = data.collections[0];
      const ballot = first.ballots[0];
      first.ballots = Array.from({ length: 51 }, (_, i) => ({ ...ballot, id: 'ballot-' + i }));
      data.collections.push({ ...first, id: 'films', name: 'Films' });
      await page.evaluate(
        (backup) => localStorage.setItem('rank-anything-v1', JSON.stringify(backup)),
        data,
      );
      await page.reload();
      const history = page.getByRole('button', { name: 'History', exact: true });
      const older = page.getByRole('button', { name: 'Older', exact: true });
      const pageNumber = page.getByText(/^Page \d+ of \d+$/);
      await history.click();
      await older.click();
      await page.getByRole('button', { name: 'Guide', exact: true }).click();
      await history.click();
      await expect(pageNumber).toHaveText('Page 2 of 2');
      for (const name of ['Films 2', 'Books 2']) {
        await page
          .getByRole('navigation', { name: 'Collections', exact: true })
          .getByRole('button', { name, exact: true })
          .click();
        await history.click();
        await expect(pageNumber).toHaveText('Page 1 of 2');
        await expect(
          page.getByRole('button', { name: 'Undo this ballot', exact: true }),
        ).toBeVisible();
        await older.click();
      }
      await chooseItems(page, ['Alpha', 'Beta']);
      await page.getByRole('button', { name: 'Save ballot →', exact: true }).click();
      await history.click();
      await expect(pageNumber).toHaveText('Page 1 of 2');
      await expect(page.getByText('Ballot 52', { exact: true })).toBeVisible();
      await older.click();
      await page.locator('input[type="file"]').setInputFiles({
        name: 'history.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify({ version: 1, collections: [data.collections[1]] })),
      });
      await page.getByRole('button', { name: 'Import collections', exact: true }).click();
      await history.click();
      await expect(pageNumber).toHaveText('Page 1 of 2');
      await expect(page.getByText('Ballot 51', { exact: true })).toBeVisible();
    });

    for (const width of [1280, 390]) {
      test(`long names wrap in the chooser and skipped list at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await createCollection(page);
        const longName = 'X'.repeat(200);
        await addItems(page, ['Alpha', 'Beta', longName]);
        await page.getByRole('button', { name: 'Rank', exact: true }).click();
        await page.getByRole('button', { name: 'Choose items', exact: true }).click();
        const dialog = page.getByRole('dialog');
        const longRow = dialog
          .locator('label')
          .filter({ has: page.getByText(longName, { exact: true }) });
        const rowSize = await longRow.evaluate((row) => ({
          width: row.clientWidth,
          content: row.scrollWidth,
        }));
        expect(rowSize.content).toBeLessThanOrEqual(rowSize.width + 1);
        const checkbox = dialog.getByRole('checkbox', { name: longName, exact: true });
        const box = await checkbox.boundingBox();
        expect(box.width).toBeGreaterThanOrEqual(12);
        for (const name of ['Alpha', 'Beta', longName])
          await dialog.getByRole('checkbox', { name, exact: true }).check();
        await page.getByRole('button', { name: 'Start chosen ballot', exact: true }).click();
        await page
          .getByRole('button', {
            name: `Skip ${longName} — not familiar or not today`,
            exact: true,
          })
          .click();
        const restore = page.getByRole('button', { name: 'Restore ' + longName, exact: true });
        await expect(restore).toBeFocused();
        const layout = await page.evaluate(() => ({
          width: innerWidth,
          content: document.documentElement.scrollWidth,
          scroll: scrollX,
        }));
        expect(layout.content).toBeLessThanOrEqual(layout.width + 1);
        expect(layout.scroll).toBe(0);
        const restoreBox = await restore.boundingBox();
        expect(restoreBox.x).toBeGreaterThanOrEqual(0);
        expect(restoreBox.x + restoreBox.width).toBeLessThanOrEqual(width);
        await restore.click();
        await page.getByRole('button', { name: 'Save ballot →', exact: true }).click();
        const collection = (await savedData(page)).collections[0];
        expect(collection.items[2].name).toBe(longName);
        expect(collection.ballots[0].groups.flat()).toEqual(
          collection.items.map((item) => item.id),
        );
      });
    }

    test('unadded lists survive editing and stay separate across views and collections', async ({
      page,
    }) => {
      await createCollection(page, 'First');
      await addItems(page, ['Alpha', 'Beta']);
      const input = page.getByRole('textbox', { name: 'Items, one per line' });
      const pending = '  Pending one\n\nPending two  ';
      await input.fill(pending);
      await page
        .locator('.list-item')
        .filter({ has: page.getByText('Alpha', { exact: true }) })
        .getByRole('button', { name: 'Edit', exact: true })
        .click();
      await page.locator('dialog input').fill('Renamed Alpha');
      await page.getByRole('button', { name: 'Save name', exact: true }).click();
      await expect(input).toHaveValue(pending);
      await removeItem(page, 'Beta');
      await page.getByRole('button', { name: 'Results', exact: true }).click();
      await page.getByRole('button', { name: 'Items', exact: true }).click();
      await expect(input).toHaveValue(pending);

      await page.getByRole('button', { name: '+ New collection', exact: true }).click();
      await page.locator('dialog input').fill('Second');
      await page.getByRole('button', { name: 'Create collection', exact: true }).click();
      await expect(input).toHaveValue('');
      await input.fill('Second pending');
      await page
        .getByRole('navigation', { name: 'Collections' })
        .getByRole('button', { name: /^First/ })
        .click();
      await page.getByRole('button', { name: 'Items', exact: true }).click();
      await expect(input).toHaveValue(pending);
      await page.getByRole('button', { name: 'Add to collection', exact: true }).click();
      await expect(input).toHaveValue('');
      await page
        .getByRole('navigation', { name: 'Collections' })
        .getByRole('button', { name: /^Second/ })
        .click();
      await page.getByRole('button', { name: 'Items', exact: true }).click();
      await expect(input).toHaveValue('Second pending');
      const collections = (await savedData(page)).collections;
      expect(collections[0].items.map((item) => item.name)).toEqual([
        'Renamed Alpha',
        'Pending one',
        'Pending two',
      ]);
      expect(collections[1].items).toEqual([]);
      await input.fill('');
      await page.getByRole('button', { name: 'Guide', exact: true }).click();
      await page.getByRole('button', { name: 'Items', exact: true }).click();
      await expect(input).toHaveValue('');
    });

    test('keyboard skipping and restoring follow the item, including an otherwise empty ballot', async ({
      page,
    }) => {
      await createCollection(page);
      await addItems(page, ['Alpha', 'Beta']);
      await chooseItems(page, ['Alpha', 'Beta']);
      const skip = (name) =>
        page.getByRole('button', {
          name: 'Skip ' + name + ' — not familiar or not today',
          exact: true,
        });
      const restore = (name) => page.getByRole('button', { name: 'Restore ' + name, exact: true });
      await skip('Beta').focus();
      await page.keyboard.press('Enter');
      await expect(restore('Beta')).toBeFocused();
      await skip('Alpha').focus();
      await page.keyboard.press('Enter');
      await expect(restore('Alpha')).toBeFocused();
      await expect(page.locator('.rank-item')).toHaveCount(0);
      await page.keyboard.press('Enter');
      await expect(skip('Alpha')).toBeFocused();
      await restore('Beta').focus();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('button', { name: 'Move Beta up', exact: true })).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page.locator('.rank-group').first()).toContainText('Beta');
      await page.getByRole('button', { name: 'Save ballot →', exact: true }).click();
      const collection = (await savedData(page)).collections[0];
      expect(collection.ballots[0].groups).toEqual([
        [collection.items[1].id],
        [collection.items[0].id],
      ]);
      expect(collection.ballots[0].skipped).toEqual([]);
    });

    test('keyboard ranking keeps focus on an enabled control at both boundaries', async ({
      page,
    }) => {
      await createCollection(page);
      await addItems(page, ['Alpha', 'Beta', 'Gamma']);
      await chooseItems(page, ['Alpha', 'Beta', 'Gamma']);
      await page.getByRole('button', { name: 'Move Beta up', exact: true }).focus();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('button', { name: 'Move Beta down', exact: true })).toBeFocused();
      await expect(page.locator('.rank-group').first()).toContainText('Beta');
      await page.keyboard.press('Enter');
      await expect(page.getByRole('button', { name: 'Move Beta down', exact: true })).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('button', { name: 'Move Beta up', exact: true })).toBeFocused();
      await expect(page.locator('.rank-group').last()).toContainText('Beta');
    });

    test('offline save, reload, backup import, and narrow layouts work', async ({ page }) => {
      const errors = [];
      const network = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('request', (request) => {
        if (/^https?:/.test(request.url())) network.push(request.url());
      });
      await page.reload();
      await createCollection(page);
      await addItems(page, ['Alpha', 'Beta', 'Gamma']);
      await chooseItems(page, ['Alpha', 'Beta']);
      await page.getByRole('button', { name: 'Save ballot →', exact: true }).click();
      const before = await savedData(page);
      await page.reload();
      expect(await savedData(page)).toEqual(before);

      const downloaded = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Export backup', exact: true }).click();
      const backup = await downloaded;
      await page.locator('input[type="file"]').setInputFiles(await backup.path());
      await page.getByRole('button', { name: 'Import collections', exact: true }).click();
      const after = await savedData(page);
      expect(after.collections).toHaveLength(2);
      expect(after.collections[0]).toEqual(before.collections[0]);
      expect(after.collections[1].ballots).toEqual(before.collections[0].ballots);

      await page.setViewportSize({ width: 390, height: 844 });
      const layout = await page.evaluate(() => ({
        width: innerWidth,
        content: document.documentElement.scrollWidth,
      }));
      expect(layout.content).toBeLessThanOrEqual(layout.width);
      expect(errors).toEqual([]);
      expect(network).toEqual([]);
    });
  });
}
