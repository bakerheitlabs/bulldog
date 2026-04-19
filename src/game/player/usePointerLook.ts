import { useEffect } from 'react';
import { useSettingsStore } from '@/state/settingsStore';
import {
  cameraState,
  ORBIT_PITCH_MAX,
  ORBIT_PITCH_MIN,
  PITCH_MAX,
  PITCH_MIN,
} from './cameraState';

const BASE_SENS = 0.0025;

export function usePointerLook(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;

    const onMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement == null) return;
      const sens = useSettingsStore.getState().mouseSensitivity * BASE_SENS;
      if (cameraState.orbiting) {
        cameraState.orbitYaw -= e.movementX * sens;
        cameraState.orbitPitch -= e.movementY * sens;
        if (cameraState.orbitPitch < ORBIT_PITCH_MIN) cameraState.orbitPitch = ORBIT_PITCH_MIN;
        if (cameraState.orbitPitch > ORBIT_PITCH_MAX) cameraState.orbitPitch = ORBIT_PITCH_MAX;
        return;
      }
      cameraState.yaw -= e.movementX * sens;
      cameraState.pitch -= e.movementY * sens;
      if (cameraState.pitch < PITCH_MIN) cameraState.pitch = PITCH_MIN;
      if (cameraState.pitch > PITCH_MAX) cameraState.pitch = PITCH_MAX;
    };

    const onClick = () => {
      if (document.pointerLockElement == null) {
        document.body.requestPointerLock?.();
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'KeyC' && !e.repeat) cameraState.orbiting = true;
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'KeyC') cameraState.orbiting = false;
    };
    const onBlur = () => {
      cameraState.orbiting = false;
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('click', onClick);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('click', onClick);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      cameraState.orbiting = false;
    };
  }, [enabled]);
}
