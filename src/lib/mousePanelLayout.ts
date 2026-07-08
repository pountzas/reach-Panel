/** Icon mode-toggle segment: p-2 (16px) + 16px icon. */
const MODE_TOGGLE_SEGMENT_WIDTH = 32;
const MODE_TOGGLE_GROUP_BORDER = 2;
const TOOLBAR_GAP = 8;
const TOOLBAR_PADDING_RIGHT = 4;
/** Mouse panel outer p-2 horizontal padding plus 1px borders. */
const MOUSE_PANEL_CHROME_WIDTH = 18;

function modeToggleGroupWidth(segments: number) {
  return segments * MODE_TOGGLE_SEGMENT_WIDTH + MODE_TOGGLE_GROUP_BORDER;
}

/**
 * Fixed minimum width for the mouse split-pane column.
 * Sized for the full toolbar: 5-speed switch + side toggle + mouse/numpad toggle + padding.
 */
export const MOUSE_PANEL_MIN_WIDTH =
  modeToggleGroupWidth(5) +
  TOOLBAR_GAP +
  modeToggleGroupWidth(2) +
  TOOLBAR_GAP +
  modeToggleGroupWidth(2) +
  TOOLBAR_PADDING_RIGHT +
  MOUSE_PANEL_CHROME_WIDTH;
