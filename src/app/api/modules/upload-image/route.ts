import { NextResponse } from 'next/server';
import { errMsg } from '@/lib/module-config';

const MAX_BYTES = 1_500_000; // 1.5 MB — keep question JSON reasonably sized for storage

const ALLOWED = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
]);

const TYPE_TO_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
};

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error: 'No file uploaded.' }, { status: 400 });
    }

    if (file.size === 0) {
      return NextResponse.json({ success: false, error: 'Uploaded file is empty.' }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { success: false, error: `File too large (max ${Math.round(MAX_BYTES / 1024)} KB).` },
        { status: 413 }
      );
    }

    const type = (file.type || '').toLowerCase();
    if (!ALLOWED.has(type)) {
      return NextResponse.json({ success: false, error: 'Unsupported file type.' }, { status: 415 });
    }

    const ext = TYPE_TO_EXT[type] || 'bin';
    const bytes = Buffer.from(await file.arrayBuffer());
    const base64 = bytes.toString('base64');
    const dataUrl = `data:${type};base64,${base64}`;

    void ext;

    return NextResponse.json({
      success: true,
      path: dataUrl,
      url: dataUrl,
      originalName: file.name,
      size: file.size,
    });
  } catch (e) {
    return NextResponse.json({ success: false, error: errMsg(e) }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true });
}