import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { motion } from 'framer-motion';

export default function VerifyEmail() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState('redirecting');
  const [error, setError] = useState('');
  const [hasProcessed, setHasProcessed] = useState(false);

  const oobCode = searchParams.get('oobCode');
  const mode = searchParams.get('mode');

  useEffect(() => {
    // Redirect to safer verification flow instead of processing immediately
    if (mode === 'verifyEmail' && oobCode) {
      console.log('VerifyEmail: Redirecting to safer verification flow');
      // Redirect to the new email-verification-pending page with the same parameters
      const currentUrl = new URL(window.location.href);
      const newUrl = `/email-verification-pending?${currentUrl.search.substring(1)}`;
      navigate(newUrl, { replace: true });
      return;
    }

    // If we get here, it's an invalid link
    if (!hasProcessed) {
      setStatus('error');
      setError('Invalid verification link. Please check your email for a new verification link.');
      setHasProcessed(true);
    }
  }, [oobCode, mode, hasProcessed, navigate]); // Include dependencies

  const renderContent = () => {
    switch (status) {
      case 'redirecting':
        return (
          <>
            <CardHeader className="text-center">
              <CardTitle className="text-2xl font-bold text-blue-600">
                Redirecting to Verification
              </CardTitle>
              <p className="text-gray-600 mt-2">
                Taking you to the secure verification page...
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

      case 'error':
      default:
        return (
          <>
            <CardHeader className="text-center">
              <CardTitle className="text-2xl font-bold text-red-600">
                Invalid Verification Link
              </CardTitle>
              <p className="text-gray-600 mt-2">
                This verification link appears to be invalid.
              </p>
            </CardHeader>
            <CardContent className="text-center space-y-4">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-red-800 font-medium mb-2">
                  Verification Error
                </p>
                <p className="text-red-700 text-sm">
                  {error || 'The verification link is invalid or malformed. Please request a new verification email.'}
                </p>
              </div>
              <div className="space-y-3">
                <Button
                  onClick={() => navigate('/login')}
                  className="w-full bg-red-500 hover:bg-red-600"
                >
                  Go to Sign In
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
