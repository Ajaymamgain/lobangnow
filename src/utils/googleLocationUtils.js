// Google Maps API Location Resolution (Simplified)
import axios from 'axios';

/**
 * Search for nearby places using Google Places API
 * @param {number} latitude - User's latitude
 * @param {number} longitude - User's longitude
 * @param {string} category - 'food' or 'fashion'
 * @param {string} googleMapsApiKey - Google Maps API key
 * @param {boolean} includeDetails - Whether to return detailed place info with photos
 * @returns {Array<string|Object>} - List of business names or detailed place objects
 */
export async function searchNearbyPlaces(latitude, longitude, category, googleMapsApiKey, includeDetails = false) {
    try {
        console.log(`[GooglePlaces] Searching for nearby places for category: ${category} using new Places API v1`);
        
        // Map categories to Google Places API types
        let includedTypes;
        if (category === 'food') {
            includedTypes = ['restaurant', 'meal_takeaway', 'bakery', 'cafe'];
        } else if (category === 'fashion') {
            includedTypes = ['clothing_store', 'shoe_store', 'shopping_mall'];
        } else if (category === 'events') {
            includedTypes = ['amusement_park', 'aquarium', 'art_gallery', 'bowling_alley', 'casino', 'movie_theater', 'museum', 'night_club', 'park', 'stadium', 'tourist_attraction', 'zoo'];
        } else if (category === 'groceries') {
            includedTypes = ['grocery_or_supermarket', 'supermarket', 'convenience_store'];
        } else {
            includedTypes = ['restaurant', 'clothing_store', 'grocery_or_supermarket'];
        }
        
        const radius = 1000.0; // Increased to 1km for better results
        
        // New Google Places API v1 endpoint
        const url = 'https://places.googleapis.com/v1/places:searchNearby';
        
        // Request body for new API
        const requestBody = {
            includedTypes: includedTypes,
            maxResultCount: 10,
            locationRestriction: {
                circle: {
                    center: {
                        latitude: parseFloat(latitude),
                        longitude: parseFloat(longitude)
                    },
                    radius: radius
                }
            }
        };
        
        // Headers for new API
        const headers = {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': googleMapsApiKey,
            'X-Goog-FieldMask': includeDetails
                ? 'places.displayName,places.id,places.rating,places.priceLevel,places.formattedAddress,places.photos,places.types,places.location,places.nationalPhoneNumber,places.websiteUri'
                : 'places.displayName,places.id,places.formattedAddress'
        };
        
        console.log(`[GooglePlaces] Using new API with types: ${includedTypes.join(', ')} and radius: ${radius}m`);
        
        const response = await axios.post(url, requestBody, { headers });
        
        if (response.data && response.data.places && response.data.places.length > 0) {
            if (includeDetails) {
                // Return detailed place information including photos (new API format)
                const detailedPlaces = response.data.places.map(place => ({
                    name: place.displayName?.text || place.displayName,
                    place_id: place.id,
                    rating: place.rating,
                    price_level: place.priceLevel,
                    vicinity: place.formattedAddress,
                    photos: place.photos ? place.photos.map(photo => ({
                        photo_reference: photo.name, // New API uses 'name' instead of 'photo_reference'
                        width: photo.widthPx,
                        height: photo.heightPx
                    })) : [],
                    types: place.types,
                    geometry: place.location ? {
                        location: {
                            lat: place.location.latitude,
                            lng: place.location.longitude
                        }
                    } : null,
                    phone_number: place.nationalPhoneNumber,
                    website: place.websiteUri
                }));
                console.log(`[GooglePlaces] Found ${detailedPlaces.length} detailed places with photos using new API`);
                return detailedPlaces;
            } else {
                // Return just business names for backward compatibility
                const places = response.data.places.map(place => place.displayName?.text || place.displayName);
                console.log(`[GooglePlaces] Found ${places.length} nearby places using new API:`, places);
                return places;
            }
        } else {
            console.log(`[GooglePlaces] No nearby places found for category: ${category} using new API`);
            return [];
        }
    } catch (error) {
        console.error(`[GooglePlaces] Error searching for nearby places:`, error);
        return [];
    }
}

/**
 * Resolve coordinates to location details using Google Maps reverse geocoding
 * @param {number} latitude - User's latitude
 * @param {number} longitude - User's longitude
 * @param {string} googleMapsApiKey - Google Maps API key
 * @returns {Object} - Complete location resolution result
 */
