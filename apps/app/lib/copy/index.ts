// The published API of copy (ADR "Declared dependencies only"): other parts import only this file.
// Loaded only on a device that keeps a copy (ADR "A copy in the browser on phones"): the screens' scripts stay in their budget.
export * from './mirroredFolder';
