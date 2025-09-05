import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { motion } from 'framer-motion';

export default function Login({ onSwitchToRegister }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetMessage, setResetMessage] = useState('');
  const [verificationError, setVerificationError] = useState(false);
  const [verificationMessage, setVerificationMessage] = useState('');
  const { login, forgotPassword } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setVerificationError(false);
    setVerificationMessage('');
    setIsLoading(true);

    try {
      // Basic validation
      if (!email || !password) {
        throw new Error('Please fill in all fields');
      }

      if (!email.includes('@')) {
        throw new Error('Please enter a valid email address');
      }

      if (password.length < 6) {
        throw new Error('Password must be at least 6 characters long');
      }

      // Sign in with Firebase
      await login(email, password);
      
      // Redirect to home page after successful login
      navigate('/');
    } catch (err) {
      if (err.message.includes('verify your email')) {
        setVerificationError(true);
        setError('');
      } else if (err.message.includes('user-not-found')) {
        setError('No account found with this email address. Please check your email or sign up for a new account.');
        setVerificationError(false);
      } else if (err.message.includes('wrong-password') || err.message.includes('invalid-credential')) {
        setError('Incorrect password. Please try again or use the forgot password option.');
        setVerificationError(false);
      } else {
        setError(err.message);
        setVerificationError(false);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setError('');
    setResetMessage('');
    setIsLoading(true);

    try {
      if (!email) {
        throw new Error('Please enter your email address');
      }

      if (!email.includes('@')) {
        throw new Error('Please enter a valid email address');
      }

      await forgotPassword(email);
      setResetMessage('Password reset email sent! Check your inbox.');
      setShowForgotPassword(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendVerification = () => {
    setVerificationMessage(
      'To get a new verification email, please go to the registration page and create your account again. ' +
      'If your email is already registered, you\'ll receive a new verification email automatically.'
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen flex items-start justify-center bg-gray-100 p-4 pt-16"
    >
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold text-gray-800">
            {showForgotPassword ? 'Reset Password' : 'Welcome to GOAL-A'}
          </CardTitle>
          <p className="text-gray-600 mt-2">
            {showForgotPassword 
              ? 'Enter your email address to receive a password reset link'
              : 'Sign in to access your models and saved configurations'
            }
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
                className="w-full"
              />
            </div>
            
            {!showForgotPassword && (
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                  className="w-full"
                />
              </div>
            )}

            {error && (
              <div className="text-red-500 text-sm bg-red-50 p-3 rounded-lg">
                {error}
              </div>
            )}

            {verificationError && (
              <div className="text-orange-600 text-sm bg-orange-50 border border-orange-200 p-4 rounded-lg">
                <p className="font-medium mb-2">Email Verification Required</p>
                <p className="mb-3">
                  Your account exists but your email address hasn't been verified yet. 
                  Please check your inbox for the verification email and click the link to activate your account.
                </p>
                <Button
                  onClick={handleResendVerification}
                  variant="outline"
                  size="sm"
                  disabled={isLoading}
                  className="text-orange-600 border-orange-300 hover:bg-orange-50"
                >
                  {isLoading ? 'Sending...' : 'Resend Verification Email'}
                </Button>
              </div>
            )}

            {verificationMessage && (
              <div className={`text-sm p-3 rounded-lg ${
                verificationMessage.includes('Error') 
                  ? 'text-red-500 bg-red-50' 
                  : 'text-green-500 bg-green-50'
              }`}>
                {verificationMessage}
              </div>
            )}

            {resetMessage && (
              <div className="text-green-500 text-sm bg-green-50 p-3 rounded-lg">
                {resetMessage}
              </div>
            )}

            {!showForgotPassword ? (
              <>
                <Button
                  type="submit"
                  className="w-full bg-blue-500 hover:bg-blue-600 text-white"
                  disabled={isLoading}
                >
                  {isLoading ? 'Signing in...' : 'Sign In'}
                </Button>
                
                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => setShowForgotPassword(true)}
                    className="text-blue-500 hover:text-blue-600 text-sm"
                    disabled={isLoading}
                  >
                    Forgot your password?
                  </button>
                </div>
              </>
            ) : (
              <>
                <Button
                  onClick={handleForgotPassword}
                  className="w-full bg-green-500 hover:bg-green-600 text-white"
                  disabled={isLoading}
                >
                  {isLoading ? 'Sending...' : 'Send Reset Email'}
                </Button>
                
                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => {
                      setShowForgotPassword(false);
                      setError('');
                      setResetMessage('');
                    }}
                    className="text-gray-500 hover:text-gray-600 text-sm"
                    disabled={isLoading}
                  >
                    Back to Sign In
                  </button>
                </div>
              </>
            )}
          </form>

          <div className="mt-6 text-center">
            <p className="text-gray-600">
              Don't have an account?{' '}
              <button
                onClick={onSwitchToRegister}
                className="text-blue-500 hover:text-blue-600 font-medium"
                disabled={isLoading}
              >
                Sign up
              </button>
            </p>
          </div>

          <div className="mt-4 text-center">
            <p className="text-sm text-gray-500">
              Secure authentication powered by Firebase
            </p>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
} 