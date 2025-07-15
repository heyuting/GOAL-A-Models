import { createContext, useContext, useState, useEffect } from 'react';
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut,
  sendPasswordResetEmail,
  deleteUser,
  sendEmailVerification
} from 'firebase/auth';
import { auth } from '@/firebase';
import userService from '@/services/userService';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Listen for authentication state changes
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser && firebaseUser.emailVerified) {
        // User is signed in AND email is verified, get additional profile data from userService
        try {
          let userData = userService.findUserByFirebaseUid(firebaseUser.uid);
          
          // If user doesn't exist in userService, create a basic profile
          if (!userData) {
            userData = userService.createUser({
              email: firebaseUser.email,
              name: firebaseUser.displayName || firebaseUser.email.split('@')[0],
              firebaseUid: firebaseUser.uid
            });
          }
          
          // Use Firebase UID as primary ID
          const combinedUser = {
            ...userData,
            id: firebaseUser.uid,  // Firebase UID as primary ID
            email: firebaseUser.email,
            emailVerified: firebaseUser.emailVerified
          };
          
          setUser(combinedUser);
        } catch (error) {
          console.error('Error loading user profile:', error);
          setUser(null);
        }
      } else {
        // User is signed out OR email is not verified
        setUser(null);
      }
      setLoading(false);
    });

    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, []);

  const login = async (email, password) => {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const firebaseUser = userCredential.user;
      
      // Check if email is verified
      if (!firebaseUser.emailVerified) {
        // Sign out the user since email is not verified
        await signOut(auth);
        throw new Error('Please verify your email address before signing in. Check your inbox for the verification email.');
      }
      
      // Get additional profile data from userService
      let userData = userService.findUserByFirebaseUid(firebaseUser.uid);
      
      if (!userData) {
        // Create user profile if it doesn't exist
        userData = userService.createUser({
          email: firebaseUser.email,
          name: firebaseUser.displayName || firebaseUser.email.split('@')[0],
          firebaseUid: firebaseUser.uid
        });
      }
      
      // The user state will be updated by onAuthStateChanged
      return userData;
    } catch (error) {
      console.error('Login error:', error);
      throw new Error(error.message);
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
      // The user state will be updated by onAuthStateChanged
    } catch (error) {
      console.error('Logout error:', error);
      throw new Error(error.message);
    }
  };

  const register = async (userData) => {
    try {
      // Check if user already exists in userService
      const existingUser = userService.findUserByEmail(userData.email);
      if (existingUser) {
        // Try to sign in the user to check verification status
        try {
          const userCredential = await signInWithEmailAndPassword(auth, userData.email, userData.password);
          const firebaseUser = userCredential.user;
          
          if (!firebaseUser.emailVerified) {
            // User exists but email not verified - send verification email again
            await sendEmailVerification(firebaseUser);
            await signOut(auth);
            throw new Error('UNVERIFIED_EMAIL|Your account exists but email is not verified. We\'ve sent a new verification email - please check your inbox.');
          } else {
            // Email is verified, sign them out and tell them to use login
            await signOut(auth);
            throw new Error('User with this email already exists and is verified. Please use the sign in form instead.');
          }
        } catch (signInError) {
          if (signInError.message.includes('UNVERIFIED_EMAIL')) {
            throw signInError; // Re-throw our custom error
          }
          // If sign in failed for other reasons (wrong password, etc), this might be a different user
          throw new Error('User with this email already exists. If this is your account, please use the sign in form.');
        }
      }

      // Create Firebase user
      const userCredential = await createUserWithEmailAndPassword(
        auth, 
        userData.email, 
        userData.password
      );
      const firebaseUser = userCredential.user;

      // Send email verification
      await sendEmailVerification(firebaseUser);

      // Create user profile in userService
      const newUser = userService.createUser({
        ...userData,
        firebaseUid: firebaseUser.uid,
        email: firebaseUser.email
      });

      // Sign out the user until they verify their email
      await signOut(auth);

      return { 
        ...newUser, 
        emailVerificationSent: true 
      };
    } catch (error) {
      console.error('Registration error:', error);
      throw new Error(error.message);
    }
  };

  const updateProfile = (updates) => {
    if (!user) return null;
    
    const updatedUser = userService.updateUser(user.id, updates);
    if (updatedUser) {
      // Update local user state with the changes
      setUser(prevUser => ({
        ...prevUser,
        ...updatedUser
      }));
    }
    return updatedUser;
  };

  const forgotPassword = async (email) => {
    try {
      await sendPasswordResetEmail(auth, email);
      return { success: true, message: 'Password reset email sent successfully' };
    } catch (error) {
      console.error('Password reset error:', error);
      throw new Error(error.message);
    }
  };

  const deleteAccount = async () => {
    try {
      if (!user || !auth.currentUser) {
        throw new Error('No user is currently signed in');
      }

      // Delete user profile and models from localStorage first
      const localDeleteSuccess = userService.deleteUserAccount(user.id);
      if (!localDeleteSuccess) {
        throw new Error('Failed to delete user data from local storage');
      }

      // Delete user from Firebase authentication
      await deleteUser(auth.currentUser);
      
      // The user state will be automatically updated by onAuthStateChanged
      return { success: true, message: 'Account deleted successfully' };
    } catch (error) {
      console.error('Delete account error:', error);
      throw new Error(error.message);
    }
  };

  const resendVerificationEmail = async (email, password) => {
    try {
      // Sign in the user temporarily to send verification email
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const firebaseUser = userCredential.user;

      if (firebaseUser.emailVerified) {
        throw new Error('Email is already verified. You can now sign in normally.');
      }

      // Send verification email
      await sendEmailVerification(firebaseUser);
      
      // Sign out the user again
      await signOut(auth);
      
      return { success: true, message: 'Verification email sent successfully!' };
    } catch (error) {
      console.error('Resend verification error:', error);
      throw new Error(error.message);
    }
  };

  const value = {
    user,
    login,
    logout,
    register,
    updateProfile,
    forgotPassword,
    deleteAccount,
    resendVerificationEmail,
    loading
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}; 