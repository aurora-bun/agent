/** Platform hints used for labels and a few behavioural differences. */
export const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform) || /Macintosh/.test(navigator.userAgent);

/**
 * Render a shortcut written Windows-style ("Ctrl+Shift+S") for the current
 * platform: "⇧⌘S" on macOS, unchanged elsewhere.
 */
export function shortcut(keys: string): string {
  if (!isMac) return keys;
  const parts = keys.split("+");
  const key = parts.pop() ?? "";
  const mods = parts.map((m) => ({ Ctrl: "⌘", Shift: "⇧", Alt: "⌥" })[m] ?? m);
  // macOS convention: ⌃ ⌥ ⇧ ⌘ order, with the command symbol last.
  const order = ["⌃", "⌥", "⇧", "⌘"];
  mods.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  return mods.join("") + (key === "Tab" ? "⇥" : key);
}
