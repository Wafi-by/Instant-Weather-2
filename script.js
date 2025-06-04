// ---------------------------------
// Configuration générale
// ---------------------------------

const API_TOKEN = '15c35486407a461b9188290e07de095a687c59695882a5bdfda62c3760e3ebe5'; 
const API_BASE_URL = 'https://api.meteo-concept.com/api';
const SEARCH_HISTORY_KEY = 'searchHistory';

// Éléments du DOM
const weatherForm = document.getElementById('weather-form');
const cityInput = document.getElementById('city');
const daysSlider = document.getElementById('days-slider');
const daysValue = document.getElementById('days-value');
const darkModeToggle = document.getElementById('darkModeToggle');
const resultsSection = document.getElementById('results-section');
const errorSection = document.getElementById('error-section');
const errorText = document.getElementById('error-text');
const cityNameElement = document.getElementById('city-name');
const coordinatesContainer = document.getElementById('coordinates-container');
const latitudeDisplay = document.getElementById('latitude-display');
const longitudeDisplay = document.getElementById('longitude-display');
const mapContainer = document.getElementById('map-container');
const forecastContainer = document.getElementById('forecast-container');
const searchHistoryDropdown = document.getElementById('search-history-dropdown');
const skipIntroButton = document.getElementById('skip-intro');

// Variables globales pour la carte Leaflet
let map = null;
let mapMarker = null;

// ---------------------------------
// Initialisation au chargement
// ---------------------------------

document.addEventListener('DOMContentLoaded', () => {
  initDarkMode();
  initSlider();
  initScrollToTop();
  restoreSearchHistory();
  weatherForm.addEventListener('submit', handleFormSubmit);
  darkModeToggle.addEventListener('click', toggleDarkMode);

  // Historique recherche : gestion affichage/masquage du dropdown
  cityInput.addEventListener('focus', updateSearchHistoryDropdown);
  cityInput.addEventListener('input', () => {
    if (cityInput.value.trim() === '') {
      updateSearchHistoryDropdown();
    } else {
      searchHistoryDropdown.classList.add('hidden');
    }
  });

  document.addEventListener('click', (e) => {
    if (!searchHistoryDropdown.contains(e.target) && e.target !== cityInput) {
      searchHistoryDropdown.classList.add('hidden');
    }
  });

  // “Skip Intro” permet de masquer tout de suite l’écran de chargement
  skipIntroButton.addEventListener('click', () => {
    document.getElementById('loading-screen').style.display = 'none';
  });
});

// ---------------------------------
// Fonctions d’initialisation
// ---------------------------------

function initScrollToTop() {
  const logoLink = document.getElementById('logo-link');
  logoLink.addEventListener('click', (e) => {
    e.preventDefault();
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  });
}

function initSlider() {
  daysValue.textContent = daysSlider.value;
  daysSlider.setAttribute('aria-valuenow', daysSlider.value);
  daysSlider.addEventListener('input', () => {
    daysValue.textContent = daysSlider.value;
    daysSlider.setAttribute('aria-valuenow', daysSlider.value);
  });
}

function initDarkMode() {
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
    darkModeToggle.innerHTML = '<i class="fas fa-sun" aria-hidden="true"></i>';
  } else {
    document.documentElement.setAttribute('data-theme', 'light');
    darkModeToggle.innerHTML = '<i class="fas fa-moon" aria-hidden="true"></i>';
  }
}

// ---------------------------------
// Dark Mode
// ---------------------------------

function toggleDarkMode() {
  const currentTheme = document.documentElement.getAttribute('data-theme');
  let newTheme = 'light';
  let iconHtml = '<i class="fas fa-moon" aria-hidden="true"></i>';

  if (!currentTheme || currentTheme === 'light') {
    newTheme = 'dark';
    iconHtml = '<i class="fas fa-sun" aria-hidden="true"></i>';
  }

  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
  darkModeToggle.innerHTML = iconHtml;
}

// ---------------------------------
// Historique des recherches
// ---------------------------------

function restoreSearchHistory() {
  const stored = localStorage.getItem(SEARCH_HISTORY_KEY);
  if (!stored) return;
  try {
    const arr = JSON.parse(stored);
    if (Array.isArray(arr)) {
      // Rien de spécial à faire, le dropdown se remplit à la volée à l’ouverture
    }
  } catch {
    // Si JSON invalide, on reset
    localStorage.removeItem(SEARCH_HISTORY_KEY);
  }
}

function addToSearchHistory(city) {
  const stored = localStorage.getItem(SEARCH_HISTORY_KEY);
  let arr = stored ? JSON.parse(stored) : [];
  // Empêcher les doublons consécutifs
  if (arr[0]?.toLowerCase() !== city.toLowerCase()) {
    arr.unshift(city);
    // Ne garder que les 10 dernières entrées
    if (arr.length > 10) arr = arr.slice(0, 10);
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(arr));
  }
}

