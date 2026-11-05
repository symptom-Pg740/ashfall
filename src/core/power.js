/**
 * Power grid rules.
 *
 * Pure functions over plain node snapshots. The adapter owns the Three.js wires, the scene objects
 * and the UI; this module only validates links and solves one tick of the grid. No DOM, no Three.js,
 * no settlement object.
 */

/** Maximum distance a single wire can span, in metres. */
export const POWER_SPAN = 14;
/** Scrap cost of a wire per metre. */
export const WIRE_COST_PER_M = 0.4;
/** A wire always costs at least this much, even for two touching structures. */
export const WIRE_MIN_COST = 1;
/** Daylight below this value counts as night for `nightOnly` consumers. */
export const NIGHT_DAYLIGHT = 0.25;

/** @typedef {'source' | 'storage' | 'consumer' | 'relay'} PowerKind */

/**
 * @typedef {Object} PowerNodeSnapshot
 * @property {string | number} id
 * @property {string | null} kind
 * @property {number} [x]
 * @property {number} [z]
 * @property {boolean} [built]
 * @property {boolean} [destroyed]
 * @property {number} [ports] max ports for this node
 * @property {number | Array<any>} [links] used ports, or the link list
 * @property {string} [name]
 * @property {number} [output]
 * @property {number} [capacity]
 * @property {number} [charge]
 * @property {number} [demand]
 * @property {number} [priority]
 * @property {boolean} [nightOnly]
 */

/**
 * @typedef {Object} PowerLink
 * @property {string | number} a
 * @property {string | number} b
 */

/**
 * @typedef {Object} PowerNodeResult
 * @property {string | number} id
 * @property {boolean | null} powered null when the node kind has no powered flag
 * @property {boolean} energized
 * @property {number | null} charge null for non-storage nodes
 */

/**
 * @typedef {Object} PowerInfo
 * @property {number} output
 * @property {number} demand
 * @property {number} battery
 * @property {number} capacity
 * @property {boolean} powered
 * @property {boolean} hasGrid
 * @property {string} note
 */

export const POWER_KINDS = Object.freeze(['source', 'storage', 'consumer', 'relay']);

export const PORT_LIMITS = Object.freeze({
  relay: 4,
  source: 2,
  storage: 2,
  consumer: 2,
});

/**
 * @param {any} node a node snapshot, or a bare id
 * @returns {string | number | null}
 */
export function nodeId(node) {
  if (node && typeof node === 'object') return node.id ?? null;
  return node ?? null;
}

/**
 * @param {any} node
 * @returns {string | null}
 */
export function nodeKind(node) {
  return node?.kind ?? null;
}

/**
 * Stable, order-independent link key.
 * @param {any} a node or id
 * @param {any} b node or id
 * @returns {string}
 */
export function linkKey(a, b) {
  const aId = nodeId(a);
  const bId = nodeId(b);
  return aId < bId ? `${aId}:${bId}` : `${bId}:${aId}`;
}

/**
 * @param {string | null} kind
 * @returns {number}
 */
export function maxPortsForKind(kind) {
  return PORT_LIMITS[kind] || 0;
}

/**
 * @param {PowerNodeSnapshot | null} node
 * @returns {number}
 */
export function maxPorts(node) {
  return maxPortsForKind(nodeKind(node));
}

/**
 * @param {PowerNodeSnapshot | null} node
 * @returns {number}
 */
export function linkCount(node) {
  const links = node?.links;
  if (Array.isArray(links)) return links.length;
  const count = Number(links);
  return Number.isFinite(count) && count > 0 ? count : 0;
}

/**
 * Scrap cost of a wire of `distance` metres.
 * @param {number} distance
 * @param {number} [costPerMetre]
 * @returns {number}
 */
export function wireCost(distance, costPerMetre = WIRE_COST_PER_M) {
  const d = Math.max(0, Number(distance) || 0);
  return Math.max(WIRE_MIN_COST, Math.ceil(d * (Number(costPerMetre) || 0)));
}

