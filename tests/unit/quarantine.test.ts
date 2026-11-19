import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { recordMeasure } from '../support/fixtures';

interface Entry { test: string; owner: string; ticket: string; since: string }
const quarantine: Entry[] = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../quarantine.json'), 'utf8'));
const MAX_DAYS = 7;

describe('Flaky tests quarantined', () => {
  it('Quarantine is emptied', async () => {
    // Every entry has an owner and a ticket, and none stays past 7 days.
    const incomplete = quarantine.filter((q) => !q.owner || !q.ticket || !q.test || Number.isNaN(Date.parse(q.since)));
    const overdue = quarantine.filter((q) => (Date.now() - Date.parse(q.since)) / 86_400_000 > MAX_DAYS);
    await recordMeasure('quarantineOverdue', overdue.length);
    await recordMeasure('quarantineIncomplete', incomplete.length);
    expect(incomplete).toEqual([]);
    expect(overdue).toEqual([]);
  });
});
