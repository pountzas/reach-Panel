import type { PhysicalKeyState } from "../../lib/keyboardLayouts";

export function physicalKeyStateEqual(
  a: PhysicalKeyState,
  b: PhysicalKeyState,
): boolean {
  return (
    a.capsLock === b.capsLock &&
    a.shift === b.shift &&
    a.ctrl === b.ctrl &&
    a.alt === b.alt &&
    a.win === b.win &&
    a.systemLanguage === b.systemLanguage &&
    a.keyboardLayout === b.keyboardLayout &&
    a.systemKlid === b.systemKlid &&
    a.systemHkl === b.systemHkl &&
    a.hasInputTarget === b.hasInputTarget &&
    a.pressedVks.length === b.pressedVks.length &&
    a.pressedVks.every((vk, i) => vk === b.pressedVks[i])
  );
}
