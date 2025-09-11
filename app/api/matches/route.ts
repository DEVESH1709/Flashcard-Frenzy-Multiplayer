import type { NextRequest } from 'next/server';
import { connectToDatabase } from '../../../lib/mongodb';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const userId = user.id;
    const db = await connectToDatabase();
    const waitingCol = db.collection('waiting');
    const matchesCol = db.collection('matches');

  // Atomically find and remove the first waiting user
  const waiting = await waitingCol.findOneAndDelete({});
  if (!waiting || !waiting.value) {
    await waitingCol.insertOne({ userId, joinedAt: new Date() });
    return Response.json({ status: 'waiting' });
  }

  const player1 = waiting.value.userId;
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

  try {
    const userEmails = await db.collection('users').find({ 
      id: { $in: [player1, player2] } 
    }).toArray();
    
    const emailMap: Record<string, string> = {};
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
  } catch (error) {
    console.error('Error updating player emails:', error);
  }

  return Response.json({ 
    matchId: result.insertedId ? result.insertedId.toString() : undefined,
    status: 'match_created'
  });
  
  } catch (error) {
    console.error('Error in POST /api/matches:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to create match',
      details: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const userId = url.searchParams.get('userId');
  const db = await connectToDatabase();
  if (userId) {
    const matches = await db
      .collection('matches')
      .find({ "players.id": userId })
      .toArray();
    return Response.json({ matches });
  }
  return Response.json({ matches: [] });
}
