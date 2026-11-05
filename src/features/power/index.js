/**
 * Public power slice.
 *
 * Pure graph validation and grid solving. Presentation (wires, lamps, HUD) stays in `src/power.js`.
 */

export {
  NIGHT_DAYLIGHT,
  PORT_LIMITS,
  POWER_KINDS,
  POWER_SPAN,
  WIRE_COST_PER_M,
  WIRE_MIN_COST,
  canConnect,
  linkCount,
  linkKey,
  maxPorts,
  maxPortsForKind,
  nodeId,
  nodeKind,
  solvePower,
  wireCost,
} from '../../core/power.js';
