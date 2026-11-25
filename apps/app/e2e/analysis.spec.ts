import { expect, test } from '@playwright/test';
import { addFromPicker, goToStep, saveSegment, fitFiles, importAll, nav, openWithFolder } from './support';

test.describe('Analysis workspace', () => {
  test('Rule blocks compared, ranked and curved', async ({ page }) => {
    await openWithFolder(page, await fitFiles(12, '2026-05-01'));
    await importAll(page);
    // A link of the former Ask screen opens as a block here: the fastest 10 minutes since 1 March, carried by the link.
    await page.goto('/ask?kind=best&window=600s&from=2026-03-01');
    const fastest = page.locator('.item-chip', { hasText: 'Fastest 10 min · since 2026-03-01' });
    await expect(fastest).toHaveCount(1, { timeout: 30_000 });
    await expect(page).toHaveURL(/\/compare\?items=q/);
    // A second block, made in the one editor (New block… in the picker opens it on the Blocks screen):
    // whole runs since 1 March, each read by its maximum; then added here from the picker.
    await page.getByRole('button', { name: '+ Add segment or run' }).click();
    await page.getByRole('dialog', { name: 'Add segment or run' }).getByRole('link', { name: 'New segment…' }).click();
    const dialog = page.getByRole('dialog', { name: 'New segment' });
    // Its first step the period, the segment the third.
    await dialog.getByLabel('From', { exact: true }).fill('2026-03-01');
    await goToStep(dialog, 'Segment');
    await dialog.getByRole('radio', { name: 'Whole run' }).click();
    await dialog.getByRole('radio', { name: 'maximum' }).click();
    await expect(dialog.locator('.preview-count')).toContainText('12 efforts in 12 runs', { timeout: 30_000 });
    await saveSegment(dialog);
    await expect(page.getByRole('region', { name: 'Segments', exact: true }).getByRole('row', { name: /^Runs · since 2026-03-01 · maximum/ })).toBeVisible({ timeout: 30_000 });
    await page.goBack();
    await addFromPicker(page, 'Runs · since 2026-03-01 · maximum');
    const whole = page.locator('.item-chip', { hasText: 'Runs · since 2026-03-01 · maximum' });
    await expect(whole).toHaveCount(1, { timeout: 30_000 });

    // Pace and heart rate, chosen above the tabs: one chart each, both blocks on them; no table of changes under them ("ok usun mi to wogole z dolu").
    const metrics = page.getByRole('group', { name: 'Metrics', exact: true });
    for (const m of ['Pace', 'Heart rate']) {
      const b = metrics.getByRole('button', { name: m, exact: true });
      if ((await b.getAttribute('aria-pressed')) !== 'true') await b.click();
    }
    const hr = page.getByRole('img', { name: 'Over time · Heart rate (bpm)' });
    await expect(hr.locator('.trend-line')).toHaveCount(2, { timeout: 30_000 });
    await expect(page.getByRole('table', { name: 'Changes' })).toHaveCount(0);

    // A click on a point opens its run, the segment selected.
    const clickPoint = async (chart: typeof hr) => {
      await chart.scrollIntoViewIfNeeded();
      const dot = (await chart.locator('circle[r="4.5"]').last().boundingBox())!;
      await page.mouse.move(dot.x + dot.width / 2, dot.y + dot.height / 2);
      await expect(page.locator('.tooltip')).toContainText('Click to open the run');
      await page.mouse.click(dot.x + dot.width / 2, dot.y + dot.height / 2);
      await expect(page).toHaveURL(/\/run\?id=\d{8}-\d{6}&from=\d+&to=\d+/);
      await expect(page.locator('.range-stats h3')).toHaveText('Selection');
      await page.goBack();
      await expect(page.locator('.item-chip')).toHaveCount(2);
    };
    await clickPoint(hr);

    // The Over time chart is a widget: Pin in its corner puts it on the Dashboard, the same charts there ("Pin na kazdej karcie-widgecie").
    await page.getByRole('button', { name: /^Pin Over time · .+ to the dashboard$/ }).click();
    await expect(page.getByRole('button', { name: /^Pin Over time · / })).toHaveAttribute('aria-pressed', 'true');
    await nav(page, 'Dashboard');
    const widget = page.getByRole('region', { name: /^Over time · / });
    await expect(widget.getByRole('img', { name: 'Over time · Heart rate (bpm)' }).locator('.trend-line')).toHaveCount(2, { timeout: 30_000 });
    await page.goBack();
    await expect(page.locator('.item-chip')).toHaveCount(2);

    // The sections are tabs, kept in the link: Trends first, then Efforts and A/B (no pace or power curve: "usun"); one at a time.
    const tabs = page.getByRole('tablist', { name: 'Compare sections' });
    await expect(tabs.getByRole('tab')).toHaveText(['Trends', 'Efforts', 'A/B']);
    await expect(tabs.getByRole('tab', { name: 'Trends' })).toHaveAttribute('aria-selected', 'true');
    await tabs.getByRole('tab', { name: 'Efforts' }).click();
    await expect(page).toHaveURL(/tab=segments/);
    // The metrics are chosen above the tabs, for Trends, Efforts and A/B alike ("moze daj je powyzej").
    await expect(page.getByRole('group', { name: 'Metrics', exact: true })).toHaveCount(1);
    // The fastest-10-minutes block by run, sorted by a click on a column's head ("sortowanie na headerze kolumn"):
    // the newest first at first, Pace the fastest first, again the slowest; an effort opens its run with the stretch selected.
    const segments = page.getByRole('table', { name: 'Efforts by run' });
    await page.getByLabel('Segment', { exact: true }).selectOption({ label: 'Fastest 10 min · since 2026-03-01' });
    const runRows = segments.locator('tbody tr.reps-run-row');
    await expect.poll(() => runRows.count(), { timeout: 30_000 }).toBeGreaterThan(2);
    const paceHead = segments.getByRole('columnheader', { name: /^Pace/ });
    const paceOf = async (n: number) => { const [m, x] = (await runRows.nth(n).getByRole('cell').nth(2).locator('.strong').textContent())!.split(':').map(Number); return m * 60 + x; };
    await paceHead.getByRole('button').click();
    await expect(paceHead).toHaveAttribute('aria-sort', 'ascending');
    expect(await paceOf(0)).toBeLessThanOrEqual(await paceOf(1));
    await paceHead.getByRole('button').click();
    await expect(paceHead).toHaveAttribute('aria-sort', 'descending');
    expect(await paceOf(0)).toBeGreaterThanOrEqual(await paceOf(1));
    await runRows.first().getByRole('button').click();
    const effortRow = segments.locator('tbody tr.reps-rep-row').first();
    // No Similar link in the rows ("usun przycisk podobne").
    await expect(effortRow.getByRole('link', { name: 'Similar' })).toHaveCount(0);
    await effortRow.getByRole('link', { name: '#1' }).click();
    await expect(page.locator('.range-stats h3')).toHaveText('Selection');
    // The run's back link names the screen it was opened from and returns to it as it was left.
    await page.getByRole('link', { name: '← Compare' }).click();
    await expect(page).toHaveURL(/\/compare\?.*tab=segments/);
    await expect(page.locator('.item-chip')).toHaveCount(2);

    // Back on Segments after the run (the tab is in the link).
    await expect(tabs.getByRole('tab', { name: 'Efforts' })).toHaveAttribute('aria-selected', 'true');

    // Saved (scenario "Analysis saved and opened again"): named in the app, kept with its items and tab;
    // Analysis opened from the menu is empty, and the saved analysis opens as it was.
    await page.getByRole('button', { name: 'Save analysis' }).click();
    const save = page.getByRole('dialog', { name: 'Save analysis' });
    await expect(save.getByLabel('Name of the analysis')).toHaveValue(/^Fastest 10 min · since 2026-03-01 \+ Runs · since 2026-03-01…$/);
    await save.getByLabel('Name of the analysis').fill('Spring check');
    await save.getByRole('button', { name: 'Save analysis' }).click();
    await expect(page).toHaveURL(/[?&]a=an-/);
    await expect(page.getByRole('button', { name: 'Saved' })).toBeVisible();
    await page.locator('.sidebar').getByRole('link', { name: /Runs$/ }).click();
    await page.locator('.sidebar').getByRole('link', { name: /Compare$/ }).click();
    // Empty, an analysis saved: the list of them, no tabs.
    await expect(page.getByRole('tablist', { name: 'Compare sections' })).toHaveCount(0);
    await expect(page.locator('.item-chip')).toHaveCount(0);
    // Listed on the empty screen, each row opening its analysis, with Edit ("jak zapisze to chce open oraz edit");
    // no list of them in the head as well ("nie ma chyba sensu").
    await expect(page.getByRole('combobox', { name: 'Saved analyses' })).toHaveCount(0);
    const saved = page.getByRole('region', { name: 'Your saved analyses' });
    // A table with a head ("jakis header ? kiepsko wyglada ta tabela"): the analysis, its segments and runs, when it was saved.
    await expect(saved.getByRole('columnheader')).toHaveText(['Analysis', 'Segments and runs', 'Saved', 'Edit']);
    await expect(saved.locator('tbody tr').getByRole('cell')).toHaveText(['Spring check', '2', /^\w{3} \d+, 2026$/, '']);
    await expect(saved.getByRole('button', { name: 'Delete Spring check' })).toHaveCount(0);
    // Edit renames it in place; Esc leaves it.
    await saved.getByRole('button', { name: 'Edit Spring check' }).click();
    await page.getByRole('dialog', { name: 'Edit Spring check' }).getByRole('textbox', { name: 'Name' }).fill('Spring check 2');
    await page.keyboard.press('Escape');
    await saved.getByRole('button', { name: 'Edit Spring check' }).click();
    await page.getByRole('dialog', { name: 'Edit Spring check' }).getByRole('textbox', { name: 'Name' }).fill('Spring review');
    await page.getByRole('dialog', { name: 'Edit Spring check' }).getByRole('button', { name: 'Save' }).click();
    await expect(saved.locator('tbody tr').getByRole('cell').first()).toHaveText('Spring review');
    await saved.getByRole('button', { name: 'Edit Spring review' }).click();
    await page.getByRole('dialog', { name: 'Edit Spring review' }).getByRole('textbox', { name: 'Name' }).fill('Spring check');
    await page.keyboard.press('Enter');
    await expect(saved.locator('tbody tr').getByRole('cell').first()).toHaveText('Spring check');
    // Opened by a click on its row.
    await saved.getByText('Spring check', { exact: true }).click();
    await expect(page.locator('.item-chip')).toHaveCount(2, { timeout: 30_000 });
    await expect(tabs.getByRole('tab', { name: 'Efforts' })).toHaveAttribute('aria-selected', 'true');

    // A saved analysis deleted from its editor in the list of the empty screen, once confirmed in the app.
    await page.locator('.sidebar').getByRole('link', { name: /Runs$/ }).click();
    await page.locator('.sidebar').getByRole('link', { name: /Compare$/ }).click();
    await saved.getByRole('button', { name: 'Edit Spring check' }).click();
    await page.getByRole('dialog', { name: 'Edit Spring check' }).getByRole('button', { name: 'Delete' }).click();
    await page.getByRole('alertdialog', { name: 'Delete this analysis?' }).getByRole('button', { name: 'Delete' }).click();
    await expect(saved).toHaveCount(0);
  });
});