/**
 * @param {PowerNodeSnapshot | null} node
 * @returns {string}
 */
function nodeLabel(node) {
  return node?.name || 'STRUCTURE';
}

/**
 * @param {PowerNodeSnapshot | null} node
 * @param {PowerLink[]} links
 * @returns {number}
 */
function usedPorts(node, links) {
  if (node?.links !== undefined && node?.links !== null) return linkCount(node);
  const id = nodeId(node);
  return links.filter((link) => nodeId(link?.a) === id || nodeId(link?.b) === id).length;
}

/**
 * Whether a manual wire is legal, and why not.
 *
 * @param {PowerNodeSnapshot | null} a
 * @param {PowerNodeSnapshot | null} b
 * @param {{ scrap?: number, links?: PowerLink[], span?: number, costPerMetre?: number }} [options]
 * @returns {{ ok: boolean, reason: string, cost?: number, distance?: number }}
 */
export function canConnect(a, b, options = {}) {
  const links = Array.isArray(options.links) ? options.links : [];
  const span = options.span ?? POWER_SPAN;
  const costPerMetre = options.costPerMetre ?? WIRE_COST_PER_M;
  const scrap = options.scrap ?? 0;

  if (!a || !b || a === b || nodeId(a) === nodeId(b)) {
    return { ok: false, reason: 'PICK TWO STRUCTURES' };
  }
  if (!a.built || !b.built || a.destroyed || b.destroyed) {
    return { ok: false, reason: 'SITE NOT READY' };
  }
  if (!maxPortsForKind(nodeKind(a)) || !maxPortsForKind(nodeKind(b))) {
    return { ok: false, reason: 'NOT A POWER NODE' };
  }

  const d = Math.hypot((a.x ?? 0) - (b.x ?? 0), (a.z ?? 0) - (b.z ?? 0));
  if (d > span) return { ok: false, reason: `OUT OF RANGE (${d.toFixed(0)}m)` };
  if (links.some((link) => linkKey(link?.a, link?.b) === linkKey(a, b))) {
    return { ok: false, reason: 'ALREADY LINKED' };
  }

  const aPorts = a.ports ?? maxPortsForKind(nodeKind(a));
  const bPorts = b.ports ?? maxPortsForKind(nodeKind(b));
  if (usedPorts(a, links) >= aPorts) return { ok: false, reason: `${nodeLabel(a)} PORTS FULL` };
  if (usedPorts(b, links) >= bPorts) return { ok: false, reason: `${nodeLabel(b)} PORTS FULL` };

  const cost = wireCost(d, costPerMetre);
  if (scrap < cost) return { ok: false, reason: `NEED ${cost} SCRAP`, cost };
  return { ok: true, reason: '', cost, distance: d };
}

/**
 * Solve one tick of the grid.
 *
 * Split the graph into connected components, then for each component allocate this tick's energy
 * (solar x daylight + stored charge) to consumers in priority order. Anything left charges the
 * batteries; a shortfall leaves the lowest-priority consumers dark.
 *
 * @param {PowerNodeSnapshot[]} [nodes]
 * @param {PowerLink[]} [links]
 * @param {{ dt?: number, daylight?: number }} [options]
 * @returns {{ info: PowerInfo, allPowered: boolean, results: PowerNodeResult[] }}
 */
