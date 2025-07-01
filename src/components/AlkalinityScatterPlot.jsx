import React, { useState, useEffect } from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const CustomTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const point = payload[0].payload;
    return (
      <div className="bg-white p-2 border rounded shadow">
        <p>{`Date: ${new Date(point.x).toLocaleDateString()}`}</p>
        <p>{`Alkalinity: ${point.y} ${point.unit || 'mg/L'}`}</p>
      </div>
    );
  }
  return null;
};

function AlkalinityScatterPlot({ siteId }) {
  const [alkalinityData, setAlkalinityData] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [dateRange, setDateRange] = useState('all');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  useEffect(() => {
    const fetchAlkalinityHistory = async () => {
      if (!siteId) return;
      
      setIsLoading(true);
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
            const chartData = [];
            for (let i = 1; i < lines.length; i++) {
              const values = lines[i].split(',').map(v => v.replace(/"/g, ''));
              const measureValue = values[resultMeasureIndex];
              const dateValue = values[activityStartDateIndex];
              const unitValue = measureUnitIndex >= 0 ? values[measureUnitIndex] : 'mg/L';
              
              if (measureValue && !isNaN(parseFloat(measureValue)) && dateValue) {
                const sampleDate = new Date(dateValue);
                chartData.push({
                  date: sampleDate.toLocaleDateString(),
                  alkalinity: parseFloat(measureValue),
                  dateTime: sampleDate,
                  // For scatter plot, we need x and y values
                  x: sampleDate.getTime(), // timestamp for proper chronological ordering
                  y: parseFloat(measureValue),
                  unit: unitValue || 'mg/L'
                });
              }
            }
            
            // Sort by date
            chartData.sort((a, b) => a.dateTime - b.dateTime);
            setAlkalinityData(chartData);
          } else {
            setAlkalinityData([]);
          }
        } else {
          setAlkalinityData([]);
        }
      } catch (error) {
        console.error('Error fetching alkalinity history:', error);
        setAlkalinityData([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAlkalinityHistory();
  }, [siteId]);

  // Function to filter data based on selected date range
  const getFilteredData = () => {
    if (dateRange === 'all') return alkalinityData;
    
    const now = new Date();
    let startDate;
    
    switch (dateRange) {
      case '1year':
        startDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
        break;
      case '3years':
        startDate = new Date(now.getFullYear() - 3, now.getMonth(), now.getDate());
        break;
      case '5years':
        startDate = new Date(now.getFullYear() - 5, now.getMonth(), now.getDate());
        break;
      case '10years':
        startDate = new Date(now.getFullYear() - 10, now.getMonth(), now.getDate());
        break;
      case 'custom':
        if (customStartDate && customEndDate) {
          const start = new Date(customStartDate);
          const end = new Date(customEndDate);
          return alkalinityData.filter(d => d.dateTime >= start && d.dateTime <= end);
        }
        return alkalinityData;
      default:
        return alkalinityData;
    }
    
    return alkalinityData.filter(d => d.dateTime >= startDate);
  };

  const filteredData = getFilteredData();

  if (isLoading) {
    return (
      <div className="bg-white p-4 rounded-2xl shadow-md">
        <h3 className="text-lg font-bold mb-4">Alkalinity History</h3>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
          <span className="ml-2">Loading alkalinity data...</span>
        </div>
      </div>
    );
  }

  if (alkalinityData.length === 0) {
    return (
      <div className="bg-white p-4 rounded-2xl shadow-md">
        <h3 className="text-lg font-bold mb-4">Alkalinity History</h3>
        <div className="flex items-center justify-center h-64 text-gray-500">
          No alkalinity data available for this site
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white p-4 rounded-2xl shadow-md">
      <h3 className="text-lg font-bold mb-4">Alkalinity Data</h3>
      
      {/* Date Range Controls */}
      <div className="mb-4 space-y-2">
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setDateRange('all')}
            className={`px-3 py-1 rounded text-sm ${dateRange === 'all' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700'}`}
          >
            All Data
          </button>
          <button
            onClick={() => setDateRange('1year')}
            className={`px-3 py-1 rounded text-sm ${dateRange === '1year' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700'}`}
          >
            Last Year
          </button>
          <button
            onClick={() => setDateRange('3years')}
            className={`px-3 py-1 rounded text-sm ${dateRange === '3years' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700'}`}
          >
            Last 3 Years
          </button>
          <button
            onClick={() => setDateRange('5years')}
            className={`px-3 py-1 rounded text-sm ${dateRange === '5years' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700'}`}
          >
            Last 5 Years
          </button>
          <button
            onClick={() => setDateRange('10years')}
            className={`px-3 py-1 rounded text-sm ${dateRange === '10years' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700'}`}
          >
            Last 10 Years
          </button>
          <button
            onClick={() => setDateRange('custom')}
            className={`px-3 py-1 rounded text-sm ${dateRange === 'custom' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700'}`}
          >
            Custom Range
          </button>
        </div>
        
        {dateRange === 'custom' && (
          <div className="flex gap-2 items-center">
            <input
              type="date"
              value={customStartDate}
              onChange={(e) => setCustomStartDate(e.target.value)}
              className="border rounded px-2 py-1 text-sm"
              placeholder="Start Date"
            />
            <span className="text-sm">to</span>
            <input
              type="date"
              value={customEndDate}
              onChange={(e) => setCustomEndDate(e.target.value)}
              className="border rounded px-2 py-1 text-sm"
              placeholder="End Date"
            />
          </div>
        )}
      </div>

      <ResponsiveContainer width="100%" height={400}>
        <ScatterChart 
          data={filteredData}
          margin={{ top: 20, right: 20, left: 40, bottom: 80 }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis 
            type="number"
            dataKey="x"
            scale="time"
            domain={['dataMin', 'dataMax']}
            tickFormatter={(tickItem) => {
              return new Date(tickItem).toLocaleDateString();
            }}
            angle={-90}
            textAnchor="end"
            height={80}
            tick={{ fontSize: 10 }}
            tickMargin={10}
            label={{ value: 'Date', position: 'insideBottom', offset: -10 }}
          />
          <YAxis 
            type="number"
            dataKey="y"
            label={{ value: 'Alkalinity (mg/L)', angle: -90, position: 'insideLeft' }}
            domain={['dataMin', 'dataMax']}
          />
          <Tooltip content={<CustomTooltip />} />
          <Scatter 
            dataKey="y" 
            fill="#2563eb"
            stroke="#1d4ed8"
            strokeWidth={1}
            r={4}
          />
        </ScatterChart>
      </ResponsiveContainer>
      <p className="text-sm text-gray-500 mt-2">
        Showing {filteredData.length} of {alkalinityData.length} total samples
        {filteredData.length > 0 && (
          <>
            <br />
            Date range: {new Date(Math.min(...filteredData.map(d => d.x))).toLocaleDateString()} to {new Date(Math.max(...filteredData.map(d => d.x))).toLocaleDateString()}
            <br />
            Alkalinity range: {Math.min(...filteredData.map(d => d.y)).toFixed(2)} - {Math.max(...filteredData.map(d => d.y)).toFixed(2)} mg/L
          </>
        )}
      </p>
    </div>
  );
}

export default AlkalinityScatterPlot; 