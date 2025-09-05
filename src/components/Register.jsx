import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { motion } from 'framer-motion';

export default function Register({ onSwitchToLogin }) {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showVerificationMessage, setShowVerificationMessage] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState('');
  const [isUnverifiedEmail, setIsUnverifiedEmail] = useState(false);
  const { register } = useAuth();

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setShowVerificationMessage(false);
    setIsUnverifiedEmail(false);
    setIsLoading(true);

    try {
      // Validation
      if (!formData.name || !formData.email || !formData.password || !formData.confirmPassword) {
        throw new Error('Please fill in all fields');
      }

      if (formData.name.length < 2) {
        throw new Error('Name must be at least 2 characters long');
      }

      if (!formData.email.includes('@')) {
        throw new Error('Please enter a valid email address');
      }

      if (formData.password.length < 6) {
        throw new Error('Password must be at least 6 characters long');
      }

      if (formData.password !== formData.confirmPassword) {
        throw new Error('Passwords do not match');
      }

      // Register the user with Firebase
      const userData = {
        name: formData.name,
        email: formData.email,
        password: formData.password
      };

      let result = await register(userData);

      if (result.emailVerificationSent) {
        setRegisteredEmail(formData.email);
        setShowVerificationMessage(true);
        setIsUnverifiedEmail(false);
        setFormData({
          name: '',
          email: '',
          password: '',
          confirmPassword: ''
        });
      }
    } catch (err) {
      if (err.message?.includes('UNVERIFIED_EMAIL')) {
        setRegisteredEmail(formData.email);
        setShowVerificationMessage(true);
        setIsUnverifiedEmail(true);
        setError('');
        setFormData({
          name: '',
          email: '',
          password: '',
          confirmPassword: ''
        });
      } else {
        let errorMsg;
        switch (err.code) {
          case 'auth/email-already-in-use':
            errorMsg = 'This email is already registered. Please sign in or use a different email.';
            break;
          case 'auth/invalid-email':
            errorMsg = 'Invalid email address.';
            break;
          case 'auth/weak-password':
            errorMsg = 'Password is too weak. It should be at least 6 characters.';
            break;
          default:
            errorMsg = err.message || err.code || 'An unexpected error occurred. Please try again.';
        }
        setError(errorMsg);
        setIsUnverifiedEmail(false);
        setShowVerificationMessage(false);
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (showVerificationMessage) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="min-h-screen flex items-start justify-center bg-gray-100 p-4 pt-16"
      >
        <Card className="w-full max-w-md shadow-xl">
          <CardHeader className="text-center">
            <CardTitle className={`text-2xl font-bold ${isUnverifiedEmail ? 'text-orange-600' : 'text-green-600'}`}>
              {isUnverifiedEmail ? 'Account Needs Verification!' : 'Check Your Email!'}
            </CardTitle>
            <p className="text-gray-600 mt-2">
              {isUnverifiedEmail 
                ? 'Your account exists but needs email verification' 
                : 'We\'ve sent a verification email to your inbox'
              }
            </p>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <div className={`border rounded-lg p-4 ${
              isUnverifiedEmail 
                ? 'bg-orange-50 border-orange-200' 
                : 'bg-green-50 border-green-200'
            }`}>
              <p className={`font-medium mb-2 ${
                isUnverifiedEmail ? 'text-orange-800' : 'text-green-800'
              }`}>
                Email sent to: {registeredEmail}
              </p>
              <p className={`text-sm ${
                isUnverifiedEmail ? 'text-orange-700' : 'text-green-700'
              }`}>
                {isUnverifiedEmail 
                  ? 'We\'ve sent a new verification email to your account. Please check your email and click the verification link to activate your account.'
                  : 'Please check your email and click the verification link. You\'ll need to complete the verification process before you can sign in.'
                }
              </p>
              <div className="mt-3 pt-3 border-t border-green-300">
                <p className="text-xs text-green-600">
                  🔐 For security, you'll need to explicitly confirm your verification by clicking a button on the verification page.
                </p>
              </div>
            </div>
            
            <div className="space-y-3">
              <Button
                onClick={onSwitchToLogin}
                className="w-full bg-blue-500 hover:bg-blue-600"
              >
                Go to Sign In
              </Button>
              
              <Button
                variant="outline"
                onClick={() => {
                  setShowVerificationMessage(false);
                  setIsUnverifiedEmail(false);
                  setError('');
                }}
                className="w-full"
              >
                Register Another Account
              </Button>
            </div>

            <div className="text-sm text-gray-500">
              <p>
                {isUnverifiedEmail 
                  ? 'Still didn\'t receive the email? Check your spam folder. You can also try signing in again to get another verification email.'
                  : 'Didn\'t receive the email? Check your spam folder or contact support.'
                }
              </p>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

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
            Create Account
          </CardTitle>
          <p className="text-gray-600 mt-2">
            Join GOAL-A to run your ERW models 
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              <Input
                id="name"
                name="name"
                type="text"
                placeholder="Enter your full name"
                value={formData.name}
                onChange={handleChange}
                disabled={isLoading}
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="Enter your email"
                value={formData.email}
                onChange={handleChange}
                disabled={isLoading}
                className="w-full"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                placeholder="Enter your password"
                value={formData.password}
                onChange={handleChange}
                disabled={isLoading}
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                placeholder="Confirm your password"
                value={formData.confirmPassword}
                onChange={handleChange}
                disabled={isLoading}
                className="w-full"
              />
            </div>

            {error && (
              <div className="text-red-500 text-sm bg-red-50 p-3 rounded-lg">
                {error}
              </div>
            )}

            <Button
              type="submit"
              className="w-full bg-green-500 hover:bg-green-600 text-white"
              disabled={isLoading}
            >
              {isLoading ? 'Creating Account...' : 'Create Account'}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-gray-600">
              Already have an account?{' '}
              <button
                onClick={onSwitchToLogin}
                className="text-blue-500 hover:text-blue-600 font-medium"
                disabled={isLoading}
              >
                Sign in
              </button>
            </p>
          </div>

          <div className="mt-4 text-center">
            <p className="text-sm text-gray-500">
              Secure registration powered by Firebase
            </p>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
} 