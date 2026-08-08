"use client";

import { Portal } from "@portalsdk/core";

// Construct once at module scope. Anonymous mode: just the publishable key,
// no token endpoint needed. Every visitor gets a stable anonymous identity.
const apiKey = process.env.NEXT_PUBLIC_PORTAL_KEY;

if (!apiKey) {
  // Surfaced in the browser console so setup mistakes are obvious.
  console.warn(
    "[pict-portal] NEXT_PUBLIC_PORTAL_KEY is not set. Copy .env.local.example to .env.local and add your pk_ key.",
  );
}

export const portal = new Portal({ apiKey: apiKey ?? "pk_missing" });
