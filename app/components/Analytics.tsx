"use client";

import { useEffect } from "react";
import { inject } from "@vercel/analytics";

export default function Analytics() {
  useEffect(() => {
    inject();
  }, []);

  return null;
}
