import { describe, expect, it } from 'vitest';
import {
  INITIAL_FRONTIER_DISTANCE,
  MAX_FRONTIER_COORDINATE,
  createMyersWorkspace,
  decodeFrontierCoordinate,
  encodeFrontierCoordinate,
  getPrefixTable,
  growFrontiers,
  prepareFrontiers,
  resetFrontiers,
} from './myers-workspace';

describe('compact Myers workspace', () => {
  it('encodes the largest coordinate and rejects the first unrepresentable coordinate', () => {
    expect(encodeFrontierCoordinate(MAX_FRONTIER_COORDINATE)).toBe(0xffff_ffff);
    expect(decodeFrontierCoordinate(0xffff_ffff)).toBe(MAX_FRONTIER_COORDINATE);
    expect(decodeFrontierCoordinate(0)).toBe(-1);
    expect(decodeFrontierCoordinate(undefined)).toBe(-1);
    expect(() => encodeFrontierCoordinate(0xffff_ffff)).toThrow(RangeError);
  });

  it('recenters both frontiers across a clamped geometric growth boundary', () => {
    const workspace = createMyersWorkspace();
    const maximumDistance = INITIAL_FRONTIER_DISTANCE + 1;
    const frontiers = prepareFrontiers(workspace, maximumDistance);
    const oldCenter = frontiers.center;
    const forwardLeft = encodeFrontierCoordinate(7);
    const forwardRight = encodeFrontierCoordinate(11);
    const reverseLeft = encodeFrontierCoordinate(13);
    const reverseRight = encodeFrontierCoordinate(17);

    frontiers.forward[oldCenter - INITIAL_FRONTIER_DISTANCE] = forwardLeft;
    frontiers.forward[oldCenter + INITIAL_FRONTIER_DISTANCE] = forwardRight;
    frontiers.reverse[oldCenter - INITIAL_FRONTIER_DISTANCE] = reverseLeft;
    frontiers.reverse[oldCenter + INITIAL_FRONTIER_DISTANCE] = reverseRight;
    frontiers.activeDistance = INITIAL_FRONTIER_DISTANCE;

    growFrontiers(frontiers, maximumDistance, maximumDistance);

    expect(frontiers.distanceCapacity).toBe(maximumDistance);
    expect(frontiers.forward.length).toBe(2 * maximumDistance + 1);
    expect(frontiers.forward[frontiers.center - INITIAL_FRONTIER_DISTANCE]).toBe(forwardLeft);
    expect(frontiers.forward[frontiers.center + INITIAL_FRONTIER_DISTANCE]).toBe(forwardRight);
    expect(frontiers.reverse[frontiers.center - INITIAL_FRONTIER_DISTANCE]).toBe(reverseLeft);
    expect(frontiers.reverse[frontiers.center + INITIAL_FRONTIER_DISTANCE]).toBe(reverseRight);
  });

  it('clears only the active interval and reuses the largest frontier pair', () => {
    const workspace = createMyersWorkspace();
    const frontiers = prepareFrontiers(workspace, INITIAL_FRONTIER_DISTANCE * 2);
    const originalForward = frontiers.forward;
    const originalReverse = frontiers.reverse;
    const outsideActiveInterval = frontiers.center + 4;

    frontiers.forward[frontiers.center] = encodeFrontierCoordinate(2);
    frontiers.reverse[frontiers.center - 1] = encodeFrontierCoordinate(3);
    frontiers.forward[outsideActiveInterval] = encodeFrontierCoordinate(5);
    frontiers.activeDistance = 1;
    resetFrontiers(frontiers);

    expect(frontiers.forward[frontiers.center]).toBe(0);
    expect(frontiers.reverse[frontiers.center - 1]).toBe(0);
    expect(frontiers.forward[outsideActiveInterval]).toBe(encodeFrontierCoordinate(5));

    frontiers.forward[outsideActiveInterval] = 0;
    const reused = prepareFrontiers(workspace, INITIAL_FRONTIER_DISTANCE);
    expect(reused.forward).toBe(originalForward);
    expect(reused.reverse).toBe(originalReverse);
    expect(reused.forward[reused.center + 1]).toBe(encodeFrontierCoordinate(0));
    expect(reused.reverse[reused.center + 1]).toBe(encodeFrontierCoordinate(0));
  });

  it('keeps one grow-only KMP prefix table and resets its base entry', () => {
    const workspace = createMyersWorkspace();
    const first = getPrefixTable(workspace, 4);
    first.fill(3);

    const reused = getPrefixTable(workspace, 2);
    expect(reused).toBe(first);
    expect(reused[0]).toBe(0);

    const grown = getPrefixTable(workspace, 8);
    expect(grown).not.toBe(first);
    expect(grown.length).toBe(8);
    expect(grown[0]).toBe(0);
    expect(getPrefixTable(workspace, 6)).toBe(grown);
  });
});
