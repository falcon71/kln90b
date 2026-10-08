import {describe, expect, it, vi} from 'vitest';
import {bootUnit} from '../../harness/boot';
import {collectStatusMessages} from '../../harness/statusLine';
import {StatusLineMessageEvents} from '../../../kln90b/controls/StatusLine';

describe('collectStatusMessages (harness)', () => {
    it('does not report the message that was published before it was called, though the bus replays it', async () => {
        const unit = await bootUnit();
        await vi.advanceTimersByTimeAsync(1000);
        // The precondition: SUP is the right page at boot, it has no user waypoints and posts its message while it is built
        const raw: string[] = [];
        unit.props.bus.getSubscriber<StatusLineMessageEvents>().on('statusLineMessage').handle(m => raw.push(m));
        expect(raw).toEqual(['NO SUP WPTS']);

        expect(collectStatusMessages(unit)).toEqual([]);
    });

    it('reports each message published after the call, in order, and a repeated one as often as it was published', async () => {
        const unit = await bootUnit();
        const seen = collectStatusMessages(unit);
        await unit.panel.selectPage('R', 'INT  ');
        await unit.panel.selectPage('R', 'SUP  '); // posts NO SUP WPTS again, as the page is built anew
        await unit.panel.selectPage('L', 'FPL 0');
        await unit.panel.cursor('L');
        await unit.panel.enterIdent('L', 'QQQQ');
        await unit.panel.ent(); // an ident that the database lacks
        await unit.panel.ent(); // the cursor stays on the field, and the same message follows again

        expect(seen).toEqual(['NO SUP WPTS', 'NO SUCH WPT', 'NO SUCH WPT']);
    });
});
