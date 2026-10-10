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
