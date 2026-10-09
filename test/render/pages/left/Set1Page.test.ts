import {describe, expect, it} from 'vitest';
import {bootUnit, HeadlessUnit, moveAircraft, settle} from '../../../harness/boot';
import {Screen} from '../../../harness/render/screen';
import {airport} from '../../../harness/navdata/builders';
import {OneTimeMessage} from '../../../../kln90b/data/MessageHandler';

/** An airport 0.4° south and 0.25° west of the aircraft, far enough that the two positions read differently */
const kaaa = () => airport('KAAA', 47.1, 11.0);
// Two-digit longitudes everywhere: a degree below 10 shows with a zero (#230), which no row here may hold
const POSITION = {lat: 47.5, lon: 11.25};

async function onSet1(): Promise<HeadlessUnit> {
    const unit = await bootUnit({facilities: [kaaa()], position: POSITION});
    await settle(unit);
    await unit.panel.selectPage('L', 'SET 1');
    return unit;
}

describe('SET 1 page (characterization)', () => {
    // Row 4 (ground speed and track) is left out: its ground speed format is the #245 pin below. The CONFIRM? row
    // shows with the cursor off, which is the code's choice (a comment in Set1Page.tsx cites a video of a real unit)
    it('shows the present position with the cursor off', async () => {
        const unit = await onSet1();

        expect(unit.errors).toEqual([]);
        const rows = Screen.read().rows('L');
        expect(rows.filter((_, i) => i !== 4)).toMatchInlineSnapshot(`
          [
            "INIT POSN  ",
            "WPT:       ",
            "N 47°30.00'",
            "E 11°15.00'",
            "CONFIRM?   ",
          ]
        `);
        expect(Screen.read().maskRows('L')).toMatchInlineSnapshot(`
          [
            "...........",
            "...........",
            "...........",
            "...........",
            "...........",
            "...........",
          ]
        `);
    });
});

describe('SET 1 initialization (3-18)', () => {
    // 3-18, figure 3-58: the left cursor comes on over the WPT field
    it('turns the cursor on over the WPT field (3-18)', async () => {
        const unit = await onSet1();
        await unit.panel.cursor('L');

        expect(unit.panel.focused('L')).toEqual({row: 1, col: 5, text: '     '});
    });

    // 3-18, figures 3-59 and 3-60: the first ENT shows the waypoint page on the right and leaves the position alone; the
    // second ENT confirms the waypoint, and the position rows take its latitude and longitude. KAAA is at 47.1 N 11.0 E,
    // which is N 47°06.00' and E 11°00.00' (0.1° is 6.00'). The sibling of the #248 pin below.
    it('takes the position of a confirmed waypoint (3-18)', async () => {
        const unit = await onSet1();
        await unit.panel.cursor('L');
        await unit.panel.enterIdent('L', 'KAAA');

        await unit.panel.ent();
        expect(Screen.read().status().right).toBe('APT 1');
        expect(Screen.read().rows('L').slice(1, 4)).toEqual(['WPT: KAAA  ', "N 47°30.00'", "E 11°15.00'"]);

        await unit.panel.ent();
        expect(unit.errors).toEqual([]);
        expect(Screen.read().rows('L').slice(1, 4)).toEqual(['WPT: KAAA  ', "N 47°06.00'", "E 11°00.00'"]);
    });

    // 3-18 step 8 and the KLN 89 trainer (2026-10-07): once the waypoint is confirmed the cursor goes straight to
    // CONFIRM?, over the latitude and the longitude. Set1Page.setWpt leaves it on the latitude.
    it.fails('moves the cursor to CONFIRM? once the waypoint is confirmed (3-18, checked in the KLN 89 trainer, 2026-10-07, #248)', async () => {
        const unit = await onSet1();
        await unit.panel.cursor('L');
        await unit.panel.enterIdent('L', 'KAAA');
        await unit.panel.ent();
        await unit.panel.ent();

        expect(unit.errors).toEqual([]);
        expect(unit.panel.focused('L').text.trim()).toBe('CONFIRM?');
    });
});