export async function resolveLocationFromCoordinates(latitude, longitude, googleMapsApiKey) {
    try {
        console.log(`[GoogleLocation] Resolving coordinates: ${latitude}, ${longitude}`);
        
        const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${googleMapsApiKey}`;
        
        const response = await axios.get(url);
        
        if (response.data.status === 'OK' && response.data.results.length > 0) {
            const result = response.data.results[0];
            
            console.log(`[GoogleLocation] Google reverse geocoding result: ${result.formatted_address}`);
            
            // Extract detailed address components
            let postalCode = null;
            let country = null;
            let locality = null;
            let sublocality = null;
            let route = null;
            let streetNumber = null;
            let administrativeArea = null;
            
            for (const component of result.address_components) {
                const types = component.types;
                
                if (types.includes('postal_code')) {
                    postalCode = component.long_name;
                }
                if (types.includes('country')) {
                    country = component.long_name;
                }
                if (types.includes('locality')) {
                    locality = component.long_name;
                }
                if (types.includes('sublocality') || types.includes('sublocality_level_1')) {
                    sublocality = component.long_name;
                }
                if (types.includes('route')) {
                    route = component.long_name;
                }
                if (types.includes('street_number')) {
                    streetNumber = component.long_name;
                }
                if (types.includes('administrative_area_level_1')) {
                    administrativeArea = component.long_name;
                }
            }
            
            // Check if it's in Singapore
            if (country !== 'Singapore') {
                console.log(`[GoogleLocation] Location not in Singapore: ${country}`);
                return {
                    isValid: false,
                    error: 'Location is not in Singapore. Please provide a location within Singapore.',
                    country: country
                };
            }
            
            // Build comprehensive location data
            const locationData = {
                isValid: true,
                latitude: latitude,
                longitude: longitude,
                formattedAddress: result.formatted_address,
                postalCode: postalCode,
                country: country,
                locality: locality || 'Singapore',
                sublocality: sublocality,
                route: route,
                streetNumber: streetNumber,
                administrativeArea: administrativeArea,
                
                // Formatted display names
                displayName: formatDisplayName(result.formatted_address, locality, sublocality),
                shortAddress: formatShortAddress(streetNumber, route, sublocality),
                area: sublocality || locality || 'Singapore',
                
                // Coordinates for location reference
                coordinates: { lat: latitude, lng: longitude },
                
                // For OpenAI analysis
                fullLocationContext: {
                    address: result.formatted_address,
                    neighborhood: sublocality,
                    district: locality,
                    postalCode: postalCode,
                    coordinates: { latitude, longitude }
                },
                
                source: 'google_maps_api'
            };
            
            console.log(`[GoogleLocation] Location resolved successfully:`, {
                displayName: locationData.displayName,
                area: locationData.area,
                postalCode: locationData.postalCode
            });
            
            return locationData;
            
        } else {
            console.error(`[GoogleLocation] Google reverse geocoding failed: ${response.data.status}`);
            console.error(`[GoogleLocation] Error details:`, response.data.error_message || 'No additional error details');
            
            let errorMessage = `Unable to resolve location: ${response.data.status}`;
            if (response.data.status === 'REQUEST_DENIED') {
                errorMessage += '. Please check if the Google Maps API key is valid and has Geocoding API enabled.';
            }
            
            return {
                isValid: false,
                error: errorMessage,
                apiStatus: response.data.status,
                apiErrorMessage: response.data.error_message
            };
        }
        
    } catch (error) {
        console.error('[GoogleLocation] Error with Google reverse geocoding:', error.message);
        return {
            isValid: false,
            error: `Location resolution error: ${error.message}`
        };
    }
}

/**
 * Get hourly weather forecast for the rest of the day
 * @param {number} latitude - User's latitude
 * @param {number} longitude - User's longitude
 * @param {string} googleMapsApiKey - Google Maps API key
 * @returns {Object} - Hourly weather forecast for remaining day
 */
export async function getHourlyWeatherForecast(latitude, longitude, googleMapsApiKey) {
    try {
        console.log(`[GoogleWeatherForecast] Getting hourly forecast for coordinates: ${latitude}, ${longitude}`);
        
        // Calculate hours remaining in the day (Singapore timezone UTC+8)
        const now = new Date();
        const singaporeTime = new Date(now.getTime() + (8 * 60 * 60 * 1000)); // UTC+8
        const currentHour = singaporeTime.getHours();
        const hoursRemainingToday = 24 - currentHour;
        
        // Request hourly forecast for remaining hours of the day (minimum 3 hours)
        const hoursToRequest = Math.max(hoursRemainingToday, 3);
        
        const url = `https://weather.googleapis.com/v1/forecast/hours:lookup?key=${googleMapsApiKey}&location.latitude=${latitude}&location.longitude=${longitude}&hours=${hoursToRequest}`;
        
        const response = await axios.get(url);
        
        if (response.data && response.data.forecastHours) {
            const forecastHours = response.data.forecastHours;
            const timeZone = response.data.timeZone?.id || 'Asia/Singapore';
            
            // Process hourly data for display
            const hourlyForecast = forecastHours.slice(0, hoursRemainingToday).map(hour => {
                const temp = Math.round(hour.temperature.degrees);
                const condition = hour.weatherCondition.description.text;
                const emoji = getGoogleWeatherEmoji(hour.weatherCondition.type);
                const rainChance = hour.precipitation?.probability?.percent || 0;
                
                // Format time in Singapore timezone
                const hourTime = new Date(hour.interval.startTime);
                const singaporeHour = new Date(hourTime.getTime() + (8 * 60 * 60 * 1000));
                const displayHour = singaporeHour.getHours();
                const timeStr = displayHour === 0 ? '12AM' : displayHour <= 12 ? `${displayHour}${displayHour === 12 ? 'PM' : 'AM'}` : `${displayHour - 12}PM`;
                
                return {
                    time: timeStr,
                    temperature: temp,
                    condition: condition,
                    emoji: emoji,
                    rainChance: rainChance,
                    displayText: `${timeStr}: ${temp}°C ${emoji} ${condition}${rainChance > 20 ? ` (${rainChance}% rain)` : ''}`
                };
            });
            
            console.log(`[GoogleWeatherForecast] Retrieved ${hourlyForecast.length} hours of forecast data`);
            return {
                isValid: true,
                hourlyForecast: hourlyForecast,
                timeZone: timeZone,
                hoursRemaining: hoursRemainingToday
            };
        } else {
            console.error('[GoogleWeatherForecast] No forecast data in response');
            return {
                isValid: false,
                error: 'No hourly forecast data available from Google Weather API'
            };
        }
        
    } catch (error) {
        console.error('[GoogleWeatherForecast] Error getting hourly forecast:', error.message);
        if (error.response && error.response.status === 403) {
            return {
                isValid: false,
                error: 'Google Weather API access denied. Please check if the API key has Weather API enabled.'
            };
        }
        
        return {
            isValid: false,
            error: 'Failed to get hourly weather forecast'
        };
    }
}

