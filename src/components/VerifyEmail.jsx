import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { applyActionCode } from 'firebase/auth';
import { auth } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { motion } from 'framer-motion';

export default function VerifyEmail() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState('verifying'); // verifying, success, error, expired
  const [error, setError] = useState('');
  const [hasProcessed, setHasProcessed] = useState(false);

  const oobCode = searchParams.get('oobCode');
  const mode = searchParams.get('mode');

  useEffect(() => {
    const verifyEmail = async () => {
      // Prevent double processing
      if (hasProcessed) {
        console.log('VerifyEmail: Already processed, skipping');
        return;
      }

      console.log('VerifyEmail: Processing verification', { mode, oobCode: oobCode ? 'present' : 'missing' });

      if (mode !== 'verifyEmail' || !oobCode) {
        setStatus('error');
        setError('Invalid verification link. Please use the link from your email.');
        return;
      }

      setHasProcessed(true);

      try {
        console.log('VerifyEmail: Calling applyActionCode...');
        await applyActionCode(auth, oobCode);
        console.log('VerifyEmail: Success!');
        setStatus('success');
      } catch (error) {
        console.error('Email verification error:', error);

        if (error.code === 'auth/expired-action-code') {
          setStatus('expired');
          setError('This verification link has expired. Please log in and request a new verification email.');
        } else if (error.code === 'auth/invalid-action-code') {
          setStatus('error');
          setError('This link is invalid or has already been used. If your email is already verified, just sign in.');
        } else {
          setStatus('error');
          setError('Failed to verify email. Please try again or contact support.');
        }
      }
    };

    // Only run if we haven't processed and have the required parameters
    if (!hasProcessed && mode && oobCode) {
      verifyEmail();
    }
  }, [oobCode, mode, hasProcessed]); // Include dependencies

  const renderContent = () => {
    switch (status) {
      case 'verifying':
        return (
          <>
            <CardHeader className="text-center">
              <CardTitle className="text-2xl font-bold text-blue-600">
                Verifying Your Email
              </CardTitle>
              <p className="text-gray-600 mt-2">
                Please wait while we verify your email address...
              </p>
            </CardHeader>
            <CardContent className="text-center space-y-4">
              <div className="flex justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
              </div>
              <p className="text-gray-500">This should only take a moment.</p>
            </CardContent>
          </>
        );

      case 'success':
        return (
          <>
            <CardHeader className="text-center">
              <CardTitle className="text-2xl font-bold text-green-600">
                Email Verified Successfully! 🎉
              </CardTitle>
              <p className="text-gray-600 mt-2">
                Your account has been activated.
              </p>
            </CardHeader>
            <CardContent className="text-center space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <p className="text-green-800 font-medium mb-2">
                  Welcome to GOAL-A Models!
                </p>
                <p className="text-green-700 text-sm">
                  You can now sign in and start using the application.
                </p>
              </div>
              <div className="space-y-3">
                <Button
                  onClick={() => navigate('/login')}
                  className="w-full bg-green-500 hover:bg-green-600"
                >
                  Sign In Now
                </Button>
                <Button
                  variant="outline"
                  onClick={() => navigate('/')}
                  className="w-full"
                >
                  Go to Homepage
                </Button>
              </div>
            </CardContent>
          </>
        );

      case 'expired':
        return (
          <>
            <CardHeader className="text-center">
              <CardTitle className="text-2xl font-bold text-orange-600">
                Verification Link Expired
              </CardTitle>
              <p className="text-gray-600 mt-2">
                This verification link is no longer valid.
              </p>
            </CardHeader>
            <CardContent className="text-center space-y-4">
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                <p className="text-orange-800 font-medium mb-2">
                  Link has expired
                </p>
                <p className="text-orange-700 text-sm">
                  {error || 'Verification links expire for security. Please request a new one.'}
                </p>
              </div>
              <div className="space-y-3">
                <Button
                  onClick={() => navigate('/login')}
                  className="w-full bg-orange-500 hover:bg-orange-600"
                >
                  Sign In to Resend Verification
                </Button>
                <Button
                  variant="outline"
                  onClick={() => navigate('/signup')}
                  className="w-full"
                >
                  Create New Account
                </Button>
              </div>
            </CardContent>
          </>
        );

      case 'error':
      default:
        return (
          <>
            <CardHeader className="text-center">
              <CardTitle className="text-2xl font-bold text-red-600">
                Verification Failed
              </CardTitle>
              <p className="text-gray-600 mt-2">
                We couldn't verify your email address.
              </p>
            </CardHeader>
            <CardContent className="text-center space-y-4">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-red-800 font-medium mb-2">
                  Verification Error
                </p>
                <p className="text-red-700 text-sm">
                  {error || 'Something went wrong during verification. Please try again.'}
                </p>
              </div>
              <div className="space-y-3">
                <Button
                  onClick={() => navigate('/login')}
                  className="w-full bg-red-500 hover:bg-red-600"
                >
                  Try Signing In
                </Button>
                <Button
                  variant="outline"
                  onClick={() => navigate('/signup')}
                  className="w-full"
                >
                  Create New Account
                </Button>
              </div>
            </CardContent>
          </>
        );
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen flex items-center justify-center bg-gray-100 p-4"
    >
      <Card className="w-full max-w-md shadow-xl">
        {renderContent()}
      </Card>
    </motion.div>
  );
}
