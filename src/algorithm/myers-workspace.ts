import { MAX_COMBINED_INPUT_LENGTH } from '../input-length.js';

export const INITIAL_FRONTIER_DISTANCE = 16;
export const MAX_FRONTIER_COORDINATE = MAX_COMBINED_INPUT_LENGTH;

export interface MyersFrontiers {
  forward: Uint32Array;
  reverse: Uint32Array;
  center: number;
  distanceCapacity: number;
  /** Largest distance written by the current search, or -1 while released. */
  activeDistance: number;
}

export interface MyersWorkspace {
  frontiers?: MyersFrontiers;
  prefix?: Uint32Array;
}

export const createMyersWorkspace = (): MyersWorkspace => ({});

/** Encode a coordinate while retaining zero as the unseen-diagonal sentinel. */
export const encodeFrontierCoordinate = (coordinate: number): number => {
  if (!Number.isInteger(coordinate) || coordinate < 0 || coordinate > MAX_FRONTIER_COORDINATE) {
    throw new RangeError('Myers frontier coordinate is outside the compact representation');
  }

  return coordinate + 1;
};

/** Decode zero or an out-of-bounds read to the search's -1 sentinel. */
export const decodeFrontierCoordinate = (stored: number | undefined): number => (stored ?? 0) - 1;

/** Return a call-local KMP prefix table that never shrinks. */
export const getPrefixTable = (workspace: MyersWorkspace, length: number): Uint32Array => {
  let prefix = workspace.prefix;
  if (prefix === undefined || prefix.length < length) {
    prefix = new Uint32Array(length);
    workspace.prefix = prefix;
  }

  prefix[0] = 0;
  return prefix;
};

const allocateFrontiers = (distanceCapacity: number): MyersFrontiers => {
  const length = 2 * distanceCapacity + 1;
  return {
    forward: new Uint32Array(length),
    reverse: new Uint32Array(length),
    center: distanceCapacity,
    distanceCapacity,
    activeDistance: -1,
  };
};

/** Clear the interval touched by a completed bisection so the pair can be reused. */
export const resetFrontiers = (frontiers: MyersFrontiers): void => {
  if (frontiers.activeDistance < 0) {
    return;
  }

  const activeRadius = Math.max(1, frontiers.activeDistance);
  const start = frontiers.center - activeRadius;
  const end = frontiers.center + activeRadius + 1;
  frontiers.forward.fill(0, start, end);
  frontiers.reverse.fill(0, start, end);
  frontiers.activeDistance = -1;
};

/** Lend a clean frontier pair to one bisection and install its coordinate-zero seeds. */
export const prepareFrontiers = (workspace: MyersWorkspace, maximumDistance: number): MyersFrontiers => {
  let frontiers = workspace.frontiers;
  if (frontiers === undefined) {
    const distanceCapacity = Math.min(INITIAL_FRONTIER_DISTANCE, maximumDistance);
    frontiers = allocateFrontiers(distanceCapacity);
    workspace.frontiers = frontiers;
  } else {
    resetFrontiers(frontiers);
  }

  const seed = frontiers.center + 1;
  frontiers.forward[seed] = encodeFrontierCoordinate(0);
  frontiers.reverse[seed] = encodeFrontierCoordinate(0);
  frontiers.activeDistance = 0;
  return frontiers;
};

/** Grow and recenter both frontier arrays while retaining every existing diagonal. */
export const growFrontiers = (frontiers: MyersFrontiers, requiredDistance: number, maximumDistance: number): void => {
  if (requiredDistance <= frontiers.distanceCapacity) {
    return;
  }

  const distanceCapacity = Math.min(maximumDistance, Math.max(requiredDistance, frontiers.distanceCapacity * 2));
  if (distanceCapacity < requiredDistance) {
    throw new RangeError('Myers frontier cannot grow beyond its admitted input range');
  }

  const center = distanceCapacity;
  const length = 2 * distanceCapacity + 1;
  const forward = new Uint32Array(length);
  const reverse = new Uint32Array(length);
  const shift = center - frontiers.center;
  forward.set(frontiers.forward, shift);
  reverse.set(frontiers.reverse, shift);

  frontiers.forward = forward;
  frontiers.reverse = reverse;
  frontiers.center = center;
  frontiers.distanceCapacity = distanceCapacity;
};
