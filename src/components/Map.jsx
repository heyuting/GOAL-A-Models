import L from "leaflet";
import { MapContainer, TileLayer, Marker, useMapEvents, GeoJSON, Tooltip } from "react-leaflet";
import { useState, useEffect } from "react";
import "leaflet/dist/leaflet.css";

// Fix for default marker icon in React Leaflet
delete L.Icon.Default.prototype._getIconUrl;

L.Icon.Default.mergeOptions({
  iconUrl: "/images/marker-icon.png",
  shadowUrl: "/images/marker-shadow.png",
});

// Add custom CSS for markers
const customMarkerStyles = `
  .custom-marker {
    background: transparent !important;
    border: none !important;
  }
  .custom-marker div {
    transition: all 0.2s ease;
  }
  .custom-marker div:hover {
    transform: scale(1.2);
  }
`;

// Inject custom styles
if (typeof document !== 'undefined') {
  const styleElement = document.createElement('style');
  styleElement.textContent = customMarkerStyles;
  document.head.appendChild(styleElement);
}

export default function MapComponent({ onLocationSelect, disabled = false, selectedLocations = [], currentLocationIndex = -1, watershedResults = null }) {
  const [riverData, setRiverData] = useState(null);
  const [boundaryData, setBoundaryData] = useState(null);
  const [loading, setLoading] = useState(true); // State to handle river loading state
  const [boundaryLoading, setBoundaryLoading] = useState(true);
  const [showRivers, setShowRivers] = useState(false); // State to track whether to show river layer
  const canvasRenderer = new L.Canvas();

  // Fetch the river data once when the component mounts
  useEffect(() => {
    if (!riverData) { // Only fetch if we haven't already loaded the data
      fetch("/river_simplify.geojson") // Assuming the file is in the public folder
        .then((response) => response.json())
        .then((data) => {
          setRiverData(data); // Set the river data
          setLoading(false); // Once data is loaded, set loading to false
        })
        .catch((err) => {
          console.error("Error loading river data:", err);
          setLoading(false); // Set loading to false even if there is an error
        });
    }
  }, [riverData]); // Empty dependency array, but check for `riverData` to avoid repeated fetch

  // Fetch CONUS boundary once
  useEffect(() => {
    if (!boundaryData) {
      fetch("/sf_us_conus.geojson")
        .then((response) => response.json())
        .then((data) => {
          setBoundaryData(data);
          setBoundaryLoading(false);
        })
        .catch((err) => {
          console.error("Error loading CONUS boundary:", err);
          setBoundaryLoading(false);
        });
    }
  }, [boundaryData]);

  function LocationMarker() {
    useMapEvents({
      click(e) {
        // Debug: Log click event
        console.log('Map clicked, disabled:', disabled);
        // Only allow location selection if not disabled
        if (!disabled) {
          const { lat, lng } = e.latlng;
          console.log('Calling onLocationSelect with:', { lat, lng });
          onLocationSelect({ lat, lng });
        } else {
          console.log('Map is disabled, ignoring click');
        }
      },
    });

    return null; // We'll render markers separately
  }

  // Create custom markers for different states
  const createCustomIcon = (isCurrent) => {
    return L.divIcon({
      className: 'custom-marker',
      html: `<div class="w-4 h-4 rounded-full border-2 border-white shadow-lg ${
        isCurrent ? 'bg-blue-500' : 'bg-gray-500'
      }"></div>`,
      iconSize: [16, 16],
      iconAnchor: [8, 8]
    });
  };

  return (
    <div className="w-full h-[600px]">
      {/* Checkboxes to toggle layers */}
      <div className="mb-4 flex justify-between items-center gap-4">
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={showRivers}
            onChange={() => setShowRivers(!showRivers)} 
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
          <span className="ml-3">Show River Layer</span>
        </label>
      </div>
      
      <div className={`relative h-[600px] ${disabled ? 'opacity-75' : ''}`}>
        <MapContainer center={[40, -100]} zoom={4} className="w-full h-full">
          <TileLayer
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}"
            attribution='© Esri, DeLorme, NAVTEQ, TomTom, Intermap, iPC, USGS, FAO, NPS, NRCAN, GeoBase, Kadaster NL, Ordnance Survey, Esri Japan, METI, Esri China (Hong Kong), and the GIS User Community'
          />

          {/* CONUS boundary */}
          {!boundaryLoading && boundaryData && (
            <GeoJSON
              data={boundaryData}
              style={{ color: "#FCD34D", weight: 2, fillOpacity: 0 }}
              interactive={false}
            />
          )}

          {/* Show a loading indicator until the GeoJSON data is loaded */}
          {loading ? (
            <div className="absolute top-0 left-0 w-full h-full flex justify-center items-center bg-white bg-opacity-50">
              <p>Loading rivers...</p>
            </div>
          ) : (
            // Render the river GeoJSON if the checkbox is checked
            showRivers && riverData && <GeoJSON data={riverData} renderer={canvasRenderer} style={{ color: "blue", weight: 0.5 }} />
          )}

          {/* Render watershed results if available */}
          {watershedResults && (
            <>
              {watershedResults.sf_ws_all && (
                <GeoJSON
                  data={watershedResults.sf_ws_all}
                  style={{ color: "#10b981", weight: 2, fillColor: "#10b981", fillOpacity: 0.2 }}
                  eventHandlers={{ add: (e) => e.target.bringToBack() }}
                  smoothFactor={2.0}
                  renderer={canvasRenderer}
                />
              )}
              {watershedResults.sf_river_ode && (
                <GeoJSON
                  data={watershedResults.sf_river_ode}
                  style={{ color: "#3b82f6", weight: 2 }}
                  smoothFactor={2.0}
                  renderer={canvasRenderer}
                />
              )}
              {watershedResults.sf_river_trib && (
                <GeoJSON
                  data={watershedResults.sf_river_trib}
                  style={{ color: "#60a5fa", weight: 1.5 }}
                  smoothFactor={2.0}
                  renderer={canvasRenderer}
                />
              )}
              {watershedResults.sf_river_middle && (
                <GeoJSON
                  data={watershedResults.sf_river_middle}
                  style={{ color: "#93c5fd", weight: 1 }}
                  smoothFactor={2.0}
                  renderer={canvasRenderer}
                />
              )}
              {watershedResults.sf_river_rock && (
                <GeoJSON
                  data={watershedResults.sf_river_rock}
                  style={{ color: "#f59e0b", weight: 2, dashArray: "5, 5" }}
                  smoothFactor={2.0}
                  renderer={canvasRenderer}
                />
              )}
            </>
          )}
          
          {/* Render all selected locations with different colors */}
          {selectedLocations.map((location, index) => (
            <Marker
              key={index}
              position={[location.lat, location.lng]}
              icon={createCustomIcon(index === currentLocationIndex)}
            >
              <Tooltip permanent direction="top" offset={[0, -10]}>
                Location {index + 1}
              </Tooltip>
            </Marker>
          ))}
          
          <LocationMarker />
        </MapContainer>
        
      </div>
    </div>
  );
}