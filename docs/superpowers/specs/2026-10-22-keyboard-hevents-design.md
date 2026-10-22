# Keyboard mode H events (#83) and the remaining cheap keyboard fields (#109)

Date: 2026-10-22. Size: a small change; this is the short design.

## Intent

**#83.** Pilots who fly with a Stream Deck or similar hardware want a button that enters and leaves keyboard mode,
because it is quicker for them than clicking the CRSR text with the mouse. The mouse stays available and keeps working
as it does today.

**#109.** Keyboard mode is the project's own feature; the real unit has none. Pilots use it to enter a flight plan and
a waypoint ident quickly, and both already work. The rest is nice to have, so only the cells that are cheap to fix get
fixed. The maintainer will not add complexity that nobody will notice.

## Goals

- Two new public H events, `KLN90B_LeftKeyboard_Toggle` and `KLN90B_RightKeyboard_Toggle`, in `kln90b/HEvents.ts`.
  - Pressed while that side is not in keyboard mode: that side enters keyboard mode. If the other side was in keyboard
    mode, it leaves it (its cursor stays on).
  - Pressed while that side is in keyboard mode: keyboard mode ends and the cursor stays on.
  - If the side's cursor is off, the event first does what that side's CRSR button does, and then what a left click on
    the CRSR text does. Both follow their existing rules: CRSR may close the MSG page or may not turn a cursor on at
    all, and the click only enters keyboard mode with the cursor on and a status line shown (so not on Super NAV 5,
    which has none). When those rules refuse, the event does nothing more.
- #109: a typed `0` selects the blank in a cell whose first choice is a blank (`NumberEditorField.createWithBlankMax`:
  the NDB frequency's thousands cell and the magnetic variation cell). On the runway surface cell, `H` selects `HRD` and
  `S` selects `SFT`.

## Non-goals

- The date's day and month cells, and the time's hours cell, stay knob-only. A two-digit cell would need the keyboard
  to hold one cell across two keys, while today every accepted key moves the cursor on; the month's first letters are
  ambiguous (J, M, A).
- No general "match by first letter" rule for editor cells: it would pick wrong entries in the month and the two-digit
  cells.
- No change to how keyboard mode is left (Escape, a right click, the cursor turning off, power off). A click outside
  the gauge does not leave it and never did.

## Approaches (#83)

- **A. Handle the events in `KLN90BCore.onInteractionEvent`, next to the scan-knob handling (chosen).** The core
  dispatches the side's CRSR event through `PageManager` when that cursor is off, then calls one shared
  `PageContainer` method that toggles keyboard mode for a side. The left-click handler calls the same method, so the
  click and the H event cannot drift apart.
- B. Route the events through the pages like the knobs. Rejected: keyboard state lives in `PageContainer`, and the
  welcome page and the Super NAV overlays each have their own `onInteractionEvent`, so each would need a pass-through.
- C. Publish a bus event that `PageContainer` subscribes to (as it does for power-off). Rejected: A with an extra hop;
  the CRSR step still has to go through the page dispatch.

The maintainer picked A.

**Spike (2026-10-22, in the sim):** a throwaway mapping of MSG to "enter right keyboard mode" showed that focusing the
hidden input from code (`focus()` plus Coherent's `FOCUS_INPUT_FIELD`) works like the mouse click: KYBD came on, keys
typed at once, and Escape and a right click left keyboard mode.

## Decisions

- Event names follow `KLN90B_LeftCursor_Toggle`. They are public contract from now on.
- The internal CRSR step goes straight to `PageManager.onInteractionEvent`; it is not published as an H event of its own.
- The hot-swap-disabled check in `onInteractionEvent` already ignores the new events, like every other event.
- One commit per issue: `fixes #83 …` and `fixes #109 …`, each with its tests and its README change (the Keyboard Mode
  section names the new H events; the README's H event pointer to `HEvents.ts` covers aircraft developers). The fixed
  #109 closes that issue with the date, month and hours left out by decision.
- The NDB frequency pin in `test/render/controls/editors/NdbFreqEditor.test.ts` becomes a passing test.

## Left to the builder

- Refactoring the click handler into the shared method, and the name of that method.
- Tests at the render stage (`test/render/controls/PageContainer.test.ts` has the keyboard-mode characterizations to
  build on), and `EditorField` tests for the `0` and `H`/`S` keys.
