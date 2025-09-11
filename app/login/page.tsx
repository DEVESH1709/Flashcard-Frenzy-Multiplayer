'use client';
import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { supabase } from '../../lib/supabaseClient';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [message, setMessage] = useState<string | null>(null);
  const [messageType, setMessageType] = useState<'success' | 'error'>('success');

  useEffect(() => {
    const message = searchParams.get('message');
    if (message) {
      setMessage(decodeURIComponent(message));
      setMessageType(searchParams.get('type') as 'success' | 'error' || 'success');
    }
  }, [searchParams]);

  const handleUser = async (user: any) => {
    try {
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: user.id, email: user.email })
      });

      if (response.ok) {
        router.push('/dashboard');
      } else {
        const error = await response.json();
        setMessage(error.message || 'An error occurred');
        setMessageType('error');
      }
    } catch (error) {
      console.error('Error handling user:', error);
      setMessage('An error occurred while processing your request');
      setMessageType('error');
    }
  };

  useEffect(() => {
    supabase.auth.getUser().then(({ data: userData, error: userError }) => {
      if (userError) {
        if (userError.name !== 'AuthSessionMissingError') {
          console.error('Error getting user:', userError);
        }
        return;
      }
      if (userData && userData.user) handleUser(userData.user);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event: string, session) => {
      if (event === 'SIGNED_IN' && session && session.user) {
        handleUser(session.user);
      }
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  const [redirectUrl, setRedirectUrl] = useState<string>('');

  useEffect(() => {
    setRedirectUrl(`${window.location.origin}/auth/callback`);
  }, []);

  return (
    <div className="min-h-screen bg-blue-200 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
          Sign in to your account
        </h2>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          {message && (
            <div className={`mb-4 p-4 rounded-md ${messageType === 'error' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
              {message}
            </div>
          )}
          {redirectUrl && (
            <Auth
              supabaseClient={supabase}
              providers={['google']}
              view="sign_in"
              redirectTo={`${window.location.origin}/dashboard`}
              showLinks={true}
              onlyThirdPartyProviders={false}
              magicLink={true}
              theme="default"
              appearance={{
                theme: ThemeSupa,
                variables: {
                  default: {
                    colors: {
                      brand: '#4f46e5',
                      brandAccent: '#4338ca',
                    },
                  },
                },
              }}
            />
          )}
          <div className="mt-6 text-center text-sm text-gray-600">
            <p>Don't have an account? Sign up above.</p>
            <p className="mt-2">
              Check your email after signing up to confirm your account.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
