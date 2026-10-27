# The course messages and the waypoint alert at a turn (#401, #434, #435, #436, #437)

Date: 2026-10-26, revised 2026-10-27 with the maintainer's rulings and #437. A project-sized design: five issues in one
area, three installation cases.

## Intent

The unit tells the pilot to set the course on the HSI or CDI with two messages:

- **The TO message**, `ADJ NAV IND CRS TO nnn°`: "set the course pointer to the new DTK".
- **The plain message**, `ADJ NAV IND CRS`: "the indicator did not follow the course the unit set".

Which one appears, when, and for how long depends on what the unit can do with the course indicator. Today the code
gets it wrong in all three installation cases: messages that flash for a second (#401), come too early (#434), hang on
for a fixed 30 s instead of following the leg change, the turn or the indicator (#434, #436), and a Direct To that sets
a course the unit only reads (#435). At a turn the TO message is tied to the external waypoint alert light, which today
does not show the flashing-to-steady change that marks the start of the turn (#437). Goal: emulate the real unit in
each case as far as the evidence reaches, keep the rules as uniform as the evidence allows, and say how far it reaches.

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

## Definitions

- **Leg change**: the DTK of the active flight plan moving on to the next leg by itself. That is the start of an
  anticipated turn (the DTK switches with the turn, 4-8, as `NavCalculator` does today), the start of the abeam turn on
  the abeam plan, or the sequencing at a waypoint without a turn (turn anticipation off on SET 6, a fly-over or
  duplicated waypoint). A Direct To, activating a flight plan or an approach, editing FPL 0, and switching between LEG
  and OBS are not leg changes.
- **The turn**: from the start of an anticipated or abeam turn until it ends, the time `NavCalculator` holds a turn on
  the turn stack. Its start is the moment the external waypoint alert light changes from flashing to steady, its end
  the moment the light goes off (#437, 4-8).
- **Off**: more than 5° between the indicator's course and the DTK for the TO message (B-1, KA 90 manual); more than
  0.5° between the indicator and the unit's own course for the plain message (B-1).
- **More than 12 s**: the condition has held without a break for more than 12 s, measured with `Date.now()`.
- **Read**: the message has been on a MSG page the pilot viewed (`MessagePage.markSeen`, 3-16).

## Rules common to all cases

- **Not before the self-test is approved** (#330, unchanged): no course message is evaluated on the Turn-On page or the
  self-test page, and the course at the approval counts as no change.
- **The TO message is removed once it is read**, in every case (the maintainer's ruling, 2026-10-27). With a readable
  course it comes back, unread, if the course is still off 12 s after the read (case 2). This is unlike other condition
  messages, which stay listed with a steady prompt after reading (3-16); the plain message keeps that behavior (*my
  call*: the ruling names the TO message only).
- **The number in the TO message follows the live DTK** while it is listed, as today: a leg change, a Direct To or a
  drifting DTK (a DME arc) updates it.
- **The TO message is removed when the unit leaves Leg mode or has no DTK** (*my call*, as today).
- **No TO message in OBS mode**, in any case. **No TO message for a driven indicator**, in any mode.

## Case 1: unreadable

**Posted** (Leg mode)

- At a leg change where the DTK changes by more than 5° (4-8, B-1). At an anticipated turn that is the moment the WPT
  light goes from flashing to steady.

**Removed**

- When it is read.
- At the end of the turn, when the WPT light goes off, if the leg change started a turn. Read or not.
- Not automatically after a leg change without a turn (turn anticipation off, a fly-over waypoint): nothing marks an
  end there. It stays until read, or until the next leg change gives it a new number. *Low confidence, inferred* (the
  maintainer's ruling); its tests are characterizations.
- When the unit leaves Leg mode, or has no DTK.

**Never posted**

- The plain message: there is no course to compare.
- The TO message for a Direct To, activating a flight plan, the first DTK after power-up, LEG to OBS and back, or a
  DTK that drifts (a DME arc).
- In OBS mode: no course message. A Direct To in OBS mode still sets the unit's own course and shows `d› CRS nnn°` on
  the status line (5-37, unchanged), because the pilot must set the indicator by hand.

**Sources**

- Pilot's Guide 4-8: at the start of turn anticipation the WPT light goes steady and the TO message appears for a course
  change of more than 5°. B-1 says the same. Neither gives an end.
- Tu-154 video (https://youtu.be/S1lt2W95bLA), the maintainer, 2026-10-26 and 2026-10-27:
  - Both turns (about t=2245 and t=2574): the MSG light comes on when the WPT light goes from flashing to steady at the
    start of the turn, and goes out, unread, when the WPT light goes off at the end of the turn.
  - About 43:52: a Direct To posts no message and gives no waypoint alert.
  - 4-8 says there is no message when the unit slews the pointer, and the light did come on, so the unit there did not
    drive the pointer; the Direct To without a message also fits a course it cannot read. An agent analysis found the
    pointer moved smoothly by 74° within about 3 s at 37:13 (servo-like, moderate confidence), most likely driven by
    the aircraft's own navigation computer; the MSG lamp kept flashing until about 37:50, after the pointer had moved.
- Air Chathams CV580 video, at 30:38, the maintainer, 2026-10-26: the CDI is on NAV 1, so the unit cannot see the
  course. No message while the CDI was off course; the MSG light came on at the start of the turn and went out at its
  end.
- A leg change without a turn: the AVsoftech trainer posts the message the instant the leg switches. The KLN 89 and the
  AVsoftech trainer both stop the waypoint alert at the sequencing, so the alert cannot end the message there.
- The 30 s window of #177 was an estimate from the Tu-154 video, in which the unit is not always in view. It goes.
- Not followed: the KLN 89 trainer (no course input) posts its own message, `GPS Course is nnn°`, also at a Direct To.
  It is a different unit with a different message.

**Confidence**: high for the start and the end at a turn and for no message at a Direct To (two real-unit videos, the
Pilot's Guide). Low for the message without a turn staying until read.

## Case 2: readable, not driven

**Posted** (Leg mode; one message, two triggers)

- **At a leg change**: at once, if the indicator's course is more than 5° off the new DTK.
- **At any other time**: when the indicator's course has been more than 5° off the DTK for more than 12 s. This covers a
  Direct To, activating a flight plan, the first DTK, OBS to LEG, a DTK that drifts, the pilot turning the course
  away, and a message that was read while the course was still off. The 12 s run from the moment the course went more
  than 5° off, or from the read; a DTK change while the course stays off does not restart them (*my call*; no source
  covers a DTK change during the count). A leg change during the count posts at once.

**Removed**

- When it is read; the 12 s count starts again at the read.
- As soon as the indicator's course is within 5° of the DTK (the next calculation tick), at any time, also long after
  the turn.
- When the unit leaves Leg mode, or has no DTK.
- Not when the waypoint alert ends, and not after a fixed time: there is no forced window.

**Never posted**

- The plain message. The indicator's course is the unit's input: in OBS mode it *is* the OBS course, so the two cannot
  differ (the maintainer's ruling, 2026-10-26). The KA 90 manual's 12 s fallback for this case (pp. 3-43, 3-45) does
  not apply.
- The TO message with the indicator already within 5° of the new DTK at a leg change, or set within 12 s after any
  other change.
- In OBS mode: no course message. A Direct To in OBS mode shows `d› CRS nnn°` with the direct course for the pilot to
  set, but the course in use stays the indicator's; ACTIVATE leaves it the indicator's too (#435, below).

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
  - A message read with the course still off is removed and comes back as new about 12 s after the MSG page is left
    (five runs). Adopted by the maintainer's ruling; the count here starts at the read, which differs from leaving the
    page only while the pilot keeps the MSG page in view (*my call*).
- Not followed from that trainer: its window of perhaps ±2.5° (low confidence; the manuals give 5°).

**Confidence**: medium-high for the 12 s rule (manufacturer's manual and the trainer agree); medium for the leg-change
trigger, the removal by the indicator and the return after reading (the Pilot's Guide's wording and one third-party
trainer).

## Case 3: driven

**Posted**

- The plain message, in Leg and OBS mode, when the course read back from the indicator has been more than 0.5° off the
  course the unit sends for more than 12 s (#401).

**Removed**

- As soon as the indicator is within 0.5° of the unit's course. Read or not; once read it stays listed with a steady
  prompt until then (3-16, unchanged).
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

## #437: the waypoint alert at an anticipated turn

The alert is one flag today (`navPage.waypointAlert`), and the WPT light, the active arrow and the Super NAV 5 ident all
show it the same way for its whole length. It becomes two phases at a waypoint with an anticipated turn (the lead plan
or the abeam plan):

| | Before the turn (from about 20 s before it, timing unchanged) | The turn | After |
|---|---|---|---|
| External WPT light | flashing | steady | off |
| Active arrow (NAV, D/T, waypoint, ACT, FPL 0 pages) | steady | flashing | steady |
| Super NAV 5 active ident | flashing | steady | steady |

- The light and the arrow: the Tu-154 video, the maintainer, 2026-10-27, and 4-8 for the light. The guide's 4-8 has the
  arrow flashing from 20 s before the turn; the maintainer takes the video over that wording.
- The Super NAV 5 ident: 4-8 names it together with the light as the one that stops flashing and goes steady at the
  start of the turn; the video does not show it. *Guide-based.*
- At a waypoint without an anticipated turn (a Direct To outside FPL 0, the last waypoint, turn anticipation off, a
  fly-over or duplicated waypoint, OBS mode): the light flashes, instead of today's steady, together with the arrow and
  the Super NAV 5 ident, for the alert time of #372 (about 15 s with turn anticipation on, 36 s off) until the
  waypoint (3-29, 4-9). *Proposal from the guide*; neither video shows it.
- The alert's start, its end (#406 for the abeam plan) and `navPage.waypointAlert` as "the alert is on" stay as they
  are; the change is in how each indicator shows it. The flashing of the light follows the blink of the display tick,
  as the MSG light does (`StatusLine`).

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
  after 12 s, with removal by the indicator. It is what the Pilot's Guide words (4-8 plus the "also" of B-1) and what
  the trainer shows.
- B: 12 s for everything in the readable case. Simpler (no need to tell a leg change from a Direct To) and the KA 90
  manual's wording, but it posts later than 4-8 at a turn. Dropped.
- Keeping the 30 s forced window for the readable case (what #434 first said): it holds the message up after the pilot
  has set the course, which the trainer contradicts. Dropped.
- For #401, reordering the calculation tick so the unit reads the indicator after it writes the course: fixes only the
  one-second glitch and gives no time for a real indicator to slew. Dropped for the 12 s rule.
- For the unreadable case, the 30 s window (#177) against the turn: the two videos decide for the turn.
- Keeping a read TO message listed (3-16) against removing it once read: the maintainer chose removal, which with the
  12 s return makes one rule for all cases and gives the pilot a reminder with a readable course.

For #435, putting the guard inside `setObsTrueOnUnit` instead of the Direct To page: it would hide the rule in a setter,
and the `d› CRS` text reads the number back from the course it just set. Dropped.

## Open question for the maintainer

**The WPT light LVar.** `L:KLN90B_WptLight` is part of the public contract, documented as "true if the waypoint alert
is active" (`LVars.ts`, the wiki page External Annunciators). Making the light flash changes what it carries.

- Toggle `L:KLN90B_WptLight` with the blink, as `L:KLN90B_MsgLight` already does (*recommended*): every aircraft that
  wires it to a lamp shows the real behavior without a change, and the MSG light has set the pattern. Aircraft that use
  it as a logic signal ("alert on") would see it toggle; the wiki page and the comment in `LVars.ts` change.
- Keep `L:KLN90B_WptLight` steady as it is and add a new LVar for the lamp: nothing changes for existing aircraft, which
  then also do not get the flashing until their authors switch.

## Goals

1. **#437**: the WPT light, the arrow and the Super NAV 5 ident show the two phases of the alert at a turn.
2. **#401**: the plain message only after more than 12 s off by more than 0.5°.
3. **#434**: the readable case as in case 2.
4. **#436**: the unreadable case as in case 1.
5. **#435**: a Direct To and ACTIVATE in OBS mode leave the course of a readable, undriven indicator the indicator's.

## Non-goals

- The DTK flash on NAV 3 and Super NAV 5, the read-only OBS field, the `d› CRS` text for the unreadable and driven
  cases, and the self-test gate (#330): unchanged.
- The alert's timing and end (#372, #406): unchanged; the message and the indicators follow it.
- The 89's `GPS Course is` message and the AVsoftech trainer's narrower window: not emulated.
- No H event or panel.xml key is added or changes meaning; the WPT light LVar is the open question above.

## Left to the builder

- How the message learns that a DTK change was a leg change and whether it started a turn (for example a marker set
  by `NavCalculator` or `ActiveWaypoint` at the start of the turn or the sequencing, read by the message in the same
  tick; `NavCalculator` already runs before `MessageHandler`). The DTK switches on the tick after the turn is pushed,
  because `NavCalculator` computes the DTK before it starts the turn, so the message must take the new DTK, not the old
  one.
- How the alert's two phases reach the displays and the light (a second flag next to `waypointAlert`, or a phase
  value).
- One small time-based helper for "held for more than 12 s", shared by both message classes. `MessageHandler.tick`
  evaluates `isConditionValid` twice per tick while a message is listed, so no state may depend on the number of calls.
  Removing a read message and bringing it back unread needs the message to reset its own `seen` once it is posted
  again.
- Whether the two `ObsTarget` 0 cases stay in one class or split by the current tick's case.
- How the `d› CRS` number for #435 is computed without setting the course (for example a pure conversion on
  `ModeController` with the OBS variation of the new active waypoint).
- Test stages: unit for the message conditions (`test/unit/data/PersistentMessages.test.ts`), render for #435
  (`test/render/pages/left/DirectToObs.test.ts`) and the alert's display, and a flight test that flies a turn for #437
  and the unreadable case, so the alert's real phases are used. The #177 and #434 tests that hold the forced window and
  the immediate post change; the #330 tests stay; the case-1 rule without a turn gets characterization tests.

## Commits

One per issue, each with its tests and comments citing the pages above, in this order: `fixes #437`, `fixes #401`,
`fixes #434`, `fixes #436`, `fixes #435`. #436 builds on #437's turn phase. The trainer record of 2026-10-26 is
already committed (`references #434`). If the LVar changes, the wiki page External Annunciators needs the same change.
