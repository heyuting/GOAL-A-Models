import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

function TimeSeriesPlot({ siteId, selectedStatistic, statisticPeriod }) {
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

export default TimeSeriesPlot; 