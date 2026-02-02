import React, { useState, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import AlkalinityScatterPlot from './AlkalinityScatterPlot';
import { useAuth } from '@/contexts/AuthContext';
import userService from '@/services/userService';
import 'leaflet/dist/leaflet.css';
import { usStates } from "@/data/usStates"; // Import state codes

// API base URL configuration - Use relative URLs for local development (proxied through Vite)
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
const getApiUrl = (endpoint) => {
  if (API_BASE_URL) return `${API_BASE_URL}/${endpoint}`;
  return `/${endpoint}`;
};

// Map particle size option value to numeric value for API (e.g. "psdrain_320um.in" -> 320)
const particleSizeToNumber = (value) => {
  if (!value) return null;
  const match = value.match(/(\d+)um/);
  return match ? parseInt(match[1], 10) : null;
};

// Add a new component for handling map zoom
function MapZoomHandler({ center, zoom }) {
  const map = useMap();
  
  useEffect(() => {
    if (center && zoom) {
      map.setView(center, zoom);
    }
  }, [center, zoom, map]);

  return null;
}

// Create custom markers for different alkalinity data recency and sample count
const createCustomIcon = (color, sampleCount = 0) => {
  // Calculate size based on sample count (minimum 8px, maximum 20px)
  const minSize = 8;
  const maxSize = 20;
  const maxSamples = 100; // Adjust this based on your data range
  
  // Logarithmic scaling for better visual distribution
  const normalizedSamples = Math.min(sampleCount, maxSamples);
  const sizeMultiplier = normalizedSamples > 0 
    ? Math.log(normalizedSamples + 1) / Math.log(maxSamples + 1)
    : 0;
  const size = Math.max(minSize, minSize + (maxSize - minSize) * sizeMultiplier);
  
  const radius = size / 2 - 1; // Account for stroke width
  const center = size / 2;
  
  return new L.Icon({
    iconUrl: `data:image/svg+xml;base64,${btoa(`
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
        <circle fill="${color}" stroke="#000" stroke-width="1" cx="${center}" cy="${center}" r="${radius}"/>
      </svg>
    `)}`,
    iconSize: [size, size],
    iconAnchor: [center, center],
    popupAnchor: [0, -center],
  });
};
// Time series plots are in TimeSeriesPlot.jsx
// Alkalinity scatter plot is in AlkalinityScatterPlot.jsx

const USGSSiteSelector = ({ handleSiteSelect, location, onSitesLoaded, onStateSelect, onSiteTypeChange }) => {
  const [usgsSites, setUsgsSites] = useState([]);
  const [stateCd, setStateCd] = useState('');
  const [siteType, setSiteType] = useState('stream'); // New state for site type
  const [isLoadingSites, setIsLoadingSites] = useState(false);
  const [allSitesWithAlkalinity, setAllSitesWithAlkalinity] = useState([]);

  // Function to determine marker color based on alkalinity data recency
  const getMarkerColor = (mostRecentAlkalinityDate) => {
    if (!mostRecentAlkalinityDate) return 'gray'; // No alkalinity data
    
    const now = new Date();
    const sampleDate = new Date(mostRecentAlkalinityDate);
    const yearsDiff = (now - sampleDate) / (1000 * 60 * 60 * 24 * 365.25);
    
    if (yearsDiff <= 2) return 'green';   // Within last 1-2 years
    if (yearsDiff <= 5) return 'yellow';  // Within last 5 years
    return 'red';                         // Older than 5 years
  };

  // Function to fetch alkalinity data for each site
  const fetchAlkalinityDataForSites = async (sites) => {
    console.log(`Starting to fetch alkalinity data for ${sites.length} sites...`);
    
    const sitesWithAlkalinity = await Promise.all(
      sites.map(async (site, index) => {
        try {
          console.log(`Fetching alkalinity data for site ${site.id} (${index + 1}/${sites.length})`);
          
          const response = await fetch(
            `https://www.waterqualitydata.us/data/Result/search?siteid=USGS-${site.id}&characteristicName=Alkalinity&mimeType=csv`
          );
          
          console.log(`Response status for site ${site.id}: ${response.status}`);
          
          if (!response.ok) {
            console.log(`Failed to fetch data for site ${site.id}: ${response.status}`);
            return { ...site, markerColor: 'gray', alkalinityInfo: `No data available (HTTP ${response.status})` };
          }

          const csvText = await response.text();
          console.log(`CSV data received for site ${site.id}:`, csvText.slice(0, 200) + '...');
          
          // Parse CSV data
          const lines = csvText.trim().split('\n');
          if (lines.length > 1) { // Check if we have data beyond the header
            const headers = lines[0].split(',').map(h => h.replace(/"/g, ''));
            const resultMeasureIndex = headers.indexOf('ResultMeasureValue');
            const activityStartDateIndex = headers.indexOf('ActivityStartDate');
            
            if (resultMeasureIndex >= 0 && activityStartDateIndex >= 0) {
              // Parse data rows
              const validSamples = [];
              for (let i = 1; i < lines.length; i++) {
                const values = lines[i].split(',').map(v => v.replace(/"/g, ''));
                const measureValue = values[resultMeasureIndex];
                const dateValue = values[activityStartDateIndex];
                
                if (measureValue && !isNaN(parseFloat(measureValue)) && dateValue) {
                  validSamples.push({
                    date: new Date(dateValue),
                    value: parseFloat(measureValue)
                  });
                }
              }
              
              // Sort by date descending
              validSamples.sort((a, b) => b.date - a.date);
              
              console.log(`Found ${validSamples.length} valid alkalinity samples for site ${site.id}`);

              if (validSamples.length > 0) {
                const mostRecent = validSamples[0];
                const color = getMarkerColor(mostRecent.date);
                const yearsAgo = (new Date() - mostRecent.date) / (1000 * 60 * 60 * 24 * 365.25);
                
                console.log(`Site ${site.id}: Most recent sample ${mostRecent.date.toLocaleDateString()}, Color: ${color}`);
                
                return {
                  ...site,
                  markerColor: color,
                  alkalinityInfo: `Last sample: ${mostRecent.date.toLocaleDateString()} (${yearsAgo.toFixed(1)} years ago)`,
                  mostRecentAlkalinity: mostRecent.value,
                  mostRecentAlkalinityDate: mostRecent.date,
                  totalAlkalinitySamples: validSamples.length
                };
              }
            }
          }
          
          console.log(`No valid alkalinity data found for site ${site.id}`);
          return { ...site, markerColor: 'gray', alkalinityInfo: 'No alkalinity data available' };
        } catch (error) {
          console.error(`Error fetching alkalinity data for site ${site.id}:`, error);
          return { ...site, markerColor: 'gray', alkalinityInfo: 'Error loading data' };
        }
      })
    );
    
    console.log('Finished fetching alkalinity data for all sites');
    return sitesWithAlkalinity;
  };

  // Load sites from JSON file based on site type
  useEffect(() => {
    const loadSitesFromJSON = async () => {
      try {
        const fileName = siteType === 'groundwater' ? '/groundwater_site_list.json' : '/stream_site_list.json';
        const response = await fetch(fileName);
        const sitesData = await response.json();
        
        // Normalize the data structure - convert stream sites to match groundwater format
        const normalizedSites = sitesData.map(site => {
          if (siteType === 'stream') {
            // Convert stream site format to match groundwater format
            const siteId = site.site_no.replace('USGS-', ''); // Remove USGS- prefix
            return {
              id: siteId,
              name: `${siteId} - USGS Site`,
              hasAlkalinityData: true
            };
          } else {
            // Groundwater sites already have the correct format
            return site;
          }
        });
        
        setAllSitesWithAlkalinity(normalizedSites);
        console.log(`Loaded ${normalizedSites.length} ${siteType} sites with alkalinity data from JSON`);
      } catch (error) {
        console.error(`Error loading ${siteType} sites from JSON:`, error);
        setAllSitesWithAlkalinity([]);
      }
    };

    loadSitesFromJSON();
  }, [siteType]); // Re-run when site type changes

  useEffect(() => {
    const fetchSitesForState = async () => {
      if (!stateCd) {
        setUsgsSites([]);
        return;
      }

      setIsLoadingSites(true);
      try {
        console.log(`Fetching ${siteType} sites for state ${stateCd} using a more efficient approach...`);
        
        // Use the simpler approach: fetch all sites for the state and then filter for alkalinity
        const response = await fetch(`https://waterservices.usgs.gov/nwis/iv/?format=json&stateCd=${stateCd}&siteStatus=all`);
        const data = await response.json();

        if (!data.value || !data.value.timeSeries) {
          setUsgsSites([]);
          return;
        }

        // Extract unique sites from the response
        const siteGroups = {};
        data.value.timeSeries.forEach(series => {
          const siteId = series.sourceInfo.siteCode[0].value;
          
          if (!siteGroups[siteId]) {
            siteGroups[siteId] = {
              id: siteId,
              name: series.sourceInfo.siteName,
              latitude: series.sourceInfo.geoLocation.geogLocation.latitude,
              longitude: series.sourceInfo.geoLocation.geogLocation.longitude,
            };
          }
        });

        // Filter to only sites that are in our alkalinity list for the selected site type
        const alkalinityIds = new Set(allSitesWithAlkalinity.map(site => site.id));
        const sitesInState = Object.values(siteGroups)
          .filter(site => alkalinityIds.has(site.id))
          .map(site => ({
            id: site.id,
            name: `${site.id} - ${site.name}`,
            latitude: site.latitude,
            longitude: site.longitude,
            hasAlkalinityData: true
          }))
          .sort((a, b) => a.id.localeCompare(b.id));

        console.log(`Found ${sitesInState.length} ${siteType} sites with alkalinity data in ${stateCd} (filtered from ${Object.keys(siteGroups).length} total sites)`);
        
        // Start with gray markers and let real data fetching update the colors
        const sitesWithDefaultColors = sitesInState.map((site) => ({
          ...site,
          markerColor: 'gray', // Default to gray until real data is fetched
          alkalinityInfo: 'Loading alkalinity data...',
          totalAlkalinitySamples: 0 // Default to 0 until real data is fetched
        }));
        
        // Show sites immediately with default gray colors
        setUsgsSites(sitesWithDefaultColors);
        
        // Fetch real alkalinity data in the background for all sites
        console.log(`Starting background alkalinity data fetch for all ${sitesInState.length} ${siteType} sites...`);
        const sitesToFetch = sitesInState;
        const sitesWithRealData = await fetchAlkalinityDataForSites(sitesToFetch);
        
        // Update all sites with real data
        setUsgsSites(prev => {
          const updated = [...prev];
          sitesWithRealData.forEach(realSite => {
            const index = updated.findIndex(s => s.id === realSite.id);
            if (index >= 0) {
              updated[index] = realSite;
            }
          });
          return updated;
        });
        
        console.log(`Updated all ${sitesWithRealData.length} ${siteType} sites with real alkalinity data`);
        
      } catch (error) {
        console.error('Error fetching sites for state:', error);
        setUsgsSites([]);
      } finally {
        setIsLoadingSites(false);
      }
    };

    fetchSitesForState();
  }, [stateCd, allSitesWithAlkalinity, siteType]);

  useEffect(() => {
    onSitesLoaded(usgsSites);
  }, [usgsSites, onSitesLoaded]);

  const handleStateChange = (newStateCd) => {
    setStateCd(newStateCd);
    handleSiteSelect(''); // Reset selected site when state changes
    
    // Find the selected state and notify parent component
    const selectedState = usStates.find(state => state.code === newStateCd);
    if (selectedState) {
      onStateSelect(selectedState);
    }
  };

  const handleSiteTypeChange = (newSiteType) => {
    setSiteType(newSiteType);
    handleSiteSelect(''); // Reset selected site when site type changes
    setUsgsSites([]); // Clear current sites
    
    // Call parent callback to clear selected site and point
    if (onSiteTypeChange) {
      onSiteTypeChange();
    }
    
    // If there's a selected state, zoom back to state level
    if (stateCd) {
      const selectedState = usStates.find(state => state.code === stateCd);
      if (selectedState) {
        onStateSelect(selectedState); // This will reset map center and zoom
      }
    }
  };

  return (
    <div>
      <div className="mb-4">
        <Label className="block mb-2">Select State</Label>
        <select
          className="w-full border rounded-xl p-2"
          value={stateCd}
          onChange={(e) => handleStateChange(e.target.value)}
        >
          <option value="" disabled>Choose a State</option>
          {usStates.map(state => (
            <option key={state.code} value={state.code}>{state.name}</option>
          ))}
        </select>
      </div>
      <div className="mb-4">
        <Label className="block mb-2">Site Type</Label>
        <select
          className="w-full border rounded-xl p-2"
          value={siteType}
          onChange={(e) => handleSiteTypeChange(e.target.value)}
        >
          <option value="stream">Stream Sites</option>
          <option value="groundwater">Groundwater Sites</option>
        </select>
      </div>
      <Label className="block mb-2">Select USGS Site</Label>
      <select
        className="w-full border rounded-xl p-2"
        value={location}
        onChange={(e) => handleSiteSelect(e.target.value)}
        disabled={!stateCd || isLoadingSites}
      >
        <option value="" disabled>
          {stateCd ? (isLoadingSites ? `Loading ${siteType} sites...` : `Choose USGS ${siteType === 'stream' ? 'Stream' : 'Groundwater'} Site`) : 'Select a state first'}
        </option>
        {stateCd && !isLoadingSites && usgsSites.map(site => (
          <option key={site.id} value={site.id}>
            {site.name}
          </option>
        ))}
      </select>
      
      {/* Alkalinity Data Legend */}
      <div className="mt-4 p-3 bg-gray-50 rounded-xl">
        <h3 className="text-sm font-semibold mb-2">Alkalinity Data Legend ({siteType === 'stream' ? 'Stream' : 'Groundwater'} Sites)</h3>
        
        <div className="grid grid-cols-2 gap-4">
          {/* Color Legend */}
          <div>
            <h4 className="text-xs font-semibold mb-1">Data Recency (Color)</h4>
            <div className="space-y-1 text-xs">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                <span>Recent (≤2 years)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                <span>Moderate (2-5 years)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                <span>Old (&gt;5 years)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-gray-500 rounded-full"></div>
                <span>No data available</span>
              </div>
            </div>
          </div>
          
          {/* Size Legend */}
          <div>
            <h4 className="text-xs font-semibold mb-1">Sample Count (Size)</h4>
            <div className="space-y-1 text-xs">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-gray-500 rounded-full"></div>
                <span>Few samples</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-gray-500 rounded-full"></div>
                <span>Moderate samples</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-gray-500 rounded-full"></div>
                <span>Many samples</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default function SCEPTERConfig({ savedData }) {
  const { user } = useAuth();
  const [location, setLocation] = useState('');
  const [feedstock, setFeedstock] = useState('');
  const [particleSize, setParticleSize] = useState('');
  const [applicationRate, setApplicationRate] = useState('');
  const [targetPH, setTargetPH] = useState('');
  const [selectedSite, setSelectedSite] = useState(null);
  const [selectedPoint, setSelectedPoint] = useState(null);
  //const [editedAlkalinity, setEditedAlkalinity] = useState(0);
  const [usgsSites, setUsgsSites] = useState([]);
  const [isLoadingSiteData, setIsLoadingSiteData] = useState(false);
  const [mapCenter, setMapCenter] = useState([39.8283, -98.5795]); // Default US center
  const [mapZoom, setMapZoom] = useState(4); // Default zoom level
  const [selectedStatistic, setSelectedStatistic] = useState('most_recent');
  const [statisticPeriod, setStatisticPeriod] = useState('7d'); // Default to 7 days
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [saveMessageIsError, setSaveMessageIsError] = useState(false);

  // Load saved data when component mounts or savedData changes
  useEffect(() => {
    if (savedData) {
      // Load saved model parameters
      const params = savedData.parameters || {};
      setFeedstock(params.feedstock || '');
      setParticleSize(params.particleSize || '');
      setApplicationRate(params.applicationRate || '');
      setTargetPH(params.targetPH || '');
      setSelectedStatistic(params.selectedStatistic || 'most_recent');
      setStatisticPeriod(params.statisticPeriod || '7d');
      //setEditedAlkalinity(params.alkalinity || 0);

      // Load saved measurements
      
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
            setSelectedPoint({ lat, lng });
            setMapCenter([lat, lng]);
            setMapZoom(8);
          }
        }
      }
    }
  }, [savedData]);

  const handleRunModel = async (e) => {
    e.preventDefault();

    // Resolve coordinate from selected point or location string
    let coordinate = null;
    if (selectedPoint && typeof selectedPoint.lat === 'number' && typeof selectedPoint.lng === 'number') {
      coordinate = [selectedPoint.lat, selectedPoint.lng];
    } else if (location && location.includes(',')) {
      const [lat, lng] = location.split(',').map((c) => parseFloat(c.trim()));
      if (!isNaN(lat) && !isNaN(lng)) coordinate = [lat, lng];
    }
    if (!coordinate || coordinate.length !== 2) {
      setSaveMessage('Please select a location on the map or enter valid coordinates.');
      setSaveMessageIsError(true);
      return;
    }

    const particleSizeNum = particleSizeToNumber(particleSize);
    const applicationRateNum = applicationRate ? parseFloat(applicationRate) : null;
    if (!feedstock || !feedstock.trim()) {
      setSaveMessage('Please select a feedstock type.');
      setSaveMessageIsError(true);
      return;
    }
    if (particleSizeNum == null) {
      setSaveMessage('Please select a particle size.');
      setSaveMessageIsError(true);
      return;
    }
    if (applicationRateNum == null || !Number.isFinite(applicationRateNum) || applicationRateNum <= 0) {
      setSaveMessage('Please enter a valid application rate (positive number).');
      setSaveMessageIsError(true);
      return;
    }

    const body = {
      coordinate,
      feedstock: feedstock.trim().toLowerCase(),
      particle_size: particleSizeNum,
      application_rate: applicationRateNum,
    };
    if (targetPH && targetPH.trim() !== '') {
      const ph = parseFloat(targetPH);
      if (Number.isFinite(ph)) body.target_soil_ph = ph;
    }

    try {
      const response = await fetch(getApiUrl('api/run-scepter'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
        body: JSON.stringify(body),
      });
      const text = await response.text();
      let result = null;
      if (text && text.trim()) {
        try {
          result = JSON.parse(text);
        } catch (_) {}
      }
      if (!response.ok) {
        const msg = result?.error || result?.message || text || `Request failed (${response.status})`;
        setSaveMessage(msg);
        setSaveMessageIsError(true);
        return;
      }
      setSaveMessage(result?.message || 'SCEPTER model run submitted successfully.');
      setSaveMessageIsError(false);
    } catch (err) {
      console.error('SCEPTER run error:', err);
      setSaveMessage(err.message || 'Failed to run SCEPTER model. Please try again.');
      setSaveMessageIsError(true);
    }
  };

  const handleSaveModel = async () => {
    if (!user) {
      setSaveMessage('Please log in to save models');
      setSaveMessageIsError(true);
      return;
    }

    if (!location && !selectedPoint) {
      setSaveMessage('Please select a location first');
      setSaveMessageIsError(true);
      return;
    }

    setIsSaving(true);
    setSaveMessage('');

    try {
      const modelData = {
        name: `SCEPTER - ${location || 'Custom Location'}`,
        model: 'SCEPTER',
        location: location || `${selectedPoint?.lat.toFixed(4)}, ${selectedPoint?.lng.toFixed(4)}`,
        status: 'saved',
        parameters: {
          feedstock,
          particleSize,
          applicationRate,
          targetPH,
          // selectedStatistic,
          // statisticPeriod,
          // discharge: editedDischarge,
          // alkalinity: editedAlkalinity,
          // temperature: editedTemperature,
          // ph: editedPH,
          // bicarbonate: editedBicarbonate
        },
        siteData: selectedSite
      };

      let savedModel;
      
      if (savedData) {
        // Update existing model
        savedModel = await userService.updateUserModel(user.id, savedData.id, modelData);
        if (savedModel) {
          setSaveMessage('Model updated successfully!');
          setSaveMessageIsError(false);
        } else {
          setSaveMessage('Failed to update model');
          setSaveMessageIsError(true);
        }
      } else {
        // Create new model
        savedModel = await userService.saveUserModel(user.id, modelData);
        if (savedModel) {
          setSaveMessage('Model saved successfully!');
          setSaveMessageIsError(false);
        } else {
          setSaveMessage('Failed to save model');
          setSaveMessageIsError(true);
        }
      }
      
      setTimeout(() => setSaveMessage(''), 3000);
    } catch (error) {
      console.error('Error saving model:', error);
      setSaveMessage('Error saving model');
      setSaveMessageIsError(true);
    } finally {
      setIsSaving(false);
    }
  };

/*   const calculateStatistic = (values, statistic) => {
    if (!values || values.length === 0) return null;
    const numericValues = values.map(v => parseFloat(v.value)).filter(v => !isNaN(v));
    if (numericValues.length === 0) return null;

    switch (statistic) {
      case 'mean':
        return numericValues.reduce((a, b) => a + b, 0) / numericValues.length;
      case 'max':
        return Math.max(...numericValues);
      case 'min':
        return Math.min(...numericValues);
      case 'most_recent':
        return parseFloat(values[values.length - 1].value);
      default:
        return null;
    }
  }; */

  const fetchAlkalinityData = async (siteId) => {
    if (!siteId) return;
    
    setIsLoadingSiteData(true);
    try {
      console.log(`Fetching alkalinity data for selected site: ${siteId}`);
      
      // Fetch alkalinity data from WQP API
      const apiUrl = `https://www.waterqualitydata.us/data/Result/search?siteid=USGS-${siteId}&characteristicName=Alkalinity&mimeType=csv`;
      console.log(`API URL: ${apiUrl}`);
      
      const response = await fetch(apiUrl);
      
      console.log(`Response status for site ${siteId}: ${response.status}`);
      
      if (!response.ok) {
        console.log(`Failed to fetch data for site ${siteId}: ${response.status} ${response.statusText}`);
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const csvText = await response.text();
      console.log(`Raw CSV response for site ${siteId}:`, csvText.slice(0, 500));
      
      // Parse CSV data
      const lines = csvText.trim().split('\n');
      console.log(`CSV has ${lines.length} lines (including header)`);
      
      if (lines.length > 1) { // Check if we have data beyond the header
        const headers = lines[0].split(',').map(h => h.replace(/"/g, ''));
        console.log(`CSV headers:`, headers.slice(0, 10)); // Log first 10 headers
        
        const resultMeasureIndex = headers.indexOf('ResultMeasureValue');
        const activityStartDateIndex = headers.indexOf('ActivityStartDate');
        const measureUnitIndex = headers.indexOf('ResultMeasure/MeasureUnitCode');
        
        console.log(`Column indices - ResultMeasureValue: ${resultMeasureIndex}, ActivityStartDate: ${activityStartDateIndex}, MeasureUnit: ${measureUnitIndex}`);
        
        if (resultMeasureIndex >= 0 && activityStartDateIndex >= 0) {
          const validSamples = [];
          for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',').map(v => v.replace(/"/g, ''));
            const measureValue = values[resultMeasureIndex];
            const dateValue = values[activityStartDateIndex];
            const unitValue = measureUnitIndex >= 0 ? values[measureUnitIndex] : 'mg/L';
            
            if (i <= 3) { // Log first few data rows for debugging
              console.log(`Row ${i}: measureValue="${measureValue}", dateValue="${dateValue}", unit="${unitValue}"`);
            }
            
            if (measureValue && !isNaN(parseFloat(measureValue)) && dateValue) {
              validSamples.push({
                value: parseFloat(measureValue),
                date: new Date(dateValue),
                unit: unitValue || 'mg/L'
              });
            }
          }
          
          // Sort by date descending to get most recent
          validSamples.sort((a, b) => b.date - a.date);
          
          console.log(`Found ${validSamples.length} valid alkalinity samples for site ${siteId}`);
          
          if (validSamples.length > 0) {
            const mostRecent = validSamples[0];
            console.log(`Most recent sample: ${mostRecent.value} ${mostRecent.unit} on ${mostRecent.date.toLocaleDateString()}`);
            
            // Calculate average alkalinity
            const averageAlkalinity = validSamples.reduce((sum, sample) => sum + sample.value, 0) / validSamples.length;
            
            //setEditedAlkalinity(mostRecent.value);
            setSelectedSite(prev => ({
              ...prev,
              alkalinity: mostRecent.value,
              averageAlkalinity: averageAlkalinity,
              alkalinityDateTime: mostRecent.date.toISOString(),
              hasAlkalinity: true,
              alkalinityUnit: mostRecent.unit,
              totalAlkalinitySamples: validSamples.length
            }));
          } else {
            console.log(`No valid alkalinity samples found for site ${siteId}`);
            setSelectedSite(prev => ({
              ...prev,
              hasAlkalinity: false
            }));
          }
        } else {
          console.log(`Required columns not found in CSV for site ${siteId}. ResultMeasureValue index: ${resultMeasureIndex}, ActivityStartDate index: ${activityStartDateIndex}`);
          setSelectedSite(prev => ({
            ...prev,
            hasAlkalinity: false
          }));
        }
      } else {
        console.log(`CSV for site ${siteId} has no data rows (only ${lines.length} lines total)`);
        setSelectedSite(prev => ({
          ...prev,
          hasAlkalinity: false
        }));
        
        // Update the marker color to gray in the sites array
        setUsgsSites(prev => 
          prev.map(s => 
            s.id === siteId 
              ? { ...s, markerColor: 'gray', hasAlkalinity: false, totalAlkalinitySamples: 0, alkalinityInfo: 'No alkalinity data available' }
              : s
          )
        );
      }
    } catch (error) {
      console.error(`Error fetching alkalinity data for site ${siteId}:`, error);
      console.error('Error details:', error.message, error.stack);
      setSelectedSite(prev => ({
        ...prev,
        hasAlkalinity: false,
        errorMessage: error.message
      }));
      
      // Update the marker color to gray in the sites array
      setUsgsSites(prev => 
        prev.map(s => 
          s.id === siteId 
            ? { ...s, markerColor: 'gray', hasAlkalinity: false, totalAlkalinitySamples: 0, alkalinityInfo: 'Error loading data' }
            : s
        )
      );
    } finally {
      setIsLoadingSiteData(false);
    }
  };

  const handleSiteSelect = async (siteId) => {
    const site = usgsSites.find(s => s.id === siteId);
    setSelectedSite(site);
    setLocation(siteId);
    setSelectedPoint(site ? { lat: site.latitude, lng: site.longitude } : null);
    
    // Zoom to the selected site
    if (site) {
      setMapCenter([site.latitude, site.longitude]);
      setMapZoom(10); // Zoom level for individual site view
      await fetchAlkalinityData(siteId);
    }
  };

  function MapClickHandler({ onMapClick }) {
    useMapEvents({
      click: (e) => {
        onMapClick(e.latlng);
      },
    });
    return null;
  }

  /* const handleEditParameters = () => {
    setEditedDischarge(selectedSite?.discharge || 0);
    setEditedAlkalinity(selectedSite?.alkalinity || 0);
    setEditedTemperature(selectedSite?.temperature || 0);
    setEditedPH(selectedSite?.ph || 0);
    setEditedBicarbonate(selectedSite?.bicarbonate || 0);
    setIsEditing(true);
  };

  const handleSaveParameters = () => {
    setSelectedSite(prev => ({
      ...prev,
      discharge: editedDischarge,
      alkalinity: editedAlkalinity,
      temperature: editedTemperature,
      ph: editedPH,
      bicarbonate: editedBicarbonate
    }));
    setIsEditing(false);
  };
 */
  const handleSitesLoaded = useCallback((sites) => {
    setUsgsSites(sites);
  }, []);

  const handleStateSelect = useCallback((state) => {
    setMapCenter(state.center);
    setMapZoom(state.zoom);
  }, []);

  const handleSiteTypeChange = useCallback(() => {
    // Clear selected site and point when site type changes
    setSelectedSite(null);
    setSelectedPoint(null);
    setLocation('');
  }, []);

  useEffect(() => {
    if (location) {
      fetchAlkalinityData(location);
    }
  }, [selectedStatistic, statisticPeriod]);

  return (
    <div className="space-y-6">
      <div className="flex gap-6">
        <div className="w-3/5">
          <h2 className="text-xl font-bold text-center mb-6 text-gray-800">SCEPTER Area of Interest</h2>
          <div className="mt-6">
            <MapContainer center={mapCenter} zoom={mapZoom} style={{ height: '500px', width: '100%' }}>
              <TileLayer
                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}"
                attribution='© Esri, DeLorme, NAVTEQ, TomTom, Intermap, iPC, USGS, FAO, NPS, NRCAN, GeoBase, Kadaster NL, Ordnance Survey, Esri Japan, METI, Esri China (Hong Kong), and the GIS User Community'
              />
              <MapClickHandler 
                onMapClick={(clickedPoint) => {
                  setSelectedPoint(clickedPoint);
                  setLocation(`${clickedPoint.lat.toFixed(4)}, ${clickedPoint.lng.toFixed(4)}`);
                }}
              />
              <MapZoomHandler center={mapCenter} zoom={mapZoom} />
              
              {/* Render all USGS sites with color-coded and size-coded markers */}
              {usgsSites.map(site => (
                <Marker 
                  key={site.id}
                  position={[site.latitude, site.longitude]}
                  icon={createCustomIcon(site.markerColor, site.totalAlkalinitySamples || 0)}
                  eventHandlers={{
                    click: () => handleSiteSelect(site.id)
                  }}
                >
                  <Popup>
                    <div>
                      <strong>{site.name}</strong><br />
                      Lat: {site.latitude.toFixed(4)}<br />
                      Lng: {site.longitude.toFixed(4)}<br />
                      {site.totalAlkalinitySamples > 0 && (
                        <>Alkalinity Samples: {site.totalAlkalinitySamples}</>
                      )}
                      {site.alkalinityInfo && site.alkalinityInfo !== 'Loading alkalinity data...' && (
                        <><br />{site.alkalinityInfo}</>
                      )}
                    </div>
                  </Popup>
                </Marker>
              ))}
              
              {selectedPoint && (
                <Marker position={selectedPoint}>
                  <Popup>
                    Selected Location<br />
                    Lat: {selectedPoint.lat.toFixed(4)}<br />
                    Lng: {selectedPoint.lng.toFixed(4)}
                  </Popup>
                </Marker>
              )}
            </MapContainer>
          </div>
        </div>

        <div className="w-2/5">
          <h2 className="text-xl font-bold text-center  text-gray-800">SCEPTER Model Configuration</h2>
          <Card className="mt-5 rounded-2xl shadow-lg p-6">
            <CardContent className="space-y-6">
              <form onSubmit={handleRunModel} className="space-y-6">
                {/* Location Selection Prompt or Display */}
                {!(selectedPoint || location) ? (
                  <div className="bg-yellow-50 p-4 rounded-xl border border-yellow-300">
                    <h3 className="text-sm font-semibold text-yellow-800 mb-2">Select Location First</h3>
                    <p className="text-sm text-yellow-700">
                      Please click on the map to select a location before configuring model parameters.
                    </p>
                  </div>
                ) : (
                  <div className="bg-blue-50 p-4 rounded-xl border border-blue-200">
                    <h3 className="text-sm font-semibold text-blue-800 mb-2">Selected Location</h3>
                    {selectedPoint ? (
                      <div className="text-sm text-blue-700">
                        <div><strong>Latitude:</strong> {selectedPoint.lat.toFixed(6)}</div>
                        <div><strong>Longitude:</strong> {selectedPoint.lng.toFixed(6)}</div>
                      </div>
                    ) : (
                      <div className="text-sm text-blue-700">
                        <div><strong>Location:</strong> {location}</div>
                      </div>
                    )}
                  </div>
                )}

                <div className={`bg-white p-4 rounded-2xl shadow-md transition-opacity ${!(selectedPoint || location) ? 'opacity-50 pointer-events-none' : ''}`}>
                  <h2 className="text-xl font-bold mb-2">Set Practice Variables</h2>
                  <Label className="block mb-2">Feedstock Type</Label>
                  <select
                    className="w-full border rounded-xl p-2 mb-4"
                    value={feedstock}
                    onChange={(e) => setFeedstock(e.target.value)}
                    disabled={!(selectedPoint || location)}
                  >
                    <option value="" disabled>Choose Feedstock</option>
                    <option value="Basalt">Basalt</option>
                    <option value="Olivine">Olivine</option>
                    <option value="Custom">Custom...</option>
                  </select>

                  <Label className="block mb-2">Particle Size</Label>
                  <select
                    className="w-full border rounded-xl p-2 mb-4"
                    value={particleSize}
                    onChange={(e) => setParticleSize(e.target.value)}
                    disabled={!(selectedPoint || location)}
                  >
                    <option value="" disabled>Select Particle Size</option>
                    <option value="psdrain_100um.in">100um</option>
                    <option value="psdrain_320um.in">320um</option>
                    <option value="psdrain_1220um.in">1220um</option>
                    <option value="psdrain_3000um.in">3000um</option>
                  </select>

                  <Label className="block mb-2">Application Rate (t/ha/year)</Label>
                  <Input
                    type="number"
                    className="w-full border rounded-xl p-2 mb-4"
                    placeholder="Enter rate"
                    value={applicationRate}
                    onChange={(e) => setApplicationRate(e.target.value)}
                    disabled={!(selectedPoint || location)}
                  />

                  <Label className="block mb-2">Target Soil pH (optional)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    className="w-full border rounded-xl p-2"
                    placeholder="Enter target pH"
                    value={targetPH}
                    onChange={(e) => setTargetPH(e.target.value)}
                    disabled={!(selectedPoint || location)}
                  />
                </div>

                <div className="mt-4 space-y-2">
                    <Button
                      type="button"
                      onClick={handleSaveModel}
                      disabled={isSaving || (!location && !selectedPoint)}
                      className="w-full bg-green-500 hover:bg-green-600 text-white py-2 rounded-md font-semibold"
                    >
                      {isSaving ? 'Saving...' : savedData ? 'Update Model Configuration' : 'Save Model Configuration'}
                    </Button>
                    
                    <Button
                      type="submit"
                      className="w-full bg-blue-500 text-white hover:bg-blue-600 rounded-md p-2"
                    >
                      Run SCEPTER Model
                    </Button>
                  
                  {saveMessage && (
                    <div className={`text-center p-3 rounded-lg text-sm ${
                      saveMessageIsError ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                    }`}>
                      {saveMessage}
                    </div>
                  )}
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}