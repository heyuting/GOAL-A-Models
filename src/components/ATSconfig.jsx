import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import Modal from '@/components/ui/modal';
import { motion } from "framer-motion";
import { useAuth } from '@/contexts/AuthContext';
import userService from '@/services/userService';
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

export default function ATSConfig({ savedData }) {
  const { user } = useAuth();
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
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  // Load saved data when component mounts or savedData changes
  useEffect(() => {
    if (savedData) {
      const params = savedData.parameters || {};
      setSimulationName(params.simulationName || 'Coweeta');
      setSimulationStartYear(params.simulationStartYear || '2010');
      setSimulationEndYear(params.simulationEndYear || '2015');
      setMinPorosity(params.minPorosity || 0.05);
      setMaxPermeability(params.maxPermeability || 1e-10);
      setIncludeRivers(params.includeRivers !== undefined ? params.includeRivers : true);
      setUseGeologicalLayer(params.useGeologicalLayer !== undefined ? params.useGeologicalLayer : true);
      
      // Load saved files info
      if (savedData.geoJsonFileName) {
        setGeoJsonFileName(savedData.geoJsonFileName);
      }
      if (savedData.modisLAIFileName) {
        setMODISLAIFile({ name: savedData.modisLAIFileName });
      }
    }
  }, [savedData]);

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

  const handleSaveModel = async () => {
    if (!user) {
      setSaveMessage('Please log in to save models');
      return;
    }

    if (!geoJsonData) {
      setSaveMessage('Please upload a GeoJSON file first');
      return;
    }

    setIsSaving(true);
    setSaveMessage('');

    try {
      const modelData = {
        name: `ATS - ${simulationName}`,
        model: 'ATS',
        location: 'Custom GeoJSON Area',
        status: 'saved',
        parameters: {
          simulationName,
          simulationStartYear,
          simulationEndYear,
          minPorosity,
          maxPermeability,
          includeRivers,
          useGeologicalLayer
        },
        geoJsonFileName: geoJsonFileName,
        modisLAIFileName: modisLAIFile?.name
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
                <Label htmlFor="geoJsonFile" className="text-xl font-semibold">Upload GeoJSON File of the Watershed</Label>
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
                    url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}"
                    attribution='© Esri, DeLorme, NAVTEQ, TomTom, Intermap, iPC, USGS, FAO, NPS, NRCAN, GeoBase, Kadaster NL, Ordnance Survey, Esri Japan, METI, Esri China (Hong Kong), and the GIS User Community'
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
              <Label htmlFor="simulationName" className="w-44 font-semibold">Simulation Name</Label>
              <Input name="simulationName" type="string" value={simulationName} onChange={(e) => setSimulationName(e.target.value)} required  className="flex-1"/>
            </div>

            <div className="flex items-center gap-4"> 
              <Label htmlFor="simulationStartYear" className="w-44 font-semibold">Simulation Start Year</Label>
              <Input name="simulationStartYear" type="number" value={simulationStartYear} onChange={(e) => setSimulationStartYear(e.target.value)} required  className="flex-1"/>
            </div>
            
            <div className="flex items-center gap-4"> 
              <Label htmlFor="simulationEndYear" className="w-44 font-semibold">Simulation End Year</Label>
              <Input name="simulationEndYear" type="number" value={simulationEndYear} onChange={(e) => setSimulationEndYear(e.target.value)} required  className="flex-1"/>
            </div>

            <div className="flex items-center gap-4">
              <Label htmlFor="minPorosity" className="w-44 font-semibold">Min Porosity</Label>
              <Input name="minPorosity"  type="number" value={minPorosity} onChange={(e) => setMinPorosity(e.target.value)} step="0.01" min="0" max="1" required className="flex-1"/>
            </div>

            <div className="flex items-center gap-4">
              <Label htmlFor="maxPermeability" className="w-44 font-semibold">Max Permeability</Label>
              <Input name="maxPermeability" type="number" value={maxPermeability} onChange={(e) => setMaxPermeability(e.target.value)} step="1e-10" min="0" required className="flex-1"/>
            </div>

            <div className="flex items-center gap-4">
              <Label htmlFor="includeRivers" className="w-44 font-semibold">Include Rivers in Simulation</Label>
              <select
                id="includeRivers"
                value={includeRivers}
                onChange={(e) => setIncludeRivers(e.target.value === "true")}
                className="flex-1 p-2 rounded border text-sm"
              >
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </div>

            <div className="flex items-center gap-4">
              <Label htmlFor="useGeologicalLayer" className="w-44 font-semibold">Use Geological Layer?</Label>
              <select
                id="useGeologicalLayer"
                value={useGeologicalLayer}
                onChange={(e) => setUseGeologicalLayer(e.target.value === "true")}
                className="flex-1 p-2 rounded border text-sm"
              >
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
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
            <div className="pt-4 space-y-2">
              <div className="flex gap-4">

                <Button
                  type="button"
                  onClick={handleSaveModel}
                  disabled={isSaving || !geoJsonData}
                  className="flex-1 bg-green-500 hover:bg-green-600 text-white py-2 rounded-md font-semibold"
                >
                  {isSaving ? 'Saving...' : savedData ? 'Update Model Configuration' : 'Save Model Configuration'}
                </Button>
                
                <Button 
                  type="submit" 
                  className="flex-1 bg-blue-500 text-white hover:bg-blue-600 rounded-md p-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={!geoJsonData}
                >
                  Generate Inputs for ATS
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
    </motion.div>
  );
}
