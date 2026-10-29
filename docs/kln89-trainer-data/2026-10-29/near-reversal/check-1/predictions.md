# Predictions written before each pass (2026-10-29 evening, #443 near-reversal turns)

Trainer state checked after its fresh start (I launched Kln89.exe in the running VM and maximized it): FPL 0 = 8Z 8Y
8X 8V 8U 8T 8S 8R row by row; user waypoints on their USR pages: 8Z N43 30.00 W089 30.00, 8Y N43 44.00 W089 30.00,
8X N44 00.00 W089 17.00, 8V N44 15.00 W089 30.00, 8U N44 26.00 W089 03.00, 8T N44 40.00 W089 37.00, 8S N44 40.00
W088 44.00, 8R N44 44.00 W089 20.00 (8Q N44 32.00 W086 07.10, not used).

Method: as I3' ([../../inside/](../../inside/report.md)): a single SET 1 jump with a leg change lands on the inbound leg just before the
inside bisector line (computed with great circles, `scripts/bis.py`: equal cross track to the inbound and outbound
lines), heading 60 deg off the course toward the inside, so the inside cross track grows (about 0.03 NM/s) and the
aircraft crosses the line in flight a few seconds after the landing. 119 kt, SET 4 on. Read: (i) the waypoint is
sequenced at the crossing with no turn (next DTK, FROM = the waypoint); (ii) not sequenced; the turn comes at the
lead (L = 1.98 NM, the 60-s cap, for all near-reversals here).

## P4: control, 150 deg at 8T (written before the pass)
8U -> 8T -> 8S (+149.5, right; inside = right). Land 6 NM before 8T with 0.2 right, HDG 004 (60 deg right). The
bisector line is about 1.5 NM right at 6 NM, so a 0.2 offset growing for 10-15 s does not reach it.
- Expected: no sequencing at the landing or after; lead plan (0.2 < 2.74); the normal lead turn at al 1.98 with the
  alert about 20 s before; sequencing at the bisector of the turn (bearing about 289).

## P2: 171 deg at 8S (written before the pass)
8T -> 8S -> 8R (-170.6, left; inside = left). Bisector about 0.46 NM left at 6 NM before 8S. Land 6 NM before 8S
with 0.386 left (to the inbound line 0.386, to the outbound 0.535, gap 0.15), HDG 034 (60 deg left of the DTK
about 094). Crossing expected 3-5 s after the landing.
- (i) 8S sequenced at the crossing, no turn: 8S -> 8R active, DTK about 280, about 6 NM before 8S.
- (ii) 8S stays active; the take-home converges; the lead turn at al 1.98 (alert about 20 s before), as the
  2026-10-20 171-deg passes.

## P3: 180 deg at 8T (written before the pass)
FPL 0 edited to 8Z 8Y 8X 8V 8U 8T 8U 8S 8R (8U inserted after 8T): 8U -> 8T -> 8U is an exact reversal, inbound
and outbound on the same line. (a) on course; (b) with a small offset (0.2 right) and HDG 004.
- (i)-like: the outbound segment is as close as the inbound one from the start, so 8T sequenced at the landing or at
  the first calculation, no turn.
- (ii): the turn at the lead (al 1.98), or whatever the unit does at a reversal.

## P1: 176 deg at 8U (written before the pass)
FPL 0 edited to 8Z 8Y 8X 8U 8Y 8T 8S 8R (8V deleted, 8Y inserted after 8U): 8X -> 8U -> 8Y (-176.1, left; inside =
left). Bisector about 0.20 NM left at 6 NM before 8U. Land 6 NM before 8U with 0.137 left (gap 0.12), HDG = DTK
minus 60 (the trainer DTK read on NAV 1 first).
- (i) 8U sequenced at the crossing, no turn; (ii) the lead turn at al 1.98.

## P4 read (written after the pass)
Landing 6.0 NM before 8T with Fly L 0.38 (0.31 right by the reconstruction), lead plan. The take-home intercepted;
XTK peaked about 0.7 and was 0.13 at L. No sequencing before the turn. Alert 22.5 s before the switch at al 2.00 = L,
sequencing at bearing 290, alert end 1.92 past: the normal lead turn, as expected (the 150-deg bisector line, 1.5 NM
right at 6 NM, was never approached).

## P2: start as planned, same-leg jump (the aircraft was on 8T-8S after P4; a SET 1 jump re-initializes anyway)

## P2 read (written after the pass)
Landing 6.0 NM before 8S (SET 1 frames 18:36:14.9-17.2 showed 8S active, 6.0 NM), 0.39 NM left (inside), HDG 034.
First NAV 1 frame 18:36:19.4, about 5 s after the landing: 8S -> 8R active (20.0 NM to 8R), DTK 284, Fly R 0.51
falling to 0.20 within 7 s, no alert, no turn. **Outcome (i): 8S was sequenced about 6 NM before the waypoint, at
the inside bisector crossing, with no turn**, as at 150 deg. The crossing itself fell between two NAV 1 frames (the
screen was on SET 1 / FPL until 18:36:19), but 8S was active at the landing and the switch came within the 3-5 s the
geometry predicts.

