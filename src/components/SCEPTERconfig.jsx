import React, { useState, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, useMap } from 'react-leaflet';
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

// Create custom markers for different alkalinity data recency
const createCustomIcon = (color) => {
  return new L.Icon({
    iconUrl: `data:image/svg+xml;base64,${btoa(`
      <svg width="12" height="12" viewBox="0 0 12 12" xmlns="http://www.w3.org/2000/svg">
        <circle fill="${color}" stroke="#000" stroke-width="1" cx="6" cy="6" r="5"/>
      </svg>
    `)}`,
    iconSize: [12, 12],
    iconAnchor: [6, 6],
    popupAnchor: [0, -6],
  });
};
// Time series plots are in TimeSeriesPlot.jsx
// Alkalinity scatter plot is in AlkalinityScatterPlot.jsx

const USGSSiteSelector = ({ handleSiteSelect, handlePickPointClick, isPickingPoint, location, onSitesLoaded, onStateSelect }) => {
  const [usgsSites, setUsgsSites] = useState([]);
  const [stateCd, setStateCd] = useState('');
  const [isLoadingSites, setIsLoadingSites] = useState(false);
  const [allSitesWithAlkalinity, setAllSitesWithAlkalinity] = useState([]);

  // Function to determine marker color based on alkalinity data recency
  const getMarkerColor = (mostRecentAlkalinityDate) => {
    if (!mostRecentAlkalinityDate) return 'red'; // No alkalinity data
    
    const now = new Date();
    const sampleDate = new Date(mostRecentAlkalinityDate);
    const yearsDiff = (now - sampleDate) / (1000 * 60 * 60 * 24 * 365.25);
    
    if (yearsDiff <= 2) return 'green';   // Within last 1-2 years
    if (yearsDiff <= 5) return 'orange';  // Within last 5 years
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
            `/api/wqp/data/Result/search?siteid=USGS-${site.id}&characteristicName=Alkalinity&mimeType=csv`
          );
          
          console.log(`Response status for site ${site.id}: ${response.status}`);
          
          if (!response.ok) {
            console.log(`Failed to fetch data for site ${site.id}: ${response.status}`);
            return { ...site, markerColor: 'red', alkalinityInfo: `No data available (HTTP ${response.status})` };
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
          return { ...site, markerColor: 'red', alkalinityInfo: 'No alkalinity data available' };
        } catch (error) {
          console.error(`Error fetching alkalinity data for site ${site.id}:`, error);
          return { ...site, markerColor: 'red', alkalinityInfo: 'Error loading data' };
        }
      })
    );
    
    console.log('Finished fetching alkalinity data for all sites');
    return sitesWithAlkalinity;
  };

  // Load sites from JSON file on component mount
  useEffect(() => {
    const loadSitesFromJSON = async () => {
      try {
        const response = await fetch('/site_list.json');
        const sitesData = await response.json();
        setAllSitesWithAlkalinity(sitesData);
        console.log(`Loaded ${sitesData.length} sites with alkalinity data from JSON`);
      } catch (error) {
        console.error('Error loading sites from JSON:', error);
        setAllSitesWithAlkalinity([]);
      }
    };

    loadSitesFromJSON();
  }, []);

  useEffect(() => {
    const fetchSitesForState = async () => {
      if (!stateCd) {
        setUsgsSites([]);
        return;
      }

      setIsLoadingSites(true);
      try {
        console.log(`Fetching sites for state ${stateCd} using a more efficient approach...`);
        
        // Use the simpler approach: fetch all sites for the state and then filter for alkalinity
        const response = await fetch(`/api/usgs/nwis/iv/?format=json&stateCd=${stateCd}&siteStatus=all`);
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

        // Filter to only sites that are in our alkalinity list
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

        console.log(`Found ${sitesInState.length} sites with alkalinity data in ${stateCd} (filtered from ${Object.keys(siteGroups).length} total sites)`);
        
        // For now, assign test colors to make it load quickly, then fetch real alkalinity data in background
        const sitesWithTestColors = sitesInState.map((site, index) => ({
          ...site,
          markerColor: index % 3 === 0 ? 'green' : index % 3 === 1 ? 'orange' : 'red',
          alkalinityInfo: 'Loading alkalinity data...',
          totalAlkalinitySamples: 0
        }));
        
        // Show sites immediately with test colors
        setUsgsSites(sitesWithTestColors);
        
        // Fetch real alkalinity data in the background (limit to first 20 sites for testing)
        console.log('Starting background alkalinity data fetch for first 20 sites...');
        const sitesToFetch = sitesInState.slice(0, 20);
        const sitesWithRealData = await fetchAlkalinityDataForSites(sitesToFetch);
        
        // Update the first 20 sites with real data
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
        
        console.log('Updated first 20 sites with real alkalinity data');
        
      } catch (error) {
        console.error('Error fetching sites for state:', error);
        setUsgsSites([]);
      } finally {
        setIsLoadingSites(false);
      }
    };

    fetchSitesForState();
  }, [stateCd, allSitesWithAlkalinity]);

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

  return (
    <div className="bg-white p-4 rounded-2xl shadow-md">
      <h2 className="text-xl font-bold mb-2">1. Select Location</h2>
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
     
      <select
        className="w-full border rounded-xl p-2"
        value={location}
        onChange={(e) => handleSiteSelect(e.target.value)}
        disabled={!stateCd || isLoadingSites}
      >
        <option value="" disabled>
          {stateCd ? (isLoadingSites ? 'Loading water quality sites...' : 'Choose USGS Water Quality Site') : 'Select a state first'}
        </option>
        {stateCd && !isLoadingSites && usgsSites.map(site => (
          <option key={site.id} value={site.id}>
            {site.name}
          </option>
        ))}
      </select>
      <p className="text-center my-2">or</p>

      <Button 
        type="button"
        className={`w-full ${isPickingPoint ? 'bg-gray-400 hover:bg-gray-500' : 'bg-blue-500 hover:bg-blue-600'} text-white py-2 rounded-xl`}
        onClick={handlePickPointClick}
      >
        {isPickingPoint ? 'Click on Map to Select Point' : 'Pick a Point on Map'}
      </Button>
      
      {/* Alkalinity Data Legend */}
      <div className="mt-4 p-3 bg-gray-50 rounded-xl">
        <h3 className="text-sm font-semibold mb-2">Alkalinity Data Recency</h3>
        <div className="space-y-1 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-green-500 rounded-full"></div>
            <span>Recent (≤2 years)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-orange-500 rounded-full"></div>
            <span>Moderate (2-5 years)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-red-500 rounded-full"></div>
            <span>Old (&gt;5 years or no data)</span>
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
  const [isPickingPoint, setIsPickingPoint] = useState(false);
  const [selectedPoint, setSelectedPoint] = useState(null);
  const [editedAlkalinity, setEditedAlkalinity] = useState(0);
  const [usgsSites, setUsgsSites] = useState([]);
  const [isLoadingSiteData, setIsLoadingSiteData] = useState(false);
  const [mapCenter, setMapCenter] = useState([39.8283, -98.5795]); // Default US center
  const [mapZoom, setMapZoom] = useState(4); // Default zoom level
  const [selectedStatistic, setSelectedStatistic] = useState('most_recent');
  const [statisticPeriod, setStatisticPeriod] = useState('7d'); // Default to 7 days
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

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
      
      // Load saved measurements
      setEditedAlkalinity(params.alkalinity || 0);
      
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
    const data = new FormData();
    data.append('location', location);
    data.append('feedstock', feedstock);
    data.append('particleSize', particleSize);
    data.append('applicationRate', applicationRate);
    data.append('targetPH', targetPH);
    await fetch('/api/run-scepter', {
      method: 'POST',
      body: data,
    });
  };

  const handleSaveModel = async () => {
    if (!user) {
      setSaveMessage('Please log in to save models');
      return;
    }

    if (!location && !selectedPoint) {
      setSaveMessage('Please select a location first');
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
          selectedStatistic,
          statisticPeriod,
          discharge: editedDischarge,
          alkalinity: editedAlkalinity,
          temperature: editedTemperature,
          ph: editedPH,
          bicarbonate: editedBicarbonate
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

  const calculateStatistic = (values, statistic) => {
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
  };

  const fetchAlkalinityData = async (siteId) => {
    if (!siteId) return;
    
    setIsLoadingSiteData(true);
    try {
      // Fetch alkalinity data from WQP API
      const response = await fetch(
        `/api/wqp/data/Result/search?siteid=USGS-${siteId}&characteristicName=Alkalinity&mimeType=csv`
      );
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const csvText = await response.text();
      
      // Parse CSV data
      const lines = csvText.trim().split('\n');
      if (lines.length > 1) { // Check if we have data beyond the header
        const headers = lines[0].split(',').map(h => h.replace(/"/g, ''));
        const resultMeasureIndex = headers.indexOf('ResultMeasureValue');
        const activityStartDateIndex = headers.indexOf('ActivityStartDate');
        const measureUnitIndex = headers.indexOf('ResultMeasure/MeasureUnitCode');
        
        if (resultMeasureIndex >= 0 && activityStartDateIndex >= 0) {
          const validSamples = [];
          for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',').map(v => v.replace(/"/g, ''));
            const measureValue = values[resultMeasureIndex];
            const dateValue = values[activityStartDateIndex];
            const unitValue = measureUnitIndex >= 0 ? values[measureUnitIndex] : 'mg/L';
            
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
          
          if (validSamples.length > 0) {
            const mostRecent = validSamples[0];
            
            setEditedAlkalinity(mostRecent.value);
            setSelectedSite(prev => ({
              ...prev,
              alkalinity: mostRecent.value,
              alkalinityDateTime: mostRecent.date.toISOString(),
              hasAlkalinity: true,
              alkalinityUnit: mostRecent.unit,
              totalAlkalinitySamples: validSamples.length
            }));
          } else {
            setSelectedSite(prev => ({
              ...prev,
              hasAlkalinity: false
            }));
          }
        } else {
          setSelectedSite(prev => ({
            ...prev,
            hasAlkalinity: false
          }));
        }
      } else {
        setSelectedSite(prev => ({
          ...prev,
          hasAlkalinity: false
        }));
      }
    } catch (error) {
      console.error('Error fetching alkalinity data:', error);
      setSelectedSite(prev => ({
        ...prev,
        hasAlkalinity: false
      }));
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

  const handlePickPointClick = () => {
    setIsPickingPoint(true);
    setSelectedSite(null);
    setLocation(''); // Reset site selection to default
  };

  function MapClickHandler() {
    useMapEvents({
      click: (e) => {
        if (isPickingPoint) {
          setSelectedPoint(e.latlng);
          setLocation(''); // Reset site selection to default
          setIsPickingPoint(false);
        }
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

  useEffect(() => {
    if (location) {
      fetchAlkalinityData(location);
    }
  }, [selectedStatistic, statisticPeriod]);

  return (
    <div>
      <div className="flex gap-6">
        <div className="w-3/5">
          <h2 className="text-xl font-bold text-center mb-6 text-gray-800">Area of Interest</h2>
          <div className="mt-6">
            <MapContainer center={mapCenter} zoom={mapZoom} style={{ height: '500px', width: '100%' }}>
              <TileLayer
                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}"
                attribution='© Esri, DeLorme, NAVTEQ, TomTom, Intermap, iPC, USGS, FAO, NPS, NRCAN, GeoBase, Kadaster NL, Ordnance Survey, Esri Japan, METI, Esri China (Hong Kong), and the GIS User Community'
              />
              <MapClickHandler />
              <MapZoomHandler center={mapCenter} zoom={mapZoom} />
              
              {/* Render all USGS sites with color-coded markers */}
              {usgsSites.map(site => (
                <Marker 
                  key={site.id}
                  position={[site.latitude, site.longitude]}
                  icon={createCustomIcon(site.markerColor)}
                  eventHandlers={{
                    click: () => handleSiteSelect(site.id)
                  }}
                >
                  <Popup>
                    <div>
                      <strong>{site.name}</strong><br />
                      Lat: {site.latitude.toFixed(4)}<br />
                      Lng: {site.longitude.toFixed(4)}
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
          
          {/* Add the alkalinity plot below the map */}
          {location && (
            <div className="mt-6">
              <AlkalinityScatterPlot siteId={location} />
            </div>
          )}
        </div>

        <div className="w-2/5">
          <h2 className="text-xl font-bold text-center mb-6 text-gray-800">Simulation Settings</h2>
          <Card className="mt-5 rounded-2xl shadow-lg p-6">
            <CardContent className="space-y-6">
              <form onSubmit={handleRunModel} className="space-y-6">
                <USGSSiteSelector
                  handleSiteSelect={handleSiteSelect}
                  handlePickPointClick={handlePickPointClick}
                  isPickingPoint={isPickingPoint}
                  location={location}
                  onSitesLoaded={handleSitesLoaded}
                  onStateSelect={handleStateSelect}
                />

                <div className="bg-white p-4 rounded-2xl shadow-md">
                  <h2 className="text-xl font-bold mb-2">2. Alkalinity Data</h2>
                  
                  {isLoadingSiteData ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
                      <span className="ml-2">Loading alkalinity data...</span>
                    </div>
                  ) : selectedSite?.hasAlkalinity ? (
                    <div className="space-y-4">
                      <div className="bg-gray-50 p-4 rounded-xl">
                        <h3 className="font-semibold text-lg mb-2">Alkalinity Information</h3>
                        <div className="grid grid-cols-1 gap-2 text-sm">
                          <div><strong>Most Recent Value:</strong> {selectedSite.alkalinity?.toFixed(2)} mg/L</div>
                          <div><strong>Last Measured:</strong> {selectedSite.alkalinityDateTime ? new Date(selectedSite.alkalinityDateTime).toLocaleDateString() : 'Unknown'}</div>
                          <div><strong>Total Samples:</strong> {selectedSite.totalAlkalinitySamples || 'Loading...'}</div>
                          <div><strong>Data Recency:</strong> 
                            <span className={`ml-2 px-2 py-1 rounded text-xs font-medium ${
                              selectedSite.markerColor === 'green' ? 'bg-green-100 text-green-800' :
                              selectedSite.markerColor === 'orange' ? 'bg-orange-100 text-orange-800' :
                              'bg-red-100 text-red-800'
                            }`}>
                              {selectedSite.markerColor === 'green' ? 'Recent (≤2 years)' :
                               selectedSite.markerColor === 'orange' ? 'Moderate (2-5 years)' :
                               'Old (>5 years)'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      {selectedSite ? 'No alkalinity data available for this site' : 'Select a site to view alkalinity data'}
                    </div>
                  )}
                </div>

                <div className="bg-white p-4 rounded-2xl shadow-md">
                  <h2 className="text-xl font-bold mb-2">3. Set Practice Variables</h2>
                  <Label className="block mb-2">Feedstock Type</Label>
                  <select
                    className="w-full border rounded-xl p-2 mb-4"
                    value={feedstock}
                    onChange={(e) => setFeedstock(e.target.value)}
                  >
                    <option value="" disabled>Choose Feedstock</option>
                    <option value="Basalt">Basalt</option>
                    <option value="Olivine">Olivine</option>
                    <option value="Custom">Custom...</option>
                  </select>

                  <Label className="block mb-2">Particle Size (microns)</Label>
                  <Input
                    type="number"
                    className="w-full border rounded-xl p-2 mb-4"
                    placeholder="Enter mean radius"
                    value={particleSize}
                    onChange={(e) => setParticleSize(e.target.value)}
                  />

                  <Label className="block mb-2">Application Rate (kg/m²/year)</Label>
                  <Input
                    type="number"
                    className="w-full border rounded-xl p-2 mb-4"
                    placeholder="Enter rate"
                    value={applicationRate}
                    onChange={(e) => setApplicationRate(e.target.value)}
                  />

                  <Label className="block mb-2">Target Soil pH (optional)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    className="w-full border rounded-xl p-2"
                    placeholder="Enter target pH"
                    value={targetPH}
                    onChange={(e) => setTargetPH(e.target.value)}
                  />
                </div>

                <div className="mt-4 space-y-2">
                  <div className="flex gap-4">
                    <Button
                      type="button"
                      onClick={handleSaveModel}
                      disabled={isSaving || (!location && !selectedPoint)}
                      className="flex-1 bg-green-500 hover:bg-green-600 text-white py-2 rounded-md font-semibold"
                    >
                      {isSaving ? 'Saving...' : savedData ? 'Update Model Configuration' : 'Save Model Configuration'}
                    </Button>
                    
                    <Button
                      type="submit"
                      className="flex-1 bg-blue-500 text-white hover:bg-blue-600 rounded-md p-2"
                    >
                      Run SCEPTER Model
                    </Button>
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
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}