import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    URL: process.env.UPSTASH_KV_REST_API_URL || "MISSING_URL",
    TOKEN: process.env.UPSTASH_KV_REST_API_TOKEN ? process.env.UPSTASH_KV_REST_API_TOKEN.slice(0, 10) + "..." : "MISSING_TOKEN",
  });
}
