import { createContext, useContext, useState, useEffect } from 'react';
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut,
  sendPasswordResetEmail
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
      if (firebaseUser) {
        // User is signed in, get additional profile data from userService
        try {
          let userData = userService.findUserByEmail(firebaseUser.email);
          
          // If user doesn't exist in userService, create a basic profile
          if (!userData) {
            userData = userService.createUser({
              email: firebaseUser.email,
              name: firebaseUser.displayName || firebaseUser.email.split('@')[0],
              firebaseUid: firebaseUser.uid
            });
          }
          
          // Combine Firebase user data with local profile data
          const combinedUser = {
            ...userData,
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            emailVerified: firebaseUser.emailVerified
          };
          
          setUser(combinedUser);
        } catch (error) {
          console.error('Error loading user profile:', error);
          setUser(null);
        }
      } else {
        // User is signed out
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
      
      // Get additional profile data from userService
      let userData = userService.findUserByEmail(firebaseUser.email);
      
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
        throw new Error('User with this email already exists');
      }

      // Create Firebase user
      const userCredential = await createUserWithEmailAndPassword(
        auth, 
        userData.email, 
        userData.password
      );
      const firebaseUser = userCredential.user;

      // Create user profile in userService
      const newUser = userService.createUser({
        ...userData,
        firebaseUid: firebaseUser.uid,
        email: firebaseUser.email
      });

      // The user state will be updated by onAuthStateChanged
      return newUser;
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

  const value = {
    user,
    login,
    logout,
    register,
    updateProfile,
    forgotPassword,
    loading
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}; 