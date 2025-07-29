import { useState, useEffect } from "react";
import MapComponent from "./Map";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from '@/contexts/AuthContext';
import userService from '@/services/userService';

export default function DRNConfig({ onRun, savedData }) {
  const { user } = useAuth();
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [numStart, setNumStart] = useState(1);
  const [addFlag, setAddFlag] = useState("middle");
  const [yearRun, setYearRun] = useState(2);
  const [timeStep, setTimeStep] = useState(0.1);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  // Load saved data when component mounts or savedData changes
  useEffect(() => {
    if (savedData) {
      const params = savedData.parameters || {};
      setNumStart(params.numStart || 1);
      setAddFlag(params.addFlag || "middle");
      setYearRun(params.yearRun || 2);
      setTimeStep(params.timeStep || 0.1);
      
      // Load saved location
      if (savedData.location && savedData.location !== 'Custom Location') {
        const [lat, lng] = savedData.location.split(',').map(coord => parseFloat(coord.trim()));
        if (!isNaN(lat) && !isNaN(lng)) {
          setSelectedLocation({ lat, lng });
        }
      }
    }
  }, [savedData]);

  const handleLocationSelect = (location) => {
    setSelectedLocation(location);
  };

  const handleRunModel = () => {
    if (onRun) {
      onRun({ numStart, addFlag, yearRun, timeStep });
    } else {
      // Default behavior if no onRun handler provided
      console.log('Running DRN model with parameters:', { numStart, addFlag, yearRun, timeStep });
    }
  };

  const handleSaveModel = async () => {
    if (!user) {
      setSaveMessage('Please log in to save models');
      return;
    }

    if (!selectedLocation) {
      setSaveMessage('Please select a location first');
      return;
    }

    setIsSaving(true);
    setSaveMessage('');

    try {
      const modelData = {
        name: `DRN - ${selectedLocation.lat.toFixed(3)}, ${selectedLocation.lng.toFixed(3)}`,
        model: 'DRN',
        location: `${selectedLocation.lat.toFixed(4)}, ${selectedLocation.lng.toFixed(4)}`,
        status: 'saved',
        parameters: {
          numStart,
          addFlag,
          yearRun,
          timeStep
        }
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

  return (
    <div>
      <div className="flex gap-6">
        <div className="w-3/5">
          <h3 className="text-xl font-bold text-center mb-6 text-gray-800">Area of Interest</h3>
          <MapComponent onLocationSelect={handleLocationSelect} />
        </div>
        <div className="w-2/5">
          <h3 className="text-xl font-bold text-center mb-6 text-gray-800">DRN Model Configuration</h3>
          <Card className="mt-17 p-6 shadow-lg rounded-2xl border border-gray-200">
            <CardContent>
              <h3 className="text-xl font-semibold">1. Selected Location</h3>
              <p className="text-gray-500 mb-4 mt-3">
                {selectedLocation 
                  ? `Selected Location: ${selectedLocation.lat.toFixed(3)}, ${selectedLocation.lng.toFixed(3)}`
                  : "No location selected"}
              </p>
              <h3 className="text-xl font-semibold">2. Model Parameters</h3>
              
                <div className="flex items-center gap-4 mb-4">
                  <Label htmlFor="numStart" className="w-44 font-semibold">Start Index of Flow Paths</Label>
                  <Input
                    id="numStart"
                    name="numStart"
                    type="number" 
                    value={numStart} 
                    onChange={(e) => setNumStart(e.target.value)} 
                    className="flex-1" 
                  />
                </div>

                <div className="flex items-center gap-4 mb-4">
                  <Label htmlFor="addFlag" className="w-44 font-semibold flex items-center">
                    EW Scenario
                    <div 
                      className="ml-1 text-gray-500 hover:text-gray-700 group relative inline-block"
                    >
                      <svg 
                        xmlns="http://www.w3.org/2000/svg" 
                        className="h-4 w-4 cursor-help" 
                        fill="none" 
                        viewBox="0 0 24 24" 
                        stroke="currentColor"
                      >
                        <path 
                          strokeLinecap="round" 
                          strokeLinejoin="round" 
                          strokeWidth={2} 
                          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" 
                        />
                      </svg>
                      <div className="opacity-0 bg-gray-200 text-black text-sm rounded-lg py-2 px-3 absolute z-10 top-0 left-0 transform -translate-y-full w-48 group-hover:opacity-100 transition-opacity duration-300">
                        Annual CO₂ consumption rate by basalt dissolution globally.
                        <div className="absolute top-full left-0 border-8 border-transparent border-t-gray-200"></div>
                      </div>
                    </div>
                  </Label>
                  <Select value={addFlag} onValueChange={setAddFlag}>
                    <SelectTrigger id="addFlag" className="flex-1">
                      <SelectValue placeholder="Select a scenario" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="min">Min (~0.5 ton/ha/yr)</SelectItem>
                      <SelectItem value="middle">Middle (~1 ton/ha/yr)</SelectItem>
                      <SelectItem value="max">Max (~1.5 ton/ha/yr)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-4 mb-4">
                  <Label htmlFor="yearRun" className="w-44 font-semibold">Simulation Years</Label>
                  <Input
                    id="yearRun"
                    name="yearRun"
                    type="number" 
                    value={yearRun} 
                    onChange={(e) => setYearRun(e.target.value)} 
                    className="flex-1" 
                  />
                </div>

                <div className="flex items-center gap-4 mb-4">
                  <Label htmlFor="timeStep" className="w-44 font-semibold">Output Timestep (days)</Label>
                  <Input
                    id="timeStep"
                    name="timeStep"
                    type="number" 
                    step="0.1" 
                    value={timeStep} 
                    onChange={(e) => setTimeStep(e.target.value)} 
                    className="flex-1" 
                  />
                </div>
                <div className="flex gap-4">
                  <Button
                    type="button"
                    onClick={handleSaveModel}
                    disabled={isSaving || !selectedLocation}
                    className="flex-1 bg-green-500 hover:bg-green-600 text-white py-2 rounded-md font-semibold"
                  >
                    {isSaving ? 'Saving...' : savedData ? 'Update Model Configuration' : 'Save Model Configuration'}
                  </Button>

                  <Button 
                    onClick={handleRunModel} 
                    className="flex-1 bg-blue-500 text-white hover:bg-blue-600 rounded-md p-2"
                    disabled={!selectedLocation}
                  >
                    Run DRN Model
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
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
