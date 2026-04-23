"use client";

import { useEffect, useState } from "react";

const defaultMessages = [
  "SYS.UPTIME: 847:23:09",
  "SIGNAL.SCAN: monitoring 47 frequencies",
  "NET.STATUS: all nodes operational",
  "QUEUE.CHECK: 3 transmissions pending",
  "SECURITY.SCAN: perimeter clear",
  "DATA.SYNC: network database up to date",
  "BROADCAST.READY: awaiting signal",
  "NODE.PING: latency 12ms",
  "ARCHIVE.STATUS: 142 entries cataloged",
  "FREQ.MONITOR: no interference detected",
  "MEM.ALLOC: 64MB / 256MB used",
  "CONN.ACTIVE: 23 listeners connected",
  "STREAM.BUFFER: optimal",
  "AUTH.LOG: last access 2m ago",
  "DISK.IO: write cache flushed",
];

/**
 * A cycling system ticker that shows random "system messages".
 * Creates the feeling of a live, active backend.
 */
export function SystemTicker({
  messages = defaultMessages,
  className = "",
  interval = 5000,
}: {
  messages?: string[];
  className?: string;
  interval?: number;
}) {
  const [current, setCurrent] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setCurrent((prev) => {
          // Pick a random message, but not the same one
          let next;
          do {
            next = Math.floor(Math.random() * messages.length);
          } while (next === prev && messages.length > 1);
          return next;
        });
        setVisible(true);
      }, 300);
    }, interval);

    return () => clearInterval(timer);
  }, [interval, messages.length]);

  return (
    <div className={`font-mono overflow-hidden ${className}`}>
      <span
        className={`inline-block transition-all duration-300 ${
          visible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2"
        }`}
      >
        <span className="text-accent/40">▸</span>{" "}
        <span className="text-muted/60">{messages[current]}</span>
      </span>
    </div>
  );
}