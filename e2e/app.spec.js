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
      await expect(page.locator('.rank-group').first()).toContainText('Beta');

      await page.getByRole('button', { name: '+ New collection', exact: true }).click();
      await page.getByRole('button', { name: 'Leave ballot', exact: true }).click();
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
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
      const after = await savedData(page);
      expect(after.collections).toHaveLength(2);
      expect(after.collections[0].ballots).toEqual(collection.ballots);
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
