// Location Search Utilities with Name-based Search and Autocomplete
import axios from 'axios';
import OpenAI from 'openai';

/**
 * Search for locations by name with geocoding and nearby search
 */
export async function searchLocationByName(query, googleMapsApiKey, botConfig) {
    try {
        console.log(`[LocationSearch] Searching for location: "${query}"`);
        
        // Step 1: Use OpenAI to enhance and correct the location query (MANDATORY)
        let enhancedQuery;
        try {
            enhancedQuery = await enhanceLocationSearchWithAI(query, botConfig);
            console.log(`[LocationSearch] Enhanced query: "${enhancedQuery}"`);
        } catch (error) {
            if (error.message === 'Location not in Singapore') {
                throw new Error('Location not in Singapore');
            }
            throw error;
        }
        
        // Step 2: Geocode the enhanced query to get coordinates
        const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json`;
        const geocodeParams = {
            address: `${enhancedQuery}, Singapore`,
            key: googleMapsApiKey,
            components: 'country:sg'
        };
        
        const geocodeResponse = await axios.get(geocodeUrl, { params: geocodeParams });
        
        if (geocodeResponse.data.status === 'OK' && geocodeResponse.data.results.length > 0) {
            const location = geocodeResponse.data.results[0].geometry.location;
            const latlng = `${location.lat},${location.lng}`;
            const formattedAddress = geocodeResponse.data.results[0].formatted_address;
            
            console.log(`[LocationSearch] Geocoded location: ${formattedAddress} (${latlng})`);
            
            // Step 3: Search for nearby places to provide context (1km radius)
            const nearbyUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json`;
            const nearbyParams = {
                location: latlng,
                radius: 1000, // 1km radius as requested
                key: googleMapsApiKey,
                type: 'establishment'
            };
            
            const nearbyResponse = await axios.get(nearbyUrl, { params: nearbyParams });
            
            let nearbyPlaces = [];
            if (nearbyResponse.data.status === 'OK') {
                nearbyPlaces = nearbyResponse.data.results.slice(0, 5).map(place => ({
                    name: place.name,
                    vicinity: place.vicinity,
                    placeId: place.place_id,
                    types: place.types
                }));
            }
            
            // Create a comprehensive location result
            const locationResult = {
                placeId: geocodeResponse.data.results[0].place_id,
                name: enhancedQuery,
                displayName: enhancedQuery,
                formattedAddress: formattedAddress,
                latitude: location.lat,
                longitude: location.lng,
                area: extractAreaFromComponents(geocodeResponse.data.results[0].address_components),
                nearbyPlaces: nearbyPlaces,
                source: 'geocoded_search'
            };
            
            console.log(`[LocationSearch] Found location with ${nearbyPlaces.length} nearby places`);
            return [locationResult]; // Return as array for consistency
            
        } else {
            console.log(`[LocationSearch] Geocoding failed for: "${enhancedQuery}"`);
            
            // Fallback to autocomplete
            const autocompleteUrl = 'https://maps.googleapis.com/maps/api/place/autocomplete/json';
            const autocompleteParams = {
                input: enhancedQuery,
                key: googleMapsApiKey,
                types: 'geocode',
                components: 'country:sg',
                language: 'en'
            };
            
            const autocompleteResponse = await axios.get(autocompleteUrl, { params: autocompleteParams });
            
            if (autocompleteResponse.data.status === 'OK' && autocompleteResponse.data.predictions) {
                const suggestions = autocompleteResponse.data.predictions.map(prediction => ({
                    placeId: prediction.place_id,
                    description: prediction.description,
                    structuredFormatting: prediction.structured_formatting,
                    types: prediction.types
                }));
                
                console.log(`[LocationSearch] Fallback: Found ${suggestions.length} autocomplete suggestions`);
                return suggestions;
            } else {
                console.log(`[LocationSearch] No results found for: "${enhancedQuery}"`);
                return [];
            }
        }
        
    } catch (error) {
        console.error('[LocationSearch] Error searching location by name:', error);
        return [];
    }
}

/**
 * Get detailed location information from place ID
 */
