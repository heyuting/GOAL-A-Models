import React, { useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { usgsSites } from '@/data/usgsSites';
import 'leaflet/dist/leaflet.css';

export default function SCEPTERConfig() {
  const [location, setLocation] = useState('');
  const [feedstock, setFeedstock] = useState('');
  const [particleSize, setParticleSize] = useState('');
  const [applicationRate, setApplicationRate] = useState('');
  const [targetPH, setTargetPH] = useState('');
  const [selectedSite, setSelectedSite] = useState(null);
  const [isPickingPoint, setIsPickingPoint] = useState(false);
  const [selectedPoint, setSelectedPoint] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedWaterFlux, setEditedWaterFlux] = useState(0);
  const [editedAlkalinity, setEditedAlkalinity] = useState(0);
  const [editedTemperature, setEditedTemperature] = useState(0);

  const handleRunModel = async (e) => {
    e.preventDefault();
    const data = new FormData();
    data.append('location', location);
    data.append('feedstock', feedstock);
    data.append('particleSize', particleSize);
    data.append('applicationRate', applicationRate);
    data.append('targetPH', targetPH);
    await fetch('/api/run-scepter', {
      method: 'POST',
      body: data,
    });
  };

  const handleSiteSelect = (siteId) => {
    const site = usgsSites.find(s => s.id === siteId);
    setSelectedSite(site);
    setLocation(siteId);
    if (site) {
      setSelectedPoint({ lat: site.lat, lng: site.lon });
    }
  };

  const handlePickPointClick = () => {
    setIsPickingPoint(true);
  };

  function MapClickHandler() {
    useMapEvents({
      click: (e) => {
        if (isPickingPoint) {
          setSelectedPoint(e.latlng);
          setLocation(`${e.latlng.lat.toFixed(4)},${e.latlng.lng.toFixed(4)}`);
          setIsPickingPoint(false);
        }
      },
    });
    return null;
  }

  const handleEditParameters = () => {
    setEditedWaterFlux(selectedSite?.waterFlux || 0);
    setEditedAlkalinity(selectedSite?.alkalinity || 0);
    setEditedTemperature(selectedSite?.temperature || 0);
    setIsEditing(true);
  };

  const handleSaveParameters = () => {
    setSelectedSite(prev => ({
      ...prev,
      waterFlux: editedWaterFlux,
      alkalinity: editedAlkalinity,
      temperature: editedTemperature
    }));
    setIsEditing(false);
  };

  return (
    <div>
      <div className="flex gap-6">
        <div className="w-3/5">
          <h2 className="text-xl font-bold text-center mb-6 text-gray-800">Area of Interest</h2>
          <div className="mt-6">
            <MapContainer center={[39.8283, -98.5795]} zoom={4} style={{ height: '500px', width: '100%' }}>
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; OpenStreetMap contributors'
              />
              <MapClickHandler />
              {selectedPoint && (
                <Marker position={selectedPoint}>
                  <Popup>
                    Selected Location<br />
                    Lat: {selectedPoint.lat.toFixed(4)}<br />
                    Lng: {selectedPoint.lng.toFixed(4)}
                  </Popup>
                </Marker>
              )}
            </MapContainer>
          </div>
        </div>

        <div className="w-2/5">
          <h2 className="text-xl font-bold text-center mb-6 text-gray-800">Simulation Settings</h2>
          <Card className="mt-5 rounded-2xl shadow-lg p-6">
            <CardContent className="space-y-6">
              <form onSubmit={handleRunModel} className="space-y-6">
                {/* Location Selection */}
                <div className="bg-white p-4 rounded-2xl shadow-md">
                  <h2 className="text-xl font-bold mb-2">1. Select Location</h2>
                  <Button 
                    type="button"
                    className={`w-full ${isPickingPoint ? 'bg-gray-400 hover:bg-gray-500' : 'bg-blue-500 hover:bg-blue-600'} text-white py-2 rounded-xl`}
                    onClick={handlePickPointClick}
                  >
                    {isPickingPoint ? 'Click on Map to Select Point' : 'Pick a Point on Map'}
                  </Button>
                  <p className="text-center my-2">or</p>
                  <select
                    className="w-full border rounded-xl p-2"
                    value={location}
                    onChange={(e) => handleSiteSelect(e.target.value)}
                  >
                    <option value="" disabled>Choose USGS Site</option>
                    {usgsSites.map(site => (
                      <option key={site.id} value={site.id}>{site.name}</option>
                    ))}
                  </select>
                </div>

                {/* Boundary Conditions Preview */}
                <div className="bg-white p-4 rounded-2xl shadow-md">
                  <h2 className="text-xl font-bold mb-2">2. Boundary Conditions</h2>
                  {isEditing ? (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="waterFlux">Water Flux (m/day)</Label>
                        <Input
                          id="waterFlux"
                          type="number"
                          step="0.01"
                          value={editedWaterFlux}
                          onChange={(e) => setEditedWaterFlux(parseFloat(e.target.value))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="alkalinity">Alkalinity (mg/L)</Label>
                        <Input
                          id="alkalinity"
                          type="number"
                          step="0.01"
                          value={editedAlkalinity}
                          onChange={(e) => setEditedAlkalinity(parseFloat(e.target.value))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="temperature">Temperature (°C)</Label>
                        <Input
                          id="temperature"
                          type="number"
                          step="0.1"
                          value={editedTemperature}
                          onChange={(e) => setEditedTemperature(parseFloat(e.target.value))}
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button 
                          type="button"
                          variant="outline" 
                          onClick={() => setIsEditing(false)}
                          className="flex-1"
                        >
                          Cancel
                        </Button>
                        <Button 
                          type="button"
                          onClick={handleSaveParameters}
                          className="flex-1 bg-green-500 hover:bg-green-600"
                        >
                          Save
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <ul className="text-sm list-disc list-inside">
                        <li>Water Flux: {selectedSite?.waterFlux || 0} m/day</li>
                        <li>Alkalinity: {selectedSite?.alkalinity || 0} mg/L</li>
                        <li>Temperature: {selectedSite?.temperature || 0}°C</li>
                      </ul>
                      <Button 
                        className="mt-2 w-full bg-green-500 hover:bg-green-600 text-white py-2 rounded-xl"
                        disabled={!selectedPoint && !selectedSite}
                        onClick={handleEditParameters}
                        type="button"
                      >
                        Edit Parameters
                      </Button>
                    </>
                  )}
                </div>

                {/* Practice Variables */}
                <div className="bg-white p-4 rounded-2xl shadow-md">
                  <h2 className="text-xl font-bold mb-2">3. Set Practice Variables</h2>
                  <Label className="block mb-2">Feedstock Type</Label>
                  <select
                    className="w-full border rounded-xl p-2 mb-4"
                    value={feedstock}
                    onChange={(e) => setFeedstock(e.target.value)}
                  >
                    <option value="" disabled>Choose Feedstock</option>
                    <option value="Basalt">Basalt</option>
                    <option value="Olivine">Olivine</option>
                    <option value="Custom">Custom...</option>
                  </select>

                  <Label className="block mb-2">Particle Size (microns)</Label>
                  <Input
                    type="number"
                    className="w-full border rounded-xl p-2 mb-4"
                    placeholder="Enter mean radius"
                    value={particleSize}
                    onChange={(e) => setParticleSize(e.target.value)}
                  />

                  <Label className="block mb-2">Application Rate (kg/m²/year)</Label>
                  <Input
                    type="number"
                    className="w-full border rounded-xl p-2 mb-4"
                    placeholder="Enter rate"
                    value={applicationRate}
                    onChange={(e) => setApplicationRate(e.target.value)}
                  />

                  <Label className="block mb-2">Target Soil pH (optional)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    className="w-full border rounded-xl p-2"
                    placeholder="Enter target pH"
                    value={targetPH}
                    onChange={(e) => setTargetPH(e.target.value)}
                  />
                </div>

                {/* Run Button */}
                <Button
                  type="submit"
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white py-3 rounded-2xl text-lg font-semibold mt-4"
                >
                  Run SCEPTER Model
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
    

