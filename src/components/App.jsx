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
import Research from "./Research";
import About from "./About";
import Opportunities from "./Opportunities";
import Publications from "./Publications";
import ScrollToTop from "./ScrollToTop";

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
      <ScrollToTop />
      {/* Top Navigation Menu - App-wide */}
      <nav className="bg-blue-900 shadow-md border-b border-blue-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-24">
            {/* Logo/Brand */}
            <div className="flex items-center">
              <h1 
                onClick={() => navigate('/public')}
                className="text-xl text-white font-bold cursor-pointer hover:text-blue-200 transition-colors whitespace-nowrap"
              >
                GOAL-A
              </h1>
            </div>
            
            {/* Main Navigation Links */}
            <div className="ml-20 hidden md:flex items-center space-x-10">
              <a 
                href="#" 
                onClick={() => navigate('/research')}
                className="text-center font-bold text-white hover:text-blue-200 px-2 py-1 text-base transition-colors cursor-pointer"
              >
                Research
              </a>
              <a 
                href="#" 
                onClick={() => navigate('/publications')}
                className="text-center font-bold text-white hover:text-blue-200 px-2 py-1 text-base transition-colors cursor-pointer"
              >
                Publications
              </a>
              <a 
                href="#" 
                onClick={() => navigate('/opportunities')}
                className="text-center font-bold text-white hover:text-blue-200 px-2 py-1 text-base transition-colors cursor-pointer"
              >
                Opportunities
              </a>
              <a 
                href="#" 
                onClick={() => navigate('/about')}
                className="text-center font-bold text-white hover:text-blue-200 px-2 py-1 text-base transition-colors cursor-pointer"
              >
                About
              </a>
              {/* Models - Only show for authenticated users */}
              {user && (
                <a 
                  href="#" 
                  onClick={() => navigate('/')}
                  className="text-center font-bold text-white hover:text-blue-200 px-2 py-1 text-base transition-colors cursor-pointer"
                >
                  Models
                </a>
              )}
              {/* User Account - Only show for authenticated users */}
              {user && (
                <a 
                  href="#" 
                  onClick={() => navigate('/dashboard')}
                  className="text-center font-bold text-white hover:text-blue-200 px-2 py-1 text-base transition-colors cursor-pointer"
                >
                  Account
                </a>
              )}
            </div>

            {/* Right side - Conditional based on auth status */}
            <div className="flex items-center space-x-4">
              {user ? (
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
              ) : (
                <>
                  <Button
                    variant="outline"
                    onClick={() => navigate('/login')}
                    className="border-blue-200 text-blue-600 hover:bg-blue-800 hover:text-white"
                  >
                    Login
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => navigate('/signup')}
                    className="border-blue-200 text-blue-600 hover:bg-blue-800 hover:text-white"
                  >
                    Sign Up
                  </Button>
                </>
              )}
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
        <Route path="/research" element={<Research />} />
        <Route path="/about" element={<About />} />
        <Route path="/opportunities" element={<Opportunities />} />
        <Route path="/publications" element={<Publications />} />
        <Route path="/public" element={<PublicHomePage />} />

        {/* Protected Routes */}
        {user ? (
          <>
            <Route path="/" element={<HomePage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/model/:modelName" element={<ModelPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </>
        ) : (
          <>
            <Route path="/" element={<PublicHomePage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </>
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

function PublicHomePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [currentSlide, setCurrentSlide] = React.useState(0);

  // Auto-rotate images every 4 seconds
  React.useEffect(() => {
    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % 4);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const goToSlide = (index) => {
    setCurrentSlide(index);
  };

  const previousSlide = () => {
    setCurrentSlide((prev) => (prev - 1 + 4) % 4);
  };

  const nextSlide = () => {
    setCurrentSlide((prev) => (prev + 1) % 4);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
              {/* Rotating Image Carousel */}
        <div className="mb-8">
          <div className="relative h-[600px] overflow-hidden rounded-lg shadow-lg">
            <div 
              className="flex transition-transform duration-1000 ease-in-out" 
              style={{ transform: `translateX(-${currentSlide * 100}%)` }}
            >
              <div className="relative w-full h-[600px] flex-shrink-0">
                <img 
                  src="/soils.jpeg" 
                  alt="Soils Research" 
                  className="w-full h-[600px] object-cover"
                />
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                  <h3 className="text-4xl font-bold text-white/80 text-center">Enhanced Rock Weathering</h3>
                </div>
              </div>
              <div className="relative w-full h-[600px] flex-shrink-0">
                <img 
                  src="/river.png" 
                  alt="River Research" 
                  className="w-full h-[600px] object-cover"
                />
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                  <h3 className="text-4xl font-bold text-white/80 text-center">Connecting Land and Sea</h3>
                </div>
              </div>
              <div className="relative w-full h-[600px] flex-shrink-0">
                <img 
                  src="/coastalocean.png" 
                  alt="Coastal Ocean Research" 
                  className="w-full h-[600px] object-cover"
                />
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                  <h3 className="text-4xl font-bold text-white/80 text-center">Ocean Alkalinity Enhancement</h3>
                </div>
              </div>

              <div className="relative w-full h-[600px] flex-shrink-0">
                <img 
                  src="/atmosphere.png" 
                  alt="Atmosphere Research" 
                  className="w-full h-[600px] object-cover"
                />
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                  <h3 className="text-4xl font-bold text-white/80 text-center">Impacts of a changing climate</h3>
                </div>
              </div>
            </div>
            
            {/* Navigation Dots */}
            <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex space-x-2">
              {[0, 1, 2, 3].map((index) => (
                <button
                  key={index}
                  onClick={() => goToSlide(index)}
                  className={`w-3 h-3 rounded-full transition-colors ${
                    index === currentSlide 
                      ? 'bg-white' 
                      : 'bg-white/70 hover:bg-white/90'
                  }`}
                ></button>
              ))}
            </div>
            
            {/* Previous/Next Buttons */}
            <button
              onClick={previousSlide}
              className="absolute left-4 top-1/2 transform -translate-y-1/2 bg-white/80 hover:bg-white text-gray-800 p-2 rounded-full shadow-lg transition-colors"
            >
              ←
            </button>
            <button
              onClick={nextSlide}
              className="absolute right-4 top-1/2 transform -translate-y-1/2 bg-white/80 hover:bg-white text-gray-800 p-2 rounded-full shadow-lg transition-colors"
            >
              →
            </button>
          </div>
        </div>

        <div className="mb-6 text-center">
          <h2 className="text-3xl font-bold text-gray-800">Welcome to GOAL-A!</h2>
          <p className="text-gray-700 mt-2">Global Ocean and Land Alkalinization (GOAL-A) is a multi-institutional project funded by the Department of Energy. The spreading of silicate rocks across land and sea are being proposed as a natural climate solution that can remove carbon from the atmosphere. We aim to create a system of connected Earth system models designed to track carbon fluxes in land- and ocean-based alkalinization projects.</p>
        </div>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>
        <div className="space-y-6">
          {/* Main Cards - Responsive Grid */}
          <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <div 
                onClick={() => navigate('/research')}
                className="cursor-pointer h-full"
              >
                <Card className="shadow-lg rounded-2xl border border-gray-200 hover:shadow-xl transition h-full flex flex-col overflow-hidden">
                  <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-blue-100 to-white">
                    <h3 className="text-2xl font-bold text-gray-800 tracking-wide">Research</h3>
                  </div>
                  <CardContent className="p-6 flex flex-col flex-grow bg-white">
                    <p className="text-gray-600 mt-2 flex-grow leading-relaxed">
                      Discover our cutting-edge research in enhanced rock weathering, from soils and rivers to coastal oceans and global climate solutions.
                    </p>
                  </CardContent>
                </Card>
              </div>
            </motion.div>
            
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <div 
                onClick={() => navigate('/about')}
                className="cursor-pointer h-full"
              >
                <Card className="shadow-lg rounded-2xl border border-gray-200 hover:shadow-xl transition h-full flex flex-col overflow-hidden">
                  <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-green-100 to-white">
                    <h3 className="text-2xl font-bold text-gray-800 tracking-wide">About</h3>
                  </div>
                  <CardContent className="p-6 flex flex-col flex-grow bg-white">
                    <p className="text-gray-600 mt-2 flex-grow leading-relaxed">
                      Learn about the GOAL-A project, our mission, and the multi-institutional collaboration driving climate solutions.
                    </p>
                  </CardContent>
                </Card>
              </div>
            </motion.div>

            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <div 
                onClick={() => navigate('/opportunities')}
                className="cursor-pointer h-full"
              >
                <Card className="shadow-lg rounded-2xl border border-gray-200 hover:shadow-xl transition h-full flex flex-col overflow-hidden">
                  <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-purple-100 to-white">
                    <h3 className="text-2xl font-bold text-gray-800 tracking-wide">Opportunities</h3>
                  </div>
                  <CardContent className="p-6 flex flex-col flex-grow bg-white">
                    <p className="text-gray-600 mt-2 flex-grow leading-relaxed">
                      Explore opportunities for students, teachers, farmers, academics, funders, and the public to get involved with our work.
                    </p>
                  </CardContent>
                </Card>
              </div>
            </motion.div>

            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <div 
                onClick={() => navigate('/publications')}
                className="cursor-pointer h-full"
              >
                <Card className="shadow-lg rounded-2xl border border-gray-200 hover:shadow-xl transition h-full flex flex-col overflow-hidden">
                  <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-indigo-100 to-white">
                    <h3 className="text-2xl font-bold text-gray-800 tracking-wide">Publications</h3>
                  </div>
                  <CardContent className="p-6 flex flex-col flex-grow bg-white">
                    <p className="text-gray-600 mt-2 flex-grow leading-relaxed">
                      Browse our latest research publications, journal articles, and scientific papers on enhanced rock weathering and climate solutions.
                    </p>
                  </CardContent>
                </Card>
              </div>
            </motion.div>

            {/* Models Card - Only show for authenticated users */}
            {user && (
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <div 
                  onClick={() => navigate('/')}
                  className="cursor-pointer h-full"
                >
                  <Card className="shadow-lg rounded-2xl border border-gray-200 hover:shadow-xl transition h-full flex flex-col overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-orange-100 to-white">
                      <h3 className="text-2xl font-bold text-gray-800 tracking-wide">Models</h3>
                    </div>
                    <CardContent className="p-6 flex flex-col flex-grow bg-white">
                      <p className="text-gray-600 mt-2 flex-grow leading-relaxed">
                        Access our advanced modeling tools and run simulations for enhanced rock weathering research.
                      </p>
                    </CardContent>
                  </Card>
                </div>
              </motion.div>
            )}

            {/* Get Started Card - Only show for non-authenticated users */}
            {!user && (
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <div 
                  onClick={() => navigate('/signup')}
                  className="cursor-pointer h-full"
                >
                  <Card className="shadow-lg rounded-2xl border border-gray-200 hover:shadow-xl transition h-full flex flex-col overflow-hidden">
                  <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-orange-100 to-white">
                    <h3 className="text-2xl font-bold text-gray-800 tracking-wide">Models</h3>
                  </div>
                    <CardContent className="p-6 flex flex-col flex-grow bg-white">
                      <p className="text-gray-600 mt-2 flex-grow leading-relaxed">
                        Sign up to have free access to our advanced modeling tools and run simulations for enhanced rock weathering research.
                      </p>
                    </CardContent>
                  </Card>
                </div>
              </motion.div>
            )}
          </div>
          
        </div>
      </motion.div>
    </div>
  );
}

function HomePage() {
  const navigate = useNavigate();

  // Function to get model-specific colors
  const getModelColors = (modelName) => {
    switch (modelName) {
      case 'SCEPTER':
        return {
          headerBg: 'bg-gradient-to-r from-blue-100 to-blue-50',
          borderColor: 'border-blue-200',
          titleColor: 'text-blue-800'
        };
      case 'ATS':
        return {
          headerBg: 'bg-gradient-to-r from-green-100 to-green-50',
          borderColor: 'border-green-200',
          titleColor: 'text-green-800'
        };
      case 'DRN':
        return {
          headerBg: 'bg-gradient-to-r from-purple-100 to-purple-50',
          borderColor: 'border-purple-200',
          titleColor: 'text-purple-800'
        };
      case 'SCEPTER+DRN':
        return {
          headerBg: 'bg-gradient-to-r from-orange-100 to-orange-50',
          borderColor: 'border-orange-200',
          titleColor: 'text-orange-800'
        };
      default:
        return {
          headerBg: 'bg-gradient-to-r from-blue-100 to-white',
          borderColor: 'border-gray-200',
          titleColor: 'text-gray-800'
        };
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="mb-6">
        <h2 className="text-4xl font-bold text-gray-800 mb-4">GOAL-A Models</h2>
        <p className="text-xl text-gray-600">Select a model to get started with enhanced rock weathering research</p>
      </div>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>
        <div className="space-y-6">
          {/* First row: SCEPTER and ATS */}
          <div className="grid gap-6 grid-cols-1 md:grid-cols-2">
            {models.filter(model => model.name === "SCEPTER" || model.name === "ATS").map((model) => {
              const colors = getModelColors(model.name);
              return (
                <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} key={model.name}>
                  <div 
                    onClick={() => navigate(`/model/${model.name.toLowerCase().replace('+', '-')}`)}
                    className="cursor-pointer h-full"
                  >
                    <Card className={`shadow-lg rounded-2xl border ${colors.borderColor} hover:shadow-xl transition h-full flex flex-col overflow-hidden`}>
                      <div className={`px-6 py-4 border-b ${colors.borderColor} ${colors.headerBg}`}>
                        <h3 className={`text-2xl font-bold ${colors.titleColor} tracking-wide`}>{model.name}</h3>
                      </div>
                      <CardContent className="p-6 flex flex-col flex-grow bg-white">
                        <p className="text-gray-600 mt-2 flex-grow leading-relaxed">{model.description}</p>
                      </CardContent>
                    </Card>
                  </div>
                </motion.div>
              );
            })}
          </div>
          
          {/* Second row: DRN and SCEPTER+DRN */}
          <div className="grid gap-6 grid-cols-1 md:grid-cols-2">
            {models.filter(model => model.name === "DRN" || model.name === "SCEPTER+DRN").map((model) => {
              const colors = getModelColors(model.name);
              return (
                <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} key={model.name}>
                  <div 
                    onClick={() => navigate(`/model/${model.name.toLowerCase().replace('+', '-')}`)}
                    className="cursor-pointer h-full"
                  >
                    <Card className={`shadow-lg rounded-2xl border ${colors.borderColor} hover:shadow-xl transition h-full flex flex-col overflow-hidden`}>
                      <div className={`px-6 py-4 border-b ${colors.borderColor} ${colors.headerBg}`}>
                        <h3 className={`text-2xl font-bold ${colors.titleColor} tracking-wide`}>{model.name}</h3>
                      </div>
                      <CardContent className="p-6 flex flex-col flex-grow bg-white">
                        <p className="text-gray-600 mt-2 flex-grow leading-relaxed">{model.description}</p>
                      </CardContent>
                    </Card>
                  </div>
                </motion.div>
              );
            })}
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
          modelType = 'scepter-drn';
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
  const location = useLocation();
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
          <CardHeader className="text-center pb-8 pt-6 bg-gradient-to-b from-blue-200 via-blue-150 to-white">
            <CardTitle className="text-3xl font-bold text-gray-800">{modelNameUpperCase}</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            {modelNameUpperCase === "DRN" ? 
              <DRNConfig savedData={savedModelData} />
             : modelNameUpperCase === "ATS" ? 
              <ATSConfig savedData={savedModelData} /> 
             : modelNameUpperCase === "SCEPTER" ?
              <SCEPTERConfig savedData={savedModelData} />
             : modelNameUpperCase === "SCEPTER-DRN" ?
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