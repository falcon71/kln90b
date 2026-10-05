import {describe, expect, it, onTestFinished, vi} from 'vitest';
import {RunwaySurfaceType} from '@microsoft/msfs-sdk';
import {bootUnit, HeadlessUnit} from '../../../harness/boot';
import {airport} from '../../../harness/navdata/builders';
import {Screen} from '../../../harness/render/screen';
import {storedSetting} from '../../../harness/storage';
import {SuperNav5Page} from '../../../../kln90b/pages/left/SuperNav5Page';
import {MainPage} from '../../../../kln90b/pages/MainPage';
import {CoordinateCanvasDrawContext} from '../../../../kln90b/controls/Canvas';

// Invented airports on the meridian of the aircraft, 0.1 degrees (6 NM) apart, one of each kind the SET 3 criteria
// (3-22, 3-23) tell apart. The aircraft is at 47.0N 8.0E.
const POSITION = {lat: 47.0, lon: 8.0};
const heli = () => airport('HELI', 47.0, 8.0, {runways: []}); // nearest, no runway
const kshort = () => airport('KSHT', 47.1, 8.0, {runways: [{lengthFt: 800}]}); // below the default minimum length
const kaaa = () => airport('KAAA', 47.2, 8.0); // 5000 ft asphalt
const kgrs = () => airport('KGRS', 47.3, 8.0, {runways: [{lengthFt: 3500, surface: RunwaySurfaceType.Grass}]});
const kbbb = () => airport('KBBB', 47.4, 8.0);

/**
 * The nearest airports, in order, as APT 1 shows them: the emergency nearest function (3-23, MSG then ENT) shows nr 1,
 * the scan knob then walks the list. The nearest search runs every 10 s, so the clock advances first. The booted unit
 * has its boot messages, so MSG then ENT has an effect (as in Apt1Page.test.ts).
 */
async function nearestRows(unit: HeadlessUnit): Promise<string[]> {
    await vi.advanceTimersByTimeAsync(12000);
    await unit.panel.msg();
    await unit.panel.ent();
    const rows: string[] = [];
    let row = Screen.read().rows('R')[0];
    if (!row.includes(' nr ')) return rows;
    rows.push(row);
    await unit.panel.scan();
    for (let i = 0; i < 20; i++) {
        await unit.panel.inner('R', 1);
        row = Screen.read().rows('R')[0];
        if (!row.includes(' nr ')) break;
        rows.push(row);
    }
    return rows;
}

describe('the nearest airport list', () => {
    // 3-22, 3-23: the nearest list holds the nearest airports that meet the SET 3 runway criteria. A heliport has no
    // runway, so it cannot meet them (the implication of the criteria; #57 and the fix 531b0f9 are the other source).
    describe('heliports and the SET 3 criteria (#57, 531b0f9)', () => {
        it('leaves a heliport out of the list (#57)', async () => {
            const unit = await bootUnit({facilities: [heli(), kaaa(), kgrs(), kbbb(), kshort()], position: POSITION});

            const rows = await nearestRows(unit);

            expect(rows).toEqual([' KAAA  nr 1', ' KGRS  nr 2', ' KBBB  nr 3']);
            expect(rows.join()).not.toContain('HELI');
        });

        // The runway of 800 ft is hidden by the minimum length criterion whatever the class mask does: this row
        // survives the #57 break by design and is no evidence for #57
        it('leaves out an airport whose runway is shorter than the minimum length', async () => {
            const unit = await bootUnit({facilities: [heli(), kaaa(), kgrs(), kbbb(), kshort()], position: POSITION});

            const rows = await nearestRows(unit);

            expect(rows.join()).not.toContain('KSHT');
        });

        it('lets a heliport take none of the nine slots (#57)', async () => {
            // The heliport is the nearest; ten ordinary airports follow, 0.1 degrees apart
            const ordinary = Array.from({length: 10}, (_, i) => airport(`KA0${i}`, 47.05 + i * 0.1, 8.0));
            const unit = await bootUnit({facilities: [heli(), ...ordinary], position: POSITION});

            const rows = await nearestRows(unit);

            expect(rows).toEqual([' KA00  nr 1', ' KA01  nr 2', ' KA02  nr 3', ' KA03  nr 4', ' KA04  nr 5', ' KA05  nr 6', ' KA06  nr 7', ' KA07  nr 8', ' KA08  nr 9']);
        });

        it('draws no heliport on Super NAV 5 (#57)', async () => {
            const labels: string[] = [];
            const spy = vi.spyOn(CoordinateCanvasDrawContext.prototype, 'drawLabel').mockImplementation((_facility, text) => {
                labels.push(text);
            });
            onTestFinished(() => spy.mockRestore());
            const unit = await bootUnit({storage: {superNav5Apt: true}, facilities: [heli(), kaaa(), kgrs(), kbbb(), kshort()], position: POSITION});
            await vi.advanceTimersByTimeAsync(12000);
            await unit.panel.selectPage('R', 'NAV 4'); // the right side first: its shorter way passes NAV 5, which is Super NAV 5 once the left shows NAV 5
            await unit.panel.selectPage('L', 'NAV 5');
            await unit.panel.inner('R', 1);
            await vi.advanceTimersByTimeAsync(2000);
            expect((unit.props.pageManager.getCurrentPage() as MainPage).getOverlayPage()).toBeInstanceOf(SuperNav5Page);

            expect([...new Set(labels)]).toEqual(['KAAA', 'KGRS', 'KBBB']);
        });
    });

    // 3-22, 3-23: SET 3 sets the minimum runway length and the surface of the airports in the nearest list
    describe('SET 3 criteria', () => {
        const kmid = () => airport('KMID', 47.1, 8.0, {runways: [{lengthFt: 1500}]});
        const world = () => ({facilities: [heli(), kmid(), kaaa(), kgrs(), kbbb()], position: POSITION});
        const idents = (rows: string[]) => rows.map(r => r.slice(1, 5));

        it('lists the airports of the default criteria', async () => {
            const unit = await bootUnit(world());

            expect(idents(await nearestRows(unit))).toEqual(['KMID', 'KAAA', 'KGRS', 'KBBB']);
        });

        it('drops an airport below the new minimum length', async () => {
            const unit = await bootUnit(world());
            await unit.panel.selectPage('L', 'SET 3');
            await unit.panel.cursor('L');
            await unit.panel.inner('L', 7); // 1000 ft plus 7 steps of 100 ft
            expect(Screen.read().rows('L')[3]).toBe('      1700\'');
            await unit.panel.cursor('L');

            expect(idents(await nearestRows(unit))).toEqual(['KAAA', 'KGRS', 'KBBB']);
        });

        it('drops the soft airport with the second surface option', async () => {
            const unit = await bootUnit(world());
            await unit.panel.selectPage('L', 'SET 3');
            await unit.panel.cursor('L');
            await unit.panel.outer('L', 1);
            await unit.panel.inner('L', 1);
            await unit.panel.cursor('L');
            await vi.advanceTimersByTimeAsync(2000);
            expect(storedSetting(unit, 'nearestAptSurface')).toBe(false); // hard surface only

            expect(idents(await nearestRows(unit))).toEqual(['KMID', 'KAAA', 'KBBB']);
        });
    });
});