function updateSearchHistoryDropdown() {
  const stored = localStorage.getItem(SEARCH_HISTORY_KEY);
  if (!stored) return;
  let arr;
  try {
    arr = JSON.parse(stored);
  } catch {
    return;
  }
  searchHistoryDropdown.innerHTML = '';
  if (!Array.isArray(arr) || arr.length === 0) {
    searchHistoryDropdown.classList.add('hidden');
    return;
  }
  arr.forEach((term, index) => {
    const item = document.createElement('div');
    item.setAttribute('role', 'option');
    item.setAttribute('tabindex', '0');
    item.textContent = term;
    item.addEventListener('click', () => {
      cityInput.value = term;
      searchHistoryDropdown.classList.add('hidden');
      cityInput.focus();
    });
    item.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        cityInput.value = term;
        searchHistoryDropdown.classList.add('hidden');
        cityInput.focus();
      }
    });
    searchHistoryDropdown.appendChild(item);
  });
  searchHistoryDropdown.classList.remove('hidden');
}

// ---------------------------------
// Gestion du formulaire et API
// ---------------------------------

async function handleFormSubmit(event) {
  event.preventDefault();
  const city = cityInput.value.trim();
  const days = parseInt(daysSlider.value, 10);

  if (!city) {
    showError('Veuillez entrer le nom d\'une ville.');
    return;
  }
  addToSearchHistory(city);

  try {
    hideError();
    // 1. Récupérer les coordonnées de la ville
    const locationData = await fetchCityData(city);
    if (!locationData) {
      showError('Ville non trouvée. Veuillez vérifier l\'orthographe.');
      return;
    }

    // 2. Récupérer les prévisions météo (tous les jours)
    const forecastData = await fetchForecastData(locationData.insee, days);
    if (!forecastData
      || !forecastData.forecast
      || forecastData.forecast.length === 0
    ) {
      showError('Données météorologiques non disponibles pour cette ville.');
      return;
    }

    // 3. Afficher les résultats
    displayResults(locationData, forecastData.forecast, days);
  } catch (error) {
    console.error('Erreur :', error);
    showError('Une erreur est survenue. Veuillez réessayer plus tard.');
  }
}

async function fetchCityData(city) {
  try {
    const response = await fetch(
      `${API_BASE_URL}/location/cities?token=${API_TOKEN}&search=${encodeURIComponent(city)}`
    );
    if (!response.ok) throw new Error(`Erreur HTTP : ${response.status}`);
    const data = await response.json();
    // On prend la première ville correspondante
    return data.cities && data.cities.length > 0
      ? data.cities[0]
      : null;
  } catch (error) {
    console.error('Erreur lors de la récupération des données de la ville :', error);
    throw error;
  }
}

async function fetchForecastData(inseeCode, days) {
  try {
    const response = await fetch(
      `${API_BASE_URL}/forecast/daily?token=${API_TOKEN}&insee=${inseeCode}`
    );
    if (!response.ok) throw new Error(`Erreur HTTP : ${response.status}`);
    const data = await response.json();
    // Limiter les prévisions au nombre de jours demandés
    if (data.forecast && data.forecast.length > days) {
      data.forecast = data.forecast.slice(0, days);
    }
    return data;
  } catch (error) {
    console.error('Erreur lors de la récupération des prévisions :', error);
    throw error;
  }
}

// ---------------------------------
// Affichage des résultats
// ---------------------------------

function displayResults(locationData, forecastArray, days) {
  // 1. Nom de la ville
  cityNameElement.textContent = `${locationData.name}, ${locationData.cp}`;

  // 2. Coordonnées (si demandées)
  displayCoordinates(locationData);

  // 3. Carte Leaflet
  displayMap(locationData);

  // 4. Prévisions météo
  displayForecast(forecastArray);

  // 5. Afficher la section des résultats
  resultsSection.classList.remove('hidden');

  // 6. Faire défiler jusqu’aux résultats
  resultsSection.scrollIntoView({ behavior: 'smooth' });
}

function displayCoordinates(locationData) {
  const showLat = document.getElementById('latitude').checked;
  const showLon = document.getElementById('longitude').checked;

  if (showLat || showLon) {
    coordinatesContainer.classList.remove('hidden');
    if (showLat) {
      latitudeDisplay.textContent = `Latitude : ${locationData.latitude.toFixed(6)}`;
      latitudeDisplay.classList.remove('hidden');
    } else {
      latitudeDisplay.classList.add('hidden');
    }
    if (showLon) {
      longitudeDisplay.textContent = `Longitude : ${locationData.longitude.toFixed(6)}`;
      longitudeDisplay.classList.remove('hidden');
    } else {
      longitudeDisplay.classList.add('hidden');
    }
  } else {
    coordinatesContainer.classList.add('hidden');
  }
}

