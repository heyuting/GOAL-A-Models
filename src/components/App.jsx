import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { motion } from "framer-motion";
import DRNConfig from "@/components/DRNConfig";
const models = [
 
  { 
    name: "SCEPTER", 
    description: "1D reactive transport model designed " +
      "to simulate enhanced weathering (EW) in terrestrial soil systems. " +
      "It mechanistically simulates natural weathering processes, including mineral dissolution " +
      "and precipitation, and allows for the targeted addition of organic matter and crushed " +
      "rock feedstocks. SCEPTER is particularly useful for predicting CO₂ sequestration" +
      "by EW and evaluating agronomic impacts of EW approaches in managed soil systems."
  },
  { 
    name: "ATS", 
    description: "The Advanced Terrestrial Simulator (ATS) is a powerful tool " +
      "designed to handle complex reactive transport in hydrology models. It " +
      "efficiently couples surface and subsurface water flow with chemical " +
      "reactions, ensuring accurate simulation of water movement and quality. " +
      "ATS uses innovative algorithms to solve transport and geochemical " +
      "problems, making it a versatile and reliable framework for studying " +
      "environmental processes."
  },
  { 
    name: "DRN", 
    description: "A dynamic river network model designed to quantify the impact of " +
      "enhanced weathering (EW) on river carbonate chemistry. It uses machine learning " +
      "to map key water quality parameters and simulates changes in carbon dynamics " +
      "during river transport. This model helps evaluate the potential of EW as a " +
      "carbon mitigation strategy by assessing its effects on riverine carbon " +
      "storage and chemistry."
  },
];

export default function ModelRunner() {
  const [selectedModel, setSelectedModel] = useState(null);

  return (
    <div className="p-10 bg-gray-100 min-h-screen">
      {!selectedModel ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>
          <h2 className="text-3xl font-bold text-center mb-6 text-gray-800">GOAL-A Models</h2>
          <div className="grid gap-6 grid-cols-1 md:grid-cols-3">
            {models.map((model) => (
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} key={model.name}>
                <Card className="shadow-lg rounded-2xl border border-gray-200 hover:shadow-xl transition h-full flex flex-col">
                  <CardContent className="p-6 flex flex-col flex-grow">
                    <h3 className="text-2xl font-semibold text-gray-700">{model.name}</h3>
                    <p className="text-gray-500 mt-2 flex-grow">{model.description}</p>
                    <Button className="mt-4 w-full bg-blue-500 text-white hover:bg-blue-600" onClick={() => setSelectedModel(model.name)}>
                      Run {model.name}
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </motion.div>
      ) : (
        <ModelExecution model={selectedModel} onBack={() => setSelectedModel(null)} />
      )}
    </div>
  );
}

function ModelExecution({ model, onBack }) {
  const [params, setParams] = useState("");
  const [runId, setRunId] = useState(null);
  const [status, setStatus] = useState(null);
  const [results, setResults] = useState(null);

  const runModel = async () => {
    const response = await fetch("/api/run_model", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model_name: model, parameters: JSON.parse(params) })
    });
    const data = await response.json();
    setRunId(data.job_id);
    checkStatus(data.job_id);
  };

  const checkStatus = async (id) => {
    const response = await fetch(`/api/status/${id}`);
    const data = await response.json();
    setStatus(data.status);
    if (data.status === "completed") fetchResults(id);
  };

  const fetchResults = async (id) => {
    const response = await fetch(`/api/results/${id}`);
    const data = await response.json();
    setResults(data);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>
      <Button onClick={onBack} className="mb-6 bg-gray-500 text-white hover:bg-gray-600">Back</Button>
      <Card className="shadow-lg rounded-2xl border border-gray-200 p-6">
        <CardContent>
          <h2 className="text-3xl font-bold text-gray-800">Run {model}</h2>
          {model === "DRN" ? (
            <DRNConfig />
          ) : (
            <div>
              <p className="text-gray-600 mt-2">Configure the parameters below before running the model.</p>
              <Button onClick={runModel} className="mt-4 bg-blue-500 text-white hover:bg-blue-600" >
                Run Model
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
      {status && <p className="mt-4 text-lg text-gray-700">Status: {status}</p>}
      {results && <pre className="mt-4 p-4 bg-gray-200 rounded-lg overflow-auto">{JSON.stringify(results, null, 2)}</pre>}
    </motion.div>
  );
}
