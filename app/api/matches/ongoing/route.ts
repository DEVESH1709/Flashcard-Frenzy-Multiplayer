import { connectToDatabase } from '../../../../lib/mongodb';
import { createClient } from '@supabase/supabase-js';
import { NextResponse, NextRequest } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export async function GET(request: NextRequest) {
  try {
    const db = await connectToDatabase();
    const matchesCol = db.collection('matches');

    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ match: null }, { status: 200 });
    }

    const token = authHeader.split(' ')[1];
    let user: any = null;
    try {
      const result = await supabase.auth.getUser(token);
      user = result.data?.user ?? null;
      if (result.error) {
        console.error('Auth error:', result.error);
      }
    } catch (err) {
      return NextResponse.json({ match: null }, { status: 200 });
    }

    if (!user) {
      return NextResponse.json({ match: null }, { status: 200 });
    }

    const ongoingMatch = await matchesCol.findOne({
      'players.id': user.id,
      status: 'ongoing'
    });

    if (!ongoingMatch) {
      return NextResponse.json(
        { match: null },
        { status: 200 }
      );
    }

    const match = {
      ...ongoingMatch,
      _id: ongoingMatch._id.toString()
    };

    return NextResponse.json(
      { match },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error fetching ongoing match:', error);
    return NextResponse.json(
      { error: 'Failed to fetch ongoing match' },
      { status: 500 }
    );
  }
}

export const dynamic = 'force-dynamic';
