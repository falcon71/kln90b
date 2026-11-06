import {describe, expect, it} from 'vitest';
import {bootUnit} from '../harness/boot';
import {LEVEL_ANTENNA, SimVarAntennaAttitude} from '../../kln90b/AntennaAttitude';
import {AntennaAttitude, LEVEL_ATTITUDE} from '../../kln90b/GpsSignal';

/**
 * #467: the antenna's attitude at the SimVar boundary. MSFS gives the pitch positive nose down and the bank positive left
 * wing down; the signal model takes nose up and right wing down as positive. Characterizations of our wiring
 */

const attitude = (): AntennaAttitude => ({headingTrueDeg: -1, pitchUpDeg: -1, bankRightDeg: -1, onGround: false});

describe('SimVarAntennaAttitude (#467, characterization)', () => {
    it('reads the true heading, and the pitch and the bank with their MSFS signs turned', async () => {
        const unit = await bootUnit();
        unit.env.sim.set('PLANE HEADING DEGREES TRUE', 'degrees', 123);
        unit.env.sim.set('PLANE PITCH DEGREES', 'degrees', -7); // Nose up in MSFS
        unit.env.sim.set('PLANE BANK DEGREES', 'degrees', 20); // Left wing down in MSFS
        unit.env.sim.set('SIM ON GROUND', 'bool', false);
        const out = attitude();

        new SimVarAntennaAttitude().read(out);

        expect(out.headingTrueDeg).toBeCloseTo(123, 9);
        expect(out.pitchUpDeg).toBeCloseTo(7, 9);
        expect(out.bankRightDeg).toBeCloseTo(-20, 9);
        expect(out.onGround).toBe(false);
    }, 30_000);

    it('reads on the ground', async () => {
        const unit = await bootUnit();
        unit.env.sim.set('SIM ON GROUND', 'bool', true);
        const out = attitude();

        new SimVarAntennaAttitude().read(out);

        expect(out.onGround).toBe(true);
    }, 30_000);
});

describe('LEVEL_ANTENNA (#467, characterization)', () => {
    it('is level in flight whatever the SimVars say, and the test platform uses it', async () => {
        const unit = await bootUnit();
        unit.env.sim.set('PLANE HEADING DEGREES TRUE', 'degrees', 123);
        unit.env.sim.set('PLANE PITCH DEGREES', 'degrees', -7);
        unit.env.sim.set('PLANE BANK DEGREES', 'degrees', 20);
        unit.env.sim.set('SIM ON GROUND', 'bool', true);
        const out = attitude();

        LEVEL_ANTENNA.read(out);

        expect(out).toEqual({...LEVEL_ATTITUDE});
        expect(unit.props.sensors.in.gps['antenna']).toBe(LEVEL_ANTENNA);
    }, 30_000);
});
