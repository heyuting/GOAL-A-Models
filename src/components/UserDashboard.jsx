import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import userService from '@/services/userService';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function UserDashboard({ onLogout, onNavigateToModels, onViewModel }) {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('profile');
  const [savedModels, setSavedModels] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      const models = userService.getUserModels(user.id);
      setSavedModels(models);
      setLoading(false);
    }
  }, [user]);

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'running':
        return 'bg-blue-100 text-blue-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const handleDeleteModel = (modelId) => {
    if (window.confirm('Are you sure you want to delete this model?')) {
      const success = userService.deleteUserModel(user.id, modelId);
      if (success) {
        setSavedModels(prev => prev.filter(model => model.id !== modelId));
      }
    }
  };

  const handleViewModel = (model) => {
    if (onViewModel) {
      onViewModel(model);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-gray-100 min-h-screen">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-800">Welcome back, {user.name}!</h1>
            <p className="text-gray-600">Manage your models and configurations</p>
          </div>
          <div className="flex items-center space-x-3">
            <Button
              variant="outline"
              onClick={onNavigateToModels}
              className="border-blue-300 text-blue-600 hover:bg-blue-50"
            >
              Back to Models
            </Button>
            <Button
              onClick={onLogout}
              variant="outline"
              className="border-red-300 text-red-600 hover:bg-red-50"
            >
              Sign Out
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex space-x-1 mb-6 bg-white rounded-lg p-1 shadow-sm">
          <button
            onClick={() => setActiveTab('profile')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'profile'
                ? 'bg-blue-500 text-white'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Profile
          </button>
          <button
            onClick={() => setActiveTab('models')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'models'
                ? 'bg-blue-500 text-white'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            My Models ({savedModels.length})
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'settings'
                ? 'bg-blue-500 text-white'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Settings
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'profile' && (
          <div>
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle>Profile Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-700">Name</label>
                    <p className="text-gray-900">{user.name}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Email</label>
                    <p className="text-gray-900">{user.email}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Member Since</label>
                    <p className="text-gray-900">{formatDate(user.createdAt)}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">User ID</label>
                    <p className="text-gray-900 font-mono text-sm">{user.id}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {activeTab === 'models' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold text-gray-800">Saved Models</h2>
              <Button className="bg-blue-500 hover:bg-blue-600" onClick={onNavigateToModels}>
                Run New Model
              </Button>
            </div>
            
            {savedModels.length === 0 ? (
              <Card className="shadow-lg">
                <CardContent className="text-center py-12">
                  <p className="text-gray-500 mb-4">No saved models yet</p>
                  <Button className="bg-blue-500 hover:bg-blue-600" onClick={onNavigateToModels}>
                    Run Your First Model
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {savedModels.map((model) => (
                  <Card key={model.id} className="shadow-lg hover:shadow-xl transition-shadow">
                    <CardContent className="p-6">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <h3 className="text-lg font-semibold text-gray-800 mb-2">
                            {model.name}
                          </h3>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                            <div>
                              <span className="text-gray-600">Model:</span>
                              <span className="ml-2 font-medium">{model.model}</span>
                            </div>
                            <div>
                              <span className="text-gray-600">Location:</span>
                              <span className="ml-2 font-medium">{model.location}</span>
                            </div>
                            <div>
                              <span className="text-gray-600">Created:</span>
                              <span className="ml-2 font-medium">{formatDate(model.createdAt)}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center space-x-3">
                          <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(model.status)}`}>
                            {model.status}
                          </span>
                          <Button variant="outline" size="sm" onClick={() => handleViewModel(model)}>
                            View
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleDeleteModel(model.id)}
                            className="text-red-600 border-red-300 hover:bg-red-50"
                          >
                            Delete
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'settings' && (
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle>Account Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-medium text-gray-800 mb-2">Preferences</h3>
                  <p className="text-gray-600">Settings and preferences will be available here.</p>
                </div>
                <div>
                  <h3 className="text-lg font-medium text-gray-800 mb-2">Data Management</h3>
                  <p className="text-gray-600">Manage your saved data and model configurations.</p>
                </div>
                <div>
                  <h3 className="text-lg font-medium text-gray-800 mb-2">Notifications</h3>
                  <p className="text-gray-600">Configure email notifications for model completion.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
} 