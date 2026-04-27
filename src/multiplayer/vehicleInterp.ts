// Render-time helpers for vehicle pose interpolation. Mirrors the playerside
// pattern: render 100ms behind real-time so we always have two samples to
// lerp between. Re-exported here so consumers don't pull in the full
// remoteVehiclesStore module just for the constant.

export { readInterpolatedVehicle } from './remoteVehiclesStore';
import { serverNow } from './clock';

export const INTERP_DELAY_MS_VEHICLE = 100;

export function vehicleRenderTime(): number {
  return serverNow() - INTERP_DELAY_MS_VEHICLE;
}
