import {describe, expect, it} from 'vitest';
import * as H from '../../kln90b/HEvents';

// Contract test; the source is CLAUDE.md "Public contract with aircraft" ("H events in kln90b/HEvents.ts") and the wiki
// page External Hardware, which lists these names with the `H:` prefix. Aircraft and hardware bind to the strings, so a
// renamed value breaks every panel that uses it, and little else in the suite notices: the front panel of the harness
// sends the constants, and an unknown event is ignored without a word (the sweep in test/render/HEvents.test.ts cannot
// see a rename either). The Internal_* events are private and are not part of the pin.
describe('H event names (public contract)', () => {
    it('keeps the name of every public event', () => {
        expect(H).toMatchObject({
            EVT_BRT_INC: 'KLN90B_Brt_Inc',
            EVT_BRT_DEC: 'KLN90B_Brt_Dec',
            EVT_POWER: 'KLN90B_Power_Toggle',
            EVT_POWER_ON: 'KLN90B_Power_On',
            EVT_POWER_OFF: 'KLN90B_Power_Off',
            EVT_MSG: 'KLN90B_MSG_Push',
            EVT_DCT: 'KLN90B_DCT_Push',
            EVT_CLR: 'KLN90B_CLR_Push',
            EVT_ENT: 'KLN90B_ENT_Push',
            EVT_ALT: 'KLN90B_ALT_Push',
            EVT_L_CURSOR: 'KLN90B_LeftCursor_Toggle',
            EVT_L_OUTER_LEFT: 'KLN90B_LeftLargeKnob_Left',
            EVT_L_OUTER_RIGHT: 'KLN90B_LeftLargeKnob_Right',
            EVT_L_INNER_LEFT: 'KLN90B_LeftSmallKnob_Left',
            EVT_L_INNER_RIGHT: 'KLN90B_LeftSmallKnob_Right',
            EVT_R_CURSOR: 'KLN90B_RightCursor_Toggle',
            EVT_R_OUTER_LEFT: 'KLN90B_RightLargeKnob_Left',
            EVT_R_OUTER_RIGHT: 'KLN90B_RightLargeKnob_Right',
            EVT_R_INNER_LEFT: 'KLN90B_RightSmallKnob_Left',
            EVT_R_INNER_RIGHT: 'KLN90B_RightSmallKnob_Right',
            EVT_R_SCAN: 'KLN90B_RightScan_Toggle',
            EVT_APPR_ARM: 'KLN90B_ApprArm_Push',
        });
    });
});
