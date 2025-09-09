import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

function Publications() {
  const [sortBy, setSortBy] = useState('year-desc');
  
  const handleExternalLink = (url) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const getDoiUrl = (doi) => {
    // Clean the DOI and ensure it starts with 10.
    let cleanDoi = doi.trim();
    
    // Replace special Unicode dashes with regular hyphens
    cleanDoi = cleanDoi.replace(/‐/g, '-');
    
    if (cleanDoi.startsWith('10.')) {
      return `https://doi.org/${cleanDoi}`;
    } else if (cleanDoi.startsWith('doi:')) {
      return `https://doi.org/${cleanDoi.replace('doi:', '')}`;
    } else {
      return `https://doi.org/10.${cleanDoi}`;
    }
  };

  const publications = [
    {
      id: 1,
      title: "Using Carbonates for Carbon Removal",
      authors: "Raymond, P.A., N. Planavsky, C. Reinhard",
      journal: "Nature Water",
      year: 2024,
      doi: "",
      type: "Journal Article",
      category: "Climate Solutions",
      status: "Accepted"
    },
    {
      id: 2,
      title: "A harmonized river‐ocean coupled database for the northern Gulf of Mexico",
      authors: "Armos, B., Zhang, S., Wen, T., Gellerson, E., Daripa, P.",
      journal: "Scientific Data",
      year: 2024,
      doi: "10.1038/s41597‐024‐04338‐1",
      type: "Journal Article",
      category: "Ocean Science",
      status: "Published"
    },
    {
      id: 3,
      title: "River metabolism in the contiguous United States: A west of extremes",
      authors: "Taylor Maavara, Zimin Yuan, Andrew M. Johnson, Shuang Zhang, Kelly S. Aho, Craig B. Brinkerhoff, Laura A. Logozzo, Peter Raymond",
      journal: "Science",
      year: 2024,
      doi: "",
      type: "Journal Article",
      category: "Hydrology",
      status: "Under Review"
    },
    {
      id: 4,
      title: "Regional Uncertainty Analysis in the Air–Sea CO2 Flux",
      authors: "L. Gloege, M. D. Eisaman",
      journal: "Earth and Space Science",
      year: 2024,
      doi: "10.1029/2024EA004032",
      type: "Journal Article",
      category: "Ocean Science",
      status: "Published"
    },
    {
      id: 5,
      title: "A technical review of the underlying mechanics, potential advantages, and challenges to scale across pathways that manipulate the ocean carbonate system",
      authors: "Reinhard, Bracco, Ito, and Planavsky et al.",
      journal: "Cell Reports Sustainability",
      year: 2024,
      doi: "",
      type: "Journal Article",
      category: "Ocean Science",
      status: "Under Review"
    },
    {
      id: 6,
      title: "Enhanced rock weathering for carbon removal–monitoring and mitigating potential environmental impacts on agricultural land",
      authors: "Levy, C.R., Almaraz, M., Beerling, D.J., Raymond, P., Reinhard, C.T., Suhrhoff, T.J. and Taylor, L.",
      journal: "Environmental Science & Technology",
      year: 2024,
      doi: "10.1021/acs.est.4c02368",
      type: "Journal Article",
      category: "Agriculture",
      status: "Published"
    },
    {
      id: 7,
      title: "Enhanced weathering may benefit from co‐application with organic amendments",
      authors: "Almaraz, M.",
      journal: "AGU Advances",
      year: 2025,
      doi: "10.1029/2025AV001693",
      type: "Journal Article",
      category: "Agriculture",
      status: "Published"
    },
    {
      id: 8,
      title: "Transforming US agriculture for carbon removal with enhanced weathering",
      authors: "David J. Beerling, Euripides P. Kantzas, Mark R. Lomas, Lyla L. Taylor, Shuang Zhang, Yoshiki Kanzaki, Rafael M. Eufrasio, Phil Renforth, Jean‐Francois Mecure, Hector Pollitt, Philip B. Holden, Neil R. Edwards, Lenny Koh, Dimitar Z. Epihov, Adam Wolf, James E. Hansen, Steven A. Banwart, Nick F. Pidgeon, Christopher T. Reinhard, Noah J. Planavsky & Maria Val Martin",
      journal: "Nature",
      year: 2024,
      doi: "10.1038/s41586‐024‐08429‐2",
      type: "Journal Article",
      category: "Agriculture",
      status: "Published"
    },
    {
      id: 9,
      title: "Expert elicitation on agricultural enhanced weathering highlights CO2 removal potential and uncertainties in loss pathways",
      authors: "Buma, B., C. Dietzen, D. R. Gordon, K. Maher, R. B. Neumann, N. Planavsky, T. Reershemius, T. J. Suhrhoff, S. Vicca, B. G. Waring, M. Almaraz, S. Calabrese, L. A. Derry, M. Granger Morgan, J. Higgins, B. Z. Houlton, Y. Kanzaki, A. Klemme, T. Kukla, E. E. Oldfield, I. M. Power, C. R. Pearce, W. L. Silver, S. Zhang",
      journal: "Nature Communications Earth and Environment",
      year: 2024,
      doi: "",
      type: "Journal Article",
      category: "Agriculture",
      status: "Submitted"
    },
    {
      id: 10,
      title: "Soil cation storage is a key control on the carbon removal dynamics of enhanced weathering",
      authors: "Y Kanzaki, N J Planavsky, S Zhang, J Jordan, T J Suhrhoff and C T Reinhard",
      journal: "Environmental Research Letters",
      year: 2024,
      doi: "10.1088/1748‐9326/ade0d5",
      type: "Journal Article",
      category: "Soil Science",
      status: "Published"
    },
    {
      id: 11,
      title: "A spatially explicit dataset of agriculture liming across the contiguous US",
      authors: "Samuel Shou‐En Tsao, Tim Jesper Surhoff, Giuseppe Amatulli, Maya Almaraz, Jon Gewirtzman, Beck Woollen, Eric W. Slessarev, James E. Saiers, Christopher T. Reinhard, Shuang Zhang, Noah J. Planavsky, Peter A. Raymond",
      journal: "Earth System Science Data",
      year: 2024,
      doi: "",
      type: "Journal Article",
      category: "Agriculture",
      status: "Submitted"
    },
    {
      id: 12,
      title: "Constraining carbon loss from rivers following terrestrial enhanced rock weathering",
      authors: "Shuang Zhang, Christopher T. Reinhard, Shaoda Liu, Yoshiki Kanzaki, Noah J. Planavsky",
      journal: "ESS Open Archive preprint",
      year: 2024,
      doi: "",
      type: "Journal Article",
      category: "Hydrology",
      status: "Accepted"
    },
    {
      id: 13,
      title: "Watershed reactive transport illustrated the controls on silicate weathering and solute fluxes at Hubbard Brook",
      authors: "Shaheen, S.W., Tatge, W., Molins, S., Driscoll, C.T., Chen, X., Raymond, P.E., Saiers, J.E.",
      journal: "Water Resources Research",
      year: 2024,
      doi: "",
      type: "Journal Article",
      category: "Hydrology",
      status: "Under Review"
    },
    {
      id: 14,
      title: "Evaluating the carbon capture potential of industrial waste as a feedstock for enhanced weathering",
      authors: "P. Xu, C.T. Reinhard",
      journal: "Environmental Research Letters",
      year: 2024,
      doi: "10.1088/1748‐9326/adc020",
      type: "Journal Article",
      category: "Climate Solutions",
      status: "Published"
    },
    {
      id: 15,
      title: "Spatiotemporal modulation of alkalinity and DIC outwelling from saltmarsh porewater in New England's largest marsh complex",
      authors: "Zhang, M., X. Cai, N. Weston, Z. Wu, A. Giblin, C. Hunt, S. Tsao, N. Zhang, P. Raymond",
      journal: "JGR‐Biogeosciences",
      year: 2024,
      doi: "",
      type: "Journal Article",
      category: "Ocean Science",
      status: "Under Review"
    },
    {
      id: 16,
      title: "A framework for modeling carbon loss from rivers following terrestrial enhanced weathering",
      authors: "S. Zhang, C. T. Reinhard, S. Liu, Y. Kanzaki, N. J. Planavsky",
      journal: "Environmental Research Letters",
      year: 2024,
      doi: "10.1088/1748‐9326/ada398",
      type: "Journal Article",
      category: "Hydrology",
      status: "Published"
    },
    {
      id: 17,
      title: "Evolution of the modern global nitrogen cycle",
      authors: "Almaraz, M., S. Xin, E. Davidson, X. Zhang, J. Galloway, Peter Raymond",
      journal: "Nature Reviews Earth and Environment",
      year: 2024,
      doi: "",
      type: "Journal Article",
      category: "Climate Solutions",
      status: "Under Review"
    },
    {
      id: 18,
      title: "A new framework for the attribution of air‐sea CO2 exchange",
      authors: "Takamitsu, I., Reinhard, C.",
      journal: "Global Biogeochemical Cycles",
      year: 2024,
      doi: "10.1029/2024GB008346",
      type: "Journal Article",
      category: "Ocean Science",
      status: "Published"
    },
    {
      id: 19,
      title: "Machine learning for the physics of climate",
      authors: "Annalisa Bracco, Julien Brajard, Henk A. Dijkstra, Pedram Hassanzadeh, Christian Lessig, Claire Monteleoni",
      journal: "Nature Reviews Physics",
      year: 2024,
      doi: "10.1038/s42254‐024‐00776‐3",
      type: "Journal Article",
      category: "Climate Solutions",
      status: "Published"
    }
  ];

  const getCategoryColor = (category) => {
    switch (category) {
      case 'Climate Solutions':
        return 'bg-blue-100 text-blue-800';
      case 'Soil Science':
        return 'bg-green-100 text-green-800';
      case 'Hydrology':
        return 'bg-purple-100 text-purple-800';
      case 'Ocean Science':
        return 'bg-teal-100 text-teal-800';
      case 'Economics':
        return 'bg-yellow-100 text-yellow-800';
      case 'Agriculture':
        return 'bg-orange-100 text-orange-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getTypeColor = (type) => {
    switch (type) {
      case 'Journal Article':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'Policy Analysis':
        return 'bg-green-50 text-green-700 border-green-200';
      case 'Meta-Analysis':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      default:
        return 'bg-gray-50 text-gray-700 border-gray-200';
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Published':
        return 'bg-green-100 text-green-800';
      case 'Accepted':
        return 'bg-blue-100 text-blue-800';
      case 'Under Review':
        return 'bg-yellow-100 text-yellow-800';
      case 'Submitted':
        return 'bg-purple-100 text-purple-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const sortPublications = (publications, sortBy) => {
    const sorted = [...publications];
    
    switch (sortBy) {
      case 'year-desc':
        return sorted.sort((a, b) => b.year - a.year);
      case 'year-asc':
        return sorted.sort((a, b) => a.year - b.year);
      case 'title-asc':
        return sorted.sort((a, b) => a.title.localeCompare(b.title));
      case 'title-desc':
        return sorted.sort((a, b) => b.title.localeCompare(a.title));
      case 'journal-asc':
        return sorted.sort((a, b) => a.journal.localeCompare(b.journal));
      case 'status': {
        const statusOrder = { 'Published': 1, 'Accepted': 2, 'Under Review': 3, 'Submitted': 4 };
        return sorted.sort((a, b) => (statusOrder[a.status] || 5) - (statusOrder[b.status] || 5));
      }
      default:
        return sorted;
    }
  };

  const sortedPublications = sortPublications(publications, sortBy);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-gray-800 mb-4">Publications</h1>
        <p className="text-xl text-gray-600 mb-6">
          Research outputs from the GOAL-A project team and collaborators
        </p>
        
        {/* Sort Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-gray-700">Sort by:</span>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Select sort option" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="year-desc">Year (Newest First)</SelectItem>
                <SelectItem value="year-asc">Year (Oldest First)</SelectItem>
                <SelectItem value="title-asc">Title (A-Z)</SelectItem>
                <SelectItem value="title-desc">Title (Z-A)</SelectItem>
                <SelectItem value="journal-asc">Journal (A-Z)</SelectItem>
                <SelectItem value="status">Status</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="text-sm text-gray-600">
            Showing {sortedPublications.length} publications
          </div>
        </div>
      </div>

      {/* Publications List */}
      <div className="space-y-4 mb-12">
        {sortedPublications.map((pub) => (
          <Card key={pub.id} className="shadow-md hover:shadow-lg transition-shadow h-fit">
            <CardContent className="p-4">
              <div className="flex flex-col gap-3">
                <div className="flex justify-between items-start gap-3">
                  <div className="flex flex-wrap gap-1">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getCategoryColor(pub.category)}`}>
                      {pub.category}
                    </span>
                    <span className={`px-2 py-0.5 rounded-md text-xs font-medium border ${getTypeColor(pub.type)}`}>
                      {pub.type}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(pub.status)}`}>
                      {pub.status}
                    </span>
                  </div>
                  {pub.doi && (
                    <button
                      onClick={() => handleExternalLink(getDoiUrl(pub.doi))}
                      className="bg-blue-600 text-white px-3 py-1.5 rounded text-xs font-medium hover:bg-blue-700 transition-colors whitespace-nowrap"
                    >
                      View Article
                    </button>
                  )}
                </div>
                
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-800 mb-1 leading-tight">
                    {pub.title}
                  </h3>
                  
                  <p className="text-sm text-gray-700 mb-1">
                    <span className="font-medium">Authors:</span> {pub.authors}
                  </p>
                  
                  <p className="text-sm text-gray-700 mb-1">
                    <span className="font-medium">Journal:</span> {pub.journal}
                  </p>
                  
                  <div className="flex flex-wrap gap-3 text-xs text-gray-600">
                    <span>
                      <span className="font-medium">Year:</span> {pub.year}
                    </span>
                    {pub.doi && (
                      <span>
                        <span className="font-medium">DOI:</span> 
                        <button
                          onClick={() => handleExternalLink(getDoiUrl(pub.doi))}
                          className="ml-1 text-blue-600 hover:text-blue-800 underline text-xs"
                        >
                          {pub.doi}
                        </button>
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default Publications;
