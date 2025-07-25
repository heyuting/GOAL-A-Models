import React, { useState, useEffect } from "react";
import { Routes, Route, Navigate, useNavigate, useParams, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { motion } from "framer-motion";
import DRNConfig from "@/components/DRNconfig";
import ATSConfig from "./ATSconfig";
import SCEPTERConfig from "./SCEPTERconfig";
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
];

export default function App() {
  const { user, loading } = useAuth();

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
  const { user, logout } = useAuth();

  return (
    <div className="p-10 bg-gray-100 min-h-screen">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">GOAL-A Models</h1>
          <p className="text-gray-600">Welcome, {user.name}!</p>
        </div>
        <div className="flex items-center space-x-4">
          <Button
            variant="outline"
            onClick={() => navigate('/dashboard')}
            className="border-blue-300 text-blue-600 hover:bg-blue-50"
          >
            Dashboard
          </Button>
          <Button
            variant="outline"
            onClick={async () => {
              try {
                await logout();
              } catch (error) {
                console.error('Logout error:', error);
              }
            }}
            className="border-red-300 text-red-600 hover:bg-red-50"
          >
            Sign Out
          </Button>
        </div>
      </div>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>
        <div className="grid gap-6 grid-cols-1 md:grid-cols-3">
          {models.map((model) => (
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} key={model.name}>
              <Card className="shadow-lg rounded-2xl border border-gray-200 hover:shadow-xl transition h-full flex flex-col">
                <CardContent className="p-6 flex flex-col flex-grow">
                  <h3 className="text-2xl font-semibold text-gray-700">{model.name}</h3>
                  <p className="text-gray-500 mt-2 flex-grow">{model.description}</p>
                  <Button 
                    className="mt-4 w-full bg-blue-500 text-white hover:bg-blue-600" 
                    onClick={() => navigate(`/model/${model.name.toLowerCase()}`)}
                  >
                    Run {model.name}
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          ))}
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
        navigate(`/model/${model.model.toLowerCase()}`, { 
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
        <div className="flex justify-between items-center mb-6">
          <Button onClick={() => navigate('/')} className="bg-gray-500 text-white hover:bg-gray-600">
            ← Back to Models
          </Button>
          <div className="text-sm text-gray-600">
            Running as: {user.name}
            {savedModelData && (
              <span className="ml-2 text-blue-600">
                (Viewing saved configuration: {savedModelData.name})
              </span>
            )}
          </div>
        </div>
        <Card className="shadow-lg rounded-2xl border border-gray-200 p-6 py-18">
          <CardContent>
            {modelNameUpperCase === "DRN" ? 
              <DRNConfig savedData={savedModelData} />
             : modelNameUpperCase === "ATS" ? 
              <ATSConfig savedData={savedModelData} /> 
             : modelNameUpperCase === "SCEPTER" ?
              <SCEPTERConfig savedData={savedModelData} />
             :
              <div className="text-center text-gray-500">Model not found</div>
            }
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}