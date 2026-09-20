// Process-wide lifecycle flags shared between the server entry point
// (which drives them) and the HTTP routes (which report them). Stored on
// globalThis so dev/HMR does not split them across module instances.

const globalForLifecycle = globalThis as typeof globalThis & {
  __villageDraining?: boolean;
};

/** Mark the process as draining (shutdown in progress). */
export function setDraining(value: boolean): void {
  globalForLifecycle.__villageDraining = value;
}

/** True once SIGTERM/SIGINT has been received and the process is draining. */
export function isDraining(): boolean {
  return globalForLifecycle.__villageDraining === true;
}
