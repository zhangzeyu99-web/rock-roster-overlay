import type { RosterBridge } from "../../electron/preload";

declare global {
  const __APP_VERSION__: string;

  interface Window {
    roster?: RosterBridge;
    __ROSTER_SERVER_URL__?: string;
  }
}

export {};
