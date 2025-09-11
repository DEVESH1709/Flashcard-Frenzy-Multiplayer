'use client';

import { useRouter, useParams } from 'next/navigation';
import { supabase } from '../../../lib/supabaseClient';
import { useEffect, useRef, useState } from 'react';
import React from 'react';

type Question = {
  question: string;
  answer: string;
};

export default function MatchPage() {
  const router = useRouter();
  const { id: matchId } = useParams()!;
  const [userId, setUserId] = useState<string>('');
  const [question, setQuestion] = useState<string>('');
  const [answer, setAnswer] = useState<string>('');
  const [scores, setScores] = useState<{ [key: string]: number }>({});

  useEffect(() => {
    console.log('--- DEBUG: Scores State ---');
    console.log('Current userId:', userId);
    console.log('Scores object:', scores);
    
    if (userId) {
      const userScore = scores[userId];
      console.log(`Current user's score:`, userScore !== undefined ? userScore : 'Not set');

      console.log('All scores:', Object.entries(scores).map(([id, score]) => 
        `${id === userId ? '👉 ' : ''}${id}: ${score}${id === userId ? ' (You)' : ''}`
      ).join('\n'));
    }
  }, [scores, userId]);
  
  const testScoreUpdate = () => {
    console.log('--- Testing Score Update ---');
    console.log('Current scores:', scores);
    console.log('Current userId:', userId);

    const newScores = {
      ...scores,
      [userId]: (scores[userId] || 0) + 1
    };
    
    console.log('New scores:', newScores);
    setScores(newScores);
  };
  const [announcement, setAnnouncement] = useState<string>('');
  const [ended, setEnded] = useState<boolean>(false);
  const channelRef = useRef<any>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.push('/login');
      } else {
        setUserId(data.user.id);
      }
    });

    const channel = supabase.channel(`match:${matchId}`, {
      config: {
        broadcast: { 
          self: true,  
          ack: true    
        }
      }
    });

    channel
      .on('broadcast', { event: 'new-question' }, async (payload) => {
        console.log('Received new question:', payload);
        setQuestion(payload.payload.question);
        setAnswer('');
        setAnnouncement('');
        
        try {
          const response = await fetch(`/api/matches/${matchId}`, {
            cache: 'no-store',
            next: { revalidate: 0 }
          });
          const data = await response.json();
          
          if (data.match) {
            setScores(data.match.scores || {});
            
            // Make sure we're showing the correct question
            const currIndex = data.match.currentQuestion || 0;
            if (Array.isArray(data.match.questions) && data.match.questions[currIndex]) {
              const currentQ = data.match.questions[currIndex];
              setQuestion(currentQ.question || 'No question available');
            }
          }
        } catch (error) {
          console.error('Error fetching updated match state:', error);
        }
      })
      .on('broadcast', { event: 'game-finished' }, (payload) => {
        console.log('Game finished:', payload);
        setEnded(true);
        setAnnouncement(
          payload.payload.winner === 'Draw' 
            ? 'Game ended in a draw!' 
            : `Winner: ${payload.payload.winner}`
        );
        setScores(payload.payload.scores);
      })
      .subscribe();

    channel.subscribe((status, error) => {
      console.log('Channel status:', status);
      if (error) {
        console.error('Channel error:', error);
        return;
      }
      if (status === 'TIMED_OUT') {
        console.error('Channel connection timed out');
      } else if (status === 'CHANNEL_ERROR') {
        console.error('Channel error occurred');
      }
    });

    channelRef.current = channel;

    fetch(`/api/matches/${matchId}`)
      .then(res => res.json())
      .then(data => {
        console.log('Match data:', data); 
        if (!data.match) {
          setQuestion('No match found');
          setScores({});
          setAnnouncement('No match found.');
          return;
        }
        if (data.match.status === 'finished') {
          router.push('/dashboard');
        } else {
          const m = data.match;
          console.log('Match object:', JSON.stringify(m, null, 2)); 
          const currIndex = m.currentQuestion || 0;
          console.log('Current question index:', currIndex);
          console.log('Questions array length:', m.questions?.length || 0);
          console.log('Questions array first item:', m.questions?.[0] || 'No questions');
          console.log('Questions array full:', JSON.stringify(m.questions, null, 2));
          if (Array.isArray(m.questions) && m.questions[currIndex]) {
            const currentQ = m.questions[currIndex];
            setQuestion(currentQ.question || 'No question available');
          } else {
            setQuestion('No questions available');
          }
          setScores(m.scores);
          if (m.hostId === userId && currIndex === 0 && Array.isArray(m.questions) && m.questions[0]) {
            const firstQuestion = m.questions[0];
            channel.send({
              type: 'broadcast',
              event: 'new-question',
              payload: { question: firstQuestion.question || 'No question available' }
            });
          }
        }
      });

    return () => {
      channel.unsubscribe();
    };
  }, [matchId, userId]);
  const submitAnswer = async () => {
    if (!answer.trim() || !userId) return;

    try {
      setAnnouncement('Submitting answer...');
      
      const response = await fetch(`/api/matches/${matchId}/answer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId, answer }),
      });

      const result = await response.json();
      console.log('Answer submission result:', result);
      
      if (response.ok) {
        if (result.scores) {
          console.log('Updating scores:', result.scores);
          setScores(result.scores);
        }
        

        const feedback = result.correct ? 'Correct! ' : 'Incorrect! ';
        setAnnouncement(feedback + (result.message || ''));
        setAnswer('');
        if (result.allPlayersAnswered) {
          setAnnouncement('Waiting for next question...');
        }
        if (!result.allPlayersAnswered) {
          setTimeout(() => setAnnouncement(''), 3000);
        }
      } else {
        console.error('Error submitting answer:', result.error);
        setAnnouncement(' Error: ' + (result.error || 'Failed to submit answer'));
      }
    } catch (error) {
      console.error('Error:', error);
      setAnnouncement('Network error. Please try again.');

      if (matchId) {
        try {
          const response = await fetch(`/api/matches/${matchId}`);
          const data = await response.json();
          if (data.scores) {
            setScores(data.scores);
          }
        } catch (fetchError) {
          console.error('Error fetching match state:', fetchError);
        }
      }
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 p-4">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-6 text-center text-white">Flashcard Frenzy</h1>
        <div className="bg-gray-800 rounded-xl p-6 mb-6 shadow-lg">
          <p className="text-lg font-semibold mb-2 text-gray-300">Question:</p>
          <div className="p-6 bg-gray-700 text-white rounded-lg shadow mb-6 min-h-32 flex items-center justify-center">
            <p className="text-xl text-center">{question || 'Loading question...'}</p>
          </div>

          <div className="mb-6">
            <input
              type="text"
              value={answer}
              onChange={e => setAnswer(e.target.value)}
              onKeyPress={e => e.key === 'Enter' && submitAnswer()}
              disabled={ended}
              placeholder="Type your answer..."
              className="w-full px-4 py-3 text-lg text-black bg-white border-2 border-gray-300 rounded-lg mb-3 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none transition"
            />
            <button
              onClick={submitAnswer}
              disabled={ended || !answer.trim()}
              className={`w-full py-3 px-6 rounded-lg font-semibold text-lg transition ${ended ? 'bg-gray-600 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700 text-white'}`}
            >
              {ended ? 'Game Ended' : 'Submit Answer'}
            </button>
          </div>
          <div className="bg-gray-900 rounded-lg p-4 mb-6">
            <h2 className="text-xl font-bold mb-4 text-center text-white">Scores</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className={`p-4 rounded-lg text-center ${scores[userId] !== undefined ? 'bg-blue-900' : 'bg-gray-700'}`}>
                <p className="font-semibold text-white">You</p>
                <p className="text-2xl font-bold text-white">{scores[userId] ?? 0}</p>
              </div>
              <div className={`p-4 rounded-lg text-center ${scores && Object.keys(scores).some(id => id !== userId) ? 'bg-purple-900' : 'bg-gray-700'}`}>
                <p className="font-semibold text-white">Opponent</p>
                <p className="text-2xl font-bold text-white">
                  {scores && Object.keys(scores).length > 0 ? 
                    (scores[Object.keys(scores).find(key => key !== userId) as string] ?? 0) : 0}
                </p>
              </div>
            </div>
          </div>

          {announcement && (
            <div 
              aria-live="polite" 
              className={`p-4 mb-6 rounded-lg text-center font-medium ${announcement.includes('✅') ? 'bg-green-900/50' : 'bg-yellow-900/50'} text-white`}
            >
              {announcement}
            </div>
          )}
        </div>
        {process.env.NODE_ENV === 'development' && (
          <div className="mt-8 p-4 bg-gray-800 rounded-lg">
            <h3 className="font-bold mb-2 text-white">Debug Info</h3>
            <div className="text-sm text-gray-300 space-y-2">
              <p>User ID: {userId || 'Not logged in'}</p>
              <p>Match ID: {matchId}</p>
              <button 
                onClick={testScoreUpdate}
                className="mt-2 px-3 py-1 bg-yellow-600 text-white rounded text-sm hover:bg-yellow-700"
              >
                Test Score Update
              </button>
            </div>
          </div>
        )}
      </div>

      {ended && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-800 p-8 rounded-xl max-w-md w-full text-center border border-gray-700 shadow-2xl">
            <h2 className="text-3xl font-bold mb-4 text-white">
              {announcement.includes('Winner') ? '🎉 Game Over! 🎉' : 'Game Finished'}
            </h2>
            <p className="mb-6 text-xl text-gray-200">{announcement}</p>
            <button
              onClick={() => router.push('/dashboard')}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg transition transform hover:scale-105"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
