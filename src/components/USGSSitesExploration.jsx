import React, { useState, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import AlkalinityScatterPlot from './AlkalinityScatterPlot';
import 'leaflet/dist/leaflet.css';
import { usStates } from "@/data/usStates";

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

const USGSSiteSelector = ({ handleSiteSelect, location, onSitesLoaded, onStateSelect, onSiteTypeChange }) => {
  const [usgsSites, setUsgsSites] = useState([]);
  const [stateCd, setStateCd] = useState('');
  const [siteType, setSiteType] = useState('stream');
  const [isLoadingSites, setIsLoadingSites] = useState(false);
  const [allSitesWithAlkalinity, setAllSitesWithAlkalinity] = useState([]);

  // Function to determine marker color based on alkalinity data recency
  const getMarkerColor = (mostRecentAlkalinityDate) => {
    if (!mostRecentAlkalinityDate) return 'gray';
    
    const now = new Date();
    const sampleDate = new Date(mostRecentAlkalinityDate);
    const yearsDiff = (now - sampleDate) / (1000 * 60 * 60 * 24 * 365.25);
    
    if (yearsDiff <= 2) return 'green';
    if (yearsDiff <= 5) return 'yellow';
    return 'red';
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
          if (lines.length > 1) {
            const headers = lines[0].split(',').map(h => h.replace(/"/g, ''));
            const resultMeasureIndex = headers.indexOf('ResultMeasureValue');
            const activityStartDateIndex = headers.indexOf('ActivityStartDate');
            
            if (resultMeasureIndex >= 0 && activityStartDateIndex >= 0) {
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
        
        const normalizedSites = sitesData.map(site => {
          if (siteType === 'stream') {
            const siteId = site.site_no.replace('USGS-', '');
            return {
              id: siteId,
              name: `${siteId} - USGS Site`,
              hasAlkalinityData: true
            };
          } else {
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
  }, [siteType]);

  useEffect(() => {
    const fetchSitesForState = async () => {
      if (!stateCd) {
        setUsgsSites([]);
        return;
      }

      setIsLoadingSites(true);
      try {
        console.log(`Fetching ${siteType} sites for state ${stateCd} using a more efficient approach...`);
        
        const response = await fetch(`https://waterservices.usgs.gov/nwis/iv/?format=json&stateCd=${stateCd}&siteStatus=all`);
        const data = await response.json();

        if (!data.value || !data.value.timeSeries) {
          setUsgsSites([]);
          return;
        }

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
        
        const sitesWithDefaultColors = sitesInState.map((site) => ({
          ...site,
          markerColor: 'gray',
          alkalinityInfo: 'Loading alkalinity data...',
          totalAlkalinitySamples: 0
        }));
        
        setUsgsSites(sitesWithDefaultColors);
        
        console.log(`Starting background alkalinity data fetch for all ${sitesInState.length} ${siteType} sites...`);
        const sitesToFetch = sitesInState;
        const sitesWithRealData = await fetchAlkalinityDataForSites(sitesToFetch);
        
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
    handleSiteSelect('');
    
    const selectedState = usStates.find(state => state.code === newStateCd);
    if (selectedState) {
      onStateSelect(selectedState);
    }
  };

  const handleSiteTypeChange = (newSiteType) => {
    setSiteType(newSiteType);
    handleSiteSelect('');
    setUsgsSites([]);
    
    if (onSiteTypeChange) {
      onSiteTypeChange();
    }
    
    if (stateCd) {
      const selectedState = usStates.find(state => state.code === stateCd);
      if (selectedState) {
        onStateSelect(selectedState);
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

export default function USGSSitesExploration() {
  const [location, setLocation] = useState('');
  const [selectedSite, setSelectedSite] = useState(null);
  const [selectedPoint, setSelectedPoint] = useState(null);
  const [usgsSites, setUsgsSites] = useState([]);
  const [isLoadingSiteData, setIsLoadingSiteData] = useState(false);
  const [mapCenter, setMapCenter] = useState([39.8283, -98.5795]);
  const [mapZoom, setMapZoom] = useState(4);

  const fetchAlkalinityData = async (siteId) => {
    if (!siteId) return;
    
    setIsLoadingSiteData(true);
    try {
      console.log(`Fetching alkalinity data for selected site: ${siteId}`);
      
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
      
      const lines = csvText.trim().split('\n');
      console.log(`CSV has ${lines.length} lines (including header)`);
      
      if (lines.length > 1) {
        const headers = lines[0].split(',').map(h => h.replace(/"/g, ''));
        console.log(`CSV headers:`, headers.slice(0, 10));
        
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
            
            if (i <= 3) {
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
          
          validSamples.sort((a, b) => b.date - a.date);
          
          console.log(`Found ${validSamples.length} valid alkalinity samples for site ${siteId}`);
          
          if (validSamples.length > 0) {
            const mostRecent = validSamples[0];
            console.log(`Most recent sample: ${mostRecent.value} ${mostRecent.unit} on ${mostRecent.date.toLocaleDateString()}`);
            
            const averageAlkalinity = validSamples.reduce((sum, sample) => sum + sample.value, 0) / validSamples.length;
            
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
    
    if (site) {
      setMapCenter([site.latitude, site.longitude]);
      setMapZoom(10);
      await fetchAlkalinityData(siteId);
    }
  };

  function MapClickHandler() {
    return null;
  }

  const handleSitesLoaded = useCallback((sites) => {
    setUsgsSites(sites);
  }, []);

  const handleStateSelect = useCallback((state) => {
    setMapCenter(state.center);
    setMapZoom(state.zoom);
  }, []);

  const handleSiteTypeChange = useCallback(() => {
    setSelectedSite(null);
    setSelectedPoint(null);
    setLocation('');
  }, []);

  return (
    <div className="container mx-auto p-4 space-y-6">
      {/* Map and Selection Section - Side by Side */}
      <div className="grid grid-cols-1 xl:grid-cols-[2fr_1fr] gap-6 items-start">
        <div>
          <h2 className="text-xl font-bold text-center mb-4 text-gray-800">USGS Sites Map</h2>
          <div className="rounded-2xl overflow-hidden shadow-lg border border-gray-200">
            <MapContainer center={mapCenter} zoom={mapZoom} style={{ height: '500px', width: '100%' }}>
            <TileLayer
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}"
              attribution='© Esri, DeLorme, NAVTEQ, TomTom, Intermap, iPC, USGS, FAO, NPS, NRCAN, GeoBase, Kadaster NL, Ordnance Survey, Esri Japan, METI, Esri China (Hong Kong), and the GIS User Community'
            />
            <MapClickHandler />
            <MapZoomHandler center={mapCenter} zoom={mapZoom} />
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
        <div className="space-y-6">
          {/* USGS Site Selection */}
          <h2 className="text-xl font-bold text-center mb-4 text-gray-800">USGS Site Selection</h2>
          <Card className="rounded-2xl shadow-lg">
            <CardContent className="p-6">
              <USGSSiteSelector
                handleSiteSelect={handleSiteSelect}
                location={location}
                onSitesLoaded={handleSitesLoaded}
                onStateSelect={handleStateSelect}
                onSiteTypeChange={handleSiteTypeChange}
              />
            </CardContent>
          </Card>
        </div>

    
          {/* Alkalinity Chart */}
          <Card className="rounded-2xl shadow-lg">
            <CardContent className="p-6">
              <h2 className="text-xl font-bold text-center mb-4 text-gray-800">Alkalinity Data Chart</h2>
              {location ? (
                <AlkalinityScatterPlot siteId={location} />
              ) : (
                <div className="text-center py-8 text-gray-500">
                  Select a site to view alkalinity chart
                </div>
              )}
            </CardContent>
          </Card>

          {/* Data Summary */}
          <Card className="rounded-2xl shadow-lg">
            <CardContent className="p-6">
              <h2 className="text-xl font-bold text-center mb-4 text-gray-800">Data Summary</h2>
              {isLoadingSiteData ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
                  <span className="ml-2">Loading alkalinity data...</span>
                </div>
              ) : selectedSite?.hasAlkalinity ? (
                <div className="space-y-4">
                  <div className="bg-gray-50 p-4 rounded-xl">
                    <div className="grid grid-cols-1 gap-2 text-sm">
                      <div><strong>Most Recent Value:</strong> {selectedSite.alkalinity?.toFixed(2)} {selectedSite.alkalinityUnit || 'mg/L'}</div>
                      <div><strong>Average Value:</strong> {selectedSite.averageAlkalinity?.toFixed(2) || 'Calculating...'} {selectedSite.alkalinityUnit || 'mg/L'}</div>
                      <div><strong>Last Measured:</strong> {selectedSite.alkalinityDateTime ? new Date(selectedSite.alkalinityDateTime).toLocaleDateString() : 'Unknown'}</div>
                      <div><strong>Total Samples:</strong> {selectedSite.totalAlkalinitySamples || 'Loading...'}</div>
                      <div><strong>Data Recency:</strong>
                        <span
                          className={`ml-2 px-2 py-1 rounded text-xs font-medium ${
                            selectedSite.markerColor === 'green'
                              ? 'bg-green-100 text-green-800'
                              : selectedSite.markerColor === 'yellow'
                              ? 'bg-yellow-100 text-yellow-800'
                              : selectedSite.markerColor === 'red'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {selectedSite.markerColor === 'green'
                            ? 'Recent (≤2 years)'
                            : selectedSite.markerColor === 'yellow'
                            ? 'Moderate (2-5 years)'
                            : selectedSite.markerColor === 'red'
                            ? 'Old (>5 years)'
                            : 'No data available'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  {selectedSite ? (
                    <div>
                      <p>No alkalinity data available for this site</p>
                      {selectedSite.errorMessage && (
                        <p className="text-red-500 text-xs mt-2">Error: {selectedSite.errorMessage}</p>
                      )}
                    </div>
                  ) : (
                    'Select a site to view alkalinity data'
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
    </div>
  );
}

