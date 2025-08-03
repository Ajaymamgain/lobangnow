#!/usr/bin/env node

// Test script for Google Maps + Weather integration flow
import { resolveLocationAndWeather } from '../src/utils/googleLocationUtils.js';

async function testLocationWeatherFlow() {
    console.log('🧪 Testing Google Maps + Weather Integration Flow\n');
    
    // Test coordinates for different Singapore locations
    const testLocations = [
        {
            name: 'Marina Bay Sands',
            latitude: 1.2834,
            longitude: 103.8607
        },
        {
            name: 'Orchard Road',
            latitude: 1.3048,
            longitude: 103.8318
        },
        {
            name: 'Jurong East',
            latitude: 1.3329,
            longitude: 103.7436
        }
    ];
    
    for (const location of testLocations) {
        console.log(`\n📍 Testing: ${location.name}`);
        console.log(`Coordinates: ${location.latitude}, ${location.longitude}`);
        console.log('─'.repeat(50));
        
        try {
            const result = await resolveLocationAndWeather(location.latitude, location.longitude);
            
            console.log('✅ Location Resolution Result:');
            console.log(`  Display Name: ${result.displayName}`);
            console.log(`  Area: ${result.area}`);
            console.log(`  Postal Code: ${result.postalCode}`);
            console.log(`  Address: ${result.address}`);
            console.log(`  Coordinates: ${result.coordinates.lat}, ${result.coordinates.lng}`);
            
            if (result.weather && result.weather.isValid) {
                console.log('\n🌤️ Weather Information:');
                console.log(`  Temperature: ${result.weather.temperature}°C`);
                console.log(`  Condition: ${result.weather.condition}`);
                console.log(`  Emoji: ${result.weather.emoji}`);
                console.log(`  Display Text: ${result.weather.displayText}`);
            } else {
                console.log('\n❌ Weather information not available');
                if (result.weatherError) {
                    console.log(`  Error: ${result.weatherError}`);
                }
            }
            
            console.log('\n📱 Interactive Message Preview:');
            console.log('─'.repeat(30));
            
            // Simulate the interactive message text
            let locationText = `📍 *Location Confirmed*\n${result.displayName}`;
            
            if (result.area && result.area !== result.displayName) {
                locationText += `\n📍 Area: ${result.area}`;
            }
            
            if (result.postalCode) {
                locationText += `\n📮 Postal Code: ${result.postalCode}`;
            }
            
            if (result.weather && result.weather.isValid) {
                locationText += `\n\n${result.weather.emoji} *Current Weather*\n${result.weather.displayText}`;
            } else {
                locationText += `\n\n🌤️ *Weather*\nUnable to get weather info`;
            }
            
            locationText += `\n\n🎯 Ready to find the best deals for you!`;
            
            console.log(locationText);
            
        } catch (error) {
            console.error(`❌ Error testing ${location.name}:`, error.message);
        }
        
        console.log('\n' + '='.repeat(60));
    }
    
    console.log('\n🎯 Test Summary:');
    console.log('- Google Maps reverse geocoding integration');
    console.log('- Weather API integration');
    console.log('- Interactive message formatting');
    console.log('- Location and weather data combination');
    console.log('\n✅ Test completed!');
}

// Run the test
testLocationWeatherFlow().catch(console.error);
