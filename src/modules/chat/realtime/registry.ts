import type { Server } from "socket.io";
import type { PresenceStore } from "@/modules/chat/realtime/presence-store";
import type { ClientToServerEvents, ServerToClientEvents } from "@/modules/chat/types";

/**
 * Socket.IO სერვერი იქმნება server.ts-ში (tsx), Route Handler-ები კი Next-ის bundle-შია — მოდულები სხვადასხვაა,
 * პროცესი ერთი. ამიტომ instance globalThis-ით გადაეცემა. `next dev`-ით (server.ts-ის გარეშე) — null, ემიტი არაფერს აკეთებს.
 */

export type SocketData = { userId: number; sid: string | null; expiresAt: number };

export type ChatServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

const KEY = Symbol.for("clinic-soft.chat.server");
const PRESENCE_KEY = Symbol.for("clinic-soft.chat.presence");

type GlobalWithChat = typeof globalThis & { [KEY]?: ChatServer; [PRESENCE_KEY]?: PresenceStore };

export function setChatServer(io: ChatServer, presence: PresenceStore) {
  (globalThis as GlobalWithChat)[KEY] = io;
  (globalThis as GlobalWithChat)[PRESENCE_KEY] = presence;
}

export function chatServer(): ChatServer | null {
  return (globalThis as GlobalWithChat)[KEY] ?? null;
}

/** სტატუსები მეხსიერებაში (realtime/presence-store.ts); სოკეტ-სერვერის გარეშე — null (ყველა „გასულია“). */
export function chatPresence(): PresenceStore | null {
  return (globalThis as GlobalWithChat)[PRESENCE_KEY] ?? null;
}

/** ოთახები: მომხმარებლის ყველა ტაბი / ერთი შესვლის (სესიის) ტაბები / საუბრის მონაწილეები. */
export const userRoom = (userId: number) => `user:${userId}`;
export const sessionRoom = (sid: string) => `session:${sid}`;
export const conversationRoom = (conversationId: number) => `conv:${conversationId}`;
