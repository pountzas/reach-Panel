import { PixelRatio, Platform } from 'react-native';
import * as Device from 'expo-device';

/** Smallest physical screen edge (dp) below which we treat the device as a phone. */
const MIN_TABLET_SHORTEST_SIDE_DP = 600;

export type TabletGateResult =
  | { allowed: true }
  | { allowed: false; reason: string };

/**
 * Tablet-only gate: prefer expo-device tablet flag, fall back to shortest-side heuristic.
 */
export function evaluateTabletGate(
  windowWidth: number,
  windowHeight: number,
): TabletGateResult {
  if (Platform.OS === 'web') {
    return { allowed: true };
  }

  if (Device.deviceType === Device.DeviceType.TABLET) {
    return { allowed: true };
  }

  const shortest = Math.min(windowWidth, windowHeight);
  // Normalize for font scale quirks — use layout dp already from Dimensions.
  const shortestDp = shortest / Math.max(PixelRatio.getFontScale(), 1);

  if (shortestDp >= MIN_TABLET_SHORTEST_SIDE_DP) {
    return { allowed: true };
  }

  if (Device.deviceType === Device.DeviceType.PHONE) {
    return {
      allowed: false,
      reason: 'ReachPanel Companion is designed for tablets only.',
    };
  }

  // Unknown device type with phone-sized screen
  if (shortestDp < MIN_TABLET_SHORTEST_SIDE_DP) {
    return {
      allowed: false,
      reason: 'This screen is too small. Please use a tablet.',
    };
  }

  return { allowed: true };
}
