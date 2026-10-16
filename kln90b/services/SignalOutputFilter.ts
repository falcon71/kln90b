/**
 * The analog D-bar (CDI deviation) output of the real unit. The software computes the deviation once per second (see
 * TickController) and hands it to hardware that smooths it, which this class emulates for GPS WP CROSS TRK.
 *
 * How the hardware does it (Component Maintenance Manual 34-50-14):
 * - Page 29: the 80C186 timer TMR0 is pulse-width modulated, 50 % duty being no deviation. The CDI driver integrates the
 *   PWM into a DC voltage centred on 0 V.
 * - Our reading of the main module schematic on page 2079 (the D-bar driver next to the ARINC 429 transmitter):
 *   1. D_BAR_SIG, the PWM, is buffered by an inverter of a 74HCT04 (I20) into a clean 0 to 5 V square wave.
 *   2. R102 51.1 kΩ into C88 4.7 µF, both referenced to the D-BAR +L node, form a first-order RC low-pass. With
 *      τ = R × C = 0.24 s this is the only stage that matters for the timing. The parts list (pages 10050 and 10060) has
 *      the same values; the summary of changes on page 2041 shows that they were changed in main module revision 3.
 *   3. I51A (TL084) buffers the capacitor voltage at unity gain. R103 75 kΩ balances its bias current against R102 and
 *      C89 100 pF keeps it stable.
 *   4. I51B is an inverting stage with a gain of R107/R104 = 1 kΩ/5.76 kΩ ≈ -0.17, offset by about 0.35 V from the
 *      R105/R106 divider off +5 V, so that the output is centred on 0 V. Its feedback capacitor (C92 and C93, 15 µF
 *      each, back to back = 7.5 µF) with R107 gives a time constant of 7.5 ms, too short to matter.
 *   5. R108 1 kΩ drives the D-BAR +R pin. The feedback is taken behind R108, so the loop holds the pin voltage itself.
 *   The full 0 to 100 % duty spans about ±430 mV at the pin, which covers the ±300 mV the D-bar calibration (SET 11)
 *   adjusts to.
 * - The main module of a KLN 90/90A upgraded to a KLN 90B (page 2099) has the older values R102 75 kΩ and C88 15 µF,
 *   τ = 1.125 s. A needle on such a unit moves smoothly; on a KLN 90B with τ = 0.24 s it still moves once per second,
 *   with the step rounded off.
 *
 * So this is a single RC lag: it cannot overshoot (#158) and it lags a steadily changing deviation. Since the circuit
 * smooths the voltage, i.e. the deviation in full scales, a change of the CDI scale moves the needle smoothly too. The
 * Installation Manual 1-7 gives the drive range as ±300 mV for ±150 mV full scale, so the deviation stops at two full
 * scales.
 *
 * The ARINC 429 output (label 116) is digital and is not filtered; it is L:KLN90B_XTK.
 */
const R102 = 51.1e3; // Ω
const C88 = 4.7e-6; // F
const TAU_MS = R102 * C88 * 1000;

/**
 * ±300 mV drive range / ±150 mV full scale
 */
const MAX_DEVIATION = 2;

export class SignalOutputFilter {

    private input = 0; // The deviation the PWM is set to, in full scales
    private output = 0; // The voltage on C88, in full scales
    private scale = 1;
    private lastTime = new Date().getTime();

    /**
     * Sets the PWM to a new deviation, once per calculation tick
     * @param xtk Cross track, in any unit
     * @param scale The full scale deflection of the CDI, in the unit of xtk
     */
    setValue(xtk: number, scale: number) {
        this.advance();
        this.scale = scale;
        this.input = Math.max(-MAX_DEVIATION, Math.min(MAX_DEVIATION, xtk / scale));
    }

    /**
     * The deviation the needle shows now, given as the cross track on the current scale
     */
    getCurrentValue(): number {
        this.advance();
        return this.output * this.scale;
    }

    /**
     * The capacitor discharges while the unit is off
     */
    reset() {
        this.input = 0;
        this.output = 0;
        this.lastTime = new Date().getTime();
    }

    /**
     * The exact solution of the RC low-pass for the input held since the last call, so the result does not depend on how
     * often it is sampled. A clock that steps back counts as no time passed.
     */
    private advance() {
        const now = new Date().getTime();
        const dt = Math.max(0, now - this.lastTime);
        this.output = this.input + (this.output - this.input) * Math.exp(-dt / TAU_MS);
        this.lastTime = now;
    }
}
