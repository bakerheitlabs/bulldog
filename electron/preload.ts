import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('bulldogMP', {
  available: true,
});
