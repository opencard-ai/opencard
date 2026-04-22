import { NextRequest, NextResponse } from 'next/server';
import { redis, USER_PREFIX } from '@/lib/redis';
import { hashEmail } from '@/lib/email-hash';

export async function POST(req: NextRequest) {
  try {
    const { email, card_id, month, year } = await req.json();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
    }
    if (!card_id) {
      return NextResponse.json({ error: 'card_id required' }, { status: 400 });
    }
    if (month === undefined || !year) {
      return NextResponse.json({ error: 'month and year required' }, { status: 400 });
    }

    const emailHash = await hashEmail(email.toLowerCase().trim());
    const openDatesKey = `${USER_PREFIX}${emailHash}:open_dates`;
    
    const existing = await redis.hget(openDatesKey, 'dates') as string | null;
    const dates = existing ? JSON.parse(existing) : {};
    
    dates[card_id] = { month: Number(month), year: Number(year), updated_at: Date.now() };
    
    await redis.hset(openDatesKey, { dates: JSON.stringify(dates) });

    return NextResponse.json({ success: true, card_id, month, year });
  } catch (err) {
    console.error('set-open-date error:', err);
    return NextResponse.json({ error: 'Failed to set open date' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const email = searchParams.get('email');

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
    }

    const emailHash = await hashEmail(email.toLowerCase().trim());
    const openDatesKey = `${USER_PREFIX}${emailHash}:open_dates`;
    
    const existing = await redis.hget(openDatesKey, 'dates') as string | null;
    const dates = existing ? JSON.parse(existing) : {};

    return NextResponse.json({ open_dates: dates });
  } catch (err) {
    console.error('get-open-dates error:', err);
    return NextResponse.json({ error: 'Failed to fetch open dates' }, { status: 500 });
  }
}
