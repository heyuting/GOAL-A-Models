import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import userService from '@/services/userService';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { formatLocationLimit, getTierConfig } from '@/config/userTiers';

export default function UserDashboard({ onLogout, onNavigateToModels, onViewModel }) {
  const { user, deleteAccount } = useAuth();
  const tierConfig = getTierConfig(user);
  const [activeTab, setActiveTab] = useState('profile');
  const [savedModels, setSavedModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [renamingModelId, setRenamingModelId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);

  const refreshModels = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const models = await userService.getUserModels(user.id);
      setSavedModels(Array.isArray(models) ? [...models] : []);
    } catch (error) {
      console.error('Error loading models:', error);
      setSavedModels([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      refreshModels();
    }
  }, [user]);

  useEffect(() => {
    if (user && activeTab === 'models') {
      refreshModels();
    }
  }, [activeTab]);

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const handleDeleteModel = async (modelId) => {
    if (window.confirm('Are you sure you want to delete this model?')) {
      try {
        const success = await userService.deleteUserModel(user.id, modelId);
        if (success) {
          setSavedModels(prev => prev.filter(model => model.id !== modelId && model.timestamp !== modelId));
          if (renamingModelId === modelId) {
            setRenamingModelId(null);
            setRenameValue('');
          }
        } else {
          console.error('Failed to delete model:', modelId);
          alert('Failed to delete model. Please try again.');
        }
      } catch (error) {
        console.error('Error deleting model:', error);
        alert('Failed to delete model. Please try again.');
      }
    }
  };

  const startRenameModel = (model) => {
    const id = model.id || model.timestamp;
    setRenamingModelId(id);
    setRenameValue(model.name || '');
  };

  const cancelRenameModel = () => {
    setRenamingModelId(null);
    setRenameValue('');
  };

  const handleRenameModel = async (model) => {
    const modelId = model.id || model.timestamp;
    const nextName = String(renameValue || '').trim();
    if (!nextName) {
      alert('Please enter a model name.');
      return;
    }
    if (nextName === (model.name || '').trim()) {
      cancelRenameModel();
      return;
    }

    setIsRenaming(true);
    try {
      const updated = await userService.updateUserModel(user.id, modelId, { name: nextName });
      if (!updated) {
        throw new Error('Failed to rename model.');
      }
      setSavedModels((prev) =>
        prev.map((m) =>
          (m.id || m.timestamp) === modelId ? { ...m, name: nextName, updatedAt: new Date().toISOString() } : m
        )
      );
      cancelRenameModel();
    } catch (error) {
      console.error('Error renaming model:', error);
      alert(error?.message || 'Failed to rename model. Please try again.');
    } finally {
      setIsRenaming(false);
    }
  };

  const handleViewModel = (model) => {
    if (onViewModel) {
      onViewModel(model);
    } else {
      alert('View functionality is not available. Please contact support.');
    }
  };

  const handleDeleteAccount = async () => {
    const confirmMessage = `Are you sure you want to delete your account?\n\nThis action will permanently delete:\n• Your profile and account information\n• All saved models and configurations\n• Model run history and results\n• All associated data and preferences\n\nThis action cannot be undone.`;
    
    if (window.confirm(confirmMessage)) {
      const secondConfirm = window.confirm('This is your final warning. Are you absolutely sure you want to delete your account? Type "DELETE" in the next prompt to confirm.');
      
      if (secondConfirm) {
        const finalConfirm = window.prompt('Please type "DELETE" to confirm account deletion:');
        
        if (finalConfirm === 'DELETE') {
          try {
            // First attempt without password
            await deleteAccount();
            alert('Your account has been successfully deleted.');
            // No need to call onLogout() - the user will be automatically signed out
          } catch (error) {
            if (error.message === 'REQUIRES_RECENT_LOGIN') {
              // Need to re-authenticate - prompt for password
              const password = window.prompt('For security reasons, please enter your password to confirm account deletion:');
              
              if (password) {
                try {
                  // Retry with password
                  await deleteAccount(password);
                  alert('Your account has been successfully deleted.');
                  // No need to call onLogout() - the user will be automatically signed out
                } catch (reauthError) {
                  alert(`There was an error deleting your account: ${reauthError.message}. Please try again or contact support.`);
                }
              } else {
                alert('Account deletion cancelled - password is required for security verification.');
              }
            } else {
              alert(`There was an error deleting your account: ${error.message}. Please try again or contact support.`);
            }
          }
        } else {
          alert('Account deletion cancelled - confirmation text did not match.');
        }
      }
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
    <div className="text-lg p-6 bg-gray-100 min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {/* Tabs */}
        <div className="flex space-x-1 mb-6 bg-white rounded-lg p-1 shadow-sm">
          <button
            onClick={() => setActiveTab('profile')}
            className={`px-4 py-2 rounded-md text-lg font-medium transition-colors ${
              activeTab === 'profile'
                ? 'bg-blue-500 text-white'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Profile
          </button>
          <button
            onClick={() => setActiveTab('models')}
            className={`px-4 py-2 rounded-md text-lg font-medium transition-colors ${
              activeTab === 'models'
                ? 'bg-blue-500 text-white'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            My Models ({savedModels.length})
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`px-4 py-2 rounded-md text-lg font-medium transition-colors ${
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
                    <label className="text-sm font-medium text-gray-700">Access level</label>
                    <p className="text-gray-900 capitalize">{tierConfig.label}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Locations per run</label>
                    <p className="text-gray-900">{formatLocationLimit(tierConfig.locationLimit)}</p>
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
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={refreshModels} disabled={loading}>
                  Refresh
                </Button>
                <Button className="bg-blue-500 hover:bg-blue-600" onClick={onNavigateToModels}>
                  Run New Model
                </Button>
              </div>
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
                {savedModels.map((model) => {
                  const modelId = model.id || model.timestamp;
                  const isEditingName = renamingModelId === modelId;
                  return (
                  <Card key={modelId} className="shadow-lg hover:shadow-xl transition-shadow">
                    <CardContent className="p-6">
                      <div className="flex justify-between items-start gap-4">
                        <div className="flex-1 min-w-0">
                          {isEditingName ? (
                            <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-2">
                              <Input
                                value={renameValue}
                                onChange={(e) => setRenameValue(e.target.value)}
                                className="text-sm"
                                placeholder="Model name"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleRenameModel(model);
                                  if (e.key === 'Escape') cancelRenameModel();
                                }}
                              />
                              <div className="flex items-center gap-2 shrink-0">
                                <Button
                                  size="sm"
                                  onClick={() => handleRenameModel(model)}
                                  disabled={isRenaming || !renameValue.trim()}
                                  className="bg-blue-500 text-white hover:bg-blue-600"
                                >
                                  {isRenaming ? 'Saving…' : 'Save'}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={cancelRenameModel}
                                  disabled={isRenaming}
                                >
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <h3 className="text-lg font-semibold text-gray-800 mb-2">
                              {model.name || 'Unnamed Model'}
                            </h3>
                          )}
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                            <div>
                              <span className="text-gray-600">Model:</span>
                              <span className="ml-2 font-medium">{model.model || 'DRN'}</span>
                            </div>
                            <div>
                              <span className="text-gray-600">Created:</span>
                              <span className="ml-2 font-medium">
                                {model.createdAt ? formatDate(model.createdAt) : 
                                 model.timestamp ? formatDate(model.timestamp) : 'Unknown date'}
                              </span>
                            </div>

                          </div>
                        </div>
                        <div className="flex items-center space-x-2 shrink-0">
                          {!isEditingName ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => startRenameModel(model)}
                              className="border-gray-300 text-gray-700 hover:bg-gray-50"
                              title="Rename this saved model"
                            >
                              Rename
                            </Button>
                          ) : null}
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => handleViewModel(model)}
                            className="bg-blue-500 text-white hover:bg-blue-600 border-blue-500"
                            title="View model configuration and download results"
                          >
                            View
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleDeleteModel(modelId)}
                            className="text-red-600 border-red-300 hover:bg-red-50"
                          >
                            Delete
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="space-y-6">
            {/* Danger Zone */}
            <Card className="shadow-lg border-red-200">
              <CardContent className="space-y-4 p-6">
                <div>
                  <h3 className="text-lg font-medium text-red-800 mb-2">Delete Account</h3>
                  <p className="text-red-600 mb-4">
                    Permanently delete your account and all associated data. This action cannot be undone.
                  </p>
                  <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-4">
                    <h4 className="text-sm font-medium text-red-800 mb-2">What will be deleted:</h4>
                    <ul className="text-sm text-red-700 space-y-1">
                      <li>• Your profile and account information</li>
                      <li>• All saved models and configurations</li>
                      <li>• Model run history and results</li>
                      <li>• All associated data and preferences</li>
                    </ul>
                  </div>
                  <Button
                    variant="outline"
                    onClick={handleDeleteAccount}
                    className="bg-red-600 text-white border-red-600 hover:bg-red-700 hover:border-red-700"
                  >
                    Delete My Account
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
} 