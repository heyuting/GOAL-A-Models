import React, { useState, useEffect } from "react";
import { Routes, Route, Navigate, useNavigate, useParams, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { motion } from "framer-motion";
import DRNConfig from "@/components/DRNconfig";
import ATSConfig from "./ATSconfig";
import SCEPTERConfig from "./SCEPTERconfig";
import SCEPTERDRNConfig from "./SCEPTERDRNconfig";
import Login from "./Login";
import Register from "./Register";
import UserDashboard from "./UserDashboard";
import VerifyEmail from "./VerifyEmail";
import EmailVerificationPending from "./EmailVerificationPending";
import Verified from "./Verified";

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
  { 
    name: "SCEPTER+DRN", 
    description: "A combined model that integrates SCEPTER's enhanced weathering " +
      "simulation with DRN's river network dynamics. This powerful combination allows " +
      "you to model both the soil-level effects of EW applications and their downstream " +
      "impacts on river chemistry and carbon sequestration. Perfect for comprehensive " +
      "assessment of EW strategies from field to watershed scales."
  },
];

export default function App() {
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Top Navigation Menu - App-wide */}
      <nav className="bg-blue-900 shadow-md border-b border-blue-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-24">
            {/* Logo/Brand */}
            <div className="flex items-center">
              <h1 className="text-xl text-white font-bold text-800 text-center">GOAL-A Models</h1>
            </div>
            
            {/* Main Navigation Links */}
            <div className="ml-20 hidden md:flex items-center space-x-6">
              <a 
                href="#" 
                onClick={() => navigate('/')}
                className="text-center font-bold text-white hover:text-blue-200 px-3 py-2 text-lg font-large transition-colors cursor-pointer"
              >
                Models
              </a>
              <a href="#" className="text-center font-bold text-white hover:text-blue-200 px-3 py-2 text-lg font-large transition-colors">
                Research
              </a>
              <a 
                href="#" 
                onClick={() => navigate('/dashboard')}
                className="text-center font-bold text-white hover:text-blue-200 px-3 py-2 text-lg font-large transition-colors cursor-pointer"
              >
                User Account
              </a>
            </div>
            
            {/* Right side - Sign Out */}
            <div className="flex items-center space-x-4">
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    await logout();
                  } catch (error) {
                    console.error('Logout error:', error);
                  }
                }}
                className="border-blue-200 text-blue-600 hover:bg-blue-800 hover:text-white"
              >
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </nav>

      <Routes>
        {/* Public Routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/register" element={<SignupPage />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/email-verification-pending" element={<EmailVerificationPending />} />
        <Route path="/verified" element={<Verified />} />

        {/* Protected Routes */}
        {user ? (
          <>
            <Route path="/" element={<HomePage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/model/:modelName" element={<ModelPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </>
        ) : (
          <Route path="*" element={<Navigate to="/login" replace />} />
        )}
      </Routes>
    </div>
  );
}

function LoginPage() {
  const navigate = useNavigate();
  
  return (
    <Login onSwitchToRegister={() => navigate('/signup')} />
  );
}

function SignupPage() {
  const navigate = useNavigate();
  
  return (
    <Register onSwitchToLogin={() => navigate('/login')} />
  );
}

