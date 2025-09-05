import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

function Opportunities() {
  const handleExternalLink = (url) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleEmailLink = (email, subject) => {
    window.open(`mailto:${email}?subject=${encodeURIComponent(subject)}`, '_blank');
  };
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-gray-800 mb-4">Opportunities</h1>
        <p className="text-xl text-gray-600">
          We have a variety of opportunities for students, teachers, farmers, academics, funders, and the public to get involved with our work.
        </p>
      </div>

      {/* Opportunities Grid - Three Columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
        {/* Postdocs & Grad Students */}
        <Card className="h-full">
          <div className="h-64 overflow-hidden">
            <img 
              src="/Graduation_Day.png" 
              alt="Graduation Day - Postdocs and Graduate Students"
              className="w-full h-full object-cover"
            />
          </div>
          <CardContent className="p-6">
            <h2 className="text-2xl font-bold text-blue-600 mb-2">Postdocs & Grad Students</h2>
            <div className="w-12 h-1 bg-blue-600 rounded-full mb-4"></div>
            <p className="text-gray-700 leading-relaxed mb-4">
              Click <span> </span> 
              <span 
                className="text-blue-600 hover:text-blue-800 underline cursor-pointer"
                onClick={() => handleExternalLink('https://postdocs.yale.edu/applicants/open-positions')}
              >
                here
              </span> to apply to open postdoctoral positions. For graduate students who are interested in working on the project, please contact PIs you are interested in working with directly.
            </p>
          </CardContent>
        </Card>

        {/* Environmental Fellows */}
        <Card className="h-full">
          <div className="h-64 overflow-hidden">
            <img 
              src="/Garbage_Recycling.png" 
              alt="Garbage Recycling - Environmental Fellows Program"
              className="w-full h-full object-cover"
            />
          </div>
          <CardContent className="p-6">
            <h2 className="text-2xl font-bold text-green-600 mb-2">Environmental Fellows</h2>
            <div className="w-12 h-1 bg-green-600 rounded-full mb-4"></div>
            <p className="text-gray-700 leading-relaxed mb-4">
              We host Yale graduate students each summer through the Environmental Fellows Program. Please see their <span 
                className="text-green-600 hover:text-green-800 underline cursor-pointer"
                onClick={() => handleExternalLink('https://environment.yale.edu/students/environmental-fellows-program')}
              >
                 website 
              </span> for more details.
            </p>
          </CardContent>
        </Card>

        {/* New Haven Promise */}
        <Card className="h-full">
          <div className="h-64 overflow-hidden">
            <img 
              src="/Female_Student.png" 
              alt="Female Student - New Haven Promise"
              className="w-full h-full object-cover"
            />
          </div>
          <CardContent className="p-6">
            <h2 className="text-2xl font-bold text-purple-600 mb-2">New Haven Promise</h2>
            <div className="w-12 h-1 bg-purple-600 rounded-full mb-4"></div>
            <p className="text-gray-700 leading-relaxed mb-4">
              We employ local summer interns through New Haven Promise program, which gives local undergraduates job skills and experience.  Click <span 
                className="text-purple-600 hover:text-purple-800 underline cursor-pointer"
                onClick={() => handleExternalLink('https://newhavenpromise.org/')}
              >
               here
              </span> to learn more.
            </p>
          </CardContent>
        </Card>

        {/* Teachers Institute */}
        <Card className="h-full">
          <div className="h-64 overflow-hidden">
            <img 
              src="/Discussion_Between_Students.png" 
              alt="Discussion Between Students - Teachers Institute"
              className="w-full object-cover"
            />
          </div>
          <CardContent className="p-6">
            <h2 className="text-2xl font-bold text-orange-600 mb-2">Teachers Institute</h2>
            <div className="w-12 h-1 bg-orange-600 rounded-full mb-4"></div>
            <p className="text-gray-700 leading-relaxed mb-4">
              We train teachers on climate change science through the Yale-New Haven Teachers Institute. If you are a teacher interested in participating in the workshop please visit their <span 
                className="text-orange-600 hover:text-orange-800 underline cursor-pointer"
                onClick={() => handleExternalLink('https://teachers.yale.edu/')}
              >
                website
              </span>.
            </p>
          </CardContent>
        </Card>

        {/* QUEST */}
        <Card className="h-full">
          <div className="h-64 overflow-hidden">
            <img 
              src="/Teacher.png" 
              alt="Teacher - QUEST Program"
              className=" w-full object-cover"
            />
          </div>
          <CardContent className="p-6">
            <h2 className="text-2xl font-bold text-red-600 mb-2">QUEST</h2>
            <div className="w-12 h-1 bg-red-600 rounded-full mb-4"></div>
            <p className="text-gray-700 leading-relaxed mb-4">
              We train teachers on climate change science through "Questioning Underlies Effective Science Teaching" at Princeton. If you are a teacher who is interested please contact <span 
                className="text-red-600 hover:text-red-800 underline cursor-pointer"
                onClick={() => handleEmailLink('lresplan@princeton.edu', 'QUEST Program Interest')}
              >
                Dr. Resplandy
              </span>.
            </p>
          </CardContent>
        </Card>

        {/* ERW Public Forum */}
        <Card className="h-full">
          <div className="h-64 overflow-hidden">
            <img 
              src="/conference2.jpeg" 
              alt="Giving a Lecture - ERW Public Forum"
              className="w-full h-full object-cover"
            />
          </div>
          <CardContent className="p-6">
            <h2 className="text-2xl font-bold text-indigo-600 mb-2">ERW Public Forum</h2>
            <div className="w-12 h-1 bg-indigo-600 rounded-full mb-4"></div>
            <p className="text-gray-700 leading-relaxed mb-4">
              We hosted a virtual public forum education series on enhanced rock weathering through Yale University spring of 2025. Click <span 
                className="text-indigo-600 hover:text-indigo-800 underline cursor-pointer"
                onClick={() => handleExternalLink('https://resources.environment.yale.edu/env582')}
              >
                here
              </span> for more information.
            </p>
          </CardContent>
        </Card>

        {/* Farmers */}
        <Card className="h-full">
          <div className="h-64 overflow-hidden">
            <img 
              src="/Farmer.png" 
              alt="Farmer - Enhanced Weathering Field Trials"
              className="w-full h-full object-cover"
            />
          </div>
          <CardContent className="p-6">
            <h2 className="text-2xl font-bold text-teal-600 mb-2">Farmers</h2>
            <div className="w-12 h-1 bg-teal-600 rounded-full mb-4"></div>
            <p className="text-gray-700 leading-relaxed mb-4">
              We are looking for farmers and ranchers who want to participate in enhanced weathering field trials. Please contact <span 
                className="text-teal-600 hover:text-teal-800 underline cursor-pointer"
                onClick={() => handleEmailLink('maya.almaraz@yale.edu', 'Farmer Interest in Enhanced Weathering Field Trials')}
              >
                 Dr. Almaraz
              </span> if you are interested.
            </p>
          </CardContent>
        </Card>

        {/* Funders */}
        <Card className="h-full">
          <div className="h-64 overflow-hidden">
            <img 
              src="/Dollar_Bill_in_Jar.png" 
              alt="Dollar Bill in Jar - Funders"
              className="w-full h-full object-cover"
            />
          </div>
          <CardContent className="p-6">
            <h2 className="text-2xl font-bold text-yellow-600 mb-2">Funders</h2>
            <div className="w-12 h-1 bg-yellow-600 rounded-full mb-4"></div>
            <p className="text-gray-700 leading-relaxed mb-4">
              Whether through private donations or grant proposals. Please contact <span 
                className="text-yellow-600 hover:text-yellow-800 underline cursor-pointer"
                onClick={() => handleEmailLink('peter.raymond@yale.edu', 'Funding Interest for GOAL-A Research')}
              >
                Dr. Raymond
              </span> if you are interested in funding research or soliciting proposals.
            </p>
          </CardContent>
        </Card>

        {/* Collaborators */}
        <Card className="h-full">
          <div className="h-64 overflow-hidden">
            <img 
              src="/Collaboration.png" 
              alt="Collaborators"
              className="w-full h-full object-cover"
            />
          </div>
          <CardContent className="p-6">
            <h2 className="text-2xl font-bold text-gray-600 mb-2">Collaborators</h2>
            <div className="w-12 h-1 bg-gray-600 rounded-full mb-4"></div>
            <p className="text-gray-700 leading-relaxed mb-4">
              We are always interested in pursuing new and exciting collaborations. Please contact our <span 
                className="text-gray-600 hover:text-gray-800 underline cursor-pointer"
                onClick={() => handleEmailLink('peter.raymond@yale.edu', 'Collaboration Interest for GOAL-A Project')}
              >
                lead PI 
              </span> or project manager, or any of our Co-PIs, directly if interested.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Contact Information */}
      <div className="text-center">
        <Card className="bg-gradient-to-r from-blue-50 to-green-50 border-blue-200">
          <CardContent className="py-8">
            <h3 className="text-2xl font-bold text-gray-800 mb-4">
              Contact GOAL-A
            </h3>
            <p className="text-gray-800 mb-1">203-432-6216</p>
            <p className="text-gray-800">195 Prospect Street<br />New Haven, CT, 06511</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default Opportunities;
