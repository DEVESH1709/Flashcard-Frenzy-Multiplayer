import type { NextRequest } from 'next/server';
import { connectToDatabase } from '../../../../lib/mongodb';
import { ObjectId } from 'mongodb'

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
  const { id: matchId } = await context.params;
    console.log('Fetching match with ID:', matchId);

    if (!matchId || typeof matchId !== 'string' || !/^[a-fA-F0-9]{24}$/.test(matchId)) {
      return Response.json({ error: 'Invalid match ID' }, { status: 400 });
    }

    const db = await connectToDatabase();
    const match = await db
      .collection("matches")
      .findOne({ _id: new ObjectId(matchId) });

    if (!match) {
      console.log('No match found with ID:', matchId);
      return Response.json({ error: 'Match not found' }, { status: 404 });
    }

    console.log('Match found. Questions field exists:', 'questions' in match);
    if ('questions' in match) {
      console.log('Questions array length:', match.questions?.length || 0);
    }

    return Response.json({ match });
  } catch (error) {
    console.error('Error in GET /api/matches/[id]:', error);
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
