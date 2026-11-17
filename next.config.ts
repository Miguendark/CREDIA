import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Permite probar el dev server desde el teléfono en la misma red Wi-Fi
  // (http://172.20.10.2:3000). Sin esto, Next.js bloquea los Server Actions
  // (login, crear préstamo, pagos, etc.) por venir de un origen distinto a localhost.
  allowedDevOrigins: ["172.20.10.2"],
};

export default nextConfig;
