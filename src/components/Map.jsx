import L from "leaflet";
import { MapContainer, TileLayer, Marker, useMapEvents, GeoJSON } from "react-leaflet";
import { useState, useEffect } from "react";
import "leaflet/dist/leaflet.css";

export default function MapComponent({ onLocationSelect }) {
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [riverData, setRiverData] = useState(null);
  const [loading, setLoading] = useState(true); // State to handle loading state
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


  function LocationMarker() {
    useMapEvents({
      click(e) {
        const { lat, lng } = e.latlng;
        setSelectedLocation({ lat, lng });
        onLocationSelect({ lat, lng });
      },
    });

    return selectedLocation ? <Marker position={[selectedLocation.lat, selectedLocation.lng]} /> : null;
  }

  return (
    <div className="w-full h-[500px]">
    {/* Checkbox to toggle river layer */}
    <div className="mb-4">
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
      <MapContainer center={[40, -100]} zoom={4} className="w-full h-full">
        <TileLayer
                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}"
                attribution='© Esri, DeLorme, NAVTEQ, TomTom, Intermap, iPC, USGS, FAO, NPS, NRCAN, GeoBase, Kadaster NL, Ordnance Survey, Esri Japan, METI, Esri China (Hong Kong), and the GIS User Community'
        />

        {/* Show a loading indicator until the GeoJSON data is loaded */}
        {loading ? (
          <div className="absolute top-0 left-0 w-full h-full flex justify-center items-center bg-white bg-opacity-50">
            <p>Loading rivers...</p>
          </div>
        ) : (
          // Render the river GeoJSON if the checkbox is checked
          showRivers && riverData && <GeoJSON data={riverData} renderer={canvasRenderer} style={{ color: "blue", weight: 0.5 }} />
        )}
        <LocationMarker />
      </MapContainer>
    </div>
  );
}