function displayMap(locationData) {
  mapContainer.classList.remove('hidden');

  if (!map) {
    map = L.map('map').setView([locationData.latitude, locationData.longitude], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    mapMarker = L.marker([locationData.latitude, locationData.longitude])
      .addTo(map)
      .bindPopup(`<b>${locationData.name}</b>`)
      .openPopup();
  } else {
    map.setView([locationData.latitude, locationData.longitude], 13);
    mapMarker.setLatLng([locationData.latitude, locationData.longitude])
      .bindPopup(`<b>${locationData.name}</b>`)
      .openPopup();
  }

  // Nécessaire pour forcer le rendu correct de Leaflet après un changement de conteneur
  setTimeout(() => {
    map.invalidateSize();
  }, 100);
}

function displayForecast(forecastArray) {
  forecastContainer.innerHTML = '';

  const showRainfall = document.getElementById('rainfall').checked;
  const showWindSpeed = document.getElementById('wind-speed').checked;
  const showWindDirection = document.getElementById('wind-direction').checked;

  forecastArray.forEach((day) => {
    const date = new Date(day.datetime);
    const dayCard = document.createElement('div');
    dayCard.className = 'forecast-card';

    // Format de la date
    const dateOptions = { weekday: 'long', day: 'numeric', month: 'long' };
    const formattedDate = date.toLocaleDateString('fr-FR', dateOptions);

    // Calcul des températures
    const tempMax = (typeof day.tmax === 'number') ? day.tmax : 'N/A';
    const tempMin = (typeof day.tmin === 'number') ? day.tmin : 'N/A';
    let tempAvg = 'N/A';
    if (!isNaN(tempMax) && !isNaN(tempMin)) {
      tempAvg = Math.round((parseFloat(tempMax) + parseFloat(tempMin)) / 2);
    }

    // Correction du code météo selon la température
    const correctedWeatherCode = adjustWeatherCode(day.weather, tempMax);
    const weatherIcon = getWeatherIcon(correctedWeatherCode, day);
    const weatherDescription = getWeatherDescription(correctedWeatherCode, day);

    // Génération des infos supplémentaires
    let additionalInfoHTML = '';
    if (showRainfall) {
      const rainfall = (typeof day.rr10 === 'number') ? day.rr10.toFixed(1) : '0.0';
      additionalInfoHTML += `
        <div class="info-item">
          <span class="info-label">Pluie :</span>
          <span class="info-value">${rainfall} mm</span>
        </div>`;
    }
    if (showWindSpeed) {
      const windSpeed = (typeof day.wind10m === 'number') ? day.wind10m : 'N/A';
      additionalInfoHTML += `
        <div class="info-item">
          <span class="info-label">Vent :</span>
          <span class="info-value">${windSpeed} km/h</span>
        </div>`;
    }
    if (showWindDirection) {
      const windDirection = (typeof day.dirwind10m === 'number') ? day.dirwind10m : 0;
      additionalInfoHTML += `
        <div class="info-item">
          <span class="info-label">Direction :</span>
          <span class="info-value wind-direction-container">
            ${windDirection}°
            <i class="fas fa-arrow-up wind-arrow" style="transform: rotate(${windDirection}deg);" aria-hidden="true"></i>
          </span>
        </div>`;
    }
    const additionalInfoSection = additionalInfoHTML
      ? `<div class="additional-info">${additionalInfoHTML}</div>`
      : '';

    dayCard.innerHTML = `
      <div class="forecast-date">${capitalize(formattedDate)}</div>
      <img src="${weatherIcon}" alt="${weatherDescription}" class="weather-icon" onerror="this.src='https://cdn-icons-png.flaticon.com/512/1146/1146869.png'">
      <div class="temperature">${tempAvg}°C</div>
      <div class="weather-description">${weatherDescription}</div>
      <div class="info-item">
        <span class="info-label">Min / Max :</span>
        <span class="info-value">&nbsp;${tempMin}°C / ${tempMax}°C</span>
      </div>
      ${additionalInfoSection}
    `;
    forecastContainer.appendChild(dayCard);
  });
}

// ---------------------------------
// Fonctions utilitaires météo
// ---------------------------------

function adjustWeatherCode(code, tempMax) {
  // Si code météo neigeux/léger mais tmax > 4°C, on force pluie (6)
  const snowOrLightRain = new Set([
    10, 13, 35, 36, 37, 52, 53, 61, 62, 73, 74, 96, 97, 48,
    14, 52, 53
  ]);
  const freezingRainOrFog = new Set([
    6, 7, 8, 11, 12, 18, 49, 50, 56, 80, 81, 82
  ]);

  let corrected = code ?? 0;
  if (snowOrLightRain.has(code) && tempMax > 4) {
    corrected = 6;
  }
  if (freezingRainOrFog.has(code) && tempMax <= 0) {
    corrected = 10;
  }
  return corrected;
}

function getWeatherIcon(code, day) {
  const rainCodes = [6, 7, 8, 11, 12, 14, 16, 18, 44, 49, 50, 56, 60, 72, 80, 81, 82];
  const snowCodes = [10, 13, 35, 36, 37, 48, 52, 53, 61, 62, 73, 74, 96, 97];
  const thunderCodes = [9, 39, 45, 46, 47, 53, 57, 59, 83, 84, 99];
  const fogCodes = [5, 15, 30, 40, 51, 66, 67, 75, 76, 77, 78, 79];
  const cloudCodes = [2, 3, 4, 22, 23, 24, 25, 27, 29, 34, 41, 43, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94];
  const sunCodes = [0, 1, 21, 26, 28, 32, 42, 54, 55, 68, 69, 70, 71, 95, 98];
  const windCodes = [19, 31, 63, 64, 65];

  if (rainCodes.includes(code)) {
    return 'https://cdn-icons-png.flaticon.com/256/3262/3262912.png';
  }
  if (snowCodes.includes(code)) {
    return 'https://cdn-icons-png.flaticon.com/512/642/642000.png';
  }
  if (thunderCodes.includes(code)) {
    return 'https://cdn-icons-png.flaticon.com/256/1146/1146860.png';
  }
  if (fogCodes.includes(code)) {
    return 'https://cdn-icons-png.flaticon.com/256/7774/7774309.png';
  }
  if (cloudCodes.includes(code)) {
    return 'https://cdn-icons-png.flaticon.com/512/414/414927.png';
  }
  if (sunCodes.includes(code)) {
    return 'https://cdn-icons-png.flaticon.com/512/6974/6974833.png';
  }
  if (windCodes.includes(code)) {
    return 'https://cdn-icons-png.flaticon.com/256/5019/5019873.png';
  }
  return 'https://cdn-icons-png.flaticon.com/512/1146/1146869.png';
}

function getWeatherDescription(code, day) {
  const rainCodes = [6, 7, 8, 11, 12, 14, 16, 18, 44, 49, 50, 56, 60, 72, 80, 81, 82];
  const snowCodes = [10, 13, 35, 36, 37, 48, 52, 53, 61, 62, 73, 74, 96, 97];
  const thunderCodes = [9, 39, 45, 46, 47, 53, 57, 59, 83, 84, 99];
  const fogCodes = [5, 15, 30, 40, 51, 66, 67, 75, 76, 77, 78, 79];
  const cloudCodes = [2, 3, 4, 22, 23, 24, 25, 27, 29, 34, 41, 43, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94];
  const sunCodes = [0, 1, 21, 26, 28, 32, 42, 54, 55, 68, 69, 70, 71, 95, 98];
  const windCodes = [19, 31, 63, 64, 65];

  const clouds = typeof day.clouds === 'number' ? day.clouds : null;

  if (rainCodes.includes(code)) return 'Pluie';
  if (snowCodes.includes(code)) return 'Neige';
  if (thunderCodes.includes(code)) return 'Orage';
  if (fogCodes.includes(code)) return 'Brouillard / Brume';
  if (windCodes.includes(code)) return 'Vent fort';

  if (sunCodes.includes(code)) {
    if (clouds !== null) {
      if (clouds < 20) return 'Ensoleillé';
      if (clouds >= 20 && clouds < 40) return 'Soleil voilé';
      if (clouds >= 40 && clouds <= 70) return 'Soleil avec nuages';
      if (clouds > 70) return 'Très nuageux';
    }
    return 'Ensoleillé';
  }

  if (cloudCodes.includes(code)) {
    if (clouds !== null) {
      if (clouds < 30) return 'Ciel peu nuageux';
      if (clouds >= 30 && clouds < 60) return 'Ciel partiellement nuageux';
      if (clouds >= 60 && clouds < 85) return 'Ciel très nuageux';
      if (clouds >= 85) return 'Ciel couvert';
    }
    return 'Nuageux';
  }

  return 'Conditions météorologiques';
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ---------------------------------
// Gestion des erreurs
// ---------------------------------

function showError(message) {
  errorText.textContent = message;
  errorSection.classList.remove('hidden');
  resultsSection.classList.add('hidden');
}

function hideError() {
  errorSection.classList.add('hidden');
}

// ---------------------------------
// Suppression de l’écran de chargement après un délai
// ---------------------------------

window.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    document.getElementById('loading-screen').style.display = 'none';
  }, 4500);
});