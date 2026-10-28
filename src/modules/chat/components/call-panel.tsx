"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Mic, MicOff, Phone, PhoneOff, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CallState } from "@/modules/chat/client/calls";
import { usePresence } from "@/modules/chat/client/hooks";
import { useChatClient } from "@/modules/chat/client/provider";
import { UserAvatar } from "@/modules/chat/components/presence";
import { callDuration, fullName } from "@/modules/chat/format";
import type { UserRef } from "@/modules/chat/types";
import { cn } from "@/lib/utils";

export function useCall<T>(selector: (s: CallState) => T): T {
  const { calls } = useChatClient();
  const get = () => selector(calls.store.getState());
  return useSyncExternalStore(calls.store.subscribe, get, get);
}

/**
 * დარეკვის ღილაკი (საუბრის სათაური, საუბრების და თანამშრომლების სია). აქტიურზე — მწვანე; გასულზე / მიმდინარე
 * ზარისას — გამორთულია.
 */
export function CallButton({ user, className }: { user: UserRef; className?: string }) {
  const { calls } = useChatClient();
  const presence = usePresence(user.id);
  const busy = useCall((s) => s.phase !== "idle");
  const offline = presence.status === "offline";
  const online = presence.status === "online" && !busy;
  const name = fullName(user);
  const title = offline ? `${name} სისტემაში არ არის` : busy ? "ზარი უკვე მიმდინარეობს" : `დარეკვა — ${name}`;
  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn(className, online && "text-emerald-600 hover:text-emerald-700 dark:text-emerald-500 dark:hover:text-emerald-400")}
      disabled={offline || busy}
      onClick={() => void calls.call(user)}
      aria-label={title}
      title={title}
    >
      <Phone />
    </Button>
  );
}

function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(t);
  }, []);
  return <span className="tabular-nums">{callDuration((now - since) / 1000)}</span>;
}

const STATUS: Record<Exclude<CallState["phase"], "idle">, string> = {
  outgoing: "ირეკება...",
  incoming: "შემომავალი ზარი",
  connecting: "კავშირი მყარდება...",
  active: "",
};

/** მიმდინარე ზარის ფანჯარა (layout-ში, ყველა გვერდზე; ქვემოთ — toast-ები ზემოთაა და არ ფარავს): პასუხი / უარყოფა, მიკროფონი, გათიშვა. */
export function CallPanel() {
  const { calls } = useChatClient();
  const call = useCall((s) => s);
  if (call.phase === "idle" || !call.peer) return null;
  const ringing = call.phase === "incoming" || call.phase === "outgoing";

  return (
    <div
      role={call.phase === "incoming" ? "alertdialog" : "status"}
      aria-label={`${STATUS[call.phase] || "ზარი"}: ${fullName(call.peer)}`}
      className="fixed bottom-6 left-1/2 z-[60] flex w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 items-center gap-3 rounded-2xl border bg-popover p-3 text-popover-foreground shadow-lg"
    >
      <span className={cn("relative rounded-full", ringing && "after:absolute after:inset-0 after:animate-ping after:rounded-full after:bg-emerald-500/30")}>
        <UserAvatar user={call.peer} />
      </span>
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate text-sm font-semibold">{fullName(call.peer)}</span>
        <span className="block text-xs text-muted-foreground">
          {call.reconnecting ? "კავშირი აღდგება..." : call.phase === "active" && call.startedAt ? <Elapsed since={call.startedAt} /> : STATUS[call.phase]}
          {call.muted && " · მიკროფონი გამორთულია"}
        </span>
      </span>
      {call.phase === "incoming" ? (
        <>
          <Button size="icon-lg" className="rounded-full bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => void calls.accept()} aria-label="პასუხი" title="პასუხი">
            <Phone />
          </Button>
          <Button size="icon-lg" className="rounded-full bg-red-600 text-white hover:bg-red-700" onClick={() => calls.decline()} aria-label="უარყოფა" title="უარყოფა">
            <PhoneOff />
          </Button>
        </>
      ) : (
        <>
          {call.audioBlocked && (
            <Button
              size="icon-lg"
              className="rounded-full bg-amber-500 text-white hover:bg-amber-600"
              onClick={() => calls.resumeAudio()}
              aria-label="ხმის ჩართვა — ბრაუზერმა ხმა დაბლოკა"
              title="ხმის ჩართვა"
            >
              <Volume2 />
            </Button>
          )}
          {call.phase !== "outgoing" && (
            <Button
              size="icon-lg"
              variant={call.muted ? "secondary" : "outline"}
              className="rounded-full"
              onClick={() => calls.toggleMute()}
              aria-pressed={call.muted}
              aria-label={call.muted ? "მიკროფონის ჩართვა" : "მიკროფონის გამორთვა"}
              title={call.muted ? "მიკროფონის ჩართვა" : "მიკროფონის გამორთვა"}
            >
              {call.muted ? <MicOff /> : <Mic />}
            </Button>
          )}
          <Button size="icon-lg" className="rounded-full bg-red-600 text-white hover:bg-red-700" onClick={() => calls.hangup()} aria-label="გათიშვა" title="გათიშვა">
            <PhoneOff />
          </Button>
        </>
      )}
    </div>
  );
}
