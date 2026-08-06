/**
 * Return the priority marker from a native Codex review finding.
 *
 * Native reviews use a Markdown image badge (for example
 * `![P2 Badge](https://…/P2-yellow)`), while older results can use `[P2]`.
 * Keep both review intake paths on one parser so they cannot disagree about
 * whether a current finding is actionable.
 */
export function findingPriority(body) {
  const match = String(body || '').match(/(?:badge[^\n]*|\[|\b)P([0-3])(?:\b|[-\]])/i);
  return match ? `P${match[1]}` : undefined;
}
