// No-op realtime adapter. Replace with a WS / Server-Sent-Events adapter in
// src/lib/adapters/realtime.ts when the channel layer lands.

import type { RealtimePort } from "@/types/ports";

export class NoopRealtimeAdapter implements RealtimePort {
  async publish(_channel: string, _payload: unknown): Promise<void> {
    // intentionally empty
  }
}