/**
 * Get weather information for coordinates using Google Weather API
 * @param {number} latitude - User's latitude
 * @param {number} longitude - User's longitude
 * @param {string} googleMapsApiKey - Google Maps API key (same key for weather)
 * @returns {Object} - Weather information
 */
export async function getWeatherForLocation(latitude, longitude, googleMapsApiKey) {
    try {
        console.log(`[GoogleWeather] Getting weather for coordinates: ${latitude}, ${longitude}`);
        
        // Using Google Weather API with the same API key as Maps
        const url = `https://weather.googleapis.com/v1/currentConditions:lookup?key=${googleMapsApiKey}&location.latitude=${latitude}&location.longitude=${longitude}`;
        
        const response = await axios.get(url);
        
        if (response.data && response.data.weatherCondition) {
            const weather = response.data;
            const condition = weather.weatherCondition;
            const temp = weather.temperature;
            const feelsLike = weather.feelsLikeTemperature;
            
            const weatherData = {
                isValid: true,
                temperature: Math.round(temp.degrees),
                feelsLike: Math.round(feelsLike.degrees),
                humidity: weather.relativeHumidity,
                description: condition.description.text.toLowerCase(),
                main: condition.type,
                condition: condition.type,
                emoji: getGoogleWeatherEmoji(condition.type),
                displayText: `${Math.round(temp.degrees)}°C, ${condition.description.text}`,
                uvIndex: weather.uvIndex,
                windSpeed: weather.wind?.speed?.value || 0,
                cloudCover: weather.cloudCover || 0,
                isDaytime: weather.isDaytime
            };
            
            console.log(`[GoogleWeather] Weather data retrieved: ${weatherData.displayText}`);
            return weatherData;
        } else {
            console.error('[GoogleWeather] No weather data in response');
            console.error('[GoogleWeather] Response data:', JSON.stringify(response.data, null, 2));
            return {
                isValid: false,
                error: 'No weather data available from Google Weather API'
            };
        }
        
    } catch (error) {
        console.error('[GoogleWeather] Error getting weather data:', error.message);
        if (error.response) {
            console.error('[GoogleWeather] Response status:', error.response.status);
            console.error('[GoogleWeather] Response data:', error.response.data);
            
            if (error.response.status === 403) {
                return {
                    isValid: false,
                    error: 'Google Weather API access denied. Please check if the API key has Weather API enabled.'
                };
            }
        }
        
        return {
            isValid: false,
            error: `Google Weather API error: ${error.message}`
        };
    }
}