export function solvePower(nodes = [], links = [], options = {}) {
  const dt = Number(options.dt) || 0;
  const daylight = Number(options.daylight) || 0;

  const byId = new Map(nodes.map((b) => [b.id, b]));
  const adj = new Map(nodes.map((b) => [b.id, []]));
  for (const link of links) {
    if (!byId.has(link.a) || !byId.has(link.b)) continue;
    adj.get(link.a).push(link.b);
    adj.get(link.b).push(link.a);
  }

  /** @type {Map<string | number, PowerNodeResult>} */
  const patches = new Map(
    nodes.map((b) => [b.id, { id: b.id, powered: null, energized: false, charge: null }]),
  );

  let totalOutput = 0;
  let totalDemand = 0;
  let totalCharge = 0;
  let totalCap = 0;
  let activeCount = 0;
  let poweredCount = 0;

  const seen = new Set();
  for (const start of nodes) {
    if (seen.has(start.id)) continue;
    const component = [];
    const stack = [start.id];
    seen.add(start.id);
    while (stack.length) {
      const id = stack.pop();
      const b = byId.get(id);
      if (!b) continue;
      component.push(b);
      for (const nb of adj.get(id) || []) {
        if (!seen.has(nb)) {
          seen.add(nb);
          stack.push(nb);
        }
      }
    }

    let production = 0;
    let capacity = 0;
    let charge = 0;
    const consumers = [];
    for (const b of component) {
      if (b.kind === 'source') production += b.output || 0;
      else if (b.kind === 'storage') capacity += b.capacity || 0;
      else if (b.kind === 'consumer') {
        const active = !b.nightOnly || daylight < NIGHT_DAYLIGHT;
        if (active) {
          consumers.push({ b, demand: b.demand || 0, priority: b.priority || 1 });
          activeCount++;
        }
      }
    }
    for (const b of component) {
      if (b.kind === 'storage') charge += Math.min(b.charge || 0, b.capacity || 0);
    }

    const output = production * daylight;
    const requested = consumers.reduce((n, c) => n + c.demand, 0);
    consumers.sort((x, y) => y.priority - x.priority);
    let available = output * dt + charge;
    for (const c of consumers) {
      const need = c.demand * dt;
      if (available >= need - 1e-9) {
        const patch = patches.get(c.b.id);
        if (patch) patch.powered = true;
        available -= need;
        poweredCount++;
      } else {
        const patch = patches.get(c.b.id);
        if (patch) patch.powered = false;
      }
    }
    const stored = Math.min(capacity, Math.max(0, available));
    // Distribute the component's charge evenly across its batteries.
    const batteries = component.filter((b) => b.kind === 'storage');
    if (batteries.length) {
      const per = stored / batteries.length;
      for (const b of batteries) {
        const patch = patches.get(b.id);
        if (patch) patch.charge = per;
      }
    }
    const energized = output > 0.01 || stored > 0.01;
    for (const b of component) {
      const patch = patches.get(b.id);
      if (patch) patch.energized = energized;
    }

    totalOutput += output;
    totalDemand += requested;
    totalCharge += stored;
    totalCap += capacity;
  }

  const hasGrid = nodes.length > 0;
  const active = activeCount > 0;
  const allPowered = active ? poweredCount >= activeCount : true;
  let note;
  if (!hasGrid) note = 'NO GRID · SOLAR + POLES';
  else if (totalOutput < 0.01 && totalCharge < 0.01) {
    const hasSource = nodes.some((b) => b.kind === 'source');
    note = !hasSource ? 'NO SOURCE · BUILD SOLAR' : daylight < NIGHT_DAYLIGHT ? 'BATTERY EMPTY' : 'NO POWER · CHECK WIRES';
  } else if (!active) note = totalCharge > 0.01 ? `IDLE · ${Math.round(totalCharge)} STORED` : 'GRID READY';
  else if (!allPowered) note = 'DEFICIT · ADD POWER';
  else note = daylight > 0.3 ? 'SOLAR ONLINE' : 'BATTERY · NIGHT';

  return {
    info: {
      output: totalOutput,
      demand: totalDemand,
      battery: totalCharge,
      capacity: totalCap,
      powered: active ? allPowered : totalOutput > 0.01,
      hasGrid,
      note,
    },
    allPowered,
    results: nodes.map(
      (b) => patches.get(b.id) || { id: b.id, powered: null, energized: false, charge: null },
    ),
  };
}
