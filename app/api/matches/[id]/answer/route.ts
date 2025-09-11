import type { NextRequest } from 'next/server';
import {connectToDatabase} from '../../../../../lib/mongodb';
import { ObjectId } from 'mongodb';
import { createClient } from '@supabase/supabase-js';

export async function POST(
  request: NextRequest,
  context: { params: { id: string } }
) {
  const matchId = context.params.id;
  const { userId, answer } = await request.json();
  const db = await connectToDatabase();
  const matchesCol = db.collection('matches');

  const match = await matchesCol.findOne({ _id: new ObjectId(matchId) });
  if (!match || match.status === 'finished') {
    return Response.json({ error: 'Match not found or already finished' }, { status: 400 });
  }

  const currIndex = match.currentQuestion || 0;
  const flashcard = match.questions[currIndex];
  
  if (!flashcard) {
    return Response.json({ error: 'Question not found' }, { status: 400 });
  }
  const normalize = (str: string) => 
    str.toString()
       .toLowerCase()
       .trim()
       .replace(/[^\w\s]/g, '')  
       .replace(/\s+/g, ' ');    
  
  const currentScores = { ...match.scores };
  const currentQuestionAnswers = match.currentQuestionAnswers || {};
  let allPlayersAnswered = false;
  
  const correctAnswer = normalize(flashcard.answer);
  const userAnswer = normalize(answer);
  const isAnswerCorrect = correctAnswer === userAnswer;
  
  console.log('Answer check:', {
    question: flashcard.question,
    correctAnswer,
    userAnswer,
    isCorrect: isAnswerCorrect
  });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  if (isAnswerCorrect && match.status === 'ongoing') {
    currentScores[userId] = (currentScores[userId] || 0) + 1;
  }

  currentQuestionAnswers[userId] = answer;
  
  const playerIds = match.players?.map((p: { id: string }) => p?.id?.toString()).filter(Boolean) || [];
  
  const answeredBy = Object.keys(currentQuestionAnswers);
  

  allPlayersAnswered = playerIds.length > 0 && 
    playerIds.every((id: string) => answeredBy.includes(id));

  if (allPlayersAnswered) {
    console.log('All players have answered!');
  }
    
  console.log('\n--- DEBUG: Answer Submission ---');
  console.log('Current question index:', match.currentQuestion);
  console.log('Question:', match.questions[match.currentQuestion]?.question);
  console.log('Submitted answer by user:', userId, 'Answer:', answer);
  console.log('All player IDs:', playerIds);
  console.log('Answered by:', answeredBy);
  console.log('All players answered:', allPlayersAnswered);
  console.log('Current scores:', match.scores);
  console.log('Match status:', match.status);
  console.log('Current question answers:', currentQuestionAnswers);
  console.log('---\n');

  const updateData: {
    $set: Record<string, unknown>;
    $inc: Record<string, number>;
  } = {
    $set: {
      scores: currentScores,
      lastUpdated: new Date(),
      currentQuestionAnswers: currentQuestionAnswers,
      answeredBy: answeredBy
    },
    $inc: { 
      [isAnswerCorrect ? 'correctAnswers' : 'wrongAnswers']: 1
    }
  };

  if (allPlayersAnswered) {
    const nextQuestionIndex = (match.currentQuestion || 0) + 1;
    const isLastQuestion = nextQuestionIndex >= match.questions.length;
    
    updateData.$set.currentQuestion = nextQuestionIndex;
    updateData.$set.currentQuestionAnswers = {}; 
    updateData.$set.answeredBy = []; 
    
    if (isLastQuestion) {
      updateData.$set.status = 'finished';
      
      const scores = { ...currentScores };
      const winner = Object.entries(scores).sort((a, b) => (b[1] as number) - (a[1] as number))[0];
      if (winner) {
  const winnerPlayer = match.players.find((p: { id: string }) => p.id === winner[0]);
        if (winnerPlayer) {
          updateData.$set.winner = winnerPlayer.email;
        }
      }
      
      updateData.$set.scores = scores;
    }
  }

  try {
    const updateResult = await matchesCol.updateOne(
      { _id: new ObjectId(matchId) },
      updateData
    );
    
    console.log('Update result:', updateResult);
    const updatedMatch = await matchesCol.findOne({ _id: new ObjectId(matchId) });
    console.log('Updated match:', updatedMatch);

    if (allPlayersAnswered) {
      const nextQuestionIndex = (match.currentQuestion || 0) + 1;
      const isLastQuestion = nextQuestionIndex >= match.questions.length;
      
      if (!isLastQuestion) {
        const nextQuestion = match.questions[nextQuestionIndex];
        console.log('Broadcasting new question:', nextQuestion);
        const broadcastResult = await supabase.channel(`match:${matchId}`).send({
          type: 'broadcast',
          event: 'new-question',
          payload: {
            question: nextQuestion.question,
            questionNumber: nextQuestionIndex + 1,
            totalQuestions: match.questions.length,
            currentQuestion: nextQuestionIndex
          }
        });
        console.log('Broadcast result:', broadcastResult);
        } else {
          const scores: Record<string, number> = (updateData.$set.scores && typeof updateData.$set.scores === 'object') ? updateData.$set.scores as Record<string, number> : {};
          const players = match.players || [];
          const winnerInfo: { email: string; scores: Record<string, number> } = { email: 'Draw', scores };
          
          const winnerEntry = Object.entries(scores).sort((a, b) => (b[1] as number) - (a[1] as number))[0];
          if (winnerEntry) {
            const winnerPlayer = players.find((p: { id: string }) => p.id === winnerEntry[0]);
            if (winnerPlayer) {
              winnerInfo.email = winnerPlayer.email;
            }
          }
          
          await supabase.channel(`match:${matchId}`).send({
            type: 'broadcast',
            event: 'game-finished',
            payload: winnerInfo
          });
        }
      }
    } catch (error) {
      console.error('Error updating match:', error);
      return Response.json({ 
        success: false, 
        error: 'Failed to update match',
        message: error instanceof Error ? error.message : 'Unknown error occurred'
      }, { status: 500 });
    }
    const responseData = {
      success: true,
      correct: isAnswerCorrect,
      scores: currentScores,
      message: isAnswerCorrect ? 'Correct answer!' : 'Incorrect answer',
      _debug: process.env.NODE_ENV === 'development' ? {
        question: flashcard.question,
        correctAnswer: flashcard.answer,
        userAnswer: answer,
        normalized: {
          correctAnswer: correctAnswer,
          userAnswer: userAnswer
        },
        scores: currentScores,
        allPlayersAnswered,
        answeredBy: Object.keys(currentQuestionAnswers),
        totalPlayers: match.players?.length || 0
      } : undefined
    };

    console.log('Sending response:', responseData);
    return Response.json(responseData);
  }