function HomePage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="mb-6">
        <h2 className="text-3xl font-bold text-gray-800">Welcome, {user.name}!</h2>
        <p className="text-gray-700 mt-2">Select a model to get started with enhanced rock weathering research</p>
      </div>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>
        <div className="space-y-6">
          {/* First row: SCEPTER and ATS */}
          <div className="grid gap-6 grid-cols-1 md:grid-cols-2">
            {models.filter(model => model.name === "SCEPTER" || model.name === "ATS").map((model) => (
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} key={model.name}>
                <div 
                  onClick={() => navigate(`/model/${model.name.toLowerCase()}`)}
                  className="cursor-pointer h-full"
                >
                  <Card className="shadow-lg rounded-2xl border border-gray-200 hover:shadow-xl transition h-full flex flex-col overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-blue-100 to-white">
                      <h3 className="text-2xl font-bold text-gray-800 tracking-wide">{model.name}</h3>
                    </div>
                    <CardContent className="p-6 flex flex-col flex-grow bg-white">
                      <p className="text-gray-600 mt-2 flex-grow leading-relaxed">{model.description}</p>
                    </CardContent>
                  </Card>
                </div>
              </motion.div>
            ))}
          </div>
          
          {/* Second row: DRN and SCEPTER+DRN */}
          <div className="grid gap-6 grid-cols-1 md:grid-cols-2">
            {models.filter(model => model.name === "DRN" || model.name === "SCEPTER+DRN").map((model) => (
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} key={model.name}>
                <div 
                  onClick={() => navigate(`/model/${model.name.toLowerCase()}`)}
                  className="cursor-pointer h-full"
                >
                  <Card className="shadow-lg rounded-2xl border border-gray-200 hover:shadow-xl transition h-full flex flex-col overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-blue-100 to-white">
                      <h3 className="text-2xl font-bold text-gray-800 tracking-wide">{model.name}</h3>
                    </div>
                    <CardContent className="p-6 flex flex-col flex-grow bg-white">
                      <p className="text-gray-600 mt-2 flex-grow leading-relaxed">{model.description}</p>
                    </CardContent>
                  </Card>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function DashboardPage() {
  const navigate = useNavigate();
  const { logout } = useAuth();

  return (
    <UserDashboard 
      onLogout={async () => {
        try {
          await logout();
          navigate('/login');
        } catch (error) {
          console.error('Logout error:', error);
        }
      }}
      onNavigateToModels={() => {
        navigate('/');
      }}
      onViewModel={(model) => {
        console.log('onViewModel called with:', model);
        // Determine the model type from the saved data
        let modelType = 'drn'; // default fallback
        
        if (model.model) {
          modelType = model.model.toLowerCase();
        } else if (model.name && model.name.includes('DRN')) {
          modelType = 'drn';
        } else if (model.name && model.name.includes('SCEPTER')) {
          modelType = 'scepter+drn';
        } else if (model.name && model.name.includes('ATS')) {
          modelType = 'ats';
        }
        
        console.log('Navigating to model:', modelType);
        navigate(`/model/${modelType}`, { 
          state: { savedModelData: model } 
        });
      }}
    />
  );
}

function ModelPage() {
  const { modelName } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [savedModelData, setSavedModelData] = useState(null);

  useEffect(() => {
    if (location.state?.savedModelData) {
      setSavedModelData(location.state.savedModelData);
    }
  }, [location.state]);

  const modelNameUpperCase = modelName?.toUpperCase();

  return (
    <div className="p-10 bg-gray-100 min-h-screen">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>
        <div className="flex justify-end items-center mb-6">
          {savedModelData && (
            <div className="text-sm text-gray-600">
              <span className="text-blue-600">
                (Viewing saved configuration: {savedModelData.name})
              </span>
            </div>
          )}
        </div>
        <Card className="shadow-lg rounded-2xl border border-gray-200 overflow-hidden p-0">
          <CardHeader className="text-center pb-8 pt-6 bg-gradient-to-r from-white via-blue-100 to-white border-b border-gray-200">
            <CardTitle className="text-3xl font-bold text-gray-800">{modelNameUpperCase}</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            {modelNameUpperCase === "DRN" ? 
              <DRNConfig savedData={savedModelData} />
             : modelNameUpperCase === "ATS" ? 
              <ATSConfig savedData={savedModelData} /> 
             : modelNameUpperCase === "SCEPTER" ?
              <SCEPTERConfig savedData={savedModelData} />
             : modelNameUpperCase === "SCEPTER+DRN" ?
              <SCEPTERDRNConfig savedData={savedModelData} />
             :
              <div className="text-center text-gray-500">Model not found</div>
            }
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}