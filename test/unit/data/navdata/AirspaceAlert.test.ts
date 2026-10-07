import {describe, expect, it} from 'vitest';
import {BoundaryType} from '@microsoft/msfs-sdk';
import {formatAirspaceTypeName} from '../../../../kln90b/data/navdata/AirspaceAlert';

// 3-39: the abbreviations of the SUA types, as the AIRSPACE ALERT message and the TRI 2, 4 and 6 lists show them. CTA,
// TMA and CAUT have no BoundaryType in the SDK, so they cannot occur.
describe('SUA type abbreviations (3-39)', () => {
    it.each([
        [BoundaryType.ClassB, 'CL B'],
        [BoundaryType.ClassC, 'CL C'],
        [BoundaryType.Alert, 'ALRT'],
        [BoundaryType.Danger, 'DNGR'],
        [BoundaryType.MOA, 'MOA'],
        [BoundaryType.Prohibited, 'PROH'],
        [BoundaryType.Restricted, 'REST'],
        [BoundaryType.Training, 'TRNG'],
        [BoundaryType.Warning, 'WARN'],
    ])('BoundaryType %i is %s (3-39)', (type, abbreviation) => {
        expect(formatAirspaceTypeName(type)).toBe(abbreviation);
    });
});
