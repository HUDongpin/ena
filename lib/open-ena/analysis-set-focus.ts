export function nextAnalysisSetRemovalFocusId(
  orderedSetIds: readonly string[],
  removedSetId: string,
  captureEnabled: boolean,
) {
  const removedIndex = orderedSetIds.indexOf(removedSetId);
  if (removedIndex >= 0 && orderedSetIds.length > 1) {
    const remainingIds = orderedSetIds.filter((setId) => setId !== removedSetId);
    const nextSetId = remainingIds[Math.min(removedIndex, remainingIds.length - 1)];
    if (nextSetId) return `open-ena-set-remove-${nextSetId}`;
  }
  return captureEnabled ? "open-ena-capture-set" : "open-ena-sets-heading";
}
