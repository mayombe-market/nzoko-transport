"use client";

import { useEffect, useState } from "react";

// Compte à rebours du blocage des sièges
export function HoldTimer({ expiresAt, onExpire }: { expiresAt: string | null; onExpire?: () => void }) {
  const [left, setLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!expiresAt) {
      setLeft(null);
      return;
    }
    const tick = () => {
      const ms = new Date(expiresAt).getTime() - Date.now();
      setLeft(Math.max(0, Math.floor(ms / 1000)));
      if (ms <= 0) onExpire?.();
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt, onExpire]);

  if (left === null) return null;
  const mm = String(Math.floor(left / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");
  return (
    <div className={`rounded-lg px-3 py-2 text-sm font-medium ${left < 120 ? "bg-red-50 text-red-700 border border-red-200" : "bg-accent-50 text-accent-900 border border-accent-200"}`}>
      ⏱ Sièges réservés pour vous pendant <span className="font-mono font-bold">{mm}:{ss}</span>
    </div>
  );
}
