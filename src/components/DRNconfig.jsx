import { useState } from "react";

export default function DRNConfig({ onRun }) {
  const [numStart, setNumStart] = useState(1);
  const [numEnd, setNumEnd] = useState(40);
  const [addFlag, setAddFlag] = useState("middle");
  const [deploymentScenario, setDeploymentScenario] = useState(0);
  const [yearRun, setYearRun] = useState(2);
  const [timeStep, setTimeStep] = useState(0.1);

  return (
    <div>
      <h3 className="text-xl font-semibold mt-12">DRN Model Configuration</h3>
      <div className="grid grid-cols-2 gap-4 mt-4">
        <div className="mb-4">
          <label className="block mb-2">Start Index of Flow Paths to Simulate</label>
          <input type="number" value={numStart} onChange={(e) => setNumStart(e.target.value)} className="p-2 border rounded mt-2" />
        </div>

        <div className="mb-4">
          <label className="block mb-2">End Index of Flow Paths to Simulate</label>
          <input type="number" value={numEnd} onChange={(e) => setNumEnd(e.target.value)} className="p-2 border rounded mt-2" />
        </div>

        <div className="mb-4">
          <label className="block mb-2">EW Scenario</label>
          <select value={addFlag} onChange={(e) => setAddFlag(e.target.value)} className="p-2 border rounded mt-2">
            <option value="min">Min (~0.5 ton/ha/yr)</option>
            <option value="middle">Middle (~1 ton/ha/yr)</option>
            <option value="max">Max (~1.5 ton/ha/yr)</option>
          </select>
        </div>

        <div className="mb-4">
          <label className="block mb-2">Deployment Scenario</label>
          <select value={deploymentScenario} onChange={(e) => setDeploymentScenario(e.target.value)} className="p-2 border rounded mt-2">
            <option value={0}>0: Before EW</option>
            <option value={1}>1: After EW</option>
          </select>
        </div>

        <div className="mb-4">
          <label className="block mb-2">Number of Years to Run the Simulation</label>
          <input type="number" value={yearRun} onChange={(e) => setYearRun(e.target.value)} className="p-2 border rounded mt-2" />
        </div>

        <div className="mb-4">
          <label className="block mb-2">Time Step for Output Results (in years)</label>
          <input type="number" step="0.1" value={timeStep} onChange={(e) => setTimeStep(e.target.value)} className="p-2 border rounded mt-2" />
        </div>

      </div>
      <button onClick={() => onRun({ numStart, numEnd, addFlag, deploymentScenario, yearRun, timeStep })} className="mt-4 bg-blue-500 text-white hover:bg-blue-600 rounded-md p-2" >
        Run DRN Model
      </button>
    </div>
  );
}
