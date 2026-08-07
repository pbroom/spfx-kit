if (process.argv.length !== 2) throw new Error('CSS build does not accept arguments');

// The CSS artifact is one member of the signed profile transaction. Building it
// independently could install bytes compiled from a stale profile snapshot, so
// this convenience command deliberately enters the same lock and atomic
// replacement flow as every other offline regeneration.
await import('./regenerate-profile.mjs');