describe('SET 1 editors (characterization)', () => {
    // The editor starts at N with blank digits; the blank digits take 0 at ENT, so N, 4, 6 and the first minute digit 0
    // give N 46°00.00'. The row is what the code shows, with the zero fill.
    it('takes a latitude entered with the knobs', async () => {
        const unit = await onSet1();
        await unit.panel.cursor('L');
        await unit.panel.outer('L', 1); // the latitude
        await enterLatitude46N(unit);

        expect(unit.errors).toEqual([]);
        expect(Screen.read().rows('L')[2]).toBe("N 46°00.00'");
    });

    // The same for the longitude: E, the blank hundreds digit skipped, then 1 and 2 for the degrees
    it('takes a longitude entered with the knobs', async () => {
        const unit = await onSet1();
        await unit.panel.cursor('L');
        await enterLongitude12E(unit);

        expect(unit.errors).toEqual([]);
        expect(Screen.read().rows('L')[3]).toBe("E 12°00.00'");
    });

    // The track field shows the magnetic track. The world's variation is 10 E (east positive, as in KLNMagvar.test.ts),
    // so a true track of 090 is a magnetic track of 080, flown at 120 kt.
    it('shows the track of a moving aircraft as a magnetic track', async () => {
        const unit = await bootUnit({position: POSITION, magvar: 10});
        await settle(unit);
        await moveAircraft(unit, POSITION, {groundspeedKt: 120, trackTrue: 90});
        await unit.panel.selectPage('L', 'SET 1');

        expect(Screen.read().rows('L')[4]).toBe('120 KT 080°');
    });

    // A track entered with the knobs and confirmed is the track of the next SET 1 page. The world has no magnetic
    // variation and the aircraft is parked, so nothing else changes the track.
    it('keeps a track entered with the knobs after CONFIRM?', async () => {
        const unit = await onSet1();
        await unit.panel.cursor('L');
        await unit.panel.outer('L', 4); // the track
        await unit.panel.inner('L', 3); // the first click enters a 0, so this is a 2
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 8); // a 7
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 1); // a 0
        await unit.panel.ent();
        await unit.panel.cursorTo('L', 'CONFIRM?');
        await unit.panel.ent();
        expect(Screen.read().status().left).toBe('SET 1');

        await unit.panel.selectPage('L', 'SET 2');
        await unit.panel.selectPage('L', 'SET 1');

        expect(unit.errors).toEqual([]);
        expect(Screen.read().rows('L')[4].slice(7)).toBe('270°');
    });
});

/** With the cursor on the WPT field: E 12°00.00' on the longitude with the knobs, then ENT */
async function enterLongitude12E(unit: HeadlessUnit): Promise<void> {
    await unit.panel.outer('L', 2); // the longitude
    await unit.panel.inner('L', 1); // enters the editor: E, the other digits blank
    await unit.panel.outer('L', 2); // past the hundreds digit, which stays blank
    await unit.panel.inner('L', 2); // the first click enters a 0, so this is a 1
    await unit.panel.outer('L', 1);
    await unit.panel.inner('L', 3); // a 2
    await unit.panel.ent();
}

/** With the cursor on the latitude field: N 46°00.00' with the knobs, then ENT */
async function enterLatitude46N(unit: HeadlessUnit): Promise<void> {
    await unit.panel.inner('L', 1); // enters the editor: N, the other digits blank
    await unit.panel.outer('L', 1);
    await unit.panel.inner('L', 5); // the first click enters a 0, so this is a 4
    await unit.panel.outer('L', 1);
    await unit.panel.inner('L', 7); // a 6
    await unit.panel.outer('L', 1);
    await unit.panel.inner('L', 1); // a 0
    await unit.panel.ent();
}

