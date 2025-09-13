import type { NextRequest } from 'next/server';
import { connectToDatabase } from '../../../lib/mongodb';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export async function POST(request: NextRequest) {
  const isDev = process.env.NODE_ENV !== 'production';
  const debug: Record<string, unknown> = {};
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  let clientBody: Record<string, unknown> = {};
  try {
    clientBody = await request.json();
    console.log('POST /api/matches: client body:', clientBody);
  } catch {
    clientBody = {};
  }

  console.log('POST /api/matches: headers:', JSON.stringify([...request.headers.entries()]));

  try {
    console.log('POST /api/matches: Authorization header present?', !!authHeader);
    console.log('POST /api/matches: token present?', !!token);
  } catch (logErr) {
    console.error('Error logging auth header/token presence:', logErr);
  }

  if (!token) {
    console.error('POST /api/matches: No token provided');
    return new Response(JSON.stringify({ error: 'Not authenticated' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  let user: { id: string } | null = null;
  try {
    const result = await supabase.auth.getUser(token);
    console.log('POST /api/matches: supabase.auth.getUser result:', JSON.stringify(result));
    if (result.error || !result.data?.user) {
      console.warn('supabase.getUser returned no user or error:', result.error);
      return new Response(JSON.stringify({ error: 'Not authenticated' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    user = result.data.user;
  } catch (supabaseErr) {
    console.error('Error calling supabase.auth.getUser:', supabaseErr);
    if (process.env.NODE_ENV !== 'production' && clientBody?.userId) {
      console.warn('Supabase unreachable; using client-provided userId for local development. This is insecure and only for dev.');
  user = { id: String(clientBody.userId) };
    } else {
      return new Response(JSON.stringify({ error: 'Auth provider unreachable', details: String(supabaseErr) }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  if (!user) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  const userId = user.id;
  const db = await connectToDatabase();
  const waitingCol = db.collection('waiting');
  const matchesCol = db.collection('matches');

  const waitingDocs = await waitingCol.find({}).toArray();
  console.log('POST /api/matches: waiting collection before pairing:', waitingDocs.map(d => ({ userId: d.userId, joinedAt: d.joinedAt })));

  const staleThreshold = new Date(Date.now() - 2 * 60 * 1000);
  await waitingCol.deleteMany({ joinedAt: { $lt: staleThreshold } });

  try {
    const waitingBefore = await waitingCol.find({}).toArray();
    debug.waitingBefore = waitingBefore.map((d) => ({ userId: d.userId, joinedAt: d.joinedAt, _id: d._id }));
    console.log('Waiting documents before findOneAndDelete:', JSON.stringify(debug.waitingBefore));
  } catch (listErr) {
    console.error('Error listing waiting docs before findOneAndDelete:', listErr);
    debug.waitingBeforeError = String(listErr);
  }

  let partner: { value?: { userId: string; _id: unknown } } | null = null;
  try {
    partner = await waitingCol.findOneAndDelete(
      { userId: { $ne: userId } },
      { sort: { joinedAt: 1 } }
    ) as { value?: { userId: string; _id: unknown } };
    debug.findOneAndDelete = partner?.value ? { userId: partner.value.userId, _id: partner.value._id } : null;
    console.log('findOneAndDelete partner result:', debug.findOneAndDelete);
  } catch (fErr) {
    console.error('Error in findOneAndDelete:', fErr);
    debug.findOneAndDeleteError = String(fErr);
  }

  if (partner && partner.value) {
    const player1 = partner.value.userId;
    const player2 = userId;
    const flashcards = await db.collection('flashcards').aggregate([{ $sample: { size: 5 } }]).toArray();
    const newMatch = {
      players: [
        { id: player1, email: '' },
        { id: player2, email: '' }
      ],
     scores: { [player1]: 0, [player2]: 0 },
      questions: flashcards,
      currentQuestion: 0,
      status: 'ongoing',
      hostId: player1,
      winnerEmail: '',
      createdAt: new Date()
    };
    const result = await matchesCol.insertOne(newMatch);
    debug.matchCreated = { players: [player1, player2], insertedId: result.insertedId?.toString?.() };
    console.log(`Created new match for players ${player1} and ${player2}, insertedId=${result.insertedId}`);
    try {
      const userEmails = await db.collection('users').find({ id: { $in: [player1, player2] } }).toArray();
  const emailMap: { [key: string]: string } = {};
      userEmails.forEach((u) => {
        const userDoc = u as unknown as { id: string; email: string };
        emailMap[userDoc.id] = userDoc.email;
      });
      await matchesCol.updateOne(
        { _id: result.insertedId },
        {
          $set: {
            'players.0.email': emailMap[player1] || '',
            'players.1.email': emailMap[player2] || '',
          },
        },
      );
    } catch (emailErr) {
      console.error('Error updating player emails:', emailErr);
    }
    try {
      const cleaned = await waitingCol.deleteMany({ userId: { $in: [player1, player2] } });
      debug.cleanedWaiting = { deletedCount: cleaned.deletedCount };
      console.log(`Cleaned waiting entries for players ${player1}, ${player2}`, cleaned.deletedCount);
    } catch (cleanupErr) {
      console.error('Error cleaning waiting entries:', cleanupErr);
      debug.cleanedWaitingError = String(cleanupErr);
    }
    const baseResponse: Record<string, unknown> = { matchId: result.insertedId ? result.insertedId.toString() : undefined, status: 'match_created' };
    if (isDev) baseResponse.debug = debug;
    return Response.json(baseResponse);
  }

  console.log('POST /api/matches: No partner found, upserting user into waiting collection:', userId);
  try {
    const upsertResult = await waitingCol.updateOne(
      { userId },
      { $setOnInsert: { userId, joinedAt: new Date() } },
      { upsert: true }
    );
    debug.upsertResult = upsertResult;
    console.log(`Upsert waiting result for ${userId}:`, JSON.stringify(upsertResult));
  } catch (upErr) {
    console.error('Error upserting waiting entry:', upErr);
    debug.upsertError = String(upErr);
  }
  try {
    const afterInsertDocs = await waitingCol.find({}).toArray();
    debug.waitingAfter = afterInsertDocs.map((d) => ({ userId: d.userId, joinedAt: d.joinedAt, _id: d._id }));
    console.log('POST /api/matches: Waiting documents after upsert:', debug.waitingAfter);
  } catch (listErr) {
    console.error('Error listing waiting docs after upsert:', listErr);
    debug.waitingAfterError = String(listErr);
  }
  const waitingCountVal = await waitingCol.countDocuments({ userId: { $ne: userId } });
  const baseWaitingResponseVal: Record<string, unknown> = { status: 'waiting', waitingCount: waitingCountVal };
  if (isDev) baseWaitingResponseVal.debug = debug;
  return Response.json(baseWaitingResponseVal);
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const userId = url.searchParams.get('userId');
  console.log('GET /api/matches called with userId=', userId);
  const db = await connectToDatabase();
  if (userId) {
    const rawMatches = await db
      .collection('matches')
      .find({ "players.id": userId })
      .toArray();
    const matches = rawMatches.map((m) => ({
      ...m,
      _id: m._id ? m._id.toString() : m._id
    }));
    return Response.json({ matches });
  }
  return Response.json({ matches: [] });
}

export async function DELETE(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    if (!token) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }

    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }

    const userId = user.id;
    const db = await connectToDatabase();
    const waitingCol = db.collection('waiting');

    const delRes = await waitingCol.deleteMany({ userId });
    return new Response(JSON.stringify({ deletedCount: delRes.deletedCount }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('Error in DELETE /api/matches:', err);
    return new Response(JSON.stringify({ error: 'Failed to cancel waiting' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
