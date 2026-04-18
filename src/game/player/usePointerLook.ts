import { useEffect } from 'react';
import { useSettingsStore } from '@/state/settingsStore';
import { cameraState, PITCH_MAX, PITCH_MIN } from './cameraState';

const BASE_SENS = 0.0025;

export function usePointerLook(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;

    const onMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement == null) return;
      const sens = useSettingsStore.getState().mouseSensitivity * BASE_SENS;
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

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('click', onClick);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('click', onClick);
    };
  }, [enabled]);
}
