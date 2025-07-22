import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { applyActionCode } from 'firebase/auth';
import { auth } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { motion } from 'framer-motion';

export default function EmailVerificationPending() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState('pending'); // pending, verifying, success, error
  const [error, setError] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const oobCode = searchParams.get('oobCode');
  const mode = searchParams.get('mode');

  useEffect(() => {
    // Validate that we have the required parameters
    if (mode !== 'verifyEmail' || !oobCode) {
      setStatus('error');
      setError('Invalid verification link. Please check your email for a new verification link.');
    }
  }, [mode, oobCode]);

  const handleCompleteVerification = async () => {
    if (!oobCode || isProcessing) return;
    
    setIsProcessing(true);
    setStatus('verifying');

    try {
      console.log('EmailVerificationPending: User clicked Complete Verification');
      await applyActionCode(auth, oobCode);
      console.log('EmailVerificationPending: Verification successful');
      setStatus('success');
    } catch (error) {
      console.error('Email verification error:', error);
      setStatus('error');

      if (error.code === 'auth/expired-action-code') {
        setError('This verification link has expired. Please sign in to request a new verification email.');
      } else if (error.code === 'auth/invalid-action-code') {
        setError('This verification link is invalid or has already been used. If your email is already verified, try signing in.');
      } else {
        setError('Failed to verify email. Please try again or contact support.');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const renderContent = () => {
    switch (status) {
      case 'pending':
        return (
          <>
            <CardHeader className="text-center">
              <CardTitle className="text-2xl font-bold text-blue-600">
                Complete Email Verification
              </CardTitle>
              <p className="text-gray-600 mt-2">
                Almost there! Click the button below to verify your email address.
              </p>
            </CardHeader>
            <CardContent className="text-center space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-blue-800 font-medium mb-2">
                  🔐 Secure Verification Process
                </p>
                <p className="text-blue-700 text-sm">
                  For security reasons, we require you to explicitly confirm your email verification.
                  This prevents automated systems from accidentally verifying your account.
                </p>
              </div>
              
              <div className="space-y-3">
                <Button
                  onClick={handleCompleteVerification}
                  disabled={isProcessing}
                  className="w-full bg-blue-500 hover:bg-blue-600"
                >
                  {isProcessing ? 'Verifying...' : 'Complete Email Verification'}
                </Button>
                
                <Button
                  variant="outline"
                  onClick={() => navigate('/login')}
                  className="w-full"
                  disabled={isProcessing}
                >
                  Back to Sign In
                </Button>
              </div>

              <div className="text-xs text-gray-500 mt-4">
                <p>
                  💡 This extra step ensures that only you can verify your email address.
                </p>
              </div>
            </CardContent>
          </>
        );

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