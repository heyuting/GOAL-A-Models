import { useState, useEffect, useCallback, useRef } from "react";
import MapComponent from "./Map";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from '@/contexts/AuthContext';
import userService from '@/services/userService';

// API base URL configuration - Use relative URLs for local development (proxied through Vite)
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

// Helper function to get full API URL
const getApiUrl = (endpoint) => {
  if (API_BASE_URL) {
    // If environment variable is set, use full URL
    return `${API_BASE_URL}/${endpoint}`;
  } else {
    // Otherwise use relative URL (proxied through Vite)
    return `/${endpoint}`;
  }
};

export default function DRNConfig({ savedData }) {
  const { user } = useAuth();
  // DRN parameters
  const [selectedLocations, setSelectedLocations] = useState([]);
  const [currentLocationIndex, setCurrentLocationIndex] = useState(-1);
  const [numStart, setNumStart] = useState(1);
  const [yearRun, setYearRun] = useState(24);
  const [timeStep, setTimeStep] = useState(0.1);
  const [manualLat, setManualLat] = useState('');
  const [manualLng, setManualLng] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  // Job submission states
  const [isSubmittingJob, setIsSubmittingJob] = useState(false);
  const [jobId, setJobId] = useState(null);
  const [jobStatus, setJobStatus] = useState(null);
  const [jobError, setJobError] = useState(null);
  const [jobSubmissionMessage, setJobSubmissionMessage] = useState('');
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [jobLogs, setJobLogs] = useState([]);
  const [lastStatusCheck, setLastStatusCheck] = useState(null);
  const [consecutiveTimeouts, setConsecutiveTimeouts] = useState(0);
  const [hasSavedJob, setHasSavedJob] = useState(false); // Track if there's a saved job

  // Helper functions for job state persistence
  const saveJobStateToStorage = useCallback((jobData) => {
    try {
      // Check if localStorage is available
      if (typeof window === 'undefined' || !window.localStorage) {
        return;
      }
      
      // Validate jobData
      if (!jobData || typeof jobData !== 'object') {
        return;
      }
      
      const dataToSave = {
        ...jobData,
        timestamp: Date.now()
      };
      
      localStorage.setItem('drnJobState', JSON.stringify(dataToSave));
      
    } catch (error) {
      console.warn('Failed to save job state to localStorage:', error);
    }
  }, []);

  const loadJobStateFromStorage = useCallback(() => {
    try {
      // Check if localStorage is available
      if (typeof window === 'undefined' || !window.localStorage) {
        return null;
      }
      
      const saved = localStorage.getItem('drnJobState');
      if (saved && saved !== 'undefined') {
        const jobData = JSON.parse(saved);
        // Validate the jobData structure
        if (jobData && typeof jobData === 'object' && jobData.timestamp) {
          // Only restore if saved within last 24 hours
          if (Date.now() - jobData.timestamp < 24 * 60 * 60 * 1000) {
            return jobData;
          } else {
            // Clean up old job state
            localStorage.removeItem('drnJobState');
          }
        }
      }
    } catch (error) {
      console.warn('Failed to load job state from localStorage:', error);
      // Clean up corrupted data
      try {
        localStorage.removeItem('drnJobState');
      } catch {
        // Ignore cleanup error
      }
    }
    return null;
  }, []);

  const clearJobStateFromStorage = useCallback(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.removeItem('drnJobState');
      }
    } catch (error) {
      console.warn('Failed to clear job state from localStorage:', error);
    }
  }, []);

  const validateWithinConus = (lat, lng) => (
    lat >= 24.396308 &&
    lat <= 49.384358 &&
    lng >= -125.00165 &&
    lng <= -66.93457
  );

  // Load saved data on component mount
  useEffect(() => {
    if (savedData) {
      // Load saved locations if they exist
      if (savedData.parameters && savedData.parameters.locations) {
        setSelectedLocations(savedData.parameters.locations);
        setCurrentLocationIndex(savedData.parameters.locations.length - 1);
      }
      // Load other saved parameters
      if (savedData.parameters) {
        setNumStart(savedData.parameters.numStart || 1);
        const savedDuration = savedData.parameters.yearRun;
        if (typeof savedDuration === 'number') {
          if (savedDuration <= 2) {
            setYearRun(savedDuration * 12);
          } else {
            setYearRun(savedDuration);
          }
        } else {
          setYearRun(24);
        }
      } else {
        setYearRun(24);
      }
    }
  }, [savedData]);

  const validateCoordinates = (lat, lng) => {
    const parsedLat = parseFloat(lat);
    const parsedLng = parseFloat(lng);

    if (Number.isNaN(parsedLat) || Number.isNaN(parsedLng)) {
      return { valid: false, message: 'Please enter valid numeric latitude and longitude values.' };
    }

    if (parsedLat < -90 || parsedLat > 90 || parsedLng < -180 || parsedLng > 180) {
      return { valid: false, message: 'Latitude must be between -90 and 90, and longitude between -180 and 180.' };
    }

    if (!validateWithinConus(parsedLat, parsedLng)) {
      return { valid: false, message: 'Please select a location within the contiguous United States (CONUS).' };
    }

    return { valid: true, lat: parsedLat, lng: parsedLng };
  };

  const addLocation = (lat, lng) => {
    const validation = validateCoordinates(lat, lng);
    if (!validation.valid) {
      alert(validation.message);
      return false;
    }

    if (selectedLocations.length >= 5) {
      alert('Maximum 5 locations allowed. Please remove some locations first.');
      return false;
    }

    const newLocation = {
      lat: validation.lat,
      lng: validation.lng,
      ewRiverInput: 0
    };

    setSelectedLocations(prev => {
      const newLocations = [...prev, newLocation];
      setCurrentLocationIndex(newLocations.length - 1);
      return newLocations;
    });

    return true;
  };

  const handleManualAddLocation = () => {
    const added = addLocation(manualLat, manualLng);
    if (added) {
      setManualLat('');
      setManualLng('');
    }
  };
 
  // Handle location selection
  const handleLocationSelect = (location) => {
    addLocation(location.lat, location.lng);
  };

  const handleCoordinateBlur = (index, field, value, target) => {
    if (value === '') {
      target.value = selectedLocations[index][field];
      return;
    }

    const current = selectedLocations[index];
    const newLat = field === 'lat' ? value : current.lat;
    const newLng = field === 'lng' ? value : current.lng;

    const validation = validateCoordinates(newLat, newLng);
    if (!validation.valid) {
      alert(validation.message);
      target.value = selectedLocations[index][field];
      return;
    }

    setSelectedLocations(prev => {
      const updated = [...prev];
      updated[index] = {
        ...current,
        lat: validation.lat,
        lng: validation.lng
      };
      return updated;
    });
  };
 
  // Remove a specific location
  const removeLocation = (index) => {
    const newLocations = selectedLocations.filter((_, i) => i !== index);
    setSelectedLocations(newLocations);
    
    // Adjust current location index
    if (currentLocationIndex >= newLocations.length) {
      setCurrentLocationIndex(Math.max(0, newLocations.length - 1));
    } else if (currentLocationIndex === index) {
      setCurrentLocationIndex(Math.max(0, newLocations.length - 1));
    }
  };

  // Clear all locations
  const clearAllLocations = () => {
    setSelectedLocations([]);
    setCurrentLocationIndex(-1);
  };

  // Get current selected location for backward compatibility
  const selectedLocation = currentLocationIndex >= 0 ? selectedLocations[currentLocationIndex] : null;

  // Define checkJobStatus early to avoid dependency issues
  const checkJobStatus = useCallback(async (jobId) => {
    if (!jobId) return;

    setIsCheckingStatus(true);
    try {
      const apiUrl = getApiUrl(`api/check-job-status/${jobId}`);
      console.log('Checking job status at:', apiUrl);
      
      const response = await fetch(apiUrl, {
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true',
        },
        // Add timeout to prevent hanging requests
        signal: AbortSignal.timeout(180000) // 3 minute timeout for Duo 2FA
      });
      
      console.log('Response status:', response.status);
      console.log('Response headers:', Object.fromEntries(response.headers.entries()));
      
      // Check if response has content
      const responseText = await response.text();
      console.log('Response text:', responseText);
      
      let result;
      try {
        result = JSON.parse(responseText);
      } catch (parseError) {
        console.error('JSON parse error:', parseError);
        console.error('Raw response:', responseText);
        throw new Error(`Invalid JSON response from server. Got: ${responseText.substring(0, 100)}...`);
      }

      if (response.ok) {
        const logs = result.logs || [];
        let message = '';
        let error = null;

        // Update message based on status
        switch (result.status) {
          case 'running':
            message = `Job ${jobId} is currently running...`;
            break;
          case 'completed':
            message = `Job ${jobId} completed successfully!`;
            break;
          case 'failed':
            message = `Job ${jobId} failed. Check logs for details.`;
            error = result.error || 'Job execution failed';
            break;
          case 'pending':
            message = `Job ${jobId} is pending in queue...`;
            break;
          default:
            message = `Job ${jobId} status: ${result.status}`;
        }

        // Update state
        setJobStatus(result.status);
        setJobLogs(logs);
        setJobSubmissionMessage(message);
        if (error) {
          setJobError(error);
        }

        // Clear any previous connection errors
        if (jobError && (jobError.includes('timeout') || jobError.includes('Authentication'))) {
          setJobError(null);
        }

        // Reset consecutive timeouts on successful check
        setConsecutiveTimeouts(0);
        setLastStatusCheck(new Date());

        // Save updated job state to localStorage
        const jobState = {
          jobId: jobId,
          jobStatus: result.status,
          jobError: error,
          jobSubmissionMessage: message,
          jobLogs: logs,
          lastStatusCheck: new Date().toISOString()
        };
        saveJobStateToStorage(jobState);
      } else {
        throw new Error(result.error || 'Failed to check job status');
      }
    } catch (error) {
      console.error('Error checking job status:', error);
      
      // Handle specific error types with better messaging
      if (error.name === 'AbortError' || error.name === 'TimeoutError' || error.message.includes('timed out')) {
        // Increment consecutive timeouts
        const newTimeouts = consecutiveTimeouts + 1;
        setConsecutiveTimeouts(newTimeouts);
        
        // Show different messages based on consecutive timeouts
        if (newTimeouts === 1) {
          setJobSubmissionMessage(`Job ${jobId} - SSH authentication timeout (likely Duo 2FA). Retrying automatically...`);
        } else if (newTimeouts < 3) {
          setJobSubmissionMessage(`Job ${jobId} - SSH timeout (${newTimeouts} in a row). May need manual Duo verification on server.`);
        } else {
          setJobError(`SSH authentication issues (${newTimeouts} timeouts). Server may need Duo 2FA verification. Job likely still running.`);
        }
        console.warn(`Status check timed out (${newTimeouts} consecutive), will retry automatically`);
      } else if (error.message.includes('Authentication timeout')) {
        setJobError('SSH authentication timeout. Job may still be running. Will retry automatically.');
      } else if (error.message.includes('fetch') || error.message.includes('NetworkError')) {
        setJobError('Network error. Check your connection. Will retry automatically.');
      } else if (error.message.includes('500') || error.message.includes('Internal Server Error')) {
        setJobError('Server error. Job may still be running. Will retry automatically.');
      } else {
        // Only set persistent errors for unexpected errors
        setJobError(`Status check failed: ${error.message}`);
      }
    } finally {
      setIsCheckingStatus(false);
    }
  }, [saveJobStateToStorage, jobError, consecutiveTimeouts]);

  // Use refs to store stable references to functions
  const checkJobStatusRef = useRef(checkJobStatus);
  const clearJobStateFromStorageRef = useRef(clearJobStateFromStorage);
  const loadJobStateFromStorageRef = useRef(loadJobStateFromStorage);

  // Update refs when functions change
  useEffect(() => {
    checkJobStatusRef.current = checkJobStatus;
    clearJobStateFromStorageRef.current = clearJobStateFromStorage;
    loadJobStateFromStorageRef.current = loadJobStateFromStorage;
  });

  // Restore job state from localStorage on component mount
  useEffect(() => {
    let mounted = true; // Prevent state updates if component unmounts
    
    const restoreJobState = async () => {
      try {
        const savedJobState = loadJobStateFromStorageRef.current();
        console.log('Checking for saved job state:', savedJobState);
        
        if (savedJobState && savedJobState.jobId && mounted) {
          console.log('Restoring saved job:', savedJobState.jobId, 'Status:', savedJobState.jobStatus);
          // Mark that there's a saved job
          setHasSavedJob(true);
          
          // Validate the saved state structure
          setJobId(savedJobState.jobId || null);
          setJobStatus(savedJobState.jobStatus || null);
          setJobError(savedJobState.jobError || null);
          setJobSubmissionMessage(savedJobState.jobSubmissionMessage || '');
          setJobLogs(Array.isArray(savedJobState.jobLogs) ? savedJobState.jobLogs : []);
          
          // Restore last status check time if available
          if (savedJobState.lastStatusCheck) {
            setLastStatusCheck(new Date(savedJobState.lastStatusCheck));
          }
          
          // If job is still active, start monitoring
          if (savedJobState.jobId && ['submitted', 'pending', 'running'].includes(savedJobState.jobStatus)) {
            // Check status immediately (with a slight delay to ensure everything is initialized)
            setTimeout(() => {
              if (mounted) {
                checkJobStatusRef.current(savedJobState.jobId).catch(error => {
                  console.warn('Initial status check failed:', error.message);
                  // Don't throw error, just log it - the periodic checker will retry
                });
              }
            }, 1000);
          }
        } else {
          // No saved job found
          console.log('No saved job state found in localStorage');
          setHasSavedJob(false);
        }
      } catch (error) {
        console.error('Error restoring job state:', error);
        // Clear potentially corrupted state
        if (mounted) {
          clearJobStateFromStorageRef.current();
          setHasSavedJob(false);
        }
      }
    };

    restoreJobState();

    return () => {
      mounted = false;
    };
  }, []); // Empty dependency array to run only once on mount

  // Job status monitoring effect with adaptive retry intervals
  useEffect(() => {
    let interval;
    
    if (jobId && (jobStatus === 'submitted' || jobStatus === 'pending' || jobStatus === 'running')) {
      // Adaptive interval based on consecutive timeouts
      // Start at 5 minutes to reduce Duo 2FA prompts, increase to max 15 minutes for persistent issues
      const baseInterval = 300000; // 5 minutes (reduced 2FA prompts)
      const maxInterval = 900000;  // 15 minutes
      const adaptiveInterval = Math.min(baseInterval * (1 + consecutiveTimeouts * 0.5), maxInterval);
      
      console.log(`Setting up job monitoring every ${adaptiveInterval/60000} minutes (${consecutiveTimeouts} consecutive timeouts)`);
      
      interval = setInterval(async () => {
        try {
          await checkJobStatus(jobId);
        } catch (error) {
          console.warn('Periodic status check failed:', error.message);
          // Don't stop monitoring on errors, just log and continue
        }
      }, adaptiveInterval);
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [jobId, jobStatus, checkJobStatus, consecutiveTimeouts]);

  // Job submission functions
  const submitJobToGrace = async () => {
    if (selectedLocations.length === 0) {
      setJobSubmissionMessage('Please select at least one location first');
      return;
    }

    setIsSubmittingJob(true);
    setJobError(null);
    setJobSubmissionMessage(`Submitting DRN job for ${selectedLocations.length} location(s) to Yale Grace server...`);

    try {
      const jobData = {
        model: 'DRN',
        locations: selectedLocations.map(location => ({
          lat: location.lat,
          lng: location.lng,
          ewRiverInput: location.ewRiverInput || 0
        })),
        numStart,
        yearRun,
        timeStep
      };

      // Call backend proxy API
      const response = await fetch(getApiUrl('api/run-job'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true',
        },
        body: JSON.stringify(jobData),
      });

      const result = await response.json();

      if (response.ok && result.job_id) {
        const jobState = {
          jobId: result.job_id,
          jobStatus: 'submitted',
          jobError: null,
          jobSubmissionMessage: `DRN job submitted successfully for ${selectedLocations.length} location(s)! Job ID: ${result.job_id}`,
          jobLogs: []
        };
        
        setJobId(jobState.jobId);
        setJobStatus(jobState.jobStatus);
        setJobSubmissionMessage(jobState.jobSubmissionMessage);
        
        // Save job state to localStorage
        saveJobStateToStorage(jobState);
      } else {
        throw new Error(result.error || 'Failed to submit job');
      }
    } catch (error) {
      console.error('Error submitting job:', error);
      setJobError(error.message);
      setJobSubmissionMessage('Failed to submit job. Please try again.');
    } finally {
      setIsSubmittingJob(false);
    }
  };

  const resetJob = useCallback(() => {
    setJobId(null);
    setJobStatus(null);
    setJobError(null);
    setJobSubmissionMessage('');
    setJobLogs([]);
    setLastStatusCheck(null);
    setConsecutiveTimeouts(0);
    setHasSavedJob(false); // Clear saved job status
    
    // Clear job state from localStorage
    clearJobStateFromStorage();
  }, [clearJobStateFromStorage]);

  const handleSaveModel = async () => {
    if (!user) {
      setSaveMessage('Please log in to save models');
      return;
    }

    if (selectedLocations.length === 0) {
      setSaveMessage('Please select at least one location first');
      return;
    }

    setIsSaving(true);
    setSaveMessage('');

    try {
      const modelData = {
        name: `DRN Model - ${selectedLocations.length} locations`,
        location: selectedLocations.length > 0 
          ? `${selectedLocations[0].lat.toFixed(3)}, ${selectedLocations[0].lng.toFixed(3)} + ${selectedLocations.length - 1} more`
          : 'No locations selected',
        parameters: {
          locations: selectedLocations.map(location => ({
            lat: location.lat,
            lng: location.lng,
            ewRiverInput: location.ewRiverInput || 0
          })),
          numStart,
          yearRun,
          timeStep
        },
        timestamp: new Date().toISOString(),
        userId: user?.id || 'anonymous'
      };

      let savedModel;
      
      if (savedData) {
        // Update existing model
        savedModel = userService.updateUserModel(user.id, savedData.id, modelData);
        if (savedModel) {
          setSaveMessage('Model updated successfully!');
        } else {
          setSaveMessage('Failed to update model');
        }
      } else {
        // Create new model
        savedModel = userService.saveUserModel(user.id, modelData);
        if (savedModel) {
          setSaveMessage('Model saved successfully!');
        } else {
          setSaveMessage('Failed to save model');
        }
      }
      
      setTimeout(() => setSaveMessage(''), 3000);
    } catch (error) {
      console.error('Error saving model:', error);
      setSaveMessage('Error saving model');
    } finally {
      setIsSaving(false);
    }
  };

  const updateLocationParameter = (index, key, value) => {
    const newLocations = [...selectedLocations];
    newLocations[index] = { ...newLocations[index], [key]: value };
    setSelectedLocations(newLocations);
  };

  return (
    <div>
      <div className="flex gap-6">
        <div className="w-3/5">
          <h3 className="text-xl font-bold text-center mb-6 text-gray-800">DRN Area of Interest</h3>
          
          {/* Location Management Controls */}
          <div className="mb-4">
          </div>
          
          <MapComponent 
            onLocationSelect={handleLocationSelect} 
            disabled={!!jobId} 
            selectedLocations={selectedLocations}
            currentLocationIndex={currentLocationIndex}
          />
          
          {/* Job Logs Display - Moved under the map */}
          {jobLogs.length > 0 && (
            <div className="mt-12 bg-gray-900 text-green-400 p-4 rounded-lg border font-mono text-sm max-h-64 overflow-y-auto">
              <div className="font-semibold mb-3 text-white text-base">
                Job Logs: <span className="text-blue-300">drn_{jobId}_1.out</span>
              </div>
              {jobLogs.map((log, index) => (
                <div key={index} className="mb-1 break-words">{log}</div>
              ))}
            </div>
          )}
        </div>
        <div className="w-2/5">
          <h3 className="text-xl font-bold text-center mb-6 text-gray-800">DRN Model Configuration</h3>
          <Card className="mt-17 p-6 shadow-lg rounded-2xl border border-gray-200">
            <CardContent>
              <h3 className="text-xl font-semibold">1. Select Locations within CONUS (up to 5)</h3>
              <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                <div className="flex justify-between gap-2">
                  <div>
                    <Label htmlFor="manualLat" className="text-sm font-medium text-blue-900">Latitude</Label>
                    <Input
                      id="manualLat"
                      type="number"
                      step="0.0001"
                      value={manualLat}
                      onChange={(e) => setManualLat(e.target.value)}
                      placeholder="e.g., 40.1234"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="manualLng" className="text-sm font-medium text-blue-900">Longitude</Label>
                    <Input
                      id="manualLng"
                      type="number"
                      step="0.0001"
                      value={manualLng}
                      onChange={(e) => setManualLng(e.target.value)}
                      placeholder="e.g., -105.5678"
                      className="mt-1"
                    />
                  </div>
                  <div className="flex items-end justify-end">
                    <Button
                      type="button"
                      onClick={handleManualAddLocation}
                      className="w-20 bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      Add
                    </Button>
                  </div>
                </div>
              </div>
              <div className="flex justify-between items-center mb-4 mt-3">
                <p className="text-gray-500">
                  {selectedLocations.length > 0 
                    ? `${selectedLocations.length} location(s) selected. Current: ${selectedLocation?.lat.toFixed(3)}, ${selectedLocation?.lng.toFixed(3)}`
                    : "No locations selected"}
                </p>
                {selectedLocations.length > 0 && (
                  <Button
                    onClick={clearAllLocations}
                    className="px-3 py-1 mr-3 text-sm bg-red-500 hover:bg-red-600 text-white"
                  >
                    Clear All
                  </Button>
                )}
              </div>
              
              {/* Compact Coordinates List */}
              {selectedLocations.length > 0 && (
                <div className="mb-4 p-3 bg-gray-50 rounded-lg border">
                  <div className="space-y-3 max-h-96 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
                    {selectedLocations.map((location, index) => (
                      <div
                        key={index}
                        className="bg-white p-3 rounded border border-gray-200 hover:shadow-md transition-shadow duration-200"
                      >
                        <div className="flex justify-between items-center mb-2">
                          <span className="font-semibold text-sm text-gray-700">
                            <strong>Location {index + 1}:</strong> {location.lat.toFixed(6)}, {location.lng.toFixed(6)}
                          </span>
                          <button
                            onClick={() => removeLocation(index)}
                            className="text-red-500 hover:text-red-700 text-xs px-2 py-1 rounded hover:bg-red-50 transition-colors duration-200"
                            title="Remove this location"
                          >
                            Remove
                          </button>
                        </div>
                        
                        {/* Location-specific parameters */}
                        <div className="space-y-3">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <div>
                              <label className="block text-gray-600 text-xs uppercase tracking-wide">Latitude</label>
                              <input
                                key={`lat-${index}-${location.lat}`}
                                type="number"
                                step="0.0001"
                                defaultValue={location.lat}
                                onBlur={(e) => handleCoordinateBlur(index, 'lat', e.target.value, e.target)}
                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                              />
                            </div>
                            <div>
                              <label className="block text-gray-600 text-xs uppercase tracking-wide">Longitude</label>
                              <input
                                key={`lng-${index}-${location.lng}`}
                                type="number"
                                step="0.0001"
                                defaultValue={location.lng}
                                onBlur={(e) => handleCoordinateBlur(index, 'lng', e.target.value, e.target)}
                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                              />
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <label htmlFor={`ewRiverInput-${index}`} className="block text-gray-600 text-sm">EW River Input (ton/ha/yr):</label>
                            <input
                              id={`ewRiverInput-${index}`}
                              name={`ewRiverInput-${index}`}
                              type="number"
                              step="0.1"
                              min="0"
                              value={location.ewRiverInput || ''}
                              onChange={(e) => updateLocationParameter(index, 'ewRiverInput', parseFloat(e.target.value) || 0)}
                              className="w-1/2 px-2 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
                              placeholder="0.00"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              <h3 className="text-xl font-semibold">2. Set DRN Model Parameters</h3>
                <div className="flex items-center gap-4 mb-4">
                  <Label htmlFor="numStart" className="w-44 font-semibold">Start Index of Flow Paths</Label>
                  <Input
                    id="numStart"
                    name="numStart"
                    type="number" 
                    value={numStart} 
                    onChange={(e) => setNumStart(e.target.value)} 
                    className="flex-1" 
                  />
                </div>

                <div className="flex items-center gap-4 mb-4">
                  <Label htmlFor="yearRun" className="w-44 font-semibold">Simulation Months (up to 24 months)</Label>
                  <Input
                    id="yearRun"
                    name="yearRun"
                    type="number"
                    min={1}
                    max={24}
                    value={yearRun}
                    onChange={(e) => {
                      const value = Number(e.target.value);
                      const sanitized = Number.isNaN(value) ? 1 : Math.max(1, Math.min(24, Math.round(value)));
                      setYearRun(sanitized);
                    }}
                    className="flex-1"
                  />
                </div>

                <div className="flex items-center gap-4 mb-4">
                  <Label htmlFor="timeStep" className="w-44 font-semibold">Output Timestep (days)</Label>
                  <Input
                    id="timeStep"
                    name="timeStep"
                    type="number" 
                    step="0.1" 
                    value={timeStep} 
                    onChange={(e) => setTimeStep(e.target.value)} 
                    className="flex-1" 
                  />
                </div>
                <div className="space-y-4">
                  
                    <Button
                      type="button"
                      onClick={handleSaveModel}
                      disabled={isSaving || selectedLocations.length === 0}
                      className="w-full bg-green-500 hover:bg-green-600 text-white py-2 rounded-md font-semibold"
                    >
                      {isSaving ? 'Saving...' : savedData ? 'Update Model Configuration' : 'Save Model Configuration'}
                    </Button>

                    {!jobId ? (
                      <div className="space-y-2">
                        <Button 
                          onClick={submitJobToGrace} 
                          className="w-full bg-blue-500 text-white hover:bg-blue-600 rounded-md p-2 disabled:opacity-50"
                          disabled={selectedLocations.length === 0 || isSubmittingJob}
                        >
                          {isSubmittingJob ? 'Submitting...' : 'Submit DRN Job to Grace'}
                        </Button>
                        
                        {/* Restore Job Button - only show if there's a saved job in localStorage */}
                        <Button 
                          onClick={() => {
                            const savedJobState = loadJobStateFromStorage();
                            if (savedJobState && savedJobState.jobId) {
                              setJobId(savedJobState.jobId);
                              setJobStatus(savedJobState.jobStatus);
                              setJobError(savedJobState.jobError);
                              setJobSubmissionMessage(savedJobState.jobSubmissionMessage || `Restored job ${savedJobState.jobId}`);
                              setJobLogs(Array.isArray(savedJobState.jobLogs) ? savedJobState.jobLogs : []);
                              setHasSavedJob(true); // Mark that there's a saved job
                              
                              // Check status if active
                              if (['submitted', 'pending', 'running'].includes(savedJobState.jobStatus)) {
                                checkJobStatus(savedJobState.jobId);
                              }
                            }
                          }}
                          className="w-full bg-purple-500 text-white hover:bg-purple-600 rounded-md p-2 text-sm"
                          style={{ display: hasSavedJob ? 'block' : 'none' }}
                        >
                          Restore Previous Job
                        </Button>
                        

                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <Button 
                            onClick={() => checkJobStatus(jobId)} 
                            className="flex-1 bg-yellow-500 text-white hover:bg-yellow-600 rounded-md p-2 disabled:opacity-50"
                            disabled={isCheckingStatus}
                          >
                            {isCheckingStatus ? 'Checking...' : 'Check Status'}
                          </Button>
                          <Button 
                            onClick={resetJob} 
                            className="bg-gray-500 text-white hover:bg-gray-600 rounded-md px-3"
                          >
                            Reset
                          </Button>
                        </div>
                        
                        {/* Show retry button if there's a connection error */}
                        {jobError && (jobError.includes('timeout') || jobError.includes('Authentication') || jobError.includes('Network')) && (
                          <Button 
                            onClick={() => {
                              setJobError(null); // Clear the error
                              checkJobStatus(jobId); // Retry status check
                            }}
                            className="w-full bg-orange-500 text-white hover:bg-orange-600 rounded-md p-2 text-sm"
                            disabled={isCheckingStatus}
                          >
                            Retry Connection
                          </Button>
                        )}
                      </div>
                    )}
                 

                  {/* Job Status Display */}
                  {(jobSubmissionMessage || jobError) && (
                    <div className="space-y-3">
                      <div className={`text-center p-3 rounded-lg text-sm ${
                        jobError 
                          ? 'bg-red-100 text-red-700 border border-red-200' 
                          : jobStatus === 'completed'
                          ? 'bg-green-100 text-green-700 border border-green-200'
                          : jobStatus === 'running'
                          ? 'bg-blue-100 text-blue-700 border border-blue-200'
                          : jobStatus === 'pending'
                          ? 'bg-yellow-100 text-yellow-700 border border-yellow-200'
                          : 'bg-gray-100 text-gray-700 border border-gray-200'
                      }`}>
                        {jobError ? ` Error: ${jobError}` : jobSubmissionMessage}
                      </div>

                      {jobId && (
                        <div className="bg-gray-50 p-3 rounded-lg border">
                          <div className="flex justify-between items-center mb-2">
                            <span className="font-semibold text-sm">Job Details:</span>
                            <div className="flex items-center gap-2">
                              <span className={`px-2 py-1 rounded text-xs font-medium ${
                                jobStatus === 'completed' ? 'bg-green-100 text-green-700' :
                                jobStatus === 'running' ? 'bg-blue-100 text-blue-700' :
                                jobStatus === 'failed' ? 'bg-red-100 text-red-700' :
                                jobStatus === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                                'bg-gray-100 text-gray-700'
                              }`}>
                                {jobStatus || 'unknown'}
                              </span>
                            </div>
                          </div>
                          <div className="text-xs text-gray-600 space-y-1">
                            <div><strong>Job ID:</strong> {jobId}</div>
                            <div><strong>Model:</strong> DRN</div>
                            <div><strong>Locations:</strong> {selectedLocations.length} location(s)</div>
                            <div><strong>Current Location:</strong> {selectedLocation?.lat.toFixed(4)}, {selectedLocation?.lng.toFixed(4)}</div>
                            <div><strong>Parameters:</strong> Start: {numStart}, Months: {yearRun}, Timestep: {timeStep}</div>
                            <div><strong>Location Parameters:</strong> {selectedLocations.length} location(s) with individual EW River Input values</div>
                            {lastStatusCheck && (
                              <div><strong>Last checked:</strong> {lastStatusCheck.toLocaleTimeString()}</div>
                            )}
                            {consecutiveTimeouts > 0 && (
                              <div className="text-orange-600"><strong>Connection issues:</strong> {consecutiveTimeouts} consecutive timeouts</div>
                            )}
                          </div>
                        </div>
                      )}


                    </div>
                  )}
                </div>
                
                {saveMessage && (
                  <div className={`text-center p-3 rounded-lg text-sm ${
                    saveMessage.includes('successfully') 
                      ? 'bg-green-100 text-green-700' 
                      : 'bg-red-100 text-red-700'
                  }`}>
                    {saveMessage}
                  </div>
                )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
