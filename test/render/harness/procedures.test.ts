import {describe, expect, it} from 'vitest';
import {Facility, FixTypeFlags, GeoPoint, LegTurnDirection, UnitType} from '@microsoft/msfs-sdk';
import {bootUnit, HeadlessUnit, settle} from '../../harness/boot';
import {Screen} from '../../harness/render/screen';
import {airport, intersection, vor} from '../../harness/navdata/builders';
import {approach, Leg, sid, withProcedures} from '../../harness/navdata/procedures';
import {savedFlightplan} from '../../harness/storage';
import {courseDeg, distanceNm} from '../../harness/flight/geo';
import {KLNFixType, KLNLegType} from '../../../kln90b/data/flightplan/Flightplan';

const RNAV = ApproachType.APPROACH_TYPE_RNAV;

const fpl0 = (unit: HeadlessUnit) => unit.props.memory.fplPage.flightplans[0].getLegs();
const idents = (unit: HeadlessUnit, type: KLNLegType) => fpl0(unit).filter(l => l.type === type).map(l => l.wpt.icaoStruct.ident);
const rows = (side: 'L' | 'R') => Screen.read().half(side).split('\n').map(r => r.trimEnd());

/** Procedure fixes at invented positions near 47/8 */
const iafaa = intersection('IAFAA', 47.3, 7.7);
const ifaaa = intersection('IFAAA', 47.2, 7.8);
const fafaa = intersection('FAFAA', 47.1, 7.9);
const mapaa = intersection('MAPAA', 47.0, 8.0);
const mahaa = intersection('MAHAA', 47.0, 8.3);
const depaa = intersection('DEPAA', 47.0, 8.2);
const enraa = intersection('ENRAA', 47.0, 8.4);

/** The RNAV 27 approach of KPRC: IAF, IF, FAF, MAP and missed approach holding point, with a CA leg that is dropped */
const rnav27 = () => approach({
    type: RNAV, runway: '27',
    transitions: [{name: 'IAFAA', legs: [Leg.IF(iafaa, FixTypeFlags.IAF), Leg.TF(ifaaa, FixTypeFlags.IF)]}],
    final: [Leg.IF(ifaaa, FixTypeFlags.IF), Leg.TF(fafaa, FixTypeFlags.FAF), Leg.TF(mapaa, FixTypeFlags.MAP)],
    missed: [Leg.CA(270), Leg.DF(mahaa), Leg.HM(mahaa, 90, LegTurnDirection.Right, FixTypeFlags.MAHP)],
});

const bootWith = (kprc: Facility, others: Facility[], position = {lat: 47, lon: 8}) =>
    bootUnit({facilities: [kprc, ...others], position, storage: savedFlightplan(0, [kprc])});