// The harness cannot measure what the real unit uses the confirmed position for, the satellite search: a cold GPS
// acquires in about 62 s whatever the position (testing.md section 4). What it can see is the position the first fix
// is compared with, which posts POSITION DIFFERS FROM LAST POSITION BY >2NM when they are more than 2 NM apart.
describe('SET 1 CONFIRM? before the first fix (characterization)', () => {
    const MESSAGE = 'POSITION DIFFERS FROM LAST POSITION BY >2NM';
    const messages = (unit: HeadlessUnit) => unit.props.messageHandler.getMessages().map(m => m.message.join(' '));

    /** A cold unit whose stored last position is the aircraft's, so that the boot itself posts no position message */
    async function coldOnSet1(): Promise<HeadlessUnit> {
        const unit = await bootUnit({
            facilities: [kaaa(), airport('KAAB', POSITION.lat, POSITION.lon)], position: POSITION, coldGps: true,
            storage: {fastGpsAcquisition: false, lastLatitude: POSITION.lat, lastLongitude: POSITION.lon},
        });
        expect(unit.props.sensors.in.gps.isValid()).toBe(false);
        await unit.panel.selectPage('L', 'SET 1');
        return unit;
    }

    // The sibling of the next test: without SET 1 the first fix posts no position message
    it('posts no position message at the first fix without an initialization', async () => {
        const unit = await coldOnSet1();
        await settle(unit);

        expect(unit.errors).toEqual([]);
        expect(messages(unit)).not.toContain(MESSAGE);
        // The list is the live one: a message posted now shows in it
        unit.props.messageHandler.addMessage(new OneTimeMessage(['LIVE LIST']));
        expect(messages(unit)).toContain('LIVE LIST');
    });

    // N 46°00.00' is 90 NM south of the aircraft
    it('turns the cursor off, and the first fix compares with the confirmed position', async () => {
        const unit = await coldOnSet1();
        await unit.panel.cursor('L');
        await unit.panel.outer('L', 1);
        await enterLatitude46N(unit);
        await unit.panel.cursorTo('L', 'CONFIRM?');
        await unit.panel.ent();
        expect(Screen.read().status().left).toBe('SET 1');

        await settle(unit);

        expect(unit.errors).toEqual([]);
        expect(messages(unit)).toContain(MESSAGE);
    });

    // KAAB lies at the aircraft's own position, so a confirmed KAAB leaves the first fix in agreement with it. A latitude
    // or a longitude that the page stored wrongly would post the message.
    it('takes the latitude and the longitude of a confirmed waypoint for the first fix', async () => {
        const unit = await coldOnSet1();
        await unit.panel.cursor('L');
        await unit.panel.enterIdent('L', 'KAAB');
        await unit.panel.ent();
        await unit.panel.ent();
        await unit.panel.cursorTo('L', 'CONFIRM?');
        await unit.panel.ent();
        expect(Screen.read().status().left).toBe('SET 1');

        await settle(unit);

        expect(unit.errors).toEqual([]);
        expect(unit.props.sensors.in.gps.isValid()).toBe(true); // The first fix happened
        expect(messages(unit)).not.toContain(MESSAGE);
    });

    // E 12°00.00' on the same latitude is 0.75° of longitude, about 30 NM, east of the aircraft
    it('turns the cursor off, and the first fix compares with a confirmed longitude entered with the knobs', async () => {
        const unit = await coldOnSet1();
        await unit.panel.cursor('L');
        await enterLongitude12E(unit);
        await unit.panel.cursorTo('L', 'CONFIRM?');
        await unit.panel.ent();
        expect(Screen.read().status().left).toBe('SET 1');

        await settle(unit);

        expect(unit.errors).toEqual([]);
        expect(unit.props.sensors.in.gps.isValid()).toBe(true);
        expect(messages(unit)).toContain(MESSAGE);
    });
});

