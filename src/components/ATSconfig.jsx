import React, { useState } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import  Modal  from '@/components/ui/modal';
import { motion } from "framer-motion";


export default function ATSConfig() {
  // Initialize form data state with default values, including layers
  const [layers, setLayers] = useState([
    {
      name: 'Layer 1',
      soilType: 'Sandy Loam',
      porosity: '0.45',
      permeability: '1e-12',
      saturation: '0.1',
      vanGenuchtenAlpha: '0.08',
      vanGenuchtenN: '1.6',
    },
  ]);

  const [simulationYears, setSimulationYears] = useState('5');
  const [precipitationFile, setPrecipitationFile] = useState();
  const [temperatureFile, setTemperatureFile] = useState();
  const [showLayerModal, setShowLayerModal] = useState(false);

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    const data = new FormData();
    data.append('simulationYears', simulationYears);
    layers.forEach((layer,index) => {
        Object.entries(layer).forEach(([key, value])=>{
            data.append(`layer_${index}_${key}`, value);
        });
    });
    await fetch('/api/run-ats', {
      method: 'POST',
      body: data,
    });
  };

  // Soil types for the dropdown
  const soilTypes = ['Sandy Loam', 'Clay Loam', 'Silt Loam', 'Loamy Sand', 'Peat'];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-3xl mx-auto p-6">
      <Card className="rounded-2xl shadow-lg p-6">
        <CardContent className="space-y-6">
          <form onSubmit={handleSubmit} className="space-y-6">

            {/* Simulation Duration Input */}
            <h2 className="text-xl font-semibold">Simulation Settings</h2>
            <div className="flex items-center gap-4">
              <Label htmlFor="simulationYears" className="min-w-fit">Simulation Duration (Years)</Label>
              <Input name="simulationYears" type="number" value={simulationYears} onChange={(e) => setSimulationYears(e.target.value)} required  className="w-32 md:w-40"/>
            </div>

            {/* Climate File Inputs */}
            <h2 className="text-xl font-semibold">Climate Parameters</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

              {/* Precipitation File Upload */}
              <div>
                <Label htmlFor="precipitationFile">Precipitation File</Label>
                <div className="flex items-center gap-2">
                  <span className="text-blue-600">{precipitationFile ? precipitationFile.name : "No file chosen"}</span>
                  <div className="relative ml-auto">
                    <Input
                      name="precipitationFile"
                      type="file"
                      accept=".dat"
                      onChange={(e) => setPrecipitationFile(e.target.files[0])}
                      required
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                    <Button className="bg-blue-400 text-white py-1 px-3 text-sm rounded">Choose File</Button>
                  </div>
                </div>
              </div>

              {/* Temperature File Upload */}
              <div>
                <Label htmlFor="temperatureFile">Temperature File</Label>
                <div className="flex items-center gap-2">
                  <span className="text-blue-600">{temperatureFile ? temperatureFile.name : "No file chosen"}</span>
                  <div className="relative ml-auto">
                    <Input
                      name="temperatureFile"
                      type="file"
                      accept=".dat"
                      onChange={(e) => setTemperatureFile(e.target.files[0])}
                      required
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                    <Button className="bg-blue-400 text-white py-1 px-3 text-sm rounded">Choose File</Button>
                  </div>
                </div>
              </div>
            </div>

            <h2 className="text-xl font-semibold pt-8">Soil & Hydrological Parameters</h2>

            {/* Render input fields for each layer */}
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
                
                {/* Button to remove layer */}
                <Button
                    type="button"
                    onClick={() => removeLayer(index)}
                    className="bg-red-500 text-white py-1 px-3 text-sm rounded mt-4"
                >
                    Remove Layer
                </Button>
                </div>
            ))}


            {/* Button to add a new layer */}
            <Button
              type="button"
              onClick={() => setShowLayerModal(true)}
              className="mt-4 bg-blue-500 text-white hover:bg-blue-600 rounded-md"
            >
              Add Another Layer
            </Button>
            {/* Modal for adding a new layer */}
            <Modal 
                isOpen={showLayerModal} 
                onClose={() => setShowLayerModal(false)} 
                onAddLayer={addLayer}
            />
            <div className="pt-6">
              <Button type="submit" className="mt-4 bg-blue-500 text-white hover:bg-blue-600 rounded-md p-2 w-full">Run ATS Simulation</Button>
            </div>
          </form>
        </CardContent>
      </Card>

    </motion.div>
  );
}