export async function getLocationDetails(placeId, googleMapsApiKey) {
    try {
        console.log(`[LocationSearch] Getting details for place ID: ${placeId}`);
        
        const detailsUrl = 'https://maps.googleapis.com/maps/api/place/details/json';
        const params = {
            place_id: placeId,
            key: googleMapsApiKey,
            fields: 'name,formatted_address,geometry,place_id,types,address_components'
        };
        
        const response = await axios.get(detailsUrl, { params });
        
        if (response.data.status === 'OK' && response.data.result) {
            const place = response.data.result;
            const location = {
                placeId: place.place_id,
                name: place.name,
                formattedAddress: place.formatted_address,
                latitude: place.geometry?.location?.lat,
                longitude: place.geometry?.location?.lng,
                types: place.types || []
            };
            
            // Extract area information from address components
            const addressComponents = place.address_components || [];
            const area = extractAreaFromComponents(addressComponents);
            if (area) {
                location.area = area;
            }
            
            console.log(`[LocationSearch] Location details: ${location.name} (${location.latitude}, ${location.longitude})`);
            return location;
        } else {
            console.log(`[LocationSearch] Failed to get details for place ID: ${placeId}`);
            return null;
        }
        
    } catch (error) {
        console.error('[LocationSearch] Error getting location details:', error);
        return null;
    }
}

/**
 * Extract area information from address components
 */
function extractAreaFromComponents(components) {
    const areaTypes = ['sublocality_level_1', 'locality', 'administrative_area_level_1'];
    
    for (const type of areaTypes) {
        const component = components.find(comp => comp.types.includes(type));
        if (component) {
            return component.long_name;
        }
    }
    
    return null;
}

/**
 * Use OpenAI to enhance location search with natural language understanding
 */
export async function enhanceLocationSearchWithAI(query, botConfig) {
    try {
        const openAIApiKey = botConfig?.openAiApiKey || botConfig?.openAIApiKey || process.env.OPENAI_API_KEY;
        if (!openAIApiKey) {
            console.error('[LocationSearch] No OpenAI API key available - AI enhancement is required');
            throw new Error('OpenAI API key not available');
        }
        
        const openai = new OpenAI({ apiKey: openAIApiKey });
        
        const prompt = `You are a Singapore location expert. The user is searching for a location in Singapore. 

User query: "${query}"

IMPORTANT: This bot only works in Singapore. If the user is looking for a location outside Singapore, respond with "NOT_SINGAPORE".

Please help me understand what they're looking for and suggest the most likely Singapore location they want. Consider:

1. Common Singapore landmarks, malls, areas, and neighborhoods
2. Popular tourist destinations
3. Shopping districts and business areas
4. Residential areas and towns
5. MRT stations and transport hubs

If the query is already specific (like "Orchard Road", "Marina Bay Sands"), return it as is.
If it's vague (like "shopping mall", "restaurant area"), suggest a specific Singapore location.
If it's a spelling mistake, correct it to the proper Singapore location name.

Return only the location name, nothing else.`;

        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 50,
            temperature: 0.3
        });
        
        const enhancedQuery = response.choices[0].message.content.trim();
        console.log(`[LocationSearch] AI enhanced query: "${query}" → "${enhancedQuery}"`);
        
        // Check if AI determined it's not a Singapore location
        if (enhancedQuery.toLowerCase().includes('not_singapore')) {
            throw new Error('Location not in Singapore');
        }
        
        return enhancedQuery;
        
    } catch (error) {
        console.error('[LocationSearch] Error enhancing location search with AI:', error);
        throw error; // Re-throw to handle in calling function
    }
}

/**
 * Create location search message with autocomplete suggestions
 */
