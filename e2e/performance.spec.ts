import { expect, test } from '@playwright/test';
import { fitFiles, importAll, logOpenedFiles, nav, openRun, openWithFolder, readText, recordMeasure, showList } from './support';

test.describe('Performance model', () => {
  test('Load model set and form drawn', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await logOpenedFiles(page);
    await openWithFolder(page, await fitFiles(30, '2026-08-20'));
    await importAll(page);

    // The navigation: Runs, Analysis, Performance, Settings.
    await expect(page.locator('.sidebar nav').getByRole('link')).toHaveText(['Runs', 'Analysis', 'Performance', 'Settings']);
    // Settings in tabs, zones first; gear and tags are tabs of it, not a screen of the navigation.
    await nav(page, 'Settings');
    await expect(page.getByRole('tablist', { name: 'Settings sections' }).getByRole('tab')).toHaveText(['Zones', 'Gear', 'Tags']);
    await page.getByRole('tab', { name: 'Tags' }).click();
    await expect(page).toHaveURL(/\/settings\?tab=tags/);
    await expect(page.getByRole('region', { name: 'Tags' })).toContainText('Workout type');
    // The old address of Gear and tags opens the Gear tab.
    await page.goto('/gear');
    await expect(page).toHaveURL(/\/settings\?tab=gear/);
    await expect(page.getByRole('region', { name: 'Gear' }).getByRole('button', { name: 'Add gear' })).toBeVisible();
    await page.getByRole('tab', { name: 'Zones' }).click();
    await expect(page).toHaveURL(/\/settings$/);

    // Performance is laid out by the evidence its models rest on: an overview, a tab per group, the settings.
    await nav(page, 'Performance');
    const tabs = page.getByRole('tablist', { name: 'Performance sections' });
    await expect(tabs.getByRole('tab')).toHaveText(['Overview', 'Load', 'Capacity', 'Aerobic', 'Response', 'Model']);
    await expect(tabs.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
    await expect(page).toHaveURL(/\/performance$/);
    // The overview is a line per model: its name, what it says now, its trust and a "Why?"; nothing else.
    for (const group of ['Load', 'Capacity', 'Aerobic', 'Response']) await expect(page.getByRole('region', { name: `${group} models` })).toBeVisible({ timeout: 60_000 });
    const rows = page.locator('li[data-model]');
    await expect(rows).toHaveCount(17);
    for (const trust of await rows.locator('.trust').allTextContents()) expect(['Reliable', 'Rough', 'Not reliable', 'No data']).toContain(trust);
    await expect(rows.getByRole('button', { name: /^Why\?/ })).toHaveCount(17);
    const why = (model: string) => page.getByRole('button', { name: new RegExp(`^Why\\? ${model}`) });
    const panel = (model: string) => page.getByRole('region', { name: new RegExp(`^Why: ${model}`) });
    // Critical speed is drawn under the best efforts it is fitted to, and is no more reliable than they are.
    await expect(page.locator('li[data-model="cs"] .overview-row')).toHaveClass(/depth-1/);
    const order = ['ok', 'rough', 'no', 'nodata'];
    const trustOf = async (model: string) => order.indexOf((await page.locator(`li[data-model="${model}"]`).getAttribute('data-trust'))!);
    expect(await trustOf('cs')).toBeGreaterThanOrEqual(await trustOf('efforts'));
    expect(await trustOf('vdot')).toBeGreaterThanOrEqual(await trustOf('efforts'));
    // Nothing was saved yet: the load is rough and the intensity not reliable; the reasons stay behind "Why?".
    const load = page.locator('li[data-model="load"]');
    await expect(load).toHaveAttribute('data-trust', 'rough');
    await expect(page.locator('li[data-model="intensity"]')).toHaveAttribute('data-trust', 'no');
    await expect(load).not.toContainText('resting heart rate');
    await expect(page.getByRole('region', { name: /^Why:/ })).toHaveCount(0);
    // "Why?" opens the rest: why the trust, the assumptions with what the data show, what it rests on, what it is, how to read it.
    await why('Load of a run').click();
    await expect(panel('Load of a run')).toContainText('Rough. Your resting heart rate is set: in doubt.');
    await expect(panel('Load of a run').getByRole('list', { name: /^Assumptions of Load of a run/ }).getByRole('listitem').first()).toContainText(/Every run has what the model needs · holds\d+ of \d+ runs measured/);
    for (const part of ['Assumptions', 'Rests on', 'What it is', 'How to read it']) await expect(panel('Load of a run')).toContainText(part);
    // One at a time: another model's "Why?" takes its place.
    await why('Critical speed and D′').click();
    await expect(page.getByRole('region', { name: /^Why:/ })).toHaveCount(1);
    await expect(panel('Critical speed and D′').getByRole('link', { name: /^Best efforts of 2–20 min/ })).toBeVisible();
    await why('Critical speed and D′').click();
    await expect(page.getByRole('region', { name: /^Why:/ })).toHaveCount(0);

    // Its Model tab: Banister TRIMP until chosen otherwise; Power TSS against the critical power of the curve, saved, the loads recomputed.
    await tabs.getByRole('tab', { name: 'Model' }).click();
    await expect(page).toHaveURL(/\/performance\?tab=model/);
    const card = page.getByRole('region', { name: 'Performance model' });
    const models = card.getByRole('radiogroup', { name: 'Load model' });
    await expect(models.getByRole('radio', { name: /Banister TRIMP/ })).toHaveAttribute('aria-checked', 'true');
    await expect(card.getByLabel('Maximum heart rate')).toHaveAttribute('placeholder', /^auto: \d{3}$/);
    await models.getByRole('radio', { name: /Power TSS/ }).click();
    await expect(card.getByLabel('Critical power')).toHaveAttribute('placeholder', /^auto: \d+$/);
    await card.getByRole('button', { name: 'Save and recompute' }).click();
    await expect(card.getByRole('status')).toHaveText('Saved · loads recomputed', { timeout: 60_000 });
    // Saved as the runner's own; the zones were not touched, so the default zones go on applying.
    const saved = JSON.parse(await readText(page, 'strideprism/user/settings.json'));
    expect(saved.performance).toMatchObject({ load: 'powerTss', confirmed: true });
    expect(saved.zones).toBeUndefined();
    // Above it, the load's trust; its "Why?" says what it now rests on: the critical power, and through it the best efforts.
    const bar = page.getByRole('group', { name: 'How far to trust this' });
    await bar.getByRole('button', { name: /^Why\? Load of a run · Power TSS/ }).click();
    await expect(panel('Load of a run · Power TSS').getByRole('link', { name: /^Critical power and W′/ })).toBeVisible();

    // Runs: each run's load in TSS in the list, each week's in the calendar.
    await nav(page, 'Runs');
    await page.getByRole('radio', { name: 'Calendar' }).click();
    await expect(page.locator('.cal-load').first()).toHaveText(/^\d+ TSS$/);
    await showList(page);
    await expect(page.getByRole('columnheader', { name: 'Load TSS' })).toBeVisible();
    await expect(page.locator('tr.row').first().locator('td').nth(10)).toHaveText(/^\d+\*?$/);

    // A run: its load and the form that morning.
    await openRun(page);
    await expect(page.locator('.run-load dd')).toHaveText(/^\d+\*? TSS$/);
    await expect(page.locator('.run-figures')).toContainText(/form that morning[+−-]?\d+/);

    // From here on the views are drawn from the runs' summaries: no run file is opened.
    await nav(page, 'Performance');
    await expect(rows).toHaveCount(17, { timeout: 60_000 });
    await page.evaluate(() => { (window as any).__opened.length = 0; });

    // Load, what you did: its views, Form first; fitness, fatigue, form and the ratio over the period chosen, kept in the link.
    await tabs.getByRole('tab', { name: 'Load' }).click();
    await expect(page).toHaveURL(/\/performance\?tab=load$/);
    await expect(page.getByRole('radiogroup', { name: 'Load views' }).getByRole('radio')).toHaveText(['Form', 'Weekly load', 'Intensity']);
    const chart = page.getByRole('img', { name: 'Form over time' });
    await expect(chart.locator('.form-fitness')).toBeAttached();
    await expect(chart.locator('.form-fatigue')).toBeAttached();
    await expect(chart.locator('.form-form')).toBeAttached();
    expect(await chart.locator('.form-load').count()).toBeGreaterThan(5);
    const today = page.getByLabel('Form today');
    await expect(today).toContainText(/Fitness \(CTL\)\d+/);
    await expect(today).toContainText(/Form \(TSB\)[+-]?\d+/);
    await expect(today).toContainText(/Load, last 7 days\d+ TSS/);
    await page.getByRole('radio', { name: 'All', exact: true }).click();
    await expect(page).toHaveURL(/period=all/);
    const box = (await chart.boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.7, box.y + 100);
    await expect(page.locator('.tooltip')).toContainText(/fitness \d+ · fatigue \d+/);
    await page.mouse.move(box.x + box.width / 2, box.y - 60);
    // The view is its figures and its chart: no note under them. Above, its models in a line, each with its trust and a "Why?".
    await expect(page.locator('.chart-note')).toHaveCount(0);
    await expect(bar.locator('.why-item')).toHaveCount(3);
    await expect(bar.locator('.why-item .trust')).toHaveCount(3);
    // What the files cannot tell is left to the runner, and how to read the chart is here too.
    await bar.getByRole('button', { name: /^Why\? Fitness, fatigue and form/ }).click();
    await expect(panel('Fitness, fatigue and form')).toContainText('All your training is here · you must judge');
    await expect(panel('Fitness, fatigue and form')).toContainText('Form is fitness minus fatigue of the day before');
    // Weekly load: the weeks' load, monotony, strain and ramp rate.
    await page.getByRole('radio', { name: 'Weekly load' }).click();
    await expect(page).toHaveURL(/tab=load&view=weekly/);
    await expect(page.getByRole('region', { name: /^Why:/ })).toHaveCount(0);
    await expect(page.getByLabel('Load this week')).toContainText(/Monotony(\d+\.\d+|–)/);
    await expect(page.getByRole('img', { name: 'Weekly load' }).locator('.tc-bar').first()).toBeAttached();
    expect(await page.getByRole('img', { name: 'Weekly load' }).locator('.tc-bar').count()).toBeGreaterThan(3);
    // Intensity: the shares of low, moderate and high add up to the whole.
    await page.getByRole('radio', { name: 'Intensity' }).click();
    await expect(page.getByRole('img', { name: 'Time in the heart rate zones' }).locator('.tc-bar').first()).toBeAttached();
    const shares = await page.getByLabel('Intensity shares').locator('dd.tnum').allTextContents();
    expect(Math.abs(shares.slice(0, 3).reduce((s, t) => s + Number(t.replace(/\D/g, '')), 0) - 100)).toBeLessThanOrEqual(2);
    await bar.getByRole('button', { name: /^Why\? Intensity distribution/ }).click();
    await expect(panel('Intensity distribution')).toContainText('The heart rate zones are yours · does not hold');

    // Capacity, what you can do: first the best efforts themselves, each with how hard it was and the run it comes from.
    await tabs.getByRole('tab', { name: 'Capacity' }).click();
    await expect(page.getByRole('radiogroup', { name: 'Capacity views' }).getByRole('radio')).toHaveText(['Best efforts', 'Critical speed and power', 'Predictions and VDOT']);
    const efforts = page.getByRole('table', { name: 'Best pace efforts' });
    expect(await efforts.locator('tbody tr').count()).toBeGreaterThanOrEqual(3);
    const first = efforts.locator('tbody tr').first();
    await expect(first).toContainText(/2 min\d:\d\d \/km(all-out|hard, not all-out|not all-out)\d+ %/);
    await expect(first.getByRole('link')).toHaveAttribute('href', /\/run\?id=\d{8}-\d{6}&from=\d+&to=\d+/);
    await expect(page.getByRole('table', { name: 'Best power efforts' })).toBeVisible();
    // The maximum heart rate comes from the runs: whether the efforts were all-out is in doubt, and the "Why?" says so.
    await bar.getByRole('button', { name: /^Why\? Best efforts of 2–20 min/ }).click();
    await expect(panel('Best efforts of 2–20 min')).toContainText('Your maximum heart rate is known · in doubt');
    await expect(panel('Best efforts of 2–20 min')).toContainText('to make a length count, run it all-out once, on its own');
    // Critical speed (a pace) and power over time, fitted to those efforts.
    await page.getByRole('radio', { name: 'Critical speed and power' }).click();
    const critical = page.getByLabel('Critical speed and power now');
    await expect(critical).toContainText(/Critical speed\d:\d\d \/km/);
    await expect(critical).toContainText(/Critical power\d+ W/);
    await expect(page.getByRole('img', { name: 'Critical speed over time' }).locator('.tc-line')).toHaveCount(1);
    await bar.getByRole('button', { name: /^Why\? Critical speed and D′/ }).click();
    await expect(panel('Critical speed and D′').getByRole('link', { name: /^Best efforts of 2–20 min/ })).toBeVisible();
    // The predicted times and the VDOT the predicted 5 km implies.
    await page.getByRole('radio', { name: 'Predictions and VDOT' }).click();
    await expect(page).toHaveURL(/tab=capacity&view=predictions/);
    await expect(page.getByLabel('Predictions now')).toContainText(/10 km(\d+:)?\d+:\d\d/);
    await expect(page.getByLabel('Predictions now')).toContainText(/VDOT\d+\.\d/);
    await expect(page.getByRole('img', { name: 'VDOT over time' }).locator('.tc-vdot')).toHaveCount(1);

    // Aerobic, from everyday runs: the efficiency factor, the decoupling, VO2max from heart rate with Uth's ratio.
    await tabs.getByRole('tab', { name: 'Aerobic' }).click();
    await expect(page.getByRole('radiogroup', { name: 'Aerobic views' }).getByRole('radio')).toHaveText(['Efficiency', 'Decoupling', 'VO2max from heart rate']);
    await expect(page.getByLabel('Efficiency now')).toContainText(/Easy runs\d+ of \d+/);
    await expect(page.getByRole('img', { name: 'Efficiency factor over time' }).locator('.tc-dot').first()).toBeAttached();
    expect(await page.getByRole('img', { name: 'Efficiency factor over time' }).locator('.tc-dot').count()).toBeGreaterThan(10);
    await page.getByRole('radio', { name: 'Decoupling' }).click();
    await expect(page.getByLabel('Decoupling now').or(page.getByText(/^No run of 45 minutes or more yet/))).toBeVisible();
    await page.getByRole('radio', { name: 'VO2max from heart rate' }).click();
    await expect(page.getByLabel('VO2max now')).toContainText(/VO2max from heart rate\d+\.\d/);
    await expect(page.getByLabel('VO2max now')).toContainText(/Uth ratio\d+\.\d/);
    await expect(bar.locator('.why-item')).toHaveCount(2);

    // Response: Banister's model fitted to the runner, a view per measure of performance.
    await tabs.getByRole('tab', { name: 'Response' }).click();
    await expect(page.getByRole('radiogroup', { name: 'Response views' }).getByRole('radio')).toHaveText(['On VO2max from heart rate', 'On VDOT']);
    await page.getByRole('radio', { name: 'On VDOT' }).click();
    await expect(page).toHaveURL(/tab=response&view=vdot/);
    const fitted = page.getByLabel('Fitted model figures');
    await expect(fitted.or(page.getByText(/^No fit yet/))).toBeVisible();
    if (await fitted.count()) {
      await expect(fitted).toContainText(/Fit \(R²\)-?\d\.\d\d/);
      await expect(fitted).toContainText(/Fitness τ1\d+ d/);
      await expect(page.getByRole('img', { name: 'Fitted performance over time' }).locator('.tc-rest')).toHaveCount(1);
    }
    // It rests on the load and on the VDOT, and its "Why?" says so.
    await bar.getByRole('button', { name: /^Why\? Fitted response · VDOT/ }).click();
    await expect(panel('Fitted response · VDOT').getByRole('link', { name: /^Load of a run/ })).toBeVisible();
    await expect(panel('Fitted response · VDOT').getByRole('link', { name: /^VO2max as VDOT/ })).toBeVisible();

    // Fitness function "Performance views read no run file" (ADR "Performance markers from summaries").
    const opened = await page.evaluate(() => (window as any).__opened as string[]);
    const runFiles = opened.filter((n) => /^\d{8}-\d{6}\.json$/.test(n));
    await recordMeasure('performanceRunFilesRead', runFiles.length);
    expect(runFiles).toEqual([]);
  });
});
