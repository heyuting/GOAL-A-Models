import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import Modal from '@/components/ui/modal';
import { motion } from "framer-motion";
import 'leaflet/dist/leaflet.css';

// Component to handle map zooming to GeoJSON bounds
function MapController({ geoJsonData }) {
  const map = useMap();

  useEffect(() => {
    if (geoJsonData) {
      const bounds = L.geoJSON(geoJsonData).getBounds();
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [geoJsonData, map]);

  return null;
}

export default function ATSConfig() {
  // Initialize form data state with default values, including layers
  /* const [layers, setLayers] = useState([
    {
      name: 'Layer 1',
      soilType: 'Sandy Loam',
      porosity: '0.45',
      permeability: '1e-12',
      saturation: '0.1',
      vanGenuchtenAlpha: '0.08',
      vanGenuchtenN: '1.6',
    },
  ]); */
  const [simulationName, setSimulationName] = useState('Coweeta')
  const [simulationStartYear, setSimulationStartYear] = useState('2010'); 
  const [simulationEndYear, setSimulationEndYear] = useState('2015');
  const [modisLAIFile, setMODISLAIFile] = useState();
  //const [showLayerModal, setShowLayerModal] = useState(false);
  const [geoJsonData, setGeoJsonData] = useState(null);
  const [geoJsonFileName, setGeoJsonFileName] = useState(null);
  const [minPorosity, setMinPorosity] = useState(0.05);
  const [maxPermeability, setMaxPermeability] = useState(1e-10);
  const [includeRivers, setIncludeRivers] = useState(true);
  const [useGeologicalLayer, setUseGeologicalLayer] = useState(true);

  const handleGeoJsonUpload = async (file) => {
    setGeoJsonFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target.result;
      try {
        const geojson = JSON.parse(content);
        setGeoJsonData(geojson);
        console.log(geojson);
      } catch {
        alert("Invalid GeoJSON file.");
        setGeoJsonFileName(null);
        setGeoJsonData(null);
      }
    };
    reader.readAsText(file);
  };
/* 
  // Handle changes to layer parameters
  const handleLayerChange = (e, layerIndex) => {
    const { name, value } = e.target;
    const updatedLayers = [...layers];
    updatedLayers[layerIndex][name] = value;
    setLayers(updatedLayers);
  };

  
  // Handle adding a new layer
  const addLayer = (name) => {
    if (name.trim()) {
      setLayers([
        ...layers,
        {
          name,
          soilType: 'Sandy Loam',
          porosity: '0.45',
          permeability: '1e-12',
          saturation: '0.1',
          vanGenuchtenAlpha: '0.08',
          vanGenuchtenN: '1.6',
        },
      ]);
      setShowLayerModal(false);
    }
  };

  // Remove a layer from the form with confirmation
  const removeLayer = (index) => {
    const isConfirmed = window.confirm("Are you sure you want to delete this layer?");
    if (isConfirmed) {
      const updatedLayers = layers.filter((_, i) => i !== index);
      setLayers(updatedLayers);
    }
  };
 */
  const handleSubmit = async (e) => {
    e.preventDefault();
    const data = new FormData();
    /* layers.forEach((layer,index) => {
        Object.entries(layer).forEach(([key, value])=>{
            data.append(`layer_${index}_${key}`, value);
        });
    }); */
    await fetch('/api/run-ats', {
      method: 'POST',
      body: data,
    });
  };

  // Soil types for the dropdown
  // const soilTypes = ['Sandy Loam', 'Clay Loam', 'Silt Loam', 'Loamy Sand', 'Peat'];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} >
      <div className="flex gap-6">
        <div className="w-3/5">
          {/* AOI Inputs */}
          <h2 className="text-xl font-bold text-center mb-6 text-gray-800">Area of Interest</h2>
          <div className="grid grid-cols-1 gap-4">
              {/* Upload GeoJSON file */}
              <div>
                <Label htmlFor="geoJsonFile" className="text-xl font-semibold">Upload GeoJSON File</Label>
                <div className="flex items-center gap-2">
                  <span className="text-blue-600">{geoJsonFileName || "No file chosen"}</span>
                  <div className="relative ml-auto">
                    <Input
                      name="geoJsonFile"
                      type="file"
                      accept=".geojson,.json"
                      onChange={(e) => handleGeoJsonUpload(e.target.files[0])}
                      required
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                    <Button className="bg-blue-400 text-white py-1 px-3 text-sm rounded">Choose File</Button>
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-6">
               <MapContainer center={[39.8283, -98.5795]} zoom={4} style={{ height: '500px', width: '100%' }}>
                  <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution='&copy; OpenStreetMap contributors'
                  />
                  {geoJsonData && <GeoJSON data={geoJsonData} />}
                  <MapController geoJsonData={geoJsonData} />
                </MapContainer>
            </div>
         {/* MODIS LAI Inputs */}
         <div className="grid grid-cols-1 gap-4 mt-6">
              <div>
                <Label htmlFor="modisLAIFile" className="text-xl font-semibold">MODIS LAI File</Label>
                <div className="flex items-center gap-2">
                  <span className="text-blue-600">{modisLAIFile ? modisLAIFile.name : "No file chosen"}</span>
                  <div className="relative ml-auto">
                    <Input
                      name="modisLAIFile"
                      type="file"
                      accept=".nc"
                      onChange={(e) => setMODISLAIFile(e.target.files[0])}
                      required
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                    <Button className="bg-blue-400 text-white py-1 px-3 text-sm rounded">Choose File</Button>
                  </div>
                </div>
              </div>
            </div> 
      </div>
      
      <div className="w-2/5">
       <h2 className="text-xl font-bold text-center mb-6 text-gray-800">Simulation Settings</h2>
        <Card className="mt-27 rounded-2xl shadow-lg p-6">
         <CardContent className="space-y-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Simulation Duration Input */}
          
            <div className="flex items-center gap-4">
              <Label htmlFor="simulationName" className="min-w-fit font-semibold">Simulation Name</Label>
              <Input name="simulationName" type="string" value={simulationName} onChange={(e) => setSimulationName(e.target.value)} required  className="w-32 md:w-40"/>
            </div>

            <div className="flex items-center gap-4"> 
              <Label htmlFor="simulationStartYear" className="min-w-fit font-semibold">Simulation Start Year</Label>
              <Input name="simulationStartYear" type="number" value={simulationStartYear} onChange={(e) => setSimulationStartYear(e.target.value)} required  className="w-32 md:w-24"/>
            </div>
            
            <div className="flex items-center gap-4"> 
              <Label htmlFor="simulationEndYear" className="min-w-fit font-semibold">Simulation End Year</Label>
              <Input name="simulationEndYear" type="number" value={simulationEndYear} onChange={(e) => setSimulationEndYear(e.target.value)} required  className="w-32 md:w-24"/>
            </div>

            <div className="flex items-center gap-4">
              <Label htmlFor="minPorosity" className="min-w-fit font-semibold">Min Porosity</Label>
              <Input name="minPorosity"  type="number" value={minPorosity} onChange={(e) => setMinPorosity(e.target.value)} step="0.01" min="0" max="1" required className="w-32 md:w-24"/>
            </div>

            <div className="flex items-center gap-4">
              <Label htmlFor="maxPermeability" className="min-w-fit font-semibold">Max Permeability</Label>
              <Input name="maxPermeability" type="number" value={maxPermeability} onChange={(e) => setMaxPermeability(e.target.value)} step="1e-10" min="0" required className="w-32 md:w-24"/>
            </div>

            <div className="flex items-center gap-4">
              <Label htmlFor="includeRivers" className="min-w-fit font-semibold">Include Rivers in Simulation</Label>
              <div className="flex items-center">
                <select
                  id="includeRivers"
                  value={includeRivers}
                  onChange={(e) => setIncludeRivers(e.target.value === "true")}
                  className="w-full p-2 rounded border text-sm"
                >
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <Label htmlFor="useGeologicalLayer" className="min-w-fit font-semibold">Use Geological Layer?</Label>
              <div className="flex items-center">
                <select
                  id="useGeologicalLayer"
                  value={useGeologicalLayer}
                  onChange={(e) => setUseGeologicalLayer(e.target.value === "true")}
                  className="w-full p-2 rounded border text-sm"
                >
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              </div>
            </div>
            

            {/* 
            <h2 className="text-xl font-semibold pt-8">Soil & Hydrological Parameters</h2>   
            {layers.map((layer, index) => (
              <div key={index} className="border-b py-4">
                <h3 className="font-semibold text-lg mb-2">{layer.name}</h3>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor={`soilType-${index}`}>Soil Type</Label>
                    <select
                      name="soilType"
                      value={layer.soilType}
                      onChange={(e) => handleLayerChange(e, index)}
                      className="w-full p-2 rounded border text-sm"
                    >
                      <option value="" disabled>Select soil type</option>
                      {soilTypes.map((type) => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label htmlFor={`porosity-${index}`}>Porosity</Label>
                    <Input
                      name="porosity"
                      type="number"
                      step="0.01"
                      value={layer.porosity}
                      onChange={(e) => handleLayerChange(e, index)}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor={`permeability-${index}`}>Permeability (m²)</Label>
                    <Input
                      name="permeability"
                      type="number"
                      step="1e-18"
                      value={layer.permeability}
                      onChange={(e) => handleLayerChange(e, index)}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor={`saturation-${index}`}>Residual Saturation</Label>
                    <Input
                      name="saturation"
                      type="number"
                      step="0.01"
                      value={layer.saturation}
                      onChange={(e) => handleLayerChange(e, index)}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor={`vanGenuchtenAlpha-${index}`}>van Genuchten Alpha (1/m)</Label>
                    <Input
                      name="vanGenuchtenAlpha"
                      type="number"
                      step="0.01"
                      value={layer.vanGenuchtenAlpha}
                      onChange={(e) => handleLayerChange(e, index)}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor={`vanGenuchtenN-${index}`}>van Genuchten n</Label>
                    <Input
                      name="vanGenuchtenN"
                      type="number"
                      step="0.01"
                      value={layer.vanGenuchtenN}
                      onChange={(e) => handleLayerChange(e, index)}
                      required
                    />
                  </div>
                 </div>
                
                <Button
                    type="button"
                    onClick={() => removeLayer(index)}
                    className="bg-red-500 text-white py-1 px-3 text-sm rounded mt-4"
                >
                    Remove Layer
                </Button>
                </div>
            ))}

            <Button
              type="button"
              onClick={() => setShowLayerModal(true)}
              className="mt-4 bg-blue-500 text-white hover:bg-blue-600 rounded-md"
            >
              Add Another Layer
            </Button>
            <Modal 
                isOpen={showLayerModal} 
                onClose={() => setShowLayerModal(false)} 
                onAddLayer={addLayer}
            />
            */}
            <div className="pt-4">
              <Button 
                type="submit" 
                className="bg-blue-500 text-white hover:bg-blue-600 rounded-md p-2 w-full disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!geoJsonData}
              >
                Generate Inputs for ATS
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
      </div>
    </div>
    </motion.div>
  );
}
