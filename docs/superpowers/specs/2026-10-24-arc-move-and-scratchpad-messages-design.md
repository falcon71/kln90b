# MOVE ? on FPL 0 (#134) and scratchpad messages on the MSG page (#237): design

Date: 2026-10-24. Issues: #134, #237. Branch: `fix-134-237-arc-move-scratchpad`. Two small changes: this short design
records what was settled in chat. Each issue gets its own `fixes #NN` commit with its tests.

## Intent

- **#134:** 6-17 lets the pilot move the intercept of a DME arc from the FPL 0 page as well as from Super NAV 5. Only
  Super NAV 5 offers it today; on FPL 0, CLR on any approach waypoint gives `INVALID DEL`.
- **#237:** `NO INTRCEPT` (6-18, C-2) is published to the status line, which Super NAV 5 hides, so the pilot never sees
  it there. The AVsoftech 90B trainer shows how the unit makes such a message reachable: every scratchpad message is
  also an entry on the MSG page and flashes the MSG light until the status line has shown it for 5 seconds.

## Evidence

- Pilot's Guide 6-16 to 6-18 (DME arc, MOVE ? from Super NAV 5 or FPL 0, NO INTRCPT in the scratch pad), 3-10
  (status line messages), 3-16 (MSG page, read messages), C-2 (status line message list).
- KLN 89 guide 5-24, 5-25: the same MOVE ? procedure, with a figure only of the NAV 4 scan window.
- AVsoftech KLN 90B trainer (third party, unreliable), the maintainer, 2026-10-24: on Super NAV 5, GPS/APR posts
  `NO APPROACH`, invisible there, flashing the MSG light indefinitely. MSG shows it on the MSG page and the status line;
  the MSG page keeps listing it after the status line clears; the light goes off when the status line clears. Leaving
  Super NAV 5 for another page shows it on the status line for 5 s. Reading it does not stop the flashing. The message
  stays after its cause is gone.
- AVsoftech trainer, 2026-10-24 (agent, timings from screenshots, about ±0.1 s):
  - The 5 s run on a wall clock from the first time the status line shows the message, also while it is hidden again;
    the expiry only takes effect while the status line is visible (closed at 2.3 s, reopened at 3.5 s: cleared at
    5.1 s; reopened after 8.5 s: cleared at once, still listed on the MSG page, light off).
  - A message posted while the MSG page is open shows on the status line but is not added to the open page; reopening
    within the 5 s lists it.
  - On the MSG page the entry is a single line at column 0, normal video. The status line shows it inverse.
  - With only read messages left after it clears, the light is steady.
  - A second, different message within the 5 s replaces the text but clears 5 s after the first one's first display;
    in the one usable sample only the first was listed. The same message twice gives one entry and no restart.
  - `D-> CRS 308` is listed as `D-> CRS`. In one sample the entry was listed below an older message.
  - The trainer has a DME arc (KFLD VORD 36) but answers CLR on it with `INVALID DEL` on FPL 0, and offers no MOVE ? on
    Super NAV 5 either: it never implemented the function.
- The KLN 89 trainer does not list scratchpad messages on its message page; its scratchpad is always visible, so it
  never needs to (the maintainer).

## Rulings (the maintainer, 2026-10-24)

- #237 is implemented as the 90B trainer shows it, for every scratchpad message, not only on Super NAV 5.
- A second scratchpad message within the 5 s is too rare an edge case to trust the trainer on: do whatever is simpler,
  and pin it as a characterization test whose comment says how the 90B trainer behaves.
- The trainer is unreliable on MOVE ?, so the guide wins. The FPL 0 row copies `DEL`: the whole row becomes
  `MOVE      ?` (11 cells, the `?` in the last one), inverse and flashing.
- #237 approach A (below).

## Approaches for #237

- **A (chosen):** a scratchpad message is a real entry in `MessageHandler`. The status line adds it when it receives
  the message, keeps the clock and ends it. The MSG page snapshot, the light, the read handling and the power-off clear
  then need no special case.
- B: keep the scratchpad out of the message list; the MSG page reads the current scratchpad when it builds its pages,
  and the light logic adds "or a scratchpad is active". Special cases in the page list, the light and the `msg` prompt,
  and no natural answer to what "read" means for it.

## Approaches for #134

