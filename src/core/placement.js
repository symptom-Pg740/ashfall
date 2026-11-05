/**
 * Camp placement rules.
 *
 * Pure: no Three.js, no terrain, no DOM. The caller samples the ground slope and passes the camp
 * radius, so the same rule serves the ghost preview, the placement command and headless tests.
 *
 * Reason strings are the ones the placement UI already shows.
 */

/** Two warehouses may sit this close so their sheds read as one depot. */
const WAREHOUSE_LINK_CLEARANCE = 5.2;
/** Extra gap kept between any other footprint. */
const STRUCTURE_GAP = 0.15;

/**
 * @typedef {object} PlacementDef
 * @property {string} id
 * @property {number} cost
 * @property {number} radius
 */

/**
 * @typedef {object} PlacedBuilding
 * @property {string} type
 * @property {number} x
 * @property {number} z
 * @property {number} radius
 */

/**
 * @typedef {object} Obstacle
 * @property {number} x
 * @property {number} z
 * @property {number} r
 */

/**
 * Check whether a structure may be placed at a world position.
 *
 * Rule order matches the UI: cost, camp bounds, ground, structures, wreckage. The first failure
 * wins, so the message stays stable.
 *
 * `components` is accepted for callers that gate component costs, but component affordability is
 * enforced by the placement caller, not by this rule.
 *
 * @param {object} input
 * @param {PlacementDef} input.def structure definition from `content/buildings.js`
 * @param {number} input.x proposed world X
 * @param {number} input.z proposed world Z
 * @param {PlacedBuilding[]} [input.buildings] existing structures
 * @param {Obstacle[]} [input.obstacles] wreckage/prop circles
 * @param {number} input.campRadius camp boundary radius
 * @param {number} input.scrap available scrap
 * @param {number} [input.components] available components (not a blocking rule today)
 * @param {number} input.slope ground slope sampled at the position
 * @param {number} input.slopeLimit maximum buildable slope
 * @returns {{ ok: boolean, reason: string }} reason is `''` when ok
 */
export function validatePlacement({
  def,
  x,
  z,
  buildings = [],
  obstacles = [],
  campRadius = 0,
  scrap = 0,
  components = 0,
  slope = 0,
  slopeLimit = 0,
}) {
  if (!def) return { ok: false, reason: 'NO STRUCTURE' };
  if (def.cost > scrap) return { ok: false, reason: 'NOT ENOUGH SCRAP' };
  if (Math.hypot(x, z) > campRadius) return { ok: false, reason: 'OUTSIDE THE CAMP' };
  if (slope > slopeLimit) return { ok: false, reason: 'UNEVEN GROUND' };

  for (const b of buildings) {
    const minDist =
      def.id === 'warehouse' && b.type === 'warehouse'
        ? WAREHOUSE_LINK_CLEARANCE
        : b.radius + def.radius + STRUCTURE_GAP;
    if (Math.hypot(b.x - x, b.z - z) < minDist) {
      return { ok: false, reason: 'BLOCKED BY STRUCTURE' };
    }
  }

  for (const o of obstacles) {
    if (Math.hypot(o.x - x, o.z - z) < o.r + def.radius) {
      return { ok: false, reason: 'BLOCKED BY WRECKAGE' };
    }
  }

  return { ok: true, reason: '' };
}
