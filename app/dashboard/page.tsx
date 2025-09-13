'use client';
import { supabase } from '../../lib/supabaseClient';
import { useEffect, useState, useRef } from 'react';
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
  const [ongoingMatch, setOngoingMatch] = useState<MatchSummary | null>(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [matchButtonDisabled, setMatchButtonDisabled] = useState(false);
  const router = useRouter();
  const cancelRef = useRef<(() => Promise<void>) | null>(null);

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
        }
        // Removed match history fetch and setMatches as not used in UI
      } catch {
        setMessage('Failed to load matches. Please try refreshing the page.');
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [router]);

  const startMatch = async () => {
    if (matchButtonDisabled) return;
    setMatchButtonDisabled(true);
    try {
      if (ongoingMatch) {
        router.push(`/match/${ongoingMatch._id}`);
        setMatchButtonDisabled(false);
        return;
      }
  const { data: { session } } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setMessage('Authentication expired. Please log in again.');
        router.push('/login');
        return;
      }

      const response = await fetch('/api/matches', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ userId }),
      });

      let data: Record<string, unknown> | null = null;
      try {
        data = await response.json();
      } catch {
        // Ignore JSON parse error, will handle below
      }

      if (!response.ok) {
        throw new Error((data && typeof data.error === 'string') ? data.error : 'Failed to start match');
      }

      if (data && data.status === 'waiting') {
        setMessage('Searching for an opponent... Please wait.');
        setMatchButtonDisabled(true);
        const pollInterval = 2000;
        const maxAttempts = Math.ceil(60000 / pollInterval); // stop after ~60s
        let attempts = 0;
        const poll = setInterval(async () => {
          attempts += 1;
          try {
            const ongoingRes = await fetch(`/api/matches?userId=${userId}`, { cache: 'no-store' });
            if (ongoingRes.ok) {
              const ongoingData = await ongoingRes.json();
              const ongoing = (ongoingData.matches || []).find((m: MatchSummary) => m.status === 'ongoing');
              if (ongoing && ongoing._id) {
                clearInterval(poll);
                cancelRef.current = null;
                setMatchButtonDisabled(false);
                router.push(`/match/${ongoing._id}`);
                return;
              }
            }
          } catch {
            // Ignore polling errors
          }
          if (attempts >= maxAttempts) {
            clearInterval(poll);
            setMessage('No opponent found. Please try again later.');
            setMatchButtonDisabled(false);
            cancelRef.current = null;
          }
        }, pollInterval);
        cancelRef.current = async () => {
          clearInterval(poll);
          try {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.access_token) {
              await fetch('/api/matches', { method: 'DELETE', headers: { 'Authorization': `Bearer ${session.access_token}` } });
            }
          } catch {
            // Ignore cancel errors
          }
          setMessage('Search cancelled.');
          cancelRef.current = null;
        };
      } else if (data && data.matchId) {
        setMatchButtonDisabled(false);
        router.push(`/match/${data.matchId}`);
      } else {
        setMessage('Failed to create match. Please try again.');
        setMatchButtonDisabled(false);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message || 'Failed to start match' : 'Failed to start match');
      setMatchButtonDisabled(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-purple-100">
        <span className="text-lg text-gray-600">Loading...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-indigo-200 items-center justify-center p-4">
      <div className="w-full max-w-md bg-white/90 rounded-2xl shadow-2xl p-8 flex flex-col items-center border border-gray-200">
        <h1 className="text-3xl font-extrabold mb-8 text-gray-900 tracking-tight drop-shadow">Dashboard</h1>
        <button
          onClick={startMatch}
          className={`w-full py-3 px-6 rounded-xl font-bold text-lg bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg hover:from-blue-700 hover:to-purple-700 transition-all duration-200 mb-4 ${matchButtonDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          disabled={matchButtonDisabled}
        >
          {ongoingMatch ? 'Continue Match' : 'Start New Match'}
        </button>
        {ongoingMatch && (
          <p className="mt-2 text-purple-700 font-semibold text-center">
            You have an ongoing match. Click the button above to continue.
          </p>
        )}
        {message && <p className="mt-4 text-red-600 font-semibold text-center">{message}</p>}
        {message && message.toLowerCase().includes('searching for an opponent') && (
          <button
            onClick={async () => {
              if (cancelRef.current) {
                try {
                  await cancelRef.current();
                } catch (e) {
                  console.error('Cancel button error:', e);
                }
              } else {
                console.log('Cancel button clicked but no active search to cancel');
              }
            }}
            className="mt-3 w-full py-2 px-4 rounded-lg bg-red-500 text-white font-semibold hover:bg-red-600 transition"
          >
            Cancel Search
          </button>
        )}
      </div>
    </div>
  );
}
