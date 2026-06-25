import { useState } from "react";

export function usePressableButton(active = false) {
  const [localPressed, setLocalPressed] = useState(false);
  const pressed = active || localPressed;

  return {
    pressed,
    pointerHandlers: {
      onPointerDown: () => setLocalPressed(true),
      onPointerUp: () => setLocalPressed(false),
      onPointerLeave: () => setLocalPressed(false),
    },
    pressedClass: pressed ? "key-pressed" : "",
  };
}
