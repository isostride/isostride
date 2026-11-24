import type { Dictionary } from '../i18n';
import { COMMON } from './common';
import { COMPARE } from './compare';
import { DASHBOARD } from './dashboard';
import { MODELS } from './models';
import { PERFORMANCE } from './performance';
import { RUNS } from './runs';
import { SEGMENTS } from './segments';
import { SETTINGS } from './settings';
import { SETUP } from './setup';

/** Polish by the parts of the app; a text in two parts has the same Polish in both (the check of the texts holds it). */
export const PL_PARTS: Record<string, Dictionary> = { COMMON, SETTINGS, RUNS, COMPARE, SEGMENTS, PERFORMANCE, MODELS, SETUP, DASHBOARD };

/**
 * Polish: each English text of the app and its Polish. Plural texts hold their forms by Polish plural
 * rules: one (1 bieg), few (2–4 biegi), many (5 biegów), other (1,5 biegu).
 */
export const PL: Dictionary = Object.assign({}, ...Object.values(PL_PARTS));
