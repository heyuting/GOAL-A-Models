// User service for managing user data and model configurations
class UserService {
  constructor() {
    this.usersKey = 'goal-a-users';
    this.modelsKey = 'goal-a-models';
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

  // Create a new user
  createUser(userData) {
    const users = this.getUsers();
    const newUser = {
      id: Date.now().toString(),
      ...userData,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
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

  // Update user
  updateUser(userId, updates) {
    const users = this.getUsers();
    const userIndex = users.findIndex(user => user.id === userId);
    
    if (userIndex !== -1) {
      users[userIndex] = {
        ...users[userIndex],
        ...updates,
        updatedAt: new Date().toISOString()
      };
      this.saveUsers(users);
      return users[userIndex];
    }
    return null;
  }

  // Get user's saved models
  getUserModels(userId) {
    try {
      const allModels = localStorage.getItem(this.modelsKey);
      const models = allModels ? JSON.parse(allModels) : {};
      return models[userId] || [];
    } catch (error) {
      console.error('Error getting user models:', error);
      return [];
    }
  }

  // Save a model for a user
  saveUserModel(userId, modelData) {
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
    } catch (error) {
      console.error('Error saving user model:', error);
      return null;
    }
  }

  // Update a user's model
  updateUserModel(userId, modelId, updates) {
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
    } catch (error) {
      console.error('Error updating user model:', error);
      return null;
    }
  }

  // Delete a user's model
  deleteUserModel(userId, modelId) {
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
    } catch (error) {
      console.error('Error deleting user model:', error);
      return false;
    }
  }

  // Get model by ID
  getUserModelById(userId, modelId) {
    const models = this.getUserModels(userId);
    return models.find(model => model.id === modelId);
  }
}

export default new UserService(); 