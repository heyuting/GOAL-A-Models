import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

function Research() {
  const navigate = useNavigate();
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-gray-800 mb-4">Research</h1>
        <p className="text-xl text-gray-600">
          Our Domains - Advancing climate solutions through enhanced rock weathering research and modeling
        </p>
      </div>

      {/* Research Domains */}
      <div className="space-y-12 mb-12">
        {/* Soils Domain */}
        <div className="w-full">
          <Card className="h-full">
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-stretch">
                <div className="flex flex-col h-full px-12 justify-between">
                <div className="mb-10">
                  <h2 className="text-3xl font-bold text-blue-600 mb-2">Soils</h2>
                  <div className="w-16 h-1 bg-blue-600 rounded-full"></div>
                </div>
                  <div className="flex-1 flex flex-col justify-center">
                    <p className="text-gray-700 leading-relaxed">
                    We will utilize SCEPTER (Soil Cycles of Elements simulator for Predicting TERrestrial regulation of greenhouse gasses; (Kanzaki et al., 2022)) – a 1-D reaction transport model developed by our team and designed to simulate weathering processes (dissolution/precipitation, erosion, advection/diffusion), agricultural practices (addition of organic matter and mineral feed stocks), and mixing regimes – to understand how future ERW/Climate scenarios impact weathering rates, atmospheric CO₂ consumption in the field and the production of weathering products that are transported to streams. We will augment DOE’s Advanced Terrestrial Simulator (ATS) with processes SCEPTER has demonstrated to be important for weathering. Utilizing ATS will also allow us to move to a 2-D profile to test how mixing of water along different flow paths impacts reaction rates and delivery of weathering products to inland waters. We will perform these tests in a number of test Mississippi River watersheds with long-term data and a history of liming (Oh and Raymond, 2006) and begin to incorporate this new knowledge into SCEPTER/ATS.
                    </p>
                  </div>
                  <button 
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors text-sm mt-8"
                    onClick={() => navigate('/opportunities')}
                  >
                    Get Involved
                  </button>
                </div>
                <div className="h-full">
                  <img 
                    src="/soils2.jpeg" 
                    alt="Harvesting Crop Field - Enhanced Rock Weathering in Agricultural Soils"
                    className="w-full h-full object-cover rounded-lg shadow-md"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Rivers Domain */}
        <div className="w-full">
          <Card className="h-full">
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-stretch">
                <div className="h-full">
                  <img 
                    src="/river.png" 
                    alt="River Network - Transport of Weathering Products to Coastal Ocean"
                    className="w-full h-full object-cover rounded-lg shadow-md"
                  />
                </div>
                <div className="flex flex-col h-full px-12 pt-12 justify-between">
                  <div className="mb-10">
                    <h2 className="text-3xl font-bold text-green-600 mb-2">Rivers</h2>
                    <div className="w-16 h-1 bg-green-600 rounded-full"></div>
                  </div>
                  <div className="flex-1 flex flex-col justify-center"><p className="text-gray-700 leading-relaxed">
                  Weathering products will be passed from soils to drainage networks. We will expand previous river network models developed by our team in order to simulate alterations in water chemistry within rivers and connected reservoir systems during transport of captured alkalinity to the coastal ocean. The outputs of the soil and flowpath (SCEPTER/ATS) model, specifically the fluxes of cations and anions, will be integrated into our dynamic river-reservoir network (DRRN) model to track the transport dynamics and transformations of ERW products within river and reservoir systems. We will quantify carbon leakage and carbonate precipitation across all downstream river reservoir segments. The fluxes of crucial species, such as alkalinity, dissolved inorganic carbon, calcium, and magnesium at river outlets will be passed to the ocean models.
                  </p></div>
                  <button 
                    className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors text-sm mt-8"
                    onClick={() => navigate('/opportunities')}
                  >
                    Get Involved
                  </button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Additional Research Domains */}
      <div className="space-y-12 mb-12">
        {/* Coastal Oceans Domain */}
        <div className="w-full">
          <Card className="h-full">
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-stretch">
                <div className="flex flex-col h-full px-12 pt-12 justify-between">
                  <div className="mb-10">
                    <h2 className="text-3xl font-bold text-purple-600 mb-2">Coastal Oceans</h2>
                    <div className="w-16 h-1 bg-purple-600 rounded-full"></div>
                  </div>
                  <div className="flex-1 flex flex-col justify-center"><p className="text-gray-700 leading-relaxed">
                  We will determine the fate of alkalinity from ERW and OAE in coastal regions, quantify carbon transport to the open ocean, and evaluate the efficiency of these approaches (when implemented separately or simultaneously) at sequestering carbon on decadal and multi-decadal timescales. We will use a suite of regional ocean biogeochemical models (MOM6-COBALT, CROCO-ROMS, MITgcm, and E3SM), designed to resolve key CO₂ dynamics and river loadings in a high-resolution regional configuration of the northwest Atlantic (including the Gulf of Mexico and northeast US).                  </p></div>
                  <button 
                    className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors text-sm mt-8"
                    onClick={() => navigate('/opportunities')}
                  >
                    Get Involved
                  </button>
                </div>
                <div className="h-full">
                  <img 
                    src="/coastalocean2.png" 
                    alt="Coastal Ocean - Regional Ocean Biogeochemical Modeling"
                    className="w-full h-full object-cover rounded-lg shadow-md"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Global Oceans Domain */}
        <div className="w-full">
          <Card className="h-full">
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-stretch">
                <div className="h-full">
                  <img 
                    src="/globalocean.png" 
                    alt="Earth from Space - Global Ocean Circulation and Biogeochemical Models"
                    className="w-full h-full object-cover rounded-lg shadow-md"
                  />
                </div>
                <div className="flex flex-col h-full px-12 pt-12 justify-between">
                  <div className="mb-10">
                    <h2 className="text-3xl font-bold text-orange-600 mb-2">Global Oceans</h2>
                    <div className="w-16 h-1 bg-orange-600 rounded-full"></div>
                  </div>
                  <div className="flex-1 flex flex-col justify-center"><p className="text-gray-700 leading-relaxed">
                  We will examine the eventual fate of added alkalinity in the open oceans to determine how global alkalinization interacts with anthropogenic atmospheric CO₂ emissions and determine global ocean chemistry and storage timescales for CO₂. We will use a suite of global ocean circulation and biogeochemical models and explore multiple modes of regional-global model coupling, including multiple grid resolutions in the MOM6-COBALT model, MITgcm, and the ocean component of the DOE Earth system model (E3SM). This will allow us to assess the ultimate fate of anthropogenic alkalinity on the global scale and to evaluate structural uncertainty in alkalinity tracking across state-of-the-art ocean biogeochemical models.
                  </p></div>

                  <button 
                    className="bg-orange-600 text-white px-4 py-2 rounded-lg hover:bg-orange-700 transition-colors text-sm mt-8"
                    onClick={() => navigate('/opportunities')}
                  >
                    Get Involved
                  </button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Atmosphere and Watershed Studies */}
      <div className="space-y-12 mb-12">
        {/* Atmosphere Domain */}
        <div className="w-full">
          <Card className="h-full">
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-stretch">
                <div className="flex flex-col h-full px-12 pt-12 justify-between">
                  <div className="mb-10">
                    <h2 className="text-3xl font-bold text-indigo-600 mb-2">Atmosphere</h2>
                    <div className="w-16 h-1 bg-indigo-600 rounded-full"></div>
                  </div>
                  <div className="flex-1 flex flex-col justify-center">
                    <p className="text-gray-700 leading-relaxed">
                    In order to determine how global hydrology impacts the production and delivery of weathering products we will utilize GCMs to estimate how changes in moisture transport to global drainage basins change precipitation event statistics and alter natural and enhanced weathering and shape the delivery of water and alkalinity to global coastal zones. Specifically, we will use atmospheric simulations of historical and future climate (as available) from multi-member ensembles of the Energy Exascale Earth System Model (E3SM), the Community Earth System Model (CESM), and the Geophysical Fluid Dynamics Laboratory model (GFDL) at varying output frequencies to characterize the influence of spatiotemporal variability and its changes under climate change.
                    </p>
                  </div>
                  <button 
                    className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors text-sm mb-8"
                    onClick={() => navigate('/opportunities')}
                  >
                    Get Involved
                  </button>
                </div>
                <div className="h-full">
                  <img 
                    src="/atmosphere.jpeg" 
                    alt="Atmospheric Clouds - Global Climate Models and Hydrology Studies"
                    className="w-full h-full object-cover rounded-lg shadow-md"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Watershed Studies */}
        <div className="w-full">
          <Card className="h-full">
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-stretch">
                <div className="h-full">
                  <img 
                    src="/watershed.jpeg" 
                    alt="Watershed Studies - Vermont Agricultural Watershed with Silicate Rock Applications"
                    className="w-full h-full object-cover rounded-lg shadow-md"
                  />
                </div>
                <div className="flex flex-col h-full px-12 pt-12 justify-between">
                  <div className="mb-10">
                    <h2 className="text-3xl font-bold text-teal-600 mb-2">Watershed Studies</h2>
                    <div className="w-16 h-1 bg-teal-600 rounded-full"></div>
                  </div>
                  <div className="flex-1 flex flex-col justify-between">
                  <p className="text-gray-700 leading-relaxed">
                  We have applied silicate rock dust to an agricultural watershed in Vermont and measured changes in alkalinity from a stream to understand how soil applications can affect river chemistry. We are currently conducting community outreach to recruit more farmers interested in using the practice and helping us to study the science and crop benefits of enhanced rock weathering.
                  </p>
                  <button 
                    className="bg-teal-600 text-white px-4 py-2 rounded-lg hover:bg-teal-700 transition-colors text-sm mt-8"
                    onClick={() => navigate('/opportunities')}
                  >
                    Get Involved
                  </button>
                </div>
              </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

        {/* Agricultural Studies and Broader Impacts */}
        <div className="space-y-12 mb-12">
                    {/* Agricultural Studies */}
          <div className="w-full">
            <Card className="h-full">
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-stretch">
                  <div className="flex flex-col h-full px-12 pt-12 justify-between">
                    <div className="mb-10">
                      <h2 className="text-3xl font-bold text-purple-600 mb-2">Agricultural Studies</h2>
                      <div className="w-16 h-1 bg-purple-600 rounded-full"></div>
                    </div>
                    <div className="flex-1 flex flex-col justify-between">
                    <p className="text-gray-700 leading-relaxed">
                      Through a USDA commodities grant, our researchers are working to deploy silicate rocks throughout 
                      agricultural sites in the midwest, northeast, and southeast US.
                    </p>
                    </div>
                    <button 
                      className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors text-sm mt-8"
                      onClick={() => navigate('/opportunities')}
                    >
                      Get Involved
                    </button>
                  </div>
                  <div className="h-full">
                    <img 
                      src="/agricultural.jpeg" 
                      alt="Agricultural Studies - Silicate Rock Deployment in Agricultural Sites"
                      className="w-full h-full object-cover rounded-lg shadow-md"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Broader Impacts */}
          <div className="w-full">
            <Card className="h-full">
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-stretch">
                  <div className="h-full">
                    <img 
                      src="/broaderimpact.jpeg" 
                      alt="Broader Impacts - Education, Outreach, and Community Engagement Programs"
                      className="w-full h-full object-cover rounded-lg shadow-md"
                    />
                  </div>
                  <div className="flex flex-col h-full px-12 pt-12 justify-between">
                    <div className="mb-10">
                      <h2 className="text-3xl font-bold text-orange-600 mb-2">Broader Impacts</h2>
                      <div className="w-16 h-1 bg-orange-600 rounded-full"></div>
                    </div>
                    <div className="flex-1 flex flex-col justify-between">
                    <p className="text-gray-700 leading-relaxed">
                    We are pursuing a variety of activities under the umbrella of outreach, education, and community engagement. We support students as part of Yale School of the Environment’s Environmental Fellow program, which is a summer fellowship opportunity for aspiring masters and doctoral students from historically underrepresented groups. We host summer workshops with the New Haven Teachers Institute working with K-12 teachers to build content at schools with a high proportion of students from low-income and minority families. We run a week-long summer educational program QUEST (Questioning Underlies Effective Science Teaching) on Climate Change: Exploring Solutions to a Complex Problem for middle and high school teachers. We host New Haven Promise summer interns which aims to strengthen academic skills and career preparedness for marginalized undergraduate students. And we offer educational opportunities to the public, including a free and virtual lecture series on enhanced rock weathering that will be offered through the Yale School of the Environment in Spring of 2025.
                    </p>
                    <button 
                      className="bg-orange-600 text-white px-4 py-2 rounded-lg hover:bg-orange-700 transition-colors text-sm mt-8"
                      onClick={() => navigate('/opportunities')}
                    >
                      Get Involved
                    </button>
                  </div>
                 </div> 
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

      {/* Call to Action */}
      <div className="mt-12 text-center">
        <Card className="bg-gradient-to-r from-blue-50 to-green-50 border-blue-200">
          <CardContent className="py-8">
            <h2 className="text-2xl font-bold text-gray-800 mb-4">
              Get Involved in GOAL-A Research
            </h2>
            <p className="text-gray-600 mb-10">
              Interested in collaborating or learning more about our research domains? 
              We welcome partnerships and inquiries from the scientific community, 
              agricultural practitioners, and educational institutions.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-between">
              <button 
                className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors font-semibold"
                onClick={() => navigate('/opportunities')}
              >
                Contact Research Team
              </button>
              <button 
                className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors font-semibold"
                onClick={() => navigate('/about')}
              >
                Learn More About Programs
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default Research;