/**
 * Format display name for location
 */
function formatDisplayName(formattedAddress, locality, sublocality) {
    // Try to extract a meaningful short name
    if (sublocality) {
        return sublocality;
    }
    if (locality && locality !== 'Singapore') {
        return locality;
    }
    
    // Extract first part of formatted address
    const parts = formattedAddress.split(',');
    return parts[0].trim();
}

/**
 * Format short address
 */
function formatShortAddress(streetNumber, route, sublocality) {
    const parts = [];
    
    if (streetNumber) parts.push(streetNumber);
    if (route) parts.push(route);
    if (sublocality) parts.push(sublocality);
    
    return parts.join(' ') || 'Singapore';
}

/**
 * Get weather emoji based on Google Weather API condition type
 */
function getGoogleWeatherEmoji(conditionType) {
    switch (conditionType) {
        case 'CLEAR':
            return '☀️';
        case 'CLOUDY':
        case 'PARTLY_CLOUDY':
            return '☁️';
        case 'OVERCAST':
            return '☁️';
        case 'RAIN':
        case 'LIGHT_RAIN':
        case 'HEAVY_RAIN':
            return '🌧️';
        case 'THUNDERSTORM':
            return '⛈️';
        case 'SNOW':
        case 'LIGHT_SNOW':
        case 'HEAVY_SNOW':
            return '❄️';
        case 'FOG':
        case 'MIST':
        case 'HAZE':
            return '🌫️';
        case 'WINDY':
            return '💨';
        default:
            return '🌤️';
    }
}

/**
 * Complete location and weather resolution using Google Maps API
 * @param {number} latitude - User's latitude
 * @param {number} longitude - User's longitude
 * @param {string} googleMapsApiKey - Google Maps API key (used for both location and weather)
 * @returns {Object} - Complete location and weather data
 */
export async function resolveLocationAndWeather(latitude, longitude, googleMapsApiKey = null) {
    try {
        console.log(`[LocationWeather] Starting complete resolution for: ${latitude}, ${longitude}`);
        
        // Use environment variable as fallback for API key
        const finalGoogleMapsApiKey = googleMapsApiKey || process.env.GOOGLE_MAPS_API_KEY;
        
        // Get location details
        let locationResult;
        if (finalGoogleMapsApiKey) {
            locationResult = await resolveLocationFromCoordinates(latitude, longitude, finalGoogleMapsApiKey);
        } else {
            console.warn('[LocationWeather] No Google Maps API key available, using fallback location data');
            // Provide fallback location data for Singapore
            locationResult = {
                isValid: true,
                displayName: `Singapore Location`,
                area: 'Singapore',
                postalCode: null,
                address: `${latitude}, ${longitude}`,
                coordinates: { lat: latitude, lng: longitude },
                formattedAddress: `${latitude}, ${longitude}, Singapore`
            };
        }
        
        if (!locationResult.isValid) {
            return locationResult;
        }
        
        // Get weather details using the same Google Maps API key
        let weatherResult;
        let hourlyForecastResult;
        if (finalGoogleMapsApiKey) {
            // Get current weather
            weatherResult = await getWeatherForLocation(latitude, longitude, finalGoogleMapsApiKey);
            
            // Get hourly forecast for the rest of the day
            hourlyForecastResult = await getHourlyWeatherForecast(latitude, longitude, finalGoogleMapsApiKey);
        } else {
            console.warn('[LocationWeather] No Google Maps API key available, skipping weather data');
            weatherResult = {
                isValid: false,
                error: 'Google Maps API key not configured'
            };
            hourlyForecastResult = {
                isValid: false,
                error: 'Google Maps API key not configured'
            };
        }
        
        // Combine results
        const completeResult = {
            ...locationResult,
            weather: weatherResult.isValid ? weatherResult : null,
            weatherError: !weatherResult.isValid ? weatherResult.error : null,
            hourlyForecast: hourlyForecastResult.isValid ? hourlyForecastResult : null,
            forecastError: !hourlyForecastResult.isValid ? hourlyForecastResult.error : null
        };
        
        console.log(`[LocationWeather] Complete resolution successful`);
        return completeResult;
        
    } catch (error) {
        console.error('[LocationWeather] Error in complete resolution:', error);
        return {
            isValid: false,
            error: `Complete resolution error: ${error.message}`
        };
    }
}