describe('procedures through APT 8 (harness)', () => {
    it('loads an RNAV approach with its IAF, FAF, MAP and MAHP', async () => {
        const kprc = withProcedures(airport('KPRC', 47.0, 8.0), {approaches: [rnav27()]});
        const unit = await bootWith(kprc, [iafaa, ifaaa, fafaa, mapaa, mahaa]);
        await settle(unit);

        await unit.panel.selectPage('R', 'APT 8');
        expect(rows('R').slice(0, 2)).toEqual([' KPRC IAP', ' 1 RNAV 27']);
        await unit.panel.cursor('R');
        await unit.panel.ent(); // the only transition is taken without a question: the preview

        // The preview lists the first three legs and the last one; the cursor is on LOAD IN FPL (6-4)
        expect(rows('R')).toEqual(['R27-KPRC', ' 1 IAFAAà', ' 2 IFAAA', ' 3 FAFAAá', ' 5 MAHAAâ', 'LOAD IN FPL']);
        await unit.panel.outer('R', -1);
        expect(rows('R')).toEqual(['R27-KPRC', ' 2 IFAAA', ' 3 FAFAAá', ' 4 MAPAAã', ' 5 MAHAAâ', 'LOAD IN FPL']);
        await unit.panel.outer('R', 1);
        await unit.panel.ent(); // LOAD IN FPL; KPRC is in FPL 0 already

        const legs = fpl0(unit).filter(l => l.type === KLNLegType.APP);
        expect(legs.map(l => [l.wpt.icaoStruct.ident, l.fixType])).toEqual([
            ['IAFAA', KLNFixType.IAF], ['IFAAA', undefined], ['FAFAA', KLNFixType.FAF], ['MAPAA', KLNFixType.MAP], ['MAHAA', KLNFixType.MAHP],
        ]);
        // The CA leg and the repeated fixes are gone: each fix appears once
        expect(fpl0(unit).map(l => l.wpt.icaoStruct.ident).sort()).toEqual(['FAFAA', 'IAFAA', 'IFAAA', 'KPRC', 'MAHAA', 'MAPAA']);
        // The load switched the left side to FPL 0
        expect(Screen.read().leftName()).toBe('FPL 0');
        const left = rows('L');
        expect(left).toContain('  3 FAFAAá');
        expect(left.some(r => r.endsWith('4 MAPAAã'))).toBe(true);
        expect(left.some(r => r.endsWith('5 MAHAAâ'))).toBe(true);
    });

    // The unit above sits at the MAP, so FPL 0 has scrolled to the later legs; here it sits at the IAF
    it('shows the IAF suffix on FPL 0', async () => {
        const kprc = withProcedures(airport('KPRC', 47.0, 8.0), {approaches: [rnav27()]});
        const unit = await bootWith(kprc, [iafaa, ifaaa, fafaa, mapaa, mahaa], {lat: iafaa.lat, lon: iafaa.lon});
        await settle(unit);

        await unit.panel.selectPage('R', 'APT 8');
        await unit.panel.cursor('R');
        await unit.panel.ent();
        await unit.panel.ent();

        expect(Screen.read().leftName()).toBe('FPL 0');
        expect(rows('L').some(r => r.endsWith(' 1 IAFAAà'))).toBe(true);
    });

    it('converts a DME arc to an entry waypoint followed by the arc end fix', async () => {
        const abc = vor('ABC', 47.3, 8.3);
        const at = (bearing: number, nm: number) => new GeoPoint(abc.lat, abc.lon).offset(bearing, UnitType.NMILE.convertTo(nm, UnitType.GA_RADIAN));
        const arcbg = intersection('ARCBG', at(270, 10).lat, at(270, 10).lon);
        const arcen = intersection('ARCEN', at(180, 10).lat, at(180, 10).lon);
        const kprc = withProcedures(airport('KPRC', 47.0, 8.0), {
            approaches: [approach({
                type: RNAV, runway: '27',
                transitions: [{
                    name: 'ARCBG', legs: [
                        Leg.IF(arcbg, FixTypeFlags.IAF),
                        Leg.AF(arcen, abc, {radiusNm: 10, fromRadial: 270, toRadial: 180, turn: LegTurnDirection.Left}),
                        Leg.TF(fafaa, FixTypeFlags.FAF),
                    ],
                }],
                final: [Leg.TF(mapaa, FixTypeFlags.MAP)],
            })],
        });
        // 20 NM out on the 225 radial, which is on the arc from the 270 to the 180 radial
        const pos = at(225, 20);
        const unit = await bootWith(kprc, [abc, arcbg, arcen, fafaa, mapaa], {lat: pos.lat, lon: pos.lon});
        await settle(unit);

        await unit.panel.selectPage('R', 'APT 8');
        await unit.panel.cursor('R');
        await unit.panel.ent();
        await unit.panel.ent();

        const legs = fpl0(unit).filter(l => l.type === KLNLegType.APP);
        expect(legs.map(l => l.wpt.icaoStruct.ident)).toEqual(['D225J', 'ARCEN', 'FAFAA', 'MAPAA']);
        const [entry, end] = legs;
        expect(entry.fixType).toBe(KLNFixType.IAF);
        expect(entry.arcData).toBeDefined();
        expect(entry.arcData!.vor.icaoStruct.ident).toBe('ABC');
        expect(entry.arcData!.turnDirection).toBe(LegTurnDirection.Left);
        expect(end.arcData).toBeUndefined();
        // The entry is the point of the arc closest to the aircraft: 10 NM from the VOR on the 225 radial
        expect(distanceNm(abc, entry.wpt)).toBeCloseTo(10, 2);
        expect(courseDeg(abc, entry.wpt)).toBeCloseTo(225, 1);
    });

    it('enters at the beginning of the arc when the aircraft is outside it', async () => {
        const abc = vor('ABC', 47.3, 8.3);
        const at = (bearing: number, nm: number) => new GeoPoint(abc.lat, abc.lon).offset(bearing, UnitType.NMILE.convertTo(nm, UnitType.GA_RADIAN));
        const arcbg = intersection('ARCBG', at(270, 10).lat, at(270, 10).lon);
        const arcen = intersection('ARCEN', at(180, 10).lat, at(180, 10).lon);
        const kprc = withProcedures(airport('KPRC', 47.0, 8.0), {
            approaches: [approach({
                type: RNAV, runway: '27',
                transitions: [{
                    name: 'ARCBG', legs: [
                        Leg.IF(arcbg, FixTypeFlags.IAF),
                        Leg.AF(arcen, abc, {radiusNm: 10, fromRadial: 270, toRadial: 180, turn: LegTurnDirection.Left}),
                        Leg.TF(fafaa, FixTypeFlags.FAF),
                    ],
                }],
                final: [Leg.TF(mapaa, FixTypeFlags.MAP)],
            })],
        });
        const pos = at(45, 20);
        const unit = await bootWith(kprc, [abc, arcbg, arcen, fafaa, mapaa], {lat: pos.lat, lon: pos.lon});
        await settle(unit);

        await unit.panel.selectPage('R', 'APT 8');
        await unit.panel.cursor('R');
        await unit.panel.ent();
        await unit.panel.ent();

        const legs = fpl0(unit).filter(l => l.type === KLNLegType.APP);
        expect(legs.map(l => l.wpt.icaoStruct.ident)).toEqual(['D270J', 'ARCEN', 'FAFAA', 'MAPAA']);
        expect(courseDeg(abc, legs[0].wpt)).toBeCloseTo(270, 1);
    });
});

