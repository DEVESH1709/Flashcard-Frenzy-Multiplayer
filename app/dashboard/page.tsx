'use client';
import { supabase } from '../../lib/supabaseClient';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type MatchSummary = {
  _id: string;
  players: { id: string, email: string }[];
  scores: { [key: string]: number };
  winnerEmail: string;
  status?: string;
};

export default function DashboardPage() {
  const [userId, setUserId] = useState<string>('');
  const [matches, setMatches] = useState<MatchSummary[]>([]);
  const [ongoingMatch, setOngoingMatch] = useState<MatchSummary | null>(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }
      setUserId(user.id);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const ongoingRes = await fetch('/api/matches/ongoing', { 
          cache: 'no-store',
          headers: {
            'Authorization': `Bearer ${session?.access_token}`
          }
        });
        if (ongoingRes.ok) {
          const ongoingData = await ongoingRes.json();
          if (ongoingData.match) {
            setOngoingMatch(ongoingData.match);
          }
        } else {
          console.error('Failed to fetch ongoing match:', await ongoingRes.text());
        }
        const matchesRes = await fetch(`/api/matches?userId=${user.id}`, { cache: 'no-store' });
        if (matchesRes.ok) {
          const matchesData = await matchesRes.json();
          const finishedMatches = matchesData.matches
            .filter((m: any) => m.status === 'finished')
            .map((m: any) => ({
              ...m,
              winnerEmail: m.winner || 'Draw',
              _id: m._id.toString() 
            }));
          setMatches(finishedMatches);
        } else {
          console.error('Failed to fetch match history:', await matchesRes.text());
        }
      } catch (error) {
        console.error('Error loading matches:', error);
        setMessage('Failed to load matches. Please try refreshing the page.');
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [router]);

  const startMatch = async () => {
    try {
      if (ongoingMatch) {
        router.push(`/match/${ongoingMatch._id}`);
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();

      const response = await fetch('/api/matches', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ userId }),
      });
      
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to start match');
      }

      if (data.matchId) {
        router.push(`/match/${data.matchId}`);
      } else {
        setMessage('Failed to create match. Please try again.');
      }
    } catch (error: any) {
      console.error('Error starting match:', error);
      setMessage(error.message || 'Failed to start match');
    }
  };

  if (loading) {
    return (
      <div className="p-4 flex items-center justify-center min-h-screen">
        <span className="text-lg text-gray-600">Loading...</span>
      </div>
    );
  }

  return (
    <div className="p-4">
  <h1 className="text-2xl font-bold mb-6 text-black">Dashboard</h1>
  <div className="mb-8 p-4 bg-gray-100 rounded-lg text-black">
        <button
          onClick={startMatch}
          className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          {ongoingMatch ? 'Continue Match' : 'Start New Match'}
        </button>
        {ongoingMatch && (
          <p className="mt-2 text-blue-900 font-semibold">
            You have an ongoing match. Click the button above to continue.
          </p>
        )}
        {message && <p className="mt-2 text-red-800 font-semibold">{message}</p>}
      </div>
    </div>
  );
}