/**
 * Get Google Places photo URL from photo reference
 * @param {string} photoReference - Photo reference from Places API
 * @param {number} maxWidth - Maximum width for the photo (default 400px)
 * @param {string} googleMapsApiKey - Google Maps API key
 * @returns {string} - Photo URL
 */
export function getPlacePhotoUrl(photoReference, maxWidth = 400, googleMapsApiKey) {
    if (!photoReference || !googleMapsApiKey) {
        return null;
    }
    
    // Handle new Places API v1 photo reference format
    if (photoReference.startsWith('places/')) {
        // New API format: places/{place_id}/photos/{photo_reference}
        // Use the new Places API photo endpoint
        return `https://places.googleapis.com/v1/${photoReference}/media?maxWidthPx=${maxWidth}&key=${googleMapsApiKey}`;
    } else {
        // Legacy format for backward compatibility
        return `https://maps.googleapis.com/maps/api/place/photo?maxwidth=${maxWidth}&photo_reference=${photoReference}&key=${googleMapsApiKey}`;
    }
}

/**
 * Find the best matching place for a business name from nearby places
 * @param {string} businessName - Name of the business to match
 * @param {Array} nearbyPlaces - Array of detailed place objects from searchNearbyPlaces
 * @returns {Object|null} - Best matching place object or null
 */
export function findMatchingPlace(businessName, nearbyPlaces) {
    if (!businessName || !nearbyPlaces || nearbyPlaces.length === 0) {
        return null;
    }
    
    const normalizedBusinessName = businessName.toLowerCase().trim();
    
    // Try exact match first
    let match = nearbyPlaces.find(place => 
        place.name.toLowerCase().trim() === normalizedBusinessName
    );
    
    if (match) {
        console.log(`[findMatchingPlace] Exact match found: "${businessName}" = "${match.name}"`);
        return match;
    }
    
    // Try partial match with more flexible matching
    // Only exclude very common words like "Singapore", but allow restaurant-related words
    const veryCommonWords = ['singapore', 'sg', 'south', 'east', 'west', 'north', 'central'];
    const businessWords = normalizedBusinessName.split(/\s+/).filter(word => 
        word.length > 2 && !veryCommonWords.includes(word)
    );
    
    match = nearbyPlaces.find(place => {
        const placeName = place.name.toLowerCase().trim();
        const placeWords = placeName.split(/\s+/).filter(word => 
            word.length > 2 && !veryCommonWords.includes(word)
        );
        
        // Check if there's a significant word match
        const hasSignificantMatch = businessWords.some(bWord => 
            placeWords.some(pWord => 
                (bWord.includes(pWord) || pWord.includes(bWord)) && 
                bWord.length > 2 && pWord.length > 2
            )
        );
        
        if (hasSignificantMatch) {
            console.log(`[findMatchingPlace] Significant word match: "${businessName}" (${businessWords}) = "${place.name}" (${placeWords})`);
            return true;
        }
        
        return false;
    });
    
    if (match) {
        return match;
    }
    
    // Last resort: try partial match but be very strict
    match = nearbyPlaces.find(place => {
        const placeName = place.name.toLowerCase().trim();
        // Only match if one name is a significant substring of the other
        // and it's not just matching "Singapore" or other common words
        const isSignificantMatch = (normalizedBusinessName.includes(placeName) && placeName.length > 5) || 
                                 (placeName.includes(normalizedBusinessName) && normalizedBusinessName.length > 5);
        
        if (isSignificantMatch) {
            console.log(`[findMatchingPlace] Significant substring match: "${businessName}" = "${place.name}"`);
        }
        
        return isSignificantMatch;
    });
    
    if (!match) {
        console.log(`[findMatchingPlace] No match found for "${businessName}" among ${nearbyPlaces.length} places`);
        
        // Fallback: use the first place with photos if available
        const placeWithPhotos = nearbyPlaces.find(place => place.photos && place.photos.length > 0);
        if (placeWithPhotos) {
            console.log(`[findMatchingPlace] Using fallback place with photos: "${placeWithPhotos.name}"`);
            return placeWithPhotos;
        }
    }
    
    return match || null;
}
