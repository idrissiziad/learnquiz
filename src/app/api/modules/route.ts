import { NextResponse } from 'next/server';
import { listModules } from '@/lib/storage';

export async function GET() {
  try {
    const modules = await listModules();
    return NextResponse.json({ success: true, modules }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}