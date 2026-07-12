import { useEffect, useState } from 'react';

function utcNow(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`;
}

/** Live UTC wall clock shown in the nav meta (parity with the legacy data-clock). */
export function LiveClock() {
  const [time, setTime] = useState<string>('00:00:00 UTC');
  useEffect(() => {
    setTime(utcNow());
    const id = window.setInterval(() => setTime(utcNow()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return (
    <span className="mono" data-clock aria-label="Current time, UTC">
      {time}
    </span>
  );
}