export function createLocationSearchMessage(query, suggestions = []) {
    if (suggestions.length === 0) {
        return {
            type: "interactive",
            interactive: {
                type: "button",
                header: {
                    type: "text",
                    text: "🔍 Location Not Found"
                },
                body: {
                    text: `I couldn't find any locations matching "${query}" in Singapore.\n\nPlease try:\n• A more specific location name\n• A popular area (e.g., "Orchard Road", "Marina Bay")\n• A shopping mall or landmark\n• Or share your GPS location instead`
                },
                footer: {
                    text: "Try another option"
                },
                action: {
                    buttons: [
                        {
                            type: "reply",
                            reply: {
                                id: "search_location_again",
                                title: "🔍 Search Again"
                            }
                        },
                        {
                            type: "reply",
                            reply: {
                                id: "share_gps_location",
                                title: "📍 Share GPS"
                            }
                        }
                    ]
                }
            }
        };
    }
    
    // Create interactive list message with location suggestions
    const sections = [];
    
    // Add location suggestions as sections
    suggestions.slice(0, 5).forEach((suggestion, index) => {
        // Handle both geocoded results and autocomplete suggestions
        let title, description;
        
        if (suggestion.structuredFormatting) {
            // Autocomplete suggestion
            title = suggestion.structuredFormatting.main_text || suggestion.description?.substring(0, 24) || suggestion.name || "Unknown Location";
            description = suggestion.structuredFormatting.secondary_text || suggestion.description?.substring(24, 72) || "Select this location";
        } else {
            // Geocoded result
            title = suggestion.displayName || suggestion.name || suggestion.formattedAddress?.substring(0, 24) || "Unknown Location";
            description = suggestion.formattedAddress || suggestion.area || "Select this location";
        }
        
        sections.push({
            title: title,
            rows: [
                {
                    id: `select_location_${suggestion.placeId}`,
                    title: title,
                    description: description
                }
            ]
        });
    });
    
    // Add action section
    sections.push({
        title: "Other Options",
        rows: [
            {
                id: "search_location_again",
                title: "🔍 Search Again",
                description: "Try a different location name"
            },
            {
                id: "share_gps_location",
                title: "📍 Share GPS Location",
                description: "Use your current location"
            }
        ]
    });
    
    return {
        type: "interactive",
        interactive: {
            type: "list",
            header: {
                type: "text",
                text: `🔍 Found ${suggestions.length} locations for "${query}"`
            },
            body: {
                text: "Select a location from the list below:"
            },
            footer: {
                text: "📍 Choose your preferred location"
            },
            action: {
                button: "View Locations",
                sections: sections
            }
        }
    };
}

/**
 * Create location search prompt message
 */
export function createLocationSearchPrompt() {
    return {
        type: "interactive",
        interactive: {
            type: "button",
            header: {
                type: "text",
                text: "🔍 Search Location by Name"
            },
            body: {
                text: "Tell me where you want to find amazing deals! You can search for:\n\n🏢 **Shopping Malls**: ION Orchard, Marina Bay Sands, VivoCity\n🏪 **Areas**: Orchard Road, Marina Bay, Chinatown\n🏛️ **Landmarks**: Gardens by the Bay, Singapore Zoo\n🚇 **MRT Stations**: Orchard MRT, Marina Bay MRT\n🏘️ **Towns**: Tampines, Jurong East, Woodlands\n\n💡 **Just type the location name and I'll help you find the best deals nearby!**"
            },
            footer: {
                text: "Type any location name to search"
            },
            action: {
                buttons: [
                    {
                        type: "reply",
                        reply: {
                            id: "share_gps_location",
                            title: "📍 Share GPS Instead"
                        }
                    },
                    {
                        type: "reply",
                        reply: {
                            id: "popular_locations",
                            title: "🏢 Popular Places"
                        }
                    }
                ]
            }
        }
    };
}

/**
 * Create location search prompt with text input
 */
export function createPopularLocationsMessage() {
    return {
        type: "interactive",
        interactive: {
            type: "button",
            header: {
                type: "text",
                text: "🔍 Search Location in Singapore"
            },
            body: {
                text: "Type any location name in Singapore and I'll find the best deals nearby!\n\n🏢 **Popular Areas:**\n• Orchard Road\n• Marina Bay Sands\n• Chinatown\n• Bugis Junction\n• Tampines Mall\n• Jurong East\n\n📍 **How it works:**\n1. Type the location name\n2. I'll verify it's in Singapore\n3. Search for places within 1km\n4. Show you the best deals!\n\n💡 **Pro tip:** Be specific for better results!"
            },
            footer: {
                text: "Type any Singapore location name"
            },
            action: {
                buttons: [
                    {
                        type: "reply",
                        reply: {
                            id: "search_location_text",
                            title: "🔍 Search Location"
                        }
                    },
                    {
                        type: "reply",
                        reply: {
                            id: "share_gps_location",
                            title: "📍 Share GPS Instead"
                        }
                    }
                ]
            }
        }
    };
} 