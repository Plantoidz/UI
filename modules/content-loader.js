import { PLANTOID_CONFIG } from '../config.js';

// Load plantoid-specific content into the page
export function loadPlantoidContent() {
  // Update page title
  document.title = PLANTOID_CONFIG.name;
  
  // Update all plantoid name references
  const nameElements = document.querySelectorAll('.plantoid-name, .logo h1');
  nameElements.forEach(el => {
    el.textContent = PLANTOID_CONFIG.name;
  });
  
  // Update subtitle if element exists
  const subtitleElement = document.querySelector('.title-small');
  if (subtitleElement) {
    subtitleElement.textContent = `${PLANTOID_CONFIG.name}: ${PLANTOID_CONFIG.subtitle}`;
  }
  
  // Update plantoid image if element exists
  const imageElement = document.querySelector('.plantoid-image');
  if (imageElement) {
    imageElement.style.backgroundImage = `url('${PLANTOID_CONFIG.image}')`;
  }
  
  // Update description content if element exists
  const descriptionElement = document.querySelector('.contributors');
  if (descriptionElement) {
    // Convert main description to HTML (handle bullet points)
    const mainDescription = PLANTOID_CONFIG.description.main
      .replace(/• /g, '<li class="bullet-item">')
      .replace(/\n\n/g, '</li></ul><br/><br/>')
      .replace(/They are:\n/g, 'They are:\n<ul>')
      .replace(/themselves\.\n/g, 'themselves.</li></ul>')
      .replace(/\n/g, '<br/>');
    
    descriptionElement.innerHTML = mainDescription;
  }
  
  // Update contributors section if element exists
  const contributorsSection = document.querySelectorAll('.contributors')[1];
  if (contributorsSection) {
    const config = PLANTOID_CONFIG.description.contributors;
    
    const contributorsHTML = `
      <h3>${config.title}</h3>
      <div class="contributor-item">${config.intro}</div>
      <div class="contributor-item">${config.subtitle}</div>
      <ul>
        ${config.list.map(contributor => 
          `<li class="bullet-item">${contributor}</li>`
        ).join('')}
      </ul>
    `;
    
    contributorsSection.innerHTML = contributorsHTML;
  }
  
  console.log(`✅ Loaded content for ${PLANTOID_CONFIG.name}`);
}

// Initialize content loading when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadPlantoidContent);
} else {
  loadPlantoidContent();
}