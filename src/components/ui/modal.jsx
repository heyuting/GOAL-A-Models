import React, { useState } from 'react';
import { Button } from '@/components/ui/button';  
import { Input } from '@/components/ui/input';
const Modal = ({ isOpen, onClose, onAddLayer }) => {
    const [newLayerName, setNewLayerName] = useState('');
  
    // Handle the change in the layer name input
    const handleInputChange = (e) => {
      setNewLayerName(e.target.value);
    };
  
    // Handle Add Layer button click
    const handleAddClick = () => {
      if (newLayerName.trim()) {
        onAddLayer(newLayerName);  // Add the new layer
        setNewLayerName('');        // Clear the input field
        onClose();                  // Close the modal after adding the layer
      }
    };
  
    // If modal is not open, return null
    if (!isOpen) return null;
  
    return (
     <div className="fixed inset-0 flex items-center justify-center z-50">

      <div className="absolute inset-0 bg-black opacity-30"> </div>

        <div className="bg-white p-6 rounded-lg shadow-lg w-1/3 z-10">
          <h3 className="text-xl mb-4">Enter Layer Name</h3>
          <Input
            type="text"
            value={newLayerName}
            onChange={handleInputChange}
            className="w-full p-2 mb-4 border rounded"
            placeholder="Enter layer name"
          />
          <div className="flex justify-between">
            <Button
              type="button"
              className="bg-blue-500 text-white"
              onClick={handleAddClick}
            >
              Add Layer
            </Button>
            <Button
              type="button"
              className="bg-red-500 text-white"
              onClick={onClose}
            >
              Cancel
            </Button>
          </div>
        </div>
      </div>
    );
  };
  
  export default Modal; // Default export