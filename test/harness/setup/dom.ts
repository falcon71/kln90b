import {installSimFakes} from '../sim/install';
import {installCanvas} from '../render/canvas';

installSimFakes();
installCanvas(globalThis);
