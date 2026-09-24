"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";

/** QR to a room's captions page: scan, pick a language, read. No app, no login. */
export function RoomQr({ url, size = 160 }: { url: string; size?: number }) {
  const [src, setSrc] = useState<string>();

  useEffect(() => {
    if (!url) return;
    QRCode.toDataURL(url, { width: size * 2, margin: 1, color: { dark: "#09090b", light: "#ffffff" } }).then(setSrc);
  }, [url, size]);

  if (!src) return <div style={{ width: size, height: size }} className="rounded-lg bg-zinc-800" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} width={size} height={size} alt={`Código QR: ${url}`} className="rounded-lg" />;
}