describe('procedures through APT 7 (harness)', () => {
    it('loads a SID without its CA leg', async () => {
        const kprc = withProcedures(airport('KPRC', 47.0, 8.0), {
            departures: [sid('DEP1', {runways: [{runway: '27', legs: [Leg.CA(270), Leg.DF(depaa)]}], common: [Leg.TF(enraa)]})],
        });
        const unit = await bootWith(kprc, [depaa, enraa]);
        await settle(unit);

        await unit.panel.selectPage('R', 'APT 7');
        expect(rows('R').slice(0, 3)).toEqual([' KPRC', 'SELECT SID', ' 1 DEP1']);
        await unit.panel.cursor('R');
        await unit.panel.ent(); // the one runway transition is taken without a question: the preview
        expect(rows('R').slice(0, 3)).toEqual(['DEP1-SID', ' 1 DEPAA', ' 2 ENRAA']);
        await unit.panel.ent(); // LOAD IN FPL; KPRC is in FPL 0 already

        expect(fpl0(unit).map(l => l.wpt.icaoStruct.ident)).toEqual(['KPRC', 'DEPAA', 'ENRAA']);
        expect(idents(unit, KLNLegType.SID)).toEqual(['DEPAA', 'ENRAA']);
    });
});

describe('the missing-fix check of bootUnit (harness)', () => {
    it('rejects a boot whose procedure fix is not in the navdata, naming the fix', async () => {
        const kprc = withProcedures(airport('KPRC', 47.0, 8.0), {approaches: [rnav27()]});

        await expect(bootUnit({facilities: [kprc, iafaa, ifaaa, fafaa, mapaa]})).rejects.toThrow('bootUnit: procedure fixes missing from the navdata: MAHAA (W K1)');
    });

    it('rejects a boot whose arc navaid is not in the navdata', async () => {
        const abc = vor('ABC', 47.3, 8.3);
        const kprc = withProcedures(airport('KPRC', 47.0, 8.0), {
            approaches: [approach({
                type: RNAV, runway: '27', final: [Leg.IF(fafaa, FixTypeFlags.IAF), Leg.AF(mapaa, abc, {radiusNm: 10, fromRadial: 270, toRadial: 180, turn: LegTurnDirection.Left})],
            })],
        });

        await expect(bootUnit({facilities: [kprc, fafaa, mapaa]})).rejects.toThrow('bootUnit: procedure fixes missing from the navdata: ABC (V K1)');
    });

    it('lets a boot with every fix present through', async () => {
        const kprc = withProcedures(airport('KPRC', 47.0, 8.0), {approaches: [rnav27()]});

        const unit = await bootUnit({facilities: [kprc, iafaa, ifaaa, fafaa, mapaa, mahaa]});
        await settle(unit);

        expect(unit.navdata.missingProcedureFixes()).toEqual([]);
        await unit.panel.selectPage('R', 'APT 8');
        expect(rows('R').slice(0, 2)).toEqual([' KPRC IAP', ' 1 RNAV 27']);
    });
});