describe('SET 1 bugs', () => {
    // 3-18, figures 3-57 to 3-60: the ground speed of a parked aircraft reads 0 KT, one digit. The page shows 00, because
    // the tens digit of SpeedEditor is a plain digit (SpeedEditor.tsx). The aircraft is parked and the world has no
    // magnetic variation, so the track is 000. The sibling is the characterization of the page above, which holds every
    // other row of the page.
    it.fails('shows the ground speed of a parked aircraft as 0 KT (3-18, #245)', async () => {
        await onSet1();

        expect(Screen.read().rows('L')[4]).toBe('  0 KT 000°');
    });

    /** KAAA confirmed, the cursor off and on again, and then on the WPT field, which shows KAAA */
    async function onConfirmedWptField(): Promise<HeadlessUnit> {
        const unit = await onSet1();
        await unit.panel.cursor('L');
        await unit.panel.enterIdent('L', 'KAAA');
        await unit.panel.ent();
        await unit.panel.ent();
        await unit.panel.cursor('L'); // off
        await unit.panel.cursor('L'); // on again, at the field the cursor was left on
        await unit.panel.cursorTo('L', 'KAAA');
        return unit;
    }

    // 3-18: the cursor comes back over the WPT field, which still shows the confirmed waypoint. The sibling of the CLR
    // pin below.
    it('puts the cursor back on the confirmed WPT field (3-18)', async () => {
        const unit = await onConfirmedWptField();

        expect(unit.errors).toEqual([]);
        expect(unit.panel.focused('L')).toEqual({row: 1, col: 5, text: 'KAAA '});
    });

    // Checked in the KLN 89 trainer (2026-10-07): CLR then ENT on the WPT field changes nothing, the old ident stays and
    // no error shows. Here the CLR asks for the confirmation of no waypoint, and the ENT that confirms it hands null to
    // Set1Page.setWpt, which reads waypoint!.lat (Set1Page.tsx:73) and throws on the ENT path.
    it.fails('keeps the old ident without an error after CLR and ENT on the WPT field (checked in the KLN 89 trainer, 2026-10-07, #244)', async () => {
        const unit = await onConfirmedWptField();
        await unit.panel.clr();
        await unit.panel.ent();

        expect(unit.takeRejections()).toEqual([]);
        expect(unit.errors).toEqual([]);
        expect(Screen.read().rows('L').slice(1, 4)).toEqual(['WPT: KAAA  ', "N 47°06.00'", "E 11°00.00'"]);
    });
});

describe('SET 1 heading with a magnetic variation', () => {
    /** A world of 10° E; the aircraft moved on the true track 090 and parked, so SET 1 offers the magnetic 080 */
    async function onSet1Moved(): Promise<HeadlessUnit> {
        const unit = await bootUnit({position: POSITION, magvar: 10});
        await settle(unit);
        await moveAircraft(unit, POSITION, {groundspeedKt: 120, trackTrue: 90});
        await unit.panel.selectPage('L', 'SET 1');
        return unit;
    }

    /** CONFIRM?, then SET 2 and back to SET 1: the page reads the GPS track again */
    async function confirmAndReselect(unit: HeadlessUnit): Promise<void> {
        await unit.panel.cursorTo('L', 'CONFIRM?');
        await unit.panel.ent();
        await unit.panel.selectPage('L', 'SET 2');
        await unit.panel.selectPage('L', 'SET 1');
    }

    // 3-19: the heading field offers a heading, which the pilot may replace (5-46: the take-home mode flies it), and
    // checked in the KLN 89 trainer, 2026-10-08: the confirmed heading comes back unchanged. Set1Page shows the GPS
    // track converted to magnetic and hands the shown number back to the GPS as a true track at CONFIRM?
    // (Set1Page.confirmPosition), so CONFIRM? alone turns the track by the variation: 080 becomes 070
    it.fails('keeps the offered heading over CONFIRM? (3-19, checked in the KLN 89 trainer, 2026-10-08, #309)',
        async () => {
            const unit = await onSet1Moved();
            await unit.panel.cursor('L');
            await confirmAndReselect(unit);

            expect(Screen.read().rows('L')[4].slice(7)).toBe('080°');
        });

    // The same for an entered heading (checked in the KLN 89 trainer, 2026-10-08: the 270 entered there came back as
    // 270): here 270 comes back as 260
    it.fails('keeps an entered heading over CONFIRM? (3-19, checked in the KLN 89 trainer, 2026-10-08, #309)',
        async () => {
            const unit = await onSet1Moved();
            await unit.panel.cursor('L');
            await unit.panel.outer('L', 4); // the heading
            await unit.panel.type('L', '270');
            await unit.panel.ent();
            await confirmAndReselect(unit);

            expect(Screen.read().rows('L')[4].slice(7)).toBe('270°');
        });

    // Sibling of the pins: SET 1 offers the magnetic 080 before the cursor goes on, and CONFIRM? turns the cursor off
    // and SET 1 comes back with a heading row
    it('comes back with the cursor off after CONFIRM? (characterization)', async () => {
        const unit = await onSet1Moved();
        expect(Screen.read().rows('L')[4].slice(7)).toBe('080°');
        await unit.panel.cursor('L');
        await confirmAndReselect(unit);

        expect(unit.errors).toEqual([]);
        expect(Screen.read().status().left).toBe('SET 1');
        expect(Screen.read().rows('L')[4]).toMatch(/^.{3} KT \d{3}°$/);
    });
});
