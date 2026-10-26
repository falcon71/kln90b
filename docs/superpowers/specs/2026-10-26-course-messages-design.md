# The course messages ADJ NAV IND CRS TO and ADJ NAV IND CRS (#401, #434, #435, #436)

Date: 2026-10-26. A project-sized design: four issues in one area, three installation cases.

## Intent

The unit tells the pilot to set the course on the HSI or CDI with two messages:

- **The TO message**, `ADJ NAV IND CRS TO nnn°`: "set the course pointer to the new DTK".
- **The plain message**, `ADJ NAV IND CRS`: "the indicator did not follow the course the unit set".

Which one appears, when, and for how long depends on what the unit can do with the course indicator. Today the code
gets it wrong in all three installation cases: messages that flash for a second (#401), come too early (#434), hang on
for a fixed 30 s instead of following the turn or the indicator (#434, #436), and a Direct To that sets a course the
unit only reads (#435). Goal: emulate the real unit in each case, as far as the evidence reaches, and say how far it
reaches.

## The three cases

The case is decided on every calculation tick from the panel.xml options and what the sim reports:

| Case | Condition in the code | What it means |
|---|---|---|
| **Unreadable** | `Output.ObsTarget` 0 and `sensors.in.obsMag` null | The unit neither sets nor sees the indicator's course. In the sim: `Input.ObsSource` 0, or the CDI is not on GPS (`GPS DRIVES NAV1` false). |
| **Readable, not driven** | `Output.ObsTarget` 0 and `sensors.in.obsMag` not null | The unit reads the course the pilot sets but cannot set it. The indicator's course is an input. |
| **Driven** | `Output.ObsTarget` 1 or 2 | The unit sets the course (`K:VOR1_SET`/`K:VOR2_SET`) and reads it back from `Nav OBS` when the CDI is on GPS. |

A readable installation becomes unreadable for as long as the CDI is switched away from GPS, and back again; the rules
follow the case of the current tick. `Output.ObsTarget` can also change while the unit runs (`L:KLN90B_ObsTarget`,
`SimVarSync`), so the course message logic must handle all three cases at run time, not only the one configured at
boot as `buildPersistentMessages` does today.

## Rules common to all cases

- **Not before the self-test is approved** (#330, unchanged): no course message is evaluated on the Turn-On page or the
  self-test page, and the course at the approval counts as no change.
- **Reading a message** (3-16): a message whose condition still holds stays on the MSG page after it is read, with the
  prompt steady instead of flashing; it goes when its condition ends. This is how `MessageHandler` already treats every
  condition message. *My call for the unreadable case*, where today reading removes the message at once: the condition
  there is "the turn is being flown", and 3-16 keeps such a message listed until it ends.
- **A new DTK while the TO message is listed** posts it again, unread, with the new number: the pilot has a new course to
  set. A new DTK is a jump of more than 5° from one calculation tick to the next: a leg change, a Direct To, an
  ACTIVATE or an edit of FPL 0. A DTK that drifts (a DME arc, a long great circle, the next leg's DTK taken at the
  closest point during a turn) moves far less per tick and never posts again. Between such jumps the number shown
  follows the live DTK, as today. *My call*; the AVsoftech trainer replaced an old-leg message with the new DTK at a leg
  switch, but whether the prompt flashed again was not recorded.
- **The thresholds**: "off" means more than 5° between the indicator's course and the DTK (B-1, KA 90 manual), and more
  than 0.5° between the indicator and the unit's own course for the plain message (B-1). "More than 12 s" means the
  condition has held without a break for more than 12 s, measured with `Date.now()`.
- **What counts as a leg change**: the DTK of the active flight plan moving on to the next leg by itself, at the start of
  turn anticipation (the DTK switches with the turn, 4-8, as `NavCalculator` does today) or at the sequencing when there
  is no turn. A Direct To, activating a flight plan or an approach, editing FPL 0, and LEG/OBS switching are not leg
  changes.

## Case 1: unreadable

**Posted**

- The TO message, in Leg mode, at a leg change at the start of turn anticipation where the DTK changes by more than 5°
  (4-8, B-1).

**Removed**

- When the waypoint alert ends, that is when the arrow stops flashing at the end of the turn (`navPage.waypointAlert`
  goes false). Read or not.
- When the unit leaves Leg mode, or has no DTK.

**Never posted**

- The plain message: there is no course to compare.
- The TO message for a Direct To, activating a flight plan, the first DTK after power-up, LEG to OBS and back, or a
  DTK that drifts (a DME arc): there is no turn and so no waypoint alert to tie it to. *This is open question 1.*
- In OBS mode: no course message. A Direct To in OBS mode still sets the unit's own course and shows `d› CRS nnn°` on
  the status line (5-37, unchanged), because the pilot must set the indicator by hand.

**Sources**

- Pilot's Guide 4-8: at the start of turn anticipation the alert goes steady and the TO message appears for a course
  change of more than 5°. B-1 says the same. Neither gives an end.
- Tu-154 video (https://youtu.be/S1lt2W95bLA, both turns, about t=2245 and t=2574), the maintainer, 2026-10-26: the MSG
  light comes on at the start of the turn and goes out, unread, at the same moment the arrow and the waypoint alert stop
  flashing. 4-8 says there is no message when the unit slews the pointer, and the light did come on, so the unit there
  did not drive the pointer. Whether it could read it is not known. An agent analysis found the pointer moved smoothly
  by 74° within about 3 s at 37:13 (servo-like, moderate confidence), most likely driven by the aircraft's own
  navigation computer; the MSG lamp kept flashing until about 37:50, well after the pointer had moved.
- Air Chathams CV580 video, at 30:38, the maintainer, 2026-10-26: the CDI is on NAV 1, so the unit cannot see the
  course. No message while the CDI was off course; the MSG light came on at the start of the turn and went out at its
  end.
- The 30 s window of #177 was an estimate from the Tu-154 video, in which the unit is not always in view. It goes.
- Not followed: the KLN 89 trainer (no course input) posts its own message, `GPS Course is nnn°`, at a Direct To and at
  the start of turn anticipation, and keeps it until read. It is a different unit with a different message.

**Confidence**: high for the start and the end at a turn (two real-unit videos, two turns in one, the Pilot's Guide).
Unknown for everything that is not a turn.

## Case 2: readable, not driven

**Posted** (Leg mode only; one message, two triggers, A in the approaches below)

- **At a leg change**: at once, if the indicator's course is more than 5° off the new DTK.
- **At any other time**: when the indicator's course has been more than 5° off the DTK for more than 12 s. This covers a
  Direct To, activating a flight plan, the first DTK, OBS to LEG, a DTK that drifts, and the pilot turning the course
  away. The 12 s runs from the moment the course went more than 5° off and is not restarted by a DTK change while it
  stays off (*my call*; no source covers a DTK change during the count). A leg change while the count runs posts at
  once.

**Removed**

- As soon as the indicator's course is within 5° of the DTK (the next calculation tick). Read or not; at any time,
  also long after the turn.
- When the unit leaves Leg mode, or has no DTK.
- Not when the waypoint alert ends, and not after a fixed time: there is no forced window.

**Never posted**

- The plain message. The indicator's course is the unit's input: in OBS mode it *is* the OBS course, so the two cannot
  differ (the maintainer's ruling, 2026-10-26). The KA 90 manual's 12 s fallback for this case (pp. 3-43, 3-45) does
  not apply.
- The TO message with the indicator already within 5° of the new DTK at a leg change, or set within 12 s after any
  other change.
- In OBS mode: no course message. A Direct To in OBS mode shows `d› CRS nnn°` with the direct course for the pilot to
  set, but leaves the unit's course alone; ACTIVATE leaves it alone too (#435, below).

**Also in this case, unchanged**: NAV 3 and Super NAV 5 flash the DTK while the indicator is more than 10° off it (4-9,
`ObsDtkElement`), and MOD 2 and NAV 3 show the OBS course read-only.

**Sources**

- Pilot's Guide B-1: with a readable course the TO message appears in Leg mode whenever the course differs from the DTK
  by more than 5°. Its "also" adds this to the turn-anticipation message of 4-8, which the leg-change trigger serves.
- KA 90 Installation Manual (Rev 3, 11/2002), pp. 3-43 and 3-45: in Leg mode the message only after more than 5° for
  more than 12 s. The KLN reads such an indicator directly; the timing described is the KLN's.
- AVsoftech KLN 90B trainer (third party, unreliable, but it reads its HSI course; docs/kln89-trainer-record.md, the
  two course-message blocks of 2026-10-26):
  - Direct To: the message 12.2-12.9 s after ENT with the course left off; none with it already set or set within
    about 6 s; a 5 s swing gives nothing (high).
  - Leg change: the message in the frame of the switch with the course left off (high, six runs, turns of 26-160°);
    none with the course set before the switch (medium, one clean run, three near misses that posted).
  - The message stays for minutes with the course off, regardless of the arrow, and goes within about 1.5 s of the
    course being set (high).
- Not followed from that trainer: a read message coming back as new 12 s after the MSG page is left (3-16 keeps it,
  with a steady prompt), and its window of perhaps ±2.5° (low confidence; the manuals give 5°).

**Confidence**: medium-high for the 12 s rule (manufacturer's manual and the trainer agree); medium for the leg-change
trigger and the removal (the Pilot's Guide's wording and one third-party trainer).

## Case 3: driven

**Posted**

- The plain message, in Leg and OBS mode, when the course read back from the indicator has been more than 0.5° off the
  course the unit sends for more than 12 s (#401).

**Removed**

- As soon as the indicator is within 0.5° of the unit's course. Read or not.
- When no course is read back (the CDI is switched away from GPS).

**Never posted**

- The TO message, in any mode: 4-8 and B-1 give no turn-anticipation message when the unit slews the pointer itself.
- The plain message during an ordinary slew: a slew that finishes within 12 s, including the one-tick lag of the read
  (#401), never posts. The sim's whole-degree course (#427) stays within 0.5°.

**Sources**

- Pilot's Guide B-1: the plain message for an indicator that is not slewed to the course the unit set. No time given.
- KA 90 manual: no slew time for a driven indicator; 12 s is carried over from the readable case by analogy (the
  maintainer, 2026-10-26).

**Confidence**: high that the message is for an indicator that fails to follow; the 12 s is a reasoned choice.

## #435: a Direct To in OBS mode with a readable indicator

Today a Direct To in OBS mode calls `setObsTrueOnUnit` in every case, and with a readable, undriven indicator the next
tick reads the indicator back over it, so for up to a second the pages and the OBS output show the direct course and
then flick back. An ACTIVATE across a variation change does the same with the held true course (#425).

- **Readable, not driven**: the Direct To computes the direct course at the waypoint (`courseAtWaypoint`, #370, falling
  back to the course held, #426) only to show it in the `d› CRS nnn°` status line, in magnetic with the OBS variation
  of the new active waypoint, the same number the pilot would see once set. The course in use stays the indicator's:
  the Direct To and ACTIVATE lay the indicator's magnetic course, as read, through the new active waypoint
  (`ModeController.setObs` with `force`, without writing the output). Skipping the call altogether would leave the
  straight leg from the aircraft that `ActiveWaypoint.directTo` sets up, and the next tick re-lays the line only when
  the read course differs from the course held, which it does not when the variation is the same.
- **Unreadable and driven**: unchanged. The Direct To sets the course (and slews a driven indicator at once, #261);
  ACTIVATE keeps the true course (#425). `d› CRS` stays for `Output.ObsTarget` 0 only.

## Approaches

Considered for the message rules:

- **A, chosen (the maintainer, 2026-10-26): the readable case has two triggers**, a leg change at once and anything else
  after 12 s, with removal by the indicator only. It is what the Pilot's Guide words (4-8 plus the "also" of B-1) and
  what the trainer shows.
- B: 12 s for everything in the readable case. Simpler (no need to tell a leg change from a Direct To) and the KA 90
  manual's wording, but it posts later than 4-8 at a turn. Dropped.
- Keeping the 30 s forced window for the readable case (what #434 first said): it holds the message up after the pilot
  has set the course, which the trainer contradicts. Dropped.
- For #401, reordering the calculation tick so the unit reads the indicator after it writes the course: fixes only the
  one-second glitch and gives no time for a real indicator to slew. Dropped for the 12 s rule.
- For the unreadable case, the 30 s window (#177) against the waypoint alert: the two videos decide for the alert.

For #435, putting the guard inside `setObsTrueOnUnit` instead of the Direct To page: it would hide the rule in a setter,
and the `d› CRS` text reads the number back from the course it just set. Dropped.

## Open questions for the maintainer

1. **Unreadable: a Direct To in Leg mode.** Today it opens the 30 s window. This design posts nothing, because there is
   no turn and no alert, and 4-8 names only turn anticipation. The KLN 89 posts its course message there, but that
   message has no 90B equivalent. Keep "nothing"?
2. **Unreadable: a leg change without turn anticipation** (SET 6 disabled, a fly-over waypoint, a duplicated waypoint).
   The alert ends at the sequencing, so tying the message to it gives nothing. Proposal: post at the sequencing when the
   DTK changes by more than 5°, and keep it until read or until the next leg change, as the KLN 89 keeps its message.
   The alternative is no message, since 4-8 ties it to turn anticipation. No source decides.
3. **Unreadable, abeam plan**: the alert ends at the sequencing there today (#406, open), so the message would too. It
   follows #406 when that is fixed; no extra rule here. Agreed?

## Goals

1. **#401**: the plain message only after more than 12 s off by more than 0.5°.
2. **#434**: the readable case as in case 2: no forced window, a leg change at once, otherwise more than 12 s, removed
   by the indicator.
3. **#436**: the unreadable case as in case 1: posted at the turn, removed when the waypoint alert ends.
4. **#435**: a Direct To and ACTIVATE in OBS mode leave the course of a readable, undriven indicator alone.

## Non-goals

- The DTK flash on NAV 3 and Super NAV 5, the read-only OBS field, the `d› CRS` text for the unreadable and driven
  cases, and the self-test gate (#330): unchanged.
- The waypoint alert itself (its start, its end, #406): unchanged; the message follows it.
- The 89's `GPS Course is` message, the AVsoftech re-post after reading, and its narrower window: not emulated.
- No public contract changes: no H event, LVar, panel.xml key or SimVar is added or changes meaning.

## Left to the builder

- How the message learns that a DTK change was a leg change (for example a marker set by `NavCalculator` or
  `ActiveWaypoint` when the turn starts or the sequencing happens, read by the message in the same tick; the calculation
  order already runs `NavCalculator` before `MessageHandler`). Note that the DTK switches on the tick after the turn is
  pushed, because `NavCalculator` computes the DTK before it starts the turn.
- One small time-based helper for "held for more than 12 s", shared by both message classes. `MessageHandler.tick`
  evaluates `isConditionValid` twice per tick while a message is listed, so no state may depend on the number of calls.
- Whether the two `ObsTarget` 0 cases stay in one class or split by the current tick's case.
- How the `d› CRS` number for #435 is computed without setting the course (for example a pure conversion on
  `ModeController` with the OBS variation of the new active waypoint).
- Test stages: unit for the message conditions (`test/unit/data/PersistentMessages.test.ts`), render for #435
  (`test/render/pages/left/DirectToObs.test.ts`), and a flight or render test that flies a turn for the unreadable
  case, so the alert's real end is used. The #177 and #434 tests that hold the forced window and the immediate post
  change; the #330 tests stay.

## Commits

One per issue, each with its tests and comments citing the pages above: `fixes #401`, `fixes #434`, `fixes #436`,
`fixes #435`. The trainer record of 2026-10-26 is already committed (`references #434`).