One sensible way: move the recompute out of `SuperNav5DirectToSelector` into a helper both pages call, and give
`FlightplanListItem` a MOVE question beside its DEL question. Copying the code was dropped: the arc code already has
open bugs (#104, #121) that two copies would let drift apart.

## Design

### #237: the scratchpad message

- A new `Message` class (in `data/MessageHandler.ts`) holds the text, the time of its first display (none yet) and
  whether it has ended. `isConditionValid` is "not ended". It never counts as read: `seen` reads false and ignores
  writes, so the existing light logic flashes it after the MSG page has shown it (the trainer).
- `StatusLine` keeps the current entry. On `statusLineMessage` it ends and removes the previous entry, if any, and adds
  a new one to `MessageHandler`.
- On a display tick while the status line is visible, an entry without a first display gets one (now). The countdown
  is wall-clock time since then and runs while hidden. When 5 s have passed and the status line is visible, the entry
  ends, is removed from `MessageHandler` at once (so the light follows on the same display tick, not the next 1 Hz
  message tick) and the status line shows its normal content again. While hidden, an expired entry stays.
- `StatusLine.destroy` ends and removes its current entry, so a screen change (the welcome and take-home screens have
  their own status line) or a power-off leaves nothing behind. `MessageHandler.clear` at power-off clears it as well.
- On the MSG page the entry is one line, the same text as on the status line, in the existing newest-first order.
  The MSG page's snapshot already gives "stays on the open page after the status line clears" and "not added to an
  open page".
- **Second message (the simpler behavior):** it replaces the current entry and gets its own full 5 s; only the newest is
  listed. Pinned as a characterization test noting that the 90B trainer keeps the first message's clock and, in one
  sample, listed only the first.
- **The builder's call (Claude's):** listing `D-> CRS nnn` with its course, as on the status line (the trainer drops
  it); keeping newest-first (the trainer's single sample had the entry below an older one).
- Super NAV 5's `NO INTRCEPT` publish stays as it is; its "how does this work?" comment is replaced by a reference to
  this behavior.

### #134: MOVE ? on FPL 0

- A shared helper (in `SidStar` or next to it) does what `SuperNav5DirectToSelector.enter` does today: recompute the
  entry with `recalculateArcEntryData`, write the new `arcData` and `wpt` to the leg, recalculate the active path when
  the leg is the active one, and publish `NO INTRCEPT` when there is no intercept. Super NAV 5 calls it, with
  unchanged behavior.
- `FlightplanListItem` in FPL 0, on a leg with `arcData` (the leg that starts an arc, the guide's "first waypoint of
  the arc"):
  - CLR shows `MOVE      ?` over the whole row, inverse and flashing, like `DEL` (same element pattern as `delRef`).
  - CLR again withdraws it (as 4-5 for DEL). A knob turn withdraws it as it does DEL (#317).
  - ENT runs the helper; the cursor stays on the row, which shows the new entry name.
  - CLR on every other approach waypoint keeps `INVALID DEL`.
- The flight plan list must show the renamed leg after ENT; the builder checks how the list rebuilds after a leg is
  changed in place and adds what is missing.
- Known arc bugs stay out of scope: #104 (right-hand arc entry misnamed after a recalculation), #121 (closest-leg logic
  on an arc).

## Tests

- #237, at the render stage: the light flashes for a scratchpad message on a normal page and goes dark 5 s later; on
  Super NAV 5 it keeps flashing past 5 s; MSG lists the entry and the status line shows it; the page keeps it after the
  status line clears; the wall-clock case (close early, reopen after 5 s: clears at once, still listed); a message
  posted while the MSG page is open is not on the open page; reading it does not stop the flashing; the second-message
  characterization.
- #134, at the render stage, with the arc fixtures of `SuperNav5DirectToSelector.test.ts`: CLR shows `MOVE      ?`
  (text, inverse, flashing), CLR again and a knob turn withdraw it, ENT moves the entry and the row shows the new name,
  no intercept gives `NO INTRCEPT`, CLR on a non-arc approach waypoint still gives `INVALID DEL`. The Super NAV 5 tests
  stay green.
- The 90B trainer results go into the record: a dated block in `docs/kln89-trainer-record.md`, marked as the AVsoftech
  90B trainer.

## Left to the builder

The class and helper names, the file for the helper, and how `StatusLine` reaches `MessageHandler` (it already has
`props.messageHandler`).
