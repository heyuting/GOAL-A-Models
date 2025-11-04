import { useState, useEffect, useCallback } from "react";
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
  if (API_BASE_URL && import.meta.env.PROD) {
    // In production, use full URL
    return `${API_BASE_URL}/${endpoint}`;
  } else {
    // In development, use relative URL (proxied through Vite)
    return `/${endpoint}`;
  }
};

export default function SCEPTERDRNConfig({ savedData }) {
  const { user } = useAuth();
  
  // SCEPTER parameters
  const [location, setLocation] = useState('');
  const [feedstock, setFeedstock] = useState('');
  const [particleSize, setParticleSize] = useState('');
  const [applicationRate, setApplicationRate] = useState('');
  const [targetPH, setTargetPH] = useState('');
  const [selectedSite, setSelectedSite] = useState(null);
  const [mapCenter, setMapCenter] = useState([39.8283, -98.5795]); // Default US center
  const [mapZoom, setMapZoom] = useState(4); // Default zoom level
  const [statisticPeriod, setStatisticPeriod] = useState('7d'); // Default to 7 days
  
  // DRN parameters
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [numStart, setNumStart] = useState(1);
  const [yearRun, setYearRun] = useState(2);
  const [timeStep, setTimeStep] = useState(0.1);
  
  // Common states
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
  const [consecutiveTimeouts, setConsecutiveTimeouts] = useState(0);

  // Load saved data when component mounts or savedData changes
  useEffect(() => {
    if (savedData) {
      // Load saved SCEPTER model parameters
      const scepterParams = savedData.scepterParameters || {};
      setFeedstock(scepterParams.feedstock || '');
      setParticleSize(scepterParams.particleSize || '');
      setApplicationRate(scepterParams.applicationRate || '');
      setTargetPH(scepterParams.targetPH || '');
      setStatisticPeriod(scepterParams.statisticPeriod || '7d');
      
      // Load saved DRN model parameters
      const drnParams = savedData.drnParameters || {};
      setNumStart(drnParams.numStart || 1);
      setYearRun(drnParams.yearRun || 2);
      setTimeStep(drnParams.timeStep || 0.1);
      
      // Load saved site data
      if (savedData.siteData) {
        setSelectedSite(savedData.siteData);
      }
      
      // Load location
      if (savedData.location) {
        setLocation(savedData.location);
        
        // If it's a coordinate string, parse it
        if (savedData.location.includes(',')) {
          const [lat, lng] = savedData.location.split(',').map(coord => parseFloat(coord.trim()));
          if (!isNaN(lat) && !isNaN(lng)) {
            setSelectedLocation({ lat, lng });
            setMapCenter([lat, lng]);
            setMapZoom(8);
          }
        }
      }
    }
  }, [savedData]);

  // Helper functions for job state persistence
  const saveJobStateToStorage = useCallback((jobData) => {
    if (jobData.jobId) {
      localStorage.setItem(`scepterdrn_job_${jobData.jobId}`, JSON.stringify(jobData));
    }
  }, []);

  const loadJobStateFromStorage = useCallback((jobId) => {
    if (jobId) {
      const saved = localStorage.getItem(`scepterdrn_job_${jobId}`);
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch (e) {
          console.error('Error parsing saved job state:', e);
        }
      }
    }
    return null;
  }, []);

  const clearJobStateFromStorage = useCallback((jobId) => {
    if (jobId) {
      localStorage.removeItem(`scepterdrn_job_${jobId}`);
    }
  }, []);

  // Load job state from localStorage on component mount
  useEffect(() => {
    const savedJobId = localStorage.getItem('scepterdrn_last_job_id');
    if (savedJobId) {
      const savedJobState = loadJobStateFromStorage(savedJobId);
      if (savedJobState) {
        setJobId(savedJobState.jobId);
        setJobStatus(savedJobState.jobStatus);
        setJobError(savedJobState.jobError);
        setJobSubmissionMessage(savedJobState.jobSubmissionMessage);
        setJobLogs(savedJobState.jobLogs || []);
        setConsecutiveTimeouts(savedJobState.consecutiveTimeouts || 0);
      }
    }
  }, [loadJobStateFromStorage]);

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
  }, [jobError, consecutiveTimeouts, saveJobStateToStorage]);

  // Auto-check job status every 30 seconds if job is running
  useEffect(() => {
    let interval;
    if (jobId && (jobStatus === 'running' || jobStatus === 'pending')) {
      interval = setInterval(() => {
        checkJobStatus(jobId);
      }, 30000); // Check every 30 seconds
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [jobId, jobStatus, checkJobStatus]);

  // Job submission functions
  const submitJobToGrace = async () => {
    if (!selectedLocation) {
      setJobSubmissionMessage('Please select a location first');
      return;
    }

    if (!feedstock || !particleSize || !applicationRate || !targetPH) {
      setJobSubmissionMessage('Please fill in all SCEPTER parameters');
      return;
    }

    setIsSubmittingJob(true);
    setJobError(null);
    setJobSubmissionMessage('Submitting SCEPTER+DRN job to Yale Grace server...');

    try {
      const jobData = {
        model: 'SCEPTER+DRN', // Combined model
        parameters: {
          // SCEPTER parameters
          scepter: {
            location: location,
            feedstock: feedstock,
            particleSize: particleSize,
            applicationRate: applicationRate,
            targetPH: targetPH,
            statisticPeriod: statisticPeriod
          },
          // DRN parameters
          drn: {
            location: {
              lat: selectedLocation.lat,
              lng: selectedLocation.lng
            },
            numStart: numStart,
            yearRun: yearRun,
            timeStep: timeStep
          }
        },
        user_id: user?.id || 'anonymous'
      };

      // Call backend proxy API
      const response = await fetch(getApiUrl('api/run-job'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(jobData),
      });

      const result = await response.json();

      if (response.ok && result.job_id) {
        const jobState = {
          jobId: result.job_id,
          jobStatus: 'submitted',
          jobError: null,
          jobSubmissionMessage: `SCEPTER+DRN job submitted successfully! Job ID: ${result.job_id}`,
          jobLogs: []
        };
        
        setJobId(jobState.jobId);
        setJobStatus(jobState.jobStatus);
        setJobSubmissionMessage(jobState.jobSubmissionMessage);
        
        // Save job state to localStorage
        saveJobStateToStorage(jobState);
        
        // Save last job ID for persistence
        localStorage.setItem('scepterdrn_last_job_id', result.job_id);
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
    setConsecutiveTimeouts(0);
    
    // Clear job state from localStorage
    clearJobStateFromStorage(jobId);
    localStorage.removeItem('scepterdrn_last_job_id');
  }, [clearJobStateFromStorage, jobId]);

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

    if (!feedstock || !particleSize || !applicationRate || !targetPH) {
      setSaveMessage('Please fill in all SCEPTER parameters');
      return;
    }

    setIsSaving(true);
    setSaveMessage('');

    try {
      const modelData = {
        name: `SCEPTER+DRN - ${selectedLocation.lat.toFixed(3)}, ${selectedLocation.lng.toFixed(3)}`,
        model: 'SCEPTER+DRN',
        location: `${selectedLocation.lat.toFixed(4)}, ${selectedLocation.lng.toFixed(4)}`,
        status: 'saved',
        scepterParameters: {
          feedstock,
          particleSize,
          applicationRate,
          targetPH,
          statisticPeriod
        },
        drnParameters: {
          numStart,
          yearRun,
          timeStep
        },
        siteData: selectedSite
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
    <div className="container mx-auto p-4 space-y-6">
      {/* Map Component */}
      <Card>
        <CardContent className="p-6">
          <h2 className="text-xl font-semibold mb-4 text-center">DRN + SCEPTER Area of Interest</h2>
          <MapComponent
            onLocationSelect={handleLocationSelect}
            selectedLocation={selectedLocation}
            center={mapCenter}
            zoom={mapZoom}
            onCenterChange={setMapCenter}
            onZoomChange={setMapZoom}
          />
          {selectedLocation && (
            <div className="mt-4 p-3 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-800">
                Selected Location: {selectedLocation.lat.toFixed(6)}, {selectedLocation.lng.toFixed(6)}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* SCEPTER Configuration */}
        <Card>
          <CardContent className="p-6">
            <h2 className="text-xl font-semibold mb-4">SCEPTER Model Parameters</h2>
            
            <div className="space-y-4">
              <div>
                <Label htmlFor="feedstock">Feedstock Type</Label>
                <Select value={feedstock} onValueChange={setFeedstock}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select feedstock type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="biochar">Biochar</SelectItem>
                    <SelectItem value="lime">Agricultural Lime</SelectItem>
                    <SelectItem value="compost">Compost</SelectItem>
                    <SelectItem value="manure">Manure</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="particleSize">Particle Size (mm)</Label>
                <Input
                  id="particleSize"
                  type="text"
                  value={particleSize}
                  onChange={(e) => setParticleSize(e.target.value)}
                  placeholder="e.g., 0.5, 1.0, 2.0"
                />
              </div>

              <div>
                <Label htmlFor="applicationRate">Application Rate (tons/ha)</Label>
                <Input
                  id="applicationRate"
                  type="number"
                  value={applicationRate}
                  onChange={(e) => setApplicationRate(e.target.value)}
                  placeholder="e.g., 5, 10, 20"
                  step="0.1"
                />
              </div>

              <div>
                <Label htmlFor="targetPH">Target pH</Label>
                <Input
                  id="targetPH"
                  type="number"
                  value={targetPH}
                  onChange={(e) => setTargetPH(e.target.value)}
                  placeholder="e.g., 6.5, 7.0"
                  step="0.1"
                  min="4.0"
                  max="10.0"
                />
              </div>

              <div>
                <Label htmlFor="period">Time Period</Label>
                <Select value={statisticPeriod} onValueChange={setStatisticPeriod}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7d">7 Days</SelectItem>
                    <SelectItem value="30d">30 Days</SelectItem>
                    <SelectItem value="90d">90 Days</SelectItem>
                    <SelectItem value="1y">1 Year</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* DRN Configuration */}
        <Card>
          <CardContent className="p-6">
            <h2 className="text-xl font-semibold mb-4">DRN Model Parameters</h2>
            
            <div className="space-y-4">
              <div>
                <Label htmlFor="numStart">Number of Starting Points</Label>
                <Input
                  id="numStart"
                  type="number"
                  value={numStart}
                  onChange={(e) => setNumStart(parseInt(e.target.value))}
                  min="1"
                  max="10"
                />
              </div>

              <div>
                <Label htmlFor="yearRun">Years to Run</Label>
                <Input
                  id="yearRun"
                  type="number"
                  value={yearRun}
                  onChange={(e) => setYearRun(parseInt(e.target.value))}
                  min="1"
                  max="10"
                />
              </div>

              <div>
                <Label htmlFor="timeStep">Time Step</Label>
                <Input
                  id="timeStep"
                  type="number"
                  value={timeStep}
                  onChange={(e) => setTimeStep(parseFloat(e.target.value))}
                  step="0.1"
                  min="0.1"
                  max="1.0"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Job Control and Save Model Configuration - Side by Side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Job Control Panel */}
        <Card>
          <CardContent className="p-6">
            <h2 className="text-xl font-semibold mb-4">Job Control</h2>
            
            <div className="space-y-4">
              <div className="flex gap-4">
                <Button 
                  onClick={submitJobToGrace}
                  disabled={isSubmittingJob || !selectedLocation}
                  className="flex-1 bg-blue-500 text-white hover:bg-blue-600"
                >
                  {isSubmittingJob ? 'Submitting...' : 'Submit SCEPTER+DRN Job'}
                </Button>
                
                <Button 
                  onClick={resetJob}
                  disabled={!jobId}
                  variant="outline"
                  className="border-blue-300 text-blue-600 hover:bg-blue-50"
                >
                  Reset Job
                </Button>
              </div>

              {jobSubmissionMessage && (
                <div className="p-3 bg-blue-50 rounded-lg">
                  <p className="text-sm text-blue-800">{jobSubmissionMessage}</p>
                </div>
              )}

              {jobError && (
                <div className="p-3 bg-red-50 rounded-lg">
                  <p className="text-sm text-red-800">{jobError}</p>
                </div>
              )}

              {jobId && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Job ID: {jobId}</span>
                    <span className="text-sm text-gray-600">Status: {jobStatus}</span>
                  </div>
                  
                  <Button 
                    onClick={() => checkJobStatus(jobId)}
                    disabled={isCheckingStatus}
                    size="sm"
                    variant="outline"
                    className="border-blue-300 text-blue-600 hover:bg-blue-50"
                  >
                    {isCheckingStatus ? 'Checking...' : 'Check Status'}
                  </Button>

                  {jobLogs.length > 0 && (
                    <div className="mt-3 p-3 bg-gray-50 rounded-lg max-h-40 overflow-y-auto">
                      <h4 className="text-sm font-medium mb-2">Job Logs:</h4>
                      {jobLogs.map((log, index) => (
                        <div key={index} className="text-xs text-gray-600 mb-1">
                          {log}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Save Model Section */}
        <Card>
          <CardContent className="p-6">
            <h2 className="text-xl font-semibold mb-4">Save Model Configuration</h2>
            
            <div className="space-y-4">
              <Button 
                onClick={handleSaveModel}
                disabled={isSaving || !selectedLocation}
                className="w-full bg-blue-500 text-white hover:bg-blue-600"
              >
                {isSaving ? 'Saving...' : 'Save SCEPTER+DRN Model'}
              </Button>
              
              {saveMessage && (
                <div className="p-3 bg-green-50 rounded-lg">
                  <p className="text-sm text-green-800">{saveMessage}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
