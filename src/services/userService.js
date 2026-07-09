// User service for managing user data and model configurations
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import { db } from '../firebase';
import { DEFAULT_USER_TIER, normalizeUserTier } from '@/config/userTiers';

class UserService {
  constructor() {
    this.usersKey = 'goal-a-users';
    this.modelsKey = 'goal-a-models';
    this.modelsCollection = 'savedModels'; // Firestore collection name
    this.usersCollection = 'users'; // Firestore user profiles (tier, etc.)
    this.migrationDoneKey = 'models_migrated_to_firestore';
  }

  // Get all users from localStorage
  getUsers() {
    try {
      const users = localStorage.getItem(this.usersKey);
      return users ? JSON.parse(users) : [];
    } catch (error) {
      console.error('Error getting users:', error);
      return [];
    }
  }

  // Save users to localStorage
  saveUsers(users) {
    try {
      localStorage.setItem(this.usersKey, JSON.stringify(users));
    } catch (error) {
      console.error('Error saving users:', error);
    }
  }

  // Create a new user (upsert by firebaseUid)
  createUser(userData) {
    const users = this.getUsers();
    const { password: _password, tier: rawTier, ...safeUserData } = userData || {};
    const uid = safeUserData.firebaseUid;
    const existingIndex = users.findIndex((u) => u.id === uid);
    const tier = normalizeUserTier(rawTier || DEFAULT_USER_TIER);

    if (existingIndex !== -1) {
      users[existingIndex] = {
        ...users[existingIndex],
        ...safeUserData,
        id: uid,
        tier,
        updatedAt: new Date().toISOString(),
      };
      this.saveUsers(users);
      return users[existingIndex];
    }

    const newUser = {
      id: uid,
      ...safeUserData,
      tier,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    users.push(newUser);
    this.saveUsers(users);
    return newUser;
  }

  // Find user by email
  findUserByEmail(email) {
    const users = this.getUsers();
    return users.find(user => user.email === email);
  }

  // Find user by Firebase UID
  findUserByFirebaseUid(firebaseUid) {
    const users = this.getUsers();
    return users.find(user => user.id === firebaseUid);
  }

  // Update user
  updateUser(userId, updates) {
    const users = this.getUsers();
    const userIndex = users.findIndex(user => user.id === userId);

    if (userIndex !== -1) {
      const nextUpdates = { ...updates };
      if (Object.prototype.hasOwnProperty.call(nextUpdates, 'tier')) {
        nextUpdates.tier = normalizeUserTier(nextUpdates.tier);
      }
      // Never persist plaintext passwords on profile updates
      delete nextUpdates.password;

      users[userIndex] = {
        ...users[userIndex],
        ...nextUpdates,
        updatedAt: new Date().toISOString()
      };
      this.saveUsers(users);
      return users[userIndex];
    }
    return null;
  }

  /**
   * Ensure local profile has a valid tier. Used on login for older profiles.
   */
  ensureUserTier(userId, preferredTier) {
    const existing = this.findUserByFirebaseUid(userId);
    if (!existing) return null;
    const normalized = normalizeUserTier(existing.tier || preferredTier || DEFAULT_USER_TIER);
    if (existing.tier === normalized) return existing;
    return this.updateUser(userId, { tier: normalized });
  }

  /**
   * Load / sync user profile from Firestore.
   * Tier in Firestore is set by admins (console / rules); clients create with standard only.
   * Env allowlists still raise effective tier at resolve time (see resolveUserTier).
   */
  async getOrCreateFirestoreProfile({ uid, email, name }) {
    if (!uid) return null;
    const userRef = doc(db, this.usersCollection, uid);

    try {
      const snap = await getDoc(userRef);
      if (snap.exists()) {
        const data = snap.data() || {};
        const profile = {
          id: uid,
          email: data.email || email || '',
          name: data.name || name || '',
          tier: normalizeUserTier(data.tier || DEFAULT_USER_TIER),
          createdAt: data.createdAt?.toDate?.()?.toISOString?.() || data.createdAt || null,
          updatedAt: data.updatedAt?.toDate?.()?.toISOString?.() || data.updatedAt || null,
        };

        this.createUser({
          firebaseUid: uid,
          email: profile.email,
          name: profile.name,
          tier: profile.tier,
        });
        return profile;
      }

      const newProfile = {
        email: email || '',
        name: name || (email ? email.split('@')[0] : ''),
        tier: DEFAULT_USER_TIER,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await setDoc(userRef, newProfile);

      this.createUser({
        firebaseUid: uid,
        email: newProfile.email,
        name: newProfile.name,
        tier: DEFAULT_USER_TIER,
      });

      return {
        id: uid,
        email: newProfile.email,
        name: newProfile.name,
        tier: DEFAULT_USER_TIER,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    } catch (error) {
      console.error('Error loading Firestore user profile:', error);
      let local = this.findUserByFirebaseUid(uid);
      if (!local) {
        local = this.createUser({
          firebaseUid: uid,
          email,
          name: name || (email ? email.split('@')[0] : ''),
          tier: DEFAULT_USER_TIER,
        });
      } else {
        local = this.ensureUserTier(uid, DEFAULT_USER_TIER) || local;
      }
      return local;
    }
  }

  /**
   * Set a user's tier in Firestore (and local cache).
   * Prefer Firebase Console / Admin SDK in production; protect with security rules
   * so clients cannot elevate themselves.
   */
  async setUserTierInFirestore(userId, tier) {
    if (!userId) return null;
    const normalized = normalizeUserTier(tier);
    try {
      const userRef = doc(db, this.usersCollection, userId);
      await setDoc(
        userRef,
        { tier: normalized, updatedAt: serverTimestamp() },
        { merge: true }
      );
      this.updateUser(userId, { tier: normalized });
      return normalized;
    } catch (error) {
      console.error('Error setting user tier in Firestore:', error);
      return null;
    }
  }

  // Migrate models from localStorage to Firestore (one-time operation)
  async migrateModelsToFirestore(userId) {
    try {
      const allModels = localStorage.getItem(this.modelsKey);
      if (!allModels) return;

      const models = JSON.parse(allModels);
      const userModels = models[userId] || [];

      if (userModels.length === 0) return;

      console.log(`Migrating ${userModels.length} models to Firestore for user ${userId}`);

      // Migrate each model to Firestore
      for (const model of userModels) {
        try {
          const modelRef = doc(db, this.modelsCollection, model.id);
          await setDoc(modelRef, {
            ...model,
            userId: userId,
            createdAt: model.createdAt ? Timestamp.fromDate(new Date(model.createdAt)) : serverTimestamp(),
            updatedAt: model.updatedAt ? Timestamp.fromDate(new Date(model.updatedAt)) : serverTimestamp(),
            savedAt: model.savedAt ? Timestamp.fromDate(new Date(model.savedAt)) : serverTimestamp(),
            completedAt: model.completedAt ? Timestamp.fromDate(new Date(model.completedAt)) : null,
          });
        } catch (error) {
          console.error(`Error migrating model ${model.id}:`, error);
        }
      }

      // Mark migration as done
      localStorage.setItem(`${this.migrationDoneKey}_${userId}`, 'true');
      console.log('Migration completed for user', userId);
    } catch (error) {
      console.error('Error migrating models to Firestore:', error);
    }
  }

  // Get user's saved models from Firestore
  async getUserModels(userId) {
    try {
      // Check if migration is needed (one-time)
      const migrationDone = localStorage.getItem(`${this.migrationDoneKey}_${userId}`);
      if (!migrationDone) {
        await this.migrateModelsToFirestore(userId);
      }

      // Query Firestore for user's models
      const modelsRef = collection(db, this.modelsCollection);
      const q = query(
        modelsRef,
        where('userId', '==', userId)
        // Note: Removed orderBy to avoid requiring a composite index
        // We'll sort in JavaScript instead
      );

      const querySnapshot = await getDocs(q);
      const models = [];

      querySnapshot.forEach((docSnapshot) => {
        const data = docSnapshot.data();
        models.push({
          id: docSnapshot.id,
          ...data,
          // Convert Firestore Timestamps to ISO strings for compatibility
          createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
          updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt,
          savedAt: data.savedAt?.toDate?.()?.toISOString() || data.savedAt,
          completedAt: data.completedAt?.toDate?.()?.toISOString() || data.completedAt,
        });
      });

      // Sort by createdAt descending in JavaScript (most recent first)
      models.sort((a, b) => {
        const dateA = new Date(a.createdAt || a.updatedAt || a.savedAt || 0);
        const dateB = new Date(b.createdAt || b.updatedAt || b.savedAt || 0);
        return dateB - dateA;
      });

      return models;
    } catch (error) {
      console.error('Error getting user models from Firestore:', error);
      // Fallback to localStorage if Firestore fails
      try {
        const allModels = localStorage.getItem(this.modelsKey);
        const models = allModels ? JSON.parse(allModels) : {};
        return models[userId] || [];
      } catch (localError) {
        console.error('Error getting models from localStorage fallback:', localError);
        return [];
      }
    }
  }

  // Save a model for a user to Firestore
  async saveUserModel(userId, modelData) {
    try {
      const modelId = Date.now().toString();
      const modelRef = doc(db, this.modelsCollection, modelId);

      const modelToSave = {
        ...modelData,
        userId: userId,
        id: modelId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        savedAt: modelData.savedAt ? Timestamp.fromDate(new Date(modelData.savedAt)) : serverTimestamp(),
        completedAt: modelData.completedAt ? Timestamp.fromDate(new Date(modelData.completedAt)) : null,
      };

      await setDoc(modelRef, modelToSave);

      // Return model with converted timestamps for compatibility
      return {
        id: modelId,
        ...modelData,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    } catch (error) {
      console.error('Error saving user model to Firestore:', error);
      // Fallback to localStorage if Firestore fails
      try {
        const allModels = localStorage.getItem(this.modelsKey);
        const models = allModels ? JSON.parse(allModels) : {};

        if (!models[userId]) {
          models[userId] = [];
        }

        const newModel = {
          id: Date.now().toString(),
          ...modelData,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        models[userId].push(newModel);
        localStorage.setItem(this.modelsKey, JSON.stringify(models));
        return newModel;
      } catch (localError) {
        console.error('Error saving model to localStorage fallback:', localError);
        return null;
      }
    }
  }

  // Update a user's model in Firestore
  async updateUserModel(userId, modelId, updates) {
    try {
      const modelRef = doc(db, this.modelsCollection, modelId);
      const modelDoc = await getDoc(modelRef);

      if (!modelDoc.exists()) {
        console.warn(`Model ${modelId} not found in Firestore`);
        return null;
      }

      const modelData = modelDoc.data();
      if (modelData.userId !== userId) {
        console.warn(`User ${userId} does not own model ${modelId}`);
        return null;
      }

      // Convert date strings to Timestamps if present
      const firestoreUpdates = { ...updates };
      if (updates.completedAt && typeof updates.completedAt === 'string') {
        firestoreUpdates.completedAt = Timestamp.fromDate(new Date(updates.completedAt));
      }
      if (updates.savedAt && typeof updates.savedAt === 'string') {
        firestoreUpdates.savedAt = Timestamp.fromDate(new Date(updates.savedAt));
      }

      firestoreUpdates.updatedAt = serverTimestamp();

      await updateDoc(modelRef, firestoreUpdates);

      // Return updated model with converted timestamps
      const updatedData = modelDoc.data();
      return {
        id: modelId,
        ...updatedData,
        ...updates,
        createdAt: updatedData.createdAt?.toDate?.()?.toISOString() || updatedData.createdAt,
        updatedAt: new Date().toISOString(),
        savedAt: updatedData.savedAt?.toDate?.()?.toISOString() || updatedData.savedAt,
        completedAt: firestoreUpdates.completedAt?.toDate?.()?.toISOString() || firestoreUpdates.completedAt || updatedData.completedAt?.toDate?.()?.toISOString() || updatedData.completedAt,
      };
    } catch (error) {
      console.error('Error updating user model in Firestore:', error);
      // Fallback to localStorage
      try {
        const allModels = localStorage.getItem(this.modelsKey);
        const models = allModels ? JSON.parse(allModels) : {};

        if (!models[userId]) {
          return null;
        }

        const modelIndex = models[userId].findIndex(model => model.id === modelId);
        if (modelIndex !== -1) {
          models[userId][modelIndex] = {
            ...models[userId][modelIndex],
            ...updates,
            updatedAt: new Date().toISOString()
          };
          localStorage.setItem(this.modelsKey, JSON.stringify(models));
          return models[userId][modelIndex];
        }
        return null;
      } catch (localError) {
        console.error('Error updating model in localStorage fallback:', localError);
        return null;
      }
    }
  }

  // Delete a user's model from Firestore
  async deleteUserModel(userId, modelId) {
    try {
      const modelRef = doc(db, this.modelsCollection, modelId);
      const modelDoc = await getDoc(modelRef);

      if (!modelDoc.exists()) {
        console.warn(`Model ${modelId} not found in Firestore`);
        return false;
      }

      const modelData = modelDoc.data();
      if (modelData.userId !== userId) {
        console.warn(`User ${userId} does not own model ${modelId}`);
        return false;
      }

      await deleteDoc(modelRef);
      return true;
    } catch (error) {
      console.error('Error deleting user model from Firestore:', error);
      // Fallback to localStorage
      try {
        const allModels = localStorage.getItem(this.modelsKey);
        const models = allModels ? JSON.parse(allModels) : {};

        if (!models[userId]) {
          return false;
        }

        const modelIndex = models[userId].findIndex(model => model.id === modelId);
        if (modelIndex !== -1) {
          models[userId].splice(modelIndex, 1);
          localStorage.setItem(this.modelsKey, JSON.stringify(models));
          return true;
        }
        return false;
      } catch (localError) {
        console.error('Error deleting model from localStorage fallback:', localError);
        return false;
      }
    }
  }

  // Get model by ID from Firestore
  async getUserModelById(userId, modelId) {
    try {
      const modelRef = doc(db, this.modelsCollection, modelId);
      const modelDoc = await getDoc(modelRef);

      if (!modelDoc.exists()) {
        return null;
      }

      const data = modelDoc.data();
      if (data.userId !== userId) {
        return null;
      }

      return {
        id: modelId,
        ...data,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt,
        savedAt: data.savedAt?.toDate?.()?.toISOString() || data.savedAt,
        completedAt: data.completedAt?.toDate?.()?.toISOString() || data.completedAt,
      };
    } catch (error) {
      console.error('Error getting model by ID from Firestore:', error);
      // Fallback to localStorage
      try {
        const models = await this.getUserModels(userId);
        return models.find(model => model.id === modelId) || null;
      } catch (localError) {
        console.error('Error getting model from localStorage fallback:', localError);
        return null;
      }
    }
  }

  // Update a user's model by jobId in Firestore
  async updateUserModelByJobId(userId, jobId, updates) {
    try {
      // Query Firestore for model with matching jobId and userId
      const modelsRef = collection(db, this.modelsCollection);
      const q = query(
        modelsRef,
        where('userId', '==', userId),
        where('jobId', '==', jobId)
      );

      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        // Model not found - this is expected if the user hasn't saved the model yet
        // Silently return null (no console log to avoid cluttering)
        return null;
      }

      // Should only be one model with this jobId
      const modelDoc = querySnapshot.docs[0];
      const modelRef = doc(db, this.modelsCollection, modelDoc.id);

      // Convert date strings to Timestamps if present
      const firestoreUpdates = { ...updates };
      if (updates.completedAt && typeof updates.completedAt === 'string') {
        firestoreUpdates.completedAt = Timestamp.fromDate(new Date(updates.completedAt));
      }
      if (updates.savedAt && typeof updates.savedAt === 'string') {
        firestoreUpdates.savedAt = Timestamp.fromDate(new Date(updates.savedAt));
      }

      firestoreUpdates.updatedAt = serverTimestamp();

      await updateDoc(modelRef, firestoreUpdates);

      const updatedData = modelDoc.data();
      const result = {
        id: modelDoc.id,
        ...updatedData,
        ...updates,
        createdAt: updatedData.createdAt?.toDate?.()?.toISOString() || updatedData.createdAt,
        updatedAt: new Date().toISOString(),
        savedAt: firestoreUpdates.savedAt?.toDate?.()?.toISOString() || updatedData.savedAt?.toDate?.()?.toISOString() || updatedData.savedAt,
        completedAt: firestoreUpdates.completedAt?.toDate?.()?.toISOString() || updatedData.completedAt?.toDate?.()?.toISOString() || updatedData.completedAt,
      };

      return result;
    } catch (error) {
      console.error('Error updating user model by jobId in Firestore:', error);
      // Fallback to localStorage
      try {
        const allModels = localStorage.getItem(this.modelsKey);
        const models = allModels ? JSON.parse(allModels) : {};

        if (!models[userId]) {
          console.warn(`No models found for user ${userId}`);
          return null;
        }

        const modelIndex = models[userId].findIndex(model => model.jobId === jobId);
        if (modelIndex !== -1) {
          const updatedModel = {
            ...models[userId][modelIndex],
            ...updates,
            updatedAt: new Date().toISOString()
          };
          models[userId][modelIndex] = updatedModel;
          localStorage.setItem(this.modelsKey, JSON.stringify(models));
          return updatedModel;
        }
        return null;
      } catch (localError) {
        console.error('Error updating model in localStorage fallback:', localError);
        return null;
      }
    }
  }

  // Delete user account and all associated data
  async deleteUserAccount(userId) {
    try {
      // Remove user from users list (localStorage)
      const users = this.getUsers();
      const userIndex = users.findIndex(user => user.id === userId);

      if (userIndex !== -1) {
        users.splice(userIndex, 1);
        this.saveUsers(users);
      }

      // Delete all user's models from Firestore
      try {
        const modelsRef = collection(db, this.modelsCollection);
        const q = query(modelsRef, where('userId', '==', userId));
        const querySnapshot = await getDocs(q);

        const deletePromises = querySnapshot.docs.map(docSnapshot =>
          deleteDoc(doc(db, this.modelsCollection, docSnapshot.id))
        );

        await Promise.all(deletePromises);
        console.log(`Deleted ${deletePromises.length} models from Firestore for user ${userId}`);
      } catch (firestoreError) {
        console.error('Error deleting models from Firestore:', firestoreError);
        // Continue with localStorage cleanup even if Firestore fails
      }

      // Also clean up localStorage models (fallback)
      const allModels = localStorage.getItem(this.modelsKey);
      if (allModels) {
        const models = JSON.parse(allModels);
        if (models[userId]) {
          delete models[userId];
          localStorage.setItem(this.modelsKey, JSON.stringify(models));
        }
      }

      return true;
    } catch (error) {
      console.error('Error deleting user account:', error);
      return false;
    }
  }
}

export default new UserService(); 