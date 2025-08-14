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
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [numStart, setNumStart] = useState(1);
  const [addFlag, setAddFlag] = useState("middle");
  const [yearRun, setYearRun] = useState(2);
  const [timeStep, setTimeStep] = useState(0.1);
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

  // Load saved data when component mounts or savedData changes
  useEffect(() => {
    if (savedData) {
      const params = savedData.parameters || {};
      setNumStart(params.numStart || 1);
      setAddFlag(params.addFlag || "middle");
      setYearRun(params.yearRun || 2);
      setTimeStep(params.timeStep || 0.1);
      
      // Load saved location
      if (savedData.location && savedData.location !== 'Custom Location') {
        const [lat, lng] = savedData.location.split(',').map(coord => parseFloat(coord.trim()));
        if (!isNaN(lat) && !isNaN(lng)) {
          setSelectedLocation({ lat, lng });
        }
      }
    }
  }, [savedData]);

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
        
        if (savedJobState && savedJobState.jobId && mounted) {
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
        }
      } catch (error) {
        console.error('Error restoring job state:', error);
        // Clear potentially corrupted state
        if (mounted) {
          clearJobStateFromStorageRef.current();
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
    if (!selectedLocation) {
      setJobSubmissionMessage('Please select a location first');
      return;
    }

    setIsSubmittingJob(true);
    setJobError(null);
    setJobSubmissionMessage('Submitting job to Yale Grace server...');

    try {
      const jobData = {
        model: 'drn',
        parameters: {
          location: {
            lat: selectedLocation.lat,
            lng: selectedLocation.lng
          },
          numStart,
          addFlag,
          yearRun,
          timeStep
        },
        user_id: user?.id || 'anonymous'
      };

      // Call  backend proxy API
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
          jobSubmissionMessage: `Job submitted successfully! Job ID: ${result.job_id}`,
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
    
    // Clear job state from localStorage
    clearJobStateFromStorage();
  }, [clearJobStateFromStorage]);

  const handleLocationSelect = (location) => {
    setSelectedLocation(location);
  };

  const handleSaveModel = async () => {
    if (!user) {
      setSaveMessage('Please log in to save models');
      return;
    }

    if (!selectedLocation) {
      setSaveMessage('Please select a location first');
      return;
    }

    setIsSaving(true);
    setSaveMessage('');

    try {
      const modelData = {
        name: `DRN - ${selectedLocation.lat.toFixed(3)}, ${selectedLocation.lng.toFixed(3)}`,
        model: 'DRN',
        location: `${selectedLocation.lat.toFixed(4)}, ${selectedLocation.lng.toFixed(4)}`,
        status: 'saved',
        parameters: {
          numStart,
          addFlag,
          yearRun,
          timeStep
        }
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

  return (
    <div>
      <div className="flex gap-6">
        <div className="w-3/5">
          <h3 className="text-xl font-bold text-center mb-6 text-gray-800">Area of Interest</h3>
          <MapComponent 
            onLocationSelect={handleLocationSelect} 
            disabled={!!jobId} 
            selectedLocation={selectedLocation}
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
              <h3 className="text-xl font-semibold">1. Selected Location</h3>
              <p className="text-gray-500 mb-4 mt-3">
                {selectedLocation 
                  ? `Selected Location: ${selectedLocation.lat.toFixed(3)}, ${selectedLocation.lng.toFixed(3)}`
                  : "No location selected"}
              </p>
              <h3 className="text-xl font-semibold">2. Model Parameters</h3>
              
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
                  <Label htmlFor="addFlag" className="w-44 font-semibold flex items-center">
                    EW Scenario
                    <div 
                      className="ml-1 text-gray-500 hover:text-gray-700 group relative inline-block"
                    >
                      <svg 
                        xmlns="http://www.w3.org/2000/svg" 
                        className="h-4 w-4 cursor-help" 
                        fill="none" 
                        viewBox="0 0 24 24" 
                        stroke="currentColor"
                      >
                        <path 
                          strokeLinecap="round" 
                          strokeLinejoin="round" 
                          strokeWidth={2} 
                          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" 
                        />
                      </svg>
                      <div className="opacity-0 bg-gray-200 text-black text-sm rounded-lg py-2 px-3 absolute z-10 top-0 left-0 transform -translate-y-full w-48 group-hover:opacity-100 transition-opacity duration-300">
                        Annual CO₂ consumption rate by basalt dissolution globally.
                        <div className="absolute top-full left-0 border-8 border-transparent border-t-gray-200"></div>
                      </div>
                    </div>
                  </Label>
                  <Select value={addFlag} onValueChange={setAddFlag}>
                    <SelectTrigger id="addFlag" className="flex-1">
                      <SelectValue placeholder="Select a scenario" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="min">Min (~0.5 ton/ha/yr)</SelectItem>
                      <SelectItem value="middle">Middle (~1 ton/ha/yr)</SelectItem>
                      <SelectItem value="max">Max (~1.5 ton/ha/yr)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-4 mb-4">
                  <Label htmlFor="yearRun" className="w-44 font-semibold">Simulation Years</Label>
                  <Input
                    id="yearRun"
                    name="yearRun"
                    type="number" 
                    value={yearRun} 
                    onChange={(e) => setYearRun(e.target.value)} 
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
                      disabled={isSaving || !selectedLocation}
                      className="w-full bg-green-500 hover:bg-green-600 text-white py-2 rounded-md font-semibold"
                    >
                      {isSaving ? 'Saving...' : savedData ? 'Update Model Configuration' : 'Save Model Configuration'}
                    </Button>

                    {!jobId ? (
                      <div className="space-y-2">
                        <Button 
                          onClick={submitJobToGrace} 
                          className="w-full bg-blue-500 text-white hover:bg-blue-600 rounded-md p-2 disabled:opacity-50"
                          disabled={!selectedLocation || isSubmittingJob}
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
                              
                              // Check status if active
                              if (['submitted', 'pending', 'running'].includes(savedJobState.jobStatus)) {
                                checkJobStatus(savedJobState.jobId);
                              }
                            }
                          }}
                          className="w-full bg-purple-500 text-white hover:bg-purple-600 rounded-md p-2 text-sm"
                          style={{ display: loadJobStateFromStorage() ? 'block' : 'none' }}
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
                            <div><strong>Location:</strong> {selectedLocation?.lat.toFixed(4)}, {selectedLocation?.lng.toFixed(4)}</div>
                            <div><strong>Parameters:</strong> Start: {numStart}, Scenario: {addFlag}, Years: {yearRun}, Timestep: {timeStep}</div>
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
