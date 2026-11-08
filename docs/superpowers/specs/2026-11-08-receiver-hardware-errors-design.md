# Failures: the receiver hardware error codes and the new receiver failures (#471)

Part of #366. The specification is issue #471; this design says how it is built and settles what the issue left open.
It builds on the failure framework (#458), the GPS receiver failures (#460) and the battery (#461); read
[docs/failures.md](../../failures.md) first. Page numbers without a prefix are the KLN 90B Pilot's Guide, "IM" the
Installation Manual, "CMM" the Component Maintenance Manual.

## Intent

The installation manual's table of receiver error codes (IM C-3 to C-5) gives every fault behind
`RCVR HARDWARE ERROR:____` (B-3) its own code, and several faults show together as one code that is the OR of their
bits. The unit today shows two separate messages for two of those codes (0010 of the antenna, 0008 of the battery's
wipe). This change brings the existing receiver failures in line with that table and adds the receiver faults the
table names, so that a pilot meets the real unit's message, with the real unit's code, and the effect each fault has.

## Goals

- One persistent message `RCVR HARDWARE ERROR:` / `xxxx` whose code is the OR of the receiver error bits active now,
  as four hex digits (IM C-3).
- `gpsAntenna` is drawn open (0010) or short (0110) when it starts.
- New failures: `rcvrMemory` (0008), `rcvrHardware` (0002, 0004, 0080, 2000 or 8000), `rcvrInit` (0400), `rcvrEeprom`
  (0800), `antennaGain` (no code), with the effects of the issue.
- `rcvrMemory`, `rcvrInit` and `rcvrEeprom` can be transient: they act at one power-on and then are unfailed.
- `TEST FAIL` on the Self Test page for every code, as the issue's detection table gives it, the battery's 0008
  included.
- `docs/failures.md` corrected and extended.

## Non-goals

- Not simulated (issue #471): code 1000 (the receiver's test mode only), the cartridge designators IC03xx/04xx, the
  STA 1 states FAILC and FAILM, the 0008 after a software upgrade.
- No change to `gpsReceiver` (`NO RCVR DATA`, B-3): it is not a receiver test code and keeps its own message.
- No change to the battery's wipe of the user memory; only its 0008 joins the combined code and gains `TEST FAIL`.
- No change to the unit's EEPROM failure (`eeprom`, `EEPROM FAILURE: IC1045`): 0800 is the receiver module's own EEPROM,
  a different part (see the issue and "docs/failures.md" below).

## Anti-goals

- **A failure that changes how the unit behaves while failures are off.** With MTBF off and nothing failed, every
  existing test stays green and every output is as today. The only changes to existing failure cases are those the
  issue asks for: 0010 and 0008 merge into one message, `gpsAntenna` may show 0110, and the battery's power-on with a
  wipe shows `TEST FAIL`.
- **A new fault hidden inside a message already read.** A code that gains a bit is a new message to the pilot (see the
  message below).
- **A receiver fault that is only a message.** Every code has the effect the issue gives it, so that the pilot sees why
  the message matters.

## Constraints

- **Persisted keys are public contract** (CLAUDE.md): the new failure keys are new settings with the default "working";
  no existing key changes meaning. The keys and FLR names below are the issue's proposals, kept as they are
  (2026-11-08); they are fixed by the first commit.
- **The tick budget** (CLAUDE.md): `receiverFailed` is asked in every calculation tick and the message condition at
  1 Hz, so neither may parse the stored failure values. The drawn values are cached and read at a failure change and at
  a power-on only.
- **The order at a power-on.** `GPS` subscribes to `powerEvent` first (docs/failures.md, Battery), and the battery's
  `userMemoryLost` runs before every `powerEvent` handler. Whatever the receiver decides at a power-on has to be
  decided before `GPS.powerChanged` starts the search.
- `target: es2017`. Take-home mode has no receiver failures (#460), and so no receiver error word.

## Approaches

1. **Catalog-driven.** Each receiver failure gets a `receiverCode` in `FailureCatalog.ts`, and `FailureDetector`
   decides whether each is detected and acts, as today. `readAtPowerOn` would have to depend on the drawn code
   (`rcvrHardware` is a power-on failure for 0002/0004/0080 and a live one for 2000/8000), and `actsOnUnit` runs on
   every 16 Hz D-bar write, so it would have to parse or cache the stored values there. The battery's 0008 is no
   catalog entry and needs a side path into the message and `TEST FAIL`.
2. **A receiver error word (chosen by the maintainer, 2026-11-08).** One object holds the 16-bit error word the real
   receiver module reports to the host (IM A-7 carries it as its own field). The power-on bits are latched once at the
   power-on; the live bits follow the failures in operation; 0008 clears at the first satellite tracked. The message,
   `TEST FAIL` and every effect read that word, so the code and the effects cannot drift apart, the battery and
   `rcvrMemory` share their 0008, and `rcvrHardware`'s mix of power-on and live codes needs no special case. The cost
   is a second detection path beside `FailureDetector`, whose rules for the unit's own failures are simple to repeat.
3. Rejected early: two messages as today plus new ones per failure. The issue's combined code rules it out.

## The receiver error word

A new class, suggested `ReceiverErrors` in `kln90b/failures/ReceiverErrors.ts`, owned by `GpsFailures`. It is the
receiver module's own state for the power-on, so it lives with the receiver, as the receiver's other per-power-on state
does (`GPS.memoryLostThisPowerOn`, the faulty satellite's count in `GpsFailures`). `VolatileMemory.receiverMemoryLost`
of #461 moves into it, since its 0008 is now one bit of this word. It cannot live in `VolatileMemory`: `GPS` subscribes
to `powerEvent` before `VolatileMemory` is built, so `VolatileMemory.reset` runs after `GPS.powerChanged`, too late for
the latch, which has to decide before the search starts.

- **Power-on bits**, latched once per power-on and kept until the next one, whatever the failures do meanwhile:
  - 0008: the battery wiped the user memory at this power-on (`evt.memoryLost`), or `rcvrMemory` acts at it. Unlike
    the other power-on bits, 0008 clears in the first calculation tick in which `GPS.tracksSatellite` is true (#461,
    unchanged rule), also one before the main page.
  - 0002, 0004, 0080: `rcvrHardware` with that drawn code is active at the power-on.
  - 0400: `rcvrInit` is active at the power-on.
  - 0800: `rcvrEeprom` is active at the power-on.
- **Live bits**, read from the failures as they are now:
  - 0010: `gpsAntenna` open; 0110: `gpsAntenna` short.
  - 2000, 8000: `rcvrHardware` with that drawn code.
- `code` = power-on bits (with 0008 as it stands now) OR live bits.
- `testFailCode` = the power-on bits **as latched** (0008 not cleared) OR the live bits. The Self Test page reads it,
  so a hot start that tracks a satellite during the self-test still shows the `TEST FAIL` of its wipe.
- `receiverDead`: the word has any of 0002, 0004, 0080, 0010, 0100, 2000, 8000. `GpsFailures.receiverFailed` becomes
  `receiverDead || gpsReceiver effective` (take-home: false, as today). Everything that follows `receiverFailed` today
  follows it unchanged: the inhibits of `GpsSearch`, `FAILR` on STA 1, the #453 messages held back, the spoofer's fake
  satellites kept out.
- `hostBlocked` (0400 latched) and `acquisitionFactor` (1, or the factor drawn at a power-on with 0800 latched).

**The latch** runs at the start of `GPS.powerChanged` for a power-on, before the search starts, so that its order
against the search holds by construction. The battery's wipe has already run then (`userMemoryLost` comes first) and
is known from `evt.memoryLost`. The latch reads each failure's cached values, draws what is missing, applies the
transient rule (below), and draws the 0800 factor. The hot-swap resume and the battery's ride-through publish no power
event, so they latch nothing and keep the word, as they keep the EEPROM's read. An engine-running start latches at its
power event as any power-on.

## The message

`ReceiverHardwareMessage` replaces `ReceiverMemoryLostMessage` and the `gpsAntenna` entry of the catalog-built
`FailureMessage`s (`gpsAntenna` gets `message: null`, `detection: null` and `testFail: false` in the catalog, so that
`FailureDetector` neither posts nor fails it twice).

- Lines: `RCVR HARDWARE ERROR:` and the code as four uppercase hex digits (`0018`, `0110`, `2010`).
- Condition: `code !== 0` and the first navigation page of this power-on has shown
  (`memory.failureDetection.mainPageShown`), the rule for the unit's own failures. A live bit is then seen by the
  message's next 1 Hz check, which is "detected in the next calculation tick".
- **Re-alert (the maintainer, 2026-11-08):** when the code gains a bit it did not have at the last check, the message
  becomes unread (`seen = false`) and the MSG prompt flashes. A bit that ends only changes the text; the message keeps
  its read state. The message goes when no bit is left.
- Across a power cycle it behaves as every other hardware message does today: its condition is false until the first
  navigation page, so `MessageHandler.tick` resets `seen`, and the message comes back unread. The code remembered for
  the re-alert starts at 0 at a power-on.
- **While `gpsReceiver` is effective** (`NO RCVR DATA`) the receiver does not talk to the host, so the host cannot read
  the word: the message is not posted and `testFailCode` counts no receiver bit (`gpsReceiver` fails the self-test on
  its own). The receiver still runs its own tests: the latch happens as always, and after the repair the word shows
  with its next check (a new bit then re-alerts). Builder's call.
- `TEST FAIL`: `SelfTestLeftPage` adds `|| receiverErrors.testFailCode !== 0` to its condition, read once when the page
  is built, as today.

## The failures

| Key | FLR name | Code | Random | Drawn values (saved with the failure) |
|---|---|---|---|---|
| `gpsAntenna` | `GPS ANTENNA` | 0010 open, 0110 short | yes | `short`: 0 or 1, 50 % (guess) |
| `rcvrMemory` | `RCVR MEMORY` | 0008 | yes | `transient`: 0 or 1, 50 % |
| `rcvrHardware` | `RCVR HW` | 0002, 0004, 0080, 2000 or 8000 | yes | `code`: one of the five, equal chance |
| `rcvrInit` | `RCVR INIT` | 0400 | yes | `transient`: 0 or 1, 50 % |
| `rcvrEeprom` | `RCVR EEPROM` | 0800 | yes | `transient`: 0 or 1, 50 % |
| `antennaGain` | `ANT GAIN` | none | yes | `lossDb`: 6 to 15 (guess) |

All may fail always (`isEligible: () => true`). "Random: yes" for the four receiver failures the issue does not mark is
the builder's call: every other hardware failure is random. Values are drawn when the failure starts, from FLR 3 or the
MTBF trigger (`failureChanged` with `active`), and saved with `Failures.setValues`. A failure whose stored values are
missing or unusable (a profile from before this change with `gpsAntenna` active, a hand-edited profile) draws them at
its next read and saves them.

### `gpsAntenna`

The effect is unchanged (#460). Short gives 0110 instead of 0010; that the short of the antenna supply stops the
oscillator, so 0100 shows with 0010, is the issue's guess from IM C-4.

### `rcvrMemory`

At a power-on while it acts, the receiver module's battery-backed memory is cleared and 0008 is latched. **The unit's
own memory is kept**: no `userMemoryLost`, no `USER DATA LOST`, no reset of the user settings, waypoints, flight plans,
remarks, the unit's clock or its last position, and `VolatileMemory.reset` treats the power-on as it otherwise would
(a short interruption stays short).

**Where the data lives** (the maintainer's question, 2026-11-08). The manuals put the date, the time and the last
position in the host and the almanac and ephemeris in the receiver:

- The host has its own real-time clock: a CMOS clock chip among the main module's parts (CMM 10056, a 1000-series
  designator), and the clock's shop test sets the date and time on SET 2 and reads them back on the Self Test page
  (CMM 1026). The pages show the host's clock. The host's nonvolatile RAM is held by the lithium battery (CMM 22), and
  take-home mode shows the last known position from it (IM 2-4, 5-46), with no receiver at work.
- The host sends the receiver initialization data over the RS-232 link at the start: 0400 is the receiver getting none
  (IM C-4), and the host gives the receiver control information over that link (CMM 12).
- The receiver's INIT state (5-29) gathers the date, the time and the last position, then reads its own memory to
  predict the visible satellites; in `NAV D` it stores the ephemeris and almanac it collects in its memory (5-29).
- The receiver's battery-backed RAM is backed through the flex cable (IM C-3, 0008 cause 2), so the battery's failure
  (#461) loses both memories, while a bad flex cable or bad receiver RAM loses only the receiver's. 0008 after a
  software upgrade ends at the first satellites received, as the manual says for that cause (IM C-3, cause 1): what the receiver lost comes back from the
  sky, which fits the almanac and ephemeris.
- The receiver also has a 32 kHz crystal (IM C-4, 0400 cause 2), the usual time base of a clock kept while off, which
  fits the issue's reading that with 0400 the receiver starts from its own memory.

So `rcvrMemory` erases only what the receiver alone holds:

- The almanac and every ephemeris are erased (`eraseAlamanac`, `eraseCachedEphemeris`, `fakeReceiver.forgetEphemeris`,
  `ephemerisErasePending`), the receiver's half of `GPS.forgetMemory`. `forgetMemory` is split into that half and the
  unit's half (the 1988 clock, the 0/0 position, `noStoredPosition`), which only the battery's wipe runs.
- The clock and the position come back from the host at the same power-on, as they do at every power-on today
  (`powerChanged` sets the receiver's `internalTime` from the unit's clock, and the search starts from `coords`). The
  receiver then runs an almanac search (ORS 01 6-30) from a right date and position, and the first fix keeps the unit's
  era.
- With `rcvrInit` (0400) latched at the same power-on, that initialization does not arrive: the receiver has neither
  clock nor position (its `internalTime` from `WIPED_CLOCK_MS`, its last known position 0/0), while the unit's clock and
  position stay right. In this model the almanac search is blind either way, so the start is the same; the first fix
  still takes the unit's era.
- **FAST is blocked as for the battery's wipe, and FAST and REAL behave the same** (the maintainer, 2026-11-08): a
  receiver without an almanac has no memory to be hot from. FAST does nothing at that power-on, nor does a switch to
  FAST on SET 10 in it, so both run the almanac search. `memoryLostThisPowerOn` (or a sibling flag) covers both causes.
- With the battery's wipe at the same power-on, the whole memory is already gone; the receiver's half changes nothing
  more.

### `rcvrHardware`

Effect: as `gpsAntenna` (through `receiverDead`). 0002, 0004 and 0080 are power-on tests: a failure in operation acts
from the next power-on, and a repair in operation (FLR 2, `SERVICE?`) acts at the next power-on too, as the EEPROM's
read does (builder's call: the receiver found the fault at its power-on test and stays down until it runs that test
again). 2000 and 8000 are found in operation: they act at once and end at once with a repair.

### `rcvrInit`

While 0400 is latched, nothing from the host reaches the receiver for the whole power-on:

- The start mode follows the receiver's own memory, as now.
- **FAST sends nothing either** (the maintainer, 2026-11-08, replacing the issue's "the truth start still happens"):
  FAST is a convenience, but a pilot who turns failures on wants to see them. `initializeFromTruth` does not run at
  that power-on, and a switch from REAL to FAST on SET 10 (`GPS.startFast`) changes nothing, as the receiver cannot be
  reached from the unit. FAST and REAL behave the same.
- `GPS.reinitializeSearch` keeps saving the unit's clock (the host's own clock was set) but neither sets the receiver's
  clock (`gpsSatComputer.internalTime`) nor restarts the search. Its callers are the SET 1 position, the SET 2 date and
  time, the date and time on the Self Test page, and `SERVICE?` (`serviceClock`). SET 1 sets the unit's position
  (`gps.coords`) but not the receiver's (`syncLastKnownPosition` is skipped).
- The altitude input does not reach the receiver: the solution (`updateSolution`), the measurement and the range errors
  get no altitude, so no altitude aiding, no `NAV A` on STA 1, and no fix from three satellites (5-29). Everything else
  that reads the altitude (the ALT page, VNAV, `ALTITUDE FAIL`) is unchanged.
- The RAIM predictions of STA 5 and of the approach gate at the FAF and the MAP are made without the altitude input
  while 0400 is latched, as the receiver navigates without it (the maintainer, 2026-11-08).
- 0400 and its effect stay for the power-on, also after a repair.

### `rcvrEeprom`

While 0800 is latched, the receiver has lost its oscillator calibration and searches a wider frequency range: every
acquisition time `GpsSearch` sets for the start of the power-on (hot, warm, the blind sky search and the almanac
search, mean and range) is multiplied by the factor, drawn at the latch from 2 to 4 (guess). FAST's hot start is slower
by the same factor, as it runs the same search. The fake satellites of a spoofer take the same factor under the same
rule, as the same receiver searches them (`FakeReceiver.acquisitionTime`; the maintainer, 2026-11-08).

Builder's call: the factor ends with the first fix. A receiver with a fix has solved its clock drift, so a satellite
reacquired in flight (the idle timings `GpsSearch.end` sets) and the sky search that keeps the belief after a lost fix
(#465) use the normal timings. An engine-running start's forced acquisition is instant as always: it stands for a unit
that was on before the session.

0800 stays for the power-on, also after a repair.

### `antennaGain`

Every satellite's SNR (#467, `SatelliteSignals`) drops by `lossDb` while the failure is effective; the lock rule,
STA 1's SNRs, RAIM and the #453 messages follow from that. The simplest place is the dB that `GPS.currentNoiseRiseDb`
already subtracts from every SNR. No code, no message, no `TEST FAIL` of its own. Builder's call: the loss applies to
the spoofer's fake satellites too (they enter through the same antenna and front end); a transmitter's noise rise is
unchanged. A repair ends the loss at the next signal tick.

## The transient rule

`rcvrMemory`, `rcvrInit` and `rcvrEeprom`:

- Their effect shows only at a power-on, so a failure that starts while the unit runs acts from the next power-on,
  transient or not.
- **Transient:** the latch applies the effect and latches the bit, then repairs the failure (`Failures.repair`, which
  publishes `failureChanged`). The bit, its message and `TEST FAIL` stay for that power-on; the next power-on finds the
  failure repaired and the unit works fully.
- **Not transient:** the latch applies the effect at every power-on until the failure is repaired.
- A repair before the next power-on cancels the failure without any effect.
- Once unfailed, the MTBF trigger may pick the failure again (`randomCandidates` lists only inactive failures, as now).

## Detection and TEST FAIL

| Codes | Detected | `TEST FAIL` |
|---|---|---|
| 0002, 0004, 0008, 0080, 0400, 0800 | latched at a power-on; the message posts with the first navigation page | yes, on that power-on's Self Test page |
| 0010, 0100, 2000, 8000 | live; the message's next check, at a power-on not before the first navigation page | yes, while active |

## docs/failures.md

- The catalog table: the new rows, `gpsAntenna`'s code 0010 or 0110, the battery's message as one bit of the combined
  code.
- "Message lines": correct the claim that 0080, 0100, 0400 and 0800 are one fault class; say that the codes combine
  (IM C-3).
- The EEPROM section: why IC1045 (the unit's EEPROM, main module) and 0800 (the receiver module's EEPROM) are different
  parts (CMM 10, 22-23; IM A-7, C-6).
- A section for each new failure, the receiver error word, the transient rule, and the battery's 0008 now in the word
  with `TEST FAIL`.
- The status paragraph names #471 and this design.
- The wiki's failure page needs the same change; the maintainer updates the wiki, so the closing note of the work gives
  the text.

## Testing

Each behavior at the cheapest stage that can observe it (`test/README.md`):

- Unit: the word from latched and live bits (OR, four hex digits, 0008 clearing, `testFailCode` keeping it); the
  draws and their persistence round trip; values missing or unusable; the transient rule (applied, repaired, bit kept
  for the power-on; not transient applied again; repaired before the power-on: nothing); the acquisition factor in
  `GpsSearch` (start modes scaled, idle and the belief-keeping sky search not); `receiverFailed` for each dead bit.
- Render: the message text and the re-alert (a new bit unread, an ended bit keeps read); `TEST FAIL` on the Self Test
  page for a power-on code, a live code and the battery's wipe; FLR 2/3 list the new failures.
- Flight (a booted unit): **0018 from the antenna and the battery's wipe** at one power-on; a dead antenna tracks
  nothing, so 0018 stays; after the antenna's repair the code is 0008 (no re-alert), and it goes with the first
  satellite tracked;
  `rcvrMemory` wipes the receiver and keeps the user data; `rcvrHardware` 0002 in operation acts from the next power-on
  and 2000 at once; `rcvrInit` blocks SET 1/SET 2 reinitialization and altitude aiding (no `NAV A`); `rcvrEeprom`
  slows the first fix; `antennaGain` lowers the SNRs on STA 1 by the loss; MTBF off and nothing failed: the existing
  suite unchanged.

## Left to the builder

- The class and file names, and how the word reaches `SelfTestLeftPage` and the message (through `gps.failures`, as
  `receiverFailed` does today, is the obvious route).
- The exact wiring of the altitude block (one wrapped altitude source inside `GPS` is the suggestion).
- The test split across stages, within the list above.

## References

IM C-3 to C-7, A-7; CMM 10, 22-23, 1018; Pilot's Guide B-2, B-3, 5-29; KLN 900 Pilot's Guide B-6.
