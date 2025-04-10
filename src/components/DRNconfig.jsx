import { useState } from "react";
import MapComponent from "./Map";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function DRNConfig({ onRun }) {
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [numStart, setNumStart] = useState(1);
  const [addFlag, setAddFlag] = useState("middle");
  const [yearRun, setYearRun] = useState(2);
  const [timeStep, setTimeStep] = useState(0.1);
  const [showForm, setShowForm] = useState(false);

  const handleLocationSelect = (location) => {
    setSelectedLocation(location);
    setShowForm(true);
  };
  return (
    <div>
      <div className="flex gap-6">
        <div className="w-2/3">
        <h3 className="text-xl font-bold text-center mb-6 text-gray-800">Select a Location on the Map</h3>
          <MapComponent onLocationSelect={handleLocationSelect} />
        </div>
        <div className="w-1/3">
          <h3 className="text-xl font-bold text-center mb-6 text-gray-800">DRN Model Configuration</h3>
          <div className="mt-20" />
            {showForm && (
            <Card className="mt-6 p-6 shadow-lg rounded-2xl border border-gray-200">
              <CardContent>
                <h3 className="text-xl font-semibold">Model Parameters</h3>
                <p className="text-gray-500 mb-4">Selected Location: {selectedLocation.lat.toFixed(3)}, {selectedLocation.lng.toFixed(3)}</p>

                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div className="mb-4">
                    <label className="block mb-2">Start Index of Flow Paths</label>
                    <input type="number" value={numStart} onChange={(e) => setNumStart(e.target.value)} className="p-2 border rounded mt-2 w-48" />
                  </div>

                  <div className="mb-4">
                    <label className="block mb-2 flex items-center relative">
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
                    </label>
                    <select value={addFlag} onChange={(e) => setAddFlag(e.target.value)} className="p-2 border rounded mt-2 w-48">
                      <option value="min">Min (~0.5 ton/ha/yr)</option>
                      <option value="middle">Middle (~1 ton/ha/yr)</option>
                      <option value="max">Max (~1.5 ton/ha/yr)</option>
                    </select>
                  </div>

                  <div className="mb-4">
                    <label className="block mb-2">Simulation Years</label>
                    <input type="number" value={yearRun} onChange={(e) => setYearRun(e.target.value)} className="p-2 border rounded mt-2 w-48" />
                  </div>

                  <div className="mb-4">
                    <label className="block mb-2">Output Timestep (days)</label>
                    <input type="number" step="0.1" value={timeStep} onChange={(e) => setTimeStep(e.target.value)} className="p-2 border rounded mt-2 w-48" />
                  </div>

                </div>
                <Button onClick={() => onRun({ numStart, addFlag, yearRun, timeStep })} className="mt-4 bg-blue-500 text-white hover:bg-blue-600 rounded-md p-2 w-full" >
                  Run Model
                </Button>

              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
