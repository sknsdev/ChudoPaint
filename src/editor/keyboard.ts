export function shouldIgnoreEditorHotkey(event: KeyboardEvent): boolean {
  if (event.defaultPrevented || event.isComposing) {
    return true;
  }

  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(
    target.closest(
      'input, textarea, select, [contenteditable="true"], dialog, [role="dialog"], [aria-modal="true"]',
    ),
  );
}
