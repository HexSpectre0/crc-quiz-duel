// middleware.js — allow the Vite frontend (different origin in dev) to call the API.
import { NextResponse } from 'next/server';

export function middleware(req) {
  // Handle preflight
  if (req.method === 'OPTIONS') {
    return new NextResponse(null, { status: 204, headers: corsHeaders() });
  }
  const res = NextResponse.next();
  for (const [k, v] of Object.entries(corsHeaders())) res.headers.set(k, v);
  return res;
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*', // tighten to your frontend origin in prod
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export const config = { matcher: '/api/:path*' };