## P3a read (written after the pass): 180 deg on course
FPL 0 8Z 8Y 8X 8V 8U 8T 8U 8S 8R. Landing on course 6.0 NM before 8T (8U -> 8T active, XTK 0.00). No sequencing
early and **no turn at the lead**: DTK 304 stayed until the distance read 0.0; the alert flashed from about 1.2 NM
(18:44:12, about 38 s before the waypoint) until 8T was sequenced at the waypoint itself (18:44:50.8, d 0.0, bearing
293 on the last frame), then DTK 124, line 2 0.00, the arrow steady from about 1 s later. The take-home then flew a
left teardrop (TK 303 -> 248 -> 185 -> 134 -> 105), XTK up to 0.96 left, back onto 124. So at exactly 180 deg the
unit behaves like a fly-over: no turn anticipation, sequencing at the waypoint. Neither (i) nor (ii).

## P3b: 180 deg with a small offset (written before the pass)
Position on the 8V-8U leg first, then land 6 NM before 8T with 0.2 right, HDG 004 (I3' trick). Both lines coincide,
so the inside cross track and the outbound one are equal throughout.
- If the bisector rule is "the next segment at least as close": sequenced at the landing or the first calculation
  (but P3a on course, with both distances 0, was not).
- Otherwise as P3a: fly-over at the waypoint, no early sequencing.

## P3b read (written after the pass)
Landing 6.0 NM before 8T with Fly L 0.38 (right of the leg), HDG 004; 8U -> 8T stayed active; the take-home converged
(0.33 at 3.4 NM, 0.03 at 0.3 NM). No early sequencing, no turn at the lead; alert from about 2 NM (18:53:58); 8T
sequenced at the waypoint (d 0.0, 18:55:07.7), then DTK 124 and a teardrop. Same fly-over as P3a.

## P1 read (written after the pass): 176 deg at 8U
FPL 0 8Z 8Y 8X 8U 8Y 8T 8U 8S 8R (8V deleted, 8Y inserted after 8U). Trainer DTKs 026 in, 210 out. Landing 6.0 NM
before 8U with Fly R 0.33 (left = inside), HDG 325; the inside cross track grew to 0.72 (the bisector line is about
0.20-0.25 NM left there) and stayed above 0.4 until about 3.7 NM, then converged (0.03 at 0.2 NM). **No sequencing
at the bisector crossing, and no turn at the lead**: DTK 026 until the waypoint, alert from 1.2 NM (19:02:42, about
36 s before), 8U sequenced at the waypoint (19:03:21), then DTK 210 and a left teardrop. Same fly-over as at 180 deg.
Neither (i) nor (ii).

## FPL 0 restored after P1 (8Z 8Y 8X 8V 8U 8T 8S 8R, checked), then temporary user waypoint 8N created
8N at N44 40.01 W088 47.51 (2.5 NM before 8S on the 8T-8S line), inserted before 8S: FPL 0 8Z 8Y 8X 8V 8U 8T 8N 8S
8R. Turn at 8S: 8N -> 8S -> 8R, -171.2 (left), inbound leg 2.5 NM, so the lead is capped at half the leg (1.25).

## P5a: short leg, on course (written before the pass)
Land on course 6 NM before 8S (3.5 before 8N, on 8T-8N), HDG 094; 8N sequenced straight (0-deg turn), then 2.5 NM to
8S. The 2026-10-20 note: the 171-deg turn after a 2-3 NM leg is flown.
- (ii) the turn at the lead (al about 1.25, alert before); not sequenced early (on course there is no inside offset).
- If the unit treats it like 176/180 here: a fly-over at 8S.

## P5a read (written after the pass)
Landing on course 3.5 NM before 8N (6 before 8S). 8N sequenced at 8N (on course). On the 2.5-NM leg: alert from about
1.9 NM, DTK switch to 284 at about 1.2-1.3 NM before 8S (= the lead capped at half the leg, 1.25), the take-home
turned left (TK 092 -> 061 -> 035 -> 349 -> 308 -> 284), 8S sequenced about 6 s after the switch, XTK to 8S-8R
peaking at 0.78 (overshoot), alert on into the run-out. Outcome (ii): the 171-deg turn after a 2.5-NM leg is flown
at the (capped) lead, as the 2026-10-20 note says.

## P5b: short leg with the inside offset (written before the pass)
Land 2.0 NM before 8S on the 8N-8S leg (0.5 past 8N) with 0.115 left (to the inbound line 0.115, outbound 0.194, gap
0.08; the bisector about 0.15 left), HDG 034. Crossing about 1-3 s after the landing. Lead 1.25, so the landing is
0.75 before the turn point.
- (i) 8S sequenced at the crossing with no turn (as P2 at 171 deg with a long leg).
- (ii) not sequenced; the turn at the lead (al 1.25).

## P5b read (written after the pass)
The first try was ignored (SET 1 jump of about 8 NM from the 8S-8R leg; only the heading 034 applied); repositioned
on 8V-8U and jumped again (recording `p5b.csv`). Landing 2.0 NM before 8S with 8N -> 8S active (SET 1 status 8S
2.0 NM, 19:25:11.1-12.9), 0.115 left, HDG 034. At 19:25:13.1 (about 2 s after the landing) 8S -> 8R active (24.0
NM), DTK 284, line 2 0.08 to the 8S-8R line falling through 0, no alert, no turn. **Outcome (i)**: on the inside,
the 171-deg waypoint after a 2.5-NM leg is sequenced at the bisector crossing, 0.75 NM before the capped turn point,
as after a long leg (P2).
