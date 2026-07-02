export function findKeyIdAtPoint(
  container: HTMLElement,
  clientX: number,
  clientY: number,
): string | null {
  const target = document.elementFromPoint(clientX, clientY);
  const keyEl = target?.closest("[data-piano-key-id]");
  if (!keyEl || !container.contains(keyEl)) return null;
  return keyEl.getAttribute("data-piano-key-id");
}
