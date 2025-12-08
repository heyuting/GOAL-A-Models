import { useState, useEffect } from "react";
import MapComponent from "./Map";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import userService from "@/services/userService";

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
  const { user, loading: authLoading } = useAuth();
  
  // Mode selection: 'single' or 'multiple'
  const [locationMode, setLocationMode] = useState(null); // null = not selected yet, 'single' or 'multiple'
  // Don't show mode selection modal if we have savedData (viewing a saved model)
  const [showModeSelection, setShowModeSelection] = useState(!savedData);
  const [currentPage, setCurrentPage] = useState(1); // 1 = Step 1 (Location Selection), 2 = Step 2 (Model Parameters)
  
  // Multiple location mode states
  const [outletCheckStatus, setOutletCheckStatus] = useState(null); // null, 'checking', 'same', 'different', 'error'
  const [outletCheckError, setOutletCheckError] = useState(null);
  const [_runIndividuallyMode, _setRunIndividuallyMode] = useState(false); // If true, locations will be run as separate simulations (currently unused)
  const [outletCheckResults, setOutletCheckResults] = useState(null); // Store the full results
  
  // Watershed generation states
  const [_watershedJobId, setWatershedJobId] = useState(null);
  const [watershedStatus, setWatershedStatus] = useState(null);
  const [watershedResults, setWatershedResults] = useState(null);
  const [isGeneratingWatershed, setIsGeneratingWatershed] = useState(false);
  const [watershedError, setWatershedError] = useState(null);
  
  // DRN parameters
  const [selectedLocations, setSelectedLocations] = useState([]);
  const [currentLocationIndex, setCurrentLocationIndex] = useState(-1);
  const [yearRun, setYearRun] = useState(12);
  const [timeStep, setTimeStep] = useState(1);
  // const [rateRock, setRateRock] = useState(1.0); // Rate of rock (ton/ha/yr) - Commented out, now using EW River Input from locations
  const [feedstock, setFeedstock] = useState('basalt'); // 'carbonate' or 'basalt'
  // const [monteCount, setMonteCount] = useState(10); // Monte Carlo count (default: 10, max: 100)


  // Full pipeline states
  const [fullPipelineJobId, setFullPipelineJobId] = useState(null);
  const [fullPipelineStatus, setFullPipelineStatus] = useState(null);
  const [fullPipelineError, setFullPipelineError] = useState(null);
  const [isSubmittingFullPipeline, setIsSubmittingFullPipeline] = useState(false);
  const [isCheckingFullPipelineStatus, setIsCheckingFullPipelineStatus] = useState(false);
  // fullPipelineResults state removed - not currently used (backend returns placeholder)
  const [currentStep, setCurrentStep] = useState(null);
  const [stepProgress, setStepProgress] = useState(null);
  
  // Model saving state
  const [isModelSaved, setIsModelSaved] = useState(false);
  const [isSavingModel, setIsSavingModel] = useState(false);
  const [showNameModal, setShowNameModal] = useState(false);
  const [modelName, setModelName] = useState('');
  
  // Download state
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState('');


  const validateWithinConus = (lat, lng) => (
    lat >= 24.396308 &&
    lat <= 49.384358 &&
    lng >= -125.00165 &&
    lng <= -66.93457
  );


  // Load saved data on component mount
  useEffect(() => {
    if (savedData) {
      console.log('Loading saved model data:', savedData);
      
      // Hide mode selection modal when viewing saved model
      setShowModeSelection(false);
      
      // If savedData has a jobId, restore the job state first
      if (savedData.jobId) {
        console.log('Restoring job from saved model data, jobId:', savedData.jobId);
        setFullPipelineJobId(savedData.jobId);
        // Use savedData status, defaulting to 'completed' if saved model was completed
        const jobStatus = savedData.status === 'completed' ? 'completed' : (savedData.status || 'completed');
        setFullPipelineStatus(jobStatus);
        
        // Try to load full job details from localStorage
        const savedJob = localStorage.getItem(`drn_job_${savedData.jobId}`);
        if (savedJob) {
          try {
            const jobInfo = JSON.parse(savedJob);
            console.log('Found job in localStorage:', jobInfo);
            // Prioritize savedData status if it's 'completed', otherwise use jobInfo status
            const finalStatus = savedData.status === 'completed' ? 'completed' : (jobInfo.status || jobStatus);
            setFullPipelineStatus(finalStatus);
            // Use jobInfo data if available, otherwise use savedData
            if (jobInfo.locations) {
              setSelectedLocations(jobInfo.locations);
              setCurrentLocationIndex(jobInfo.locations.length - 1);
            } else if (savedData.locations) {
              setSelectedLocations(savedData.locations);
              setCurrentLocationIndex(savedData.locations.length - 1);
            }
            if (jobInfo.parameters) {
              if (jobInfo.parameters.monthRun) setYearRun(jobInfo.parameters.monthRun);
              if (jobInfo.parameters.timeStep) setTimeStep(jobInfo.parameters.timeStep);
              if (jobInfo.parameters.feedstock) setFeedstock(jobInfo.parameters.feedstock);
            }
            if (jobInfo.locationMode) {
              setLocationMode(jobInfo.locationMode);
              setShowModeSelection(false);
            }
            // When viewing saved model, always navigate to page 2 to show model status
            setCurrentPage(2);
            // If job is completed, set step progress to show all steps completed
            if (jobInfo.status === 'completed' || jobStatus === 'completed') {
              setCurrentStep('All 5 Steps Completed');
              setStepProgress({
                step: 5,
                name: 'Compile Results',
                status: 'completed'
              });
      }
    } catch (error) {
            console.error('Error loading job from localStorage:', error);
          }
        } else {
          // No localStorage job, use savedData directly
          if (savedData.locations) {
            setSelectedLocations(savedData.locations);
            setCurrentLocationIndex(savedData.locations.length - 1);
          }
          if (savedData.parameters) {
            if (savedData.parameters.simulationDuration) {
              setYearRun(savedData.parameters.simulationDuration);
            }
            if (savedData.parameters.outputTimestep) {
              setTimeStep(savedData.parameters.outputTimestep);
            }
            if (savedData.parameters.feedstock) {
              setFeedstock(savedData.parameters.feedstock);
            }
            if (savedData.parameters.locationMode) {
              setLocationMode(savedData.parameters.locationMode);
              setShowModeSelection(false);
            }
          }
          // When viewing saved model, always navigate to page 2 to show model status
          setCurrentPage(2);
          // If job is completed, set step progress to show all steps completed
          if (jobStatus === 'completed') {
            setCurrentStep('All 5 Steps Completed');
            setStepProgress({
              step: 5,
              name: 'Compile Results',
              status: 'completed'
            });
          }
        }
      } else {
        // No jobId in savedData, load from savedData parameters
        // When viewing saved model, always navigate to page 2
        setCurrentPage(2);
        
      if (savedData.parameters && savedData.parameters.locations) {
        setSelectedLocations(savedData.parameters.locations);
        setCurrentLocationIndex(savedData.parameters.locations.length - 1);
      }
      if (savedData.parameters) {
          const savedDuration = savedData.parameters.yearRun || savedData.parameters.simulationDuration;
          if (typeof savedDuration === 'number') {
            if (savedDuration <= 2) {
              setYearRun(savedDuration * 12);
            } else {
              setYearRun(savedDuration);
            }
          } else {
            setYearRun(24);
          }
          if (savedData.parameters.outputTimestep) {
            setTimeStep(savedData.parameters.outputTimestep);
          }
          if (savedData.parameters.feedstock) {
            setFeedstock(savedData.parameters.feedstock);
          }
          if (savedData.parameters.locationMode) {
            setLocationMode(savedData.parameters.locationMode);
            setShowModeSelection(false);
          }
        } else {
          setYearRun(24);
        }
      }
    }
    // No savedData - don't restore from localStorage
    // Only restore when explicitly viewing from Account → My Models (savedData is provided)
  }, [savedData]);

  // Resume polling for restored jobs
  useEffect(() => {
    if (fullPipelineJobId && (fullPipelineStatus === 'submitted' || fullPipelineStatus === 'pending' || fullPipelineStatus === 'running')) {
      // Small delay to ensure all functions are defined
      const timer = setTimeout(() => {
        pollFullPipelineStatus(fullPipelineJobId);
      }, 500);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullPipelineJobId]); // Only run when jobId changes (on restore)


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
      ewRiverInput: 1
    };
    
    setSelectedLocations(prev => {
      const newLocations = [...prev, newLocation];
      setCurrentLocationIndex(newLocations.length - 1);
      return newLocations;
    });

    return true;
  };

 
  // Handle location selection
  const handleLocationSelect = (location) => {
    
    // In single mode, only allow one location - prevent adding if one already exists
    if (locationMode === 'single' && selectedLocations.length >= 1) {
      alert('Single location mode: Please remove the existing location before selecting a new one.');
      return;
    }
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
    
    // Clear watershed results when a location is removed
    // (watersheds were generated for the previous set of locations)
    setWatershedResults(null);
    setWatershedStatus(null);
    setWatershedJobId(null);
    setWatershedError(null);
    setIsGeneratingWatershed(false);
    
    // In multiple mode, reset outlet check status when locations change
    // (outlet check results are no longer valid after removing locations)
    if (locationMode === 'multiple') {
      setOutletCheckStatus(null);
      setOutletCheckError(null);
      setOutletCheckResults(null);
    }
  };

  // Clear all locations
  const clearAllLocations = () => {
    setSelectedLocations([]);
    setCurrentLocationIndex(-1);
    
    // Clear watershed results when all locations are cleared
    setWatershedResults(null);
    setWatershedStatus(null);
    setWatershedJobId(null);
    setWatershedError(null);
    setIsGeneratingWatershed(false);
  };

  // Get current selected location for backward compatibility
  const selectedLocation = currentLocationIndex >= 0 ? selectedLocations[currentLocationIndex] : null;

  // Full pipeline functions
  const submitFullPipeline = async () => {
    if (selectedLocations.length < 1) {
      setFullPipelineError('Please select at least 1 location first');
      return;
    }

    setIsSubmittingFullPipeline(true);
    setFullPipelineError(null);
    setFullPipelineStatus('submitting');

    try {
      // Convert selectedLocations to coordinates format
      const coordinates = selectedLocations.map(loc => [loc.lat, loc.lng]);

      // Get rate_rock from first location's EW River Input
      const rateRockFromLocation = selectedLocations.length > 0 
        ? (selectedLocations[0].ewRiverInput || 1)
        : 1;

      const pipelineData = {
        coordinates: coordinates,
        rate_rock: rateRockFromLocation, // Using EW River Input from first location
        month_run: yearRun, // yearRun is already in months
        time_step: timeStep,
        feedstock: feedstock,
        monte_count: 0 // monteCount - commented out, using 0 as default
      };

      const apiUrl = getApiUrl('api/drn/full-pipeline');
 
      // Create an AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 minute timeout
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true',
        },
        body: JSON.stringify(pipelineData),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      
      console.log('Response status:', response.status);
      console.log('Response headers:', Object.fromEntries(response.headers.entries()));
      
      // Check if response is JSON
      const contentType = response.headers.get('content-type');
      let result;
      
      if (contentType && contentType.includes('application/json')) {
        result = await response.json();
      } else {
        const text = await response.text();
        console.error('Non-JSON response:', text);
        throw new Error(`Server returned non-JSON response: ${text.substring(0, 200)}`);
      }

      console.log('Response result:', result);

      if (response.ok && result.job_id) {
        setFullPipelineJobId(result.job_id);
        setFullPipelineStatus('submitted');
        
        // Save job to localStorage
        const jobInfo = {
          jobId: result.job_id,
          graceJobId: result.grace_job_id,
          status: 'submitted',
          submittedAt: new Date().toISOString(),
          locations: selectedLocations,
          locationMode: locationMode, // Save location mode
          parameters: {
            monthRun: yearRun,
            timeStep: timeStep,
            feedstock: feedstock,
            rateRock: selectedLocations.length > 0 ? (selectedLocations[0].ewRiverInput || 1) : 1
          }
        };
        localStorage.setItem(`drn_job_${result.job_id}`, JSON.stringify(jobInfo));
        // Also save as the most recent job
        localStorage.setItem('drn_latest_job_id', result.job_id);
        
        // Start polling for status
        pollFullPipelineStatus(result.job_id);
      } else {
        throw new Error(result.error || result.message || 'Failed to submit full pipeline job');
      }
    } catch (error) {
      console.error('Error submitting full pipeline:', error);
      let errorMessage = error.message || 'Unknown error occurred';
      
      // Handle timeout specifically
      if (error.name === 'AbortError') {
        errorMessage = 'Request timed out. The server may be taking longer than expected to submit the job. Please try again or check your connection.';
      } else if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
        errorMessage = 'Network error. Please check your connection and try again.';
      }
      
      setFullPipelineError(errorMessage);
      setFullPipelineStatus('failed');
      alert(`Failed to submit job: ${errorMessage}`);
    } finally {
      setIsSubmittingFullPipeline(false);
    }
  };

  // Helper function to update saved job in localStorage
  const updateSavedJob = (jobId, updates) => {
    if (!jobId) return;
    const savedJob = localStorage.getItem(`drn_job_${jobId}`);
    if (savedJob) {
      try {
        const jobInfo = JSON.parse(savedJob);
        const updatedJob = { ...jobInfo, ...updates };
        localStorage.setItem(`drn_job_${jobId}`, JSON.stringify(updatedJob));
      } catch (error) {
        console.error('Error updating saved job:', error);
      }
    }
  };

  const checkFullPipelineStatus = async (jobId) => {
    if (!jobId) return;
    
    setIsCheckingFullPipelineStatus(true);
    setFullPipelineError(null);
    
    try {
      const response = await fetch(getApiUrl(`api/drn/full-pipeline/${jobId}/status`), {
        headers: {
          'ngrok-skip-browser-warning': 'true',
        },
      });
      const result = await response.json();
      
      // Update saved job status
      if (result.status) {
        updateSavedJob(jobId, { status: result.status });
      }

      if (result.status === 'completed') {
        setFullPipelineStatus('completed');
        // Update saved model in Account → My Models if it exists
        if (user && user.id) {
          userService.updateUserModelByJobId(user.id, jobId, {
            status: 'completed',
            currentStep: 'All 5 Steps Completed',
            stepProgress: {
              step: 5,
              name: 'Compile Results',
              status: 'completed'
            },
            completedAt: new Date().toISOString()
          }).catch(error => console.error('Error updating saved model:', error));
        }
        // Fetch results
        fetchFullPipelineResults(jobId);
      } else if (result.status === 'failed') {
        setFullPipelineStatus('failed');
        setFullPipelineError(result.error || 'Full pipeline job failed');
        // Update saved model in Account → My Models if it exists
        if (user && user.id) {
          userService.updateUserModelByJobId(user.id, jobId, {
            status: 'failed',
            currentStep: result.current_step || null,
            stepProgress: result.step_progress || null
          }).catch(error => console.error('Error updating saved model:', error));
        }
      } else if (result.status === 'unknown') {
        // Unknown status - might be transitioning, continue checking
        setFullPipelineStatus('unknown');
        // Update step information if available
        if (result.current_step) {
          setCurrentStep(result.current_step);
        }
        if (result.step_progress) {
          setStepProgress(result.step_progress);
        }
        // Update saved model in Account → My Models if it exists
        if (user && user.id) {
          userService.updateUserModelByJobId(user.id, jobId, {
            status: result.status,
            currentStep: result.current_step || null,
            stepProgress: result.step_progress || null
          }).catch(error => console.error('Error updating saved model:', error));
        }
        // Continue polling to get updated status
        pollFullPipelineStatus(jobId);
      } else {
          setFullPipelineStatus(result.status);
          // Update saved model in Account → My Models if it exists
          if (user && user.id) {
            userService.updateUserModelByJobId(user.id, jobId, {
              status: result.status,
              currentStep: result.current_step || null,
              stepProgress: result.step_progress || null
            });
          }
          // Update step information
          if (result.current_step) {
            setCurrentStep(result.current_step);
          }
          if (result.step_progress) {
            setStepProgress(result.step_progress);
          }
          // Continue polling if still processing
          if (result.status === 'pending' || result.status === 'running') {
            pollFullPipelineStatus(jobId);
          }
      }
    } catch (error) {
      console.error('Error checking full pipeline status:', error);
      setFullPipelineError(error.message || 'Failed to check status');
    } finally {
      setIsCheckingFullPipelineStatus(false);
    }
  };

  const pollFullPipelineStatus = async (jobId) => {
    const checkStatus = async () => {
      try {
        const response = await fetch(getApiUrl(`api/drn/full-pipeline/${jobId}/status`), {
          headers: {
            'ngrok-skip-browser-warning': 'true',
          },
        });
        const result = await response.json();

        if (result.status === 'completed') {
          setFullPipelineStatus('completed');
          // Update saved job status
          updateSavedJob(jobId, { status: 'completed' });
          // Update saved model in Account → My Models if it exists
          if (user && user.id) {
            userService.updateUserModelByJobId(user.id, jobId, {
              status: 'completed',
              currentStep: 'All 5 Steps Completed',
              stepProgress: {
                step: 5,
                name: 'Compile Results',
                status: 'completed'
              },
              completedAt: new Date().toISOString()
            });
          }
          // Update step information even when completed (to show final step)
          if (result.current_step) {
            setCurrentStep(result.current_step);
          }
          if (result.step_progress) {
            setStepProgress(result.step_progress);
        } else {
            // If no step_progress but job is completed, set to show all steps completed
            setCurrentStep('All Steps Completed');
            setStepProgress({
              step: 5,
              name: 'Compile Results',
              status: 'completed'
            });
          }
          fetchFullPipelineResults(jobId);
        } else if (result.status === 'failed') {
          setFullPipelineStatus('failed');
          setFullPipelineError('Full pipeline job failed');
          // Update saved job status
          updateSavedJob(jobId, { status: 'failed' });
          // Update saved model in Account → My Models if it exists
          if (user && user.id) {
            userService.updateUserModelByJobId(user.id, jobId, {
              status: 'failed',
              currentStep: result.current_step || null,
              stepProgress: result.step_progress || null
            });
          }
          // Update step information even when failed
          if (result.current_step) {
            setCurrentStep(result.current_step);
          }
          if (result.step_progress) {
            setStepProgress(result.step_progress);
          }
      } else {
          // Update saved job status
          updateSavedJob(jobId, { status: result.status });
          // Update saved model in Account → My Models if it exists
          if (user && user.id) {
            userService.updateUserModelByJobId(user.id, jobId, {
              status: result.status,
              currentStep: result.current_step || null,
              stepProgress: result.step_progress || null
            });
          }
          setFullPipelineStatus(result.status);
          // Update step information
          if (result.current_step) {
            setCurrentStep(result.current_step);
          }
          if (result.step_progress) {
            setStepProgress(result.step_progress);
          }
          // Continue polling if still processing
          if (result.status === 'pending' || result.status === 'running') {
            setTimeout(checkStatus, 30000); // Poll every 30 seconds
          }
      }
    } catch (error) {
        console.error('Error polling full pipeline status:', error);
        setTimeout(checkStatus, 60000); // Retry after 60 seconds on error
      }
    };

    checkStatus();
  };


  const fetchFullPipelineResults = async (jobId) => {
    try {
      const response = await fetch(getApiUrl(`api/drn/full-pipeline/${jobId}/results`), {
        headers: {
          'ngrok-skip-browser-warning': 'true',
        },
      });
      const result = await response.json();

      if (response.ok && result.results) {
        // Results available (currently placeholder from backend)
      } else if (response.status === 202) {
        // Still processing
        setTimeout(() => fetchFullPipelineResults(jobId), 5000);
        } else {
        throw new Error(result.error || 'Failed to fetch results');
        }
      } catch (error) {
      console.error('Error fetching full pipeline results:', error);
      setFullPipelineError(error.message);
    }
  };



  // Save model to user's account
  // Handle opening the name modal
  const handleSaveModelClick = () => {
    if (!user || !user.id) {
      alert('Please log in to save models');
      return;
    }

    if (!fullPipelineJobId) {
      alert('No job to save. Please submit a job first.');
      return;
    }

    // Generate a default name based on job info, including job ID
    const defaultName = `DRN Model - Job ID: ${fullPipelineJobId}`;
    setModelName(defaultName);
    setShowNameModal(true);
  };

  // Save model to user's account (can save jobs in any state: pending, running, completed, etc.)
  const saveModelToAccount = async (name) => {
    if (!user || !user.id) {
      alert('Please log in to save models');
      return;
    }

    if (!fullPipelineJobId) {
      alert('No job to save. Please submit a job first.');
      return;
    }

    if (!name || !name.trim()) {
      alert('Please enter a name for the model run');
      return;
    }

    setIsSavingModel(true);
    setShowNameModal(false);

    try {
      // Prepare model data - include current status
      const modelData = {
        type: 'DRN',
        name: name.trim(), // Save the user-provided name
        jobId: fullPipelineJobId,
        status: fullPipelineStatus || 'pending', // Save current status (pending, running, completed, etc.)
        locations: selectedLocations.map(loc => ({
          lat: loc.lat,
          lng: loc.lng,
          ewRiverInput: loc.ewRiverInput || 1
        })),
        parameters: {
          simulationDuration: yearRun,
          outputTimestep: timeStep,
          feedstock: feedstock,
          locationMode: locationMode,
          numLocations: selectedLocations.length
        },
        outletCheckResults: outletCheckResults ? {
          sameOutlet: outletCheckResults.same_outlet,
          outletComids: outletCheckResults.outlet_comids,
          uniqueOutlets: outletCheckResults.unique_outlets
        } : null,
        currentStep: currentStep, // Save current step information
        stepProgress: stepProgress, // Save step progress
        savedAt: new Date().toISOString(), // Changed from completedAt to savedAt
        // Only set completedAt if job is actually completed
        ...(fullPipelineStatus === 'completed' && { completedAt: new Date().toISOString() })
      };

      // Save to userService (now async)
      const savedModel = await userService.saveUserModel(user.id, modelData);

      if (savedModel) {
        setIsModelSaved(true);
        alert('Model saved successfully! View it in Account → My Models');
        } else {
        throw new Error('Failed to save model');
        }
      } catch (error) {
      console.error('Error saving model:', error);
      alert('Failed to save model. Please try again.');
    } finally {
      setIsSavingModel(false);
    }
  };

  // Check if model is already saved (for any job status)
  useEffect(() => {
    if (user && user.id && fullPipelineJobId) {
      userService.getUserModels(user.id)
        .then((savedModels) => {
          const isSaved = savedModels.some(model => 
            model.type === 'DRN' && model.jobId === fullPipelineJobId
          );
          console.log('Checking if model is saved:', {
            userId: user.id,
            jobId: fullPipelineJobId,
            savedModelsCount: savedModels.length,
            isSaved
          });
          setIsModelSaved(isSaved);
        })
        .catch((error) => {
          console.error('Error checking if model is saved:', error);
          setIsModelSaved(false);
        });
    } else {
      // Reset isModelSaved when job changes or user changes
      setIsModelSaved(false);
    }
  }, [user, fullPipelineJobId]);

  const downloadFullPipelineResults = async (jobId) => {
    if (isDownloading) {
      return; // Prevent multiple simultaneous downloads
    }
    
    setIsDownloading(true);
    setFullPipelineError(null);
    setDownloadStatus('Connecting to server...');
    
    // Store timer references to clear them later
    const statusTimers = [];
    let isActive = true;
    
    // Update status messages to show progress
    const statusUpdates = [
      { time: 2000, message: 'Creating ZIP file on Grace HPC...' },
      { time: 5000, message: 'Compressing results...' },
      { time: 10000, message: 'Transferring files...' },
      { time: 15000, message: 'Almost ready...' },
    ];
    
    statusUpdates.forEach(({ time, message }) => {
      const timer = setTimeout(() => {
        if (isActive) {
          setDownloadStatus(message);
        }
      }, time);
      statusTimers.push(timer);
    });
    
    try {
      setDownloadStatus('Requesting download...');
      
      const response = await fetch(getApiUrl(`api/drn/full-pipeline/${jobId}/download`), {
        headers: {
          'ngrok-skip-browser-warning': 'true',
        },
      });

      setDownloadStatus('Receiving data...');

      if (response.ok) {
        setDownloadStatus('Processing file...');
        const blob = await response.blob();
        setDownloadStatus('Starting download...');
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `drn_results_${jobId}.zip`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        setDownloadStatus('Download complete!');
        // Clear status after a moment
        setTimeout(() => {
          setDownloadStatus('');
          isActive = false;
            }, 1000);
        } else {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to download results');
        }
        } catch (error) {
      console.error('Error downloading results:', error);
      setFullPipelineError(error.message || 'Failed to download results. Please try again.');
      setDownloadStatus('Download failed');
      alert(`Download failed: ${error.message || 'Unknown error'}`);
      // Clear status after showing error
      setTimeout(() => {
        setDownloadStatus('');
        isActive = false;
      }, 3000);
    } finally {
      // Clear all status timers
      statusTimers.forEach(timer => clearTimeout(timer));
      isActive = false;
      setIsDownloading(false);
    }
  };


  const updateLocationParameter = (index, key, value) => {
    const newLocations = [...selectedLocations];
    newLocations[index] = { ...newLocations[index], [key]: value };
    setSelectedLocations(newLocations);
  };

  // Handle mode selection - start with a brand new model run
  const handleModeSelection = (mode) => {
    setLocationMode(mode);
    setShowModeSelection(false);
    
    // Clear all existing state to start fresh (only if not viewing saved model)
    if (!savedData) {
      // Clear locations
      setSelectedLocations([]);
      setCurrentLocationIndex(-1);
      setCurrentPage(1);
      
      // Clear job state
      setFullPipelineJobId(null);
      setFullPipelineStatus(null);
      setFullPipelineError(null);
      setCurrentStep(null);
      setStepProgress(null);
      
      // Clear watershed results
      setWatershedResults(null);
      setWatershedStatus(null);
      setWatershedError(null);
      setIsGeneratingWatershed(false);
      
      // Clear outlet check status
      setOutletCheckStatus(null);
      setOutletCheckResults(null);
      setOutletCheckError(null);
      
      // Clear download state
      setIsDownloading(false);
      setDownloadStatus('');
      
      // Clear save state
      setIsModelSaved(false);
      
      // Reset to default parameters
      setYearRun(12);
      setTimeStep(1);
      setFeedstock('basalt');
    } else {
      // If viewing saved model, only clear locations when switching modes
      if (selectedLocations.length > 0) {
        setSelectedLocations([]);
        setWatershedResults(null);
        setWatershedStatus(null);
        setWatershedError(null);
        setIsGeneratingWatershed(false);
        setCurrentLocationIndex(-1);
        setOutletCheckStatus(null);
        setOutletCheckError(null);
      }
    }
  };

  // Check if multiple locations share the same outlet
  const checkOutletCompatibility = async () => {
    if (locationMode !== 'multiple' || selectedLocations.length < 2) {
      return;
    }

    setOutletCheckStatus('checking');
    setOutletCheckError(null);
    setOutletCheckResults(null);

    try {
      const coordinates = selectedLocations.map(loc => [loc.lat, loc.lng]);
      
      // Submit the check - backend now runs synchronously and returns results immediately
      const response = await fetch(getApiUrl('api/drn/check-outlet-compatibility'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true',
        },
        body: JSON.stringify({ coordinates }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to check outlet compatibility');
      }

      // Backend returns results immediately (synchronous execution)
      // Check if result has job_id (async mode) or results directly (sync mode)
      if (result.job_id) {
        // Async mode: Backend returned a job_id, need to poll
        const jobId = result.job_id;
        
        // Poll for status and results
        const pollForResults = async (retryCount = 0) => {
          const initialWaitTime = 120000; // 2 minutes in milliseconds
          const pollingInterval = 2000; // 2 seconds
          const maxRetries = 300;
          
          try {
            if (retryCount === 0) {
              setTimeout(() => pollForResults(1), initialWaitTime);
      return;
    }

            const statusResponse = await fetch(getApiUrl(`api/drn/check-outlet-compatibility/${jobId}/status`), {
              headers: {
                'ngrok-skip-browser-warning': 'true',
              },
            });
            
            const statusResult = await statusResponse.json();
            
            if (!statusResponse.ok) {
              throw new Error(statusResult.error || 'Failed to check status');
            }

            const status = statusResult.status;

            if (status === 'completed' || statusResult.results) {
              const results = statusResult.results || statusResult;
              setOutletCheckResults(results);
              if (results.same_outlet) {
                setOutletCheckStatus('same');
      } else {
                setOutletCheckStatus('different');
              }
            } else if (status === 'failed' || status === 'cancelled' || status === 'timeout') {
              setOutletCheckStatus('error');
              setOutletCheckError(`Job ${status}`);
            } else if (status === 'pending' || status === 'running' || status === 'unknown') {
              if (retryCount < maxRetries) {
                setTimeout(() => pollForResults(retryCount + 1), pollingInterval);
      } else {
                setOutletCheckStatus('error');
                setOutletCheckError('Timeout waiting for results');
              }
        } else {
              if (retryCount < maxRetries) {
                setTimeout(() => pollForResults(retryCount + 1), pollingInterval);
              } else {
                setOutletCheckStatus('error');
                setOutletCheckError('Unknown status');
              }
      }
    } catch (error) {
            console.error('Error polling outlet compatibility:', error);
            if (retryCount < maxRetries) {
              setTimeout(() => pollForResults(retryCount + 1), pollingInterval);
            } else {
              setOutletCheckStatus('error');
              setOutletCheckError(error.message);
            }
          }
        };

        pollForResults();
      } else {
        // Synchronous mode: Results returned immediately
        setOutletCheckResults(result);
        if (result.same_outlet) {
          setOutletCheckStatus('same');
          
          // If watersheds are provided directly in the response, use them
          if (result.watersheds) {
            setWatershedResults(result.watersheds);
            setWatershedStatus('completed');
            console.log(`Received ${Object.keys(result.watersheds).length} watershed layers directly`);
          }
          // If watershed_job_id is provided (async mode), start polling for watershed results
          else if (result.watershed_job_id) {
            setWatershedJobId(result.watershed_job_id);
            setWatershedStatus('submitted');
            pollWatershedResults(result.watershed_job_id);
          }
      } else {
          setOutletCheckStatus('different');
        }
      }
    } catch (error) {
      console.error('Error checking outlet compatibility:', error);
      setOutletCheckStatus('error');
      setOutletCheckError(error.message);
    }
  };

  // Poll for watershed results
  const pollWatershedResults = async (jobId) => {
    const poll = async (retryCount = 0) => {
      const maxRetries = 300; // 10 minutes max (300 * 2 seconds)
      const pollingInterval = 2000; // 2 seconds
      
      try {
        // Check watershed job status
        const statusResponse = await fetch(getApiUrl(`api/drn/watershed/${jobId}/status`), {
          headers: {
            'ngrok-skip-browser-warning': 'true',
          },
        });
        
        const statusResult = await statusResponse.json();
        
        if (!statusResponse.ok) {
          throw new Error(statusResult.error || 'Failed to check watershed status');
        }

        const status = statusResult.status;

        if (status === 'completed') {
          setWatershedStatus('completed');
          // Fetch watershed results
          fetchWatershedResults(jobId);
        } else if (status === 'failed' || status === 'cancelled' || status === 'timeout') {
          setWatershedStatus('failed');
        } else if (status === 'pending' || status === 'running' || status === 'unknown') {
          setWatershedStatus(status);
          if (retryCount < maxRetries) {
            setTimeout(() => poll(retryCount + 1), pollingInterval);
        } else {
            setWatershedStatus('timeout');
        }
      } else {
          if (retryCount < maxRetries) {
            setTimeout(() => poll(retryCount + 1), pollingInterval);
        } else {
            setWatershedStatus('timeout');
        }
      }
    } catch (error) {
        console.error('Error polling watershed status:', error);
        if (retryCount < maxRetries) {
          setTimeout(() => poll(retryCount + 1), pollingInterval);
        } else {
          setWatershedStatus('error');
        }
      }
    };

    poll();
  };

  // Fetch watershed results
  const fetchWatershedResults = async (jobId) => {
    try {
      const response = await fetch(getApiUrl(`api/drn/watershed/${jobId}/results`), {
        headers: {
          'ngrok-skip-browser-warning': 'true',
        },
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to fetch watershed results');
      }

      setWatershedResults(result.shapefiles);
    } catch (error) {
      console.error('Error fetching watershed results:', error);
      setWatershedStatus('error');
    }
  };

  // Generate watersheds for selected locations
  const generateWatersheds = async () => {
    if (selectedLocations.length === 0) {
      setWatershedError('Please select at least one location');
      setTimeout(() => setWatershedError(null), 3000);
      return;
    }

    setIsGeneratingWatershed(true);
    setWatershedError(null);
    setWatershedResults(null);

    try {
      const coordinates = selectedLocations.map(loc => [loc.lat, loc.lng]);
      
      // Call backend to generate watersheds locally
      const response = await fetch(getApiUrl('api/drn/generate-watershed'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true',
        },
        body: JSON.stringify({ coordinates }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to generate watersheds');
      }

      // Check if watersheds are returned directly (local execution)
      if (result.watersheds) {
        setWatershedResults(result.watersheds);
        setWatershedStatus('completed');
        console.log(`Successfully generated ${Object.keys(result.watersheds).length} watershed layers`);
      } 
      // Otherwise, it's a SLURM job - poll for results
      else if (result.job_id) {
        setWatershedJobId(result.job_id);
        setWatershedStatus('submitted');
        pollWatershedResults(result.job_id);
      } else {
        throw new Error('Unexpected response format');
      }
    } catch (error) {
      console.error('Error generating watersheds:', error);
      setWatershedError(error.message);
      setWatershedStatus('error');
    } finally {
      setIsGeneratingWatershed(false);
    }
  };

  // Removed automatic checking - user will trigger manually via button

  // Show loading state while checking authentication
  if (authLoading) {
    return (
      <div className="flex items-center justify-center p-10">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Show message if not authenticated
  if (!user) {
    return (
      <div className="p-6">
        <Card className="shadow-lg max-w-md mx-auto">
          <CardContent className="p-6 text-center">
            <h2 className="text-2xl font-bold text-gray-800 mb-4">Authentication Required</h2>
            <p className="text-gray-600 mb-6">
              You must be logged in to access DRN model configuration.
            </p>
            <Button 
              onClick={() => window.location.href = '/#/login'}
              className="w-full bg-blue-500 text-white hover:bg-blue-600"
            >
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div>
      {/* Model Name Modal */}
      {showNameModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50 bg-gray-900/40">
          <div className="bg-white p-8 rounded-lg shadow-xl max-w-md w-full mx-4">
            <h2 className="text-2xl font-bold mb-4 text-center text-gray-800">
              Name Your Model Run
            </h2>
            <p className="text-gray-600 mb-4 text-center text-sm">
              Enter a name to identify this model run in your saved models
            </p>
            
            <div className="mb-6">
              <Label htmlFor="modelName" className="text-sm font-medium text-gray-700 mb-2 block">
                Model Name
              </Label>
              <Input
                id="modelName"
                type="text"
                value={modelName}
                onChange={(e) => setModelName(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-md"
                placeholder="Enter model name"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && modelName.trim()) {
                    saveModelToAccount(modelName);
                  }
                }}
                autoFocus
              />
            </div>
            
            <div className="flex gap-3">
              <Button
                onClick={() => saveModelToAccount(modelName)}
                disabled={!modelName.trim() || isSavingModel}
                className="flex-1 bg-blue-500 hover:bg-blue-600 text-white"
              >
                {isSavingModel ? 'Saving...' : 'Save'}
              </Button>
              <Button
                onClick={() => {
                  setShowNameModal(false);
                  setModelName('');
                }}
                disabled={isSavingModel}
                className="flex-1 bg-gray-500 hover:bg-gray-600 text-white"
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Mode Selection Modal */}
      {showModeSelection && (
        <div className="fixed inset-0 flex items-center justify-center z-50 bg-gray-900/40">
          <div className="bg-white p-8 rounded-lg shadow-xl max-w-2xl w-full mx-4">
            <h2 className="text-2xl font-bold mb-6 text-center text-gray-800">
              Select Location Mode
            </h2>
            <p className="text-gray-600 mb-6 text-center">
              Do you plan to apply crushed rock at:
            </p>
            
            <div className="space-y-4">
              <button
                onClick={() => handleModeSelection('single')}
                className="w-full p-6 border-2 border-blue-500 rounded-lg hover:bg-blue-50 transition-all text-left"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-semibold text-gray-800 mb-2">
                      (A) One location only
                    </h3>
                    <p className="text-gray-600">
                      Select a single location on the map and generate its watershed.
                    </p>
                  </div>
                  <div className="text-3xl">📍</div>
                </div>
              </button>

              <button
                onClick={() => handleModeSelection('multiple')}
                className="w-full p-6 border-2 border-green-500 rounded-lg hover:bg-green-50 transition-all text-left"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-semibold text-gray-800 mb-2">
                      (B) Multiple locations that drain to the same outlet
                    </h3>
                    <p className="text-gray-600">
                      Select multiple locations. The system will check if they share the same outlet.
                    </p>
                  </div>
                  <div className="text-3xl">📍📍</div>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}


      <div className="flex gap-6">
        <div className="w-3/5">
          <h3 className="text-xl font-bold text-center mb-6 text-gray-800">DRN Area of Interest</h3>
          
          {/* Location Management Controls */}
          <div className="mb-4">
          </div>
          
          <MapComponent 
            onLocationSelect={handleLocationSelect} 
            disabled={(() => {
              // Allow location selection if no locations are selected yet, even if job is pending
              // This allows users to start a new configuration
              const hasNoLocations = selectedLocations.length === 0;
              const isDisabled = !locationMode || 
                (!!fullPipelineJobId && !hasNoLocations && (fullPipelineStatus === 'submitted' || fullPipelineStatus === 'pending' || fullPipelineStatus === 'running')) ||          
                (locationMode === 'multiple' && (outletCheckStatus === 'same' || outletCheckStatus === 'checking')) ||                                            
                (locationMode === 'single' && selectedLocations.length >= 1);
              return isDisabled;
            })()} 
            selectedLocations={selectedLocations}
            currentLocationIndex={currentLocationIndex}
            watershedResults={watershedResults}
          />

          {/* Output Folder Section - PDFs and Download */}
          {fullPipelineJobId && (
            <div className="mt-16 space-y-3">
              {/* Download Button - Only show when job is completed */}
              {fullPipelineStatus === 'completed' && (
                <Button 
                  onClick={() => downloadFullPipelineResults(fullPipelineJobId)}
                  disabled={isDownloading}
                  className={`w-full text-lg font-semibold rounded-md p-8 ${
                    isDownloading 
                      ? 'bg-gray-400 text-white cursor-not-allowed' 
                      : 'bg-green-500 text-white hover:bg-green-600'
                  }`}
                >
                  {isDownloading 
                    ? (downloadStatus || 'Preparing Download...') 
                    : 'Download Model Results (.zip)'}
                </Button>
              )}
              
            </div>
          )}
        </div>
        <div className="w-2/5">
          <h3 className="text-xl font-bold text-center mb-6 text-gray-800">DRN Model Configuration</h3>
          <Card className="mt-15 p-6 shadow-lg rounded-xl border border-gray-200">
            <CardContent>
              {/* Saved Job Restore Section - Only show when viewing from Account → My Models */}
              {!fullPipelineJobId && savedData && (() => {
                const latestJobId = localStorage.getItem('drn_latest_job_id');
                if (latestJobId) {
                  const savedJob = localStorage.getItem(`drn_job_${latestJobId}`);
                  if (savedJob) {
                    try {
                      const jobInfo = JSON.parse(savedJob);
                      // Only show if job is not completed or failed
                      if (jobInfo.status !== 'completed' && jobInfo.status !== 'failed') {
                        return (
                          <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                            <div className="flex items-center justify-between">
                              <div>
                                <h4 className="text-sm font-semibold text-blue-900 mb-1">Saved Job Found</h4>
                                <p className="text-xs text-blue-700">
                                  Job ID: {jobInfo.jobId} • Status: {jobInfo.status || 'submitted'}
                                  {jobInfo.submittedAt && (
                                    <> • Submitted: {new Date(jobInfo.submittedAt).toLocaleString()}</>
                                  )}
                                </p>
                              </div>
                              <Button
                                onClick={() => {
                                  setFullPipelineJobId(jobInfo.jobId);
                                  setFullPipelineStatus(jobInfo.status || 'submitted');
                                  if (jobInfo.locations) {
                                    setSelectedLocations(jobInfo.locations);
                                  }
                                  if (jobInfo.parameters) {
                                    if (jobInfo.parameters.monthRun) setYearRun(jobInfo.parameters.monthRun);
                                    if (jobInfo.parameters.timeStep) setTimeStep(jobInfo.parameters.timeStep);
                                    if (jobInfo.parameters.feedstock) setFeedstock(jobInfo.parameters.feedstock);
                                  }
                                  setCurrentPage(2);
                                  pollFullPipelineStatus(jobInfo.jobId);
                                }}
                                className="bg-blue-500 hover:bg-blue-600 text-white text-sm px-4 py-2"
                              >
                                Restore Job
                              </Button>
                            </div>
                          </div>
                        );
                      }
                    } catch (error) {
                      console.error('Error parsing saved job:', error);
                    }
                  }
                }
                return null;
              })()}
              
              {/* Page Navigation */}
              <div className="flex items-stretch mb-6 pb-4 border-b">
                <button
                  onClick={() => setCurrentPage(1)}
                  disabled={!!savedData}
                  className={`flex-1 px-3 py-1 h-12 text-sm font-medium transition-colors rounded-l-sm border-r h-9 ${
                    savedData
                      ? 'bg-gray-100 text-gray-400 cursor-not-allowed border-gray-200'
                      : currentPage === 1
                      ? 'bg-blue-500 text-white border-blue-600'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300 border-gray-300'
                  }`}
                >
                  1. Select Locations
                </button>
                <button
                  onClick={() => {
                    // Only allow going to page 2 if:
                    // - Single location mode with at least 1 location, OR
                    // - Multiple location mode with outlet compatibility checked and same outlet                                                                               
                    const canGoToPage2 = 
                      (locationMode === 'single' && selectedLocations.length >= 1) ||                                                                           
                      (locationMode === 'multiple' && selectedLocations.length >= 2 && outletCheckStatus === 'same');                                             
                    if (canGoToPage2) {
                      setCurrentPage(2);
                    }
                  }}
                  disabled={
                    // Always enabled when viewing saved model, otherwise check normal conditions
                    savedData ? false : !(
                      (locationMode === 'single' && selectedLocations.length >= 1) ||                                                                           
                      (locationMode === 'multiple' && selectedLocations.length >= 2 && outletCheckStatus === 'same')                                              
                    )
                  }
                  className={`flex-1 px-3 py-1 h-12 text-sm font-medium transition-colors rounded-r-sm h-9 ${                                                        
                    savedData || (locationMode === 'single' && selectedLocations.length >= 1) ||                                                                             
                    (locationMode === 'multiple' && selectedLocations.length >= 2 && outletCheckStatus === 'same')                                                
                      ? currentPage === 2
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                      : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  2. Model Parameters
                </button>
              </div>

              {/* Page 1: Step 1 - Location Selection */}
              {currentPage === 1 && (
                <>
                  <h4 className="text-md font-semibold mb-4">
                    Click on the map to select locations within CONUS
                    {locationMode === 'single' ? ' (1 location)' : ' (up to 5 locations)'}
                  </h4>
              {!locationMode && (
                <p className="text-sm text-gray-500 mb-4">
                  Please select a location mode above to begin.
                </p>
              )}
              <div className="flex justify-between items-center mb-4 mt-3">
                <p className="text-gray-500">
                  {selectedLocations.length > 0 
                    ? `${selectedLocations.length} location(s) selected. Current: ${selectedLocation?.lat.toFixed(3)}, ${selectedLocation?.lng.toFixed(3)}`
                    : "No locations selected"}
                </p>
                {selectedLocations.length > 0 && locationMode !== 'single' && (
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
                            <strong>Location {index + 1}:</strong> 
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
                          
                          
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Check Outlet Compatibility Button (Multiple Mode Only) */}
              {locationMode === 'multiple' && selectedLocations.length >= 2 && (
                <div className="mb-4">
                  <Button
                    onClick={checkOutletCompatibility}
                    disabled={outletCheckStatus === 'checking'}
                    className="w-full bg-purple-500 hover:bg-purple-600 text-white py-2 rounded-md font-semibold disabled:opacity-50"
                  >
                    {outletCheckStatus === 'checking' 
                      ? 'Checking Outlet Compatibility...' 
                      : 'Check Outlet Compatibility'}
                  </Button>

                  {/* Outlet Compatibility Status Display */}
                  {outletCheckStatus === 'checking' && (
                    <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                        <p className="text-blue-700">Checking if all locations drain to the same outlet...</p>
                </div>
                    </div>
                  )}

                  {outletCheckStatus === 'same' && outletCheckResults && (
                    <div className="mt-4 p-4 bg-green-50 border-2 border-green-500 rounded-lg">
                      <div className="flex items-center gap-3 mb-3">
                        <h3 className="text-lg font-bold text-green-800">All Locations Share the Same Outlet</h3>
                      </div>
                      <p className="text-gray-700 mb-3 text-sm">
                       You can proceed with model configuration for all locations.
                      </p>
                    </div>
                  )}

                  {outletCheckStatus === 'different' && outletCheckResults && (
                    <div className="mt-4 p-4 bg-yellow-50 border-2 border-yellow-500 rounded-lg">
                      <div className="flex items-center gap-3 mb-3">
                        <h3 className="text-md font-bold text-yellow-800">Locations Have Different Outlets</h3>
                      </div>
                      {outletCheckResults.results && outletCheckResults.results.length > 0 && (
                        <div className="rounded p-3 mb-3 max-h-48 overflow-y-auto">
                          <div className="space-y-1 text-xs">
                            {outletCheckResults.results.map((result, idx) => (
                              <div key={idx} className="border-l-2 border-yellow-500 pl-2">
                                <p className="text-gray-700">
                                  <strong>Location {idx + 1}:</strong> ({result.lat?.toFixed(4)}, {result.lon?.toFixed(4)})
                                </p>
                                <p className="text-gray-600">
                                  COMID: {result.comid} → Outlet COMID: {result.outlet_comid}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
           
                      <div className="bg-blue-50 border border-blue-200 rounded p-3">
                        <p className="text-sm text-gray-700 mb-1">
                          <strong>Options:</strong>
                        </p>
                        <ul className="text-xs text-gray-600 space-y-1 list-disc list-inside">
                          <li>Remove some locations to keep only those with the same outlet</li>
                          <li>Run simulations individually for each location</li>
                        </ul>
                      </div>
                    </div>
                  )}

                  {outletCheckStatus === 'error' && (
                    <div className="mt-4 p-4 bg-red-50 border-2 border-red-500 rounded-lg">
                      <div className="flex items-center gap-3 mb-3">
                        <span className="text-2xl">✗</span>
                        <h4 className="text-lg font-bold text-red-800">Error Checking Outlet Compatibility</h4>
                      </div>
                      <p className="text-gray-700 mb-3 text-sm">
                        {outletCheckError || 'An error occurred while checking outlet compatibility.'}
                      </p>
                      <Button
                        onClick={checkOutletCompatibility}
                        className="w-full bg-red-600 hover:bg-red-700 text-white"
                      >
                        Retry
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* Generate Watershed Button */}
              {selectedLocations.length > 0 && (
                <div className="mb-4">
                  <Button
                    onClick={generateWatersheds}
                    disabled={isGeneratingWatershed}
                    className="w-full bg-green-500 hover:bg-green-600 text-white py-2 rounded-md font-semibold disabled:opacity-50"
                  >
                    {isGeneratingWatershed 
                      ? 'Generating Watersheds...' 
                      : 'Generate Watershed'}
                  </Button>
                  
                  {watershedStatus === 'submitted' && (
                    <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded text-center">
                      <p className="text-sm text-blue-700">
                        Watershed generation in progress...
                      </p>
                </div>
                  )}
                  
                  {watershedError && (
                    <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-center">
                      <p className="text-sm text-red-700">
                        Error: {watershedError}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Next Button for Page 1 */}
              {currentPage === 1 && (
                <div className="mt-6">
                  <Button
                    onClick={() => setCurrentPage(2)}
                    disabled={
                      !(
                        (locationMode === 'single' && selectedLocations.length >= 1) ||                                                                         
                        (locationMode === 'multiple' && selectedLocations.length >= 2 && outletCheckStatus === 'same')                                            
                      )
                    }
                    className="w-full bg-blue-500 hover:bg-blue-600 text-white py-2 rounded-md font-semibold disabled:opacity-50 disabled:cursor-not-allowed"   
                  > Continue to Step 2 </Button>
                </div>
              )}
                </>
              )}

              {/* Page 2: Step 2 - Model Parameters */}
              {currentPage === 2 && (
                <>
                  <h4 className="text-md font-semibold mb-4">Set DRN Model Parameters</h4>
                    {/* Global Parameters for All Locations */}
                    <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
                      <h4 className="text-md font-semibold text-blue-900 mb-6">Global Parameters</h4>

                <div className="flex items-center gap-4 mb-4">
                              <Label htmlFor="yearRun" className="w-44 font-semibold">Simulation Duration (months)</Label>
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
                    className="flex-1 bg-white" 
                  />
                </div>

                <div className="flex items-center gap-4 mb-4">
                  <Label htmlFor="timeStep" className="w-44 font-semibold">Output Timestep (days)</Label>
                  <Input
                    id="timeStep"
                    name="timeStep"
                    type="number" 
                                step="1" 
                    value={timeStep} 
                    onChange={(e) => setTimeStep(e.target.value)} 
                    className="flex-1 bg-white" 
                  />
                </div>

                      <div className="flex items-center gap-4 mb-4">
                        <Label htmlFor="feedstock" className="w-44 font-semibold">Feedstock Type</Label>
                        <Select value={feedstock} onValueChange={setFeedstock}>
                          <SelectTrigger className="flex-1 bg-white">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="basalt">Basalt</SelectItem>
                            <SelectItem value="carbonate">Carbonate</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* Location-Specific Parameters */}
                    {selectedLocations.length > 0 && (
                      <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
                        <h4 className="text-md font-semibold text-blue-900 mb-3">EW River Input</h4>
                        
                        <div className="space-y-3">
                          {selectedLocations.map((location, index) => (
                            <div key={index} className="grid grid-cols-3 gap-4 p-2 ">
                              <div className="flex items-center">
                                <Label className="text-sm font-semibold text-gray-700">
                                  Location {index + 1}:
                                </Label>
                              </div>
                              <div className="flex items-center">
                                <Input
                                  id={`ewRiverInput-${index}`}
                                  name={`ewRiverInput-${index}`}
                                  type="number"
                                  step="0.1"
                                  min="0"
                                  value={location.ewRiverInput || ''}
                                  onChange={(e) => updateLocationParameter(index, 'ewRiverInput', parseFloat(e.target.value) || 1)}
                                  className="flex-1 bg-white"
                                  placeholder="1.0"
                                />
                              </div>
                              <div className="flex items-center">
                                <Label className="text-sm font-semibold text-gray-700">
                                  ton/ha/yr
                                </Label>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}


                {/* Monte Carlo Count - Commented out
                <div className="flex items-center gap-4 mb-4">
                  <Label htmlFor="monteCount" className="w-44 font-semibold">Monte Carlo Count</Label>
                  <Input
                    id="monteCount"
                    name="monteCount"
                    type="number" 
                    step="1" 
                    min="0"
                    max="100"
                    value={monteCount} 
                    onChange={(e) => {
                      const value = parseInt(e.target.value) || 0;
                      setMonteCount(Math.min(100, Math.max(0, value)));
                    }} 
                    className="flex-1" 
                  />
                  <span className="text-xs text-gray-500">(max: 100)</span>
                </div>
                */}

                <div className="space-y-4">
                  {!fullPipelineJobId ? (
                    <Button 
                      onClick={submitFullPipeline} 
                      className="w-full bg-blue-500 text-white hover:bg-blue-600 rounded-md p-3 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={selectedLocations.length < 1 || isSubmittingFullPipeline}
                    >
                      {isSubmittingFullPipeline ? 'Submitting...' : 'Run DRN Model'}
                        </Button>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <Button 
                            onClick={() => checkFullPipelineStatus(fullPipelineJobId)} 
                            className="flex-1 bg-yellow-500 text-white hover:bg-yellow-600 rounded-md p-2 disabled:opacity-50"
                            disabled={isCheckingFullPipelineStatus}
                          >
                            {isCheckingFullPipelineStatus ? 'Checking...' : 'Check Status'}
                          </Button>
                          <Button 
                            onClick={() => {
                              setFullPipelineJobId(null);
                              setFullPipelineStatus(null);
                              setFullPipelineError(null);
                              setCurrentStep(null);
                              setStepProgress(null);
                            }} 
                            className="bg-red-500 text-white hover:bg-red-600 rounded-md px-3"
                          >
                            Reset
                          </Button>
                        </div>
                        
                        {/* Show retry button if there's a connection error */}
                        {fullPipelineError && (fullPipelineError.includes('timeout') || fullPipelineError.includes('Authentication') || fullPipelineError.includes('Network')) && (
                          <Button 
                            onClick={() => {
                              setFullPipelineError(null);
                              checkFullPipelineStatus(fullPipelineJobId);
                            }}
                            className="w-full bg-orange-500 text-white hover:bg-orange-600 rounded-md p-2 text-sm"
                            disabled={isCheckingFullPipelineStatus}
                          >
                            Retry Connection
                          </Button>
                        )}
                      </div>
                    )}
                 
                  {/* Save Model Run Button for Page 2 */}
                  <div className="mb-4">
                    <Button
                      onClick={handleSaveModelClick}
                      disabled={!fullPipelineJobId || isSavingModel || isModelSaved || !user || !user.id}
                      className={`w-full py-2 rounded-md font-semibold ${
                        !fullPipelineJobId || isSavingModel || isModelSaved || !user || !user.id
                          ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                          : 'bg-blue-500 hover:bg-blue-600 text-white'
                      }`}
                    >
                      {isSavingModel 
                        ? 'Saving...' 
                        : isModelSaved 
                        ? 'Model Run Saved'
                        : 'Save Model Run'}
                    </Button>
                      </div>

                  {/* Full Pipeline Status Display */}
                  {(fullPipelineJobId || fullPipelineError) && (
                    <div className="space-y-3">
                      {fullPipelineJobId && (
                        <div className="bg-gray-50 p-3 rounded-lg border">
                          <div className="flex justify-between items-center mb-2">
                            <span className="font-semibold text-sm">Full Pipeline Job Details:</span>
                            <div className="flex items-center gap-2">
                              <span className={`px-2 py-1 rounded text-xs font-medium ${
                                fullPipelineStatus === 'completed' ? 'bg-green-100 text-green-700' :
                                fullPipelineStatus === 'running' ? 'bg-blue-100 text-blue-700' :
                                fullPipelineStatus === 'failed' ? 'bg-red-100 text-red-700' :
                                fullPipelineStatus === 'pending' || fullPipelineStatus === 'submitted' ? 'bg-yellow-100 text-yellow-700' :
                                'bg-gray-100 text-gray-700'
                              }`}>
                                {fullPipelineStatus || 'unknown'}
                              </span>
                            </div>
                          </div>
                          <div className="text-xs text-gray-600 space-y-1">
                            <div><strong>Job ID:</strong> {fullPipelineJobId}</div>
                            <div><strong>Locations:</strong> {selectedLocations.length} location(s)</div>
                            <div><strong>Parameters:</strong> Months: {yearRun}, Timestep: {timeStep}, Feedstock: {feedstock}</div>
                            {/* Monte Count: {monteCount} - commented out */}
                            {(currentStep || fullPipelineStatus === 'completed') && (
                              <div className="mt-2 pt-2 border-t border-gray-300">                                                                              
                                <div className="flex items-center gap-2">
                                  <strong>Current Step:</strong>
                                  <span className={`px-2 py-1 rounded text-xs font-medium ${                                                                    
                                    fullPipelineStatus === 'completed' ? 'bg-green-100 text-green-700' :
                                    stepProgress?.status === 'completed' ? 'bg-green-100 text-green-700' :                                                      
                                    stepProgress?.status === 'failed' ? 'bg-red-100 text-red-700' :                                                             
                                    'bg-blue-100 text-blue-700'
                                  }`}>
                                    {fullPipelineStatus === 'completed' ? 'All 5 Steps Completed' : currentStep}
                                  </span>
                                </div>
                                {stepProgress && (
                                  <div className="mt-2">
                                    <div className="text-xs text-gray-500 mb-1">Pipeline Progress:</div>                                                        
                                    <div className="flex gap-1">
                                      {[1, 2, 3, 4, 5].map((stepNum) => {
                                        // If job is completed, show all steps as completed (green)
                                        if (fullPipelineStatus === 'completed') {
                                          return (
                                            <div
                                              key={stepNum}
                                              className="flex-1 h-2 rounded bg-green-500"
                                              title={`Step ${stepNum}: ${['Site Selection', 'Sample Interpolation', 'DRN Preparation', 'DRN Run', 'Compile Results'][stepNum - 1]} (Completed)`}
                                            />
                                          );
                                        }
                                        // Otherwise, show progress based on current step
                                        return (
                                          <div
                                            key={stepNum}
                                            className={`flex-1 h-2 rounded ${
                                              stepNum < stepProgress.step
                                                ? 'bg-green-500'
                                                : stepNum === stepProgress.step
                                                ? stepProgress.status === 'failed'
                                                  ? 'bg-red-500'
                                                  : 'bg-blue-500 animate-pulse'
                                                : 'bg-gray-300'
                                            }`}
                                            title={`Step ${stepNum}: ${['Site Selection', 'Sample Interpolation', 'DRN Preparation', 'DRN Run', 'Compile Results'][stepNum - 1]}`}
                                          />
                                        );
                                      })}
                                    </div>
                                    <div className="text-xs text-gray-500 mt-1">
                                      {fullPipelineStatus === 'completed' 
                                        ? 'All 5 steps completed' 
                                        : `${stepProgress.step} of 5 steps`}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                    </div>
                  )}
                </div>
                </>
                )}
            </CardContent>
          </Card>
        </div>
      </div>

    </div>
  );
}
