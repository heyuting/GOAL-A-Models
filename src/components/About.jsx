import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

function About() {
  return (
    <div 
      className="min-h-screen bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: 'url(/bgimage.jpeg)' }}
    >
      <div className="bg-white/90 min-h-screen">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="mb-8">
            <h1 className="text-4xl font-bold text-gray-800 mb-4">About GOAL-A</h1>
            <p className="text-xl text-gray-600">
              Global Ocean and Land Alkanization - Creating the first fully connected global model for climate solutions
            </p>
          </div>
          
          {/* Hero Image - Above all cards */}
          <div className="mb-8 text-center">
            <img 
              src="/goalaimage.jpeg" 
              alt="GOAL-A Project" 
              className="w-full max-w-4xl mx-auto rounded-lg shadow-lg"
            />
          </div>

      {/* Mission Statement */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-blue-600">
            Our Mission
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-700 leading-relaxed text-lg">
            The goal of the project is to create the first fully connected global model to focus on global alkalinization. 
            The modeling efforts will center on improving models in a number of "domains", including soils, streams and rivers, 
            the near coast, and the open ocean that our collective group has been working on independently. However, by working 
            together to fuse these modeling efforts we will be able to link key cross-domain boundary fluxes and answer 
            cross-domain questions that currently cannot be approached.
          </p>
          <p className="text-gray-700 leading-relaxed mt-4">
            We will also use higher resolution models within the soil and ocean domains to evaluate how coarse global models 
            perform. Our researchers are also working on the ground to deploy enhanced weathering field trials on agricultural 
            soils to study the carbon and crop benefits, test monitoring methods, and widen adoption of the cutting edge 
            climate solution. This work is paired with a suite of outreach and education programs for youths, higher education 
            students, and agricultural practitioners.
          </p>
        </CardContent>
      </Card>

      {/* Project Summary */}
      <Card className="mb-12">
        <CardHeader>
          <CardTitle className="text-3xl font-bold text-purple-600">
            Project Summary
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="prose max-w-none">
            <p className="text-gray-700 leading-relaxed">
              Atmospheric CO₂ concentrations and climate state are regulated by the global carbon cycle. 
              A key component of the global carbon cycle is the conversion of solid minerals and atmospheric 
              CO₂ to bicarbonate through the process of chemical weathering. Dissolved bicarbonate from 
              chemical weathering is then transported by rivers to the global ocean, where it joins a massive 
              pool of dissolved inorganic carbon.
            </p>
            
            <p className="text-gray-700 leading-relaxed">
              On millennial time scales bicarbonate from terrestrial chemical weathering builds up in the 
              ocean leading to the precipitation of bicarbonate back to a solid carbonate mineral. This 
              cycling of inorganic carbon is closely tied to the global water cycle, as water evaporates 
              off the surface oceans, is delivered to continents as rainfall, and is then sent back to 
              the ocean with the products of chemical weathering via rivers.
            </p>
            
            <p className="text-gray-700 leading-relaxed">
              A number of negative emissions technologies propose to accelerate the conversion of atmospheric 
              CO₂ to bicarbonate on land by spreading weatherable minerals across the land surface, referred 
              to as enhanced rock weathering (ERW), or to catalyze the uptake of CO₂ from the atmosphere 
              to the surface ocean through modification of surface ocean chemistry, referred to as ocean 
              alkalinity enhancement (OAE).
            </p>
            
            <p className="text-gray-700 leading-relaxed">
              These potential negative emissions technologies hold significant promise, with current estimates 
              indicating that they could sequester 10's of gigatons (Gt = 10⁹ tons) of CO₂ per year. 
              They are also very durable compared to most other negative emissions technologies, as they 
              mix into a very large pool of ocean alkalinity, with most estimates of durability being 
              exceeding thousands of years.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Our Models */}
      <Card className="mb-12">
        <CardHeader>
          <CardTitle className="text-3xl font-bold text-orange-600">
            Our Models
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-6 border-l-4 border-blue-500 bg-blue-50 rounded-r-lg">
              <h3 className="text-xl font-semibold text-gray-800 mb-2">DRN Model</h3>
              <p className="text-gray-600 mb-3">
                Distributed Rock Network model for simulating rock weathering processes 
                across complex landscapes and soil systems.
              </p>
              <span className="inline-block bg-blue-200 text-blue-800 px-3 py-1 rounded-full text-sm font-medium">
                Carbon Sequestration
              </span>
            </div>
            
            <div className="p-6 border-l-4 border-green-500 bg-green-50 rounded-r-lg">
              <h3 className="text-xl font-semibold text-gray-800 mb-2">SCEPTER Model</h3>
              <p className="text-gray-600 mb-3">
                Soil Carbon Enhancement and Plant Terrestrial Ecosystem Response model 
                for agricultural applications and crop yield optimization.
              </p>
              <span className="inline-block bg-green-200 text-green-800 px-3 py-1 rounded-full text-sm font-medium">
                Agricultural Focus
              </span>
            </div>
            
            <div className="p-6 border-l-4 border-purple-500 bg-purple-50 rounded-r-lg">
              <h3 className="text-xl font-semibold text-gray-800 mb-2">ATS Model</h3>
              <p className="text-gray-600 mb-3">
                Advanced Terrestrial System model integrating multiple environmental 
                factors for comprehensive ecosystem analysis.
              </p>
              <span className="inline-block bg-purple-200 text-purple-800 px-3 py-1 rounded-full text-sm font-medium">
                Ecosystem Analysis
              </span>
            </div>
            
            <div className="p-6 border-l-4 border-orange-500 bg-orange-50 rounded-r-lg">
              <h3 className="text-xl font-semibold text-gray-800 mb-2">SCEPTER+DRN</h3>
              <p className="text-gray-600 mb-3">
                Integrated model combining agricultural and landscape-scale processes 
                for comprehensive ERW assessment and optimization.
              </p>
              <span className="inline-block bg-orange-200 text-orange-800 px-3 py-1 rounded-full text-sm font-medium">
                Integrated Approach
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Our Organization */}
      <Card className="mb-12">
        <CardHeader>
          <CardTitle className="text-3xl font-bold text-indigo-600">
            Our Organization
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <div className="p-6 bg-blue-50 rounded-lg border-l-4 border-blue-500">
              <h3 className="text-xl font-semibold text-gray-800 mb-3">
                Multi-Institutional Collaboration
              </h3>
              <p className="text-gray-700 leading-relaxed">
                Global Ocean and Land Alkanization (GOAL-A) is a multi-institutional collaboration that includes 
                professors, research staff, postdoctoral scholars, and students from:
              </p>
              <ul className="list-disc list-inside mt-3 space-y-1 text-gray-700">
                <li>Yale University</li>
                <li>Princeton University</li>
                <li>Georgia Institute of Technology</li>
                <li>Texas A&M University</li>
              </ul>
            </div>
            
            <div className="p-6 bg-green-50 rounded-lg border-l-4 border-green-500">
              <h3 className="text-xl font-semibold text-gray-800 mb-3">
                Institutional Support
              </h3>
              <p className="text-gray-700 leading-relaxed">
                GOAL-A is run out of the Yale Center for Natural Carbon Capture and is supported by:
              </p>
              <ul className="list-disc list-inside mt-3 space-y-1 text-gray-700">
                <li>Department of Defense</li>
                <li>Google</li>
                <li>United States Department of Agriculture</li>
              </ul>
            </div>
            
            <div className="p-6 bg-purple-50 rounded-lg border-l-4 border-purple-500">
              <h3 className="text-xl font-semibold text-gray-800 mb-3">
                Research Focus
              </h3>
              <p className="text-gray-700 leading-relaxed">
                Our researchers are working on the ground to deploy enhanced weathering field trials on 
                agricultural soils to study the carbon and crop benefits, test monitoring methods, and 
                widen adoption of the cutting edge climate solution. This work is paired with a suite 
                of outreach and education programs for youths, higher education students, and agricultural practitioners.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Contact & Get Involved */}
      <div className="text-center">
        <Card className="bg-gradient-to-r from-blue-50 to-green-50 border-blue-200">
          <CardContent className="py-8">
            <h3 className="text-2xl font-bold text-gray-800 mb-4">
              Contact GOAL-A
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="text-left px-24">
                <h4 className="font-semibold text-gray-800 mb-3">Contact Information</h4>
                <p className="text-gray-800 mb-2">Phone: 203-432-6216</p>
                <p className="text-gray-800 mb-2">Address: 195 Prospect Street<br />New Haven, CT, 06511</p>
              </div>
              <div className="text-left px-24">
                <h4 className="font-semibold text-gray-800 mb-3">Website</h4>
                <p className="text-gray-600 mb-2">
                  For more information, visit our website: 
                  <p>
                    <a 
                        href="https://mayaalmaraz6.wixsite.com/goala/about" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 underline ml-2"
                    >
                        mayaalmaraz6.wixsite.com/goala
                    </a>
                  </p>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
        </div>
      </div>
    </div>
  );
}

export default About;
