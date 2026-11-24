import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { fitFiles, importAll, logOpenedFiles, nav, openRun, openWithFolder, readText, recordMeasure, showList } from './support';

test.describe('Performance model', () => {
  test('Load model set and form drawn', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await logOpenedFiles(page);
    await openWithFolder(page, await fitFiles(30, '2026-08-20'));
    await importAll(page);

    // The navigation: Runs, Analysis, Performance, Settings.
    const screens = page.locator('.sidebar nav').getByRole('link');
    expect(await screens.evaluateAll((ls) => ls.map((l) => (l.querySelector('.nav-text > span') ?? l).textContent))).toEqual(['Dashboard', 'Runs', 'Segments', 'Compare', 'Performance', 'Settings']);
    // Under each screen a line of facts, read from the data (requirement "Side menu with the data"); no week's running.
    await expect(screens.nth(1)).toHaveAccessibleDescription(/^\d+ runs · last \w{3} \d+|^\d+ runs · last \d+ \w{3}/);
    await expect(screens.nth(2)).toHaveAccessibleDescription(/^\d+ kept/);
    await expect(page.locator('.sidebar').getByRole('region', { name: 'This week' })).toHaveCount(0);
    // Settings at the bottom of the side menu, the other screens at its top.
    const side = (await page.locator('.sidebar').boundingBox())!;
    const settings = (await screens.last().boundingBox())!;
    const performance = (await screens.nth(4).boundingBox())!;
    expect(side.y + side.height - (settings.y + settings.height)).toBeLessThan(40);
    expect(settings.y - (performance.y + performance.height)).toBeGreaterThan(100);
    // The app's version under its name (requirement "App version shown"), and in Settings, Display, with the release notes of the version.
    const pkgVersion = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '../../../package.json'), 'utf8')).version as string;
    const shown = pkgVersion.replace(/^(\d+\.\d+)\.0$/, '$1');
    await expect(page.locator('.sidebar .brand-version')).toHaveText(shown);
    // Settings in tabs, zones first; gear and tags are tabs of it, not a screen of the navigation.
    await nav(page, 'Settings');
    await expect(page.getByRole('tablist', { name: 'Settings sections' }).getByRole('tab')).toHaveText(['Models', 'Metrics', 'Gears', 'Tags', 'Display', 'About']);
    await page.getByRole('tab', { name: 'About' }).click();
    const about = page.getByRole('region', { name: 'About IsoStride' });
    await expect(about).toContainText(`Version ${shown}`);
    await expect(about.getByRole('link', { name: 'Release notes' })).toHaveAttribute('href', /\/releases\/tag\/v\d+\.\d+(\.\d+)?$/);
    // Models (requirement "Thresholds of the models"): each threshold of the checks with its default; one out of
    // its range cannot be saved; set, it is kept in the data folder with the performance model.
    await page.getByRole('tab', { name: 'Models' }).click();
    const thresholds = page.getByRole('region', { name: 'Thresholds of the checks' });
    const strap = thresholds.getByLabel('A heart rate strap in at least');
    await expect(strap).toHaveAttribute('placeholder', '80');
    // Save shows only when something is changed and not saved ("powinien sie pojawic gdy cos jest zmienione ale nie zapisane").
    await expect(thresholds.getByRole('button', { name: 'Save' })).toHaveCount(0);
    // Cancel goes back to what is saved (ADR "One way to add, edit and delete").
    await strap.fill('70');
    await thresholds.getByRole('button', { name: 'Cancel' }).click();
    await expect(strap).toHaveValue('');
    await expect(thresholds.getByRole('button', { name: 'Save' })).toHaveCount(0);
    await strap.fill('150');
    await expect(thresholds.getByRole('alert')).toContainText('A heart rate strap in at least (0–100)');
    await expect(thresholds.getByRole('button', { name: 'Save' })).toBeDisabled();
    await strap.fill('50');
    await thresholds.getByRole('button', { name: 'Save' }).click();
    await expect(thresholds.getByRole('status')).toContainText('Saved');
    await expect(thresholds.getByRole('button', { name: 'Save' })).toHaveCount(0);
    expect(JSON.parse(await readText(page, '.isostride/user/settings.json')).performance.thresholds).toEqual({ strapShare: 0.5 });
    await page.getByRole('tab', { name: 'Tags' }).click();
    await expect(page).toHaveURL(/\/settings\?tab=tags/);
    await expect(page.getByRole('region', { name: 'Tags' })).toContainText('Workout type');
    // A tag renamed (requirement "Gear and tags renamed"): in its place, in the folder's dictionary.
    const tagsCard = page.getByRole('region', { name: 'Tags' });
    // Edited as everything kept in the folder (ADR "One way to add, edit and delete"): Esc leaves it as it was.
    // Its editor a dialog in the middle of the screen ("edit zawsze pokazuje popup na srodku").
    const tagDialog = (name: string) => page.getByRole('dialog', { name: `Edit ${name}` });
    await tagsCard.getByRole('button', { name: 'Edit tempo' }).click();
    await tagDialog('tempo').getByRole('textbox', { name: 'Name' }).fill('nothing');
    await page.keyboard.press('Escape');
    await expect(tagDialog('tempo')).toHaveCount(0);
    await expect(tagsCard.getByRole('button', { name: 'Edit tempo' })).toBeVisible();
    await tagsCard.getByRole('button', { name: 'Edit tempo' }).click();
    await tagDialog('tempo').getByRole('textbox', { name: 'Name' }).fill('threshold');
    await tagDialog('tempo').getByRole('button', { name: 'Save' }).click();
    await expect(tagsCard.getByRole('button', { name: 'Edit threshold' })).toBeVisible();
    await expect(tagsCard.getByRole('button', { name: 'Edit tempo' })).toHaveCount(0);
    await expect.poll(async () => JSON.parse(await readText(page, '.isostride/user/run-tags.json')).dictionary.workoutTypes).toEqual(['easy', 'long', 'threshold', 'intervals', 'race']);
    // Deleted from its editor ("w samym edit jest usuwanie"), after asking in the app's own dialog; Cancel keeps it.
    await expect(tagsCard.getByRole('button', { name: 'Delete race' })).toHaveCount(0);
    const ask = page.getByRole('alertdialog', { name: 'Delete this tag?' });
    await tagsCard.getByRole('button', { name: 'Edit race' }).click();
    await tagDialog('race').getByRole('button', { name: 'Delete' }).click();
    await ask.getByRole('button', { name: 'Cancel' }).click();
    await expect(tagsCard.getByRole('button', { name: 'Edit race' })).toBeVisible();
    await tagsCard.getByRole('button', { name: 'Edit race' }).click();
    await tagDialog('race').getByRole('button', { name: 'Delete' }).click();
    await ask.getByRole('button', { name: 'Delete' }).click();
    await expect(tagsCard.getByRole('button', { name: 'Edit race' })).toHaveCount(0);
    // Added with Add.
    await tagsCard.getByRole('textbox', { name: 'New workout type' }).fill('hills');
    await tagsCard.getByRole('group', { name: 'Workout type' }).getByRole('button', { name: 'Add' }).click();
    await expect.poll(async () => JSON.parse(await readText(page, '.isostride/user/run-tags.json')).dictionary.workoutTypes).toEqual(['easy', 'long', 'threshold', 'intervals', 'hills']);
    // The old address of Gear and tags opens the Gears tab; the old tabs' links the tabs that hold them now.
    await page.goto('/gear');
    await expect(page).toHaveURL(/\/settings\?tab=gears/);
    await expect(page.getByRole('region', { name: 'Gears' }).getByRole('button', { name: 'Add gear' })).toBeVisible();
    // A piece of gear added, then renamed in place.
    const gears = page.getByRole('region', { name: 'Gears' });
    await gears.getByLabel('Gear name').fill('Shoes A');
    await gears.locator('.gear-add input[type="date"]').first().fill('2026-01-01');
    await gears.getByRole('button', { name: 'Add gear' }).click();
    // The editor, a dialog in the middle of the screen: its first field takes the focus, Tab stays within it,
    // ✕ and a click beside it close it, nothing saved.
    await gears.getByRole('button', { name: 'Edit Shoes A' }).click();
    const gearForm = page.getByRole('dialog', { name: 'Edit Shoes A' });
    await expect(gearForm.getByRole('textbox', { name: 'Name' })).toBeFocused();
    await gearForm.getByRole('button', { name: 'Save' }).focus();
    await page.keyboard.press('Tab');
    await expect(gearForm.getByRole('button', { name: 'Close' })).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(gearForm.getByRole('button', { name: 'Save' })).toBeFocused();
    await gearForm.getByRole('textbox', { name: 'Name' }).fill('Not kept');
    await gearForm.getByRole('button', { name: 'Close' }).click();
    await expect(gearForm).toHaveCount(0);
    await gears.getByRole('button', { name: 'Edit Shoes A' }).click();
    await expect(gearForm.getByRole('textbox', { name: 'Name' })).toHaveValue('Shoes A');
    await page.mouse.click(4, 4);
    await expect(gearForm).toHaveCount(0);
    // Its name and its dates saved together, with Enter.
    await gears.getByRole('button', { name: 'Edit Shoes A' }).click();
    await gearForm.getByLabel('To (empty: in use)').fill('2026-06-30');
    await gearForm.getByRole('textbox', { name: 'Name' }).fill('Shoes B');
    await gearForm.getByRole('textbox', { name: 'Name' }).press('Enter');
    await expect(page.locator('.banner')).toContainText('Renamed Shoes A to Shoes B');
    await expect(gears.getByRole('button', { name: 'Edit Shoes B' })).toBeVisible();
    await expect(gears.locator('.gear-row', { hasText: 'Shoes B' })).toContainText('from 2026-01-01 to 2026-06-30');
    await expect(gears.locator('.gear-row', { hasText: 'Shoes B' }).getByText('in use')).toHaveCount(0);
    // Deleted from its editor, after asking.
    await gears.getByRole('button', { name: 'Edit Shoes B' }).click();
    await page.getByRole('dialog', { name: 'Edit Shoes B' }).getByRole('button', { name: 'Delete' }).click();
    await page.getByRole('alertdialog', { name: 'Delete this gear?' }).getByRole('button', { name: 'Delete' }).click();
    await expect(page.locator('.banner')).toContainText('Deleted Shoes B');
    await expect(gears.getByRole('button', { name: 'Edit Shoes B' })).toHaveCount(0);
    await page.goto('/settings?tab=charts');
    await expect(page.getByRole('tab', { name: 'Display' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('region', { name: 'Charts' })).toBeVisible();
    await page.goto('/settings?tab=zones');
    await expect(page.getByRole('tab', { name: 'Metrics' })).toHaveAttribute('aria-selected', 'true');
    await page.getByRole('tab', { name: 'Tags' }).click();
    // Models first: its tab is the screen's own address.
    await page.getByRole('tab', { name: 'Models' }).click();
    await expect(page).toHaveURL(/\/settings$/);

    // Performance is laid out by the evidence its models rest on: an overview, a tab per group, the settings.
    await nav(page, 'Performance');
    const tabs = page.getByRole('tablist', { name: 'Performance sections' });
    // No Model tab ("mam wrazenie ze wszystkie modele sa pomieszane"): the load model is chosen at the top of Load, its values set in Settings › Models.
    await expect(tabs.getByRole('tab')).toHaveText(['Overview', 'Load', 'Capacity', 'Aerobic', 'Response']);
    await expect(tabs.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
    await expect(page).toHaveURL(/\/performance$/);
    // The overview is the map of the models: each with its name, what it says now, its trust and a "Why?"; no list repeats it.
    await expect(page.getByRole('region', { name: 'Map of the models' })).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('.overview-list, li[data-model]')).toHaveCount(0);
    const rows = page.locator('.map-node[data-model]');
    await expect(rows).toHaveCount(17);
    for (const trust of await rows.locator('.map-trust').allTextContents()) expect(['Reliable', 'Rough', 'Not reliable', 'No data']).toContain(trust);
    await expect(rows.getByRole('button', { name: /^Why\?/ })).toHaveCount(17);
    // The models the load model changes are marked by its unit: the load, the form, the ratio, the weekly load and the fitted responses.
    expect((await page.locator('.map-node:has(.by-load)').evaluateAll((ns) => ns.map((n) => n.getAttribute('data-model')))).sort()).toEqual(['acwr', 'fittedHr', 'fittedVdot', 'form', 'load', 'weekly']);
    const why = (model: string) => page.getByRole('button', { name: new RegExp(`^Why\\? ${model}`) });
    const panel = (model: string) => page.getByRole('region', { name: new RegExp(`^Why: ${model}`) });
    // Critical speed is drawn beside the best efforts it is fitted to, a line between them, and is no more reliable than they are.
    await expect(page.locator('.map-edge[data-from="efforts"][data-to="cs"]')).toHaveCount(1);
    const order = ['ok', 'rough', 'no', 'nodata'];
    const trustOf = async (model: string) => order.indexOf((await page.locator(`.map-node[data-model="${model}"]`).getAttribute('data-trust'))!);
    expect(await trustOf('cs')).toBeGreaterThanOrEqual(await trustOf('efforts'));
    expect(await trustOf('vdot')).toBeGreaterThanOrEqual(await trustOf('efforts'));
    // Nothing was saved yet: the load is rough and the intensity not reliable; the reasons stay behind "Why?".
    const load = page.locator('.map-node[data-model="load"]');
    await expect(load).toHaveAttribute('data-trust', 'rough');
    await expect(page.locator('.map-node[data-model="intensity"]')).toHaveAttribute('data-trust', 'no');
    await expect(load).not.toContainText('resting heart rate');
    await expect(page.getByRole('region', { name: /^Why:/ })).toHaveCount(0);
    // "Why?" opens the rest: why the trust, the assumptions with what the data show, what it rests on, what it is, how to read it.
    await why('Load of a run').click();
    await expect(panel('Load of a run')).toContainText('Rough. Your resting heart rate is set: in doubt.');
    await expect(panel('Load of a run').getByRole('list', { name: /^Assumptions of Load of a run/ }).getByRole('listitem').first()).toContainText(/Every run has what the model needs · holds\d+ of \d+ runs measured/);
    for (const part of ['Assumptions', 'Rests on', 'What it is', 'How to read it']) await expect(panel('Load of a run')).toContainText(part);
    // In a window over the screen ("w performance why wyswietlaj jako popup"): its name and trust at the top; Esc closes it.
    const window_ = page.getByRole('dialog', { name: 'Why: Load of a run' });
    await expect(window_.getByRole('heading', { name: 'Load of a run' })).toBeVisible();
    await expect(window_.getByRole('button', { name: 'Close' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('region', { name: /^Why:/ })).toHaveCount(0);
    // Another model's; closed by its button.
    await why('Critical speed and D′').click();
    await expect(page.getByRole('region', { name: /^Why:/ })).toHaveCount(1);
    await expect(panel('Critical speed and D′').getByRole('link', { name: /^Best efforts of 2–20 min/ })).toBeVisible();
    await page.getByRole('dialog', { name: /^Why:/ }).getByRole('button', { name: 'Close' }).click();
    await expect(page.getByRole('region', { name: /^Why:/ })).toHaveCount(0);

    // No To do any more ("usun todo"): neither its tab nor its address.
    await expect(tabs.getByRole('tab', { name: 'To do' })).toHaveCount(0);
    // Where a setting is made: Settings › Models ("ok wybor modelu chce w settings"): the load model and the values of the models, from Load.
    await tabs.getByRole('tab', { name: 'Load' }).click();
    await page.getByRole('note', { name: 'Load model in use' }).getByRole('link', { name: 'Change it in Settings →' }).click();
    await expect(page).toHaveURL(/\/settings\?tab=models/);
    const card = page.getByRole('region', { name: 'Performance model' });
    await expect(card.getByRole('button', { name: 'Save and recompute' })).toHaveCount(0);
    await expect(card.getByLabel('Maximum heart rate')).toHaveAttribute('placeholder', /^auto: \d{3}$/);
    await expect(card.getByLabel('Critical power')).toHaveAttribute('placeholder', /^auto: \d+$/);
    // Banister TRIMP until chosen otherwise, each choice saying what it needs and how much of it the runs have;
    // Power TSS against the critical power of the curve, saved, the loads recomputed.
    const models = card.getByRole('radiogroup', { name: 'Load model' });
    await expect(models.getByRole('radio', { name: /Banister TRIMP/ })).toHaveAttribute('aria-checked', 'true');
    await expect(models.getByRole('radio', { name: /Banister TRIMP/ })).toContainText(/Needs heart rate: \d+ of \d+ runs/, { timeout: 30_000 });
    await expect(models.getByRole('radio', { name: /Power TSS/ })).toContainText(/Needs power: \d+ of \d+ runs/);
    // A choice and a value changed, then Cancel: both as saved.
    await models.getByRole('radio', { name: /Power TSS/ }).click();
    await card.getByLabel('Maximum heart rate').fill('188');
    await card.getByRole('button', { name: 'Cancel' }).click();
    await expect(models.getByRole('radio', { name: /Banister TRIMP/ })).toHaveAttribute('aria-checked', 'true');
    await expect(card.getByLabel('Maximum heart rate')).toHaveValue('');
    await expect(card.getByRole('button', { name: 'Save and recompute' })).toHaveCount(0);
    await models.getByRole('radio', { name: /Power TSS/ }).click();
    await card.getByRole('button', { name: 'Save and recompute' }).click();
    await expect(card.getByRole('status')).toHaveText('Saved · loads recomputed', { timeout: 60_000 });
    // Saved as the runner's own; the zones were not touched, so the default zones go on applying.
    const saved = JSON.parse(await readText(page, '.isostride/user/settings.json'));
    expect(saved.performance).toMatchObject({ load: 'powerTss', confirmed: true });
    expect(saved.zones).toBeUndefined();
    // On Load, a line names the model in use and leads to Settings.
    await nav(page, 'Performance');
    await tabs.getByRole('tab', { name: 'Load' }).click();
    await expect(page.getByRole('note', { name: 'Load model in use' })).toContainText('counted as Power TSS');
    // Under it, the load's trust, marked as following the load model; its "Why?" says what it now rests on: the critical power, and through it the best efforts.
    const bar = page.getByRole('group', { name: 'How far to trust this' });
    await expect(bar.locator('.why-item[data-model="form"] .by-load')).toHaveText('by Power TSS');
    await bar.getByRole('button', { name: /^Why\? Load of a run · Power TSS/ }).click();
    await expect(panel('Load of a run · Power TSS').getByRole('link', { name: /^Critical power and W′/ })).toBeVisible();
    await page.keyboard.press('Escape');

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
    // The views a second level inside the group's card, not a second row of tabs ("2 poziomy tabow"); its name
    // not said again under its tab ("powtarzasz tytul").
    await expect(page.getByRole('region', { name: 'Load', exact: true }).getByRole('radiogroup', { name: 'Load views' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Load', exact: true }).getByRole('heading', { name: 'Load', exact: true })).toHaveCount(0);
    await expect(page.getByRole('tablist')).toHaveCount(1);
    // On the left of the card ("chce to po lewej stronie").
    const group = page.getByRole('region', { name: 'Load', exact: true });
    const [groupBox, views] = [(await group.boundingBox())!, (await group.getByRole('radiogroup', { name: 'Load views' }).boundingBox())!];
    expect(views.x - groupBox.x).toBeLessThanOrEqual(24);
    // The view chosen in the blue of the tab chosen.
    const bg = (l: ReturnType<typeof page.locator>) => l.evaluate((e) => getComputedStyle(e).backgroundImage);
    const chosen = group.getByRole('radiogroup', { name: 'Load views' }).getByRole('radio', { checked: true });
    expect(await bg(chosen)).toBe(await bg(page.getByRole('tab', { selected: true })));
    expect(await bg(chosen)).toContain('gradient');
    // The group's card white as every card ("tlo w wewnetrznej ramce powinny byc biale nie szare").
    expect(await group.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe(await group.locator('.card').first().evaluate((e) => getComputedStyle(e).backgroundColor));
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
    // The tooltip: a row per line, its key, its name and its value.
    await expect(page.locator('.tooltip .tip-row')).toHaveCount(5);
    await expect(page.locator('.tooltip')).toContainText(/fitness\s*\d+/);
    await expect(page.locator('.tooltip')).toContainText(/fatigue\s*\d+/);
    await page.mouse.move(box.x + box.width / 2, box.y - 60);
    // The view is its figures and its chart: no note under them. Above, its models in a line, each with its trust and a "Why?".
    await expect(page.locator('.chart-note')).toHaveCount(0);
    await expect(bar.locator('.why-item')).toHaveCount(3);
    await expect(bar.locator('.why-item .trust')).toHaveCount(3);
    // What the files cannot tell is left to the runner, and how to read the chart is here too.
    await bar.getByRole('button', { name: /^Why\? Fitness and fatigue \(impulse–response\)/ }).click();
    await expect(panel('Fitness and fatigue \\(impulse–response\\)')).toContainText('All your training is here · you must judge');
    await expect(panel('Fitness and fatigue \\(impulse–response\\)')).toContainText('Form is fitness minus fatigue of the day before');
    await page.keyboard.press('Escape');
    // Weekly load: the weeks' load, monotony, strain and ramp rate.
    await page.getByRole('radio', { name: 'Weekly load' }).click();
    await expect(page).toHaveURL(/tab=load&view=weekly/);
    await expect(page.getByRole('region', { name: /^Why:/ })).toHaveCount(0);
    await expect(page.getByLabel('Load this week')).toContainText(/Monotony(\d+\.\d+|–)/);
    await expect(page.getByRole('img', { name: 'Weekly load' }).locator('.tc-bar').first()).toBeAttached();
    expect(await page.getByRole('img', { name: 'Weekly load' }).locator('.tc-bar').count()).toBeGreaterThan(3);
    // The view is a widget: Pin in its corner ("Pin na kazdej karcie-widgecie") puts it on the Dashboard, kept in the data folder.
    const pin = page.getByRole('button', { name: 'Pin Load · Weekly load to the dashboard' });
    await pin.click();
    await expect(pin).toHaveAttribute('aria-pressed', 'true');
    expect(JSON.parse(await readText(page, '.isostride/user/dashboard.json')).tiles).toContainEqual({ id: 'perf:load/weekly', kind: 'perf', ref: 'load/weekly', name: 'Load · Weekly load' });
    // The files the Dashboard opens (its Last run reads its run) are not the Performance views': left out of the measure below.
    const openedBefore = await page.evaluate(() => [...(window as any).__opened] as string[]);
    await nav(page, 'Dashboard');
    await expect(page.getByRole('region', { name: 'Load · Weekly load' }).getByRole('img', { name: 'Weekly load' })).toBeVisible({ timeout: 30_000 });
    await page.goBack();
    await page.evaluate((list) => { (window as any).__opened = list; }, openedBefore);
    await expect(page).toHaveURL(/tab=load&view=weekly/);
    // Intensity: the shares of low, moderate and high add up to the whole.
    await page.getByRole('radio', { name: 'Intensity' }).click();
    await expect(page.getByRole('img', { name: 'Time in the heart rate zones' }).locator('.tc-bar').first()).toBeAttached();
    const shares = await page.getByLabel('Intensity shares').locator('dd.tnum').allTextContents();
    expect(Math.abs(shares.slice(0, 3).reduce((s, t) => s + Number(t.replace(/\D/g, '')), 0) - 100)).toBeLessThanOrEqual(2);
    await bar.getByRole('button', { name: /^Why\? Intensity distribution/ }).click();
    await expect(panel('Intensity distribution')).toContainText('The heart rate zones are yours · does not hold');
    await page.keyboard.press('Escape');

    // Capacity, what you can do: first the best efforts themselves, each with how hard it was and the run it comes from.
    await tabs.getByRole('tab', { name: 'Capacity' }).click();
    await expect(page.getByRole('radiogroup', { name: 'Capacity views' }).getByRole('radio')).toHaveText(['Best efforts', 'Critical speed and power', 'Predictions and VDOT']);
    // Your curve now above them ("czy krzywa mocy i predkosci powinna byc w performance"): the bests as points, the fitted curve and its critical speed; power on a switch.
    const curve = page.getByRole('img', { name: 'Your pace curve' });
    await expect(curve).toBeVisible();
    await expect(page.locator('.chart-note').filter({ hasText: /^Critical speed [2-9]:\d\d \/km/ })).toBeVisible();
    await page.getByRole('group', { name: 'Curve of' }).getByRole('button', { name: 'Power' }).click();
    await expect(page.getByRole('img', { name: 'Your power curve' })).toBeVisible();
    await expect(page.locator('.chart-note').filter({ hasText: /^Critical power \d+ W/ })).toBeVisible();
    // Pace and power in one table ("czy to nie to samo"): a row a length with both bests; one effort said once, two efforts each.
    const efforts = page.getByRole('table', { name: 'Best efforts' });
    await expect(efforts.getByRole('columnheader')).toHaveText([/^length$/i, /^best pace$/i, /^best power$/i, /^effort$/i, /^of max heart rate$/i, /^run$/i], { useInnerText: true });
    expect(await efforts.locator('tbody tr').count()).toBeGreaterThanOrEqual(3);
    const first = efforts.locator('tbody tr').first();
    await expect(first).toContainText(/^2 min\d:\d\d \/km\d+ W(pace |)(all-out|hard, not all-out|not all-out)/);
    await expect(first.getByRole('link').first()).toHaveAttribute('href', /\/run\?id=\d{8}-\d{6}&from=\d+&to=\d+/);
    for (const row of await efforts.locator('tbody tr').all()) {
      // One effort: one run; two: a run for the pace and one for the power.
      await expect(row.getByRole('link')).toHaveCount((await row.getAttribute('data-same')) === 'true' ? 1 : 2);
    }
    // The maximum heart rate comes from the runs: whether the efforts were all-out is in doubt, and the "Why?" says so.
    await bar.getByRole('button', { name: /^Why\? Best efforts of 2–20 min/ }).click();
    await expect(panel('Best efforts of 2–20 min')).toContainText('Your maximum heart rate is known · in doubt');
    await expect(panel('Best efforts of 2–20 min')).toContainText('to make a length count, run it all-out once, on its own');
    await page.keyboard.press('Escape');
    // Critical speed (a pace) and power over time, fitted to those efforts.
    await page.getByRole('radio', { name: 'Critical speed and power' }).click();
    const critical = page.getByLabel('Critical speed and power now');
    await expect(critical).toContainText(/Critical speed\d:\d\d \/km/);
    await expect(critical).toContainText(/Critical power\d+ W/);
    await expect(page.getByRole('img', { name: 'Critical speed over time' }).locator('.tc-line')).toHaveCount(1);
    await bar.getByRole('button', { name: /^Why\? Critical speed and D′/ }).click();
    await expect(panel('Critical speed and D′').getByRole('link', { name: /^Best efforts of 2–20 min/ })).toBeVisible();
    await page.keyboard.press('Escape');
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
    await page.keyboard.press('Escape');

    // Fitness function "Performance views read no run file" (ADR "Performance markers from summaries").
    const opened = await page.evaluate(() => (window as any).__opened as string[]);
    const runFiles = opened.filter((n) => /^\d{8}-\d{6}\.json$/.test(n));
    await recordMeasure('performanceRunFilesRead', runFiles.length);
    expect(runFiles).toEqual([]);
  });

  test('Model map drawn', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openWithFolder(page, await fitFiles(30, '2026-08-20'));
    await importAll(page);
    await nav(page, 'Performance');
    // Above the list, the map: a lane per kind of evidence, the response between the load and the performance it links,
    // columns from what is measured to what is fitted; every model a link wearing its trust.
    const map = page.getByRole('region', { name: 'Map of the models' });
    await expect(map.locator('.map-node')).toHaveCount(17, { timeout: 60_000 });
    // Its type light enough to read ("ten bold jest przytlaczajacy"): nothing on it heavier than 620.
    const weights = await map.locator('.map-now, .map-name, .map-lane-head > a, .map-col-title, .map-trust, h2').evaluateAll((es) => es.map((e) => Number(getComputedStyle(e).fontWeight)));
    expect(Math.max(...weights)).toBeLessThanOrEqual(620);
    // The overview close to one 1440 × 900 screen: at most a short scroll to see the whole map.
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight - innerHeight)).toBeLessThanOrEqual(120);
    // On a taller window the map takes its whole height: it reaches the bottom of the window, nothing to scroll, the rows wider apart.
    await page.setViewportSize({ width: 1440, height: 1200 });
    await expect.poll(() => page.evaluate(() => innerHeight - document.querySelector('.model-map')!.getBoundingClientRect().bottom), { message: 'room under the map' }).toBeLessThanOrEqual(24);
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(map.locator('.map-lane-head a')).toHaveText(['Load', 'Response', 'Aerobic', 'Capacity']);
    // The lanes' bands apart, not touching ("powinnien byc odstep").
    const bands = await map.locator('.map-lane').evaluateAll((ls) => ls.map((l) => { const r = l.getBoundingClientRect(); return [r.top, r.bottom]; }));
    for (let i = 1; i < bands.length; i++) expect(bands[i][0] - bands[i - 1][1]).toBeGreaterThanOrEqual(8);
    // Every card inside its lane with room on the right too ("odstep po prawej").
    const right = await map.evaluate((m) => {
      const lanes = [...m.querySelectorAll('.map-lane')].map((l) => l.getBoundingClientRect());
      return [...m.querySelectorAll('.map-node')].map((n) => {
        const r = n.getBoundingClientRect();
        const lane = lanes.find((l) => r.top >= l.top - 1 && r.bottom <= l.bottom + 1)!;
        return lane.right - r.right;
      });
    });
    expect(Math.min(...right)).toBeGreaterThanOrEqual(6);
    // A link to the Model tab of before opens Load, where the load model is chosen now.
    await page.goto('/performance?tab=model');
    await expect(page.getByRole('tab', { name: 'Load', exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('note', { name: 'Load model in use' })).toBeVisible({ timeout: 60_000 });
    await page.goBack();
    await expect(map.locator('.map-node')).toHaveCount(17, { timeout: 60_000 });
    await expect(map.locator('.map-col-title')).toHaveText(['From your runs', 'Built on them', 'Fitted response']);
    // Measured from the runs on the left, what is built on them to the right of it, the responses last.
    const left = async (key: string) => (await map.locator(`.map-node[data-model="${key}"]`).boundingBox())!.x;
    expect(await left('efforts')).toBeLessThan(await left('cs'));
    expect(await left('cs')).toBeLessThan(await left('fittedVdot'));
    for (const node of await map.locator('.map-node').all()) {
      const trust = (await node.getAttribute('data-trust'))!;
      await expect(node).toContainText({ ok: 'Reliable', rough: 'Rough', no: 'Not reliable', nodata: 'No data' }[trust]!);
    }
    await expect(map.getByRole('link', { name: /^Critical speed and D′\s*4:\d\d \/km/ })).toBeVisible();
    // A line from each model to every model resting on it, across the columns to the responses too.
    const edge = (from: string, to: string) => map.locator(`.map-edge[data-from="${from}"][data-to="${to}"]`);
    await expect(map.locator('.map-edge')).toHaveCount(11);
    for (const [from, to] of [['efforts', 'cs'], ['load', 'form'], ['load', 'fittedHr'], ['vo2hr', 'fittedHr'], ['vdot', 'fittedVdot']]) await expect(edge(from, to)).toHaveCount(1);
    // A coloured line marks the model that holds back the trust of the next: both wear the same trust, the line its colour.
    for (const line of await map.locator('.map-edge.caps').all()) {
      const trust = (await line.getAttribute('class'))!.match(/caps-(\w+)/)![1];
      await expect(map.locator(`.map-node[data-model="${await line.getAttribute('data-from')}"]`)).toHaveAttribute('data-trust', trust);
      await expect(map.locator(`.map-node[data-model="${await line.getAttribute('data-to')}"]`)).toHaveAttribute('data-trust', trust);
    }
    // Under the pointer a model's chain stands out: what it rests on and what rests on it; the rest recede.
    await map.locator('.map-node[data-model="vdot"]').hover();
    await expect(edge('efforts', 'vdot')).toHaveClass(/lit/);
    await expect(edge('vdot', 'fittedVdot')).toHaveClass(/lit/);
    await expect(edge('load', 'form')).toHaveClass(/faded/);
    await expect(map.locator('.map-node[data-model="ef"]')).toHaveClass(/faded/);
    await expect(map.locator('.map-node[data-model="efforts"]')).not.toHaveClass(/faded/);
    // The keyboard does the same, and a model opens its view.
    await map.locator('.map-node[data-model="cs"] .map-link').focus();
    await expect(edge('efforts', 'cs')).toHaveClass(/lit/);
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/performance\?tab=capacity&view=critical/);
  });
});
