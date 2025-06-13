import React, { useState, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
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

// discharge time series plot
function DischargeTimeSeriesPlot({ siteId, selectedStatistic, statisticPeriod }) {
  const [timeSeriesData, setTimeSeriesData] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [dischargeUnit, setDischargeUnit] = useState('');
  const [temperatureUnit, setTemperatureUnit] = useState('');
  const [phUnit, setPhUnit] = useState('');
  const [dissolvedOxygenUnit, setDissolvedOxygenUnit] = useState('');
  const [bicarbonateUnit, setBicarbonateUnit] = useState('');

  useEffect(() => {
    const fetchTimeSeriesData = async () => {
      if (!siteId) return;
      
      setIsLoading(true);
      try {
        const endDate = new Date();
        const startDate = new Date();
        
        if (selectedStatistic === 'most_recent') {
          startDate.setDate(endDate.getDate() - 1);
        } else {
          switch (statisticPeriod) {
            case '1d':
              startDate.setDate(endDate.getDate() - 1);
              break;
            case '7d':
              startDate.setDate(endDate.getDate() - 7);
              break;
            case '30d':
              startDate.setDate(endDate.getDate() - 30);
              break;
            case '90d':
              startDate.setDate(endDate.getDate() - 90);
              break;
            case '1y':
              startDate.setFullYear(endDate.getFullYear() - 1);
              break;
            case '2y':
              startDate.setFullYear(endDate.getFullYear() - 2);
              break;
            case '3y':
              startDate.setFullYear(endDate.getFullYear() - 3);
              break;
            default:
              startDate.setDate(endDate.getDate() - 7);
          }
        }

        const startDateStr = startDate.toISOString().split('T')[0];
        const endDateStr = endDate.toISOString().split('T')[0];

        // Fetch discharge, temperature, pH, dissolved oxygen, and bicarbonate data
        const response = await fetch(
          `/api/usgs/nwis/iv/?format=json&sites=${siteId}&parameterCd=00060,00010,00400,00300,00440&siteStatus=all&startDT=${startDateStr}&endDT=${endDateStr}`
        );
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        
        if (data.value?.timeSeries) {
          // Group data by time to combine all parameters
          const timeDataMap = new Map();
          
          data.value.timeSeries.forEach(series => {
            const paramCode = series.variable.variableCode[0].value;
            const values = series.values?.[0]?.value || [];
            
            // Set units
            if (paramCode === '00060') setDischargeUnit(series.variable.unit.unitCode);
            if (paramCode === '00010') setTemperatureUnit(series.variable.unit.unitCode);
            if (paramCode === '00400') setPhUnit(series.variable.unit.unitCode);
            if (paramCode === '00300') setDissolvedOxygenUnit(series.variable.unit.unitCode);
            if (paramCode === '00440') setBicarbonateUnit(series.variable.unit.unitCode);
            
            values.forEach(v => {
              const timeKey = v.dateTime;
              if (!timeDataMap.has(timeKey)) {
                timeDataMap.set(timeKey, {
                  time: new Date(v.dateTime).toLocaleString(),
                  discharge: null,
                  temperature: null,
                  ph: null,
                  dissolvedOxygen: null,
                  bicarbonate: null
                });
              }
              
              const value = parseFloat(v.value);
              if (!isNaN(value) && value >= 0) {
                if (paramCode === '00060') {
                  timeDataMap.get(timeKey).discharge = value;
                } else if (paramCode === '00010') {
                  timeDataMap.get(timeKey).temperature = value;
                } else if (paramCode === '00400') {
                  timeDataMap.get(timeKey).ph = value;
                } else if (paramCode === '00300') {
                  timeDataMap.get(timeKey).dissolvedOxygen = value;
                } else if (paramCode === '00440') {
                  timeDataMap.get(timeKey).bicarbonate = value;
                }
              }
            });
          });
          
          const chartData = Array.from(timeDataMap.values())
            .filter(point => point.discharge !== null || point.temperature !== null || point.ph !== null || point.dissolvedOxygen !== null || point.bicarbonate !== null)
            .sort((a, b) => new Date(a.time) - new Date(b.time));
          
          setTimeSeriesData(chartData);
        } else {
          setTimeSeriesData([]);
        }
      } catch (error) {
        console.error('Error fetching time series data:', error);
        setTimeSeriesData([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchTimeSeriesData();
  }, [siteId, selectedStatistic, statisticPeriod]);

  if (isLoading) {
    return (
      <div className="bg-white p-4 rounded-2xl shadow-md">
        <h3 className="text-lg font-bold mb-4">Time Series Data</h3>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
          <span className="ml-2">Loading time series data...</span>
        </div>
      </div>
    );
  }

  if (timeSeriesData.length === 0) {
    return (
      <div className="bg-white p-4 rounded-2xl shadow-md">
        <h3 className="text-lg font-bold mb-4">Time Series Data</h3>
        <div className="flex items-center justify-center h-64 text-gray-500">
          No time series data available for the selected time period
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white p-4 rounded-2xl shadow-md">
      <h3 className="text-lg font-bold mb-4">Time Series Data</h3>
      
      {/* Discharge and Temperature Chart */}
      {(timeSeriesData.some(point => point.discharge !== null) || timeSeriesData.some(point => point.temperature !== null)) && (
        <div className="mb-8">
          <h4 className="text-md font-semibold mb-2">Discharge and Temperature</h4>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart 
              data={timeSeriesData}
              margin={{ top: 20, right: 80, left: 20, bottom: 60 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="time" 
                angle={-45}
                textAnchor="end"
                height={80}
                interval="preserveStartEnd"
                tick={{ fontSize: 10 }}
                tickMargin={10}
              />
              
              {/* Primary Y-axis for Discharge */}
              <YAxis 
                yAxisId="discharge"
                orientation="left"
                domain={[0, 'dataMax + 10%']} // Auto-scale with 10% padding
                label={{ 
                  value: `Discharge ${dischargeUnit ? `(${dischargeUnit})` : ''}`, 
                  angle: -90, 
                  position: 'insideLeft',
                  style: { textAnchor: 'middle', fill: '#8884d8' }
                }}
                tick={{ fill: '#8884d8' }}
              />
              
              {/* Secondary Y-axis for Temperature */}
              <YAxis 
                yAxisId="temperature"
                orientation="right"
                domain={[0, 35]} // Temperature range from 0 to 35°C
                label={{ 
                  value: `Temperature ${temperatureUnit ? `(${temperatureUnit})` : ''}`, 
                  angle: 90, 
                  position: 'insideRight',
                  style: { textAnchor: 'middle', fill: '#ff7300' }
                }}
                tick={{ fill: '#ff7300' }}
              />
              
              <Tooltip 
                formatter={(value, name) => {
                  if (name === 'discharge') return [`${value} ${dischargeUnit}`, 'Discharge'];
                  if (name === 'temperature') return [`${value} ${temperatureUnit}`, 'Temperature'];
                  return [value, name];
                }}
                labelFormatter={(label) => `Time: ${label}`}
              />
              
              {/* Discharge Line */}
              {timeSeriesData.some(point => point.discharge !== null) && (
                <Line 
                  type="monotone" 
                  dataKey="discharge" 
                  name="discharge"
                  stroke="#8884d8" 
                  strokeWidth={3}
                  dot={false}
                  yAxisId="discharge"
                />
              )}
              
              {/* Temperature Line */}
              {timeSeriesData.some(point => point.temperature !== null) && (
                <Line 
                  type="monotone" 
                  dataKey="temperature" 
                  name="temperature"
                  stroke="#ff7300" 
                  strokeWidth={3}
                  dot={false}
                  yAxisId="temperature"
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* pH, Dissolved Oxygen, and Bicarbonate Chart */}
      {(timeSeriesData.some(point => point.ph !== null) || timeSeriesData.some(point => point.dissolvedOxygen !== null) || timeSeriesData.some(point => point.bicarbonate !== null)) && (
        <div className="mb-8">
          <h4 className="text-md font-semibold mb-2">pH, Dissolved Oxygen, and Bicarbonate</h4>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart 
              data={timeSeriesData}
              margin={{ top: 20, right: 80, left: 20, bottom: 60 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="time" 
                angle={-45}
                textAnchor="end"
                height={80}
                interval="preserveStartEnd"
                tick={{ fontSize: 10 }}
                tickMargin={10}
              />
              
              {/* Primary Y-axis for pH */}
              <YAxis 
                yAxisId="ph"
                orientation="left"
                domain={[6, 9]} // Zoom in to show pH range from 6 to 9
                label={{ 
                  value: `pH ${phUnit ? `(${phUnit})` : ''}`, 
                  angle: -90, 
                  position: 'insideLeft',
                  style: { textAnchor: 'middle', fill: '#82ca9d' }
                }}
                tick={{ fill: '#82ca9d' }}
              />
              
              {/* Secondary Y-axis for Dissolved Oxygen */}
              <YAxis 
                yAxisId="dissolvedOxygen"
                orientation="right"
                domain={[0, 15]} // Dissolved oxygen range from 0 to 15 mg/L
                label={{ 
                  value: `Dissolved Oxygen ${dissolvedOxygenUnit ? `(${dissolvedOxygenUnit})` : ''}`, 
                  angle: 90, 
                  position: 'insideRight',
                  style: { textAnchor: 'middle', fill: '#ffc658' }
                }}
                tick={{ fill: '#ffc658' }}
              />

              {/* Tertiary Y-axis for Bicarbonate */}
              <YAxis 
                yAxisId="bicarbonate"
                orientation="right"
                domain={[0, 'dataMax + 10%']} // Auto-scale bicarbonate with 10% padding
                label={{ 
                  value: `Bicarbonate ${bicarbonateUnit ? `(${bicarbonateUnit})` : ''}`, 
                  angle: 90, 
                  position: 'insideRight',
                  style: { textAnchor: 'middle', fill: '#ff6b6b' }
                }}
                tick={{ fill: '#ff6b6b' }}
              />
              
              <Tooltip 
                formatter={(value, name) => {
                  if (name === 'ph') return [`${value} ${phUnit}`, 'pH'];
                  if (name === 'dissolvedOxygen') return [`${value} ${dissolvedOxygenUnit}`, 'Dissolved Oxygen'];
                  if (name === 'bicarbonate') return [`${value} ${bicarbonateUnit}`, 'Bicarbonate'];
                  return [value, name];
                }}
                labelFormatter={(label) => `Time: ${label}`}
              />
              
              {/* pH Line */}
              {timeSeriesData.some(point => point.ph !== null) && (
                <Line 
                  type="monotone" 
                  dataKey="ph" 
                  name="ph"
                  stroke="#82ca9d" 
                  strokeWidth={3}
                  dot={false}
                  yAxisId="ph"
                />
              )}
              
              {/* Dissolved Oxygen Line */}
              {timeSeriesData.some(point => point.dissolvedOxygen !== null) && (
                <Line 
                  type="monotone" 
                  dataKey="dissolvedOxygen" 
                  name="dissolvedOxygen"
                  stroke="#ffc658" 
                  strokeWidth={3}
                  dot={false}
                  yAxisId="dissolvedOxygen"
                />
              )}

              {/* Bicarbonate Line */}
              {timeSeriesData.some(point => point.bicarbonate !== null) && (
                <Line 
                  type="monotone" 
                  dataKey="bicarbonate" 
                  name="bicarbonate"
                  stroke="#ff6b6b" 
                  strokeWidth={3}
                  dot={false}
                  yAxisId="bicarbonate"
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

const USGSSiteSelector = ({ handleSiteSelect, handlePickPointClick, isPickingPoint, location, onSitesLoaded, onStateSelect }) => {
  const [usgsSites, setUsgsSites] = useState([]);
  const [stateCd, setStateCd] = useState('');
  const [isLoadingSites, setIsLoadingSites] = useState(false);

  useEffect(() => {
    const fetchSites = async () => {
      if (!stateCd) {
        setUsgsSites([]);
        return;
      }

      setIsLoadingSites(true);
      try {
        // Fetch water quality sites for the selected state
        // Using the water quality parameter codes from the USGS current conditions
        const response = await fetch(`/api/usgs/nwis/iv/?format=json&stateCd=${stateCd}&parameterCd=00095,00010,00300,00400,00440&siteStatus=all`);
        const data = await response.json();

        if (!data.value || !data.value.timeSeries) {
          setUsgsSites([]);
          return;
        }

        // Group time series by site to check which sites have water quality data
        const siteGroups = {};
        data.value.timeSeries.forEach(series => {
          const siteId = series.sourceInfo.siteCode[0].value;
          const paramCode = series.variable.variableCode[0].value;
          
          if (!siteGroups[siteId]) {
            siteGroups[siteId] = {
              id: siteId,
              name: series.sourceInfo.siteName,
              latitude: series.sourceInfo.geoLocation.geogLocation.latitude,
              longitude: series.sourceInfo.geoLocation.geogLocation.longitude,
              parameters: {}
            };
          }
          
          // Check if parameter has valid data (not "--" or other status codes)
          const hasValidData = series.values?.[0]?.value?.length > 0 &&
                             series.values[0].value[0].value !== '--' &&
                             !isNaN(parseFloat(series.values[0].value[0].value));
          
          siteGroups[siteId].parameters[paramCode] = {
            value: parseFloat(series.values[0].value[0].value),
            unit: series.variable.unit.unitCode,
            dateTime: series.values[0].value[0].dateTime,
            hasValidData: hasValidData
          };
        });

        // Filter to sites that have at least some water quality data
        const sites = Object.values(siteGroups)
          .filter(site => {
            // Check if site has at least 2 water quality parameters with valid data
            const validParams = Object.values(site.parameters).filter(param => param.hasValidData);
            return validParams.length >= 2;
          })
          .map(site => ({
            id: site.id,
            name: `${site.id} - ${site.name}`,
            latitude: site.latitude,
            longitude: site.longitude,
            // Include available water quality data
            specificConductance: site.parameters['00095']?.hasValidData ? site.parameters['00095'].value : null,
            temperature: site.parameters['00010']?.hasValidData ? site.parameters['00010'].value : null,
            dissolvedOxygen: site.parameters['00300']?.hasValidData ? site.parameters['00300'].value : null,
            ph: site.parameters['00400']?.hasValidData ? site.parameters['00400'].value : null,
            bicarbonate: site.parameters['00440']?.hasValidData ? site.parameters['00440'].value : null,
            // Add flags for what data is available
            hasSpecificConductance: site.parameters['00095']?.hasValidData || false,
            hasTemperature: site.parameters['00010']?.hasValidData || false,
            hasDissolvedOxygen: site.parameters['00300']?.hasValidData || false,
            hasPH: site.parameters['00400']?.hasValidData || false,
            hasBicarbonate: site.parameters['00440']?.hasValidData || false
          }))
          .sort((a, b) => a.id.localeCompare(b.id));

        console.log(`Found ${sites.length} water quality monitoring sites in ${stateCd}`);
        setUsgsSites(sites);
      } catch (error) {
        console.error('Error fetching water quality sites:', error);
        setUsgsSites([]);
      } finally {
        setIsLoadingSites(false);
      }
    };

    fetchSites();
  }, [stateCd]);

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
            {site.hasTemperature && site.hasPH && site.hasBicarbonate ? ' (Temp, pH, Bicarb)' :
             site.hasTemperature && site.hasPH ? ' (Temp, pH)' :
             site.hasTemperature && site.hasBicarbonate ? ' (Temp, Bicarb)' :
             site.hasPH && site.hasBicarbonate ? ' (pH, Bicarb)' :
             site.hasTemperature ? ' (Temp)' :
             site.hasPH ? ' (pH)' :
             site.hasBicarbonate ? ' (Bicarb)' : ' (WQ)'}
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
  const [isEditing, setIsEditing] = useState(false);
  const [editedDischarge, setEditedDischarge] = useState(0);
  const [editedAlkalinity, setEditedAlkalinity] = useState(0);
  const [editedTemperature, setEditedTemperature] = useState(0);
  const [editedPH, setEditedPH] = useState(0);
  const [editedBicarbonate, setEditedBicarbonate] = useState(0);
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
      setEditedDischarge(params.discharge || 0);
      setEditedAlkalinity(params.alkalinity || 0);
      setEditedTemperature(params.temperature || 0);
      setEditedPH(params.ph || 0);
      setEditedBicarbonate(params.bicarbonate || 0);
      
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
      const endDate = new Date();
      const startDate = new Date();
      
      // For most recent, we only need a small window to ensure we get the latest value
      if (selectedStatistic === 'most_recent') {
        startDate.setDate(endDate.getDate() - 1); // Just get last 24 hours for most recent
      } else {
        switch (statisticPeriod) {
          case '1d':
            startDate.setDate(endDate.getDate() - 1);
            break;
          case '7d':
            startDate.setDate(endDate.getDate() - 7);
            break;
          case '30d':
            startDate.setDate(endDate.getDate() - 30);
            break;
          case '90d':
            startDate.setDate(endDate.getDate() - 90);
            break;
          case '1y':
            startDate.setFullYear(endDate.getFullYear() - 1);
            break;
          case '2y':
            startDate.setFullYear(endDate.getFullYear() - 2);
            break;
          case '3y':
            startDate.setFullYear(endDate.getFullYear() - 3);
            break;
          default:
            startDate.setDate(endDate.getDate() - 7);
        }
      }

      const startDateStr = startDate.toISOString().split('T')[0];
      const endDateStr = endDate.toISOString().split('T')[0];

      const response = await fetch(
        `/api/usgs/nwis/iv/?format=json&sites=${siteId}&parameterCd=00410,00060,00010,00400,00440&siteStatus=all&startDT=${startDateStr}&endDT=${endDateStr}`
      );
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.value?.timeSeries) {
        // Initialize with no data
        setSelectedSite(prev => ({
          ...prev,
          hasValidDischarge: false,
          hasAlkalinity: false,
          hasTemperature: false,
          hasPH: false,
          hasBicarbonate: false,
          measurementType: selectedStatistic,
          period: statisticPeriod
        }));

        data.value.timeSeries.forEach(series => {
          const paramCode = series.variable.variableCode[0].value;
          const values = series.values?.[0]?.value || [];
          
          // Only process if we have valid values
          if (values.length > 0) {
            const calculatedValue = calculateStatistic(values, selectedStatistic);
            if (calculatedValue !== null && !isNaN(calculatedValue)) {
              if (paramCode === '00410') { // Alkalinity
                setEditedAlkalinity(calculatedValue);
                setSelectedSite(prev => ({
                  ...prev,
                  alkalinity: calculatedValue,
                  alkalinityDateTime: values[values.length - 1].dateTime,
                  hasAlkalinity: true
                }));
              } else if (paramCode === '00060') { // Discharge
                setEditedDischarge(calculatedValue);
                setSelectedSite(prev => ({
                  ...prev,
                  discharge: calculatedValue,
                  dischargeUnit: series.variable.unit.unitCode,
                  dischargeDateTime: values[values.length - 1].dateTime,
                  hasValidDischarge: calculatedValue >= 0
                }));
              } else if (paramCode === '00010') { // Temperature
                setEditedTemperature(calculatedValue);
                setSelectedSite(prev => ({
                  ...prev,
                  temperature: calculatedValue,
                  temperatureUnit: series.variable.unit.unitCode,
                  temperatureDateTime: values[values.length - 1].dateTime,
                  hasTemperature: true
                }));
              } else if (paramCode === '00400') { // pH
                setEditedPH(calculatedValue);
                setSelectedSite(prev => ({
                  ...prev,
                  ph: calculatedValue,
                  phDateTime: values[values.length - 1].dateTime,
                  hasPH: true
                }));
              } else if (paramCode === '00440') { // Bicarbonate
                setEditedBicarbonate(calculatedValue);
                setSelectedSite(prev => ({
                  ...prev,
                  bicarbonate: calculatedValue,
                  bicarbonateUnit: series.variable.unit.unitCode,
                  bicarbonateDateTime: values[values.length - 1].dateTime,
                  hasBicarbonate: true
                }));
              }
            }
          }
        });
      }
    } catch (error) {
      console.error('Error fetching site data:', error);
      // Reset all measurements to false on error
      setSelectedSite(prev => ({
        ...prev,
        hasValidDischarge: false,
        hasAlkalinity: false,
        hasTemperature: false,
        hasPH: false,
        hasBicarbonate: false
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
    if (site) {
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

  const handleEditParameters = () => {
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
          
          {/* Add the time series plot below the map */}
          {location && (
            <div className="mt-6">
              <DischargeTimeSeriesPlot 
                siteId={location}
                selectedStatistic={selectedStatistic}
                statisticPeriod={statisticPeriod}
              />
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
                  <h2 className="text-xl font-bold mb-2">2. Boundary Conditions</h2>
                  <div className="mb-4 space-y-4">
                    <div className="flex gap-4">
                      <div className="flex-1">
                        <Label>Measurement Type</Label>
                        <Select
                          value={selectedStatistic}
                          onValueChange={(value) => {
                            setSelectedStatistic(value);
                            // Reset to 7d when switching from most_recent to other options
                            if (value !== 'most_recent' && statisticPeriod === '') {
                              setStatisticPeriod('7d');
                            }
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select measurement type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="most_recent">Most Recent</SelectItem>
                            <SelectItem value="mean">Mean</SelectItem>
                            <SelectItem value="max">Maximum</SelectItem>
                            <SelectItem value="min">Minimum</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex-1">
                        <Label>Time Period</Label>
                        <Select
                          value={selectedStatistic === 'most_recent' ? '' : statisticPeriod}
                          onValueChange={setStatisticPeriod}
                          disabled={selectedStatistic === 'most_recent'}
                        >
                          <SelectTrigger className={selectedStatistic === 'most_recent' ? 'opacity-50 cursor-not-allowed' : ''}>
                            <SelectValue placeholder={selectedStatistic === 'most_recent' ? 'Not applicable' : 'Select time period'} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1d">Last 24 hours</SelectItem>
                            <SelectItem value="7d">Last 7 days</SelectItem>
                            <SelectItem value="30d">Last 30 days</SelectItem>
                            <SelectItem value="90d">Last 90 days</SelectItem>
                            <SelectItem value="1y">Last 12 months</SelectItem>
                            <SelectItem value="2y">Last 24 months</SelectItem>
                            <SelectItem value="3y">Last 36 months</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <p className="text-sm text-gray-500">
                      {selectedStatistic === 'most_recent' ? 'Showing most recent measurement' :
                       `Showing ${selectedStatistic} value over the last ${statisticPeriod === '1d' ? '24 hours' :
                        statisticPeriod === '7d' ? '7 days' :
                        statisticPeriod === '30d' ? '30 days' :
                        statisticPeriod === '90d' ? '90 days' :
                        statisticPeriod === '1y' ? '12 months' :
                        statisticPeriod === '2y' ? '24 months' :
                        statisticPeriod === '3y' ? '36 months' : '7 days'}`}
                    </p>
                  </div>

                  {isEditing ? (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="discharge">Discharge</Label>
                        <div className="relative">
                          <Input
                            id="discharge"
                            type="number"
                            step="0.01"
                            value={editedDischarge}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              setEditedDischarge(isNaN(val) ? 0 : val);
                            }}
                            disabled={isLoadingSiteData}
                          />
                          {isLoadingSiteData && (
                            <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-900"></div>
                            </div>
                          )}
                          {!isLoadingSiteData && selectedSite?.dischargeUnit && selectedSite?.hasValidDischarge && (
                            <span className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-500">
                              {selectedSite.dischargeUnit}
                            </span>
                          )}
                        </div>
                        {isLoadingSiteData ? (
                          <p className="text-sm text-gray-500">Loading measurements...</p>
                        ) : selectedSite?.dischargeDateTime && (
                          <p className="text-sm text-gray-500">
                            {selectedSite.hasValidDischarge 
                              ? `${selectedStatistic === 'most_recent' ? 'Most recent' : 
                                  selectedStatistic === 'mean' ? 'Mean' :
                                  selectedStatistic === 'max' ? 'Maximum' : 'Minimum'} USGS measurement: 
                                  ${selectedSite.discharge.toFixed(2)} ${selectedSite.dischargeUnit}`
                              : 'No valid measurement available'}
                            {selectedSite.hasValidDischarge && (
                              <span> (as of {new Date(selectedSite.dischargeDateTime).toLocaleDateString()})</span>
                            )}
                          </p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="alkalinity">Alkalinity (mg/L)</Label>
                        <div className="relative">
                          <Input
                            id="alkalinity"
                            type="number"
                            step="0.01"
                            value={editedAlkalinity}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              setEditedAlkalinity(isNaN(val) ? 0 : val);
                            }}
                            disabled={isLoadingSiteData}
                          />
                          {isLoadingSiteData && (
                            <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-900"></div>
                            </div>
                          )}
                        </div>
                        {isLoadingSiteData ? (
                          <p className="text-sm text-gray-500">Loading measurements...</p>
                        ) : selectedSite?.alkalinityDateTime && (
                          <p className="text-sm text-gray-500">
                            {selectedSite.hasAlkalinity 
                              ? `${selectedStatistic === 'most_recent' ? 'Most recent' : 
                                  selectedStatistic === 'mean' ? 'Mean' :
                                  selectedStatistic === 'max' ? 'Maximum' : 'Minimum'} USGS measurement: 
                                  ${selectedSite.alkalinity.toFixed(2)} mg/L`
                              : 'No measurement available'}
                            {selectedSite.hasAlkalinity && (
                              <span> (as of {new Date(selectedSite.alkalinityDateTime).toLocaleDateString()})</span>
                            )}
                          </p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="temperature">Temperature</Label>
                        <div className="relative">
                          <Input
                            id="temperature"
                            type="number"
                            step="0.1"
                            value={editedTemperature}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              setEditedTemperature(isNaN(val) ? 0 : val);
                            }}
                            disabled={isLoadingSiteData}
                          />
                          {isLoadingSiteData && (
                            <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-900"></div>
                            </div>
                          )}
                          {!isLoadingSiteData && selectedSite?.temperatureUnit && selectedSite?.hasTemperature && (
                            <span className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-500">
                              {selectedSite.temperatureUnit}
                            </span>
                          )}
                        </div>
                        {isLoadingSiteData ? (
                          <p className="text-sm text-gray-500">Loading measurements...</p>
                        ) : selectedSite?.temperatureDateTime && (
                          <p className="text-sm text-gray-500">
                            {selectedSite.hasTemperature 
                              ? `${selectedStatistic === 'most_recent' ? 'Most recent' : 
                                  selectedStatistic === 'mean' ? 'Mean' :
                                  selectedStatistic === 'max' ? 'Maximum' : 'Minimum'} USGS measurement: 
                                  ${selectedSite.temperature.toFixed(1)} ${selectedSite.temperatureUnit}`
                              : 'No measurement available'}
                            {selectedSite.hasTemperature && (
                              <span> (as of {new Date(selectedSite.temperatureDateTime).toLocaleDateString()})</span>
                            )}
                          </p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="ph">pH</Label>
                        <div className="relative">
                          <Input
                            id="ph"
                            type="number"
                            step="0.1"
                            min="0"
                            max="14"
                            value={editedPH}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              setEditedPH(isNaN(val) ? 0 : Math.min(14, Math.max(0, val)));
                            }}
                            disabled={isLoadingSiteData}
                          />
                          {isLoadingSiteData && (
                            <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-900"></div>
                            </div>
                          )}
                        </div>
                        {isLoadingSiteData ? (
                          <p className="text-sm text-gray-500">Loading measurements...</p>
                        ) : selectedSite?.phDateTime && (
                          <p className="text-sm text-gray-500">
                            {selectedSite.hasPH 
                              ? `${selectedStatistic === 'most_recent' ? 'Most recent' : 
                                  selectedStatistic === 'mean' ? 'Mean' :
                                  selectedStatistic === 'max' ? 'Maximum' : 'Minimum'} USGS measurement: 
                                  ${selectedSite.ph.toFixed(1)}`
                              : 'No measurement available'}
                            {selectedSite.hasPH && (
                              <span> (as of {new Date(selectedSite.phDateTime).toLocaleDateString()})</span>
                            )}
                          </p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="bicarbonate">Bicarbonate</Label>
                        <div className="relative">
                          <Input
                            id="bicarbonate"
                            type="number"
                            step="0.01"
                            value={editedBicarbonate}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              setEditedBicarbonate(isNaN(val) ? 0 : val);
                            }}
                            disabled={isLoadingSiteData}
                          />
                          {isLoadingSiteData && (
                            <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-900"></div>
                            </div>
                          )}
                          {!isLoadingSiteData && selectedSite?.bicarbonateUnit && selectedSite?.hasBicarbonate && (
                            <span className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-500">
                              {selectedSite.bicarbonateUnit}
                            </span>
                          )}
                        </div>
                        {isLoadingSiteData ? (
                          <p className="text-sm text-gray-500">Loading measurements...</p>
                        ) : selectedSite?.bicarbonateDateTime && (
                          <p className="text-sm text-gray-500">
                            {selectedSite.hasBicarbonate 
                              ? `${selectedStatistic === 'most_recent' ? 'Most recent' : 
                                  selectedStatistic === 'mean' ? 'Mean' :
                                  selectedStatistic === 'max' ? 'Maximum' : 'Minimum'} USGS measurement: 
                                  ${selectedSite.bicarbonate.toFixed(2)} ${selectedSite.bicarbonateUnit}`
                              : 'No measurement available'}
                            {selectedSite.hasBicarbonate && (
                              <span> (as of {new Date(selectedSite.bicarbonateDateTime).toLocaleDateString()})</span>
                            )}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button 
                          type="button"
                          variant="outline" 
                          onClick={() => setIsEditing(false)}
                          className="flex-1"
                        >
                          Cancel
                        </Button>
                        <Button 
                          type="button"
                          onClick={handleSaveParameters}
                          className="flex-1 bg-green-500 hover:bg-green-600"
                        >
                          Save
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <ul className="text-sm list-disc list-inside">
                        <li className="relative">
                          Discharge: {isLoadingSiteData ? (
                            <span className="inline-flex items-center">
                              Loading...
                              <div className="ml-2 animate-spin rounded-full h-3 w-3 border-b-2 border-gray-900"></div>
                            </span>
                          ) : selectedSite?.hasValidDischarge 
                            ? `${selectedSite.discharge.toFixed(2)} ${selectedSite.dischargeUnit} (${selectedStatistic === 'most_recent' ? 'Most recent' : 
                                selectedStatistic === 'mean' ? 'Mean' :
                                selectedStatistic === 'max' ? 'Maximum' : 'Minimum'})`
                            : 'No valid measurement available'}
                        </li>
                        <li className="relative">
                          Alkalinity: {isLoadingSiteData ? (
                            <span className="inline-flex items-center">
                              Loading...
                              <div className="ml-2 animate-spin rounded-full h-3 w-3 border-b-2 border-gray-900"></div>
                            </span>
                          ) : selectedSite?.hasAlkalinity 
                            ? `${selectedSite.alkalinity.toFixed(2)} mg/L (${selectedStatistic === 'most_recent' ? 'Most recent' : 
                                selectedStatistic === 'mean' ? 'Mean' :
                                selectedStatistic === 'max' ? 'Maximum' : 'Minimum'})`
                            : 'No measurement available'}
                        </li>
                        <li className="relative">
                          Temperature: {isLoadingSiteData ? (
                            <span className="inline-flex items-center">
                              Loading...
                              <div className="ml-2 animate-spin rounded-full h-3 w-3 border-b-2 border-gray-900"></div>
                            </span>
                          ) : selectedSite?.hasTemperature 
                            ? `${selectedSite.temperature.toFixed(1)} ${selectedSite.temperatureUnit} (${selectedStatistic === 'most_recent' ? 'Most recent' : 
                                selectedStatistic === 'mean' ? 'Mean' :
                                selectedStatistic === 'max' ? 'Maximum' : 'Minimum'})`
                            : 'No measurement available'}
                        </li>
                        <li className="relative">
                          pH: {isLoadingSiteData ? (
                            <span className="inline-flex items-center">
                              Loading...
                              <div className="ml-2 animate-spin rounded-full h-3 w-3 border-b-2 border-gray-900"></div>
                            </span>
                          ) : selectedSite?.hasPH 
                            ? `${selectedSite.ph.toFixed(1)} (${selectedStatistic === 'most_recent' ? 'Most recent' : 
                                selectedStatistic === 'mean' ? 'Mean' :
                                selectedStatistic === 'max' ? 'Maximum' : 'Minimum'})`
                            : 'No measurement available'}
                        </li>
                        <li className="relative">
                          Bicarbonate: {isLoadingSiteData ? (
                            <span className="inline-flex items-center">
                              Loading...
                              <div className="ml-2 animate-spin rounded-full h-3 w-3 border-b-2 border-gray-900"></div>
                            </span>
                          ) : selectedSite?.hasBicarbonate 
                            ? `${selectedSite.bicarbonate.toFixed(2)} ${selectedSite.bicarbonateUnit} (${selectedStatistic === 'most_recent' ? 'Most recent' : 
                                selectedStatistic === 'mean' ? 'Mean' :
                                selectedStatistic === 'max' ? 'Maximum' : 'Minimum'})`
                            : 'No measurement available'}
                        </li>
                      </ul>
                      <Button 
                        className="mt-2 w-full bg-green-500 hover:bg-green-600 text-white py-2 rounded-xl"
                        disabled={!selectedPoint && !selectedSite}
                        onClick={handleEditParameters}
                        type="button"
                      >
                        Edit Parameters
                      </Button>
                    </>
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

                <Button
                  type="submit"
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white py-3 rounded-2xl text-lg font-semibold mt-4"
                >
                  Run SCEPTER Model
                </Button>

                <div className="mt-4 space-y-2">
                  <Button
                    type="button"
                    onClick={handleSaveModel}
                    disabled={isSaving || (!location && !selectedPoint)}
                    className="w-full bg-blue-500 hover:bg-blue-600 text-white py-3 rounded-2xl text-lg font-semibold"
                  >
                    {isSaving ? 'Saving...' : savedData ? 'Update Model Configuration' : 'Save Model Configuration'}
                  </Button>
                  
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